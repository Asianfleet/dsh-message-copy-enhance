import { parseHTML } from "linkedom";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Real KaTeX output (same engine DSH's renderer uses) for fidelity tests. */
const KATEX_PATH = "D:/Apps/DSH Desktop/resources/app.asar.unpacked/node_modules/katex";

/** The tiny slice of KaTeX's API the fidelity tests need (structural typing). */
interface KatexModule {
	renderToString(tex: string, options?: KatexRenderOptions): string;
}

interface KatexRenderOptions {
	displayMode?: boolean;
	throwOnError?: boolean;
	strict?: boolean | string;
}

export const katex = require(KATEX_PATH) as KatexModule;

export function renderKatex(tex: string, displayMode = false): string {
	return katex.renderToString(tex, { displayMode, throwOnError: false, strict: "ignore" });
}

export interface ParsedDom {
	document: Document;
	container: HTMLDivElement;
}

/** Parse an HTML fragment into a fresh container element. */
export function dom(html: string): ParsedDom {
	const { document } = parseHTML("<!doctype html><html><body></body></html>");
	const container = document.createElement("div");
	container.innerHTML = html;
	return { document, container };
}

/** KaTeX's own inline math HTML: `<span class="katex">…</span>` */
export function inlineMath(tex: string): string {
	return renderKatex(tex, false);
}

/** KaTeX's own display math HTML: `<span class="katex-display"><span class="katex">…</span></span>` */
export function displayMath(tex: string): string {
	return renderKatex(tex, true);
}
