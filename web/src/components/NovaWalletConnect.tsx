import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { AppAccount } from "../hooks/useAccount";
import { getPappAdapter, getAppAccountFromSession, usePairingStatus } from "../hooks/usePairing";

interface Props {
	/** Called when a Nova Wallet account is paired and ready to sign. */
	onConnected: (account: AppAccount) => void;
	/** Called when the user disconnects — caller should revert to dev/extension accounts. */
	onDisconnected: () => void;
}

/**
 * "Connect Nova Wallet" button + QR code modal.
 *
 * State machine:
 *  none         → show "Connect Nova Wallet" button
 *  initial / attestation → show spinner text
 *  pairing      → show QR code (scan with Nova Wallet mobile)
 *  finished     → show connected state + Disconnect button
 *  pairingError → show error + Retry button
 */
export function NovaWalletConnect({ onConnected, onDisconnected }: Props) {
	const status = usePairingStatus();

	// When pairing finishes, build AppAccount from the first active session.
	useEffect(() => {
		if (status.step !== "finished") return;
		const sessions = getPappAdapter().sessions.sessions.read();
		if (sessions.length > 0) {
			onConnected(getAppAccountFromSession(sessions[0]));
		}
	}, [status.step]); // eslint-disable-line react-hooks/exhaustive-deps

	function startPairing() {
		getPappAdapter().sso.authenticate();
	}

	async function disconnect() {
		const adapter = getPappAdapter();
		const sessions = adapter.sessions.sessions.read();
		for (const session of sessions) {
			await adapter.sessions.disconnect(session);
		}
		onDisconnected();
	}

	if (status.step === "none") {
		return (
			<button className="btn-secondary text-xs" onClick={startPairing}>
				Connect Nova Wallet
			</button>
		);
	}

	if (status.step === "initial" || status.step === "attestation") {
		return <p className="text-text-muted text-xs animate-pulse">Connecting to Nova Wallet…</p>;
	}

	if (status.step === "pairing") {
		return (
			<div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-white/[0.08] bg-white/[0.02]">
				<p className="text-text-secondary text-xs font-medium">Scan with Nova Wallet</p>
				<QRCodeSVG
					value={status.payload}
					size={180}
					bgColor="transparent"
					fgColor="#e0e0e0"
					level="M"
				/>
				<button
					className="text-xs text-text-muted hover:text-text-secondary transition-colors"
					onClick={() => getPappAdapter().sso.abortAuthentication()}
				>
					Cancel
				</button>
			</div>
		);
	}

	if (status.step === "finished") {
		return (
			<div className="flex items-center gap-3">
				<span className="bg-accent-green/10 text-accent-green text-xs font-medium px-1.5 py-0.5 rounded">
					Nova Wallet connected
				</span>
				<button
					className="text-xs text-text-muted hover:text-text-secondary transition-colors"
					onClick={disconnect}
				>
					Disconnect
				</button>
			</div>
		);
	}

	if (status.step === "pairingError") {
		return (
			<div className="flex items-center gap-2">
				<p className="text-accent-red text-xs">{status.message}</p>
				<button className="btn-secondary text-xs" onClick={startPairing}>
					Retry
				</button>
			</div>
		);
	}

	return null;
}
