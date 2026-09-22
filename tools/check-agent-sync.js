/* 校验 / 同步两份 AGENT.md（见 AGENT.md 开头的「本文件有两份」一节）。
 *
 *   <工作区根>/AGENT.md            ← 便捷副本（不在 git 里）
 *   <工作区根>/foxy-editor/AGENT.md ← 权威副本（随仓库提交）
 *
 * 用法:
 *   node tools/check-agent-sync.js           # 只校验：不一致则打印差异摘要并以退出码 1 结束
 *   node tools/check-agent-sync.js --write   # 以权威副本覆盖外层副本（改完 AGENT.md 用这个）
 *
 * 权威副本永远取仓库内的 foxy-editor/AGENT.md —— 改内容改它，再 --write 同步出去。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');                 // foxy-editor/
const authorityPath = path.join(repoRoot, 'AGENT.md');       // 权威副本
const workspaceRoot = path.join(repoRoot, '..');             // 工作区根
const mirrorPath = path.join(workspaceRoot, 'AGENT.md');     // 外层副本

const write = process.argv.slice(2).includes('--write');

function readNormalized(p) {
  if (!fs.existsSync(p)) return null;
  /* 统一换行并用 UTF-8 读取，避免 CRLF/LF 造成的假差异 */
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const authority = readNormalized(authorityPath);
if (authority === null) {
  console.error('✗ 找不到权威副本: ' + authorityPath);
  process.exit(1);
}
const mirror = readNormalized(mirrorPath);

if (mirror !== null && mirror === authority) {
  console.log('✓ 两份 AGENT.md 一致');
  console.log('  ' + workspaceRoot + '\\AGENT.md');
  console.log('  ' + authorityPath);
  process.exit(0);
}

if (write) {
  fs.writeFileSync(mirrorPath, authority, 'utf8');
  console.log('✓ 已用权威副本覆盖外层副本');
  console.log('  源: ' + authorityPath);
  console.log('  目标: ' + mirrorPath);
  process.exit(0);
}

/* 外层副本不存在 ≠ 不一致：刚克隆本仓库时它本来就没有（它不在 git 里）。
 * 这不是错误，提示一下即可，不要卡住别人的测试流程。 */
if (mirror === null) {
  console.log('· 外层副本尚不存在（正常：它不在 git 里）');
  console.log('  权威: ' + authorityPath);
  console.log('  如需创建: node tools/check-agent-sync.js --write');
  process.exit(0);
}

/* 未写模式：报告差异，方便定位是哪一段漂移了 */
console.error('✗ 两份 AGENT.md 不一致');
console.error('  权威: ' + authorityPath);
console.error('  副本: ' + mirrorPath + (mirror === null ? '（不存在）' : ''));
if (mirror !== null) {
  const a = authority.split('\n');
  const b = mirror.split('\n');
  const max = Math.max(a.length, b.length);
  let diffs = 0;
  for (let i = 0; i < max && diffs < 5; i++) {
    if (a[i] !== b[i]) {
      diffs++;
      console.error('  首个差异附近 第 ' + (i + 1) + ' 行:');
      console.error('    权威: ' + JSON.stringify((a[i] || '').slice(0, 90)));
      console.error('    副本: ' + JSON.stringify((b[i] || '').slice(0, 90)));
    }
  }
  if (diffs === 0) console.error('  （仅行数不同：权威 ' + a.length + ' 行 / 副本 ' + b.length + ' 行）');
}
console.error('\n修复: node tools/check-agent-sync.js --write');
process.exit(1);
