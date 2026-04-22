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

	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
	event MedicAdded(address indexed medic, address indexed by);
	event MedicRemoved(address indexed medic, address indexed by);

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
}
