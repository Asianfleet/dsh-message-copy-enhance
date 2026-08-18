import { test, expect } from "vitest";
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
	expect(manifest.dsh.client.platform).toBe("web");
	expect(Array.isArray(manifest.dsh.client.inject)).toBe(true);
	expect(manifest.exports["./client"]).toBe("./dist/client.js");
});

test("package.json declares the bundle patch so `dsh plugin add` activates it", () => {
	expect(manifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
	expect(manifest.exports["."]).toBe("./lib/index.js");
});

test("cordis.patch.yml inserts the loader entry with the package name", () => {
	const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
	expect(patch).toMatch(/- insert:/);
	expect(patch).toMatch(/- id: message-copy-enhance/);
	expect(patch).toMatch(/name: dsh-message-copy-enhance/);
});

test("host entry is a valid (no-op) cordis plugin", async () => {
	const host = await import("../lib/index.js");
	expect(host.name).toBe("dsh-message-copy-enhance");
	expect(typeof host.apply).toBe("function");
	// calling apply with a stub context must not throw
	host.apply({});
});
