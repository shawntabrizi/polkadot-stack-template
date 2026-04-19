import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

// Regenerate with `cd circuits && node test/gen_fixture.mjs` after any circuit change.
const fixture = JSON.parse(
	readFileSync(join(__dirname, "fixtures", "phase5_proof.json"), "utf8"),
) as {
	merkleRoot: `0x${string}`;
	statementHash: `0x${string}`;
	aesKeyCommit: string;
	pkBuyerX: string;
	pkBuyerY: string;
	orderId: number;
	a: [string, string];
	b: [[string, string], [string, string]];
	c: [string, string];
	pubSignals: string[];
};

const proofA = fixture.a.map((v) => BigInt(v)) as [bigint, bigint];
const proofB = fixture.b.map((row) => row.map((v) => BigInt(v))) as unknown as [
	[bigint, bigint],
	[bigint, bigint],
];
const proofC = fixture.c.map((v) => BigInt(v)) as [bigint, bigint];
const pubSignals = fixture.pubSignals.map((v) => BigInt(v)) as [
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
	bigint,
];

describe("MedicalMarket Phase 5 (ZKCP)", function () {
	const title = "Blood Panel Q1 2025";
	const price = 1_000_000n;
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
		await market.write.createListing(
			[fixture.merkleRoot, fixture.statementHash, BigInt(fixture.aesKeyCommit), title, price],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([0n, pkBuyerX, pkBuyerY], {
			account: researcher.account,
			value: price,
		});
		return ctx;
	}

	it("fulfill() succeeds, stores ciphertext, releases payment", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const publicClient = await hre.viem.getPublicClient();

		await market.write.fulfill([0n, proofA, proofB, proofC, pubSignals], {
			account: patient.account,
		});

		const order = await market.read.getOrder([0n]);
		expect(order[3]).to.equal(true); // confirmed

		const fulfilled = await market.read.getFulfillment([0n]);
		expect(fulfilled[0]).to.equal(pubSignals[5]); // ephPkX
		expect(fulfilled[1]).to.equal(pubSignals[6]); // ephPkY
		expect(fulfilled[2]).to.equal(pubSignals[7]); // ciphertext0
		expect(fulfilled[3]).to.equal(pubSignals[8]); // ciphertext1

		// Contract should hold no funds — price forwarded to patient, excess refunded.
		const marketBal = await publicClient.getBalance({ address: market.address });
		expect(marketBal).to.equal(0n);
	});

	it("fulfill() reverts on merkleRoot mismatch", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as typeof pubSignals;
		bad[0] = 42n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("merkleRoot mismatch");
		}
	});

	it("fulfill() reverts on pkBuyer mismatch", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as typeof pubSignals;
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

	it("fulfill() reverts on aesKeyCommit mismatch", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as typeof pubSignals;
		bad[10] = pubSignals[10] + 1n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("aesKeyCommit mismatch");
		}
	});

	it("fulfill() reverts when nonce != orderId", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const bad = [...pubSignals] as typeof pubSignals;
		bad[9] = 99n;
		try {
			await market.write.fulfill([0n, proofA, proofB, proofC, bad], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("nonce must equal orderId");
		}
	});

	it("fulfill() reverts when public signals don't match the proof", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		// Tamper the (informational) medic-pubkey signal. No contract-level require
		// guards pubSignals[1], so the call reaches verifyProof and fails there.
		const bad = [...pubSignals] as typeof pubSignals;
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
});
