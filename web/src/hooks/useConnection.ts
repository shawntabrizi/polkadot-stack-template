import { useCallback, useEffect, useRef } from "react";
import { getClient, disconnectClient } from "./useChain";
import { useChainStore } from "../store/chainStore";

let stackTemplateDescriptorPromise: Promise<
	(typeof import("@polkadot-api/descriptors"))["stack_template"]
> | null = null;

let connectId = 0;

export async function getStackTemplateDescriptor() {
	if (!stackTemplateDescriptorPromise) {
		stackTemplateDescriptorPromise = import("@polkadot-api/descriptors").then(
			({ stack_template }) => stack_template,
		);
	}

	return stackTemplateDescriptorPromise;
}

export function useConnection() {
	const setWsUrl = useChainStore((state) => state.setWsUrl);
	const setConnected = useChainStore((state) => state.setConnected);
	const setBlockNumber = useChainStore((state) => state.setBlockNumber);
	const setPallets = useChainStore((state) => state.setPallets);

	const connect = useCallback(
		async (url: string) => {
			const id = ++connectId;
			setWsUrl(url);
			setConnected(false);
			setBlockNumber(0);
			setPallets({ templatePallet: null, revive: null });

			disconnectClient();

			try {
				const client = getClient(url);
				const descriptor = await getStackTemplateDescriptor();
				const chain = await Promise.race([
					client.getChainSpecData(),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error("Connection timed out")), 10000),
					),
				]);

				if (connectId !== id) return { ok: false, chain: null };

				setConnected(true);

				const api = client.getTypedApi(descriptor);
				const detected = { templatePallet: false, revive: false };

				try {
					await api.query.TemplatePallet.Claims.getEntries();
					detected.templatePallet = true;
				} catch {
					detected.templatePallet = false;
				}

				try {
					await api.constants.Revive.DepositPerByte();
					detected.revive = true;
				} catch {
					detected.revive = false;
				}

				if (connectId !== id) return { ok: false, chain: null };
				setPallets(detected);
				return { ok: true, chain };
			} catch (e) {
				if (connectId !== id) return { ok: false, chain: null };
				setConnected(false);
				setBlockNumber(0);
				setPallets({ templatePallet: false, revive: false });
				throw e;
			}
		},
		[setBlockNumber, setConnected, setPallets, setWsUrl],
	);

	return { connect };
}

export function useConnectionManagement() {
	const wsUrl = useChainStore((state) => state.wsUrl);
	const connected = useChainStore((state) => state.connected);
	const setBlockNumber = useChainStore((state) => state.setBlockNumber);
	const { connect } = useConnection();
	const initialWsUrlRef = useRef(wsUrl);

	useEffect(() => {
		connect(initialWsUrlRef.current).catch(() => {});

		return () => {
			connectId += 1;
			disconnectClient();
		};
	}, [connect]);

	useEffect(() => {
		if (!connected) {
			return;
		}

		const client = getClient(wsUrl);
		const subscription = client.finalizedBlock$.subscribe((block) => {
			setBlockNumber(block.number);
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [connected, setBlockNumber, wsUrl]);
}
