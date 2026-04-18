import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

export default defineConfig({
	base: "./",
	plugins: [react(), wasm()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		target: "esnext",
	},
	optimizeDeps: {
		// verifiablejs uses static WASM imports — exclude from pre-bundling
		// so vite-plugin-wasm can handle it correctly at build time.
		exclude: ["verifiablejs"],
	},
});
