/**
 * Build script: compiles the TypeScript client sources and assembles
 * `dist/client.js` — the browser bundle DSH's client module loader expects.
 *
 * DSH client bundles are classic scripts that register themselves with
 * `window.__ModuleLoader__.load({ id, factory })`; the factory receives a
 * CommonJS-ish `require` for the few shared modules the loader graph already
 * knows (react, @deepseek-ai/cordis, …). This plugin is dependency-free, so
 * the build only needs to inline the two compiled ESM files into the factory
 * closure and strip their `import`/`export` statements.
 *
 * Pipeline: `tsc -p tsconfig.build.json` emits `src/client/*.ts` →
 * `.tsc/client/*.js` (types erased, runtime code untouched), then the emitted
 * modules are inlined into the factory and the intermediate dir is removed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".tsc");
const distDir = join(root, "dist");

const ID = "dsh-message-copy-enhance";

// 1. Compile TypeScript → ESM JavaScript (tsconfig.build.json: src/client → .tsc/client).
//    Throws (non-zero exit) on type errors — the build must not ship broken types.
execFileSync(
	process.execPath,
	[join(root, "node_modules", "typescript", "lib", "tsc.js"), "-p", "tsconfig.build.json"],
	{ cwd: root, stdio: "inherit" }
);

/** Strip ESM import/export lines. The compiled source keeps them one-per-line. */
function stripEsm(source) {
	return source
		.split("\n")
		.filter((line) => !/^\s*import\s/.test(line) && !/^\s*export\s*\{/.test(line))
		.map((line) => line.replace(/^export\s+/, ""))
		.join("\n");
}

function wrap(name) {
	return `\n// ---- ${name} ----\n${stripEsm(readFileSync(join(outDir, "client", name), "utf8"))}`;
}

const factory = [
	"window.__ModuleLoader__.load({",
	`\tid: ${JSON.stringify(ID)},`,
	"\tfactory: (require) => {",
	"\t\tvar module = { exports: {} };",
	"\t\tvar exports = module.exports;",
	'\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
	wrap("toMarkdown.js"),
	wrap("index.js"),
	"\t\texports.apply = apply;",
	"\t\texports.inject = inject;",
	"\t\texports.name = name;",
	"\t\treturn module.exports;",
	"\t}",
	"});",
	"",
].join("\n");

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, "client.js"), factory, "utf8");
rmSync(outDir, { recursive: true, force: true });
console.log("wrote dist/client.js");
