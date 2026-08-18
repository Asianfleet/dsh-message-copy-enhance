# Changelog

## [0.1.0] - 2026-08-18

### Added

- 将 assistant 输出复制为 Markdown，保留链接、LaTeX 源码与代码围栏
- 增加 `prepare` 脚本，通过 git 直接安装时自动构建客户端 bundle
- 英文 README、中文 README（README_zh.md）、徽章与 npm 包元数据

### Fixed

- 修复部分代码选区（shiki token span）复制时丢失空格的问题

---

_格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)；此文件由 [release-it](https://github.com/release-it/release-it) 在 `pnpm release` 时自动维护。_
