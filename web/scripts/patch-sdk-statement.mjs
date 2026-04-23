/* eslint-env node */
/**
 * Patches @novasamatech/sdk-statement@0.6.0 `getStatements` to fix a TDZ bug.
 *
 * Upstream source at statement-sdk.js:7 has:
 *
 *   const unsubscribe = api.subscribeStatement(
 *     filter,
 *     (event) => { ...; unsubscribe(); ...},
 *     (error) => { unsubscribe(); reject(error); },
 *   );
 *
 * If `api.subscribeStatement` invokes onMessage synchronously during the call
 * (happens whenever the node flushes cached statements during subscribe — i.e.
 * essentially always on both Paseo People chain and local dev nodes), the
 * handler's `unsubscribe()` hits the `const` in its temporal dead zone and
 * throws `ReferenceError: Cannot access 'unsubscribe' before initialization`.
 *
 * Fix: route the unsubscribe through a ref object the handler closes over,
 * and drain any synchronous completion after the subscribe call returns.
 *
 * See docs/product/POLKADOT_INTEGRATION_GOTCHAS.md #15. Applied automatically
 * via the "postinstall" npm script.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(
	__dirname,
	"../node_modules/@novasamatech/sdk-statement/dist/statement-sdk.js",
);

let src;
try {
	src = readFileSync(target, "utf8");
} catch {
	// SDK not installed yet — nothing to patch
	process.exit(0);
}

const SENTINEL = "/* patched:tdz-unsubscribe */";
if (src.includes(SENTINEL)) {
	process.exit(0);
}

// Match the original arrow-function body verbatim. Using a string anchor so we
// fail loudly if the upstream source changes shape (e.g. new SDK minor).
const ORIGINAL = `const getStatements = (filter = ANY_FILTER) => new Promise((resolve, reject) => {
    const statements = [];
    const unsubscribe = api.subscribeStatement(
      filter,
      (event) => {
        if (event.event === "newStatements") {
          for (const encoded of event.data.statements) {
            try {
              statements.push(statementCodec.dec(encoded));
            } catch (e) {
            }
          }
          if (event.data.remaining === 0 || event.data.remaining === void 0) {
            unsubscribe();
            resolve(statements);
          }
        }
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });`;

const REPLACEMENT = `const getStatements = (filter = ANY_FILTER) => new Promise((resolve, reject) => { ${SENTINEL}
    const statements = [];
    const ref = { unsubscribe: null, done: false };
    const safeUnsub = () => {
      ref.done = true;
      if (ref.unsubscribe) {
        try { ref.unsubscribe(); } catch (_) {}
        ref.unsubscribe = null;
      }
    };
    ref.unsubscribe = api.subscribeStatement(
      filter,
      (event) => {
        if (event.event === "newStatements") {
          for (const encoded of event.data.statements) {
            try { statements.push(statementCodec.dec(encoded)); } catch (e) {}
          }
          if (event.data.remaining === 0 || event.data.remaining === void 0) {
            safeUnsub();
            resolve(statements);
          }
        }
      },
      (error) => { safeUnsub(); reject(error); }
    );
    // If onMessage fired synchronously before ref.unsubscribe was assigned,
    // the handler will have set ref.done=true but couldn't actually unsubscribe.
    // Drain that case now that we have the handle.
    if (ref.done && ref.unsubscribe) {
      try { ref.unsubscribe(); } catch (_) {}
      ref.unsubscribe = null;
    }
  });`;

if (!src.includes(ORIGINAL)) {
	console.error(
		"[patch-sdk-statement] Upstream source shape changed — patch not applied.\n" +
			`  Target: ${target}\n` +
			"  Inspect the file and update scripts/patch-sdk-statement.mjs.",
	);
	process.exit(1);
}

writeFileSync(target, src.replace(ORIGINAL, REPLACEMENT), "utf8");
console.log("[patch-sdk-statement] Applied TDZ-unsubscribe fix to @novasamatech/sdk-statement");
