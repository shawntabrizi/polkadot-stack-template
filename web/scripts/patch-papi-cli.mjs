/* eslint-env node */
/**
 * Patches @polkadot-api/cli@0.18.1 to fix two TS compilation errors that
 * prevent generated.json from being updated (causing papi to re-run codegen
 * on every startup):
 *   1. TS5107: moduleResolution=node10 deprecated → switch to "bundler" (compatible with
 *      module: "esnext" and allows bare imports without .js extensions)
 *   2. TS7053: implicit any on metadatas[codeHash] → noImplicitAny: false
 *
 * Applied automatically via the "postinstall" npm script.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(
	__dirname,
	"../node_modules/@polkadot-api/cli/dist/chunk-UMZZTPR7.js",
);

let src;
try {
	src = readFileSync(target, "utf8");
} catch {
	// CLI not installed yet — nothing to patch
	process.exit(0);
}

const patched = src
	// "node" is deprecated as node10 in TS 5.x; "bundler" works with module: "esnext"
	// and doesn't require explicit .js extensions on relative imports.
	.replace('moduleResolution: "node",', 'moduleResolution: "bundler", noImplicitAny: false,')
	// Already patched to node16 on a prior (wrong) run — fix that too.
	.replace(
		'moduleResolution: "node16", ignoreDeprecations: "5.0", noImplicitAny: false,',
		'moduleResolution: "bundler", noImplicitAny: false,',
	);

if (patched === src) {
	// Already patched or file changed — skip silently
	process.exit(0);
}

writeFileSync(target, patched, "utf8");
console.log("[patch-papi-cli] Applied moduleResolution + noImplicitAny patch to @polkadot-api/cli");
