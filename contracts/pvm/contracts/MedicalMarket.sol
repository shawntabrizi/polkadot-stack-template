// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MedicalMarket — Phase 5.2 (ECDSA migration)
/// @notice Encrypted-data marketplace with off-chain cryptographic verification.
///         The record is split into a public, medic-signed header (title,
///         recordType, recordedAt, facility — browsable pre-purchase), an
///         encrypted body (the clinical payload), and a PII compartment
///         (patientId, dateOfBirth — encrypted separately, never revealed
///         to the researcher). The medic signs with their Ethereum key over
///         keccak256(recordCommit); buyers recover the signer with ecrecover
///         and compare against listing.medicAddress off-chain before paying.
///
///         The contract does NOT verify the medic signature on-chain —
///         Phase 5.2 keeps cryptography off-chain. A patient who supplies
///         a wrong medicAddress will have the "medic-verified" badge fail on
///         the listing card in ResearcherBuy, so the listing is effectively
///         unsellable.
///
///         At fulfill time the patient encrypts the body for the buyer's
///         secp256k1 pubkey (ECDH + AES-GCM), uploads the ciphertext to
///         the Statement Store, and calls fulfill() with ephPubKey +
///         ciphertextHash. Buyers recompute bodyCommit from the decrypted
///         plaintext and compare against listing.bodyCommit.
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
		uint256 headerCommit; // keccak256 over encoded header field elements
		uint256 bodyCommit; // keccak256 over encrypted body plaintext field elements
		uint256 piiCommit; // keccak256 over PII field elements (patientId, dob)
		// medic attestation: EIP-191 sig over keccak256(recordCommit)
		address medicAddress;
		bytes medicSignature; // 65-byte ECDSA signature
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
		bytes buyerPubKey; // 33-byte compressed secp256k1 pubkey for ECIES encryption
	}

	struct Fulfillment {
		bytes ephPubKey; // 33-byte compressed ephemeral secp256k1 pubkey for ECDH
		uint256 ciphertextHash; // blake2b-256 hash of the ciphertext bytes (Statement Store key)
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
		uint256 piiCommit,
		address medicAddress,
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
		bytes buyerPubKey
	);
	event SaleFulfilled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address patient,
		address researcher,
		bytes ephPubKey,
		uint256 ciphertextHash
	);
	event RecordShared(
		address indexed patient,
		address indexed doctorAddress,
		uint256 headerCommit,
		uint256 bodyCommit,
		uint256 piiCommit,
		address medicAddress,
		bytes medicSignature,
		bytes ephPubKey,
		uint256 ciphertextHash,
		string title,
		string recordType,
		uint64 recordedAt,
		string facility
	);
	event ListingCancelled(uint256 indexed listingId, address indexed patient);
	event OrderCancelled(
		uint256 indexed orderId,
		uint256 indexed listingId,
		address indexed researcher,
		uint256 amount
	);

	/// @notice Create a listing. The header fields are stored in the clear so
	///         researchers can filter before paying; the medic's ECDSA signature
	///         is an EIP-191 sig over keccak256(recordCommit).
	///         Buyers recover the signer off-chain and compare to medicAddress.
	///         The piiCommit covers PII fields (patientId, dateOfBirth) that are
	///         encrypted separately and never exposed to the researcher.
	function createListing(
		HeaderInput calldata header,
		uint256 headerCommit,
		uint256 bodyCommit,
		uint256 piiCommit,
		address medicAddress,
		bytes calldata medicSignature,
		uint256 price
	) external {
		require(price > 0, "Price must be greater than zero");
		require(bytes(header.title).length > 0, "Title cannot be empty");
		require(bytes(header.recordType).length > 0, "recordType cannot be empty");
		require(bytes(header.facility).length > 0, "facility cannot be empty");
		require(header.recordedAt > 0, "recordedAt must be non-zero");
		require(headerCommit != 0, "headerCommit must be non-zero");
		require(bodyCommit != 0, "bodyCommit must be non-zero");
		require(piiCommit != 0, "piiCommit must be non-zero");
		require(medicAddress != address(0), "medicAddress must be non-zero");
		require(medicSignature.length == 65, "medicSignature must be 65 bytes");

		uint256 listingId = listingCount;
		listings[listingId] = Listing({
			title: header.title,
			recordType: header.recordType,
			recordedAt: header.recordedAt,
			facility: header.facility,
			headerCommit: headerCommit,
			bodyCommit: bodyCommit,
			piiCommit: piiCommit,
			medicAddress: medicAddress,
			medicSignature: medicSignature,
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
			piiCommit,
			medicAddress,
			header.title,
			header.recordType,
			header.recordedAt,
			header.facility,
			price
		);
	}

	/// @notice Lock native PAS and register the buyer's secp256k1 pubkey for ECIES.
	///         If a lower offer already exists it is refunded and replaced (outbid).
	///         State is fully written before the external refund call (CEI pattern).
	///         NOTE: if the outbid researcher is a contract that reverts on receive,
	///         the refund call fails and the whole tx reverts — their offer can never
	///         be outbid (griefing). Pull-payment escrow is the production fix.
	function placeBuyOrder(uint256 listingId, bytes calldata buyerPubKey) external payable {
		require(listingId < listingCount, "Listing does not exist");
		Listing storage listing = listings[listingId];
		require(listing.active, "Listing is not active");
		require(msg.value >= listing.price, "Insufficient payment");
		require(buyerPubKey.length == 33, "buyerPubKey must be 33 bytes");

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
			buyerPubKey: buyerPubKey
		});
		orderCount++;
		listingPendingOrder[listingId] = orderId + 1;
		emit OrderPlaced(listingId, orderId, msg.sender, msg.value, buyerPubKey);

		// External call last — consistent with fulfill() and cancelOrder().
		if (prevResearcher != address(0)) {
			// possible constant revert blocking funds here.
			(bool ok, ) = payable(prevResearcher).call{value: prevAmount}("");
			require(ok, "Refund to previous bidder failed");
		}
	}

	/// @notice Patient declares the ephemeral secp256k1 pubkey + Statement Store
	///         ciphertext hash and releases payment. No on-chain proof: the buyer
	///         verifies signature + bodyCommit off-chain after decryption.
	function fulfill(uint256 orderId, bytes calldata ephPubKey, uint256 ciphertextHash) external {
		require(orderId < orderCount, "Order does not exist");
		Order storage order = orders[orderId];
		require(!order.confirmed, "Order already fulfilled");
		require(!order.cancelled, "Order is cancelled");

		Listing storage listing = listings[order.listingId];
		require(msg.sender == listing.patient, "Only the patient can fulfill the order");
		require(ephPubKey.length == 33, "ephPubKey must be 33 bytes");
		require(ciphertextHash != 0, "ciphertextHash must be non-zero");

		order.confirmed = true;
		listing.active = false;

		fulfillments[orderId] = Fulfillment({ephPubKey: ephPubKey, ciphertextHash: ciphertextHash});

		(bool successPatient, ) = listing.patient.call{value: order.amount}("");
		require(successPatient, "Transfer to patient failed");

		emit SaleFulfilled(
			orderId,
			order.listingId,
			listing.patient,
			order.researcher,
			ephPubKey,
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

	/// @notice Share a medic-signed record with a specific doctor address.
	///         The patient encrypts the body for the doctor's secp256k1 pubkey
	///         (ECDH + AES-GCM). No storage, no escrow — pure event emission.
	///         Recipient's inbox reads RecordShared logs filtered by doctorAddress.
	function shareRecord(
		HeaderInput calldata header,
		uint256 headerCommit,
		uint256 bodyCommit,
		uint256 piiCommit,
		address medicAddress,
		bytes calldata medicSignature,
		address doctorAddress,
		bytes calldata ephPubKey,
		uint256 ciphertextHash
	) external {
		require(bytes(header.title).length > 0, "Title cannot be empty");
		require(bytes(header.recordType).length > 0, "recordType cannot be empty");
		require(bytes(header.facility).length > 0, "facility cannot be empty");
		require(header.recordedAt > 0, "recordedAt must be non-zero");
		require(headerCommit != 0, "headerCommit must be non-zero");
		require(bodyCommit != 0, "bodyCommit must be non-zero");
		require(piiCommit != 0, "piiCommit must be non-zero");
		require(medicAddress != address(0), "medicAddress must be non-zero");
		require(medicSignature.length == 65, "medicSignature must be 65 bytes");
		require(doctorAddress != address(0), "doctorAddress must be non-zero");
		require(ephPubKey.length == 33, "ephPubKey must be 33 bytes");
		require(ciphertextHash != 0, "ciphertextHash must be non-zero");

		emit RecordShared(
			msg.sender,
			doctorAddress,
			headerCommit,
			bodyCommit,
			piiCommit,
			medicAddress,
			medicSignature,
			ephPubKey,
			ciphertextHash,
			header.title,
			header.recordType,
			header.recordedAt,
			header.facility
		);
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
			uint256 piiCommit,
			address medicAddress,
			bytes memory medicSignature,
			uint256 price,
			address patient,
			bool active
		)
	{
		Listing storage l = listings[id];
		return (
			l.headerCommit,
			l.bodyCommit,
			l.piiCommit,
			l.medicAddress,
			l.medicSignature,
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
			bytes memory buyerPubKey
		)
	{
		Order storage o = orders[id];
		return (o.listingId, o.researcher, o.amount, o.confirmed, o.cancelled, o.buyerPubKey);
	}

	/// @notice ephemeral pubkey + Statement Store lookup hash for a fulfilled order.
	function getFulfillment(
		uint256 orderId
	) external view returns (bytes memory ephPubKey, uint256 ciphertextHash) {
		Fulfillment storage f = fulfillments[orderId];
		return (f.ephPubKey, f.ciphertextHash);
	}

	function getOrderCount() external view returns (uint256) {
		return orderCount;
	}

	function getPendingOrderId(uint256 listingId) external view returns (uint256) {
		return listingPendingOrder[listingId];
	}
}
