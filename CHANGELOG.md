# Changelog

## [0.2.1](https://github.com/Asianfleet/dsh-message-copy-enhance/compare/v0.2.0...v0.2.1) (2026-08-19)

### Bug Fixes

* copy code and intraword underscores verbatim without markdown ([d66b444](https://github.com/Asianfleet/dsh-message-copy-enhance/commit/d66b444e416d959da9eae3376117480b42178c58))

### Documentation

* document explicit upgrade command for pre-1.0 minor bumps ([ef51d8a](https://github.com/Asianfleet/dsh-message-copy-enhance/commit/ef51d8ae3cacd5d6944aa4d130f3d27cfed6390b))

## [0.2.0](https://github.com/Asianfleet/dsh-message-copy-enhance/compare/v0.1.0...v0.2.0) (2026-08-18)

### Features

* add release-it pipeline with conventional changelog generation ([b822a39](https://github.com/Asianfleet/dsh-message-copy-enhance/commit/b822a39ce9e8a3e230a11a4c6792b221798dea0b))

### Bug Fixes

* build before test in prepublishOnly and use katex devDependency ([3c05b4e](https://github.com/Asianfleet/dsh-message-copy-enhance/commit/3c05b4e269a3748ad1bb58f9d50dc4b9827e1ab6))

### Build System

* switch client bundle to vite and tests to vitest ([695dabe](https://github.com/Asianfleet/dsh-message-copy-enhance/commit/695dabe179cca08c0dcb1f4bb3f332a3cf96a618))

### Chores

* normalize repository.url to git+https (npm pkg fix) ([2923702](https://github.com/Asianfleet/dsh-message-copy-enhance/commit/2923702de168b44df9ae9b3676fd6c857bc2ae70))

## [0.1.0] - 2026-08-18

### Added

- 将 assistant 输出复制为 Markdown，保留链接、LaTeX 源码与代码围栏
- 增加 `prepare` 脚本，通过 git 直接安装时自动构建客户端 bundle
- 英文 README、中文 README（README_zh.md）、徽章与 npm 包元数据

### Fixed

- 修复部分代码选区（shiki token span）复制时丢失空格的问题

---

_格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)；此文件由 [release-it](https://github.com/release-it/release-it) 在 `pnpm release` 时自动维护。_
