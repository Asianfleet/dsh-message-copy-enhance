/**
 * dsh-message-copy-enhance — DOM → Markdown converter
 *
 * Turns a DOM subtree (a cloned user selection from an assistant message) back
 * into Markdown, recovering what the rendered HTML would otherwise lose:
 *
 *  - links        → `[label](href)` from the real `<a href>` attribute
 *  - LaTeX        → `$...$` / `$$...$$` from the TeX source that KaTeX keeps
 *                   in `<annotation encoding="application/x-tex">` inside the
 *                   MathML arm of every `.katex` element
 *  - code blocks  → fenced ``` blocks; the language comes from the
 *                   `language-*` class or the `.md-code-block` banner label
 *  - headings / emphasis / lists / blockquotes / tables → plain GFM
 *
 * Deliberately zero-dependency so the client bundle stays self-contained and
 * the factory format of the DSH client module loader needs no npm resolution.
 */

/** DOM node-type constants, kept local so the converter runs without a DOM global (e.g. imported directly in Node tests). */
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function isElement(node: Node): node is Element {
	return node.nodeType === ELEMENT_NODE;
}

function tag(el: Element): string {
	return el.nodeName.toUpperCase();
}

function isText(node: Node): node is Text {
	return node.nodeType === TEXT_NODE;
}

function hasClass(el: Element, cls: string): boolean {
	return el.classList != null && el.classList.contains(cls);
}

/** Elements that only carry UI chrome and must never leak into the copy. */
function shouldSkip(el: Element): boolean {
	if (tag(el) === "BUTTON") return true;
	if (el.getAttribute("role") === "button") return true;
	if (el.getAttribute("aria-hidden") === "true") return true;
	// The composer's live-preview decorations are never part of assistant output,
	// but dropping any data-decoration chrome keeps the copy clean if the
	// selection ever spans into them.
	if (el.hasAttribute("data-decoration")) return true;
	return false;
}

/**
 * Escape markdown-significant characters in plain text.
 * - "raw": no escaping at all (code content must stay verbatim)
 * - "text": escape `\`, `` ` ``, `*`, `_`, `[`, `]`
 */
