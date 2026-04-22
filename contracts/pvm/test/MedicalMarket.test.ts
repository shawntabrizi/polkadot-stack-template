import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { poseidon2, poseidon4, poseidon8, poseidon16 } from "poseidon-lite";
import { mulPointEscalar, Base8, order as jubOrder } from "@zk-kit/baby-jubjub";

// Phase 5.2 — record split into a public medic-signed header and an encrypted
// body. The contract stores both commits but does NOT verify Poseidon on-chain;
// verification is off-chain in the buyer UI. These tests exercise the contract
// shape and the off-chain verification path that ResearcherBuy.tsx mirrors.

const BN254_R = BigInt(
	"21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const SUB_ORDER = jubOrder >> 3n;
const N = 32;
const HEADER_N = 8;
const BYTES_PER_SLOT = 31;
const RS = 0x1e;
const US = 0x1f;

function bytesToBigint(bytes: Uint8Array): bigint {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	return n;
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
	const out = new Uint8Array(len);
	for (let i = len - 1; i >= 0; i--) {
		out[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return out;
}

function encodeFieldsFixed(fields: Record<string, string>, slotCount: number): bigint[] {
	const keys = Object.keys(fields).sort();
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	for (const k of keys) {
		parts.push(enc.encode(k));
		parts.push(new Uint8Array([US]));
		parts.push(enc.encode(String(fields[k])));
		parts.push(new Uint8Array([RS]));
	}
	const totalLen = parts.reduce((s, p) => s + p.length, 0);
	const bytes = new Uint8Array(totalLen);
	let o = 0;
	for (const p of parts) {
		bytes.set(p, o);
		o += p.length;
	}
	const plaintext: bigint[] = new Array(slotCount).fill(0n);
	plaintext[0] = BigInt(totalLen);
	for (let i = 0; i < slotCount - 1; i++) {
		const start = i * BYTES_PER_SLOT;
		if (start >= totalLen) break;
		const end = Math.min(start + BYTES_PER_SLOT, totalLen);
		plaintext[i + 1] = bytesToBigint(bytes.subarray(start, end));
	}
	return plaintext;
}

function encodeBody(fields: Record<string, string>): bigint[] {
	return encodeFieldsFixed(fields, N);
}

function encodeHeader(header: Header): bigint[] {
	return encodeFieldsFixed(
		{
			title: header.title,
			recordType: header.recordType,
			recordedAt: String(header.recordedAt),
			facility: header.facility,
		},
		HEADER_N,
	);
}

function decodeBody(plaintext: bigint[]): Record<string, string> {
	const totalLen = Number(plaintext[0]);
	const bytes = new Uint8Array(totalLen);
	let remaining = totalLen;
	for (let i = 0; i < N - 1 && remaining > 0; i++) {
		const chunk = Math.min(BYTES_PER_SLOT, remaining);
		const slot = bigintToBytes(plaintext[i + 1], BYTES_PER_SLOT);
		bytes.set(slot.subarray(BYTES_PER_SLOT - chunk), i * BYTES_PER_SLOT);
		remaining -= chunk;
	}
	const dec = new TextDecoder("utf-8", { fatal: true });
	const fields: Record<string, string> = {};
	let start = 0;
	while (start < totalLen) {
		let end = start;
		while (end < totalLen && bytes[end] !== RS) end++;
		if (end === start) break;
		let us = start;
		while (us < end && bytes[us] !== US) us++;
		fields[dec.decode(bytes.subarray(start, us))] = dec.decode(bytes.subarray(us + 1, end));
		start = end + 1;
	}
	return fields;
}

function hashChain32(inputs: bigint[]): bigint {
	const h1 = poseidon16(inputs.slice(0, 16));
	const h2 = poseidon16(inputs.slice(16, 32));
	return poseidon2([h1, h2]);
}

function hashChain8(inputs: bigint[]): bigint {
	return poseidon8(inputs);
}

interface Header {
	title: string;
	recordType: string;
	recordedAt: bigint;
	facility: string;
}

function headerTuple(h: Header): [string, string, bigint, string] {
	return [h.title, h.recordType, h.recordedAt, h.facility];
}

function deterministicScalar(seed: number): bigint {
	// Deterministic per-test BabyJubJub scalar so failures are reproducible.
	let n = BigInt(seed);
	for (let i = 0; i < 8; i++) n = (n * 2654435761n + 0x9e3779b97f4a7c15n) & ((1n << 256n) - 1n);
	return n % SUB_ORDER;
}

function encryptForBuyer(
	plaintext: bigint[],
	pkBuyer: readonly [bigint, bigint],
	nonce: bigint,
	ephSk: bigint,
): { ephPk: [bigint, bigint]; ciphertext: bigint[]; ciphertextHash: bigint } {
	const ephPkPoint = mulPointEscalar(Base8, ephSk);
	const ephPk: [bigint, bigint] = [ephPkPoint[0], ephPkPoint[1]];
	const sharedPoint = mulPointEscalar([pkBuyer[0], pkBuyer[1]], ephSk);
	const ciphertext = plaintext.map(
		(p, i) => (p + poseidon4([sharedPoint[0], sharedPoint[1], nonce, BigInt(i)])) % BN254_R,
	);
	const ciphertextHash = hashChain32(ciphertext);
	return { ephPk, ciphertext, ciphertextHash };
}

function decryptForBuyer(
	ephPk: readonly [bigint, bigint],
	ciphertext: bigint[],
	skBuyer: bigint,
	nonce: bigint,
): Record<string, string> {
	const sharedPoint = mulPointEscalar([ephPk[0], ephPk[1]], skBuyer);
	const plaintext = ciphertext.map(
		(c, i) =>
			(c - poseidon4([sharedPoint[0], sharedPoint[1], nonce, BigInt(i)]) + BN254_R) % BN254_R,
	);
	return decodeBody(plaintext);
}

describe("MedicalMarket Phase 5.2 (escrow + signal, off-chain crypto)", function () {
	const header: Header = {
		title: "Blood Panel Q1 2025",
		recordType: "CBC",
		recordedAt: 1_711_987_200n, // 2024-04-01
		facility: "Clinica Polyclinic — BA",
	};
	const price = 1_000_000n;
	const exampleRecord: Record<string, string> = {
		patientId: "PAT-2024-0047",
		bloodType: "A+",
		hba1c: "7.4",
		country: "FI",
	};
	const plaintext = encodeBody(exampleRecord);
	const bodyCommit = hashChain32(plaintext);
	const headerCommit = hashChain8(encodeHeader(header));
	// recordCommit is what the medic signs off-chain (verified in the UI).
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const _recordCommitForSigning = poseidon2([headerCommit, bodyCommit]);
	// Dummy non-zero medic sig values — the contract only enforces non-zero,
	// not signature validity. Real signatures are produced by MedicSign.tsx
	// using @zk-kit/eddsa-poseidon and verified off-chain by the buyer.
	const medicPkX = 1n;
	const medicPkY = 2n;
	const sigR8x = 3n;
	const sigR8y = 4n;
	const sigS = 5n;

	const skBuyer = deterministicScalar(1);
	const pkBuyerPoint = mulPointEscalar(Base8, skBuyer);
	const pkBuyerX = pkBuyerPoint[0];
	const pkBuyerY = pkBuyerPoint[1];

	const ephSk = deterministicScalar(2);

	async function deployFixture() {
		const [patient, researcher] = await hre.viem.getWalletClients();
		const market = await hre.viem.deployContract("MedicalMarket");
		return { market, patient, researcher };
	}

	async function deployWithOrder() {
		const ctx = await deployFixture();
		const { market, patient, researcher } = ctx;
		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				price,
			],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([0n, pkBuyerX, pkBuyerY], {
			account: researcher.account,
			value: price,
		});
		return ctx;
	}

	it("createListing + placeBuyOrder + fulfill (golden path with researcher decrypt)", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const publicClient = await hre.viem.getPublicClient();

		const orderId = 0n;
		const { ephPk, ciphertext, ciphertextHash } = encryptForBuyer(
			plaintext,
			[pkBuyerX, pkBuyerY],
			orderId,
			ephSk,
		);

		await market.write.fulfill([orderId, ephPk[0], ephPk[1], ciphertextHash], {
			account: patient.account,
		});

		const order = await market.read.getOrder([orderId]);
		expect(order[3]).to.equal(true); // confirmed

		const fulfillment = await market.read.getFulfillment([orderId]);
		expect(fulfillment[0]).to.equal(ephPk[0]);
		expect(fulfillment[1]).to.equal(ephPk[1]);
		expect(fulfillment[2]).to.equal(ciphertextHash);

		const listing = await market.read.getListing([0n]);
		expect(listing[0]).to.equal(headerCommit);
		expect(listing[1]).to.equal(bodyCommit);
		expect(listing[2]).to.equal(medicPkX);
		expect(listing[3]).to.equal(medicPkY);
		expect(listing[9]).to.equal(false); // active flipped off

		const onchainHeader = await market.read.getListingHeader([0n]);
		expect(onchainHeader[0]).to.equal(header.title);
		expect(onchainHeader[1]).to.equal(header.recordType);
		expect(onchainHeader[2]).to.equal(header.recordedAt);
		expect(onchainHeader[3]).to.equal(header.facility);

		const bal = await publicClient.getBalance({ address: market.address });
		expect(bal).to.equal(0n);

		// Researcher recovers the record using only on-chain ephPk + the
		// off-chain ciphertext bytes + their stored skBuyer.
		const recovered = decryptForBuyer(
			[fulfillment[0], fulfillment[1]],
			ciphertext,
			skBuyer,
			orderId,
		);
		expect(recovered).to.deep.equal(exampleRecord);
	});

	it("bodyCommit recomputed from decrypted plaintext matches the listing", async function () {
		// This is the off-chain check that buyers MUST perform after decrypt to
		// detect a dishonest patient who uploaded garbage to the Statement Store.
		const { market, patient } = await loadFixture(deployWithOrder);
		const orderId = 0n;
		const { ephPk, ciphertext, ciphertextHash } = encryptForBuyer(
			plaintext,
			[pkBuyerX, pkBuyerY],
			orderId,
			ephSk,
		);
		await market.write.fulfill([orderId, ephPk[0], ephPk[1], ciphertextHash], {
			account: patient.account,
		});
		const fulfillment = await market.read.getFulfillment([orderId]);
		const listing = await market.read.getListing([0n]);

		const sharedPoint = mulPointEscalar([fulfillment[0], fulfillment[1]], skBuyer);
		const recoveredPlaintext = ciphertext.map(
			(c, i) =>
				(c - poseidon4([sharedPoint[0], sharedPoint[1], orderId, BigInt(i)]) + BN254_R) %
				BN254_R,
		);
		const recomputedBodyCommit = hashChain32(recoveredPlaintext);
		expect(recomputedBodyCommit).to.equal(listing[1]);
	});

	it("headerCommit recomputed from on-chain fields matches the listing", async function () {
		// This is the pre-purchase UI check: buyer reads header fields from chain,
		// recomputes Poseidon(headerFields), compares to listing.headerCommit, and
		// only then verifies the medic sig over Poseidon2(headerCommit, bodyCommit).
		const { market } = await loadFixture(deployWithOrder);
		const listing = await market.read.getListing([0n]);
		const onchainHeader = await market.read.getListingHeader([0n]);
		const recomputed = hashChain8(
			encodeHeader({
				title: onchainHeader[0],
				recordType: onchainHeader[1],
				recordedAt: onchainHeader[2],
				facility: onchainHeader[3],
			}),
		);
		expect(recomputed).to.equal(listing[0]);
	});

	it("createListing reverts when title is empty", async function () {
		const { market, patient } = await deployFixture();
		try {
			await market.write.createListing(
				[
					headerTuple({ ...header, title: "" }),
					headerCommit,
					bodyCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Title cannot be empty");
		}
	});

	it("createListing reverts when recordType is empty", async function () {
		const { market, patient } = await deployFixture();
		try {
			await market.write.createListing(
				[
					headerTuple({ ...header, recordType: "" }),
					headerCommit,
					bodyCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("recordType cannot be empty");
		}
	});

	it("createListing reverts when headerCommit or bodyCommit is zero", async function () {
		const { market, patient } = await deployFixture();
		try {
			await market.write.createListing(
				[
					headerTuple(header),
					0n,
					bodyCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted on zero headerCommit");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("headerCommit must be non-zero");
		}
		try {
			await market.write.createListing(
				[
					headerTuple(header),
					headerCommit,
					0n,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted on zero bodyCommit");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("bodyCommit must be non-zero");
		}
	});

	it("fulfill reverts when caller is not the patient", async function () {
		const { market, researcher } = await loadFixture(deployWithOrder);
		const orderId = 0n;
		const { ephPk, ciphertextHash } = encryptForBuyer(
			plaintext,
			[pkBuyerX, pkBuyerY],
			orderId,
			ephSk,
		);
		try {
			await market.write.fulfill([orderId, ephPk[0], ephPk[1], ciphertextHash], {
				account: researcher.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Only the patient can fulfill the order");
		}
	});

	it("fulfill reverts on second call (already confirmed)", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const orderId = 0n;
		const { ephPk, ciphertextHash } = encryptForBuyer(
			plaintext,
			[pkBuyerX, pkBuyerY],
			orderId,
			ephSk,
		);
		await market.write.fulfill([orderId, ephPk[0], ephPk[1], ciphertextHash], {
			account: patient.account,
		});
		try {
			await market.write.fulfill([orderId, ephPk[0], ephPk[1], ciphertextHash], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Order already fulfilled");
		}
	});

	it("fulfill reverts on cancelled order", async function () {
		const { market, patient, researcher } = await loadFixture(deployWithOrder);
		await market.write.cancelOrder([0n], { account: researcher.account });
		const orderId = 0n;
		const { ephPk, ciphertextHash } = encryptForBuyer(
			plaintext,
			[pkBuyerX, pkBuyerY],
			orderId,
			ephSk,
		);
		try {
			await market.write.fulfill([orderId, ephPk[0], ephPk[1], ciphertextHash], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Order is cancelled");
		}
	});

	it("fulfill reverts when ciphertextHash is zero", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const { ephPk } = encryptForBuyer(plaintext, [pkBuyerX, pkBuyerY], 0n, ephSk);
		try {
			await market.write.fulfill([0n, ephPk[0], ephPk[1], 0n], { account: patient.account });
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("ciphertextHash must be non-zero");
		}
	});

	it("placeBuyOrder reverts on insufficient payment", async function () {
		const { market, patient, researcher } = await deployFixture();
		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				price,
			],
			{ account: patient.account },
		);
		try {
			await market.write.placeBuyOrder([0n, pkBuyerX, pkBuyerY], {
				account: researcher.account,
				value: price - 1n,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Insufficient payment");
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

	it("outbid: higher offer refunds previous bidder and becomes the active offer", async function () {
		const { market, patient, researcher } = await deployFixture();
		const publicClient = await hre.viem.getPublicClient();
		const [, , researcher2] = await hre.viem.getWalletClients();

		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				price,
			],
			{ account: patient.account },
		);

		// Researcher 1 places the first offer at listing price
		await market.write.placeBuyOrder([0n, pkBuyerX, pkBuyerY], {
			account: researcher.account,
			value: price,
		});
		expect(await market.read.getPendingOrderId([0n])).to.equal(1n); // orderId 0, stored as 1

		// Researcher 2 outbids with a higher amount; researcher 1 gets refunded
		const highBid = price * 2n;
		const sk2 = deterministicScalar(3);
		const pk2 = mulPointEscalar(Base8, sk2);

		const r1BalBefore = await publicClient.getBalance({ address: researcher.account.address });
		await market.write.placeBuyOrder([0n, pk2[0], pk2[1]], {
			account: researcher2.account,
			value: highBid,
		});
		const r1BalAfter = await publicClient.getBalance({ address: researcher.account.address });

		// Researcher 1 received their refund
		expect(r1BalAfter - r1BalBefore).to.equal(price);

		// Old order is cancelled, new order is pending
		const order0 = await market.read.getOrder([0n]);
		expect(order0[4]).to.equal(true); // order 0 cancelled

		const order1 = await market.read.getOrder([1n]);
		expect(order1[3]).to.equal(false); // order 1 not confirmed
		expect(order1[4]).to.equal(false); // order 1 not cancelled
		expect(order1[2]).to.equal(highBid);

		expect(await market.read.getPendingOrderId([0n])).to.equal(2n); // orderId 1, stored as 2

		// Patient can still fulfill order 1
		const { ephPk, ciphertextHash } = encryptForBuyer(plaintext, [pk2[0], pk2[1]], 1n, ephSk);
		await market.write.fulfill([1n, ephPk[0], ephPk[1], ciphertextHash], {
			account: patient.account,
		});
		const order1After = await market.read.getOrder([1n]);
		expect(order1After[3]).to.equal(true); // confirmed
	});

	it("outbid: equal or lower amount reverts", async function () {
		const { market, patient, researcher } = await deployFixture();
		const [, , researcher2] = await hre.viem.getWalletClients();

		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				price,
			],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([0n, pkBuyerX, pkBuyerY], {
			account: researcher.account,
			value: price,
		});

		const sk2 = deterministicScalar(3);
		const pk2 = mulPointEscalar(Base8, sk2);

		// Equal amount should revert
		try {
			await market.write.placeBuyOrder([0n, pk2[0], pk2[1]], {
				account: researcher2.account,
				value: price,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Must outbid current offer");
		}

		// Lower amount should revert
		try {
			await market.write.placeBuyOrder([0n, pk2[0], pk2[1]], {
				account: researcher2.account,
				value: price - 1n,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.match(/Must outbid|Insufficient payment/);
		}
	});

	it("cancelListing succeeds before any order, blocked after", async function () {
		const { market, patient, researcher } = await deployFixture();
		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				price,
			],
			{ account: patient.account },
		);
		await market.write.cancelListing([0n], { account: patient.account });
		const listing = await market.read.getListing([0n]);
		expect(listing[9]).to.equal(false);

		// New listing, then place order, then cancel must fail.
		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				price,
			],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([1n, pkBuyerX, pkBuyerY], {
			account: researcher.account,
			value: price,
		});
		try {
			await market.write.cancelListing([1n], { account: patient.account });
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("pending order");
		}
	});

	describe("shareRecord", function () {
		const skDoctor = deterministicScalar(4);
		const pkDoctorPoint = mulPointEscalar(Base8, skDoctor);
		const doctorPkX = pkDoctorPoint[0];
		const doctorPkY = pkDoctorPoint[1];

		async function deployAndShare() {
			const ctx = await deployFixture();
			const { market, patient } = ctx;
			const shareNonce = 0n;
			const { ephPk, ciphertext, ciphertextHash } = encryptForBuyer(
				plaintext,
				[doctorPkX, doctorPkY],
				shareNonce,
				ephSk,
			);
			await market.write.shareRecord(
				[
					headerTuple(header),
					headerCommit,
					bodyCommit,
					medicPkX,
					medicPkY,
					sigR8x,
					sigR8y,
					sigS,
					doctorPkX,
					doctorPkY,
					ephPk[0],
					ephPk[1],
					ciphertextHash,
				],
				{ account: patient.account },
			);
			return { ...ctx, ephPk, ciphertext, ciphertextHash, shareNonce };
		}

		it("emits RecordShared with the expected fields and lets the doctor decrypt", async function () {
			const publicClient = await hre.viem.getPublicClient();
			const { market, patient, ephPk, ciphertext, ciphertextHash, shareNonce } =
				await deployAndShare();

			const logs = await publicClient.getContractEvents({
				address: market.address,
				abi: market.abi,
				eventName: "RecordShared",
				fromBlock: 0n,
				toBlock: "latest",
			});
			expect(logs.length).to.equal(1);
			const args = logs[0].args as {
				patient: `0x${string}`;
				doctorPkX: bigint;
				doctorPkY: bigint;
				headerCommit: bigint;
				bodyCommit: bigint;
				medicPkX: bigint;
				medicPkY: bigint;
				ephPkX: bigint;
				ephPkY: bigint;
				ciphertextHash: bigint;
				title: string;
				recordType: string;
				recordedAt: bigint;
				facility: string;
			};
			expect(args.patient.toLowerCase()).to.equal(patient.account.address.toLowerCase());
			expect(args.doctorPkX).to.equal(doctorPkX);
			expect(args.doctorPkY).to.equal(doctorPkY);
			expect(args.headerCommit).to.equal(headerCommit);
			expect(args.bodyCommit).to.equal(bodyCommit);
			expect(args.medicPkX).to.equal(medicPkX);
			expect(args.ephPkX).to.equal(ephPk[0]);
			expect(args.ephPkY).to.equal(ephPk[1]);
			expect(args.ciphertextHash).to.equal(ciphertextHash);
			expect(args.title).to.equal(header.title);
			expect(args.recordType).to.equal(header.recordType);
			expect(args.recordedAt).to.equal(header.recordedAt);
			expect(args.facility).to.equal(header.facility);

			// Doctor can decrypt using ephPk from the event + their own skDoctor
			const recovered = decryptForBuyer(
				[ephPk[0], ephPk[1]],
				ciphertext,
				skDoctor,
				shareNonce,
			);
			expect(recovered).to.deep.equal(exampleRecord);
		});

		it("reverts on empty or zero inputs", async function () {
			const { market, patient } = await deployFixture();
			const shareNonce = 0n;
			const { ephPk, ciphertextHash } = encryptForBuyer(
				plaintext,
				[doctorPkX, doctorPkY],
				shareNonce,
				ephSk,
			);

			type ShareArgs = Parameters<typeof market.write.shareRecord>[0];
			const baseArgs: ShareArgs = [
				headerTuple(header),
				headerCommit,
				bodyCommit,
				medicPkX,
				medicPkY,
				sigR8x,
				sigR8y,
				sigS,
				doctorPkX,
				doctorPkY,
				ephPk[0],
				ephPk[1],
				ciphertextHash,
			];

			const cases: { label: string; mutate: (a: ShareArgs) => ShareArgs; msg: string }[] = [
				{
					label: "empty title",
					mutate: (a) =>
						[headerTuple({ ...header, title: "" }), ...a.slice(1)] as ShareArgs,
					msg: "Title cannot be empty",
				},
				{
					label: "empty recordType",
					mutate: (a) =>
						[headerTuple({ ...header, recordType: "" }), ...a.slice(1)] as ShareArgs,
					msg: "recordType cannot be empty",
				},
				{
					label: "empty facility",
					mutate: (a) =>
						[headerTuple({ ...header, facility: "" }), ...a.slice(1)] as ShareArgs,
					msg: "facility cannot be empty",
				},
				{
					label: "zero recordedAt",
					mutate: (a) =>
						[headerTuple({ ...header, recordedAt: 0n }), ...a.slice(1)] as ShareArgs,
					msg: "recordedAt must be non-zero",
				},
				{
					label: "zero headerCommit",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[1] = 0n;
						return n;
					},
					msg: "headerCommit must be non-zero",
				},
				{
					label: "zero bodyCommit",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[2] = 0n;
						return n;
					},
					msg: "bodyCommit must be non-zero",
				},
				{
					label: "zero medicPk",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[3] = 0n;
						n[4] = 0n;
						return n;
					},
					msg: "medicPk must be non-zero",
				},
				{
					label: "zero sigS",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[7] = 0n;
						return n;
					},
					msg: "signature must be non-zero",
				},
				{
					label: "zero doctorPk",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[8] = 0n;
						n[9] = 0n;
						return n;
					},
					msg: "doctorPk must be non-zero",
				},
				{
					label: "zero ephPk",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[10] = 0n;
						n[11] = 0n;
						return n;
					},
					msg: "ephPk must be non-zero",
				},
				{
					label: "zero ciphertextHash",
					mutate: (a) => {
						const n = [...a] as ShareArgs;
						n[12] = 0n;
						return n;
					},
					msg: "ciphertextHash must be non-zero",
				},
			];

			for (const c of cases) {
				try {
					await market.write.shareRecord(c.mutate(baseArgs), {
						account: patient.account,
					});
					expect.fail(`Should have reverted: ${c.label}`);
				} catch (e: unknown) {
					expect((e as Error).message, c.label).to.include(c.msg);
				}
			}
		});
	});
});
