import { useEffect } from "react";

interface ToastProps {
	message: string | null;
	onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
	const isError = message?.startsWith("Error") ?? false;
	const delay = isError ? 8000 : 4000;

	useEffect(() => {
		if (!message) return;
		const t = setTimeout(onClose, delay);
		return () => clearTimeout(t);
	}, [message, delay, onClose]);

	if (!message) return null;

	return (
		<div
			className={`fixed bottom-6 right-6 z-50 max-w-sm w-full pointer-events-auto
				rounded-lg border p-4 shadow-xl
				flex items-start gap-3
				transition-all duration-300
				${isError ? "bg-surface-card border-red-500/60 text-red-400" : "bg-surface-card border-accent-green/60 text-accent-green"}`}
		>
			<span className="text-lg leading-none select-none">{isError ? "✗" : "✓"}</span>
			<p className="flex-1 text-sm font-mono break-all leading-relaxed">{message}</p>
			<button
				onClick={onClose}
				className="shrink-0 text-text-muted hover:text-text-primary transition-colors text-lg leading-none"
				aria-label="Dismiss"
			>
				×
			</button>
		</div>
	);
}
