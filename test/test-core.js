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
load('folder-import.js');
load('key-dialog.js');
load('macro-editor.js');
load('popup-editor.js');

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

/* 手势级 hint 字段（与 label 并列的补丁字段，文档：gesture patch fields） */
gi = FE.gestureInfo({ ref: 'rime.Q', hint: '提示Q' }, FE.NEUTRAL_STATUS);
eq(gi.hint, '提示Q', '手势显式 hint 生效');
eq(gi.label, 'Q', '显式 hint 不影响 label');
gi = FE.gestureInfo({ ref: 'rime.Q' }, FE.NEUTRAL_STATUS);
ok(gi.hint == null, '无 hint 的手势引用不产生 hint（回落 label）');
profile.keys['__t.hintkey'] = { ref: 'rime.a', tap: { ref: 'rime.b', hint: '继承提示' } };
gi = FE.gestureInfo({ ref: '__t.hintkey' }, FE.NEUTRAL_STATUS);
eq(gi.hint, '继承提示', '手势引用继承被引用按键 tap 的 hint');
delete profile.keys['__t.hintkey'];

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

/* ---------------- JSON 诊断与一键修复 ---------------- */
console.log('== JSON 诊断（inspectJsonText） ==');

/* 尾逗号：类型/次数/行号/位置 + 修复结果 */
let rep = FE.inspectJsonText('{\n  "a": 1,\n  "b": 2,\n}');
eq(rep.issues.length, 1, '只报告一类问题');
eq(rep.issues[0].kind, 'trailingComma', '问题类型 = 尾逗号');
eq(rep.issues[0].count, 1, '尾逗号计数 = 1');
eq(rep.issues[0].lines, [3], '尾逗号行号 = 3');
ok(typeof rep.issues[0].positions[0] === 'number' && rep.issues[0].positions[0] > 0, '提供字符位置（可定位）');
eq(rep.total, 1, '问题总数 = 1');
ok(rep.parseOk, '修复后可正常解析');
eq(JSON.parse(rep.fixedText).b, 2, '修复文本内容正确');
ok(rep.changed, 'changed 标记为 true');

/* 干净 JSON：无问题 */
rep = FE.inspectJsonText('{"a": 1}');
eq(rep.total, 0, '正常 JSON 无问题');
ok(rep.parseOk && !rep.changed, '正常 JSON 无需改动');

/* BOM */
rep = FE.inspectJsonText('\uFEFF{"a": 1}');
eq(rep.issues[0].kind, 'bom', '检出 BOM');
ok(rep.parseOk && rep.fixedText === '{"a": 1}', 'BOM 被移除');

/* 注释 */
rep = FE.inspectJsonText('{\n  // 这是注释\n  "a": 1\n}');
eq(rep.issues[0].kind, 'lineComment', '检出 // 行注释');
eq(rep.issues[0].lines, [2], '注释行号正确');
ok(rep.parseOk, '移除注释后可解析');
rep = FE.inspectJsonText('{ /* 块注释\n 跨行 */ "a": 1 }');
eq(rep.issues[0].kind, 'blockComment', '检出块注释');
ok(rep.parseOk && JSON.parse(rep.fixedText).a === 1, '移除块注释后可解析');

/* 单引号字符串 → 双引号（含转义与内嵌双引号） */
rep = FE.inspectJsonText("{'a': 'b'}");
eq(rep.issues[0].kind, 'singleQuote', '检出单引号字符串');
eq(rep.issues[0].count, 2, '两处单引号字符串');
ok(rep.parseOk && JSON.parse(rep.fixedText).a === 'b', '单引号转双引号后可解析');
rep = FE.inspectJsonText("{'a': 'it\\'s \"x\"'}");
eq(JSON.parse(rep.fixedText).a, 'it\'s "x"', '单引号内的转义与双引号处理正确');

/* 未加引号的键名 */
rep = FE.inspectJsonText('{a: 1, bcd: 2}');
eq(rep.issues[0].kind, 'unquotedKey', '检出未加引号键名');
eq(rep.issues[0].count, 2, '两个未加引号键名');
ok(rep.parseOk && JSON.parse(rep.fixedText).bcd === 2, '键名补引号后可解析');

/* 全角标点 / 引号 */
rep = FE.inspectJsonText('{“a”：1，}');
ok(rep.issues.some(i => i.kind === 'fullwidth'), '检出全角标点');
ok(rep.issues.some(i => i.kind === 'trailingComma'), '同时检出尾逗号');
ok(rep.parseOk && JSON.parse(rep.fixedText).a === 1, '全角标点修复后可解析');

/* 字符串内部内容必须原样保留 */
rep = FE.inspectJsonText('{"a": "x,} // 不是注释 \'q\'，全角“引号”",}');
ok(rep.parseOk, '含敏感内容的字符串修复后可解析');
eq(JSON.parse(rep.fixedText).a, 'x,} // 不是注释 \'q\'，全角“引号”', '字符串内容原样保留');

/* 无法自动修复的错误：issues 为空但 parseOk=false */
rep = FE.inspectJsonText('{"a": oops}');
eq(rep.total, 0, '不可修复错误不产生可修复项');
ok(!rep.parseOk && !!rep.parseError, '提供解析错误信息');

/* 修复后仍不可解析的情况 */
rep = FE.inspectJsonText('{"a": 1,,,}');
ok(!rep.parseOk, '修复后仍无法解析时 parseOk=false');
ok(!!rep.parseError, '仍提供错误信息');

/* cc lite.json：真实场景 */
rep = FE.inspectJsonText(ccRaw);
ok(rep.total > 0, 'cc lite.json 检出可修复问题');
ok(rep.issues.some(i => i.kind === 'trailingComma'), '问题类型含尾逗号');
ok(rep.parseOk, '一键修复后可解析');
const ccFixed = FE.normalizeProfile(JSON.parse(rep.fixedText));
FE.state.profile = ccFixed;
eq(FE.validateProfile(ccFixed).errors, [], '一键修复后的 cc lite.json 校验无错误');
FE.state.profile = profile;

/* ---------------- 示例文件全部校验 ---------------- */
console.log('== 工作区示例文件 ==');
for (const f of fs.readdirSync(exDir)) {
  const raw = fs.readFileSync(path.join(exDir, f), 'utf8');
  const p = FE.normalizeProfile(JSON.parse(FE.sanitizeJsonText(raw)));
  if (p && p.type === 'foxy.popup-profile') {
    const pp = FE.normalizePopupProfile(JSON.parse(FE.sanitizeJsonText(raw)));
    const r = FE.validatePopupProfile(pp);
    eq(r.errors, [], f + '（弹出菜单）无错误');
    continue;
  }
  FE.state.profile = p;
  const r = FE.validateProfile(p);
  eq(r.errors, [], f + ' 无错误');
}
FE.state.profile = profile;

/* ---------------- 分体布局（split） ---------------- */
console.log('== 分体布局（split） ==');
/* 示例源已换成工作区 布局/split2.json（旧 examples/split.json 已移除）：
 * split2 = split.json 的超集，多出 cangjie5 的 split 片段与 text_editor 布局。 */
const splitRaw = fs.readFileSync(path.join(exDir, 'split2.json'), 'utf8');
const splitP = FE.normalizeProfile(JSON.parse(FE.sanitizeJsonText(splitRaw)));
ok(splitP.layouts.default && splitP.layouts.default.split, 'split2.json 的 default 含 split 片段');
ok(Array.isArray(splitP.layouts.default.split.sections), 'split 片段含 sections 数组');
eq(Object.keys(splitP.layouts), ['default', 'cangjie5', 'numpad', 'text_editor'], 'split2.json 含 4 个布局（比旧 split.json 多 text_editor）');
ok(!!(splitP.layouts.cangjie5 && splitP.layouts.cangjie5.split), 'cangjie5 也含 split 片段');
FE.state.profile = splitP;
eq(FE.validateProfile(splitP).errors, [], 'split2.json 校验无错误');
/* split 片段非法时被拒绝 */
const badSplit = FE.normalizeProfile(JSON.parse(FE.sanitizeJsonText(splitRaw)));
badSplit.layouts.default.split = { sections: [{ type: 'rows', rows: [[{ ref: 'no.such.key' }]] }] };
ok(FE.validateProfile(badSplit).errors.length > 0, 'split 片段引用错误被检出');
badSplit.layouts.default.split = { sections: [] };
ok(FE.validateProfile(badSplit).errors.length > 0, 'split 片段空 sections 被检出');
badSplit.layouts.default.split = 'not-object';
ok(FE.validateProfile(badSplit).errors.length > 0, 'split 非对象被检出');
/* 常规/分体高度不一致警告 */
const hSplit = FE.normalizeProfile({ layouts: { a: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }], split: { sections: [{ type: 'rows', rows: [{ height: 2, keys: [{ ref: 'rime.a' }] }] }] } } } });
ok(FE.validateProfile(hSplit).warnings.join('\n').indexOf('分体') >= 0, '常规/分体高度不一致警告');
FE.state.profile = profile;

/* ---------------- 弹出菜单（popup profile） ---------------- */
console.log('== 弹出菜单（popup profile） ==');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: ['q', 'ɋ'] } } } }),
  'default', 'q', false), ['q', 'ɋ'], 'normal 候选读取');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: ['q'], shifted: ['Q'] } } } }),
  'default', 'q', true), ['Q'], 'shifted 候选读取');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: ['q'], shifted: ['Q'] } } } }),
  'default', 'q', false), ['q'], '非 shifted 走 normal');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: ['q'] } } } }),
  'default', 'q', true), ['q'], 'shifted 缺失回退 normal');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: {}, my: { q: { shifted: ['Q'] } } } }),
  'my', 'q', true), ['Q'], '指定 schema 的 shifted');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: ['dq'] } }, my: { q: { shifted: ['Q'] } } } }),
  'my', 'q', true), ['Q'], 'schema shifted 优先于 default');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: ['dq'] } }, my: {} } }),
  'my', 'q', false), ['dq'], 'schema 未定义时回退 default');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: { q: { normal: null } } } }),
  'default', 'q', false), null, 'null 显式清除');
