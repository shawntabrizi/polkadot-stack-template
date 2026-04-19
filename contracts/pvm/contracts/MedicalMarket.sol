// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVerifier {
	function verifyProof(
		uint256[2] calldata a,
		uint256[2][2] calldata b,
		uint256[2] calldata c,
		uint256[11] calldata pubSignals
	) external view returns (bool);
}

/// @title MedicalMarket
/// @notice Phase 5 marketplace: true ZKCP. The patient's Groth16 proof attests that a
///         ciphertext emitted on-chain decrypts under the buyer's BabyJubJub secret key
///         to the AES-256-GCM key that encrypted the off-chain Statement Store blob.
///         Atomic: `fulfill()` verifies the proof, stores the ciphertext, and releases
///         payment in one transaction. Nothing to release manually — no trust required.
///
///         pubSignals layout (enforced in fulfill):
///           [0]  merkleRoot     — must match listing.merkleRoot
///           [1]  medicPkX       — informational (off-chain identity check)
///           [2]  medicPkY       — informational
///           [3]  pkBuyerX       — must match order.pkBuyerX
///           [4]  pkBuyerY       — must match order.pkBuyerY
///           [5]  ephPkX         — stored for buyer to recover shared secret
///           [6]  ephPkY
///           [7]  ciphertext0
///           [8]  ciphertext1
///           [9]  nonce          — must equal orderId
///           [10] aesKeyCommit   — must match listing.aesKeyCommit
contract MedicalMarket {
	address public verifier;

	constructor(address _verifier) {
		verifier = _verifier;
	}

	struct Listing {
		bytes32 merkleRoot;
		bytes32 statementHash;
		uint256 aesKeyCommit; // Poseidon(aesKey_hi, aesKey_lo) — bound in the ZK proof
		string title;
		uint256 price;
		address patient;
		bool active;
	}

	struct Order {
		uint256 listingId;
		address researcher;
		uint256 amount;
		bool confirmed;
		bool cancelled;
		uint256 pkBuyerX;
		uint256 pkBuyerY;
	}

	struct Fulfillment {
		uint256 ephPkX;
		uint256 ephPkY;
		uint256 ciphertext0;
		uint256 ciphertext1;
	}

	mapping(uint256 => Listing) private listings;
	uint256 private listingCount;

	mapping(uint256 => Order) private orders;
	uint256 private orderCount;

	mapping(uint256 => Fulfillment) private fulfillments;

	mapping(uint256 => uint256) private listingPendingOrder;

	event ListingCreated(
		address indexed patient,
		uint256 indexed listingId,
		bytes32 merkleRoot,
		bytes32 statementHash,
		uint256 aesKeyCommit,
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
		uint256 ciphertext0,
		uint256 ciphertext1
	);
	event ListingCancelled(uint256 indexed listingId, address indexed patient);
	event OrderCancelled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address indexed researcher,
		uint256 amount
	);

	function createListing(
		bytes32 merkleRoot,
		bytes32 statementHash,
		uint256 aesKeyCommit,
		string calldata title,
		uint256 price
	) external {
		require(price > 0, "Price must be greater than zero");
		require(bytes(title).length > 0, "Title cannot be empty");
		require(aesKeyCommit != 0, "aesKeyCommit must be non-zero");
		uint256 listingId = listingCount;
		listings[listingId] = Listing({
			merkleRoot: merkleRoot,
			statementHash: statementHash,
			aesKeyCommit: aesKeyCommit,
			title: title,
			price: price,
			patient: msg.sender,
			active: true
		});
		listingCount++;
		emit ListingCreated(
			msg.sender,
			listingId,
			merkleRoot,
			statementHash,
			aesKeyCommit,
			title,
			price
		);
	}

	/// @notice Lock native PAS and register the buyer's BabyJubJub public key.
	/// @dev The buyer's pk is committed here so the patient's ZK proof can bind the
	///      in-circuit ECDH encryption to the correct recipient.
	function placeBuyOrder(uint256 listingId, uint256 pkBuyerX, uint256 pkBuyerY) external payable {
		require(listingId < listingCount, "Listing does not exist");
		Listing storage listing = listings[listingId];
		require(listing.active, "Listing is not active");
		require(listingPendingOrder[listingId] == 0, "Listing already has a pending order");
		require(msg.value >= listing.price, "Insufficient payment");
		require(pkBuyerX != 0 || pkBuyerY != 0, "pkBuyer must be non-zero");

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
	}

	/// @notice Atomically verify the ZK proof, persist the ciphertext, and release payment.
	function fulfill(
		uint256 orderId,
		uint256[2] calldata a,
		uint256[2][2] calldata b,
		uint256[2] calldata c,
		uint256[11] calldata pubSignals
	) external {
		require(orderId < orderCount, "Order does not exist");
		Order storage order = orders[orderId];
		require(!order.confirmed, "Order already fulfilled");
		require(!order.cancelled, "Order is cancelled");

		Listing storage listing = listings[order.listingId];
		require(msg.sender == listing.patient, "Only the patient can fulfill the order");

		require(bytes32(pubSignals[0]) == listing.merkleRoot, "merkleRoot mismatch");
		require(pubSignals[3] == order.pkBuyerX, "pkBuyerX mismatch");
		require(pubSignals[4] == order.pkBuyerY, "pkBuyerY mismatch");
		require(pubSignals[9] == orderId, "nonce must equal orderId");
		require(pubSignals[10] == listing.aesKeyCommit, "aesKeyCommit mismatch");
		require(IVerifier(verifier).verifyProof(a, b, c, pubSignals), "ZK proof invalid");

		order.confirmed = true;
		listing.active = false;

		fulfillments[orderId] = Fulfillment({
			ephPkX: pubSignals[5],
			ephPkY: pubSignals[6],
			ciphertext0: pubSignals[7],
			ciphertext1: pubSignals[8]
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
			pubSignals[5],
			pubSignals[6],
			pubSignals[7],
			pubSignals[8]
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
			bytes32 merkleRoot,
			bytes32 statementHash,
			uint256 aesKeyCommit,
			string memory title,
			uint256 price,
			address patient,
			bool active
		)
	{
		Listing storage l = listings[id];
		return (
			l.merkleRoot,
			l.statementHash,
			l.aesKeyCommit,
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

	/// @notice Ciphertext + ephemeral pk for a fulfilled order.
	function getFulfillment(
		uint256 orderId
	) external view returns (uint256 ephPkX, uint256 ephPkY, uint256 c0, uint256 c1) {
		Fulfillment storage f = fulfillments[orderId];
		return (f.ephPkX, f.ephPkY, f.ciphertext0, f.ciphertext1);
	}

	function getOrderCount() external view returns (uint256) {
		return orderCount;
	}

	function getPendingOrderId(uint256 listingId) external view returns (uint256) {
		return listingPendingOrder[listingId];
	}
}
