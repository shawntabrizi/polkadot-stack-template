// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MedicalMarket
/// @notice Phase 1 marketplace: patients import a medic-signed record (Poseidon Merkle tree +
///         EdDSA BabyJubJub signature), encrypt the full signed package, upload the ciphertext
///         to the Statement Store, and list the Merkle root on-chain with a price.
///         After a researcher locks payment, the patient calls fulfill() to post the AES-256-GCM
///         decryption key on-chain — releasing funds and letting the researcher decrypt.
///         No ZK proof yet — manual key release. The Merkle root commitment enables selective
///         field disclosure proofs in Phase 3+.
///         Compiles to both EVM (solc) and PVM (resolc) bytecode.
contract MedicalMarket {
	struct Listing {
		bytes32 merkleRoot; // Poseidon Merkle root of the signed JSON record fields
		bytes32 statementHash; // blake2b-256 of the AES-GCM ciphertext (Statement Store lookup key)
		string title; // short human-readable label visible to researchers before buying
		uint256 price; // minimum price in wei (native PAS)
		address patient;
		bool active; // false if cancelled or already fulfilled
	}

	struct Order {
		uint256 listingId;
		address researcher;
		uint256 amount; // msg.value locked at placeBuyOrder time
		bool confirmed;
		bool cancelled;
		bytes32 decryptionKey; // AES-256-GCM key posted by patient in fulfill()
	}

	mapping(uint256 => Listing) private listings;
	uint256 private listingCount;

	mapping(uint256 => Order) private orders;
	uint256 private orderCount;

	// listingId → 1-based orderId (0 = no pending order)
	mapping(uint256 => uint256) private listingPendingOrder;

	event ListingCreated(
		address indexed patient,
		uint256 indexed listingId,
		bytes32 merkleRoot,
		bytes32 statementHash,
		string title,
		uint256 price
	);
	event OrderPlaced(
		uint256 indexed listingId,
		uint256 indexed orderId,
		address indexed researcher,
		uint256 amount
	);
	event SaleFulfilled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address patient,
		address researcher,
		bytes32 decryptionKey
	);
	event ListingCancelled(uint256 indexed listingId, address indexed patient);
	event OrderCancelled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address indexed researcher,
		uint256 amount
	);

	/// @notice Create a new listing for an encrypted record at the given price.
	/// @param merkleRoot The Poseidon Merkle root of the signed JSON record fields.
	/// @param statementHash The blake2b-256 hash of the AES-GCM ciphertext in the Statement Store (lookup key).
	/// @param title Short human-readable label shown to researchers before buying.
	/// @param price Minimum price in wei (native PAS). Must be greater than zero.
	function createListing(
		bytes32 merkleRoot,
		bytes32 statementHash,
		string calldata title,
		uint256 price
	) external {
		require(price > 0, "Price must be greater than zero");
		require(bytes(title).length > 0, "Title cannot be empty");
		uint256 listingId = listingCount;
		listings[listingId] = Listing({
			merkleRoot: merkleRoot,
			statementHash: statementHash,
			title: title,
			price: price,
			patient: msg.sender,
			active: true
		});
		listingCount++;
		emit ListingCreated(msg.sender, listingId, merkleRoot, statementHash, title, price);
	}

	/// @notice Lock native PAS as payment for a listing. Only one order may be pending per listing.
	/// @param listingId The ID of the listing to purchase.
	function placeBuyOrder(uint256 listingId) external payable {
		require(listingId < listingCount, "Listing does not exist");
		Listing storage listing = listings[listingId];
		require(listing.active, "Listing is not active");
		require(listingPendingOrder[listingId] == 0, "Listing already has a pending order");
		require(msg.value >= listing.price, "Insufficient payment");

		uint256 orderId = orderCount;
		orders[orderId] = Order({
			listingId: listingId,
			researcher: msg.sender,
			amount: msg.value,
			confirmed: false,
			cancelled: false,
			decryptionKey: bytes32(0)
		});
		orderCount++;
		// Store 1-based so that 0 can mean "no order"
		listingPendingOrder[listingId] = orderId + 1;
		emit OrderPlaced(listingId, orderId, msg.sender, msg.value);
	}

	/// @notice Post the AES-256-GCM decryption key, releasing payment to the patient.
	///         The key is stored on-chain so the researcher can retrieve it at any time.
	/// @param orderId The ID of the order to fulfill.
	/// @param decryptionKey The 32-byte AES-256-GCM key that decrypts the Statement Store ciphertext.
	function fulfill(uint256 orderId, bytes32 decryptionKey) external {
		require(orderId < orderCount, "Order does not exist");
		Order storage order = orders[orderId];
		require(!order.confirmed, "Order already fulfilled");
		require(!order.cancelled, "Order is cancelled");

		Listing storage listing = listings[order.listingId];
		require(msg.sender == listing.patient, "Only the patient can fulfill the order");

		order.confirmed = true;
		order.decryptionKey = decryptionKey;
		listing.active = false;

		// Transfer the listing price to the patient
		(bool successPatient, ) = listing.patient.call{value: listing.price}("");
		require(successPatient, "Transfer to patient failed");

		// Refund any excess to the researcher
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
			decryptionKey
		);
	}

	/// @notice Cancel an active listing. Only possible when there is no pending order.
	/// @param listingId The ID of the listing to cancel.
	function cancelListing(uint256 listingId) external {
		require(listingId < listingCount, "Listing does not exist");
		Listing storage listing = listings[listingId];
		require(listing.active, "Listing is not active");
		require(msg.sender == listing.patient, "Only the patient can cancel the listing");
		require(listingPendingOrder[listingId] == 0, "Cannot cancel listing with a pending order");

		listing.active = false;
		emit ListingCancelled(listingId, msg.sender);
	}

	/// @notice Cancel a pending order and refund the locked funds to the researcher.
	///         Also unblocks the listing so new orders can be placed.
	/// @param orderId The ID of the order to cancel.
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

	/// @notice Get the details of a listing.
	/// @param id The listing ID.
	/// @return merkleRoot The Poseidon Merkle root of the signed record fields.
	/// @return statementHash The blake2b-256 hash of the AES-GCM ciphertext (Statement Store lookup key).
	/// @return title The human-readable label set by the patient.
	/// @return price The minimum price in wei.
	/// @return patient The address of the patient who created the listing.
	/// @return active Whether the listing is still open.
	function getListing(
		uint256 id
	)
		external
		view
		returns (
			bytes32 merkleRoot,
			bytes32 statementHash,
			string memory title,
			uint256 price,
			address patient,
			bool active
		)
	{
		Listing storage l = listings[id];
		return (l.merkleRoot, l.statementHash, l.title, l.price, l.patient, l.active);
	}

	/// @notice Get the total number of listings ever created.
	function getListingCount() external view returns (uint256) {
		return listingCount;
	}

	/// @notice Get the details of an order.
	/// @param id The order ID.
	/// @return listingId The listing this order targets.
	/// @return researcher The address of the researcher who placed the order.
	/// @return amount The amount of PAS locked (in wei).
	/// @return confirmed Whether the sale has been fulfilled.
	/// @return cancelled Whether the order has been cancelled.
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
			bool cancelled
		)
	{
		Order storage o = orders[id];
		return (o.listingId, o.researcher, o.amount, o.confirmed, o.cancelled);
	}

	/// @notice Get the AES-256-GCM decryption key for a fulfilled order.
	/// @param orderId The order ID.
	/// @return The 32-byte decryption key, or bytes32(0) if not yet fulfilled.
	function getDecryptionKey(uint256 orderId) external view returns (bytes32) {
		return orders[orderId].decryptionKey;
	}

	/// @notice Get the total number of orders ever placed.
	function getOrderCount() external view returns (uint256) {
		return orderCount;
	}

	/// @notice Get the pending order ID for a listing (1-based; 0 means no pending order).
	/// @param listingId The listing to query.
	/// @return The 1-based order ID, or 0 if there is no pending order.
	function getPendingOrderId(uint256 listingId) external view returns (uint256) {
		return listingPendingOrder[listingId];
	}
}