eq(FE.popupCandidates(
  FE.normalizePopupProfile({ schemas: { default: {} } }),
  'default', 'zz', false), null, '未定义键返回 null');
/* 候选标签/摘要 */
eq(FE.popupCandidateLabel('ā'), 'ā', '字符串候选标签');
eq(FE.popupCandidateLabel({ label: '行首', action: { type: 'key', key: 'HOME' } }), '行首', '对象候选 label');
eq(FE.popupCandidateLabel({ action: { type: 'key', key: 'HOME' } }), 'HOME', '无 label 用动作摘要');
eq(FE.popupCandidateKind('x'), 'text', '字符串候选类型');
eq(FE.popupCandidateKind({ action: 'a.b' }), 'action-name', '动作名候选');
eq(FE.popupCandidateKind({ macro: 'm' }), 'macro', '宏候选');
eq(FE.popupCandidateKind({ ref: 'k' }), 'ref', '共享键候选');
eq(FE.popupCandidateKind({ actions: [{ type: 'key', key: 'A' }] }), 'actions', 'actions 数组候选');
/* 校验器 */
const ppBad = FE.normalizePopupProfile({
  type: 'foxy.popup-profile',
  schemas: { default: { q: { normal: [{ action: 'no.such' }, { label: 'x' }, null], shifted: 'oops' }, bad: 'x' } }
});
const ppr = FE.validatePopupProfile(ppBad);
const ppm = ppr.errors.join('\n');
ok(ppm.indexOf('no.such') >= 0, '引用不存在的动作被检出');
ok(ppm.indexOf('缺少 action / actions / macro / ref') >= 0, '无动作对象候选被检出');
/* actions 数组候选：合法则通过、内部非法动作被检出 */
const ppActions = FE.normalizePopupProfile({
  type: 'foxy.popup-profile',
  schemas: { default: { q: { normal: [{ actions: [{ type: 'key', key: 'A' }] }] } } }
});
eq(FE.validatePopupProfile(ppActions).errors, [], 'actions 数组候选（合法）通过校验');
const ppActionsBad = FE.normalizePopupProfile({
  type: 'foxy.popup-profile',
  schemas: { default: { q: { normal: [{ actions: [{ type: 'key', key: 'NO_SUCH_KEY' }] }] } } }
});
ok(FE.validatePopupProfile(ppActionsBad).errors.some(e => e.indexOf('NO_SUCH_KEY') >= 0), 'actions 数组内非法动作被检出');
ok(ppm.indexOf('不能为 null') >= 0, 'null 候选被检出');
ok(ppm.indexOf('必须是数组') >= 0, '候选列表非数组被检出');
ok(ppm.indexOf('不是对象') >= 0, '非法 entry 被检出');
const ppBadType = FE.normalizePopupProfile({ type: 'foxy.keyboard-layout', schemas: { default: {} } });
ok(FE.validatePopupProfile(ppBadType).errors.join('\n').indexOf('foxy.popup-profile') >= 0, '错误 type 被检出');
/* 真实示例 */
const qipuRaw = fs.readFileSync(path.join(exDir, '气泡-popup.json'), 'utf8');
const qipu = FE.normalizePopupProfile(JSON.parse(FE.sanitizeJsonText(qipuRaw)));
eq(FE.validatePopupProfile(qipu).errors, [], '气泡-popup.json 校验无错误');
eq(FE.popupCandidates(qipu, 'default', 'a', false).length, 27, '气泡 a 常规候选 27 个');
ok(FE.popupCandidateLabel(FE.popupCandidates(qipu, 'default', 'q', false)[1]) === 'q', '字符串候选 label 正确');
ok(FE.popupCandidateLabel(FE.popupCandidates(qipu, 'default', 'g', false)[0]) === '行首', '动作候选 label 正确');
const yaoRaw = fs.readFileSync(path.join(exDir, '药丸-popup.json'), 'utf8');
const yao = FE.normalizePopupProfile(JSON.parse(FE.sanitizeJsonText(yaoRaw)));
eq(FE.validatePopupProfile(yao).errors, [], '药丸-popup.json 校验无错误');
eq(FE.popupCandidates(yao, 'default', 'a', false)[0], 'a', '药丸 a 首选为小写');
eq(FE.popupCandidates(yao, 'default', 'a', true)[0], 'A', '药丸 a Shift 首选为大写');
/* 序列化 */
ok(FE.serializePopupProfile(yao).indexOf('"type": "foxy.popup-profile"') >= 0, '弹出菜单序列化补 type');

/* ---------------- 审查缺陷回归 ---------------- */
console.log('== 审查缺陷回归 ==');
ok(FE.ALL_KEYCODES.NUMBERSIGN && !FE.ALL_KEYCODES.NUMBERSHAR, 'NUMBERSIGN KeyCode 拼写正确');
gi = FE.gestureInfo({ type: 'key', key: 'ENTER', label: '回车' }, FE.NEUTRAL_STATUS);
ok(gi.action && gi.action.actions[0].key === 'ENTER', '直接动作手势可被解析');
rep = FE.inspectJsonText('{"a":1/*x*/2}');
ok(!rep.parseOk && rep.fixedText === '{"a":1 2}', '块注释删除不会拼接相邻 token');
const invalidActions = FE.normalizeProfile({
  actions: { bad: { type: 'key' }, badApp: { type: 'app', command: 'not_real' } },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ label: 'x', tap: { type: 'key', key: 'NO_SUCH_KEY', meta: ['BAD'] } }]] }] } }
});
v = FE.validateProfile(invalidActions);
ok(v.errors.some(e => e.indexOf('NO_SUCH_KEY') >= 0), '非法 KeyCode 被检出');
ok(v.errors.some(e => e.indexOf('not_real') >= 0), '非法 app command 被检出');
ok(v.errors.some(e => e.indexOf('缺少 key') >= 0), 'key 动作缺少 key 被检出');
const holeGrid = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 2, keys: [{ column: 0, row: 0, ref: 'rime.a' }] }] } } });
/* 文档只禁止重叠/越界，未要求铺满：空格子是合法留白，应为警告而非错误 */
const holeRes = FE.validateProfile(holeGrid);
ok(holeRes.errors.every(e => e.indexOf('空单元格') < 0 && e.indexOf('未覆盖') < 0), '网格空格子不再报错');
ok(holeRes.warnings.some(w => w.indexOf('空单元格') >= 0), '网格空格子给出警告');
const badVariant = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a', variants: [{ when: { rime: { composing: true } }, ref: 'missing.variant' }] }]] }] } } });
ok(FE.validateProfile(badVariant).errors.some(e => e.indexOf('missing.variant') >= 0), 'placement 变体坏引用被检出');

/* ---------------- 对齐 Foxy 文档：新增 app 命令 / text_editor / hintTextSize ---------------- */
console.log('== 对齐 Foxy 文档更新 ==');
/* 文档 App Commands 列表中的命令必须全部被编辑器接受 */
['split', 'split_keyboard', 'text_editor', 'split_adjust_start', 'candidate_previous',
  'candidate_next', 'select_schema', 'select_switch_option'].forEach(cmd => {
  ok(FE.APP_COMMANDS.some(c => c[0] === cmd), 'APP_COMMANDS 含 ' + cmd);
});
const newCmds = FE.normalizeProfile({
  layouts: {
    default: {
      sections: [{
        type: 'rows',
        rows: [[
          { label: 'sp', tap: { type: 'app', command: 'split' } },
          { label: 'te', tap: { type: 'app', command: 'text_editor' } },
          { label: 'cp', tap: { type: 'app', command: 'candidate_previous' } },
          { label: 'ss', tap: { type: 'app', command: 'select_schema', argument: 'cangjie5' } }
        ]]
      }]
    }
  }
});
eq(FE.validateProfile(newCmds).errors, [], '新增 app 命令全部通过校验');

/* commit_text 的 argument 可选：不写 argument 不应报错 */
const commitNoArg = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'rows', rows: [[
  { label: 'c', tap: { type: 'app', command: 'commit_text' } }
]] }] } } });
ok(FE.validateProfile(commitNoArg).errors.every(e => e.indexOf('commit_text') < 0), 'commit_text 无 argument 不报错（可选）');
/* 但写了非字符串 argument 仍报错 */
const commitBadArg = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'rows', rows: [[
  { label: 'c', tap: { type: 'app', command: 'commit_text', argument: 123 } }
]] }] } } });
ok(FE.validateProfile(commitBadArg).errors.some(e => e.indexOf('commit_text') >= 0), 'commit_text 非字符串 argument 报错');
/* select_schema / select_switch_option 缺 argument 应报错 */
const selNoArg = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'rows', rows: [[
  { label: 's', tap: { type: 'app', command: 'select_schema' } }
]] }] } } });
ok(FE.validateProfile(selNoArg).errors.some(e => e.indexOf('select_schema') >= 0 && e.indexOf('argument') >= 0), 'select_schema 缺 argument 报错');

/* switch_layout：symbols/emoji/kaomoji 实测可作为目标（多个官方示例如此），不报错；
 * 真正不存在的目标才报错。 */
