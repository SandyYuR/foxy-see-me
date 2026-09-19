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
const splitRaw = fs.readFileSync(path.join(exDir, 'split.json'), 'utf8');
const splitP = FE.normalizeProfile(JSON.parse(FE.sanitizeJsonText(splitRaw)));
ok(splitP.layouts.default && splitP.layouts.default.split, 'split.json 的 default 含 split 片段');
ok(Array.isArray(splitP.layouts.default.split.sections), 'split 片段含 sections 数组');
FE.state.profile = splitP;
eq(FE.validateProfile(splitP).errors, [], 'split.json 校验无错误');
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
/* 校验器 */
const ppBad = FE.normalizePopupProfile({
  type: 'foxy.popup-profile',
  schemas: { default: { q: { normal: [{ action: 'no.such' }, { label: 'x' }, null], shifted: 'oops' }, bad: 'x' } }
});
const ppr = FE.validatePopupProfile(ppBad);
const ppm = ppr.errors.join('\n');
ok(ppm.indexOf('no.such') >= 0, '引用不存在的动作被检出');
ok(ppm.indexOf('缺少 action / macro / ref') >= 0, '无动作对象候选被检出');
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
ok(FE.validateProfile(holeGrid).errors.some(e => e.indexOf('未覆盖单元格') >= 0), '网格空洞被检出');
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

const renameProfile = FE.normalizeProfile({ keys: { old: { ref: 'rime.a' } }, layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'old' }]] }], split: { sections: [{ type: 'rows', rows: [[{ ref: 'old' }]] }] } } } });
FE.state.profile = renameProfile;
FE.renameKeyDef('old', 'renamed');
eq(renameProfile.layouts.default.sections[0].rows[0][0].ref, 'renamed', '重命名更新常规引用');
eq(renameProfile.layouts.default.split.sections[0].rows[0][0].ref, 'renamed', '重命名更新 split 引用');
FE.state.profile = profile;

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
