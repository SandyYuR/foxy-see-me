/* 小狐狸 see me — 核心逻辑测试（Node 环境）
 * 用法: node test/test-core.js
 * 加载 data.js / default-profile.js / app.js（纯逻辑部分），对解析引擎、
 * 变体合并、行权重、网格与校验器做断言。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* 浏览器全局垫片（app.js 的 UI 部分会因缺少 #preview-kb 而跳过初始化） */
global.window = global;
const vm = require('vm');
function load(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInThisContext(code, { filename: file });
}
load('data.js');
load('default-profile.js');
load('app.js');
load('key-dialog.js');

const FE = global.FE;
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, msg + ' — 期望 ' + jb + ' 实际 ' + ja);
}

/* ---------------- 基础注册表 ---------------- */
console.log('== 内置注册表 ==');
ok(FE.BUILTIN_KEYS['rime.q'], 'rime.q 存在');
ok(FE.BUILTIN_KEYS['rime.KP_Enter'], 'rime.KP_Enter 存在');
ok(FE.BUILTIN_KEYS['foxy.Shift'], 'foxy.Shift 存在');
eq(FE.BUILTIN_KEYS['rime.exclam'].label, '!', 'rime.exclam 标签');
eq(FE.BUILTIN_KEYS['foxy.LayoutNumpad'].label, '123', 'foxy.LayoutNumpad 标签');
ok(FE.DEFAULT_PROFILE_TEXT.length > 1000, '内置默认 profile 已加载');

/* ---------------- 载入默认 profile 并测试解析引擎 ---------------- */
console.log('== 解析引擎 ==');
const profile = FE.normalizeProfile(JSON.parse(FE.DEFAULT_PROFILE_TEXT));
FE.state.profile = profile;
FE.state.status = { composing: false, ascii_mode: false, disabled: false, shift: false };

/* qwerty.q → rime.q */
let ev = FE.evalPlacement({ ref: 'qwerty.q' }, FE.NEUTRAL_STATUS);
eq(ev.chain, ['rime.q', 'qwerty.q'], 'qwerty.q 解析链');
eq(FE.rawLabelOf(ev.eff, FE.NEUTRAL_STATUS), 'q', 'qwerty.q 主标签');
eq(ev.eff.swipe && ev.eff.swipe.up && ev.eff.swipe.up.ref, 'rime.Q', 'qwerty.q 上滑引用');

/* qwerty.space → rime.space，带 statusLabel */
ev = FE.evalPlacement({ ref: 'qwerty.space' }, FE.NEUTRAL_STATUS);
eq(ev.eff.statusLabel, 'schema_name', 'space statusLabel');
eq(ev.eff.weight, 5, 'space 权重');

/* foxy.Shift 引用 + longPress */
ev = FE.evalPlacement({ ref: 'qwerty.shift' }, FE.NEUTRAL_STATUS);
eq(ev.eff.icon, 'shift', 'shift 图标');
eq(ev.eff.modifier, 'SHIFT', 'shift 修饰键');

/* 仓颉放置：override label */
const cangjieQ = profile.layouts.cangjie5.sections[0].rows[0][0];
ev = FE.evalPlacement(cangjieQ, FE.NEUTRAL_STATUS);
eq(FE.rawLabelOf(ev.eff, FE.NEUTRAL_STATUS), '手', '仓颉 q 显示 手');

/* 状态变体：composing 时逗号变 2 */
ev = FE.evalPlacement({ ref: 'qwerty.comma' }, { composing: true, ascii_mode: false, disabled: false });
eq(FE.rawLabelOf(ev.eff, { composing: true, ascii_mode: false, disabled: false }), '2', '组字时逗号显示 2');
let ti = FE.tapInfo(ev.eff, { composing: true, ascii_mode: false, disabled: false });
ok(ti && ti.action && ti.action.actions[0].type === 'key' && ti.action.actions[0].key === 'DIGIT_2', '组字时逗号点击动作为 rime.2');

/* 布局变体：ascii 时 cangjie5 → default */
eq(FE.resolvePreviewLayout(profile, 'cangjie5', { composing: false, ascii_mode: true, disabled: false }), 'default', '仓颉 ASCII 切回 default');

/* tap 带 action 对象（qwerty.layout） */
ev = FE.evalPlacement({ ref: 'qwerty.layout' }, FE.NEUTRAL_STATUS);
ti = FE.tapInfo(ev.eff, FE.NEUTRAL_STATUS);
ok(ti && ti.action && ti.action.actions[0].type === 'switch_layout', 'qwerty.layout tap 为 switch_layout');
eq(ti.action.actions[0].layout, 'numpad', 'switch_layout 目标 numpad');

/* swipe 手势信息（上滑提示标签继承自目标） */
let gi = FE.gestureInfo({ ref: 'rime.Q' }, FE.NEUTRAL_STATUS);
eq(gi.label, 'Q', '手势引用继承目标标签');
gi = FE.gestureInfo({ ref: 'rime.Q', label: '大写Q' }, FE.NEUTRAL_STATUS);
eq(gi.label, '大写Q', '手势显式标签覆盖');

