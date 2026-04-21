// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MedicalMarket — Phase 5.2
/// @notice Encrypted-data marketplace with off-chain cryptographic verification.
///         The record is split into a public, medic-signed header (title,
///         recordType, recordedAt, facility — browsable pre-purchase) and an
///         encrypted body (the clinical payload). The medic signs
///         Poseidon2(headerCommit, bodyCommit); buyers recompute the header
///         commit from the on-chain fields and verify the combined signature
///         off-chain before paying.
///
///         The contract does NOT verify Poseidon(headerFields) == headerCommit
///         on-chain — Phase 5.2 keeps cryptography off-chain. A patient who
///         supplies header fields that don't hash to the on-chain headerCommit
///         will see the "medic-verified" badge fail on the listing card in
///         ResearcherBuy, so the listing is effectively unsellable.
///
///         At fulfill time the patient encrypts the body for the buyer's
///         BabyJubJub pubkey (ECDH + Poseidon stream cipher), uploads the
///         ciphertext to the Statement Store, and calls fulfill() with
///         ephPk + ciphertextHash. Buyers recompute bodyCommit from the
///         decrypted plaintext and compare against listing.bodyCommit.
///
///         Atomicity is relaxed: a dishonest patient could upload garbage to the
///         Statement Store. Phase 5.3 (planned) adds an escrow / acknowledge /
///         reclaim window so a buyer who can't decrypt can recover their payment.
contract MedicalMarket {
	struct HeaderInput {
		string title;
		string recordType;
		uint64 recordedAt;
		string facility;
	}

	struct Listing {
		// medic-signed header (public, browsable, recomputed off-chain)
		string title;
		string recordType;
		uint64 recordedAt;
		string facility;
		uint256 headerCommit; // Poseidon8(encodeHeader(header))
		uint256 bodyCommit; // Poseidon-chain over encrypted body plaintext[32]
		// medic attestation (signs Poseidon2(headerCommit, bodyCommit))
		uint256 medicPkX;
		uint256 medicPkY;
		uint256 sigR8x;
		uint256 sigR8y;
		uint256 sigS;
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
		uint256 headerCommit,
		uint256 bodyCommit,
		uint256 medicPkX,
		uint256 medicPkY,
		string title,
		string recordType,
		uint64 recordedAt,
		string facility,
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

	/// @notice Create a listing. The header fields are stored in the clear so
	///         researchers can filter before paying; the medic's EdDSA-Poseidon
	///         signature is over Poseidon2(headerCommit, bodyCommit). Buyers
	///         recompute the header commit off-chain and verify the signature
	///         before placing an order.
	function createListing(
		HeaderInput calldata header,
		uint256 headerCommit,
		uint256 bodyCommit,
		uint256 medicPkX,
		uint256 medicPkY,
		uint256 sigR8x,
		uint256 sigR8y,
		uint256 sigS,
		uint256 price
	) external {
		require(price > 0, "Price must be greater than zero");
		require(bytes(header.title).length > 0, "Title cannot be empty");
		require(bytes(header.recordType).length > 0, "recordType cannot be empty");
		require(bytes(header.facility).length > 0, "facility cannot be empty");
		require(header.recordedAt > 0, "recordedAt must be non-zero");
		require(headerCommit != 0, "headerCommit must be non-zero");
		require(bodyCommit != 0, "bodyCommit must be non-zero");
		require(medicPkX != 0 || medicPkY != 0, "medicPk must be non-zero");
		require(sigS != 0, "signature must be non-zero");

		uint256 listingId = listingCount;
		listings[listingId] = Listing({
			title: header.title,
			recordType: header.recordType,
			recordedAt: header.recordedAt,
			facility: header.facility,
			headerCommit: headerCommit,
			bodyCommit: bodyCommit,
			medicPkX: medicPkX,
			medicPkY: medicPkY,
			sigR8x: sigR8x,
			sigR8y: sigR8y,
			sigS: sigS,
			price: price,
			patient: msg.sender,
			active: true
		});
		listingCount++;
		emit ListingCreated(
			msg.sender,
			listingId,
			headerCommit,
			bodyCommit,
			medicPkX,
			medicPkY,
			header.title,
			header.recordType,
			header.recordedAt,
			header.facility,
			price
		);
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
	///         signature + bodyCommit off-chain after decryption.
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

	/// @notice Listing metadata: commits, medic attestation, price, patient, active.
	///         Use getListingHeader(id) for the human-readable header fields.
	function getListing(
		uint256 id
	)
		external
		view
		returns (
			uint256 headerCommit,
			uint256 bodyCommit,
			uint256 medicPkX,
			uint256 medicPkY,
			uint256 sigR8x,
			uint256 sigR8y,
			uint256 sigS,
			uint256 price,
			address patient,
			bool active
		)
	{
		Listing storage l = listings[id];
		return (
			l.headerCommit,
			l.bodyCommit,
			l.medicPkX,
			l.medicPkY,
			l.sigR8x,
			l.sigR8y,
			l.sigS,
			l.price,
			l.patient,
			l.active
		);
	}

	/// @notice Medic-signed header fields for a listing (title, recordType,
	///         recordedAt, facility). Researchers recompute headerCommit from
	///         these and verify the medic sig before buying.
	function getListingHeader(
		uint256 id
	)
		external
		view
		returns (
			string memory title,
			string memory recordType,
			uint64 recordedAt,
			string memory facility
		)
	{
		Listing storage l = listings[id];
		return (l.title, l.recordType, l.recordedAt, l.facility);
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
