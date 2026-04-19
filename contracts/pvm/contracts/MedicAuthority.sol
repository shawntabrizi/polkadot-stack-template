// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MedicAuthority
/// @notice Manages a set of trusted Authority addresses that may add or remove verified medics.
///         Authorities can also add or remove other Authorities, but the last Authority can never
///         be removed — ensuring the registry is always governable.
///         Compiles to both EVM (solc) and PVM (resolc) bytecode.
contract MedicAuthority {
	mapping(address => bool) public isAuthority;
	mapping(address => bool) public isVerifiedMedic;
	uint256 public authorityCount;

	event AuthorityAdded(address indexed authority, address indexed by);
	event AuthorityRemoved(address indexed authority, address indexed by);
	event MedicAdded(address indexed medic, address indexed by);
	event MedicRemoved(address indexed medic, address indexed by);

	/// @notice Deploy the contract with an initial set of Authority addresses.
	/// @param initialAuthorities Non-empty list of addresses to grant Authority status.
	constructor(address[] memory initialAuthorities) {
		require(initialAuthorities.length > 0, "empty initial authorities");
		for (uint256 i = 0; i < initialAuthorities.length; i++) {
			address addr = initialAuthorities[i];
			require(addr != address(0), "zero address not allowed");
			require(!isAuthority[addr], "duplicate authority");
			isAuthority[addr] = true;
			emit AuthorityAdded(addr, address(0));
		}
		authorityCount = initialAuthorities.length;
	}

	modifier onlyAuthority() {
		require(isAuthority[msg.sender], "not authority");
		_;
	}

	/// @notice Add a medic to the verified set.
	/// @param medic The address to mark as a verified medic.
	function addMedic(address medic) external onlyAuthority {
		require(medic != address(0), "zero address not allowed");
		require(!isVerifiedMedic[medic], "already verified medic");
		isVerifiedMedic[medic] = true;
		emit MedicAdded(medic, msg.sender);
	}

	/// @notice Remove a medic from the verified set.
	/// @param medic The address to remove from the verified medics.
	function removeMedic(address medic) external onlyAuthority {
		require(isVerifiedMedic[medic], "not a verified medic");
		isVerifiedMedic[medic] = false;
		emit MedicRemoved(medic, msg.sender);
	}

	/// @notice Add a new Authority address.
	/// @param newAuth The address to grant Authority status.
	function addAuthority(address newAuth) external onlyAuthority {
		require(newAuth != address(0), "zero address not allowed");
		require(!isAuthority[newAuth], "already an authority");
		isAuthority[newAuth] = true;
		authorityCount++;
		emit AuthorityAdded(newAuth, msg.sender);
	}

	/// @notice Remove an Authority address. Reverts if this would leave the registry ungovernable.
	/// @param auth The address to revoke Authority status from.
	function removeAuthority(address auth) external onlyAuthority {
		require(isAuthority[auth], "not an authority");
		require(authorityCount > 1, "cannot remove last authority");
		isAuthority[auth] = false;
		authorityCount--;
		emit AuthorityRemoved(auth, msg.sender);
	}
}