const swPanel = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'rows', rows: [[
  { label: 'x', tap: { type: 'switch_layout', layout: 'symbols' } }
]] }] } } });
ok(FE.validateProfile(swPanel).errors.every(e => e.indexOf('switch_layout') < 0), 'switch_layout 切内置面板 symbols 不报错');
const swMissing = FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'rows', rows: [[
  { label: 'x', tap: { type: 'switch_layout', layout: 'no_such_layout' } }
]] }] } } });
ok(FE.validateProfile(swMissing).errors.some(e => e.indexOf('no_such_layout') >= 0), 'switch_layout 目标不存在被检出');

/* text_editor 结构约束：恰好一个 rows 区段、恰好一行 */
const teTooMany = FE.normalizeProfile({
  layouts: {
    default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] },
    text_editor: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }], [{ ref: 'rime.b' }]] }] }
  }
});
ok(FE.validateProfile(teTooMany).errors.some(e => e.indexOf('text_editor') >= 0 && e.indexOf('一行') >= 0),
  'text_editor 多行被检出');
const teTwoSections = FE.normalizeProfile({
  layouts: {
    default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] },
    text_editor: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }, { type: 'grid', columns: 1, rows: 1, keys: [{ column: 0, row: 0, ref: 'rime.b' }] }] }
  }
});
ok(FE.validateProfile(teTwoSections).errors.some(e => e.indexOf('text_editor') >= 0 && e.indexOf('一个 rows 区段') >= 0),
  'text_editor 多区段被检出');
const teOk = FE.normalizeProfile({
  layouts: {
    default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] },
    text_editor: { sections: [{ type: 'rows', rows: [[{ ref: 'foxy.LayoutDefault' }, { ref: 'rime.BackSpace' }]] }] }
  }
});
eq(FE.validateProfile(teOk).errors, [], '合规的 text_editor 无错误');

/* hintTextSize 方向名大小写不敏感（文档：Direction names are case-insensitive） */
eq(FE.hintSizeOf(11, 'up'), 11, '数值型 hintTextSize 对任意方向生效');
eq(FE.hintSizeOf({ UP: 9 }, 'up'), 9, '方向名大写可被识别');
eq(FE.hintSizeOf({ Up: 9, DoWn: 8 }, 'down'), 8, '方向名混合大小写可被识别');
eq(FE.hintSizeOf({ left: 7 }, 'up'), null, '未指定的方向回落 null（用全局字号）');
eq(FE.hintSizeOf(null, 'up'), null, 'hintTextSize 缺失时不报错');

/* ---------------- 对齐 Foxy 文档（9/21）：label 优先级 / null 语义 / TOGGLE_LOCKED ---------------- */
console.log('== 对齐 Foxy 文档：label 优先级与 null 语义 ==');

/* label 优先级：tap 自带 label > 外层 key/variant label > 被引用 tap 的标签 */
let lEff = FE.evalPlacement({ ref: 'rime.q', label: '手', tap: { ref: 'rime.a' } }, FE.NEUTRAL_STATUS).eff;
eq(FE.rawLabelOf(lEff, FE.NEUTRAL_STATUS), '手', '外层 label 优先于 tap.ref 继承的标签');
lEff = FE.evalPlacement({ ref: 'rime.q', label: '手', tap: { ref: 'rime.a', label: 'A标' } }, FE.NEUTRAL_STATUS).eff;
eq(FE.rawLabelOf(lEff, FE.NEUTRAL_STATUS), 'A标', 'tap 自带 label 优先于外层 label');
lEff = FE.evalPlacement({ ref: 'rime.q' }, FE.NEUTRAL_STATUS).eff;
eq(FE.rawLabelOf(lEff, FE.NEUTRAL_STATUS), 'q', '无外层 label 时用被引用按键的标签');

/* override 与直接字段：直接字段赢（9/21 文档反转后的优先级） */
lEff = FE.evalPlacement({ ref: 'rime.a', label: '直接', override: { label: '覆盖' } }, FE.NEUTRAL_STATUS).eff;
eq(lEff.label, '直接', '直接放置字段优先于 override（文档已反转）');
lEff = FE.evalPlacement({ ref: 'rime.a', override: { label: '仅覆盖' } }, FE.NEUTRAL_STATUS).eff;
eq(lEff.label, '仅覆盖', '只写 override 时仍然生效');

/* label:null 清空为空字符串，不再回退 */
lEff = FE.evalPlacement({ ref: 'rime.q', label: null }, FE.NEUTRAL_STATUS).eff;
eq(lEff.label, '', 'label:null 清空为空字符串');
eq(FE.rawLabelOf(lEff, FE.NEUTRAL_STATUS), '', 'label:null 后不再回退到继承标签');

/* weight / height:null 恢复解析器默认 1 */
lEff = FE.evalPlacement({ ref: 'rime.a', weight: null, height: null }, FE.NEUTRAL_STATUS).eff;
eq(lEff.weight, 1, 'weight:null 恢复默认 1');
eq(lEff.height, 1, 'height:null 恢复默认 1');

/* colors:null 清除继承的颜色覆盖（放在 override 里、且无同名直接字段时生效） */
profile.keys['__t.colorkey'] = { ref: 'rime.a', colors: { text: '#FFFFFF' } };
lEff = FE.evalPlacement({ ref: '__t.colorkey', override: { colors: null } }, FE.NEUTRAL_STATUS).eff;
ok(lEff.colors == null, 'colors:null 清除继承的颜色覆盖');
lEff = FE.evalPlacement({ ref: '__t.colorkey', colors: { text: '#000000' }, override: { colors: null } }, FE.NEUTRAL_STATUS).eff;
eq(lEff.colors && lEff.colors.text, '#000000', '直接字段的 colors 优先于 override 的 colors:null');
delete profile.keys['__t.colorkey'];

/* 手势引用字段的 null 语义：label/hint 清空、popup 变 false、action 变空列表 */
const gNull = FE.gestureInfo({ ref: 'rime.q', label: null, hint: null, popup: null, action: null }, FE.NEUTRAL_STATUS);
eq(gNull.label, '', '手势 label:null 清空为空串');
eq(gNull.hint, '', '手势 hint:null 清空为空串');
eq(gNull.popup, false, '手势 popup:null 变为 false');
eq(gNull.action.actions, [], '手势 action:null 变为空动作列表');
/* 未指定 ≠ 显式 null：未指定时 hint 应保持 undefined 以便回退 label */
const gPlain = FE.gestureInfo({ ref: 'rime.q' }, FE.NEUTRAL_STATUS);
ok(gPlain.hint === undefined, '未指定 hint 时为 undefined（仍回退 label）');
eq(gPlain.popup, undefined, '未指定 popup 时为 undefined（继承被引用手势）');

/* TOGGLE_LOCKED：合法修饰键状态（命令而非持久状态）；非法状态仍被检出 */
ok(FE.MODIFIER_STATES.indexOf('TOGGLE_LOCKED') >= 0, 'MODIFIER_STATES 含 TOGGLE_LOCKED');
const modOk = FE.normalizeProfile({
  layouts: {
    default: {
      sections: [{
        type: 'rows',
        rows: [[{ label: 'L', tap: { type: 'modifier', modifier: 'SHIFT', state: 'TOGGLE_LOCKED' } }]]
      }]
    }
  }
});
eq(FE.validateProfile(modOk).errors, [], 'TOGGLE_LOCKED 通过校验');
const modBad = FE.normalizeProfile({
  layouts: {
    default: {
      sections: [{
        type: 'rows',
        rows: [[{ label: 'X', tap: { type: 'modifier', modifier: 'SHIFT', state: 'NOT_A_STATE' } }]]
      }]
    }
  }
});
ok(FE.validateProfile(modBad).errors.some(e => e.indexOf('NOT_A_STATE') >= 0), '非法 modifier state 仍被检出');

const renameProfile = FE.normalizeProfile({ keys: { old: { ref: 'rime.a' } }, layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'old' }]] }], split: { sections: [{ type: 'rows', rows: [[{ ref: 'old' }]] }] } } } });
FE.state.profile = renameProfile;
FE.renameKeyDef('old', 'renamed');
eq(renameProfile.layouts.default.sections[0].rows[0][0].ref, 'renamed', '重命名更新常规引用');
eq(renameProfile.layouts.default.split.sections[0].rows[0][0].ref, 'renamed', '重命名更新 split 引用');
FE.state.profile = profile;

/* ---------------- 布局编译中间层 ---------------- */
console.log('== 布局编译层（compileSections / compileLayout） ==');
const cmpProfile = FE.normalizeProfile(JSON.parse(FE.DEFAULT_PROFILE_TEXT));
const cmpScope = FE.scopeFrom(cmpProfile);
const cmp = FE.compileSections(cmpProfile.layouts.default.sections, FE.NEUTRAL_STATUS, cmpScope);
eq(cmp.sections.length, 1, '编译出 1 个区段');
eq(cmp.sections[0].rows.length, 4, 'default 四行');
ok(Math.abs(cmp.totalUnits - 5) < 1e-6, '编译总高度 5 单位', cmp.totalUnits);

/* 编译项与源数组索引一一对应（编辑与定位都依赖） */
const srcRow0 = cmpProfile.layouts.default.sections[0].rows[0];
const item0 = cmp.sections[0].rows[0].keys[0];
ok(item0.placement === srcRow0[0], '编译项保留原始 placement 引用');
eq([item0.s, item0.r, item0.k, item0.group], [0, 0, 0, 'rows'], '编译项带区段/行/键坐标与分组');
eq(item0.label, 'q', '标签在编译期算好');
/* grow 沿用 FE.rowWeights：只读「放置位」的 weight（定义里的 weight 不参与行宽分配） */
eq(item0.grow, 1, '编译项带 flex 权重（默认 1）');
const explicitW = FE.compileSections(
  [{ type: 'rows', rows: [[{ ref: 'rime.a', weight: 2 }]] }], FE.NEUTRAL_STATUS, cmpScope);
