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
├── tsconfig.json           # typecheck config (strict, includes src/test/vite.config.ts)
├── vite.config.ts          # vite build (DSH module-loader output) + vitest config
├── src/client/
│   ├── index.ts            # plugin entry: copy interception + apply/inject (TS, apply(ctx) uses the official
│   │                       #   @deepseek-ai/cordis Context type, same as dsh-client-ui-*)
│   └── toMarkdown.ts       # DOM→Markdown converter (TS, zero dependencies)
├── lib/
│   ├── index.js            # Host-side no-op plugin (JS entry loaded by the DSH Loader)
│   └── index.d.ts          # type declarations for the host entry
├── dist/client.js          # build artifact (pre-generated)
└── test/                   # vitest (.test.ts): converter / bundle / package layout
```

## Build & test

```bash
npm install           # dev deps: typescript / vite / vitest / @types/node / linkedom / @deepseek-ai/cordis (official types)
npm run typecheck     # tsc -p tsconfig.json — full type check (strict)
npm run build         # vite build — bundle src/client into dist/client.js in the DSH module-loader format
npm test              # vitest run — 36 cases (converter / real bundle / package layout)
npm run test:watch    # vitest — watch mode
npm run test:coverage # vitest run --coverage — v8 coverage report
```

## Release

Releases are driven by [release-it](https://github.com/release-it/release-it) with a Conventional Commits changelog. Run from the `main` branch with a clean working tree:

```bash
pnpm release
```

It is **interactive**: first the commits since the last tag are shown as a changelog preview (grouped by type, including the conventional-commits recommended version), then you pick the next version from a prompt (`patch` / `minor` / `major` / pre-release variants / custom). What happens, in order:

1. **Checks** (`npm run check:release`): version is valid SemVer, the version is not already published on npm (or there are new commits since its tag), `GITHUB_TOKEN` is set, npm is authenticated; then typecheck and the test suite run.
2. **Prompt** — the changelog preview is printed and the next version is chosen interactively (the recommended bump from conventional commits is shown; `feat` → minor, `fix`/`perf`/`revert` → patch, breaking changes → major).
3. **Changelog** — `CHANGELOG.md` is regenerated from the commits since the last tag, under the chosen version.
4. **Build** — `npm run build` (the DSH module-loader client bundle).
5. **Release** — commit `chore(release): vX.Y.Z`, tag `vX.Y.Z`, push to GitHub, create a GitHub Release (release notes from the changelog), then `npm publish`.

Prerequisites:

- `GITHUB_PAT_TOKEN` exported (a [GitHub PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) — a classic token with `repo` scope, or a fine-grained token with **Contents: Read and write** on this repo; `gh auth token` also works; `GITHUB_TOKEN` is accepted as a fallback), and `npm login`. The collaborator pre-check is skipped (`github.skipChecks`), since fine-grained tokens get a 403 on that endpoint; GitHub still enforces the real permissions when the release is created.
- Commits following [Conventional Commits](https://www.conventionalcommits.org/); the script only recognizes those types.

Useful variants:

```bash
pnpm release:dry                   # dry-run: previews everything without changing anything
pnpm release -- --increment=patch  # skip the prompt and force a patch bump (or minor/major)
pnpm release -- --ci               # fully non-interactive (for CI; falls back to a patch bump)
```

Note: if a `CI` environment variable is set, release-it automatically switches to non-interactive mode.

## Install

```bash
dsh plugin --profile desktop add dsh-message-copy-enhance
```

## Upgrading

```bash
dsh plugin --profile desktop add dsh-message-copy-enhance@latest
```

This package is pre-1.0, and a caret range like `^0.1.0` covers **patch releases only** (`0.1.x`) — a **minor** bump (`0.1 → 0.2`) falls outside the range, so `dsh plugin update` will not pick it up. Upgrade explicitly with `@latest` (or `@<version>`).

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
