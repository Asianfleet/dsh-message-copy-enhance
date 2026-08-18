import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import type { Context } from "@deepseek-ai/cordis";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type PageWindow = Window & typeof globalThis;

interface BundleExports {
	apply(ctx: Context): void;
	inject: readonly string[];
	name: string;
}

interface BundlePayload {
	id: string;
	factory: (require: (id: string) => unknown) => BundleExports;
}

interface LoaderWindow extends Window {
	__ModuleLoader__: { load(entry: BundlePayload): void };
}

/**
 * Load dist/client.js the way the DSH web shell does: evaluate it as a
 * classic script inside a page-like global scope, where `window` (with the
 * module loader) and `document` are the live page objects. The factory's
 * `apply` closes over exactly these globals, so the test drives the real
 * bundle against a real (linkedom) DOM.
 */
function loadBundle({ window, document }: { window: PageWindow; document: Document }): BundlePayload {
	const source = readFileSync(join(root, "dist", "client.js"), "utf8");
	let payload: BundlePayload | null = null;
	(window as unknown as LoaderWindow).__ModuleLoader__ = {
		load(entry) {
			payload = entry;
		}
	};
	const sandbox = { window, document, Node: window.Node, console };
	vm.runInNewContext(source, sandbox, { filename: "dist/client.js" });
	if (payload == null) throw new Error("bundle must call window.__ModuleLoader__.load");
	return payload;
}

/**
 * A fake cordis plugin context. Mirrors the real `ctx.effect` semantics: the
 * callback is the effect BODY (runs immediately), and its RETURN VALUE is the
 * disposer invoked at scope teardown.
 */
function fakeCtx(): Context & { disposers: Array<() => void> } {
	const disposers: Array<() => void> = [];
	// The real Context is a service proxy; only `effect` is exercised here, so
	// the fake is cast instead of implementing the full interface.
	return {
		disposers,
		effect(fn: () => void | (() => void)) {
			const dispose = fn();
			if (typeof dispose === "function") disposers.push(dispose);
			return dispose;
		}
	} as unknown as Context & { disposers: Array<() => void> };
}

/** A page with an assistant message flow item (stable data-chat-flow-kind attribute). */
function setupPage() {
	const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
	const flow = document.createElement("div");
	flow.setAttribute("data-chat-flow", "");
	const assistant = document.createElement("div");
	// The served build tags step-level assistant content as `assistant-step`.
	assistant.setAttribute("data-chat-flow-kind", "assistant-step");
	assistant.innerHTML =
		'<p>See <a href="https://x.dev">x</a> and math <span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span><span class="katex-html"><span>E=mc<sup>2</sup></span></span></span></p>';
	const user = document.createElement("div");
	user.setAttribute("data-chat-flow-kind", "user");
	user.innerHTML = "<p>plain user text</p>";
	flow.append(assistant, user);
	document.body.append(flow);
	return { document, window, assistant, user };
}

/** A mock Range: `cloneContents` clones the target element into a fresh container. */
function mockRange(startContainer: Node, document: Document): Range {
	return {
		startContainer,
		endContainer: startContainer,
		setStartBefore() {},
		setEndAfter() {},
		cloneContents() {
			const holder = document.createElement("div");
			holder.innerHTML = startContainer.parentElement?.innerHTML ?? "";
			return holder as unknown as DocumentFragment;
		}
	} as unknown as Range;
}

function synthesizeCopy(
	document: Document,
	window: PageWindow,
	range: Range | null,
	selectionOverrides: Partial<Selection> = {}
): { records: Record<string, string>; prevented: boolean } {
	const records: Record<string, string> = {};
	let prevented = false;
	const selection = {
		rangeCount: 1,
		isCollapsed: false,
		getRangeAt: () => range as Range,
		...selectionOverrides
	} as unknown as Selection;
	window.getSelection = () => selection;
	const event = new window.Event("copy", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clipboardData", {
		value: {
			setData(type: string, value: string) {
				records[type] = value;
			}
		}
	});
	Object.defineProperty(event, "preventDefault", {
		value() {
			prevented = true;
		}
	});
	document.dispatchEvent(event);
	return { records, prevented };
}

