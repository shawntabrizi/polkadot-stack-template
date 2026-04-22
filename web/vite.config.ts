import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

export default defineConfig({
	base: "./",
	plugins: [react(), wasm()],
	server: {
		allowedHosts: "all",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		target: "esnext",
		chunkSizeWarningLimit: 700,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (
						id.includes("/node_modules/react/") ||
						id.includes("/node_modules/react-dom/") ||
						id.includes("/node_modules/react-router") ||
						id.includes("/node_modules/scheduler/")
					) {
						return "react-vendor";
					}
					if (
						id.includes("/node_modules/polkadot-api/") ||
						id.includes("/node_modules/@polkadot-api/")
					) {
						return "papi-vendor";
					}
				},
			},
		},
	},
	optimizeDeps: {
		// verifiablejs uses static WASM imports — exclude from pre-bundling
		// so vite-plugin-wasm can handle it correctly at build time.
		exclude: ["verifiablejs", "snarkjs"],
	},
});
