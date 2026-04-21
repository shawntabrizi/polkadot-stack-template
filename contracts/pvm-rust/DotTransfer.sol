// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface DotTransfer {
	event TransferCreated(
		bytes32 indexed transferId,
		address indexed uploader,
		uint256 expiresAt,
		string fileName,
		uint256 fileSize
	);
	event TransferRevoked(bytes32 indexed transferId, address indexed uploader);

	error NotFound();
	error AlreadyTaken();
	error NotUploader();
	error AlreadyRevoked();
	error ExpiryInPast();
	error FileSizeZero();
	error EmptyCids();
	error ChunkCountZero();

	function createTransfer(
		bytes32 transferId,
		string calldata cids,
		uint256 expiresAt,
		uint256 fileSize,
		string calldata fileName,
		uint256 chunkCount
	) external;

	function revokeTransfer(bytes32 transferId) external;

	function getTransfer(
		bytes32 transferId
	)
		external
		view
		returns (
			string memory cids,
			address uploader,
			uint256 expiresAt,
			uint256 fileSize,
			string memory fileName,
			uint256 chunkCount,
			bool expired,
			bool revoked
		);

	function getTransfersByUploader(address uploader) external view returns (bytes32[] memory);
}
