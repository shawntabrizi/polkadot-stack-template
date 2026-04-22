/**
 * Update deployments.json + web/src/config/deployments.ts from council wallet env vars.
 *
 * Reads VITE_ACCOUNT_0_PK, VITE_ACCOUNT_1_PK, VITE_ACCOUNT_2_PK from web/.env.local,
 * derives their Substrate SS58 addresses (ETH-compatible AccountId32: h160 ++ 0xee*12),
 * recomputes the multisig, and writes both deployment files.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/set-deployments.ts \
 *     [--medical-market 0x...] \
 *     [--medic-authority 0x...] \
 *     [--threshold 2] \
 *     [--ss58-prefix 42]
 *
 * Omit a flag to keep the current value in deployments.json.
 * At minimum, run this after updating web/.env.local with fresh Paseo council keys.
 */

import * as fs from "fs";
import * as path from "path";
import { privateKeyToAccount } from "viem/accounts";
import {
	createKeyMulti,
	encodeAddress,
	cryptoWaitReady,
	sortAddresses,
} from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { keccak256 } from "viem";
import { readDeployments, updateDeployments } from "./_deployments";

const ENV_FILE = path.resolve(__dirname, "../../../web/.env.local");

function parseEnvFile(filePath: string): Record<string, string> {
	if (!fs.existsSync(filePath)) return {};
	const vars: Record<string, string> = {};
	for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const val = trimmed
			.slice(eq + 1)
			.trim()
			.replace(/^["']|["']$/g, "");
		vars[key] = val;
	}
	return vars;
}

/** Convert an H160 hex address to an ETH-compatible Substrate AccountId32. */
function h160ToAccountId32(h160: string): Uint8Array {
	const clean = h160.startsWith("0x") ? h160.slice(2) : h160;
	const bytes = new Uint8Array(32);
	for (let i = 0; i < 20; i++) {
		bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	bytes.fill(0xee, 20);
	return bytes;
}

function argValue(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	return i !== -1 ? argv[i + 1] : undefined;
}

async function main() {
	await cryptoWaitReady();

	const argv = process.argv.slice(2);
	const threshold = parseInt(argValue(argv, "--threshold") ?? "2", 10);
	const ss58Prefix = parseInt(argValue(argv, "--ss58-prefix") ?? "42", 10);
	const newMarket = argValue(argv, "--medical-market");
	const newAuthority = argValue(argv, "--medic-authority");

	const env = parseEnvFile(ENV_FILE);

	const pks = [env.VITE_ACCOUNT_0_PK, env.VITE_ACCOUNT_1_PK, env.VITE_ACCOUNT_2_PK].filter(
		(pk): pk is string => !!pk && pk !== "0x" && pk.length > 2,
	);

	if (pks.length < threshold) {
		console.error(
			`Need at least ${threshold} private keys in web/.env.local (VITE_ACCOUNT_{0,1,2}_PK). Found ${pks.length}.`,
		);
		process.exit(1);
	}

	const signatories = pks.map((pk) => {
		const h160 = privateKeyToAccount(pk as `0x${string}`).address;
		const accountId = h160ToAccountId32(h160);
		return encodeAddress(accountId, ss58Prefix);
	});

	const sorted = sortAddresses(signatories, ss58Prefix);
	const multiAccountId = createKeyMulti(sorted, threshold);
	const multiSs58 = encodeAddress(multiAccountId, ss58Prefix);
	const hash = keccak256(u8aToHex(multiAccountId) as `0x${string}`);
	const h160 = ("0x" + hash.slice(2 + 24)) as `0x${string}`;

	const current = readDeployments();
	const updates: Parameters<typeof updateDeployments>[0] = {
		multisig: { ss58: multiSs58, h160, threshold, signatories: sorted },
	};
	if (newMarket !== undefined) updates.medicalMarket = newMarket;
	if (newAuthority !== undefined) updates.medicAuthority = newAuthority;

	updateDeployments(updates);

	console.log("Deployments updated.");
	console.log("");
	console.log(
		`  MedicalMarket:   ${updates.medicalMarket ?? current.medicalMarket} ${newMarket ? "(updated)" : "(unchanged)"}`,
	);
	console.log(
		`  MedicAuthority:  ${updates.medicAuthority ?? current.medicAuthority} ${newAuthority ? "(updated)" : "(unchanged)"}`,
	);
	console.log("");
	console.log(`  Multisig SS58:   ${multiSs58}`);
	console.log(`  Multisig H160:   ${h160}`);
	console.log(`  Threshold:       ${threshold}-of-${sorted.length}`);
	console.log(`  Signatories (sorted):`);
	for (const s of sorted) console.log(`    - ${s}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
