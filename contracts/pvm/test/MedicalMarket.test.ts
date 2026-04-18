import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("MedicalMarket ZK gate (PVM)", function () {
	// Shared test data
	const merkleRoot = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
	const statementHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
	const title = "Blood Panel Q1 2025";
	const price = 1_000_000n; // 1 µPAS in wei
	const decryptionKey = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

	// Zero proof elements — Verifier.verifyProof() will return false for these
	const zeroA: [bigint, bigint] = [0n, 0n];
	const zeroB: [[bigint, bigint], [bigint, bigint]] = [
		[0n, 0n],
		[0n, 0n],
	];
	const zeroC: [bigint, bigint] = [0n, 0n];

	async function deployFixture() {
		const [patient, researcher] = await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();

		// Deploy Verifier first, then pass its address to MedicalMarket
		const verifier = await hre.viem.deployContract("Verifier");
		const market = await hre.viem.deployContract("MedicalMarket", [verifier.address]);

		return { market, verifier, patient, researcher, publicClient };
	}

	async function deployWithListing() {
		const ctx = await deployFixture();
		const { market, patient } = ctx;

		await market.write.createListing(
			[merkleRoot as `0x${string}`, statementHash as `0x${string}`, title, price],
			{ account: patient.account },
		);

		return ctx;
	}

	async function deployWithOrder() {
		const ctx = await deployWithListing();
		const { market, researcher } = ctx;

		// listingId = 0
		await market.write.placeBuyOrder([0n], {
			account: researcher.account,
			value: price,
		});

		return ctx;
	}

	it("fulfill() reverts with zeroed proof (ZK proof invalid)", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);

		// pubSignals[0] must match merkleRoot to reach the verifyProof check
		const matchingPubSignals: [bigint, bigint, bigint] = [BigInt(merkleRoot), 0n, 0n];

		try {
			await market.write.fulfill(
				[0n, decryptionKey as `0x${string}`, zeroA, zeroB, zeroC, matchingPubSignals],
				{ account: patient.account },
			);
			expect.fail("Should have reverted with ZK proof invalid");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("ZK proof invalid");
		}
	});

	it("fulfill() reverts on merkleRoot mismatch", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);

		// pubSignals[0] does not match the listing's merkleRoot
		const wrongRoot = "0x0000000000000000000000000000000000000000000000000000000000000001";
		const mismatchedPubSignals: [bigint, bigint, bigint] = [BigInt(wrongRoot), 0n, 0n];

		try {
			await market.write.fulfill(
				[0n, decryptionKey as `0x${string}`, zeroA, zeroB, zeroC, mismatchedPubSignals],
				{ account: patient.account },
			);
			expect.fail("Should have reverted with merkleRoot mismatch");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("merkleRoot mismatch");
		}
	});

	// TODO: Replace with a real proof once circuits/build.sh has been run and
	// circuits/build/verification_key.json has been copied into Verifier.sol constants.
	it.skip("fulfill() succeeds with a valid Groth16 proof", async function () {
		// 1. Generate proof with snarkjs:
		//    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
		//      input, "circuits/build/medical_disclosure.wasm", "circuits/build/medical_disclosure_final.zkey"
		//    );
		// 2. Format for Solidity using snarkjs.groth16.exportSolidityCallData().
		// 3. Call market.write.fulfill([orderId, decryptionKey, a, b, c, pubSignals]).
	});
});
