import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { keccak256, encodePacked, bytesToHex, hexToBytes } from "viem";
import { secp256k1 } from "@noble/curves/secp256k1";

// Phase 5.2 — record split into a public medic-signed header and an encrypted
// body. The contract stores both commits but does NOT verify ECDSA on-chain;
// verification is off-chain in the buyer UI. These tests exercise the contract
// shape and the off-chain verification path that ResearcherBuy.tsx mirrors.

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

function encodePii(pii: { patientId: string; dateOfBirth: string }): bigint[] {
	return encodeFieldsFixed(
		{
			patientId: pii.patientId,
			dateOfBirth: pii.dateOfBirth,
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

function serializePlaintext(plaintext: bigint[]): Uint8Array {
	const out = new Uint8Array(N * 32);
	for (let i = 0; i < N; i++) {
		const slot = bigintToBytes(plaintext[i], 32);
		out.set(slot, i * 32);
	}
	return out;
}

function deserializePlaintext(bytes: Uint8Array): bigint[] {
	const result: bigint[] = [];
	for (let i = 0; i < N; i++) {
		result.push(bytesToBigint(bytes.subarray(i * 32, i * 32 + 32)));
	}
	return result;
}

function hashFieldElements(inputs: bigint[]): bigint {
	const types = inputs.map(() => "uint256" as const);
	return BigInt(keccak256(encodePacked(types, inputs)));
}

function hashChain32(inputs: bigint[]): bigint {
	if (inputs.length !== N) throw new Error(`expected ${N} inputs`);
	return hashFieldElements(inputs);
}

function hashChain8(inputs: bigint[]): bigint {
	if (inputs.length !== HEADER_N) throw new Error(`expected ${HEADER_N} inputs`);
	return hashFieldElements(inputs);
}

function pubKeyToAddress(compressedPk: Uint8Array): `0x${string}` {
	const uncompressed = secp256k1.Point.fromBytes(compressedPk).toBytes(false);
	const hash = keccak256(uncompressed.slice(1));
	return `0x${hash.slice(-40)}` as `0x${string}`;
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

function deterministicPrivKey(seed: number): Uint8Array {
	const sk = new Uint8Array(32);
	sk[31] = seed;
	return sk;
}

async function encryptForBuyer(
	plaintext: bigint[],
	pkBuyer: Uint8Array,
	ephSk: Uint8Array,
): Promise<{ ephPk: Uint8Array; ciphertextBytes: Uint8Array }> {
	const ephPk = secp256k1.getPublicKey(ephSk, true); // 33 bytes compressed
	const sharedRaw = secp256k1.getSharedSecret(ephSk, pkBuyer, true);
	const sharedX = Buffer.from(sharedRaw.slice(1)); // 32-byte x-coordinate

	const aesKey = await crypto.subtle.importKey("raw", sharedX, "AES-GCM", false, ["encrypt"]);
	const iv = new Uint8Array(12); // deterministic zeros for tests
	const plainBytes = Buffer.from(serializePlaintext(plaintext));
	const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plainBytes);

	const ciphertextBytes = new Uint8Array(12 + encrypted.byteLength);
	ciphertextBytes.set(iv, 0);
	ciphertextBytes.set(new Uint8Array(encrypted), 12);

	return { ephPk, ciphertextBytes };
}

async function decryptForBuyer(
	ephPk: Uint8Array,
	ciphertextBytes: Uint8Array,
	skBuyer: Uint8Array,
): Promise<Record<string, string>> {
	const iv = ciphertextBytes.slice(0, 12);
	const ctBytes = ciphertextBytes.slice(12);

	const sharedRaw = secp256k1.getSharedSecret(skBuyer, ephPk, true);
	const sharedX = Buffer.from(sharedRaw.slice(1));

	const aesKey = await crypto.subtle.importKey("raw", sharedX, "AES-GCM", false, ["decrypt"]);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		aesKey,
		Buffer.from(ctBytes),
	);

	const plaintext = deserializePlaintext(new Uint8Array(decrypted));
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
		bloodType: "A+",
		hba1c: "7.4",
		country: "FI",
	};
	const plaintext = encodeBody(exampleRecord);
	const bodyCommit = hashChain32(plaintext);
	const headerCommit = hashChain8(encodeHeader(header));
	const piiCommit = hashChain8(
		encodePii({ patientId: "PAT-2024-0047", dateOfBirth: "1982-03-15" }),
	);

	// Dummy 65-byte medic signature — contract only checks length == 65.
	// Real signatures are produced by MedicSign.tsx using EIP-191 personal_sign.
	const medicSig = `0x${"01".repeat(65)}` as `0x${string}`;

	const skBuyer = deterministicPrivKey(1);
	const pkBuyer = secp256k1.getPublicKey(skBuyer, true); // 33 bytes compressed
	const pkBuyerHex = bytesToHex(pkBuyer);

	const ephSk = deterministicPrivKey(2);

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
				piiCommit,
				patient.account.address, // medicAddress (non-zero, contract doesn't verify sig)
				medicSig,
				price,
			],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([0n, pkBuyerHex], {
			account: researcher.account,
			value: price,
		});
		return ctx;
	}

	it("createListing + placeBuyOrder + fulfill (golden path with researcher decrypt)", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const publicClient = await hre.viem.getPublicClient();

		const orderId = 0n;
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkBuyer, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));

		await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
			account: patient.account,
		});

		const order = (await market.read.getOrder([orderId])) as [
			bigint,
			string,
			bigint,
			boolean,
			boolean,
			`0x${string}`,
		];
		expect(order[3]).to.equal(true); // confirmed

		const fulfillment = (await market.read.getFulfillment([orderId])) as [
			`0x${string}`,
			bigint,
		];
		expect(fulfillment[0]).to.equal(ephPkHex);
		expect(fulfillment[1]).to.equal(ciphertextHashBig);

		const listing = await market.read.getListing([0n]);
		expect(listing[0]).to.equal(headerCommit);
		expect(listing[1]).to.equal(bodyCommit);
		expect(listing[2]).to.equal(piiCommit);
		expect(listing[7]).to.equal(false); // active flipped off

		const onchainHeader = await market.read.getListingHeader([0n]);
		expect(onchainHeader[0]).to.equal(header.title);
		expect(onchainHeader[1]).to.equal(header.recordType);
		expect(onchainHeader[2]).to.equal(header.recordedAt);
		expect(onchainHeader[3]).to.equal(header.facility);

		const bal = await publicClient.getBalance({ address: market.address });
		expect(bal).to.equal(0n);

		// Researcher recovers the record using the ephPk from on-chain + their skBuyer.
		const ephPkBytes = hexToBytes(fulfillment[0] as `0x${string}`);
		const recovered = await decryptForBuyer(ephPkBytes, ciphertextBytes, skBuyer);
		expect(recovered).to.deep.equal(exampleRecord);
	});

	it("bodyCommit recomputed from decrypted plaintext matches the listing", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const orderId = 0n;
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkBuyer, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));
		await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
			account: patient.account,
		});
		const fulfillment = await market.read.getFulfillment([orderId]);
		const listing = await market.read.getListing([0n]);

		const ephPkBytes = hexToBytes(fulfillment[0] as `0x${string}`);
		const fields = await decryptForBuyer(ephPkBytes, ciphertextBytes, skBuyer);
		const recoveredPlaintext = encodeBody(fields);
		const recomputedBodyCommit = hashChain32(recoveredPlaintext);
		expect(recomputedBodyCommit).to.equal(listing[1]);
	});

	it("headerCommit recomputed from on-chain fields matches the listing", async function () {
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
					piiCommit,
					patient.account.address,
					medicSig,
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
					piiCommit,
					patient.account.address,
					medicSig,
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
					piiCommit,
					patient.account.address,
					medicSig,
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
					piiCommit,
					patient.account.address,
					medicSig,
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted on zero bodyCommit");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("bodyCommit must be non-zero");
		}
	});

	it("createListing reverts on invalid medicSignature length", async function () {
		const { market, patient } = await deployFixture();
		try {
			await market.write.createListing(
				[
					headerTuple(header),
					headerCommit,
					bodyCommit,
					piiCommit,
					patient.account.address,
					`0x${"01".repeat(64)}` as `0x${string}`, // 64 bytes — must be 65
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("medicSignature must be 65 bytes");
		}
	});

	it("fulfill reverts when caller is not the patient", async function () {
		const { market, researcher } = await loadFixture(deployWithOrder);
		const orderId = 0n;
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkBuyer, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));
		try {
			await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
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
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkBuyer, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));
		await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
			account: patient.account,
		});
		try {
			await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
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
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkBuyer, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));
		try {
			await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
				account: patient.account,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Order is cancelled");
		}
	});

	it("fulfill reverts when ciphertextHash is zero", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const ephPk = secp256k1.getPublicKey(ephSk, true);
		const ephPkHex = bytesToHex(ephPk);
		try {
			await market.write.fulfill([0n, ephPkHex, 0n], { account: patient.account });
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
				piiCommit,
				patient.account.address,
				medicSig,
				price,
			],
			{ account: patient.account },
		);
		try {
			await market.write.placeBuyOrder([0n, pkBuyerHex], {
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
				piiCommit,
				patient.account.address,
				medicSig,
				price,
			],
			{ account: patient.account },
		);

		await market.write.placeBuyOrder([0n, pkBuyerHex], {
			account: researcher.account,
			value: price,
		});
		expect(await market.read.getPendingOrderId([0n])).to.equal(1n); // orderId 0, stored as 1

		const highBid = price * 2n;
		const sk2 = deterministicPrivKey(3);
		const pk2 = secp256k1.getPublicKey(sk2, true);
		const pk2Hex = bytesToHex(pk2);

		const r1BalBefore = await publicClient.getBalance({ address: researcher.account.address });
		await market.write.placeBuyOrder([0n, pk2Hex], {
			account: researcher2.account,
			value: highBid,
		});
		const r1BalAfter = await publicClient.getBalance({ address: researcher.account.address });

		expect(r1BalAfter - r1BalBefore).to.equal(price);

		const order0 = await market.read.getOrder([0n]);
		expect(order0[4]).to.equal(true); // order 0 cancelled

		const order1 = await market.read.getOrder([1n]);
		expect(order1[3]).to.equal(false); // order 1 not confirmed
		expect(order1[4]).to.equal(false); // order 1 not cancelled
		expect(order1[2]).to.equal(highBid);

		expect(await market.read.getPendingOrderId([0n])).to.equal(2n); // orderId 1, stored as 2

		// Patient receives the full winning bid
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pk2, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));

		const patientBalBefore = await publicClient.getBalance({
			address: patient.account.address,
		});
		const fulfillTx = await market.write.fulfill([1n, ephPkHex, ciphertextHashBig], {
			account: patient.account,
		});
		const receipt = await publicClient.getTransactionReceipt({ hash: fulfillTx });
		const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
		const patientBalAfter = await publicClient.getBalance({ address: patient.account.address });
		expect(patientBalAfter - patientBalBefore + gasCost).to.equal(highBid);

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
				piiCommit,
				patient.account.address,
				medicSig,
				price,
			],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([0n, pkBuyerHex], {
			account: researcher.account,
			value: price,
		});

		const sk2 = deterministicPrivKey(3);
		const pk2 = secp256k1.getPublicKey(sk2, true);
		const pk2Hex = bytesToHex(pk2);

		try {
			await market.write.placeBuyOrder([0n, pk2Hex], {
				account: researcher2.account,
				value: price,
			});
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("Must outbid current offer");
		}

		try {
			await market.write.placeBuyOrder([0n, pk2Hex], {
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
				piiCommit,
				patient.account.address,
				medicSig,
				price,
			],
			{ account: patient.account },
		);
		await market.write.cancelListing([0n], { account: patient.account });
		const listing = await market.read.getListing([0n]);
		expect(listing[7]).to.equal(false); // active

		await market.write.createListing(
			[
				headerTuple(header),
				headerCommit,
				bodyCommit,
				piiCommit,
				patient.account.address,
				medicSig,
				price,
			],
			{ account: patient.account },
		);
		await market.write.placeBuyOrder([1n, pkBuyerHex], {
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

	it("getListing returns piiCommit", async function () {
		const { market } = await loadFixture(deployWithOrder);
		const listing = await market.read.getListing([0n]);
		expect(listing[2]).to.equal(piiCommit);
	});

	it("ListingCreated event includes piiCommit", async function () {
		const { market } = await loadFixture(deployWithOrder);
		const publicClient = await hre.viem.getPublicClient();
		const logs = await publicClient.getContractEvents({
			address: market.address,
			abi: market.abi,
			eventName: "ListingCreated",
			fromBlock: 0n,
			toBlock: "latest",
		});
		expect(logs.length).to.equal(1);
		const args = logs[0].args as {
			piiCommit: bigint;
			headerCommit: bigint;
			bodyCommit: bigint;
		};
		expect(args.piiCommit).to.equal(piiCommit);
		expect(args.headerCommit).to.equal(headerCommit);
		expect(args.bodyCommit).to.equal(bodyCommit);
	});

	it("createListing reverts on zero piiCommit", async function () {
		const { market, patient } = await deployFixture();
		try {
			await market.write.createListing(
				[
					headerTuple(header),
					headerCommit,
					bodyCommit,
					0n,
					patient.account.address,
					medicSig,
					price,
				],
				{ account: patient.account },
			);
			expect.fail("Should have reverted");
		} catch (e: unknown) {
			expect((e as Error).message).to.include("piiCommit must be non-zero");
		}
	});

	it("body does not contain patientId or dateOfBirth", async function () {
		const { market, patient } = await loadFixture(deployWithOrder);
		const orderId = 0n;
		const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkBuyer, ephSk);
		const ephPkHex = bytesToHex(ephPk);
		const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));
		await market.write.fulfill([orderId, ephPkHex, ciphertextHashBig], {
			account: patient.account,
		});
		const fulfillment = await market.read.getFulfillment([orderId]);
		const ephPkBytes = hexToBytes(fulfillment[0] as `0x${string}`);
		const recovered = await decryptForBuyer(ephPkBytes, ciphertextBytes, skBuyer);
		expect(Object.keys(recovered)).to.not.include("patientId");
		expect(Object.keys(recovered)).to.not.include("dateOfBirth");
		expect(recovered["bloodType"]).to.equal(exampleRecord["bloodType"]);
		expect(recovered["hba1c"]).to.equal(exampleRecord["hba1c"]);
	});

	describe("shareRecord", function () {
		const skDoctor = deterministicPrivKey(4);
		const pkDoctor = secp256k1.getPublicKey(skDoctor, true);
		const pkDoctorHex = bytesToHex(pkDoctor);
		const doctorAddress = pubKeyToAddress(pkDoctor);

		async function deployAndShare() {
			const ctx = await deployFixture();
			const { market, patient } = ctx;
			const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkDoctor, ephSk);
			const ephPkHex = bytesToHex(ephPk);
			const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));
			await market.write.shareRecord(
				[
					headerTuple(header),
					headerCommit,
					bodyCommit,
					piiCommit,
					patient.account.address, // medicAddress
					medicSig,
					doctorAddress,
					ephPkHex,
					ciphertextHashBig,
				],
				{ account: patient.account },
			);
			return { ...ctx, ephPk, ciphertextBytes, ciphertextHashBig };
		}

		it("emits RecordShared with the expected fields and lets the doctor decrypt", async function () {
			const publicClient = await hre.viem.getPublicClient();
			const { market, patient, ephPk, ciphertextBytes, ciphertextHashBig } =
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
				doctorAddress: `0x${string}`;
				headerCommit: bigint;
				bodyCommit: bigint;
				piiCommit: bigint;
				medicAddress: `0x${string}`;
				ephPubKey: `0x${string}`;
				ciphertextHash: bigint;
				title: string;
				recordType: string;
				recordedAt: bigint;
				facility: string;
			};
			expect(args.patient.toLowerCase()).to.equal(patient.account.address.toLowerCase());
			expect(args.doctorAddress.toLowerCase()).to.equal(doctorAddress.toLowerCase());
			expect(args.headerCommit).to.equal(headerCommit);
			expect(args.bodyCommit).to.equal(bodyCommit);
			expect(args.piiCommit).to.equal(piiCommit);
			expect(args.ciphertextHash).to.equal(ciphertextHashBig);
			expect(args.title).to.equal(header.title);
			expect(args.recordType).to.equal(header.recordType);
			expect(args.recordedAt).to.equal(header.recordedAt);
			expect(args.facility).to.equal(header.facility);

			// Doctor can decrypt using ephPk from event + their skDoctor
			void pkDoctorHex;
			const ephPkHex = bytesToHex(ephPk);
			const ephPkFromEvent = hexToBytes(args.ephPubKey ?? ephPkHex);
			const recovered = await decryptForBuyer(ephPkFromEvent, ciphertextBytes, skDoctor);
			expect(recovered).to.deep.equal(exampleRecord);
		});

		it("reverts on empty or zero inputs", async function () {
			const { market, patient } = await deployFixture();
			const { ephPk, ciphertextBytes } = await encryptForBuyer(plaintext, pkDoctor, ephSk);
			const ephPkHex = bytesToHex(ephPk);
			const ciphertextHashBig = BigInt(keccak256(bytesToHex(ciphertextBytes)));

			type ShareArgs = Parameters<typeof market.write.shareRecord>[0];
			const base: ShareArgs = [
				headerTuple(header), // [0]
				headerCommit, // [1]
				bodyCommit, // [2]
				piiCommit, // [3]
				patient.account.address, // [4] medicAddress
				medicSig, // [5] medicSignature
				doctorAddress, // [6] doctorAddress
				ephPkHex, // [7] ephPubKey
				ciphertextHashBig, // [8] ciphertextHash
			];

			const cases: { label: string; args: ShareArgs; msg: string }[] = [
				{
					label: "empty title",
					args: [headerTuple({ ...header, title: "" }), ...base.slice(1)] as ShareArgs,
					msg: "Title cannot be empty",
				},
				{
					label: "empty recordType",
					args: [
						headerTuple({ ...header, recordType: "" }),
						...base.slice(1),
					] as ShareArgs,
					msg: "recordType cannot be empty",
				},
				{
					label: "empty facility",
					args: [headerTuple({ ...header, facility: "" }), ...base.slice(1)] as ShareArgs,
					msg: "facility cannot be empty",
				},
				{
					label: "zero recordedAt",
					args: [
						headerTuple({ ...header, recordedAt: 0n }),
						...base.slice(1),
					] as ShareArgs,
					msg: "recordedAt must be non-zero",
				},
				{
					label: "zero headerCommit",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[1] = 0n;
						return a;
					})(),
					msg: "headerCommit must be non-zero",
				},
				{
					label: "zero bodyCommit",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[2] = 0n;
						return a;
					})(),
					msg: "bodyCommit must be non-zero",
				},
				{
					label: "zero piiCommit",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[3] = 0n;
						return a;
					})(),
					msg: "piiCommit must be non-zero",
				},
				{
					label: "zero medicAddress",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[4] = "0x0000000000000000000000000000000000000000";
						return a;
					})(),
					msg: "medicAddress must be non-zero",
				},
				{
					label: "wrong medicSignature length",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[5] = `0x${"01".repeat(64)}` as `0x${string}`; // 64 bytes instead of 65
						return a;
					})(),
					msg: "medicSignature must be 65 bytes",
				},
				{
					label: "zero doctorAddress",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[6] = "0x0000000000000000000000000000000000000000";
						return a;
					})(),
					msg: "doctorAddress must be non-zero",
				},
				{
					label: "wrong ephPubKey length",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[7] = `0x${"02".repeat(32)}` as `0x${string}`; // 32 bytes instead of 33
						return a;
					})(),
					msg: "ephPubKey must be 33 bytes",
				},
				{
					label: "zero ciphertextHash",
					args: (() => {
						const a = [...base] as ShareArgs;
						a[8] = 0n;
						return a;
					})(),
					msg: "ciphertextHash must be non-zero",
				},
			];

			for (const c of cases) {
				try {
					await market.write.shareRecord(c.args, { account: patient.account });
					expect.fail(`Should have reverted: ${c.label}`);
				} catch (e: unknown) {
					expect((e as Error).message, c.label).to.include(c.msg);
				}
			}
		});
	});
});
