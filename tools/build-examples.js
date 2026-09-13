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
function stripJsonCommentsAndTrailingCommas(text) {
  return text.replace(/^\uFEFF/, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
}
for (const f of names) {
  const text = fs.readFileSync(path.join(exDir, f), 'utf8');
  let parsed;
  try { parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(text)); }
  catch (e) { throw new Error(`无法解析示例 ${f}: ${e.message}`); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`示例 ${f} 的根节点必须是对象`);
  let kind;
  if (parsed.type === 'foxy.popup-profile') kind = 'popup';
  else if (parsed.type === 'foxy.keyboard-layout') kind = 'layout';
  else if (parsed.schemas && !parsed.layouts) kind = 'popup';
  else if (parsed.layouts && !parsed.schemas) kind = 'layout';
  else throw new Error(`无法判断示例类型 ${f}，请设置 type 或唯一的 layouts/schemas`);
  const desc = typeof parsed.author === 'string' ? parsed.author : '';
  meta[f] = { kind, desc };
  lines.push('  ' + JSON.stringify(f) + ': ' + JSON.stringify(text) + ',');
}
lines.push('};');
lines.push('FE.EXAMPLE_META = ' + JSON.stringify(meta, null, 2) + ';');
const outPath = path.join(__dirname, '..', 'js', 'examples-bundle.js');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
const defaultSource = fs.readFileSync(path.join(exDir, 'layout-variant.json'), 'utf8');
const defaultPath = path.join(__dirname, '..', 'js', 'default-profile.js');
fs.writeFileSync(defaultPath, 'window.FE = window.FE || {};\nFE.DEFAULT_PROFILE_TEXT=' + JSON.stringify(defaultSource) + ';\n');
const layoutN = Object.values(meta).filter(m => m.kind === 'layout').length;
const popupN = Object.values(meta).filter(m => m.kind === 'popup').length;
console.log(`bundled ${names.length} files (${layoutN} layout / ${popupN} popup) -> ${outPath}; default -> ${defaultPath}`);
