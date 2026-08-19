/**
 * dsh-message-copy-enhance — client plugin entry.
 *
 * Intercepts the `copy` event (capture phase, before the default action) when
 * the current selection lives inside an assistant message and rewrites the
 * clipboard payload to Markdown: `text/plain` carries the markdown so
 * markdown-aware targets (Typora, Obsidian, VS Code, editors…) get full
 * fidelity — links as `[label](href)`, LaTeX as `$...$` / `$$...$$` sources —
 * instead of the lossy plain text the default copy would put there.
 *
 * Non-assistant selections and empty selections fall through untouched, and a
 * failure inside the handler never breaks the default copy.
 *
 * Plugin shape follows the DSH client convention (same as any
 * @deepseek-ai/dsh-client-ui-* package): `inject` lists required services
 * (none here — pure DOM), `apply` receives the browser plugin context typed
 * with the official `Context` from `@deepseek-ai/cordis`, and the listener is
 * registered inside a `ctx.effect` whose body runs immediately and whose
 * RETURN value is the disposer executed at plugin scope teardown.
 */

import type { Context } from "@deepseek-ai/cordis";
import { domToMarkdown, ASSISTANT_SIGNATURE_SELECTOR } from "./toMarkdown.js";

export const name = "dsh-message-copy-enhance";

/** Required cordis services; this plugin is pure DOM so it needs none. */
export const inject: string[] = [];

function elementOf(node: Node): Element | null {
	if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
	return node.parentElement;
}

/**
 * Expand the range so a partially selected formula becomes the whole `.katex`
 * element: the TeX source only exists on the element, so a selection that
 * stops between two rendered glyphs would otherwise lose it.
 */
function expandToWholeMath(range: Range): void {
	const startEl = elementOf(range.startContainer);
	const endEl = elementOf(range.endContainer);
	const startMath = startEl != null ? startEl.closest(".katex") : null;
	const endMath = endEl != null ? endEl.closest(".katex") : null;
	if (startMath != null) range.setStartBefore(startMath);
	if (endMath != null) range.setEndAfter(endMath);
}

/** The code containers whose text must never be treated as markdown prose. */
const CODE_CONTAINER_SELECTOR = "pre, code";

/**
 * Short-circuit for selections that lie entirely inside one code element.
 *
 * When the user selects text strictly inside a plain (unhighlighted) code
 * block, `cloneContents` strips the `pre`/`code` wrapper and the DOM→Markdown
 * converter then re-escapes the source as markdown prose (`_` → `\_`,
 * `*` → `\*`, …). Code text must reach the clipboard verbatim, so detect that
 * selection shape up front and return the selection's own text instead of
 * letting the converter run.
 *
 * Returns `null` when the selection is not strictly inside a single code
 * element (the wrapper is included in the selection, or it spans several
 * containers — those keep the normal fenced-block path), or when the code is
 * shiki-highlighted: its `.line` spans carry inter-line newlines only in CSS,
 * which `range.toString` would drop, so the converter's line-reconstruction
 * path must keep running there.
 */
function selectionInsideCode(range: Range): string | null {
	const startEl = elementOf(range.startContainer);
	const endEl = elementOf(range.endContainer);
	const startCode = startEl != null ? startEl.closest(CODE_CONTAINER_SELECTOR) : null;
	const endCode = endEl != null ? endEl.closest(CODE_CONTAINER_SELECTOR) : null;
	// Both endpoints inside the same code element implies the whole range sits
	// inside it, so the selection cannot include the container itself; a
	// selection that reaches outside the block (fence-worthy) fails here.
	if (startCode == null || startCode !== endCode) return null;
	// Shiki layout: let the converter rebuild newlines from the .line spans.
	if (startCode.querySelector(".line") != null) return null;
	return range.toString();
}

function selectionToMarkdown(range: Range): string {
	expandToWholeMath(range);
	// Code is never markdown prose: a selection strictly inside a plain code
	// element must copy verbatim, not be escaped by the converter (which only
	// sees the bare text nodes once the wrapper is gone).
	const code = selectionInsideCode(range);
	if (code !== null) return code;
	const fragment = range.cloneContents();
	const container = document.createElement("div");
	container.appendChild(fragment);
	return domToMarkdown(container);
}

/**
 * @param ctx - the browser plugin context (`@deepseek-ai/cordis` `Context`).
 */
export function apply(ctx: Context): void {
	const onCopy = (event: ClipboardEvent): void => {
		try {
			const selection = window.getSelection();
			if (selection == null || selection.rangeCount === 0 || selection.isCollapsed) return;
			const range = selection.getRangeAt(0);
			// Only intercept assistant output. The flow item carrying the
			// selection decides: `data-chat-flow-kind` is the stable attribute
			// DSH's conversation view sets on message rows. Assistant content
			// appears as both `assistant` (turn nodes) and `assistant-step`
			// (step nodes), so any assistant-prefixed kind qualifies.
			const startEl = elementOf(range.startContainer);
			const flowItem = startEl != null ? startEl.closest("[data-chat-flow-kind]") : null;
			const kind = flowItem == null ? null : flowItem.getAttribute("data-chat-flow-kind");
			if (kind == null || !kind.startsWith("assistant")) return;
			// Item-scoped gate: intercept when the message contains any
			// markdown-signature content, regardless of where inside it the
			// selection started (mouse selections begin at plain-text positions
			// all the time). Messages with none of these are plain text and keep
			// the default (identical) copy.
			if (flowItem == null || flowItem.querySelector(ASSISTANT_SIGNATURE_SELECTOR) == null) return;

			const markdown = selectionToMarkdown(range);
			if (markdown === "") return;

			// Synthetic events may carry no data transfer; fall through to the
			// default copy in that case instead of swallowing it.
			const data = event.clipboardData;
			if (data == null) return;

			event.preventDefault();
			data.setData("text/plain", markdown);
			// Some editors (Obsidian, Typora, VS Code) read the dedicated type.
			data.setData("text/markdown", markdown);
		} catch (error) {
			// Never break the default copy path.
			if (typeof console !== "undefined") {
				console.error("[dsh-message-copy-enhance] copy interception failed, falling back to default", error);
			}
		}
	};

	// ctx.effect semantics: the callback is the effect BODY (runs now); its
	// return value is the disposer, run when the plugin scope is torn down.
	ctx.effect(() => {
		document.addEventListener("copy", onCopy, true);
		// One-line activation marker so the plugin's presence is verifiable in
		// the browser console (DevTools → Console).
		if (typeof console !== "undefined") {
			console.info("[dsh-message-copy-enhance] active — assistant copy is rewritten to Markdown");
		}
		return () => {
			document.removeEventListener("copy", onCopy, true);
		};
	}, "dsh-message-copy-enhance: copy listener");
}