test("bundle registers with the DSH module loader contract", () => {
	const { document, window } = setupPage();
	const payload = loadBundle({ window, document });
	expect(payload.id).toBe("dsh-message-copy-enhance");
	expect(typeof payload.factory).toBe("function");
	const exports = payload.factory(() => {
		throw new Error("unexpected require");
	});
	expect(typeof exports.apply).toBe("function");
	expect(Array.isArray(exports.inject)).toBe(true);
	expect(exports.name).toBe("dsh-message-copy-enhance");
});

test("apply registers a copy listener and dispose removes it", () => {
	const { document, window, assistant } = setupPage();
	const payload = loadBundle({ window, document });
	const ctx = fakeCtx();
	payload.factory(() => {}).apply(ctx);
	expect(ctx.disposers.length, "ctx.effect registers a cleanup").toBe(1);

	// Realistic selection: it STARTS at a plain-text position (the first text
	// node of the paragraph) while the message contains a link and math. The
	// item-scoped gate must still intercept.
	const paragraph = assistant.querySelector("p")!;
	const textStart = paragraph.firstChild!;
	const { prevented, records } = synthesizeCopy(document, window, mockRange(textStart, document));
	expect(prevented).toBe(true);
	expect(records["text/plain"]).toBe("See [x](https://x.dev) and math $E=mc^2$");
	expect(records["text/markdown"]).toBe(records["text/plain"]);

	// selection in a user message → default copy untouched
	const userP = document.querySelector('[data-chat-flow-kind="user"] p')!;
	const userCopy = synthesizeCopy(document, window, mockRange(userP, document));
	expect(userCopy.prevented).toBe(false);
	expect(userCopy.records["text/plain"]).toBeUndefined();

	// after dispose → never intercepted again
	ctx.disposers[0]();
	const after = synthesizeCopy(document, window, mockRange(textStart, document));
	expect(after.prevented).toBe(false);
	expect(after.records["text/plain"]).toBeUndefined();
});

test("turn-level assistant nodes (kind=assistant) are intercepted too", () => {
	const { document, window } = setupPage();
	const assistant = document.createElement("div");
	assistant.setAttribute("data-chat-flow-kind", "assistant");
	assistant.innerHTML = '<p>see <a href="https://x.dev">x</a></p>';
	document.body.append(assistant);

	const payload = loadBundle({ window, document });
	const ctx = fakeCtx();
	payload.factory(() => {}).apply(ctx);

	const p = assistant.querySelector("p")!;
	const copy = synthesizeCopy(document, window, mockRange(p, document));
	expect(copy.prevented).toBe(true);
	expect(copy.records["text/plain"]).toBe("see [x](https://x.dev)");
});

test("a plain-text assistant message without signature content is not intercepted", () => {
	const { document, window } = setupPage();
	const plain = document.createElement("div");
	plain.setAttribute("data-chat-flow-kind", "assistant");
	plain.innerHTML = "<p>just plain words, no markdown features</p>";
	document.body.append(plain);

	const payload = loadBundle({ window, document });
	const ctx = fakeCtx();
	payload.factory(() => {}).apply(ctx);

	const p = plain.querySelector("p")!;
	const copy = synthesizeCopy(document, window, mockRange(p, document));
	expect(copy.prevented).toBe(false);
	expect(copy.records["text/plain"]).toBeUndefined();
});

test("empty selection and selection outside chat are ignored", () => {
	const { document, window } = setupPage();
	const payload = loadBundle({ window, document });
	const ctx = fakeCtx();
	payload.factory(() => {}).apply(ctx);

	// collapsed selection
	const collapsed = synthesizeCopy(document, window, null, { isCollapsed: true });
	expect(collapsed.prevented).toBe(false);

	// selection outside any flow item
	const outside = synthesizeCopy(document, window, mockRange(document.body, document));
	expect(outside.prevented).toBe(false);
});

test("a handler failure never breaks the default copy", () => {
	const { document, window, assistant } = setupPage();
	const payload = loadBundle({ window, document });
	const ctx = fakeCtx();
	payload.factory(() => {}).apply(ctx);

	const range = mockRange(assistant.querySelector("a")!, document);
	range.cloneContents = () => {
		throw new Error("boom");
	};
	const { prevented } = synthesizeCopy(document, window, range);
	expect(prevented).toBe(false);
});
