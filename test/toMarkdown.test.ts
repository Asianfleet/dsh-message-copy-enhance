import { test, expect } from "vitest";
import { dom, inlineMath, displayMath } from "./helpers.js";
import { domToMarkdown } from "../src/client/toMarkdown.js";

function convert(html: string): string {
	const { container } = dom(html);
	return domToMarkdown(container);
}

test("links become [label](href)", () => {
	const out = convert('<p>See <a href="https://example.com/a">example</a> now</p>');
	expect(out).toBe("See [example](https://example.com/a) now");
});

test("link label keeps nested emphasis", () => {
	const out = convert('<p><a href="https://example.com"><strong>bold</strong> link</a></p>');
	expect(out).toBe("[**bold** link](https://example.com)");
});

test("mailto links survive", () => {
	const out = convert('<p><a href="mailto:hi@example.com">mail</a></p>');
	expect(out).toBe("[mail](mailto:hi@example.com)");
});

test("inline LaTeX recovers the TeX source from the MathML annotation", () => {
	const html = `<p>Euler: ${inlineMath("e^{i\\pi} + 1 = 0")}</p>`;
	expect(convert(html)).toBe("Euler: $e^{i\\pi} + 1 = 0$");
});

test("display LaTeX becomes a $$ block", () => {
	const html = `<p>${displayMath("\\int_0^1 x^2\\,dx = \\frac{1}{3}")}</p>`;
	expect(convert(html)).toBe("$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$");
});

test("link + inline math mixed in one paragraph", () => {
	const html = `<p>See <a href="https://example.com">docs</a> for ${inlineMath("E=mc^2")}.</p>`;
	expect(convert(html)).toBe("See [docs](https://example.com) for $E=mc^2$.");
});

test("KaTeX error span renders as inline math text", () => {
	const html = '<p>x = <span class="katex-error" style="color:#cc0000" title="ParseError">\\badcmd</span></p>';
	expect(convert(html)).toBe("x = $\\badcmd$");
});

test("plain code block becomes a fenced block", () => {
	const html = '<pre class="plain"><code>const x = 1;\nconsole.log(x);</code></pre>';
	expect(convert(html)).toBe("```\nconst x = 1;\nconsole.log(x);\n```");
});

test("code block keeps the language-* class", () => {
	const html = '<pre><code class="language-js">const x = 1;</code></pre>';
	expect(convert(html)).toBe("```js\nconst x = 1;\n```");
});

test("md-code-block container: banner chrome dropped, language recovered from banner label", () => {
	const html =
		'<div class="md-code-block"><div><div><div>typescript</div><div><button type="button">复制</button></div></div></div>' +
		'<pre class="shiki" style="background:#000"><code><span class="line"><span style="color:#fff">const</span><span style="color:#aaa"> n: number = 1;</span></span></code></pre></div>';
	const out = convert(html);
	expect(out).toBe("```typescript\nconst n: number = 1;\n```");
});

test("code content is never escaped", () => {
	const html = '<pre><code class="language-bash">echo "*not bold*" &amp;&amp; rm [x]</code></pre>';
	expect(convert(html)).toBe("```bash\necho \"*not bold*\" && rm [x]\n```");
});

test("inline code uses backticks, doubling when the content has one", () => {
	expect(convert("<p>run <code>npm i</code> now</p>")).toBe("run `npm i` now");
	expect(convert("<p>see <code>a `b</code></p>")).toBe("see `` a `b ``");
});

test("headings, emphasis, deletion", () => {
	const html = "<h1>Title</h1><h3>Sub <em>em</em></h3><p><strong>bold</strong>, <del>gone</del></p>";
	expect(convert(html)).toBe("# Title\n\n### Sub *em*\n\n**bold**, ~~gone~~");
});

test("nested lists", () => {
	const html = "<ul><li>one</li><li>two<ul><li>two-a</li><li>two-b</li></ul></li><li>three</li></ul>";
	expect(convert(html)).toBe("- one\n- two\n  - two-a\n  - two-b\n- three");
});

test("ordered list numbering", () => {
	const html = '<ol start="3"><li>three</li><li>four</li></ol>';
	expect(convert(html)).toBe("3. three\n4. four");
});

test("blockquote prefixes lines", () => {
	const html = "<blockquote><p>first</p><p>second</p></blockquote>";
	expect(convert(html)).toBe("> first\n>\n> second");
});

test("GFM table", () => {
	const html =
		"<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2|3</td></tr></tbody></table>";
	expect(convert(html)).toBe("| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
});

test("buttons and aria-hidden chrome are skipped", () => {
	const html = '<p>keep<button type="button">copy</button><span aria-hidden="true">hidden</span> text</p>';
	expect(convert(html)).toBe("keep text");
});

test("plain markdown-significant characters are escaped", () => {
	const html = "<p>a *b* [c] `d`</p>";
	expect(convert(html)).toBe("a \\*b\\* \\[c\\] \\`d\\`");
});

test("empty / non-content input yields empty output", () => {
	expect(convert("<div></div>")).toBe("");
	expect(convert("<p>  </p>")).toBe("");
});

test("images become ![](url)", () => {
	const html = '<p><img src="https://example.com/pic.png" alt="a pic"></p>';
	expect(convert(html)).toBe("![a pic](https://example.com/pic.png)");
});

test("consecutive paragraphs are separated by one blank line", () => {
	const html = "<p>first</p><p>second</p>";
	expect(convert(html)).toBe("first\n\nsecond");
});

test("shiki token spans keep their leading spaces (partial code-line selection)", () => {
	// Real shiki output for `npm config set registry https://registry.npmjs.org`:
	// every inter-word space is the leading character of the next token span.
	const html =
		'<div><span class="line"><span>npm</span><span> config</span><span> set</span>' +
		'<span> registry</span><span> https://registry.npmjs.org</span></span></div>';
	expect(convert(html)).toBe("npm config set registry https://registry.npmjs.org");
});

test("token spans without a .line wrapper also keep spaces", () => {
	// cloneContents can surface the token spans directly when the selection
	// boundary cuts inside one of them.
	const html = "<div><span>npm</span><span> config</span><span> set</span></div>";
	expect(convert(html)).toBe("npm config set");
});

test("multi-line partial code selection joins .line spans with newlines, not blank lines", () => {
	const html =
		"<div>" +
		'<span class="line"><span>const</span><span> x</span></span>' +
		'<span class="line"><span>=</span><span> 1;</span></span>' +
		"</div>";
	expect(convert(html)).toBe("const x\n= 1;");
});

test("partial code selection keeps code verbatim (no markdown escaping)", () => {
	const html =
		'<div><span class="line"><span>echo</span><span> "*x*"</span>' +
		"<span> [y]</span></span></div>";
	expect(convert(html)).toBe('echo "*x*" [y]');
});
