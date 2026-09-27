/* 从 examples/ 重新生成 js/examples-bundle.js（把示例嵌入页面，file:// 直开也能加载）。
 * 依据文件内容区分 kind：
 *   layout —— foxy.keyboard-layout 布局 profile（出现在布局页示例下拉）
 *   popup  —— foxy.popup-profile 弹出菜单（出现在弹出菜单页示例下拉）
 *   symbol —— {multiLine, groups} 符号面板数据（出现在符号页「载入示例」下拉）
 * 并生成 FE.EXAMPLE_META = { 文件名: { kind, desc } }。
 * 用法: node tools/build-examples.js
 *
 * 符号文件的 kind 细分（symbols/emoji/kaomoji）**不能只看内容** —— 三者的顶层
 * 结构完全一样（都是 {multiLine, groups}），只能靠文件名里出现的关键词判定；
 * 判不出时按 symbols 处理（不报错：内容合法就该能入库，猜错类别只影响归类）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ⚠️ 解析一律走编辑器自己的 FE.inspectJsonText，**不要**在这里另写一套正则剥离。
 *
 * 踩过的坑：本工具原本用 `text.replace(/(^|[^:\\])\/\/.*$/gm, '$1')` 删行注释 ——
 * 那个正则不认识字符串，会把**字符串内部**的 `//` 当注释。颜文字 `(˶///˶)` 正中此枪：
 * 该行后半段（含闭合引号）被整段删掉，于是在字符串里露出裸换行，
 * 打包直接抛「Bad control character in string literal」。
 * 而文件本身是**合法 JSON**（`JSON.parse(raw)` 通过）—— 是剥离逻辑把它搞坏的。
 *
 * 编辑器里的 inspectJsonText 是逐字符状态机，字符串内的 `//` 会被正确当内容
 * （见 js/app.js 的双引号字符串分支）。复用它 = 打包器与运行期**同一套解析语义**，
 * 不会各自漂移；也顺带让示例文件享有同样的宽容修复（注释/尾逗号/全角标点）。
 */
function loadFE() {
  global.window = global;
  const f = (name) => {
    const p = path.join(__dirname, '..', 'js', name);
    if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: name });
  };
  f('data.js');
  f('app.js');
  return global.FE;
}
const FE = loadFE();

const exDir = path.join(__dirname, '..', 'examples');
const names = fs.readdirSync(exDir).filter(f => f.toLowerCase().endsWith('.json')).sort();
const lines = ['window.FE = window.FE || {};', 'FE.EXAMPLE_FILES = {'];
const meta = {};

/* 解析示例文本 → 对象；先严格解析，不通过再走编辑器的修复器。 */
function parseExample(text, fileName) {
  try { return JSON.parse(text); } catch (e) { /* 交给修复器 */ }
  const rep = FE.inspectJsonText(text);
  if (!rep.parseOk) {
    throw new Error(`无法解析示例 ${fileName}: ${rep.parseError || '未知错误'}`);
  }
  try { return JSON.parse(rep.fixedText); }
  catch (e) { throw new Error(`无法解析示例 ${fileName}: ${e.message}`); }
}

