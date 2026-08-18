import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	dsh: {
		client: { platform: string; inject: readonly unknown[] };
		bundle: { patch: string };
	};
	exports: Record<string, string>;
};

test("package.json declares the DSH client plugin contract", () => {
	assert.equal(manifest.dsh.client.platform, "web");
	assert.ok(Array.isArray(manifest.dsh.client.inject));
	assert.equal(manifest.exports["./client"], "./dist/client.js");
});

test("package.json declares the bundle patch so `dsh plugin add` activates it", () => {
	assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
	assert.equal(manifest.exports["."], "./lib/index.js");
});

test("cordis.patch.yml inserts the loader entry with the package name", () => {
	const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
	assert.match(patch, /- insert:/);
	assert.match(patch, /- id: message-copy-enhance/);
	assert.match(patch, /name: dsh-message-copy-enhance/);
});

test("host entry is a valid (no-op) cordis plugin", async () => {
	const host = await import("../lib/index.js");
	assert.equal(host.name, "dsh-message-copy-enhance");
	assert.equal(typeof host.apply, "function");
	// calling apply with a stub context must not throw
	host.apply({});
});
