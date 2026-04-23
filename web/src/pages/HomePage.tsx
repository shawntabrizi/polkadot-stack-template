import { Link } from "react-router-dom";

export default function HomePage() {
	return (
		<div className="space-y-10 animate-fade-in">
			{/* Hero */}
			<div className="relative space-y-4 pt-2">
				<div className="bg-mesh absolute inset-0 pointer-events-none opacity-40 -z-10" />
				<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-polka-500/10 border border-polka-500/25 text-xs font-medium text-polka-400">
					<span className="w-1.5 h-1.5 rounded-full bg-polka-500 animate-pulse-slow" />
					Phase 5.2 · Live on Paseo Testnet
				</div>
				<h1 className="page-title max-w-2xl">
					Own your medical records.{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Decide who gets to buy.
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-2xl">
					A decentralized marketplace where patients sell medic-signed health records
					directly to researchers. Encrypted to the buyer, settled on Polkadot.
				</p>
				<div className="flex gap-3 pt-1">
					<Link to="/researcher" className="btn-primary">
						Browse listings
					</Link>
					<Link to="/patient" className="btn-secondary">
						I have a record to sell
					</Link>
				</div>
			</div>

			{/* Role cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<FeatureCard
					title="Researcher"
					description="Browse verified listings, place buy offers, and decrypt purchased clinical data."
					link="/researcher"
					accentColor="text-accent-green"
					borderColor="rgba(6, 182, 212, 0.5)"
				/>
				<FeatureCard
					title="Patient"
					description="Publish medic-signed records, set prices, manage listings, track earnings."
					link="/patient"
					accentColor="text-accent-blue"
					borderColor="rgba(76, 194, 255, 0.5)"
				/>
				<FeatureCard
					title="Medic"
					description="Sign patient records with your professional key so they can be sold on the marketplace."
					link="/medic"
					accentColor="text-accent-purple"
					borderColor="rgba(167, 139, 250, 0.5)"
				/>
			</div>

			{/* How it works */}
			<section className="space-y-5">
				<h2 className="section-title">How it works</h2>
				<div className="flex flex-col md:flex-row md:items-stretch gap-3 md:gap-2">
					<FlowStep
						number={1}
						role="Medic"
						action="Signs record with professional key (EdDSA / BabyJubJub)"
						dataLocation="Medic browser"
						textAccent="text-accent-purple"
						bgAccent="bg-accent-purple/10"
						borderLeftColor="rgba(167, 139, 250, 0.5)"
					/>
					<FlowArrow />
					<FlowStep
						number={2}
						role="Patient"
						action="Lists recordCommit + medic signature on-chain"
						dataLocation="Asset Hub"
						textAccent="text-accent-blue"
						bgAccent="bg-accent-blue/10"
						borderLeftColor="rgba(76, 194, 255, 0.5)"
					/>
					<FlowArrow />
					<FlowStep
						number={3}
						role="Researcher"
						action="Places buy order with ECDH pubkey, locks PAS"
						dataLocation="Asset Hub"
						textAccent="text-accent-green"
						bgAccent="bg-accent-green/10"
						borderLeftColor="rgba(6, 182, 212, 0.5)"
					/>
					<FlowArrow />
					<FlowStep
						number={4}
						role="Patient → Researcher"
						action="Encrypts plaintext for buyer, uploads ciphertext"
						dataLocation="Statement Store"
						textAccent="text-accent-orange"
						bgAccent="bg-accent-orange/10"
						borderLeftColor="rgba(251, 146, 60, 0.5)"
					/>
				</div>
			</section>
		</div>
	);
}

function FlowStep({
	number,
	role,
	action,
	dataLocation,
	textAccent,
	bgAccent,
	borderLeftColor,
}: {
	number: number;
	role: string;
	action: string;
	dataLocation: string;
	textAccent: string;
	bgAccent: string;
	borderLeftColor: string;
}) {
	return (
		<div
			className="card card-hover flex-1 min-w-0"
			style={{ borderLeft: `2px solid ${borderLeftColor}` }}
		>
			<div className="flex items-center gap-2 mb-2">
				<span
					className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${bgAccent} ${textAccent}`}
				>
					{number}
				</span>
				<span className={`text-sm font-semibold font-display ${textAccent}`}>{role}</span>
			</div>
			<p className="text-sm text-text-secondary leading-relaxed mb-3">{action}</p>
			<div className="text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
				Data lives at
			</div>
			<span
				className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bgAccent} ${textAccent}`}
			>
				{dataLocation}
			</span>
		</div>
	);
}

function FlowArrow() {
	return (
		<div
			className="flex md:flex-col items-center justify-center px-1 text-text-muted select-none"
			aria-hidden
		>
			<svg className="hidden md:block w-4 h-4 opacity-35" viewBox="0 0 16 16" fill="none">
				<path
					d="M2 8h10M8 4l4 4-4 4"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			<svg className="md:hidden w-4 h-4 opacity-35" viewBox="0 0 16 16" fill="none">
				<path
					d="M8 2v10M4 8l4 4 4-4"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</div>
	);
}

function FeatureCard({
	title,
	description,
	link,
	accentColor,
	borderColor,
}: {
	title: string;
	description: string;
	link: string;
	accentColor: string;
	borderColor: string;
}) {
	return (
		<Link
			to={link}
			className="card card-hover block group"
			style={{ borderLeft: `2px solid ${borderColor}` }}
		>
			<h3 className={`text-lg font-semibold mb-2 font-display ${accentColor}`}>{title}</h3>
			<p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
				{description}
			</p>
		</Link>
	);
}