eq(explicitW.sections[0].rows[0].keys[0].grow, 2, '放置位显式 weight 编译为 flex 权重');
/* item.weight 反映解析后的有效权重（含定义链），供检查器展示 */
const defW = FE.compileSections(
  [{ type: 'rows', rows: [[{ ref: 'qwerty.shift' }]] }], FE.NEUTRAL_STATUS, cmpScope);
eq(defW.sections[0].rows[0].keys[0].weight, 1.5, 'item.weight 反映定义链上的有效权重');
eq(item0.hints.up.text, 'Q', '编译项含上滑提示文字');
ok(item0.summaries.tap && item0.summaries.tap.display, '编译项含点击动作摘要');
eq(item0.isBroken, false, '正常键不标记破损');

/* 网格：非法项以 null 占位，索引不错位 */
const gridProfile = FE.normalizeProfile({
  layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 1, keys: [
    { column: 0, row: 0, ref: 'rime.a' }, null, { column: 1, row: 0, ref: 'rime.b' }
  ] }] } }
});
const gcmp = FE.compileSections(gridProfile.layouts.default.sections, FE.NEUTRAL_STATUS, FE.scopeFrom(gridProfile));
eq(gcmp.sections[0].keys.length, 3, '网格编译保留源数组长度');
ok(gcmp.sections[0].keys[1] === null, '非法网格项为 null 占位');
eq([gcmp.sections[0].keys[2].k, gcmp.sections[0].keys[2].column], [2, 1], '占位后索引与坐标未错位');

/* ---- 网格预览几何：间隙必须随列/行数缩放，不能固定 5px ----
 * 固定间隙在列数多时会把单元格压没：48 列时 47 个 5px 间隙吃掉 57% 宽度，
 * 单元格仅 3.73px 宽，而字号仍是 18px（格高的 1.9 倍）→ 文字溢出压叠，
 * 整块预览糊成一团（用户反馈的「大网格把预览撑爆」）。 */
const gmNumpad = FE.gridMetrics(5, 4, 43, 5);
eq(gmNumpad.colGap, 5, '小网格（numpad 5 列）间隙保持 5px，外观零变化');
eq(gmNumpad.rowGap, 5, '小网格行间隙保持 5px');
const gmBig = FE.gridMetrics(48, 15, 43, 5);
ok(gmBig.colGap < 1, '48 列时间隙自动缩小（实际 ' + gmBig.colGap.toFixed(2) + 'px）');
ok(gmBig.cellW > 3.73, '48 列单元格比固定间隙时更宽（' + gmBig.cellW.toFixed(2) + 'px > 3.73px）');
ok((48 - 1) * gmBig.colGap <= gmBig.contentW * 0.10 + 0.01, '间隙总占用不超过可用宽的 10%');
ok(gmBig.cellH > 0 && gmBig.cellW > 0, '单元格尺寸为正（间隙不会吃成负数）');
eq(FE.gridMetrics(0, 0, 43, 5).columns, 1, '非法列数回落 1');
eq(FE.gridMetrics(48, 15, 0, 5).cellW > 0, true, 'unit 为 0 时不产生负尺寸');

/* ---- 网格横向滚动条几何（FE.gridScrollMetrics） ----
 * 背景：`.gedit-key` 的 touch-action:none 是拖动排序的前提，于是「在键上横滑」
 * 永远是拖动、不是滚动；而 cc_grid_4 这类 48×15 全由跨距键铺满的网格
 * （194 键 / **0 个空格**）根本没有可起手的横向滚动面，右侧的键在窄屏够不到。
 * 修法是给网格配一条**独立**滚动条，而不是去动 touch-action（那会破坏拖动）。
 * 几何算成纯函数，DOM 桩量不到真实尺寸时也能断言。 */
const sbBig = FE.gridScrollMetrics(350, 1889, 260);      // 414px 竖屏实测值
eq(sbBig.scrollable, true, '大网格（可视 350 / 内容 1889）判定为可滚动');
eq(sbBig.maxScroll, 1539, '可滑距离 = 内容宽 − 可视宽');
ok(sbBig.thumbW >= 44, '滑块不小于 44px 触摸目标（实际 ' + Math.round(sbBig.thumbW) + 'px）');
ok(sbBig.thumbW < 260, '滑块短于轨道（否则无处可滑）');
eq(Math.round(sbBig.usable), Math.round(260 - sbBig.thumbW), '可滑距离 = 轨道宽 − 滑块宽');

/* 小网格 / 量不到尺寸：不得显示滚动条（否则给普通布局凭空多出一条控件） */
eq(FE.gridScrollMetrics(1080, 1080, 1078).scrollable, false, '内容不超出可视宽 → 不可滚动');
eq(FE.gridScrollMetrics(1080, 1081, 1078).scrollable, false, '仅差 1px（亚像素舍入）不算可滚动');
eq(FE.gridScrollMetrics(0, 0, 0).scrollable, false, 'DOM 桩量不到尺寸（全 0）→ 不可滚动，滚动条自动隐藏');

/* 病态输入不得算出负尺寸/负距离 */
const sbTiny = FE.gridScrollMetrics(10, 100000, 20);
/* 不变量是「滑块尽量不小于 44px，但**不得超出轨道**」——
 * 轨道比 44px 还窄时，只能退让到轨道宽（否则滑块会溢出轨道、usable 变负）。 */
ok(sbTiny.thumbW <= 20, '极窄轨道时滑块不超出轨道宽（' + Math.round(sbTiny.thumbW) + 'px）');
ok(sbTiny.thumbW >= Math.min(44, 20), '极窄轨道时滑块仍取满轨道（' + Math.round(sbTiny.thumbW) + 'px）');
ok(sbTiny.usable >= 0, '可滑距离不为负');
const sbZero = FE.gridScrollMetrics(350, 1889, 0);
eq(sbZero.scrollable, false, '轨道宽为 0 → 不可滚动（除零保护）');
ok(isFinite(sbZero.thumbW) && sbZero.usable >= 0, '轨道宽为 0 时不产生 NaN / 负值');

/* 破损引用在编译期即被标记 */
const brokenCmp = FE.compileSections([{ type: 'rows', rows: [[{ ref: 'no.such.key' }]] }], FE.NEUTRAL_STATUS, cmpScope);
ok(brokenCmp.sections[0].rows[0].keys[0].isBroken === true, '未解析引用标记 isBroken');
eq(brokenCmp.sections[0].rows[0].keys[0].unresolved, 'no.such.key', '编译项记录未解析的引用名');

/* eachCompiledKey 覆盖全部键 */
let visited = 0;
FE.eachCompiledKey(cmp, function () { visited++; });
eq(visited, cmp.sections[0].rows.reduce((a, r) => a + r.keys.length, 0), 'eachCompiledKey 覆盖全部键');

/* compileLayout：布局级入口 */
const lc = FE.compileLayout(cmpProfile, 'default', { status: FE.NEUTRAL_STATUS });
ok(lc.ok, 'compileLayout default 通过');
eq(lc.resolvedName, 'default', '无变体时 resolvedName 即布局名');
ok(lc.hasSplit === false, 'default 无 split 片段');
ok(Math.abs(lc.totalUnits - 5) < 1e-6, 'compileLayout 总高度与 compileSections 一致');
const lcSplit = FE.compileLayout(cmpProfile, 'default', { split: true });
ok(!lcSplit.ok && lcSplit.issues.some(i => i.code === 'no-split'), '无 split 时编译失败并带 no-split');
const lcMissing = FE.compileLayout(cmpProfile, '不存在的布局', {});
ok(!lcMissing.ok && lcMissing.issues.some(i => i.code === 'missing-layout'), '布局不存在时带 missing-layout');
/* 布局变体：noVariants 时不跳到目标布局（区段编辑器必须编辑当前布局本身） */
const varProfile = FE.normalizeProfile({
  layouts: {
    default: { variants: [{ when: { rime: { ascii_mode: true } }, layout: 'other' }], sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] },
    other: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.b' }], [{ ref: 'rime.c' }]] }] }
  }
});
const asciiStatus = { composing: false, ascii_mode: true, disabled: false };
eq(FE.compileLayout(varProfile, 'default', { status: asciiStatus }).resolvedName, 'other', 'ASCII 下解析到变体目标');
eq(FE.compileLayout(varProfile, 'default', { status: asciiStatus, noVariants: true }).resolvedName, 'default', 'noVariants 时不解析变体');

/* ---------------- 结构化校验 issue ---------------- */
console.log('== 结构化校验 issue ==');
const locProfile = FE.normalizeProfile({
  keys: { good: { ref: 'rime.a' } },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'good' }, { ref: 'missing.ref' }]] }] } }
});
const lv = FE.validateProfile(locProfile);
ok(Array.isArray(lv.issues), 'validateProfile 返回 issues 数组');
eq(lv.issues.length, lv.errors.length + lv.warnings.length, 'issues 与 errors+warnings 等长');
const missIssue = lv.issues.find(i => i.code === 'unresolved-ref');
ok(!!missIssue, '未解析引用产生 unresolved-ref 条目');
eq([missIssue.sectionIndex, missIssue.rowIndex, missIssue.keyIndex, missIssue.group],
  [0, 0, 1, 'rows'], '未解析引用带区段/行/键坐标与分组');
