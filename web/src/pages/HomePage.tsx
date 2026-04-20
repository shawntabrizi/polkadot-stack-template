import { Link } from "react-router-dom";

export default function HomePage() {
	return (
		<div className="space-y-8 animate-fade-in">
			{/* Hero */}
			<div className="relative space-y-3">
				<div className="bg-mesh absolute inset-0 pointer-events-none opacity-40 -z-10" />
				<h1 className="page-title">
					Sell verified medical records.{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Keep your identity private.
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-2xl">
					A decentralized marketplace where patients exchange attested health data for
					payment, without revealing identity or raw records. Powered by zero-knowledge
					proofs on Polkadot.
				</p>
				<div className="flex gap-3 pt-2">
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
				<div
					style={{
						borderLeft: "2px solid rgba(6, 182, 212, 0.45)",
						borderRadius: "16px",
					}}
				>
					<FeatureCard
						title="Researcher"
						description="Browse verified listings, place buy offers, and decrypt purchased clinical data."
						link="/researcher"
						accentColor="text-accent-green"
					/>
				</div>
				<div
					style={{
						borderLeft: "2px solid rgba(76, 194, 255, 0.45)",
						borderRadius: "16px",
					}}
				>
					<FeatureCard
						title="Patient"
						description="Publish attested health records, set disclosure rules, manage listings, track earnings."
						link="/patient"
						accentColor="text-accent-blue"
					/>
				</div>
				<div
					style={{
						borderLeft: "2px solid rgba(167, 139, 250, 0.45)",
						borderRadius: "16px",
					}}
				>
					<FeatureCard
						title="Medic"
						description="Sign patient records with your professional key so they can be sold on the marketplace."
						link="/medic"
						accentColor="text-accent-purple"
					/>
				</div>
			</div>
		</div>
	);
}

function FeatureCard({
	title,
	description,
	link,
	accentColor,
}: {
	title: string;
	description: string;
	link: string;
	accentColor: string;
}) {
	return (
		<a href={`#${link}`} className="card-hover block group">
			<h3 className={`text-lg font-semibold mb-2 font-display ${accentColor}`}>{title}</h3>
			<p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
				{description}
			</p>
		</a>
	);
}