/* hold 引用继承 start/end（数字行示例中无，构造一个） */
profile.keys['__t.holdkey'] = { ref: 'rime.a', hold: { label: 'Mic', start: { type: 'app', command: 'voice_start' }, end: { type: 'app', command: 'voice_stop' } } };
gi = FE.gestureInfo({ ref: '__t.holdkey' }, FE.NEUTRAL_STATUS);
ok(gi.start && gi.start.command === 'voice_start', 'hold 引用继承 start');
delete profile.keys['__t.holdkey'];

/* 长按 repeat 动作 */
gi = FE.gestureInfo({ label: '⌫', repeat: true, action: { type: 'key', key: 'BACKSPACE' } }, FE.NEUTRAL_STATUS);
ok(gi.repeat === true && gi.action.actions[0].key === 'BACKSPACE', 'longPress repeat + 动作');
eq(gi.action.display, 'BACKSPACE', '动作显示文本');

/* swipe null 合并语义 */
let eff2 = FE.mergePatch({ swipe: { up: 1, down: 2, left: 3 } }, { swipe: { up: null, right: { ref: 'rime.x' } } });
eq(Object.keys(eff2.swipe).sort(), ['down', 'left', 'right'], 'swipe 按方向合并/删除');
eff2 = FE.mergePatch({ swipe: { up: 1 } }, { swipe: null });
eq(eff2.swipe, {}, 'swipe:null 清空全部');
eff2 = FE.mergePatch({ label: 'a', longPress: { repeat: true } }, { longPress: null });
ok(eff2.longPress === null, 'longPress:null 显式清除');
eff2 = FE.mergePatch({ tap: { ref: 'rime.a' } }, { tap: null });
ok(eff2.tap && eff2.tap.ref === 'rime.a', 'tap:null 保留继承');

/* ---------------- 行与网格计算 ---------------- */
console.log('== 行/网格计算 ==');
let section = { type: 'rows', rows: [[{ ref: 'rime.q' }], [{ ref: 'rime.w' }], [{ ref: 'rime.e' }]] };
let rows = FE.rowsOfSection(section);
eq(rows[0].heightUnits, 5 / 3, '默认行高 5/行数');
eq(rows[2].heightUnits, 5 / 3, '每行获得相同默认高度');

section = { type: 'rows', rows: [{ width: 0.9, height: 1.2, keys: [{ ref: 'rime.a' }, { ref: 'rime.b' }] }] };
rows = FE.rowsOfSection(section);
eq(rows[0].heightUnits, 1.2, '对象行显式高度');
eq(rows[0].width, 0.9, '对象行宽度');

/* weight auto */
let row = { totalWeight: 10, keys: [{ ref: 'rime.a' }, { ref: 'rime.b', weight: 2 }, { ref: 'rime.c', weight: 'auto' }] };
eq(FE.rowWeights(row), [1, 2, 7], 'auto 权重获得剩余值');
row = { keys: [{ ref: 'rime.a' }, { ref: 'rime.b' }] };
eq(FE.rowWeights(row), [1, 1], '默认权重 1');

/* 布局高度单位 */
const units = FE.layoutHeightUnits(profile.layouts.default);
eq(Math.round(units * 100) / 100, 5, 'default 四行总高度 5 单位');
const npUnits = FE.layoutHeightUnits(profile.layouts.numpad);
eq(Math.round(npUnits * 100) / 100, 5, 'numpad 网格总高度 5 单位');

/* ---------------- 校验器 ---------------- */
console.log('== 校验器 ==');
let v = FE.validateProfile(profile);
eq(v.errors, [], '默认 profile 无错误');
ok(v.warnings.length === 0, '默认 profile 无警告');

/* 制造各种错误 */
const broken = FE.normalizeProfile(JSON.parse(FE.DEFAULT_PROFILE_TEXT));
broken.keys['bad.key'] = { ref: 'no.such.key' };
broken.layouts.default.sections[0].rows[0].push({ ref: 'also.missing' });
broken.keys['conflict'] = { ref: 'rime.a', hold: { start: { type: 'app', command: 'undo' } }, longPress: { repeat: true, action: { type: 'key', key: 'A' } } };
broken.layouts.default.sections[0].rows.push({ totalWeight: 2, keys: [{ ref: 'rime.a', weight: 2 }, { ref: 'rime.b', weight: 'auto' }] });
broken.layouts['gridbad'] = {
  sections: [{
    type: 'grid', columns: 2, rows: 2,
    keys: [
      { column: 0, row: 0, ref: 'rime.KP_1' },
      { column: 0, row: 0, ref: 'rime.KP_2' },
      { column: 1, row: 1, ref: 'rime.KP_3', rowSpan: 2 }
    ]
  }]
};
broken.layouts['cyc'] = { variants: [{ when: { rime: { composing: true } }, layout: 'cyc2' }], sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] };
broken.layouts['cyc2'] = { variants: [{ when: { rime: { composing: true } }, layout: 'cyc' }], sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] };
v = FE.validateProfile(broken);
const msgs = v.errors.join('\n');
ok(msgs.indexOf('no.such.key') >= 0, '未解析 ref 被检出');
ok(msgs.indexOf('also.missing') >= 0, '放置未解析 ref 被检出');
ok(msgs.indexOf('hold 与 longPress') >= 0, 'hold+longPress 冲突被检出');
ok(msgs.indexOf('totalWeight') >= 0, 'auto 权重不足被检出');
ok(msgs.indexOf('重叠') >= 0, '网格重叠被检出');
ok(msgs.indexOf('超出网格范围') >= 0, '网格越界被检出');
ok(msgs.indexOf('布局变体存在循环') >= 0, '布局变体循环被检出');

