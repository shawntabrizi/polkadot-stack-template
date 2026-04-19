// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Groth16 BN254 verifier — pure Solidity (no assembly, resolc/PVM compatible).
// VK constants generated from circuits/build/verification_key.json after running circuits/build.sh.
// Phase 5: pubSignals length = 11 (was 3); IC array has 12 G1 points.
contract Verifier {
	uint256 constant FIELD_MODULUS =
		21888242871839275222246405745257275088696311157297823662689037894645226208583;

	// --- curve-wide VK constants (unchanged by trusted setup) ---
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

	// --- circuit-specific VK constants (change on every zkey) ---
	uint256 constant DELTA_X1 =
		18394422540355672293016085513627333760645043874799912699061308864536054264846;
	uint256 constant DELTA_X2 =
		1639581609221403559207907370987738918342751938215523684714966120376378450409;
	uint256 constant DELTA_Y1 =
		14204543851093743996324985332766459510461867571997664018929380696160150074727;
	uint256 constant DELTA_Y2 =
		3010365125738967966470207821205652134584382013187112811313830994751690665779;

	uint256 constant IC0_X =
		25268475198885002500504228471320093872455037636864065041739498669848706104;
	uint256 constant IC0_Y =
		3913020683067952307147206849298621767450753689988923963363911846305229199606;
	uint256 constant IC1_X =
		13571675807173032038519323879307935334859405421755703612903908315884747414253;
	uint256 constant IC1_Y =
		18349648957635918107336982709350992569466591396607999548567216261288461384473;
	uint256 constant IC2_X =
		14198857234547995943542205769237024800346534598395336113085551003731545103192;
	uint256 constant IC2_Y =
		17194194712670464095100001659847992388006832311691548994571376004670968035621;
	uint256 constant IC3_X =
		7920234005538382996939593839325426918296279015765090403429884305419158082927;
	uint256 constant IC3_Y =
		8364305912880826190429271245585562367125283896225772980493330021527073608286;
	uint256 constant IC4_X =
		15329121554618845961268116722166772075803246955386453869501665814548966291408;
	uint256 constant IC4_Y =
		2092701575734848428375319207003726931415681929866371776350124984012491775301;
	uint256 constant IC5_X =
		1496233598617082070521373004945382759716808161173727007758539081017832399918;
	uint256 constant IC5_Y =
		18516607560335348718932462968968032247594384594545441683067490151843654835959;
	uint256 constant IC6_X =
		10157558105157361624230674295037574446949890429397905917922354474220304905299;
	uint256 constant IC6_Y =
		11361364786865649687755992994248324507666886854171443013965654012360088903787;
	uint256 constant IC7_X =
		18950474560538661559785747606013583404799982408170210219159213085537247839658;
	uint256 constant IC7_Y =
		14779043722557656920032175527039248600241988542913878305988057301197610094204;
	uint256 constant IC8_X =
		20438570272104557738950778632138885157465078583407311736258882561178497529933;
	uint256 constant IC8_Y =
		11623146692400443149143264188796448246601100061115037910585863153873035516596;
	uint256 constant IC9_X =
		16069233234828996417428904305836803723543228811521668576723005023856942620284;
	uint256 constant IC9_Y =
		3454791445651183351675542761939014893854722595309773398926054197445224894353;
	uint256 constant IC10_X =
		17784743787842617845205217398631811925848987904000993396488389163103160891116;
	uint256 constant IC10_Y =
		14214245229176649032705383044564316485798712392007300496750464163105250016965;
	uint256 constant IC11_X =
		21398790061896457964936435789018912794304661347789488484629069313027711554695;
	uint256 constant IC11_Y =
		18225957424254902762231597012061892516248100635976075575825095377222142042839;

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

	/// @dev Accumulate `vk + IC[i]*s` using the EC precompiles.
	/// Extracted into its own function to keep stack usage small under PVM.
	function _addTerm(
		uint256 vx,
		uint256 vy,
		uint256 icX,
		uint256 icY,
		uint256 s
	) internal view returns (uint256, uint256) {
		(uint256 tx, uint256 ty) = _ecMul(icX, icY, s);
		return _ecAdd(vx, vy, tx, ty);
	}

	/// @dev vk_x = IC[0] + Σ pubSignals[i] * IC[i+1].
	function _computeVkX(uint256[11] calldata p) internal view returns (uint256 vx, uint256 vy) {
		(vx, vy) = (IC0_X, IC0_Y);
		(vx, vy) = _addTerm(vx, vy, IC1_X, IC1_Y, p[0]);
		(vx, vy) = _addTerm(vx, vy, IC2_X, IC2_Y, p[1]);
		(vx, vy) = _addTerm(vx, vy, IC3_X, IC3_Y, p[2]);
		(vx, vy) = _addTerm(vx, vy, IC4_X, IC4_Y, p[3]);
		(vx, vy) = _addTerm(vx, vy, IC5_X, IC5_Y, p[4]);
		(vx, vy) = _addTerm(vx, vy, IC6_X, IC6_Y, p[5]);
		(vx, vy) = _addTerm(vx, vy, IC7_X, IC7_Y, p[6]);
		(vx, vy) = _addTerm(vx, vy, IC8_X, IC8_Y, p[7]);
		(vx, vy) = _addTerm(vx, vy, IC9_X, IC9_Y, p[8]);
		(vx, vy) = _addTerm(vx, vy, IC10_X, IC10_Y, p[9]);
		(vx, vy) = _addTerm(vx, vy, IC11_X, IC11_Y, p[10]);
	}

	/// @dev Build and execute the 4-pair BN254 pairing check.
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
		uint256[11] calldata pubSignals
	) external view returns (bool) {
		(uint256 vx, uint256 vy) = _computeVkX(pubSignals);
		(uint256 negAx, uint256 negAy) = _negate(a[0], a[1]);
		return _runPairing(negAx, negAy, b, vx, vy, c);
	}
}