eq(missIssue.layout, 'default', '未解析引用带布局名');
ok(missIssue.path.indexOf('按键 1') >= 0, 'path 含可读位置', missIssue.path);
eq(missIssue.level, 'error', '未解析引用为 error 级');
const noTapIssue = lv.issues.find(i => i.code === 'no-tap');
ok(!!noTapIssue, '缺 tap 也产生结构化条目（带 code no-tap）');

/* path 未被 code 覆盖：显式传 loc 时仍保留 ctx 坐标 */
ok(noTapIssue.sectionIndex === 0 && noTapIssue.keyIndex === 1,
  '显式 loc 与 ctx 合并（坐标不丢失）', [noTapIssue.sectionIndex, noTapIssue.keyIndex]);

/* split 片段的问题带 isSplit 标记 */
const spProfile = FE.normalizeProfile({
  layouts: {
    default: {
      sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }],
      split: { sections: [{ type: 'rows', rows: [[{ ref: 'nope.split' }]] }] }
    }
  }
});
const spv = FE.validateProfile(spProfile);
const spIssue = spv.issues.find(i => i.code === 'unresolved-ref');
ok(spIssue && spIssue.isSplit === true, 'split 片段的问题带 isSplit 标记');
eq(spIssue.rowIndex, 0, 'split 问题带行索引');

/* 网格问题带 grid 分组、无行索引 */
const gIssueProfile = FE.normalizeProfile({
  layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 2, keys: [
    { column: 0, row: 0, ref: 'rime.a' },
    { column: 0, row: 0, ref: 'rime.b' }
  ] }] } }
});
const gv = FE.validateProfile(gIssueProfile);
const overlapIssue = gv.issues.find(i => i.code === 'grid-overlap');
ok(!!overlapIssue, '网格重叠产生 grid-overlap');
eq([overlapIssue.group, overlapIssue.keyIndex], ['grid', 1], '网格问题带 grid 分组与键索引');
ok(overlapIssue.rowIndex == null, '网格问题不带行索引');

/* 警告也进入 issues */
const holeIssue = gv.issues.find(i => i.code === 'grid-holes');
ok(holeIssue && holeIssue.level === 'warn', '空格子警告也带 code 且为 warn 级');

/* ---- 定义内部的问题带定义坐标（按键定义 / 动作 / 宏） ----
 * 这些位置**没有**布局坐标，早期不传 defKind/defName → UI 的 issueLocatable
 * 判 false → 校验详情里渲染成不可点的纯文本行（用户报告的缺陷）。 */
const dv = FE.validateProfile(FE.normalizeProfile({
  keys: { 'k.bad': { ref: 'nope.ref' }, 'k.hold': { ref: 'rime.a', hold: {}, longPress: {} } },
  actions: { badact: { type: 'nope' } },
  macros: { badstep: [{ action: 'no_such_action' }] },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.bad' }]] }] } }
}));
const keyDefIssue = dv.issues.find(i => i.defKind === 'key' && i.defName === 'k.bad');
ok(!!keyDefIssue, '按键定义内部的问题带 defKind/defName');
eq(keyDefIssue.defName, 'k.bad', 'defName 是出错的按键定义名');
eq([keyDefIssue.layout, keyDefIssue.sectionIndex], [undefined, undefined],
  '按键定义问题没有布局坐标（只能靠定义坐标定位）');
ok(dv.issues.some(i => i.defKind === 'key' && i.defName === 'k.hold' && i.message.indexOf('hold') >= 0),
  '同一按键定义的多类问题都带该定义坐标');
ok(dv.issues.some(i => i.defKind === 'action' && i.defName === 'badact'),
  '动作定义内部的问题带 defKind/defName');
ok(dv.issues.some(i => i.defKind === 'macro' && i.defName === 'badstep'),
  '宏步骤的问题带所属宏的坐标');
/* 布局问题仍走布局坐标，不该被定义坐标覆盖 */
ok(dv.issues.some(i => i.layout === 'default' && i.sectionIndex === 0 && !i.defKind),
  '布局按键的问题仍带布局坐标（不误加定义坐标）');

/* ---------------- 校验器作用域（不污染全局 state） ---------------- */
console.log('== 校验器作用域化 ==');
const keepProfile = FE.state.profile;
const otherProfile = FE.normalizeProfile({
  keys: { only_here: { ref: 'rime.a' } },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'only_here' }]] }] } }
});
eq(FE.validateProfile(otherProfile).errors, [], '显式作用域下 only_here 可解析');
ok(FE.state.profile === keepProfile, '校验过程不修改 state.profile（不再临时篡改全局）');
/* 定义不跨 profile 泄漏：同一份引用在别的作用域下必须解析失败 */
const leakCheck = FE.validateProfile(FE.normalizeProfile({
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'only_here' }]] }] } }
}));
ok(leakCheck.errors.some(e => e.indexOf('only_here') >= 0), '定义不跨 profile 泄漏');
/* 可重入：连续两次结果一致 */
eq(FE.validateProfile(otherProfile).errors, FE.validateProfile(otherProfile).errors, '重复校验结果一致（可重入）');

/* 解析器显式 scope */
const oScope = FE.scopeFrom(otherProfile);
eq(FE.lookupDef('only_here', oScope), otherProfile.keys.only_here, 'lookupDef 用显式 scope 查到定义');
ok(FE.lookupDef('only_here') === null, '默认作用域（state.profile）查不到 only_here');
ok(!FE.evalPlacement({ ref: 'only_here' }, FE.NEUTRAL_STATUS, oScope).unresolved, 'evalPlacement 支持显式 scope');
eq(FE.evalPlacement({ ref: 'only_here' }, FE.NEUTRAL_STATUS).unresolved, 'only_here', '无 scope 时沿用全局并解析失败');
/* 动作名/宏同样走 scope */
const actScope = FE.scopeFrom(FE.normalizeProfile({
  actions: { my_action: { type: 'key', key: 'A' } },
  macros: { my_macro: [{ action: 'my_action' }] },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] } }
}));
eq(FE.resolveActionSpec('my_action', actScope).kind, 'action-name', 'resolveActionSpec 用显式 scope 解析动作名');
/* 宏名要经 {macro:...} 规格，字符串形式只查 actions 表 */
eq(FE.resolveActionSpec({ macro: 'my_macro' }, actScope).unresolved, undefined, '宏在显式 scope 下可解析');
eq(FE.resolveActionSpec({ macro: 'my_macro' }).unresolved, 'my_macro', '无 scope 时宏走全局并解析失败');

/* ================================================================
 * 对齐新版 skill 文档（schemas/ + SKILL.md 重排）
 * 这一组防的是「把合法布局误判为错误」：文档新增的能力若编辑器不认识，
 * 用户手里的正确文件会在编辑器里报错。
 * ================================================================ */
console.log('== 对齐新版 skill 文档 ==');
const vNew = (p) => FE.validateProfile(FE.normalizeProfile(p));
function lay(inner) {
  return { type: 'foxy.keyboard-layout', layouts: { default: { sections: [{ type: 'rows', rows: [[inner]] }] } } };
}

/* ---- 1. sync / sync_rime app 命令 ---- */
ok(FE.APP_COMMANDS.some(c => c[0] === 'sync'), 'sync 命令已加入 APP_COMMANDS');
ok(FE.APP_COMMANDS.some(c => c[0] === 'sync_rime'), 'sync_rime 别名已加入 APP_COMMANDS');
eq(vNew(lay({ ref: 'rime.a', longPress: { action: { type: 'app', command: 'sync' } } })).errors, [],
  'sync 命令不再被误报为不支持');
eq(vNew(lay({ ref: 'rime.a', longPress: { action: { type: 'app', command: 'sync_rime' } } })).errors, [],
  'sync_rime 命令不再被误报为不支持');

/* ---- 2. 低层 KeyCode 补 F1..F12 ---- */
eq([1, 2, 6, 12].every(n => FE.ALL_KEYCODES['F' + n] === true), true, '低层 F1..F12 已加入 KeyCode 表');
eq(vNew(lay({ label: 'F1', tap: { type: 'key', key: 'F1' } })).errors, [], '低层 key F1 不再被误报');
eq(vNew(lay({ label: 'F12', tap: { type: 'key', key: 'F12' } })).errors, [], '低层 key F12 不再被误报');
ok(FE.BUILTIN_KEYS['rime.F1'] !== undefined, 'rime.F1 内置引用仍可用');
ok(FE.ALL_KEYCODES['KP_F1'] === true, 'KP_F1 仍是独立键码（未被 F1 覆盖）');
ok(FE.ALL_KEYCODES['F1'] === true && FE.ALL_KEYCODES['KP_F1'] === true, 'F1 与 KP_F1 并存不冲突');

/* ---- 3. 网格 col / colSpan 别名 ---- */
eq(vNew({ type: 'foxy.keyboard-layout', layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 1, keys: [{ col: 0, row: 0, ref: 'rime.a' }] }] } } }).errors, [],
  '网格 col 别名不再被误报为缺少 column');
eq(vNew({ type: 'foxy.keyboard-layout', layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 1, keys: [{ col: 0, row: 0, colSpan: 2, ref: 'rime.a' }] }] } } }).errors, [],
  '网格 colSpan 别名不被误报且跨距生效');
/* colSpan 真的参与占位：跨 2 列占两格，故 2 列 1 行无空洞警告 */
eq(vNew({ type: 'foxy.keyboard-layout', layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 1, keys: [{ col: 0, row: 0, colSpan: 2, ref: 'rime.a' }] }] } } }).warnings, [],
  'colSpan 别名参与占用计算（无空洞警告）');
/* col 别名参与重叠检测 */
ok(vNew({ type: 'foxy.keyboard-layout', layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 1, keys: [{ col: 0, row: 0, ref: 'rime.a' }, { column: 0, row: 0, ref: 'rime.b' }] }] } } }).errors.some(e => e.indexOf('重叠') >= 0),
  'col 与 column 混用时重叠仍被检出');