/* 引用链循环 */
broken.keys['c1'] = { ref: 'c2' };
broken.keys['c2'] = { ref: 'c1' };
v = FE.validateProfile(broken);
ok(v.errors.join('\n').indexOf('循环') >= 0, '按键引用循环被检出');

/* 高度单位不一致警告 */
const warnP = FE.normalizeProfile({ layouts: { a: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] }, b: { sections: [{ type: 'rows', rows: [{ height: 2, keys: [{ ref: 'rime.a' }] }] }] } } });
v = FE.validateProfile(warnP);
ok(v.warnings.join('\n').indexOf('高度单位不一致') >= 0, '高度单位不一致警告');
eq(v.errors.filter(e => e.indexOf('缺少点击动作') >= 0).length, 0, 'rime.a 直接放置有 tap，不算缺失');

/* 内联按键缺 tap */
const noTap = FE.normalizeProfile({ layouts: { a: { sections: [{ type: 'rows', rows: [[{ label: 'x' }]] }] } } });
v = FE.validateProfile(noTap);
ok(v.errors.join('\n').indexOf('缺少点击动作') >= 0, '内联缺 tap 被检出');

/* ---------------- 序列化 ---------------- */
console.log('== 序列化 ==');
const ser = FE.serializeProfile(FE.normalizeProfile({ layouts: { default: { sections: [] } }, author: 'x' }));
const serObj = JSON.parse(ser);
eq(serObj.type, 'foxy.keyboard-layout', '序列化补 type');
ok(ser.indexOf('"type"') < ser.indexOf('"author"'), 'type 在最前');

/* ---------------- 宽松 JSON 导入 ---------------- */
console.log('== 宽松 JSON 导入（BOM / 尾逗号） ==');
const exDir = path.join(__dirname, '..', 'examples');
eq(FE.sanitizeJsonText('{"a":1,}'), '{"a":1}', '清理对象尾逗号');
eq(FE.sanitizeJsonText('{"a":[1,2,3,],}'), '{"a":[1,2,3]}', '清理数组与对象尾逗号');
eq(FE.sanitizeJsonText('{"a":"x,}","b":[1,]}'), '{"a":"x,}","b":[1]}', '字符串内的逗号不受影响');
eq(FE.sanitizeJsonText('{"a":"b\\",c"}'), '{"a":"b\\",c"}', '转义引号不破坏字符串状态');
eq(FE.sanitizeJsonText('\uFEFF{"a":1,\n}'), '{"a":1\n}', 'BOM 与跨行尾逗号均被清理');
eq(FE.sanitizeJsonText('{"a":[],\n\n"b":{},\n}'), '{"a":[],\n\n"b":{}\n}', '跨行尾逗号清理');

/* cc lite.json：原文件含尾逗号，严格解析必须失败，宽松解析后应校验通过 */
const ccRaw = fs.readFileSync(path.join(exDir, 'cc lite.json'), 'utf8');
let strictThrew = false;
try { JSON.parse(ccRaw); } catch (e) { strictThrew = true; }
ok(strictThrew, 'cc lite.json 原文含尾逗号，严格 JSON.parse 失败（复现导入问题）');
const ccLite = FE.normalizeProfile(JSON.parse(FE.sanitizeJsonText(ccRaw)));
ok(ccLite.layouts && ccLite.layouts.default && ccLite.layouts.numpad, '宽松解析后得到 default/numpad 布局');
FE.state.profile = ccLite;
const ccv = FE.validateProfile(ccLite);
eq(ccv.errors, [], 'cc lite.json 宽松导入后校验无错误');
eq(ccv.warnings, [], 'cc lite.json 校验无警告');
eq(FE.rawLabelOf(FE.evalPlacement(ccLite.layouts.default.sections[0].rows[0][0], FE.NEUTRAL_STATUS).eff, FE.NEUTRAL_STATUS), 'ㄅ', '注音标签解析');
FE.state.profile = profile;

/* ---------------- 示例文件全部校验 ---------------- */
console.log('== 工作区示例文件 ==');
for (const f of fs.readdirSync(exDir)) {
  const p = FE.normalizeProfile(JSON.parse(FE.sanitizeJsonText(fs.readFileSync(path.join(exDir, f), 'utf8'))));
  FE.state.profile = p;
  const r = FE.validateProfile(p);
  eq(r.errors, [], f + ' 无错误');
}
FE.state.profile = profile;

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
