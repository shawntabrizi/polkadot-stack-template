// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MedicAuthority
/// @notice Single-owner registry of verified medics. The owner is expected to be the H160
///         derived from a pallet-multisig account so that any write requires M-of-N approval
///         off-chain. To rotate the signatory set, compute the new multisig H160 off-chain
///         and call transferOwnership() via the current multisig.
///         Compiles to both EVM (solc) and PVM (resolc) bytecode.
contract MedicAuthority {
	address public owner;
	mapping(address => bool) public isVerifiedMedic;

	// pallet-multisig stores only the 32-byte callHash on-chain; signatories must
	// re-supply the call bytes on execution. We persist (action, target) here so
	// approvers can reconstruct the inner call via a deterministic contract read
	// instead of depending on log indexers. proposedAt == 0 means "not hinted".
	struct Proposal {
		string action;
		address target;
		uint64 proposedAt;
	}
	mapping(bytes32 => Proposal) public proposals;

	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
	event MedicAdded(address indexed medic, address indexed by);
	event MedicRemoved(address indexed medic, address indexed by);
	/// @notice Emitted by the proposer so approvers can read the intended action
	///         without any off-chain coordination. callHash links this to the
	///         on-chain MultisigInfo entry. No auth — anyone can call this.
	event ProposalHinted(bytes32 indexed callHash, string action, address target);

	constructor(address initialOwner) {
		require(initialOwner != address(0), "zero address not allowed");
		owner = initialOwner;
		emit OwnershipTransferred(address(0), initialOwner);
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "not owner");
		_;
	}

	function transferOwnership(address newOwner) external onlyOwner {
		require(newOwner != address(0), "zero address not allowed");
		emit OwnershipTransferred(owner, newOwner);
		owner = newOwner;
	}

	function addMedic(address medic) external onlyOwner {
		require(medic != address(0), "zero address not allowed");
		require(!isVerifiedMedic[medic], "already verified medic");
		isVerifiedMedic[medic] = true;
		emit MedicAdded(medic, msg.sender);
	}

	function removeMedic(address medic) external onlyOwner {
		require(isVerifiedMedic[medic], "not a verified medic");
		isVerifiedMedic[medic] = false;
		emit MedicRemoved(medic, msg.sender);
	}

	/// @notice Anyone can hint what a multisig proposal is for. No auth — the callHash
	///         ties this to the actual on-chain MultisigInfo entry. If a hint already
	///         exists for this hash it is silently kept (first-write-wins) so a
	///         malicious late-caller can't rewrite a pending proposal's metadata.
	function hintProposal(bytes32 callHash, string calldata action, address target) external {
		if (proposals[callHash].proposedAt == 0) {
			proposals[callHash] = Proposal({
				action: action,
				target: target,
				proposedAt: uint64(block.timestamp)
			});
			emit ProposalHinted(callHash, action, target);
		}
	}

	/// @notice Convenience read used by the governance dashboard to bypass log indexers.
	function getProposal(
		bytes32 callHash
	) external view returns (string memory action, address target, uint64 proposedAt) {
		Proposal memory p = proposals[callHash];
		return (p.action, p.target, p.proposedAt);
	}
}
