// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MedicalMarket — Phase 5.2
/// @notice Encrypted-data marketplace with off-chain cryptographic verification.
///         Patient encrypts the medic-signed record for the buyer's BabyJubJub
///         public key (ECDH + Poseidon stream cipher) off-chain, uploads the
///         ciphertext bytes to the Statement Store, and calls fulfill() with the
///         ephemeral pk + ciphertextHash. The contract is a pure escrow + signal
///         layer: no on-chain ZK proof, no in-circuit binding. The medic's
///         EdDSA-Poseidon signature over recordCommit is published with the
///         listing so any researcher can verify the signing medic before paying;
///         buyers verify (sig, recordCommit, decrypted plaintext) off-chain
///         after fetching the ciphertext.
///
///         Atomicity is relaxed: a dishonest patient could upload garbage to the
///         Statement Store. The buyer detects this by recomputing
///         HashChain32(plaintext) and comparing against listing.recordCommit.
///         Phase 5.3 (planned) adds an escrow / acknowledge / reclaim window so
///         a buyer who can't decrypt can recover their payment.
contract MedicalMarket {
	struct Listing {
		uint256 recordCommit; // Poseidon(plaintext[32]) — what the medic signed
		uint256 medicPkX; // medic's BabyJubJub pubkey (EdDSA-Poseidon)
		uint256 medicPkY;
		uint256 sigR8x; // medic's EdDSA signature over recordCommit
		uint256 sigR8y;
		uint256 sigS;
		string title; // human-readable label shown before buying
		uint256 price; // minimum price in wei (native PAS)
		address patient;
		bool active;
	}

	struct Order {
		uint256 listingId;
		address researcher;
		uint256 amount;
		bool confirmed;
		bool cancelled;
		uint256 pkBuyerX; // researcher's BabyJubJub pubkey for ECDH
		uint256 pkBuyerY;
	}

	struct Fulfillment {
		uint256 ephPkX; // patient's ephemeral pubkey; buyer reconstructs shared secret
		uint256 ephPkY;
		uint256 ciphertextHash; // Statement Store lookup key (Poseidon of ciphertext[32])
	}

	mapping(uint256 => Listing) private listings;
	uint256 private listingCount;

	mapping(uint256 => Order) private orders;
	uint256 private orderCount;

	mapping(uint256 => Fulfillment) private fulfillments;

	// listingId → 1-based orderId (0 = no pending order)
	mapping(uint256 => uint256) private listingPendingOrder;

	event ListingCreated(
		address indexed patient,
		uint256 indexed listingId,
		uint256 recordCommit,
		uint256 medicPkX,
		uint256 medicPkY,
		string title,
		uint256 price
	);
	event OrderPlaced(
		uint256 indexed listingId,
		uint256 indexed orderId,
		address indexed researcher,
		uint256 amount,
		uint256 pkBuyerX,
		uint256 pkBuyerY
	);
	event SaleFulfilled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address patient,
		address researcher,
		uint256 ephPkX,
		uint256 ephPkY,
		uint256 ciphertextHash
	);
	event ListingCancelled(uint256 indexed listingId, address indexed patient);
	event OrderCancelled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address indexed researcher,
		uint256 amount
	);

	/// @notice Create a listing. recordCommit is Poseidon-chained over the
	///         medic-signed plaintext[32]; the medic's pubkey + EdDSA signature
	///         over recordCommit are published so any researcher can pre-verify
	///         "a known medic signed this commit" before paying.
	function createListing(
		uint256 recordCommit,
		uint256 medicPkX,
		uint256 medicPkY,
		uint256 sigR8x,
		uint256 sigR8y,
		uint256 sigS,
		string calldata title,
		uint256 price
	) external {
		require(price > 0, "Price must be greater than zero");
		require(bytes(title).length > 0, "Title cannot be empty");
		require(recordCommit != 0, "recordCommit must be non-zero");
		require(medicPkX != 0 || medicPkY != 0, "medicPk must be non-zero");
		require(sigS != 0, "signature must be non-zero");
		uint256 listingId = listingCount;
		listings[listingId] = Listing({
			recordCommit: recordCommit,
			medicPkX: medicPkX,
			medicPkY: medicPkY,
			sigR8x: sigR8x,
			sigR8y: sigR8y,
			sigS: sigS,
			title: title,
			price: price,
			patient: msg.sender,
			active: true
		});
		listingCount++;
		emit ListingCreated(msg.sender, listingId, recordCommit, medicPkX, medicPkY, title, price);
	}

	/// @notice Lock native PAS and register the buyer's BabyJubJub pubkey.
	///         If a lower offer already exists it is refunded and replaced (outbid).
	///         State is fully written before the external refund call (CEI pattern).
	///         NOTE: if the outbid researcher is a contract that reverts on receive,
	///         the refund call fails and the whole tx reverts — their offer can never
	///         be outbid (griefing). Pull-payment escrow is the production fix.
	function placeBuyOrder(uint256 listingId, uint256 pkBuyerX, uint256 pkBuyerY) external payable {
		require(listingId < listingCount, "Listing does not exist");
		Listing storage listing = listings[listingId];
		require(listing.active, "Listing is not active");
		require(msg.value >= listing.price, "Insufficient payment");
		require(pkBuyerX != 0 || pkBuyerY != 0, "pkBuyer must be non-zero");

		// Cache refund target before any state mutation.
		address prevResearcher;
		uint256 prevAmount;
		if (listingPendingOrder[listingId] != 0) {
			uint256 prevOrderId = listingPendingOrder[listingId] - 1;
			Order storage prev = orders[prevOrderId];
			require(msg.value > prev.amount, "Must outbid current offer");
			prevResearcher = prev.researcher;
			prevAmount = prev.amount;
			prev.cancelled = true;
			emit OrderCancelled(prevOrderId, listingId, prevResearcher, prevAmount);
		}

		// Write all state before any external call (CEI).
		uint256 orderId = orderCount;
		orders[orderId] = Order({
			listingId: listingId,
			researcher: msg.sender,
			amount: msg.value,
			confirmed: false,
			cancelled: false,
			pkBuyerX: pkBuyerX,
			pkBuyerY: pkBuyerY
		});
		orderCount++;
		listingPendingOrder[listingId] = orderId + 1;
		emit OrderPlaced(listingId, orderId, msg.sender, msg.value, pkBuyerX, pkBuyerY);

		// External call last — consistent with fulfill() and cancelOrder().
		if (prevResearcher != address(0)) {
			(bool ok, ) = payable(prevResearcher).call{value: prevAmount}("");
			require(ok, "Refund to previous bidder failed");
		}
	}

	/// @notice Patient declares the ephemeral pk + Statement Store ciphertext
	///         hash and releases payment. No on-chain proof: the buyer verifies
	///         signature + recordCommit off-chain after decryption.
	function fulfill(
		uint256 orderId,
		uint256 ephPkX,
		uint256 ephPkY,
		uint256 ciphertextHash
	) external {
		require(orderId < orderCount, "Order does not exist");
		Order storage order = orders[orderId];
		require(!order.confirmed, "Order already fulfilled");
		require(!order.cancelled, "Order is cancelled");

		Listing storage listing = listings[order.listingId];
		require(msg.sender == listing.patient, "Only the patient can fulfill the order");
		require(ephPkX != 0 || ephPkY != 0, "ephPk must be non-zero");
		require(ciphertextHash != 0, "ciphertextHash must be non-zero");

		order.confirmed = true;
		listing.active = false;

		fulfillments[orderId] = Fulfillment({
			ephPkX: ephPkX,
			ephPkY: ephPkY,
			ciphertextHash: ciphertextHash
		});

		(bool successPatient, ) = listing.patient.call{value: listing.price}("");
		require(successPatient, "Transfer to patient failed");

		uint256 excess = order.amount - listing.price;
		if (excess > 0) {
			(bool successResearcher, ) = order.researcher.call{value: excess}("");
			require(successResearcher, "Refund to researcher failed");
		}

		emit SaleFulfilled(
			orderId,
			order.listingId,
			listing.patient,
			order.researcher,
			ephPkX,
			ephPkY,
			ciphertextHash
		);
	}

	function cancelListing(uint256 listingId) external {
		require(listingId < listingCount, "Listing does not exist");
		Listing storage listing = listings[listingId];
		require(listing.active, "Listing is not active");
		require(msg.sender == listing.patient, "Only the patient can cancel the listing");
		require(listingPendingOrder[listingId] == 0, "Cannot cancel listing with a pending order");

		listing.active = false;
		emit ListingCancelled(listingId, msg.sender);
	}

	function cancelOrder(uint256 orderId) external {
		require(orderId < orderCount, "Order does not exist");
		Order storage order = orders[orderId];
		require(msg.sender == order.researcher, "Only the researcher can cancel the order");
		require(!order.confirmed, "Order already fulfilled");
		require(!order.cancelled, "Order already cancelled");

		order.cancelled = true;
		listingPendingOrder[order.listingId] = 0;

		(bool success, ) = order.researcher.call{value: order.amount}("");
		require(success, "Refund to researcher failed");

		emit OrderCancelled(orderId, order.listingId, order.researcher, order.amount);
	}

	function getListing(
		uint256 id
	)
		external
		view
		returns (
			uint256 recordCommit,
			uint256 medicPkX,
			uint256 medicPkY,
			uint256 sigR8x,
			uint256 sigR8y,
			uint256 sigS,
			string memory title,
			uint256 price,
			address patient,
			bool active
		)
	{
		Listing storage l = listings[id];
		return (
			l.recordCommit,
			l.medicPkX,
			l.medicPkY,
			l.sigR8x,
			l.sigR8y,
			l.sigS,
			l.title,
			l.price,
			l.patient,
			l.active
		);
	}

	function getListingCount() external view returns (uint256) {
		return listingCount;
	}

	function getOrder(
		uint256 id
	)
		external
		view
		returns (
			uint256 listingId,
			address researcher,
			uint256 amount,
			bool confirmed,
			bool cancelled,
			uint256 pkBuyerX,
			uint256 pkBuyerY
		)
	{
		Order storage o = orders[id];
		return (
			o.listingId,
			o.researcher,
			o.amount,
			o.confirmed,
			o.cancelled,
			o.pkBuyerX,
			o.pkBuyerY
		);
	}

	/// @notice ephemeral pk + Statement Store lookup hash for a fulfilled order.
	function getFulfillment(
		uint256 orderId
	) external view returns (uint256 ephPkX, uint256 ephPkY, uint256 ciphertextHash) {
		Fulfillment storage f = fulfillments[orderId];
		return (f.ephPkX, f.ephPkY, f.ciphertextHash);
	}

	function getOrderCount() external view returns (uint256) {
		return orderCount;
	}

	function getPendingOrderId(uint256 listingId) external view returns (uint256) {
		return listingPendingOrder[listingId];
	}
}
