# dsh-message-copy-enhance

[![npm version](https://img.shields.io/npm/v/dsh-message-copy-enhance.svg)](https://www.npmjs.com/package/dsh-message-copy-enhance)
[![npm downloads](https://img.shields.io/npm/dm/dsh-message-copy-enhance.svg)](https://www.npmjs.com/package/dsh-message-copy-enhance)
[![License: MIT](https://img.shields.io/npm/l/dsh-message-copy-enhance.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](tsconfig.json)

[English](README.md) · [中文](README_zh.md)

A DeepSeek Harness client UI plugin: **when you select text in a model message and copy it, the clipboard content is rewritten to Markdown**, so links, LaTeX source, code-fence language info, and more are no longer lost.

## How it works

DSH renders model output via `dsh-client-ui-conversation` → `dsh-client-ui-primitives`:

| Content | DOM shape | Recovery |
|---|---|---|
| Links | `<a href="...">` | Take the `href` directly, output `[label](url)` |
| Inline / block LaTeX | KaTeX-rendered `.katex` / `.katex-display` | Retrieve the **TeX source** from the `<annotation encoding="application/x-tex">` in the MathML branch, output `$...$` / `$$...$$` |
| Code blocks | `.md-code-block` (banner shows the language) + `pre` | Output a fenced code block; the language comes from the `language-*` class or the banner's infostring |
| Headings / emphasis / lists / quotes / tables | Standard HTML | Recovered as GFM |

The plugin listens for `copy` on `document` in the **capture phase**, and takes over only when the selection starts inside a `[data-chat-flow-kind="assistant"]` message and contains markdown-significant elements:

1. Expand the selection to the full `.katex` element (selecting in the middle of a formula still gets the complete source)
2. Clone the selection DOM with `Range.cloneContents()`
3. Recover the markdown with the built-in zero-dependency DOM→Markdown converter (`src/client/toMarkdown.ts`, written in TypeScript, type-erased and inlined into the bundle)
4. `preventDefault()` and write `text/plain` and `text/markdown`

Other selections (user bubbles, tool cards, plain text) and empty selections are completely unaffected; if conversion fails, the default copy behavior is restored automatically.

## Project structure

```
dsh-message-copy-enhance/
├── package.json            # dsh.client metadata (client plugin declaration)
├── tsconfig.json           # typecheck config (strict, includes src/test/scripts)
├── tsconfig.build.json     # build config: src/client → .tsc/ intermediate output
├── src/client/
│   ├── index.ts            # plugin entry: copy interception + apply/inject (TS, apply(ctx) uses the official
│   │                       #   @deepseek-ai/cordis Context type, same as dsh-client-ui-*)
│   └── toMarkdown.ts       # DOM→Markdown converter (TS, zero dependencies)
├── lib/
│   ├── index.js            # Host-side no-op plugin (JS entry loaded by the DSH Loader)
│   └── index.d.ts          # type declarations for the host entry
├── scripts/
│   └── build.js            # tsc compile + inline into DSH module-loader format → dist/client.js
├── dist/client.js          # build artifact (pre-generated)
└── test/                   # node:test + tsx (.test.ts): converter / bundle / package layout
```

## Build & test

```bash
npm install           # dev deps: typescript / tsx / @types/node / linkedom / @deepseek-ai/cordis (official types)
npm run typecheck     # tsc -p tsconfig.json — full type check (strict)
npm run build         # tsc compile src/client → .tsc/, inline to dist/client.js, clean intermediate output
npm test              # node --import tsx --test — 36 cases (runs the TS sources directly)
```

## Install

```bash
dsh plugin --profile desktop add dsh-message-copy-enhance
```

## Usage

**Select** content in any model answer and press `Ctrl/Cmd+C`, then paste into Typora / Obsidian / VS Code / any markdown editor to get the full markdown.

## Limitations

- Selections **spanning multiple messages** are not intercepted (only selections starting inside an assistant message are handled).
- Links filtered out by the render whitelist (e.g. `file:`, relative links) have no `href` to begin with and cannot be recovered.
- Code blocks only recover the **selected lines** (no forced expansion of the whole block); the language tag is missing when the selected region does not include the banner.
- Elements shown as `.katex-error` (KaTeX render failure) are output as `$source$`.
- Tables are output as GFM pipe tables; `|` is escaped.

## License

[MIT](LICENSE) — Copyright (c) 2026 Asianfleet
