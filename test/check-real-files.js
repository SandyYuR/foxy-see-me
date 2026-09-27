'use strict';
/* 用真实文件体检 JSON 问题与校验结果。
 * 默认扫描 ../examples/（即工作区「布局/」的镜像）；
 * 也可以传入目录或文件路径：node test/check-real-files.js [路径…]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.window = global;
function load(f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
load('data.js');
load('app.js');
load('popup-editor.js');
/* 符号文件（{multiLine, groups}）的校验要用 normalizeSymbolProfile/符号类别元数据，
 * 所以在 symbol-editor.js 之后再取 FE —— 少了它，体检遇到符号文件会直接抛。 */
load('symbol-editor.js');
const FE = global.FE;

/* 收集目标文件 */
let targets = process.argv.slice(2);
if (!targets.length) {
  targets = [path.join(__dirname, '..', 'examples')];
}
let files = [];
for (const t of targets) {
  const st = fs.statSync(t);
  if (st.isDirectory()) {
    files = files.concat(fs.readdirSync(t).filter(f => f.toLowerCase().endsWith('.json'))
      .map(f => path.join(t, f)));
  } else files.push(t);
}
files.sort();

let bad = 0;
for (const p of files) {
  const name = path.basename(p);
  const raw = fs.readFileSync(p, 'utf8');
  const rep = FE.inspectJsonText(raw);
  let strictOk = true;
  try { JSON.parse(raw); } catch (e) { strictOk = false; }
  const parsed = rep.parseOk ? JSON.parse(rep.fixedText) : null;
  const isPopup = parsed && parsed.type === 'foxy.popup-profile';
  /* 符号面板数据（{multiLine, groups}）**不是**布局 profile —— 若无此分支，
   * 会被 normalizeProfile/validateProfile 当成"缺 layouts 的布局"而误报错误。
   * 判定与 tools/build-examples.js 保持同一套（顶层有 groups 且无 layouts/schemas）。 */
  const isSymbol = parsed && Array.isArray(parsed.groups) && !parsed.layouts && !parsed.schemas;

  let errs = [], warns = [];
  if (parsed && isSymbol) {
    const kinds = ['symbols', 'emoji', 'kaomoji'];
    const kind = kinds.find(k => name.toLowerCase().indexOf(k) >= 0) ||
      (/颜文字|kaomoji/i.test(name) ? 'kaomoji' : (/表情|emoji/i.test(name) ? 'emoji' : 'symbols'));
    const norm = FE.normalizeSymbolProfile(kind, parsed);
    /* 符号文件的校验：分组必须有可显示的名字，symbols 必须是字符串数组 */
    norm.groups.forEach((g, gi) => {
      const hasName = Object.keys(g.names || {}).some(k => String(g.names[k] || '').trim() !== '');
      if (!hasName) errs.push('第 ' + (gi + 1) + ' 个分组没有任何语言的名字（App 端无法显示）');
      if (!g.symbols.length) warns.push('第 ' + (gi + 1) + ' 个分组是空的');
    });
    if (!norm.groups.length) errs.push('没有任何分组');
  } else if (parsed) {
    if (isPopup) {
      const r = FE.validatePopupProfile(FE.normalizePopupProfile(parsed));
      errs = r.errors; warns = r.warnings;
    } else {
      FE.state.profile = FE.normalizeProfile(parsed);
      const r = FE.validateProfile(FE.state.profile);
      errs = r.errors; warns = r.warnings;
    }
  }

  const flag = (!rep.parseOk || errs.length) ? '✗' : (rep.total || warns.length) ? '△' : '✓';
  if (flag === '✗') bad++;
  const splitN = parsed && parsed.layouts
    ? Object.keys(parsed.layouts).filter(n => parsed.layouts[n] && parsed.layouts[n].split).length : 0;
  const symInfo = isSymbol
    ? ' [符号 ' + (parsed.groups ? parsed.groups.length : 0) + ' 组 / ' +
      (parsed.groups || []).reduce((a, g) => a + ((g && g.symbols) || []).length, 0) + ' 条' +
      (parsed.multiLine === true ? ' / multiLine' : '') + ']'
    : '';
  console.log(flag + ' ' + name + (isPopup ? ' [弹出菜单]' : '') + symInfo +
    (splitN ? ' [split:' + splitN + ']' : '') +
    (strictOk ? '' : ' · 严格解析失败') +
    (rep.total ? ' · 可修复 ' + rep.total + ' 处' : '') +
    (rep.parseOk ? '' : ' · 修复后仍无法解析: ' + rep.parseError) +
    (errs.length ? ' · ' + errs.length + ' 错误' : '') +
    (warns.length ? ' · ' + warns.length + ' 警告' : ''));
  rep.issues.forEach(i => console.log('    修复项: ' + i.label + ' ×' + i.count + '（行 ' + i.lines.slice(0, 8).join(',') + (i.lines.length > 8 ? ' …' : '') + '）'));
  errs.slice(0, 6).forEach(e => console.log('    E: ' + e));
  warns.slice(0, 3).forEach(w => console.log('    W: ' + w));
}
console.log('\n共 ' + files.length + ' 个文件，' + bad + ' 个存在错误。');
process.exit(rep_parse_bad_exit());
function rep_parse_bad_exit() { return bad ? 1 : 0; }
