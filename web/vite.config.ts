import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
	base: "./",
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		target: "esnext",
	},
	// Several @polkadot-apps/* packages use top-level await; bump the dev-mode
	// dep-optimization target so Vite's pre-bundler accepts it.
	optimizeDeps: {
		esbuildOptions: {
			target: "esnext",
		},
	},
});
