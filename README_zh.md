# dsh-message-copy-enhance

[![npm version](https://img.shields.io/npm/v/dsh-message-copy-enhance.svg)](https://www.npmjs.com/package/dsh-message-copy-enhance)
[![npm downloads](https://img.shields.io/npm/dm/dsh-message-copy-enhance.svg)](https://www.npmjs.com/package/dsh-message-copy-enhance)
[![License: MIT](https://img.shields.io/npm/l/dsh-message-copy-enhance.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](tsconfig.json)

[English](README.md) · [中文](README_zh.md)

DeepSeek Harness 客户端 UI 插件：**划选模型输出并复制时，把剪贴板内容改写为 Markdown**，链接、LaTeX 公式源码、代码块语言等信息不再丢失。

## 工作原理

DSH 的模型输出由 `dsh-client-ui-conversation` → `dsh-client-ui-primitives` 渲染：

| 内容 | DOM 形态 | 恢复方式 |
|---|---|---|
| 链接 | `<a href="...">` | 直接取 `href`，输出 `[label](url)` |
| 行内/块级 LaTeX | KaTeX 渲染的 `.katex` / `.katex-display` | 从 MathML 分支的 `<annotation encoding="application/x-tex">` 取回 **TeX 源码**，输出 `$...$` / `$$...$$` |
| 代码块 | `.md-code-block`（banner 显示语言）+ `pre` | 输出围栏代码块，语言取自 `language-*` class 或 banner 的 infostring |
| 标题/强调/列表/引用/表格 | 标准 HTML | 还原为 GFM |

插件在 `document` 上以**捕获阶段**监听 `copy` 事件，仅当选区起点落在 `[data-chat-flow-kind="assistant"]` 消息内且包含 markdown 特征元素时接管：

1. 把选区扩展到完整的 `.katex` 元素（选中公式中间也能拿到完整源码）
2. `Range.cloneContents()` 克隆选区 DOM
3. 用内置的零依赖 DOM→Markdown 转换器（`src/client/toMarkdown.ts`，TypeScript 编写、类型擦除后内联进 bundle）还原 markdown
4. `preventDefault()` 后写入 `text/plain` 与 `text/markdown`

其余选区（用户气泡、工具卡片、普通文本）与空选区完全不受影响；转换失败时自动回退默认复制。

## 项目结构

```
dsh-message-copy-enhance/
├── package.json            # dsh.client 元数据（客户端插件声明）
├── tsconfig.json           # typecheck 配置（strict，含 src/test/scripts）
├── tsconfig.build.json     # 构建配置：src/client → .tsc/ 中间产物
├── src/client/
│   ├── index.ts            # 插件入口：copy 拦截 + apply/inject（TS，apply(ctx) 使用官方
│   │                       #   @deepseek-ai/cordis 的 Context 类型，与 dsh-client-ui-* 一致）
│   └── toMarkdown.ts       # DOM→Markdown 转换器（TS，零依赖）
├── lib/
│   ├── index.js            # Host 侧 no-op 插件（DSH Loader 加载的 JS 入口）
│   └── index.d.ts          # Host 入口的类型声明
├── scripts/
│   └── build.js            # tsc 编译 + 内联为 DSH 模块加载器格式 → dist/client.js
├── dist/client.js          # 构建产物（预生成）
└── test/                   # node:test + tsx（.test.ts），转换器/bundle/包结构
```

## 构建与测试

```bash
npm install           # 开发依赖：typescript / tsx / @types/node / linkedom / @deepseek-ai/cordis（官方类型）
npm run typecheck     # tsc -p tsconfig.json —— 全量类型检查（strict）
npm run build         # tsc 编译 src/client → .tsc/，内联生成 dist/client.js 并清理中间产物
npm test              # node --import tsx --test —— 36 个用例（TS 源码直接跑）
```

## 安装启用

```bash
dsh plugin --profile desktop add dsh-message-copy-enhance
```

## 使用

在任意模型回答中**划选**内容后 `Ctrl/Cmd+C`，粘贴到 Typora / Obsidian / VS Code / 任意 markdown 编辑器即可得到完整 markdown。

## 边界与限制

- 选区**跨越多条消息**时不拦截（只处理起点在 assistant 消息内的选区）。
- 渲染时被白名单过滤掉的链接（如 `file:`、相对链接）本来就不存在 `href`，无法恢复。
- 代码块只恢复**选中的部分行**（不会强制扩展整块）；语言标记在选中区域不包含 banner 时会缺失。
- KaTeX 渲染失败显示为 `.katex-error` 的元素按 `$源码$` 输出。
- 表格以 GFM 管道表输出，`|` 会被转义。

## License

[MIT](LICENSE) — Copyright (c) 2026 Asianfleet
