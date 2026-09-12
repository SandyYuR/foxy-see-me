/* 从 examples/ 重新生成 js/examples-bundle.js（把示例嵌入页面，file:// 直开也能加载）。
 * 依据文件内容区分 kind：
 *   layout —— foxy.keyboard-layout 布局 profile（出现在布局页示例下拉）
 *   popup  —— foxy.popup-profile 弹出菜单（出现在弹出菜单页示例下拉）
 * 并生成 FE.EXAMPLE_META = { 文件名: { kind, desc } }。
 * 用法: node tools/build-examples.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const exDir = path.join(__dirname, '..', 'examples');
const names = fs.readdirSync(exDir).filter(f => f.toLowerCase().endsWith('.json')).sort();
const lines = ['window.FE = window.FE || {};', 'FE.EXAMPLE_FILES = {'];
const meta = {};
for (const f of names) {
  const text = fs.readFileSync(path.join(exDir, f), 'utf8');
  let kind = 'layout';
  let desc = '';
  const m = text.match(/^\s*\{[\s\S]{0,400}?"type"\s*:\s*"([^"]+)"/);
  const type = m ? m[1] : null;
  if (type === 'foxy.popup-profile') kind = 'popup';
  else {
    /* 宽松探测：有顶层 schemas 且无 layouts 的按弹出菜单处理 */
    if (/"schemas"\s*:/.test(text.slice(0, 400)) && !/"layouts"\s*:/.test(text)) kind = 'popup';
  }
  const am = text.match(/^\s*\{[\s\S]{0,300}?"author"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (am) desc = am[1];
  meta[f] = { kind, desc };
  lines.push('  ' + JSON.stringify(f) + ': ' + JSON.stringify(text) + ',');
}
lines.push('};');
lines.push('FE.EXAMPLE_META = ' + JSON.stringify(meta, null, 2) + ';');
const outPath = path.join(__dirname, '..', 'js', 'examples-bundle.js');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
const layoutN = Object.values(meta).filter(m => m.kind === 'layout').length;
const popupN = Object.values(meta).filter(m => m.kind === 'popup').length;
console.log(`bundled ${names.length} files (${layoutN} layout / ${popupN} popup) -> ${outPath}`);
