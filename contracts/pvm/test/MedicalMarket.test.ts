import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

// Regenerate the fixture with `cd circuits && node test/gen_fixture.mjs` after
// any change to the circuit or zkey.
const fixture = JSON.parse(
	readFileSync(join(__dirname, "fixtures", "phase5_1_proof.json"), "utf8"),
) as {
	recordCommit: string;
	pkBuyerX: string;
	pkBuyerY: string;
	orderId: number;
	a: [string, string];
	b: [[string, string], [string, string]];
	c: [string, string];
	pubSignals: string[];
	skBuyer: string;
	ciphertext: string[];
	expectedRecord: Record<string, string>;
};

const proofA = fixture.a.map(BigInt) as [bigint, bigint];
const proofB = fixture.b.map((row) => row.map(BigInt)) as unknown as [
	[bigint, bigint],
	[bigint, bigint],
];
const proofC = fixture.c.map(BigInt) as [bigint, bigint];
type PubSignals = [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
const pubSignals = fixture.pubSignals.map(BigInt) as PubSignals;

describe("MedicalMarket Phase 5.1 (ZKCP + Statement Store)", function () {
	const title = "Blood Panel Q1 2025";
	const price = 1_000_000n;
	const recordCommit = BigInt(fixture.recordCommit);
	const pkBuyerX = BigInt(fixture.pkBuyerX);
	const pkBuyerY = BigInt(fixture.pkBuyerY);

	async function deployFixture() {
		const [patient, researcher] = await hre.viem.getWalletClients();
		const verifier = await hre.viem.deployContract("Verifier");
		const market = await hre.viem.deployContract("MedicalMarket", [verifier.address]);
		return { market, verifier, patient, researcher };
	}

	async function deployWithOrder() {
		const ctx = await deployFixture();
		const { market, patient, researcher } = ctx;
		await market.write.createListing([recordCommit, title, price], {
			account: patient.account,
		});
		await market.write.placeBuyOrder([0n, pkBuyerX, pkBuyerY], {
			account: researcher.account,
			value: price,
		});
		return ctx;
	}

	it("createListing + placeBuyOrder + fulfill (golden path)", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const publicClient = await hre.viem.getPublicClient();

		await market.write.fulfill([0n, proofA, proofB, proofC, pubSignals], {
			account: patient.account,
		});

		const order = await market.read.getOrder([0n]);
		expect(order[3]).to.equal(true); // confirmed

		const fulfillment = await market.read.getFulfillment([0n]);
		expect(fulfillment[0]).to.equal(pubSignals[5]); // ephPkX
		expect(fulfillment[1]).to.equal(pubSignals[6]); // ephPkY
		expect(fulfillment[2]).to.equal(pubSignals[7]); // ciphertextHash

		const listing = await market.read.getListing([0n]);
		expect(listing[4]).to.equal(false); // active flipped off

		// Contract must hold no native balance after settlement.
		const bal = await publicClient.getBalance({ address: market.address });
		expect(bal).to.equal(0n);
	});

	it("fulfill reverts on recordCommit mismatch", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as PubSignals;
		bad[0] = 42n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("recordCommit mismatch");
		}
	});

	it("fulfill reverts on pkBuyer mismatch", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as PubSignals;
		bad[3] = pubSignals[3] + 1n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("pkBuyerX mismatch");
		}
	});

	it("fulfill reverts when nonce != orderId", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as PubSignals;
		bad[8] = 99n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("nonce must equal orderId");
		}
	});

	it("fulfill reverts when an informational pubSignal is tampered (proof invalid)", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		// medicPkX is pubSignals[1] — no contract-level require guards it, so the
		// call reaches verifyProof and fails in the Groth16 pairing check.
		const bad = [...pubSignals] as PubSignals;
		bad[1] = pubSignals[1] + 1n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("ZK proof invalid");
		}
	});

	it("cancelOrder refunds the researcher when patient never fulfils", async function () {
		const { market, researcher } = await loadFixture(deployWithOrder);
		const publicClient = await hre.viem.getPublicClient();
		await market.write.cancelOrder([0n], { account: researcher.account });
		const order = await market.read.getOrder([0n]);
		expect(order[4]).to.equal(true); // cancelled
		const bal = await publicClient.getBalance({ address: market.address });
		expect(bal).to.equal(0n);
	});
});
