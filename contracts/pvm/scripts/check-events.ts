import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { stack_template } from "@polkadot-api/descriptors";

async function main() {
	const blockHash = process.argv[2];
	if (!blockHash) {
		console.error("Usage: check-events.ts <blockHash>");
		process.exit(1);
	}

	const client = createClient(withPolkadotSdkCompat(getWsProvider("ws://127.0.0.1:10044")));
	const api = client.getTypedApi(stack_template);

	const events = await api.query.System.Events.getValue({ at: blockHash });
	for (const e of events) {
		const name = `${e.event.type}.${(e.event.value as { type: string }).type}`;
		if (
			name.includes("Multisig") ||
			name.includes("ExtrinsicFailed") ||
			name.includes("Revive") ||
			name.includes("Medic")
		) {
			console.log(
				name,
				JSON.stringify(
					e.event.value,
					(k, v) => (typeof v === "bigint" ? v.toString() : v),
					2,
				),
			);
		}
	}

	client.destroy();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
