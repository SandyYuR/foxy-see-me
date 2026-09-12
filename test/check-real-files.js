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

  let errs = [], warns = [];
  if (parsed) {
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
  console.log(flag + ' ' + name + (isPopup ? ' [弹出菜单]' : '') +
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
