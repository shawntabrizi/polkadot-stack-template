import { useState, useEffect } from "react";
import { useMedicAuthority } from "../hooks/useMedicAuthority";

interface VerifiedBadgeProps {
	address: `0x${string}`;
}

export default function VerifiedBadge({ address }: VerifiedBadgeProps) {
	const { isVerifiedMedic, available } = useMedicAuthority();
	const [status, setStatus] = useState<boolean | null>(null);

	useEffect(() => {
		if (!available) return;
		let cancelled = false;
		isVerifiedMedic(address).then((result) => {
			if (!cancelled) setStatus(result);
		});
		return () => {
			cancelled = true;
		};
	}, [address, available, isVerifiedMedic]);

	if (status === null) return null;

	if (status) {
		return (
			<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-green/20 text-accent-green">
				✓ Verified medic
			</span>
		);
	}

	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-yellow/20 text-accent-yellow">
			⚠ Unverified
		</span>
	);
}