function escapeText(text: string, mode: "raw" | "text"): string {
	if (mode === "raw") return text;
	return text.replace(/([\\`*_[\]])/g, "\\$1");
}

function childrenInline(el: Element): string {
	let out = "";
	for (const child of el.childNodes) {
		if (isText(child)) {
			out += escapeText(child.textContent ?? "", "text");
		} else if (isElement(child)) {
			out += renderInline(child);
		}
	}
	return out;
}

function renderInlineCode(el: Element): string {
	const raw = (el.textContent ?? "").replace(/\r?\n|\r/g, " ");
	if (raw.includes("`")) {
		return `\`\` ${raw} \`\``;
	}
	return `\`${raw}\``;
}

function escapeUrl(url: string): string {
	return url.replace(/\)/g, "%29").replace(/\s/g, "%20");
}

function renderInline(node: Node): string {
	if (isText(node)) return escapeText(node.textContent ?? "", "text");
	if (!isElement(node)) return "";
	const el = node;
	if (shouldSkip(el)) return "";
	const t = tag(el);

	// ---- KaTeX math first: the whole element is one atomic unit ----
	if (hasClass(el, "katex-display")) {
		const tex = mathTexSource(el).trim();
		return tex ? `\n\n$$\n${tex}\n$$\n\n` : "";
	}
	if (hasClass(el, "katex")) return mathInline(el);
	if (hasClass(el, "katex-error")) {
		const tex = el.textContent?.trim() ?? "";
		return tex ? `$${tex}$` : "";
	}
	// shiki code lines: verbatim text (code is not markdown prose, so no
	// escaping), one markdown line per rendered source line. Reached when a
	// selection cuts through a code block without including the `pre`/`code`
	// wrapper; shiki token spans inside each `.line` then join with their
	// original spacing.
	if (hasClass(el, "line")) return (el.textContent ?? "") + "\n";

	switch (t) {
		case "BR":
			return "  \n";
		case "STRONG":
		case "B": {
			const inner = childrenInline(el);
			return inner ? `**${inner}**` : "";
		}
		case "EM":
		case "I": {
			const inner = childrenInline(el);
			return inner ? `*${inner}*` : "";
		}
		case "DEL":
		case "S":
		case "STRIKE": {
			const inner = childrenInline(el);
			return inner ? `~~${inner}~~` : "";
		}
		case "CODE":
			return renderInlineCode(el);
		case "A": {
			const href = el.getAttribute("href");
			const label = childrenInline(el).trim();
			if (!href) return label;
			if (!label) return escapeUrl(href);
			return `[${label}](${escapeUrl(href)})`;
		}
		case "IMG": {
			const src = el.getAttribute("src");
			const alt = (el.getAttribute("alt") ?? "").trim();
			return src ? `![${alt}](${escapeUrl(src)})` : alt;
		}
		case "SUB": {
			const inner = childrenInline(el);
			return inner ? `~${inner}~` : "";
		}
		case "SUP": {
			const inner = childrenInline(el);
			return inner ? `^${inner}^` : "";
		}
		case "PRE":
			// a block inside an inline position — emit it as a fenced block
			return `\n\n${codeBlockLines(el).join("\n")}\n\n`;
		default: {
			// generic inline container (SPAN, etc.). The text is NOT trimmed
			// per element: syntax highlighters (shiki) split one line into
			// token spans whose leading/trailing spaces carry the inter-word
			// spacing, so trimming here would eat it. Surrounding whitespace
			// is cleaned once at the assembled-line level instead.
			return childrenInline(el);
		}
	}
}

// ---------------------------------------------------------------------------
// Math (KaTeX)
// ---------------------------------------------------------------------------

/** The TeX source KaTeX keeps in the MathML annotation arm. */
function mathTexSource(el: Element): string {
	const annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation');
	if (annotation != null && annotation.textContent != null) return annotation.textContent;
	// fallback: the visually-hidden MathML arm of a `.katex` element
	const mathml = el.querySelector(".katex-mathml");
	if (mathml != null && mathml.textContent != null) return mathml.textContent;
	return "";
}

function mathInline(el: Element): string {
	const tex = mathTexSource(el).trim();
	return tex ? `$${tex}$` : "";
}

function mathDisplayLines(el: Element): string[] {
	const tex = mathTexSource(el).trim();
	return tex ? ["$$", tex, "$$"] : [];
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** Convert one node into an array of markdown lines. */
function nodeLines(node: Node): string[] {
	if (isText(node)) {
		const text = escapeText(node.textContent ?? "", "text");
		return text ? [text] : [];
	}
	if (!isElement(node)) return [];
	const el = node;
	if (shouldSkip(el)) return [];

	// ---- math / code containers are atomic ----
	if (hasClass(el, "katex-display")) return mathDisplayLines(el);
	if (hasClass(el, "katex")) {
		const inline = mathInline(el);
		return inline ? [inline] : [];
	}
	if (hasClass(el, "md-code-block")) return codeContainerLines(el);

	switch (tag(el)) {
		case "PRE":
			return codeBlockLines(el);
		case "P": {
			const inline = childrenInline(el).trim();
			return inline ? [inline] : [];
		}
		case "H1":
		case "H2":
		case "H3":
		case "H4":
		case "H5":
		case "H6": {
			const inline = childrenInline(el).trim();
			const level = Number(tag(el).charAt(1));
			return inline ? [`${"#".repeat(level)} ${inline}`] : [];
		}
		case "HR":
			return ["---"];
		case "BLOCKQUOTE":
			return quoteLines(el);
		case "UL":
		case "OL":
			return listLines(el, 0);
		case "TABLE":
			return tableLines(el);
		case "BR":
			return [""];
		case "IMG": {
			const inline = renderInline(el);
			return inline ? [inline] : [];
		}
		default:
			return blockChildrenLines(el);
	}
}

const BLOCK_TAGS = new Set([
	"P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE",
	"UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "DL", "DT", "DD", "FORM",
	"H1", "H2", "H3", "H4", "H5", "H6", "HR", "FIGURE"
]);

function isBlockNode(node: Node): boolean {
	if (!isElement(node)) return false;
	const el = node;
	return (
		BLOCK_TAGS.has(tag(el)) ||
		hasClass(el, "md-code-block") ||
		hasClass(el, "katex-display")
	);
}

/**
 * Render an element's children as a list of markdown lines. Inline runs
 * (text, links, math, spans…) merge into one line; each block child starts a
 * new line with a blank line separating consecutive blocks.
 */
function blockChildrenLines(el: Element): string[] {
	const lines: string[] = [];
	let inlineBuffer = "";
	let afterBlock = false;
	const flushInline = () => {
		const text = inlineBuffer.trim();
		if (text) lines.push(text);
		inlineBuffer = "";
	};
	for (const child of el.childNodes) {
		if (isText(child)) {
			inlineBuffer += escapeText(child.textContent ?? "", "text");
			continue;
		}
		if (!isElement(child)) continue;
		if (isBlockNode(child)) {
			flushInline();
			const childLines = nodeLines(child);
			if (childLines.length > 0) {
				if (afterBlock) lines.push("");
				lines.push(...childLines);
				afterBlock = true;
			}
		} else {
			inlineBuffer += renderInline(child);
		}
	}
	flushInline();
	return lines;
}

// ---------------------------------------------------------------------------
// Code blocks
// ---------------------------------------------------------------------------

/**
 * Recover the fence language:
 *  1. a `language-*` class on the inner `<code>` (plain fallback path)
 *  2. the `.md-code-block` banner label (the infostring div, structurally the
 *     first div inside the banner, which is the first div of the wrapper)
 */
function extractLanguage(root: Element, pre: Element | null): string {
	const code = pre != null && tag(pre) === "PRE" ? pre.querySelector("code") : null;
	if (code != null) {
		for (const cls of code.classList) {
			if (cls.startsWith("language-")) return cls.slice("language-".length);
		}
	}
	const block = hasClass(root, "md-code-block") ? root : root.closest(".md-code-block");
	if (block != null) {
		const bannerWrap = block.firstElementChild;
		const banner = bannerWrap != null ? bannerWrap.firstElementChild : null;
		const infostring = banner != null ? banner.firstElementChild : null;
		const label = infostring != null ? infostring.textContent?.trim() ?? "" : "";
		if (label) return label;
	}
	return "";
}

function codeBlockLines(pre: Element): string[] {
	const code = pre.querySelector("code");
	const raw = (code != null ? code.textContent : pre.textContent ?? "").replace(/\n$/, "");
	const lang = extractLanguage(pre, pre);
	return fenceLines(raw, lang);
}

function codeContainerLines(block: Element): string[] {
	const pre = block.querySelector("pre");
	if (pre == null) {
		// plain fallback: the container may hold raw text
		return fenceLines((block.textContent ?? "").replace(/\n$/, ""), extractLanguage(block, null));
	}
	const code = pre.querySelector("code");
	const raw = (code != null ? code.textContent : pre.textContent ?? "").replace(/\n$/, "");
	const lang = extractLanguage(block, pre);
	return fenceLines(raw, lang);
}

function fenceLines(raw: string, lang: string): string[] {
	const codeLines = raw.split("\n");
	let fence = "```";
	while (raw.includes(fence)) fence += "`";
	return [`${fence}${lang}`, ...codeLines, fence];
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

function indentLines(lines: string[], depth: number): string[] {
	const pad = "  ".repeat(depth);
	return lines.map((line) => (line ? `${pad}${line}` : line));
}

function listLines(list: Element, depth: number): string[] {
	const ordered = tag(list) === "OL";
	const start = parseInt(list.getAttribute("start") ?? "", 10);
	let index = Number.isFinite(start) ? start : 1;
	const out: string[] = [];
	for (const child of list.children) {
		if (!isElement(child)) continue;
		if (tag(child) !== "LI") {
			out.push(...indentLines(listLines(child, depth), depth));
			continue;
		}
		const marker = ordered ? `${index}.` : "-";
		index += 1;
		out.push(...liLines(child, depth, marker));
	}
	return out;
}

function liLines(li: Element, depth: number, marker: string): string[] {
	const rest: Node[] = [];
	const nested: Element[] = [];
	for (const child of li.childNodes) {
		if (isElement(child) && (tag(child) === "UL" || tag(child) === "OL")) nested.push(child);
		else rest.push(child);
	}
	const inlineParts: string[] = [];
	for (const node of rest) {
		if (isText(node)) {
			inlineParts.push(escapeText(node.textContent ?? "", "text"));
		} else if (isElement(node)) {
			const t = tag(node);
			if (t === "P" || t === "DIV") inlineParts.push(childrenInline(node));
			else if (t === "BR") inlineParts.push("  \n");
			else inlineParts.push(renderInline(node));
		}
	}
	const first = inlineParts.join("").trim();
	const pad = "  ".repeat(depth);
	const out = [first ? `${pad}${marker} ${first}` : `${pad}${marker}`];
	for (const nestedList of nested) out.push(...listLines(nestedList, depth + 1));
	return out;
}

// ---------------------------------------------------------------------------
// Blockquotes / tables
// ---------------------------------------------------------------------------

function quoteLines(blockquote: Element): string[] {
	return blockChildrenLines(blockquote).map((line) => (line === "" ? ">" : `> ${line}`));
}

function cellInline(cell: Element): string {
	return childrenInline(cell)
		.replace(/\|/g, "\\|")
		.replace(/\n/g, " ")
		.trim();
}

function tableLines(table: Element): string[] {
	const rows: string[][] = [];
	for (const tr of table.querySelectorAll("tr")) {
		const cells: string[] = [];
		for (const cell of tr.children) {
			if (isElement(cell) && (tag(cell) === "TH" || tag(cell) === "TD")) cells.push(cellInline(cell));
		}
		if (cells.length > 0) rows.push(cells);
	}
	if (rows.length === 0) return [];
	const columns = Math.max(...rows.map((row) => row.length));
	const pad = (row: string[]): string[] => {
		const out = [...row];
		while (out.length < columns) out.push("");
		return out;
	};
	const header = pad(rows[0]);
	const separator = header.map(() => "---");
	const body = rows.slice(1).map((row) => pad(row));
	return [
		`| ${header.join(" | ")} |`,
		`| ${separator.join(" | ")} |`,
		...body.map((row) => `| ${row.join(" | ")} |`)
	];
}

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

function joinBlocks(lines: string[]): string {
	const out: string[] = [];
	let pendingBlank = false;
	for (const line of lines) {
		if (line.trim() === "") {
			pendingBlank = true;
			continue;
		}
		if (pendingBlank && out.length > 0) out.push("");
		pendingBlank = false;
		out.push(line);
	}
	return out.join("\n");
}

/**
 * Convert a DOM subtree back to Markdown.
 * @param root - the container element (or document fragment holder) whose
 *   child nodes form the selection to convert.
 * @returns the markdown text, or "" when the subtree held nothing convertible.
 */
export function domToMarkdown(root: Element): string {
	return joinBlocks(blockChildrenLines(root));
}

/**
 * Selector for the DOM signatures of assistant markdown output. Used to
 * decide whether a copy should be intercepted at all: when an assistant
 * message contains any of these, converting the selection to markdown adds
 * fidelity; a message with none of them is plain text and stays on the
 * default copy path. Item-scoped (not selection-start-scoped): a mouse
 * selection can begin at any plain-text position inside the message.
 */
export const ASSISTANT_SIGNATURE_SELECTOR =
	".katex, .md-code-block, pre, code, a[href], h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol, img";