eq(vNew({ type: 'foxy.keyboard-layout', layouts: { default: { sections: [{ type: 'grid', columns: 2, rows: 1, keys: [{ col: 5, row: 0, ref: 'rime.a' }] }] } } }).errors.some(e => e.indexOf('超出网格范围') >= 0), true,
  'col 别名参与越界检测');
/* 编译层也要认别名（渲染与区段编辑器消费编译产物） */
const gCompiled = FE.compileLayout(FE.normalizeProfile({ layouts: { default: { sections: [{ type: 'grid', columns: 3, rows: 1, keys: [{ col: 1, row: 0, colSpan: 2, ref: 'rime.a' }] }] } } }), 'default', {});
eq(gCompiled.sections[0].keys[0].column, 1, '编译层认 col 别名');
eq(gCompiled.sections[0].keys[0].columnSpan, 2, '编译层认 colSpan 别名');

/* ---- 4. hold 的 endAction / endActions ---- */
const holdEndA = lay({ ref: 'rime.a', hold: { action: { type: 'app', command: 'voice_start' }, endAction: { type: 'app', command: 'voice_stop' } } });
eq(vNew(holdEndA).errors, [], 'hold.endAction（单数）通过校验');
const holdEndAs = lay({ ref: 'rime.a', hold: { action: { type: 'app', command: 'voice_start' }, endActions: [{ type: 'app', command: 'voice_stop' }] } });
eq(vNew(holdEndAs).errors, [], 'hold.endActions（复数数组）通过校验');
const giEndAs = FE.gestureInfo(holdEndAs.layouts.default.sections[0].rows[0][0].hold, FE.NEUTRAL_STATUS, 0, FE.scopeFrom(FE.normalizeProfile(holdEndAs)));
eq(giEndAs.start, { type: 'app', command: 'voice_start' }, 'hold action 作为起始侧');
eq(giEndAs.end, [{ type: 'app', command: 'voice_stop' }], 'hold endActions 作为结束侧（数组保留）');
ok(FE.validateProfile(FE.normalizeProfile(lay({ ref: 'rime.a', hold: { endActions: 'oops' } }))).errors.some(e => e.indexOf('endActions') >= 0),
  'endActions 非数组被检出');
ok(FE.validateProfile(FE.normalizeProfile(lay({ ref: 'rime.a', hold: { endActions: [{ type: 'app', command: 'no_such_cmd' }] } }))).errors.some(e => e.indexOf('endActions[0]') >= 0),
  'endActions 内非法动作被检出并带下标定位');

/* ---- 5. 弹出菜单：schemas.default 必需 ---- */
const popNoDefault = FE.normalizePopupProfile({ type: 'foxy.popup-profile', schemas: { luna_pinyin: { q: { normal: ['a'] } } } });
ok(FE.validatePopupProfile(popNoDefault).errors.some(e => e.indexOf('default') >= 0),
  '缺少 schemas.default 被检出（新版 schema 要求必填）');
const popWithDefault = FE.normalizePopupProfile({ type: 'foxy.popup-profile', schemas: { default: { q: { normal: ['a'] } }, luna_pinyin: { q: { normal: ['b'] } } } });
eq(FE.validatePopupProfile(popWithDefault).errors, [], '含 default 的多 schema 通过校验');

/* ---- 6. 弹出菜单：裸数组简写 = normal ---- */
const popBare = FE.normalizePopupProfile({ type: 'foxy.popup-profile', schemas: { default: { q: ['a', 'b'] } } });
eq(FE.validatePopupProfile(popBare).errors, [], '裸数组简写通过校验');
eq(FE.popupCandidates(popBare, 'default', 'q', false), ['a', 'b'], '裸数组简写作为 normal 候选');
eq(FE.popupCandidates(popBare, 'default', 'q', true), ['a', 'b'], '裸数组简写时 shifted 回退到 normal');

/* ---- 7. 弹出菜单：只支持 normal / shifted ---- */
const popBadState = FE.normalizePopupProfile({ type: 'foxy.popup-profile', schemas: { default: { q: { weird: ['a'] } } } });
ok(FE.validatePopupProfile(popBadState).errors.some(e => e.indexOf('weird') >= 0),
  '非 normal/shifted 状态名被检出');
eq(FE.popupCandidates(popBadState, 'default', 'q', false), null, '非法状态名不产生候选');

/* ---- 8. keyType 未识别值按未设置处理（文档：treated as unset） ---- */
eq(vNew(lay({ ref: 'rime.a', keyType: 'BOGUS' })).errors, [], '未知 keyType 不报错（按未设置处理）');
eq(FE.KEY_TYPES.join(','), 'LETTER,FUNCTION,ACTION', 'keyType 取值集合与文档一致');
eq(FE.ICONS.join(','), 'backspace,shift,enter,return', '图标名集合与文档一致');

/* ================================================================
 * 文件夹导入：多文件包（definitions.json + layouts/ + popups/）
 * ================================================================ */
console.log('== 文件夹导入：多文件包识别 ==');

/* ---- 1. 文件类型判别 ---- */
eq(FE.classifyFoxyFile('{"type":"foxy.keyboard-layout","layouts":{}}', 'x.json').kind, 'layout', '显式 type 判为布局');
eq(FE.classifyFoxyFile('{"type":"foxy.popup-profile","schemas":{}}', 'x.json').kind, 'popup', '显式 type 判为弹出菜单');
eq(FE.classifyFoxyFile('{"type":"foxy.definitions","keys":{}}', 'x.json').kind, 'definitions', '显式 type 判为共享定义');
eq(FE.classifyFoxyFile('{"keys":{"a":{"ref":"rime.a"}}}', 'pkg/definitions.json').kind, 'definitions', '无 type 时按文件名 definitions.json 识别');
eq(FE.classifyFoxyFile('{"layouts":{"default":{"sections":[]}}}', 'pkg/layouts/foo.json').kind, 'layout', '无 type 时按 layouts/ 目录识别');
eq(FE.classifyFoxyFile('{"schemas":{"default":{}}}', 'pkg/popups/foo.json').kind, 'popup', '无 type 时按 popups/ 目录识别');
eq(FE.classifyFoxyFile('{ 坏 JSON', 'x.json').kind, 'unknown', '坏 JSON 归为无法识别');
ok(FE.classifyFoxyFile('{ 坏 JSON', 'x.json').error !== null, '无法识别时带出错误原因');

/* ---- 2. 共享定义合并（布局自身覆盖共享） ---- */
const sharedDefs = {
  type: 'foxy.definitions',
  keys: { 'qwerty.q': { ref: 'rime.q' }, 'nav.x': { ref: 'rime.1' } },
  actions: { 'act.a': { type: 'key', key: 'A' } },
  macros: { 'mac.a': [{ action: 'act.a' }] }
};
const thinLayout = {
  type: 'foxy.keyboard-layout',
  keys: {
    'local.k': { ref: 'qwerty.q' },
    'nav.x': { ref: 'rime.2', longPress: { popupKey: 'sym.a' } }
  },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'local.k' }]] }] } }
};
const mergedRes = FE.mergeDefinitions(thinLayout, sharedDefs);
eq(Object.keys(mergedRes.profile.keys).length, 3, '共享键并入后共 3 个键定义');
eq(mergedRes.profile.keys['nav.x'].ref, 'rime.2', '本地同名定义覆盖共享定义');
eq(mergedRes.report.overridden, ['keys.nav.x'], '覆盖项被记录');
eq(mergedRes.profile.layouts.default.sections[0].rows[0][0].ref, 'local.k', '原布局结构保持不变');
ok(!thinLayout.keys['local.k'].hasOwnProperty('x') && thinLayout.actions === undefined, '合并不改动入参');
eq(FE.validateProfile(mergedRes.profile).errors, [], '合并后可校验通过');
ok(FE.validateProfile(FE.normalizeProfile(thinLayout)).errors.some(e => e.indexOf('qwerty.q') >= 0),
  '对照：未合并时 qwerty.q 无法解析（这正是单文件导入报错的根源）');

/* ---- 3. popupKey 递归收集 与 弹出菜单文件匹配 ---- */
const layWithPopup = {
  keys: { 'k.a': { ref: 'rime.a', longPress: { popupKey: 'sym.a' } } },
  layouts: {
    default: {
      sections: [{ type: 'rows', rows: [[{ ref: 'k.a', override: { longPress: { popupKey: 'sym.b' } } }]] }]
    }
  }
};
eq(FE.collectPopupKeys(layWithPopup).sort(), ['sym.a', 'sym.b'], '递归收集 popupKey（含放置点 override）');
const popBoth = { type: 'foxy.popup-profile', schemas: { default: { 'sym.a': { normal: ['@'] }, 'sym.b': { normal: ['#'] } } } };
const mSame = FE.matchPopupFile(layWithPopup, [
  { name: 'other.json', path: 'p/other.json', data: popBoth, text: '' },
  { name: 'k.json', path: 'p/k.json', data: popBoth, text: '' }
], 'k.json');
eq(mSame.entry.name, 'k.json', '覆盖数并列时优先同名词弹出菜单');
eq(mSame.covered, 2, '覆盖数统计正确');
eq(mSame.missing, [], '无缺失 popupKey');
eq(FE.matchPopupFile({ keys: {}, layouts: {} }, [{ name: 'p.json', path: 'p.json', data: popBoth, text: '' }]), null,
  '布局未使用 popupKey 时不关联弹出菜单');

