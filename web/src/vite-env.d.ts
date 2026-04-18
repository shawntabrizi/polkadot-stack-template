/// <reference types="vite/client" />

declare module "snarkjs" {
	interface Groth16Proof {
		pi_a: string[];
		pi_b: string[][];
		pi_c: string[];
		protocol: string;
		curve: string;
	}
	const groth16: {
		fullProve(
			input: Record<string, unknown>,
			wasmFile: string,
			zkeyFileName: string,
		): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
		exportSolidityCallData(proof: Groth16Proof, publicSignals: string[]): Promise<string>;
	};
	export { groth16 };
}

interface ImportMetaEnv {
	readonly VITE_WS_URL?: string;
	readonly VITE_ETH_RPC_URL?: string;
	readonly VITE_LOCAL_WS_URL?: string;
	readonly VITE_LOCAL_ETH_RPC_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
