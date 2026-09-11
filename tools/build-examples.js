/* 从 examples/ 重新生成 js/examples-bundle.js（把示例嵌入页面，file:// 直开也能加载）。
 * 用法: node tools/build-examples.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const exDir = path.join(__dirname, '..', 'examples');
const names = fs.readdirSync(exDir).filter(f => f.toLowerCase().endsWith('.json')).sort();
const lines = ['window.FE = window.FE || {};', 'FE.EXAMPLE_FILES = {'];
for (const f of names) {
  const text = fs.readFileSync(path.join(exDir, f), 'utf8');
  lines.push('  ' + JSON.stringify(f) + ': ' + JSON.stringify(text) + ',');
}
lines.push('};');
const outPath = path.join(__dirname, '..', 'js', 'examples-bundle.js');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log('bundled ' + names.length + ' files -> ' + outPath);