/* 文件名 → 符号类别。顺序有意义：先判颜文字/emoji 这类更具体的词。 */
function symbolKindOf(fileName) {
  const n = String(fileName).toLowerCase();
  if (n.indexOf('颜文字') >= 0 || n.indexOf('kaomoji') >= 0) return 'kaomoji';
  if (n.indexOf('表情') >= 0 || n.indexOf('emoji') >= 0) return 'emoji';
  if (n.indexOf('符号') >= 0 || n.indexOf('symbol') >= 0) return 'symbols';
  return 'symbols';
}
for (const f of names) {
  const text = fs.readFileSync(path.join(exDir, f), 'utf8');
  const parsed = parseExample(text, f);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`示例 ${f} 的根节点必须是对象`);
  let kind, symKind = null;
  if (parsed.type === 'foxy.popup-profile') kind = 'popup';
  else if (parsed.type === 'foxy.keyboard-layout') kind = 'layout';
  else if (parsed.type === 'foxy.keyboard-theme') kind = 'theme';
  /* 符号面板数据：顶层恰为 {multiLine, groups}（groups 是数组）。
   * 布局没有 groups、弹出菜单也没有这两个键，所以不与上面冲突。
   * ⚠️ 必须排在 layouts/schemas 兜底判定**之前**，否则会被误判成 layout
   * （历史上就是因为缺这条，这三个文件一入库就抛「无法判断示例类型」）。 */
  else if (Array.isArray(parsed.groups) && !parsed.layouts && !parsed.schemas) {
    kind = 'symbol';
    symKind = symbolKindOf(f);
  }
  else if (parsed.schemas && !parsed.layouts) kind = 'popup';
  else if (parsed.layouts && !parsed.schemas) kind = 'layout';
  else throw new Error(`无法判断示例类型 ${f}，请设置 type 或唯一的 layouts/schemas/groups`);
  /* desc：布局/弹出菜单用 author，主题用 name（作者字段主题里通常没有，
   * 而主题的文件名与内部 name 可能不一致，把 name 显示出来更好认）。 */
  const desc = kind === 'theme'
    ? (typeof parsed.name === 'string' ? parsed.name : '')
    : (typeof parsed.author === 'string' ? parsed.author : '');
  meta[f] = symKind ? { kind: kind, symbolKind: symKind, desc: desc } : { kind: kind, desc: desc };
  lines.push('  ' + JSON.stringify(f) + ': ' + JSON.stringify(text) + ',');
}
lines.push('};');
lines.push('FE.EXAMPLE_META = ' + JSON.stringify(meta, null, 2) + ';');
lines.push('');
lines.push('/* 符号类示例按类别索引：{ symbols: {文件名: 文本}, emoji: {...}, kaomoji: {...} }。');
lines.push(' * 符号页的「载入示例」按当前类别取这里，而不是按文件名 ——');
lines.push(' * 文件名是给人看的，类别才是程序的键（改名不该让功能失效）。 */');
lines.push('FE.SYMBOL_EXAMPLE_FILES = (function () {');
lines.push('  var out = { symbols: {}, emoji: {}, kaomoji: {} };');
lines.push('  var files = FE.EXAMPLE_FILES, m = FE.EXAMPLE_META;');
lines.push('  Object.keys(files).forEach(function (n) {');
lines.push('    var info = m[n];');
lines.push('    if (!info || info.kind !== "symbol") return;');
lines.push('    var k = out[info.symbolKind] ? info.symbolKind : "symbols";');
lines.push('    out[k][n] = files[n];');
lines.push('  });');
lines.push('  return out;');
lines.push('})();');
lines.push('');
lines.push('/* 主题类示例（文件名 → 文本）。主题页「载入示例」用这里。');
lines.push(' * 与符号一样按 kind 索引，调用方不必自己过滤 EXAMPLE_META。 */');
lines.push('FE.THEME_EXAMPLE_FILES = (function () {');
lines.push('  var out = {};');
lines.push('  var files = FE.EXAMPLE_FILES, m = FE.EXAMPLE_META;');
lines.push('  Object.keys(files).forEach(function (n) {');
lines.push('    var info = m[n];');
lines.push('    if (info && info.kind === "theme") out[n] = files[n];');
lines.push('  });');
lines.push('  return out;');
lines.push('})();');
const outPath = path.join(__dirname, '..', 'js', 'examples-bundle.js');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
const defaultSource = fs.readFileSync(path.join(exDir, 'layout-variant.json'), 'utf8');
const defaultPath = path.join(__dirname, '..', 'js', 'default-profile.js');
fs.writeFileSync(defaultPath, 'window.FE = window.FE || {};\nFE.DEFAULT_PROFILE_TEXT=' + JSON.stringify(defaultSource) + ';\n');
const layoutN = Object.values(meta).filter(m => m.kind === 'layout').length;
const popupN = Object.values(meta).filter(m => m.kind === 'popup').length;
const symN = Object.values(meta).filter(m => m.kind === 'symbol').length;
const themeN = Object.values(meta).filter(m => m.kind === 'theme').length;
console.log(`bundled ${names.length} files (${layoutN} layout / ${popupN} popup / ${symN} symbol / ${themeN} theme) -> ${outPath}; default -> ${defaultPath}`);
