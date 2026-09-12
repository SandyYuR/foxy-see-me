'use strict';
/* 用真实文件验证诊断结果（一次性检查脚本） */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.window = global;
function load(f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
load('data.js');
load('app.js');
const FE = global.FE;

for (const f of ['cc lite.json', 'number-row.json', 'default-with-edit.json']) {
  const p = path.join(__dirname, '..', 'examples', f);
  if (!fs.existsSync(p)) { console.log(f + ': 不存在'); continue; }
  const raw = fs.readFileSync(p, 'utf8');
  const rep = FE.inspectJsonText(raw);
  let strictOk = true;
  try { JSON.parse(raw); } catch (e) { strictOk = false; }
  console.log('--- ' + f + ' ---');
  console.log('严格 JSON.parse: ' + (strictOk ? '通过' : '失败'));
  console.log('可修复问题总数: ' + rep.total);
  rep.issues.forEach(i => console.log('  · ' + i.label + ' ×' + i.count + '（行 ' + i.lines.slice(0, 8).join(',') + (i.lines.length > 8 ? ' …' : '') + '）'));
  console.log('修复后可解析: ' + rep.parseOk);
  if (rep.parseOk) {
    FE.state.profile = FE.normalizeProfile(JSON.parse(rep.fixedText));
    const v = FE.validateProfile(FE.state.profile);
    console.log('修复后校验: ' + v.errors.length + ' 错误 / ' + v.warnings.length + ' 警告');
  }
}