/* ---- 4. 文件夹导入计划 ---- */
const planE = FE.planFolderImport([
  { name: 'definitions.json', path: 'pkg/definitions.json', text: JSON.stringify(sharedDefs) },
  { name: 'a.json', path: 'pkg/layouts/a.json', text: JSON.stringify(thinLayout) },
  { name: 'p.json', path: 'pkg/popups/p.json', text: JSON.stringify(popBoth) },
  { name: 'readme.txt', path: 'pkg/readme.txt', text: 'not json' }
]);
eq(planE.summary, { layouts: 1, popups: 1, definitions: 1, unknown: 0 }, '文件夹分类统计正确（非 JSON 被忽略）');
eq(planE.layouts[0].name, 'a.json', '布局文件被识别');
ok(planE.definitions !== null, 'definitions.json 被识别');
const builtE = FE.buildProfileFromPlan(planE, planE.layouts[0].path);
eq(FE.validateProfile(builtE.profile).errors, [], 'buildProfileFromPlan 产出可校验通过的 profile');
eq(builtE.popupMatch.entry.name, 'p.json', '自动关联到弹出菜单文件');
ok(FE.planFolderImport([{ name: 'x.json', path: 'x.json', text: '{}' }]).errors.length > 0, '无布局文件时报错');

/* ---- 5. 导出还原：把未改动的共享定义剥回 definitions.json ---- */
const splitRes = FE.splitProfileForExport(builtE.profile, sharedDefs);
ok(splitRes.split.stripped.indexOf('keys.qwerty.q') >= 0, '未改动的共享键被剥离');
ok(splitRes.split.kept.indexOf('keys.local.k') >= 0, '布局自有定义保留在布局文件里');
ok(splitRes.split.kept.indexOf('keys.nav.x') >= 0, '本地改动过的定义保留（否则引用会断）');
eq(splitRes.layout.keys['qwerty.q'], undefined, '剥离后布局不再含共享键');
eq(FE.validateProfile(FE.mergeDefinitions(splitRes.layout, sharedDefs).profile).errors, [],
  '剥离后重新合并仍可校验通过（导出往返一致）');
ok(FE.serializeDefinitions(sharedDefs).indexOf('"type": "foxy.definitions"') >= 0, '导出的 definitions 带正确 type');

/* ---- 6. 真实工作区多文件包（布局/简易）：目录不属于 foxy-editor 仓库，存在才测 ---- */
const wsPkgDir = path.join(__dirname, '..', '..', '布局', '简易');
if (fs.existsSync(wsPkgDir)) {
  const walked = [];
  (function walk(d, prefix) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p, prefix + '/' + ent.name);
      else if (/\.json$/i.test(ent.name)) {
        walked.push({ name: ent.name, path: '简易' + prefix + '/' + ent.name, text: fs.readFileSync(p, 'utf8') });
      }
    }
  })(wsPkgDir, '');
  const wsPlan = FE.planFolderImport(walked);
  eq(wsPlan.summary, { layouts: 2, popups: 2, definitions: 1, unknown: 0 }, '真实包 简易/ 分类正确');
  const wsBuilt = FE.buildProfileFromPlan(wsPlan, wsPlan.layouts.find(l => l.name === 'simple.json').path);
  eq(FE.validateProfile(wsBuilt.profile).errors, [], '真实包 简易/simple.json 合并后校验 0 错误');
  ok(wsBuilt.report.keys.length > 100, '真实包并入大量共享键（' + wsBuilt.report.keys.length + ' 个）');
  eq(wsBuilt.popupMatch.covered, wsBuilt.popupMatch.total, '真实包弹出菜单覆盖全部 popupKey');
  const leftBuilt = FE.buildProfileFromPlan(wsPlan, wsPlan.layouts.find(l => l.name === 'simple_left.json').path);
  eq(leftBuilt.popupMatch.entry.name, 'simple_left.json', '真实包左手版关联到同名弹出菜单');
  console.log('  （已用真实 布局/简易 多文件包验证：单文件导入 16211 错 → 合并后 0 错）');
} else {
  console.log('  （跳过：工作区 布局/简易 目录不存在）');
}

/* ================================================================
 * 动作与宏：把「一步就是一个 action」抽象到底的纯逻辑
 * 宏步骤 = 一个 actionExpression（字符串=引用动作名 / 对象=内联动作），
 * 编辑器不再另造「步骤类型」层；这里锁住往返稳定与只读兜底。
 * ================================================================ */
console.log('== 宏步骤 = 一个动作表达式 ==');

/* ---- 步骤 → 草稿：三种写法各自识别，且记住原写法 ---- */
const dStr = FE.macroStepToDraft('word.left');
eq(dStr.spec, 'word.left', '裸字符串步骤识别为引用');
eq(dStr.form, 'bare', '裸字符串写法被记住（往返不改写）');
ok(!dStr.readonly, '裸字符串可编辑');

const dWrap = FE.macroStepToDraft({ action: 'word.left' });
eq(dWrap.spec, 'word.left', '{action:名} 步骤识别为引用');
eq(dWrap.form, 'wrapped', '{action:名} 写法被记住');

const dInline = FE.macroStepToDraft({ type: 'key', key: 'BACKSPACE' });
eq(dInline.form, 'inline', '内联动作对象识别为 inline');
eq(dInline.spec.type, 'key', '内联动作原样交给动作编辑器');

const dNested = FE.macroStepToDraft({ action: { type: 'key', key: 'A' }, note: 'x' });
eq(dNested.form, 'inline', '{action:对象} 归一为内联动作（丢掉外层包装）');
eq(dNested.spec.type, 'key', '{action:对象} 取内层动作');

/* ---- 控件覆盖不到的写法：只读 + 给原因，绝不静默改写 ---- */
const dMacroCall = FE.macroStepToDraft({ macro: 'other' });
eq(dMacroCall.readonly, true, '{macro:名} 标记为只读（禁止嵌套宏）');
ok(dMacroCall.reason.indexOf('嵌套宏') >= 0, '只读原因说明嵌套宏会被丢弃');
eq(dMacroCall.raw, { macro: 'other' }, '只读项保留原始 JSON 供逃生口');
ok(FE.macroStepToDraft({ actions: [{ type: 'key', key: 'A' }] }).readonly, 'actions 数组写法归为只读');
ok(FE.macroStepToDraft(123).readonly, '非对象非字符串归为只读');
ok(FE.macroStepToDraft({}).readonly, '空对象归为只读（无法识别）');

/* ---- 草稿值 → 步骤：往返稳定 ---- */
eq(FE.macroValueToStep('a', 'bare'), 'a', '裸字符串改写后仍是裸字符串');
eq(FE.macroValueToStep('a', 'wrapped'), { action: 'a' }, 'wrapped 写法改写后仍是 {action:名}');
eq(FE.macroValueToStep({ type: 'key', key: 'A' }, 'inline'), { type: 'key', key: 'A' }, '内联动作原样写回');
eq(FE.macroValueToStep(null, 'bare'), null, '空值视为无效步骤');
eq(FE.macroValueToStep('', 'bare'), null, '空字符串视为无效步骤');

/* ---- 摘要 ---- */
eq(FE.describeMacroStep('word.left'), '引用 word.left', '引用步骤摘要');
eq(FE.describeMacroStep({ type: 'key', key: 'BACKSPACE' }), 'BACKSPACE', '内联步骤摘要走 actionDisplay');
ok(FE.describeMacroStep({ macro: 'm' }).indexOf('宏调用') >= 0, '嵌套宏摘要标出警告');
eq(FE.describeMacroSteps([]), '（空宏）', '空宏摘要');
eq(FE.describeMacroSteps(['a', 'b']), '引用 a → 引用 b', '两步摘要用箭头连接');
ok(FE.describeMacroSteps(['a', 'b', 'c', 'd']).indexOf('共 4 步') >= 0, '超过三步给出总步数');

/* ---- 重排（拖动与 ▲▼ 共用的数据层） ---- */
const mv = ['a', 'b', 'c'];
ok(FE.moveMacroStep(mv, 0, 2) === true, '重排返回 true');
eq(mv, ['b', 'c', 'a'], '把第 1 步移到末位');
ok(FE.moveMacroStep(mv, 1, 1) === false, '原地不动返回 false');
ok(FE.moveMacroStep(mv, 9, 0) === false, '越界的 from 返回 false');
const mvClamp = ['a', 'b'];
FE.moveMacroStep(mvClamp, 0, 99);
eq(mvClamp, ['b', 'a'], 'to 越界被夹到末位');
const mvNeg = ['a', 'b'];
FE.moveMacroStep(mvNeg, 1, -5);
eq(mvNeg, ['b', 'a'], 'to 为负数被夹到首位');
ok(FE.moveMacroStep(null, 0, 1) === false, '非数组输入安全返回 false');

/* ---- 动作编辑器支持「引用动作名」形态（宏步骤复用的正是它） ---- */
console.log('== 动作编辑器：引用 / 内联 / 上下文裁剪 ==');
/* 纯逻辑层验证：动作编辑器本身需要 DOM，这里用无 DOM 时的降级行为确认 API 存在；
 * 交互细节（类型下拉、写回 profile）由 test-ui.js 覆盖。 */
ok(typeof FE.macroStepToDraft === 'function', '宏步骤抽象已导出');
ok(typeof FE.macroValueToStep === 'function', '步骤回写函数已导出');
ok(FE.MACRO_STEP_KINDS === undefined, '旧的「步骤类型」二选一常量已移除（改由动作编辑器承载）');

/* ================================================================
 * 引用索引（「使用数」按钮与跳转的数据来源）
 * 纯逻辑，无 DOM：UI 段在 Node 下会提前 return，所以这些必须待在纯逻辑段。
 * ================================================================ */
