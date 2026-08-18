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
├── tsconfig.json           # typecheck 配置（strict，含 src/test/vite.config.ts）
├── vite.config.ts          # vite 构建（DSH 模块加载器输出）+ vitest 配置
├── src/client/
│   ├── index.ts            # 插件入口：copy 拦截 + apply/inject（TS，apply(ctx) 使用官方
│   │                       #   @deepseek-ai/cordis 的 Context 类型，与 dsh-client-ui-* 一致）
│   └── toMarkdown.ts       # DOM→Markdown 转换器（TS，零依赖）
├── lib/
│   ├── index.js            # Host 侧 no-op 插件（DSH Loader 加载的 JS 入口）
│   └── index.d.ts          # Host 入口的类型声明
├── dist/client.js          # 构建产物（预生成）
└── test/                   # vitest（.test.ts），转换器/bundle/包结构
```

## 构建与测试

```bash
npm install           # 开发依赖：typescript / vite / vitest / @types/node / linkedom / @deepseek-ai/cordis（官方类型）
npm run typecheck     # tsc -p tsconfig.json —— 全量类型检查（strict）
npm run build         # vite build —— 把 src/client 打包为 DSH 模块加载器格式的 dist/client.js
npm test              # vitest run —— 36 个用例（转换器 / 真实 bundle / 包结构）
npm run test:watch    # vitest —— watch 模式
npm run test:coverage # vitest run --coverage —— v8 覆盖率报告
```

## 发布

发布流程由 [release-it](https://github.com/release-it/release-it) 驱动，基于 Conventional Commits 自动生成 CHANGELOG。在 `main` 分支、工作区干净时执行：

```bash
pnpm release
```

它是**交互式**的：先打印自上个 tag 以来的提交预览（按类型分组，并给出 conventional 推荐版本号），随后弹出提示让你选择下一个版本号（`patch` / `minor` / `major` / 预发布变体 / 自定义）。流程依次为：

1. **检查**（`npm run check:release`）：版本号是合法 SemVer、版本号未与 npm 已发布版本重复、已设置 `GITHUB_TOKEN`、npm 已登录；随后运行类型检查与测试套件。
2. **交互选择版本**——打印 changelog 预览后由你选择下一个版本号（提示中会显示 conventional 推荐值：`feat` → minor、`fix`/`perf`/`revert` → patch、破坏性变更 → major）。
3. **生成 CHANGELOG**——基于自上个 tag 以来的提交、按所选版本重新生成 `CHANGELOG.md`。
4. **构建**——`npm run build`（DSH 模块加载器格式的客户端 bundle）。
5. **发布**——提交 `chore(release): vX.Y.Z`、打 tag `vX.Y.Z`、推送到 GitHub、创建 GitHub Release（release notes 取自 CHANGELOG）、最后 `npm publish`。

前置条件：

- 已导出 `GITHUB_PAT_TOKEN`（[GitHub PAT](https://docs.github.com/zh/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)：Classic token 需 `repo` 权限；Fine-grained token 需对本仓库授予 **Contents: Read and write**；`gh auth token` 也可，`GITHUB_TOKEN` 作为备选同样支持），并执行过 `npm login`。协作者预检已关闭（`github.skipChecks`）——细粒度 token 调用该接口会 403，真实权限由 GitHub 在创建 Release 时强制校验。
- 提交遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-CN/) 规范；脚本只识别这些类型。

常用变体：

```bash
pnpm release:dry                   # 预演：只预览全部流程，不产生任何变更
pnpm release -- --increment=patch  # 跳过提示，强制 patch 递增（也可用 minor/major）
pnpm release -- --ci               # 完全非交互（CI 用，默认退回 patch）
```

注意：若环境中设置了 `CI` 环境变量，release-it 会自动切换到非交互模式。

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
