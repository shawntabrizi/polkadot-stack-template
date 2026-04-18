// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Groth16 BN254 verifier — pure Solidity (no assembly, resolc/PVM compatible).
// VK constants must be filled from circuits/build/verification_key.json after running circuits/build.sh.
contract Verifier {
	uint256 constant FIELD_MODULUS =
		21888242871839275222246405745257275088696311157297823662689037894645226208583;

	// Verification key — generated from circuits/build/verification_key.json
	uint256 constant ALPHA_X =
		20491192805390485299153009773594534940189261866228447918068658471970481763042;
	uint256 constant ALPHA_Y =
		9383485363053290200918347156157836566562967994039712273449902621266178545958;
	uint256 constant BETA_X1 =
		4252822878758300859123897981450591353533073413197771768651442665752259397132;
	uint256 constant BETA_X2 =
		6375614351688725206403948262868962793625744043794305715222011528459656738731;
	uint256 constant BETA_Y1 =
		21847035105528745403288232691147584728191162732299865338377159692350059136679;
	uint256 constant BETA_Y2 =
		10505242626370262277552901082094356697409835680220590971873171140371331206856;
	uint256 constant GAMMA_X1 =
		11559732032986387107991004021392285783925812861821192530917403151452391805634;
	uint256 constant GAMMA_X2 =
		10857046999023057135944570762232829481370756359578518086990519993285655852781;
	uint256 constant GAMMA_Y1 =
		4082367875863433681332203403145435568316851327593401208105741076214120093531;
	uint256 constant GAMMA_Y2 =
		8495653923123431417604973247489272438418190587263600148770280649306958101930;
	uint256 constant DELTA_X1 =
		19115131014244011896578410972247609366850272351429485569296024599735879606230;
	uint256 constant DELTA_X2 =
		19492234576308304050901869414099960198645730075019704037542552847350666519050;
	uint256 constant DELTA_Y1 =
		12825333727773438295184069772521727189585162364519177533305041135755312965569;
	uint256 constant DELTA_Y2 =
		11328131642918644530173971325741557581699661249893293510838481067548782628799;
	uint256 constant IC0_X =
		11929819037546144579866618066746601271923127027762133792538047273551799072868;
	uint256 constant IC0_Y =
		12941664172046228010635643438267141596346810790984732879757102649362507173468;
	uint256 constant IC1_X =
		7869328625316050111735885955697041893139011687578638618796396491860236282105;
	uint256 constant IC1_Y =
		4520020891400436042547143659389956487721027262043076792990710955171923248799;
	uint256 constant IC2_X =
		19012867683639184974539259801761137425979215830188124030568583902499240142359;
	uint256 constant IC2_Y =
		691959706466928761220347902680778851210648267606153299737687356786786856306;
	uint256 constant IC3_X =
		18147095701435802396264665911657290313266998835785368790351310109233989208999;
	uint256 constant IC3_Y =
		20360002782654031923255332262900148219208521596467490265889794459902813862178;

	function _negate(uint256 x, uint256 y) internal pure returns (uint256, uint256) {
		if (x == 0 && y == 0) return (0, 0);
		return (x, FIELD_MODULUS - (y % FIELD_MODULUS));
	}

	function _ecAdd(
		uint256 ax,
		uint256 ay,
		uint256 bx,
		uint256 by
	) internal view returns (uint256 rx, uint256 ry) {
		(bool ok, bytes memory out) = address(0x06).staticcall(abi.encodePacked(ax, ay, bx, by));
		require(ok && out.length == 64, "ecAdd failed");
		(rx, ry) = abi.decode(out, (uint256, uint256));
	}

	function _ecMul(
		uint256 px,
		uint256 py,
		uint256 s
	) internal view returns (uint256 rx, uint256 ry) {
		(bool ok, bytes memory out) = address(0x07).staticcall(abi.encodePacked(px, py, s));
		require(ok && out.length == 64, "ecMul failed");
		(rx, ry) = abi.decode(out, (uint256, uint256));
	}

	function _ecPairing(bytes memory input) internal view returns (bool) {
		(bool ok, bytes memory out) = address(0x08).staticcall(input);
		require(ok && out.length == 32, "ecPairing failed");
		return abi.decode(out, (uint256)) == 1;
	}

	/// @dev Compute vk_x = IC[0] + pubSignals[0]*IC[1] + pubSignals[1]*IC[2] + pubSignals[2]*IC[3].
	/// Split into its own function to keep verifyProof under the stack-depth limit.
	function _computeVkX(
		uint256[3] calldata pubSignals
	) internal view returns (uint256 vx, uint256 vy) {
		(vx, vy) = (IC0_X, IC0_Y);
		uint256 tmpX;
		uint256 tmpY;
		(tmpX, tmpY) = _ecMul(IC1_X, IC1_Y, pubSignals[0]);
		(vx, vy) = _ecAdd(vx, vy, tmpX, tmpY);
		(tmpX, tmpY) = _ecMul(IC2_X, IC2_Y, pubSignals[1]);
		(vx, vy) = _ecAdd(vx, vy, tmpX, tmpY);
		(tmpX, tmpY) = _ecMul(IC3_X, IC3_Y, pubSignals[2]);
		(vx, vy) = _ecAdd(vx, vy, tmpX, tmpY);
	}

	/// @dev Build and execute the 4-pair BN254 pairing check.
	/// Accepts negated A and pre-computed vk_x to stay under the stack-depth limit.
	function _runPairing(
		uint256 negAx,
		uint256 negAy,
		uint256[2][2] calldata b,
		uint256 vx,
		uint256 vy,
		uint256[2] calldata c
	) internal view returns (bool) {
		return
			_ecPairing(
				abi.encodePacked(
					negAx,
					negAy,
					b[0][0],
					b[0][1],
					b[1][0],
					b[1][1],
					ALPHA_X,
					ALPHA_Y,
					BETA_X1,
					BETA_X2,
					BETA_Y1,
					BETA_Y2,
					vx,
					vy,
					GAMMA_X1,
					GAMMA_X2,
					GAMMA_Y1,
					GAMMA_Y2,
					c[0],
					c[1],
					DELTA_X1,
					DELTA_X2,
					DELTA_Y1,
					DELTA_Y2
				)
			);
	}

	function verifyProof(
		uint256[2] calldata a,
		uint256[2][2] calldata b,
		uint256[2] calldata c,
		uint256[3] calldata pubSignals
	) external view returns (bool) {
		(uint256 vx, uint256 vy) = _computeVkX(pubSignals);
		(uint256 negAx, uint256 negAy) = _negate(a[0], a[1]);
		return _runPairing(negAx, negAy, b, vx, vy, c);
	}
}