console.log('== 引用索引：使用数与穿透解析 ==');

const riProfile = {
  type: 'foxy.keyboard-layout',
  keys: { 'k.a': { ref: 'rime.a' }, 'k.chain': { ref: 'k.a' } },
  actions: { a1: { type: 'key', key: 'BACKSPACE' }, a2: { type: 'key', key: 'LEFT' } },
  macros: { m1: [{ action: 'a1' }] },
  layouts: {
    default: {
      sections: [{ type: 'rows', rows: [[
        { ref: 'k.a', tap: { macro: 'm1' } },
        { ref: 'k.chain' }
      ]] }]
    },
    numpad: { sections: [{ type: 'grid', columns: 1, rows: 1, keys: [{ column: 0, row: 0, ref: 'k.a' }] }] }
  }
};
const riPopup = {
  type: 'foxy.popup-profile',
  schemas: { default: { q: { normal: [{ ref: 'k.a' }, { action: 'a2' }], shifted: [{ ref: 'k.chain' }] } } }
};
const riIdx = FE.buildRefIndex(riProfile, riPopup);

/* ---- 直接引用 + 穿透：按键定义 ---- */
const useKa = FE.usageOf(riIdx, 'key', 'k.a');
/* 直接 4 处：default 按键、numpad 网格键、弹出菜单候选、按键定义 k.chain 的 ref。
 * 另有 2 处来自穿透（k.chain 引用了 k.a，而 k.chain 被 default 键2 与弹出菜单
 * shifted 候选使用）—— 所以 6 才是对的，别按"肉眼数直接引用"去改这个数。 */
eq(useKa.count, 6, 'k.a 共 6 处（4 直接 + 2 由 k.chain 穿透）');
const kaLocated = useKa.items.filter(i => i.loc);
ok(kaLocated.length >= 3, '多数引用带可跳转坐标（' + kaLocated.length + ' 处）');
/* 定义内部的引用必须**带定义坐标**，弹窗才能给它「跳转」按钮。
 * 早期传 null 让「按键定义 k.chain」退化成不可点的只读行（用户点不动 = 缺陷），
 * 别改回 null。 */
eq(useKa.items.filter(i => !i.loc).length, 0, 'k.a 的引用全部可跳转（无只读条目）');
const kaDefItem = useKa.items.find(i => i.loc && i.loc.defKind === 'key' && i.loc.defName === 'k.chain');
ok(!!kaDefItem, '按键定义内部的引用带定义坐标（defKind/defName）');
eq(kaDefItem.label.indexOf('按键定义'), 0, '该条目文案仍标明来自按键定义');
eq(kaLocated.filter(i => i.loc.layout === 'numpad').length, 1, '含 numpad 网格键引用');
const kaRow = kaLocated.find(i => i.loc.layout === 'default' && i.loc.rowIndex != null);
eq(kaRow.loc.rowIndex, 0, '行内按键坐标含 rowIndex');
const useGrid = kaLocated.find(i => i.loc.layout === 'numpad');
eq(useGrid.loc.rowIndex, null, '网格键 rowIndex 为 null');
eq(useGrid.loc.group, 'grid', '网格键带 group=grid');
eq(FE.usageOf(riIdx, 'key', '不存在的键').count, 0, '未引用的名字计数为 0');

/* ---- 弹出菜单候选：可跳到弹出菜单页 ---- */
const popItem = kaLocated.find(i => i.loc.popupKey);
eq(popItem.loc.popupKey, 'q', '弹出菜单引用带 popupKey（供跳转）');
ok(!popItem.loc.layout, '弹出菜单引用没有布局坐标');

/* ---- 穿透解析：动作被宏用、宏被布局用 → 动作也应追到布局 ---- */
const useA1 = FE.usageOf(riIdx, 'action', 'a1');
ok(useA1.count >= 2, 'a1 既被宏步骤直接引用，也穿透到布局按键');
const a1MacroStep = useA1.items.find(i => i.loc && i.loc.defKind === 'macro' && i.loc.defName === 'm1');
ok(!!a1MacroStep, '宏步骤引用带定义坐标（可跳到该宏）');
const indirect = useA1.items.find(i => i.loc && i.loc.layout === 'default');
ok(!!indirect, 'a1 穿透到布局按键（可跳转）');
ok(indirect.via && indirect.via.join('').indexOf('宏 m1') >= 0, '穿透项标出经由链「宏 m1」');

/* ---- 穿透解析：按键定义链 ---- */
const useRimeA = FE.usageOf(riIdx, 'key', 'rime.a');
ok(useRimeA.items.some(i => i.loc && i.loc.defKind === 'key' && i.loc.defName === 'k.a'
  && i.label.indexOf('按键定义 k.a') >= 0), 'rime.a 被按键定义直接引用（带定义坐标）');
ok(useRimeA.items.some(i => i.loc && i.loc.layout === 'default'),
  'rime.a 穿透按键定义链追到布局按键');
ok(useRimeA.count < 60, '穿透有上限，条目数不会爆炸（实际 ' + useRimeA.count + '）');

/* ---- 穿透解析：弹出菜单里的动作名 ---- */
eq(FE.usageOf(riIdx, 'action', 'a2').count, 1, 'a2 仅被弹出菜单候选引用');
ok(!!FE.usageOf(riIdx, 'action', 'a2').items[0].loc.popupKey, '该引用可跳到弹出菜单');

/* ---- 引用环不会死循环 ---- */
const cyc = FE.buildRefIndex({
  actions: { x: { action: 'y' }, y: { action: 'x' } },
  layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a', tap: { action: 'x' } }]] }] } }
}, null);
ok(FE.usageOf(cyc, 'action', 'y').count < 60, '互相引用的动作不会无限膨胀');
ok(FE.usageOf(cyc, 'action', 'y').items.some(i => i.loc), '环中的动作仍能追到布局坐标');

/* ---- 空/异常输入安全 ---- */
eq(FE.buildRefIndex(null, null), { key: {}, action: {}, macro: {} }, '空输入返回空索引');
eq(FE.buildRefIndex({}, undefined).key, {}, '缺 popupProfile 不报错');

/* ================================================================
 * 未保存改动的守卫（弹框关闭前确认）
 * 历史 bug：点遮罩/Esc 直接关闭，用户辛苦改的内容静默丢弃。
 * ================================================================ */
console.log('== 未保存改动的守卫 ==');
/* stableJson：与键序无关。重建表单会重排键序，若直接用 JSON.stringify，
 * 「没改」也会被判成「改了」→ 用户被白弹确认框。 */
eq(FE.stableJson({ a: 1, b: 2 }), FE.stableJson({ b: 2, a: 1 }), '键序不同视为相等');
ok(FE.stableJson({ a: 1 }) !== FE.stableJson({ a: 2 }), '值不同视为不等');
ok(FE.stableJson({ x: undefined }) !== FE.stableJson({ x: null }),
  'undefined（继承）与 null（显式清除）必须可区分');
eq(FE.stableJson({ x: undefined }), FE.stableJson({ x: undefined }), 'undefined 可稳定比较');
eq(FE.stableJson({ a: [{ y: 1, x: 2 }] }), FE.stableJson({ a: [{ x: 2, y: 1 }] }), '嵌套对象同样键序无关');
eq(FE.stableJson([1, 2]), '[1,2]', '数组序列化');
eq(FE.stableJson(undefined), FE.stableJson(undefined), '裸 undefined 可比较');

/* snapshotGuard：未改动时必须**同步**返回 true（而非 Promise）。
 * 若未改动也返回 Promise，「跳转」类操作会被推迟一帧 → 用户看到「点了没反应」
 * （这个坑曾被 test-ui 的「跳转到弹出菜单页」断言抓住）。 */
{
  const origConfirm = FE.uiConfirm;
  let asked = 0;
  FE.uiConfirm = function () { asked++; return Promise.resolve(true); };

  let v = { label: 'a' };
  const g = FE.snapshotGuard(function () { return v; });
  eq(g.hasBaseline(), false, 'guard 初始无基线');
  eq(g.onBeforeClose(), true, '还没 reset（表单未建好）时直接放行');

  g.reset();
  eq(g.hasBaseline(), true, 'reset 后有基线');
  eq(g.onBeforeClose(), true, '未改动时同步放行，返回 true 而非 Promise');
  eq(asked, 0, '未改动不弹确认框');

  v = { label: 'b' };
  const r = g.onBeforeClose();
  eq(typeof r.then, 'function', '有改动时返回 Promise（等用户确认）');
  eq(asked, 1, '有改动弹一次确认框');

  /* 再次调用（用户还在犹豫）应再问一次，而不是静默放行 */
  g.onBeforeClose();
  eq(asked, 2, '再次请求关闭会再问一次');

  /* 用户选择「继续编辑」→ Promise 解析为 false（不放行）。
   * ⚠️ 这里只断言 Promise 本身，**不要**在 .then 里写断言：test-core.js 是纯同步的，
   * 末尾 process.exit 会在微任务执行前退出，那样的断言永远不会运行（假绿灯）。
   * 「点取消/确认后的真实放行行为」由 test-ui.js 的 async 用例覆盖。 */
  FE.uiConfirm = function () { return Promise.resolve(false); };
  const rCancel = g.onBeforeClose();
  eq(typeof rCancel.then, 'function', '取消路径也返回 Promise');

  FE.uiConfirm = origConfirm;
}
/* 守卫自身抛错不应把用户锁死在对话框里（宁可放行） */
{
  const g = FE.snapshotGuard(function () { throw new Error('boom'); });
  g.reset();
  eq(g.onBeforeClose(), true, '快照函数抛错时放行，不卡住用户');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
