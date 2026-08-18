#!/usr/bin/env node
/**
 * 发布前检查脚本，由 release-it 的 before:init 钩子调用（pnpm release 的第一步）。
 *
 * 检查项：
 *  1. 版本合规：package.json 的 version 必须是合法的 SemVer。
 *  2. 版本已更新：当前版本号不得与 npm 上已发布的版本重复；若已发布，则要求
 *     存在对应的 git tag 且该 tag 之后有新提交（此时 release-it 会根据提交
 *     自动递增版本号）。
 *  3. GitHub Token：发布 GitHub Release 需要 GITHUB_PAT_TOKEN（或 GITHUB_TOKEN）。
 *  4. npm 认证：npm whoami 失败则阻断（避免 git 提交/tag 推送后 npm 发布
 *     才失败、留下半发布状态）。
 *  5. 递增提示：自最近 tag 起没有 feat/fix/perf/revert 或 BREAKING CHANGE
 *     提交时给出提示（此时可在交互式版本选择中手动选择，或用
 *     `--increment` 强制递增）。
 *
 * 退出码 0 表示通过，非 0 表示阻断发布。
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmjs.org';
const tagPrefix = 'v';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { name, version } = pkg;

const MARK_OK = '✓';
const MARK_FAIL = '✗';
const MARK_WARN = '!';
let failed = false;

/** 运行 git 命令并返回 trimmed 输出（stdout）。 */
function runGit(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function log(mark, msg) {
  console.log(`  ${mark} ${msg}`);
}

/** 从 npm registry 读取所有已发布的版本号；包不存在时返回 null。 */
async function fetchPublishedVersions() {
  const url = `${registry.replace(/\/+$/, '')}/${encodeURIComponent(name)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`registry 返回 HTTP ${res.status}`);
  const data = await res.json();
  return data.versions ? Object.keys(data.versions) : [];
}

function tagExists(tag) {
  try {
    runGit(['rev-parse', '--verify', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function commitsSince(tag) {
  return runGit(['log', `${tag}..HEAD`, '--oneline'])
    .split('\n')
    .filter(Boolean);
}

// ── 1. 版本合规 ────────────────────────────────────────────────
console.log(`\n[1/4] 版本合规检查（package.json version = ${version}）`);
if (!semver.valid(version)) {
  log(MARK_FAIL, `"${version}" 不是合法的 SemVer，请先修正 package.json`);
  failed = true;
} else {
  log(MARK_OK, `${version} 符合 SemVer 规范`);
}

// ── 2. 版本号与 npm 发布状态 ───────────────────────────────────
console.log(`\n[2/4] 版本号占用检查（npm 包 ${name}）`);
let published = false;
try {
  const versions = await fetchPublishedVersions();
  published = versions ? versions.includes(version) : false;
} catch (err) {
  log(MARK_WARN, `无法访问 npm registry（${err.message}），跳过占用检查`);
}

if (published) {
  const tag = `${tagPrefix}${version}`;
  const hasTag = tagExists(tag);
  const hasNewCommits = hasTag ? commitsSince(tag).length > 0 : true;
  if (hasNewCommits) {
    log(MARK_OK, `${version} 已在 npm 发布，但 ${tag} 之后有新提交，release-it 将自动递增版本号`);
  } else {
    log(MARK_FAIL, `${version} 已在 npm 发布，且 ${tag} 之后没有新提交 —— 没有可发布的内容，请先提交变更`);
    failed = true;
  }
} else {
  log(MARK_OK, `${version} 未在 npm 发布过，可以发布`);
}

// ── 3. GitHub Release 前置 ─────────────────────────────────────
const gitHubToken = process.env.GITHUB_PAT_TOKEN || process.env.GITHUB_TOKEN;
console.log('\n[3/4] GitHub Release 前置检查');
if (gitHubToken) {
  log(MARK_OK, 'GitHub PAT 已设置（GITHUB_PAT_TOKEN 或 GITHUB_TOKEN）');
} else {
  log(MARK_FAIL, '缺少 GitHub PAT。请设置环境变量 GITHUB_PAT_TOKEN（或 GITHUB_TOKEN）：`gh auth login` 后 `gh auth token`，再 `$env:GITHUB_PAT_TOKEN = "<token>"`');
  failed = true;
}

// ── 4. npm 认证 ────────────────────────────────────────────────
console.log('\n[4/4] npm 认证检查');
// Windows 上 npm 是 npm.cmd（无 npm.exe），必须经 shell 启动，
// 否则 execFileSync 直接执行会 ENOENT/EINVAL。
let npmAuthFailed = false;
try {
  execSync('npm whoami', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  log(MARK_OK, 'npm 已登录，可以发布');
} catch {
  log(MARK_FAIL, 'npm 未登录或认证失败。请先执行 `npm login`（或用 NPM_TOKEN 配置 .npmrc 认证）');
  npmAuthFailed = true;
}

// ── 5. 版本递增提示 ────────────────────────────────────────────
try {
  const lastTag = runGit(['describe', '--tags', '--abbrev=0']);
  const bumpPattern = /^feat(\(|:)|^fix(\(|:)|^perf(\(|:)|^revert(\(|:)|BREAKING CHANGE|!:/i;
  const bumpCount = commitsSince(lastTag).filter((line) => bumpPattern.test(line)).length;
  if (bumpCount === 0) {
    log(
      MARK_WARN,
      `自 ${lastTag} 起没有 feat/fix/perf/revert 或 BREAKING CHANGE 提交；conventional 推荐值不会递增，可在交互提示中手动选择版本，或用 \`pnpm release -- --increment=patch\``
    );
  }
} catch {
  // 仓库尚无 tag（首次发布），无需提示
}

if (failed) {
  console.log('\n检查未通过，发布已中止。请先完成：');
  if (!gitHubToken) {
    console.log('  - 设置 GitHub PAT：`gh auth login` 后执行 `gh auth token`，再 `$env:GITHUB_PAT_TOKEN = "<token>"`（或设置 GITHUB_TOKEN）');
  }
  if (npmAuthFailed) {
    console.log('  - npm 登录：执行 `npm login`');
  }
  console.log();
  process.exit(1);
}

console.log('\n所有检查通过，开始发布。\n');
