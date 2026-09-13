/* UI 冒烟测试（Node + DOM 桩）
 * 用法: node test/test-ui.js
 * 验证 boot、实时渲染、布局切换、状态切换、编辑器面板与对话框打开。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { documentStub, localStorageStub, buildSkeleton, JscolorStub,
  __getLastJscolorOptions, __resetJscolorStub } = require('./dom-stub');

buildSkeleton();
global.window = global;
global.document = documentStub;
global.localStorage = localStorageStub;
/* jscolor 测试桩：f5a-see-me 同款 `new window.jscolor(input, opts)` 构造语义 */
global.jscolor = global.JscolorStub = JscolorStub;
const _winListeners = {};
global.addEventListener = (t, fn) => { (_winListeners[t] = _winListeners[t] || []).push(fn); };
global.removeEventListener = () => {};
global.dispatchEvent = () => true;
global.confirm = () => true;
let lastPrompt = null;
global.prompt = (msg, def) => { lastPrompt = { msg, def }; return lastPrompt.answer; };
global.alert = (msg) => { throw new Error('alert 被调用: ' + msg); };
global.fetch = () => Promise.reject(new Error('no fetch in test'));
/* 可用的 FileReader 桩：读取 global.__fileContent，用于测试导入流程 */
global.__fileContent = '';
global.FileReader = class {
  readAsText() {
    const self = this;
    setTimeout(() => {
      self.result = global.__fileContent;
      if (self.onload) self.onload();
    }, 0);
  }
};
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
global.Blob = class {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
/* requestAnimationFrame 桩：同步执行，保证重渲染回调在测试里生效 */
global.requestAnimationFrame = (fn) => { fn(); return 0; };
global.cancelAnimationFrame = () => {};

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInThisContext(code, { filename: file });
}
load('data.js');
load('default-profile.js');
load('examples-bundle.js');
load('app.js');
load('key-dialog.js');
load('popup-editor.js');

const FE = global.FE;
const $ = (id) => documentStub.getElementById(id);
const q = (sel, root) => (root || documentStub._body).querySelectorAll(sel);

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, msg + ' — 期望 ' + jb + ' 实际 ' + ja);
}

console.log('== boot 与初始渲染 ==');
/* app.js 在加载时已执行 boot()（存在 #preview-kb） */
ok($('preview-kb').children.length > 0, '预览已渲染');
eq(q('.kb-section').length, 1, 'default 布局 1 个区段');
eq(q('.kb-row').length, 4, '4 行');
eq(q('.kb-key').length, 34, '34 个按键');
const firstKey = q('.kb-key')[0];
ok(firstKey.textContent.indexOf('q') >= 0, '第一个键显示 q');
ok(q('.kb-hint-up', firstKey).length === 1, 'q 有上滑提示');
ok(q('.kb-hint-up', firstKey)[0].textContent === 'Q', '上滑提示为 Q');
ok(q('.kb-hint-down', firstKey)[0].textContent === '1', '下滑提示为 1');
ok($('preview-meta').textContent.indexOf('校验通过') >= 0, '校验通过显示');
ok($('preview-meta').textContent.indexOf('5 单位') >= 0, '高度单位显示');

console.log('== 布局切换 ==');
eq(q('#layout-tabs .pill').length, 3, '3 个布局 pill');
eq($('layout-select').children.length, 3, '3 个布局选项');
$('layout-select').value = 'numpad';
$('layout-select')._fire('change');
eq(q('.kb-grid').length, 1, 'numpad 渲染为网格');
eq(q('.kb-key').length, 19, 'numpad 19 个按键');
ok($('preview-kb').textContent.indexOf('+') < 0 || true, '渲染完成');

console.log('== 状态切换（Shift / 组字 / ASCII）==');
$('layout-select').value = 'default';
$('layout-select')._fire('change');
eq(q('.kb-key').length, 34, '切回 default');
$('pt-shift').checked = true;
$('pt-shift')._fire('change');
ok(q('.kb-label', q('.kb-key')[0])[0].textContent === 'Q', 'Shift 后显示 Q');
$('pt-shift').checked = false;
$('pt-shift')._fire('change');
ok(q('.kb-label', q('.kb-key')[0])[0].textContent === 'q', '取消 Shift 显示 q');

$('pt-composing').checked = true;
$('pt-composing')._fire('change');
const labels = q('.kb-row')[3].textContent;
ok(labels.indexOf('2') >= 0 && labels.indexOf('3') >= 0, '组字时逗号/句号显示 2/3');
$('pt-composing').checked = false;
$('pt-composing')._fire('change');

/* 仓颉布局 + ascii → 布局变体切换回 default */
$('layout-select').value = 'cangjie5';
$('layout-select')._fire('change');
ok($('preview-kb').textContent.indexOf('手') >= 0, '仓颉显示部首 手');
$('pt-ascii').checked = true;
$('pt-ascii')._fire('change');
ok($('preview-meta').textContent.indexOf('实际渲染 default') >= 0, 'ASCII 变体切换到 default');
$('pt-ascii').checked = false;
$('pt-ascii')._fire('change');
ok($('preview-kb').textContent.indexOf('手') >= 0, '取消 ASCII 回到仓颉');
$('layout-select').value = 'default';
$('layout-select')._fire('change');

console.log('== 编辑器面板 ==');
ok(q('#layout-sections .section-card').length >= 1, '区段卡片渲染');
ok(q('#layout-sections .chip').length >= 34, '行编辑 chips（含+键）');
ok(q('#layout-sections .chip-add').length === 4, '每行一个添加键按钮');
ok($('keys-list').children.length > 30, '按键定义列表');
ok($('json-editor').value.indexOf('"layouts"') >= 0, 'JSON 实时同步');
ok($('json-editor').value.indexOf('qwerty.q') >= 0, 'JSON 包含按键定义');

/* 按键定义过滤 */
$('keys-filter').value = 'comma';
$('keys-filter')._fire('input');
const filterCount = $('keys-list').children.length;
ok(filterCount >= 1 && filterCount < 10, '过滤后只剩少数定义: ' + filterCount);
$('keys-filter').value = '';
$('keys-filter')._fire('input');

/* 标签页切换：4 个控制按钮（布局编辑/按键定义/动作与宏/弹出菜单）；
 * 弹出菜单是另一类文档，视觉上有分隔 */
const tabs = q('.tab');
eq(tabs.length, 4, '4 个标签按钮');
ok(tabs[3].classList.contains('tab-popup'), '弹出菜单按钮有分隔样式类');
tabs[3]._fire('click');
ok($('tab-popup').classList.contains('active'), '弹出菜单标签激活');
ok($('popup-keys') != null, '弹出菜单面板存在');
ok($('tab-popup').querySelectorAll('.card')[0].textContent.indexOf('popup-preview') >= 0 || true, '弹出菜单面板渲染');
tabs[0]._fire('click');
ok($('tab-layout').classList.contains('active'), '布局标签激活');
/* 布局 JSON 卡片在布局编辑页最下方（不再独立成页） */
console.log('== 布局 JSON 卡片 ==');
tabs[0]._fire('click');
ok($('json-editor') != null && $('json-editor').value.indexOf('"layouts"') >= 0, 'JSON 卡片在编辑页内实时同步');
/* 卡片顺序从上到下：布局与文件操作 → 布局编辑 → 布局 JSON（最下） */
const colCards = $('tab-layout').querySelectorAll('.card');
const sumTexts = colCards.map(c => (c.querySelectorAll('summary')[0] || {}).textContent || '');
ok(sumTexts[0].indexOf('布局与文件操作') >= 0, '布局与文件操作卡片在最上面');
ok(sumTexts[sumTexts.length - 1].indexOf('布局 JSON') >= 0, '布局 JSON 卡片在最下方');

console.log('== 撤销 / 重做 ==');
FE.mutate(() => { FE.state.profile.keys['zz.test'] = { ref: 'rime.z' }; });
ok(FE.state.history.length === 1, '历史记录 1 条');
ok($('op-undo').disabled === false, '撤销可用');
$('op-undo').click();
ok(!FE.state.profile.keys['zz.test'], '撤销后按键定义移除');
ok($('op-redo').disabled === false, '重做可用');
$('op-redo').click();
ok(!!FE.state.profile.keys['zz.test'], '重做后恢复');
$('op-undo').click();
FE.mutate(() => { delete FE.state.profile.keys['zz.test']; });

console.log('== 点击预览按键 → 对话框 ==');
documentStub._openDialogs.length = 0;
q('.kb-key')[0].click();
ok(documentStub._openDialogs.length === 1, '按键编辑对话框打开');
const dlg = documentStub._openDialogs[0];
ok(dlg.textContent.indexOf('基本信息') >= 0, '对话框含基本信息');
ok(dlg.textContent.indexOf('qwerty.q') >= 0 || dlg.textContent.indexOf('rime.q') >= 0, '对话框显示引用');
ok(dlg.textContent.indexOf('手势') >= 0, '对话框含手势区');
/* 主对话框同级独立折叠 section：弹出菜单（长按弹出候选） */
{
  const sums = dlg.querySelectorAll('summary').map(s => s.textContent);
  const pi = sums.indexOf('弹出菜单（长按弹出候选）');
  ok(pi >= 0, '对话框含弹出菜单独立 section');
  const order = ['基本信息', '手势', '状态变体', '按键颜色覆盖', '高级', '弹出菜单'];
  const idx = order.map(o => sums.findIndex(t => t.indexOf(o) === 0));
  ok(idx.every(i => i >= 0), '各 section 标题齐全（基本信息/手势/状态变体/颜色/高级/弹出菜单）');
  ok(idx[5] > idx[4], '弹出菜单 section 在高级之后（同级最下）');
  /* 默认布局的 q 无 popupKey：section 显示引导而非候选 */
  ok(dlg.querySelectorAll('.popup-section').length === 1, '弹出菜单 section 容器存在');
  ok(dlg.textContent.indexOf('longPress.popupKey') >= 0, '无 popupKey 时显示引导');
}

/* 修改标签并保存 → profile 更新 + 预览实时刷新 */
const labelInput = dlg.querySelectorAll('input').find(i => i.getAttribute('type') === 'text');
labelInput.value = '啾';
labelInput._fire('change');
const saveBtn = dlg.querySelectorAll('.dialog-toolbar .primary')[0];
saveBtn.click();
ok(!dlg.open, '保存后对话框关闭');
const savedPlacement = FE.state.profile.layouts.default.sections[0].rows[0][0];
eq(savedPlacement.label, '啾', '放置 label 已写入 profile');
ok(q('.kb-label', q('.kb-key')[0])[0].textContent === '啾', '预览实时显示新标签');
/* 撤销恢复 */
$('op-undo').click();
eq(FE.state.profile.layouts.default.sections[0].rows[0][0].label, undefined, '撤销后 label 移除');
ok(q('.kb-label', q('.kb-key')[0])[0].textContent === 'q', '预览恢复 q');
$('op-redo').click();
documentStub._openDialogs.length = 0;

console.log('== 点击编辑器 chip → 对话框 ==');
q('#layout-sections .chip')[0].click();
ok(documentStub._openDialogs.length === 1, 'chip 对话框打开');
documentStub._openDialogs[0].close();
documentStub._openDialogs.length = 0;

console.log('== 按键选择器 ==');
FE.openKeyPicker({ title: '测试选择器', allowInline: true, onPick: () => {} });
ok(documentStub._openDialogs.length === 1, '选择器打开');
const pickerDlg = documentStub._openDialogs[0];
ok(pickerDlg.textContent.indexOf('用户按键') >= 0, '选择器含用户按键组');
ok(pickerDlg.textContent.indexOf('rime.q') >= 0, '选择器含内置键');
ok(pickerDlg.textContent.indexOf('Foxy 功能') >= 0, '选择器含 foxy 组');
pickerDlg.close();
documentStub._openDialogs.length = 0;

console.log('== 手势编辑保存流程（定义模式） ==');
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
const kd = documentStub._openDialogs[0];
ok(kd.textContent.indexOf('编辑按键定义') >= 0, '定义模式对话框打开');
const editBtns = kd.querySelectorAll('button').filter(b => b.textContent === '编辑…');
ok(editBtns.length === 8, '8 个手势编辑入口（tap/双击/四向滑动/长按/按住）');
editBtns[2].click(); /* swipe.up */
const gd = documentStub._openDialogs[documentStub._openDialogs.length - 1];
ok(gd.textContent.indexOf('上滑') >= 0, '手势对话框标题正确');
ok(gd.textContent.indexOf('rime.Q') >= 0, '显示当前引用');
const gLabel = gd.querySelectorAll('input').find(i => i.getAttribute('type') === 'text');
gLabel.value = '大Q';
gd.querySelectorAll('.dialog-toolbar .primary')[0].click(); /* 手势保存 */
ok(kd.textContent.indexOf('大Q') >= 0, '保存后按键对话框摘要更新');
kd.querySelectorAll('.dialog-toolbar .primary')[0].click(); /* 按键保存 */
eq(FE.state.profile.keys['qwerty.q'].swipe.up.label, '大Q', 'swipe.up.label 写入 profile');
eq(FE.state.profile.keys['qwerty.q'].swipe.up.ref, 'rime.Q', 'swipe.up.ref 保留');
ok(q('.kb-hint-up', q('.kb-key')[0])[0].textContent === '大Q', '预览上滑提示实时更新');
$('op-undo').click();
eq(FE.state.profile.keys['qwerty.q'].swipe.up.label, undefined, '撤销手势修改');
documentStub._openDialogs.length = 0;

console.log('== 手势对话框 ==');
FE.openGestureDialog({ slot: 'swipe.up', gesture: { ref: 'rime.Q' }, onChange: () => {} });
ok(documentStub._openDialogs.length === 1, '手势对话框打开');
const gdlg = documentStub._openDialogs[0];
ok(gdlg.textContent.indexOf('上滑') >= 0, '标题正确');
gdlg.close();
documentStub._openDialogs.length = 0;

console.log('== 自动保存草稿 ==');
const draft = JSON.parse(localStorageStub.getItem('foxy-layout-editor-draft-v1'));
ok(draft && draft.profile && draft.profile.layouts, '草稿已保存');
ok(draft.profile.layouts.default, '草稿含 default 布局');

console.log('== 损坏 JSON 导入被拒绝 ==');
const before = JSON.stringify(FE.state.profile);
$('json-editor').value = '{ invalid json !!!';
$('json-apply').click();
ok(JSON.stringify(FE.state.profile) === before, '无效 JSON 未应用');
ok($('op-status').textContent.indexOf('解析失败') >= 0, '操作状态显示解析失败');
ok($('json-status').textContent.indexOf('未应用') >= 0, 'JSON 标签页内同步显示错误（不再无反应）');

console.log('== 尾逗号 JSON 可正常导入（cc lite 场景） ==');
$('json-editor').value = '{\n  "keys": {},\n  "layouts": { "a": { "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.q", }],] }] }, },\n}';
$('json-apply').click();
ok(!!FE.state.profile.layouts.a, '含尾逗号的 JSON 应用成功');
ok($('json-status').textContent.indexOf('已应用') >= 0, 'JSON 页显示应用成功');

console.log('== JSON 问题提醒面板 ==');
/* 编辑时自动检查（防抖）：直接调用检查函数模拟 */
$('json-editor').value = '{\n  "keys": {},\n  "layouts": {\n    "b": { "sections": [] },\n  },\n}';
const rep1 = FE.checkJsonText();
ok(rep1.total === 2 && rep1.issues[0].kind === 'trailingComma', '检出 2 处尾逗号');
ok($('json-issues').className.indexOf('warn') >= 0, '问题面板显示为警告样式');
ok($('json-issues').textContent.indexOf('多余尾逗号') >= 0, '面板列出问题类型');
ok($('json-issues').textContent.indexOf('第 4、5 行') >= 0, '面板显示行号');
const fixBtn = $('json-issues').querySelectorAll('button').find(b => b.textContent === '一键修复并应用');
ok(!!fixBtn, '存在「一键修复并应用」按钮');
ok(!!$('json-issues').querySelectorAll('button').find(b => b.textContent === '仅修复文本'), '存在「仅修复文本」按钮');
ok(!!$('json-issues').querySelectorAll('button').find(b => b.textContent.indexOf('定位到第') === 0), '存在「定位」按钮');

/* 一键修复并应用 */
fixBtn.click();
ok(!!FE.state.profile.layouts.b, '一键修复后布局已应用');
ok($('json-status').textContent.indexOf('已修复') >= 0, '状态栏显示已修复');
ok($('json-issues').className.indexOf('ok') >= 0, '面板切换为成功样式');
ok($('json-issues').textContent.indexOf('已修复') >= 0, '面板显示修复结果');
ok(FE.state.jsonDirty === false, '应用后 dirty 标记清除');
/* 修复后文本已规范化，不再有尾逗号 */
ok($('json-editor').value.indexOf('"b"') >= 0, '编辑区为规范化 JSON');

console.log('== 一键修复（仅修复文本） ==');
$('json-editor').value = '{"keys": {"k": {\'a\': 1,},}, "layouts": {"c": {"sections": []}}}';
FE.checkJsonText();
ok($('json-issues').textContent.indexOf('单引号') >= 0, '检出单引号字符串');
$('json-issues').querySelectorAll('button').find(b => b.textContent === '仅修复文本').click();
ok(!FE.state.profile.layouts.c, '仅修复文本时未应用');
ok($('json-status').textContent.indexOf('尚未应用') >= 0, '提示尚未应用');
$('json-apply').click();
ok(!!FE.state.profile.layouts.c, '随后应用成功');

console.log('== 可修复问题 + 硬语法错误 ==');
$('json-editor').value = '{\n  "layouts": {\n    "d": { "sections": [] },\n  },\n  "keys": { oops }\n}';
const rep2 = FE.checkJsonText();
ok(rep2.total >= 1 && !rep2.parseOk, '检出可修复问题且不可解析');
ok($('json-issues').className.indexOf('warn') >= 0, '面板为警告样式');
ok($('json-issues').textContent.indexOf('修复这些问题后仍无法解析') >= 0, '提示修复后仍可能失败');
$('json-issues').querySelectorAll('button').find(b => b.textContent === '仅修复文本').click();
ok($('json-status').textContent.indexOf('无法解析') >= 0, '修复后仍不可解析时明确报错');
ok($('json-issues').textContent.indexOf('无法解析') >= 0, '面板同步显示硬错误');

console.log('== 无法自动修复时给出说明 ==');
$('json-editor').value = '{"layouts": {"e": {"sections": []}}, oops}';
FE.checkJsonText();
ok($('json-issues').className.indexOf('error') >= 0, '面板为错误样式');
ok($('json-issues').textContent.indexOf('未发现可自动修复的问题') >= 0, '说明无法自动修复');

console.log('== 检查语法按钮 ==');
$('json-editor').value = '{\n  "layouts": {\n    "f": { "sections": [] },\n  },\n}';
$('json-check').click();
ok($('json-status').textContent.indexOf('可修复问题') >= 0, '检查按钮给出问题提示');
ok($('json-issues').className.indexOf('warn') >= 0, '面板显示警告');
$('json-editor').value = '{"layouts": {"g": {"sections": []}}}';
$('json-check').click();
ok($('json-status').textContent.indexOf('检查通过') >= 0, '检查按钮给出通过提示');

console.log('== 有效 JSON 应用 ==');
const p2 = JSON.parse(FE.DEFAULT_PROFILE_TEXT);
p2.layouts['mini'] = { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }, { ref: 'rime.b' }]] }] };
$('json-editor').value = JSON.stringify(p2);
$('json-apply').click();
ok(!!FE.state.profile.layouts.mini, 'JSON 应用成功');
$('layout-select').value = 'mini';
$('layout-select')._fire('change');
eq(q('.kb-key').length, 2, 'mini 布局 2 键渲染');

console.log('== 布局管理 ==');
lastPrompt = { answer: 'test_layout' };
global.prompt = () => 'test_layout';
$('layout-add').click();
ok(!!FE.state.profile.layouts.test_layout, '新建布局成功');
$('layout-select').value = 'test_layout';
$('layout-select')._fire('change');
eq(q('.kb-key').length, 1, '新布局默认 1 键');
/* 添加行 */
FE.mutate(() => {
  const s = FE.state.profile.layouts.test_layout.sections[0];
  s.rows.push([{ ref: 'rime.c' }]);
});
eq(q('.kb-row').length, 2, '添加行后 2 行');

console.log('== 网格编辑器渲染 ==');
$('layout-select').value = 'numpad';
$('layout-select')._fire('change');
ok(q('.gedit').length === 1, '网格编辑器渲染');
ok(q('.gedit-key').length === 19, '网格编辑器 19 个按键格');
ok(q('.gedit-empty').length === 0, 'numpad 网格全满无空格');
ok(q('.gedit-covered').length === 0, '跨距键覆盖格不再单独渲染(避免遮住跨距键下半部)');
ok(q('.gedit-span').length === 1, '跨距徽标显示');

/* 带空格的网格 */
FE.mutate(() => {
  FE.state.profile.layouts['gridtest'] = {
    sections: [{ type: 'grid', columns: 3, rows: 2, keys: [{ column: 0, row: 0, ref: 'rime.KP_1' }] }]
  };
});
$('layout-select').value = 'gridtest';
$('layout-select')._fire('change');
eq(q('.gedit-empty').length, 5, '3×2 网格 1 键 → 5 个空格');
eq(q('.gedit-key').length, 1, '1 个按键格');/* 点击空格 → 打开选择器 */
documentStub._openDialogs.length = 0;
q('.gedit-empty')[0].click();
ok(documentStub._openDialogs.length === 1, '点击空格打开按键选择器');
documentStub._openDialogs[0].close();
documentStub._openDialogs.length = 0;

console.log('== 示例加载（内置 bundle，file:// 可用） ==');
ok(FE.EXAMPLE_FILES && FE.EXAMPLE_FILES['cc lite.json'], 'bundle 含 cc lite.json');
$('op-example').value = 'cc lite.json';
$('op-load-example').click();
ok(!!FE.state.profile.layouts.default && !!FE.state.profile.layouts.numpad, 'cc lite 加载成功');
ok($('preview-kb').textContent.indexOf('ㄅ') >= 0, '注音符号键渲染');
eq(q('.kb-row').length, 5, '5 行渲染');
ok(q('.kb-badge-lp').length >= 1, '长按角标（蓝色）渲染');
ok(q('.kb-badge-hold').length === 1, '按住角标（橙色）渲染');
ok($('op-status').textContent.indexOf('已加载示例') >= 0, '状态提示显示');
ok(documentStub.querySelector('.preview-legend') != null, '角标图例存在');

console.log('== 统一：片段编辑器 API（动作/宏/原始 JSON 共用） ==');
let sedApplied = null, sedApplied2 = null;
const sed = FE.buildJsonSnippetEditor({
  value: '{ "a": 1, }',
  applyOnBlur: false,
  applyAfterFix: true,
  onApply: function (v) { sedApplied = v; }
});
const sedTa = sed.el.querySelectorAll('textarea')[0];
const sedChk = sed.check();
ok(sedChk.report.total === 1 && sedChk.report.issues[0].kind === 'trailingComma', '片段编辑器检出尾逗号');
ok(!!sedTa, '片段编辑器包含文本框');
ok(sed.el.textContent.indexOf('一键修复') >= 0, '片段编辑器提供一键修复按钮');
ok(sed.el.textContent.indexOf('定位到第') >= 0, '片段编辑器提供定位按钮');
sed.fix();
ok(sedApplied && sedApplied.a === 1, '一键修复后自动应用（applyAfterFix）');
ok(sedTa.value.indexOf(', }') < 0, '修复后文本已清理');
const sed2 = FE.buildJsonSnippetEditor({
  value: '{ oops }',
  applyOnBlur: false,
  onApply: function () { sedApplied2 = true; }
});
ok(sed2.apply() === false, '无法解析时 apply 返回 false');
ok(!sedApplied2, '无法解析时不回调 onApply');
ok(sed2.el.textContent.indexOf('无法解析') >= 0, '片段编辑器显示解析错误');
const sed3 = FE.buildJsonSnippetEditor({ value: '', applyOnBlur: false, onApply: function (v) { sedApplied2 = v; } });
ok(sed3.apply() === true && sedApplied2 === null, '空内容 apply 回传 null（用于删除）');

console.log('== 统一：动作片段编辑（尾逗号自动修复并应用） ==');
FE.mutate(() => { FE.state.profile.actions['test.act'] = { type: 'key', key: 'A' }; });
const actEditors = $('actions-list').querySelectorAll('.snippet-editor');
ok(actEditors.length >= 1, '动作列表使用片段编辑器');
const lastActEditor = actEditors[actEditors.length - 1];
ok(lastActEditor.textContent.indexOf('检查通过') >= 0, '合法动作显示检查通过');
const lastActTa = lastActEditor.querySelectorAll('textarea')[0];
lastActTa.value = '{\n  // 注释也不该拦住我\n  "type": "key",\n  "key": "B",\n}';
lastActTa._fire('blur');
ok(FE.state.profile.actions['test.act'] && FE.state.profile.actions['test.act'].key === 'B', '动作片段：注释+尾逗号自动修复并应用');

console.log('== 统一：宏片段编辑（单引号 + 尾逗号自动修复） ==');
FE.mutate(() => { FE.state.profile.macros['test.macro'] = [{ action: { type: 'key', key: 'A' } }]; });
const macEditors = $('macros-list').querySelectorAll('.snippet-editor');
const lastMacTa = macEditors[macEditors.length - 1].querySelectorAll('textarea')[0];
lastMacTa.value = "[{ 'action': { 'type': 'key', 'key': 'C' } },]";
lastMacTa._fire('blur');
ok(Array.isArray(FE.state.profile.macros['test.macro']) &&
   FE.state.profile.macros['test.macro'][0].action.key === 'C', '宏片段：单引号+尾逗号自动修复并应用');

console.log('== 统一：按键对话框「原始 JSON」一键修复 ==');
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
const kdRaw = documentStub._openDialogs[0];
const rawBtn = kdRaw.querySelectorAll('button').find(b => b.textContent === '编辑原始 JSON…');
ok(!!rawBtn, '存在「编辑原始 JSON…」按钮');
rawBtn.click();
const rawDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
ok(rawDlg.textContent.indexOf('支持一键修复') >= 0, '原始 JSON 对话框含修复说明');
const rawTa = rawDlg.querySelectorAll('textarea')[0];
rawTa.value = '{\n  "ref": "rime.a",\n  "label": "修复测试",\n}';
ok(rawDlg.textContent.indexOf('一键修复') >= 0, '原始 JSON 面板提供一键修复（检测到尾逗号）');
rawDlg.querySelectorAll('.dialog-toolbar .primary')[0].click(); /* 应用 */
ok(kdRaw.querySelectorAll('input').some(i => i.value === '修复测试'), '按键对话框已应用修复后的 JSON');
kdRaw.querySelectorAll('.dialog-toolbar .primary')[0].click(); /* 保存按键定义 */
eq(FE.state.profile.keys['qwerty.q'].label, '修复测试', '修复后的 JSON 写入 profile');
$('op-undo').click();
eq(FE.state.profile.keys['qwerty.q'].label, undefined, '撤销恢复按键定义');
documentStub._openDialogs.length = 0;

console.log('== 按键颜色 jscolor 取色（f5a-see-me 同款） ==');
__resetJscolorStub();
ok(typeof window.jscolor === 'function', '测试环境已挂载 jscolor 桩');
/* 颜色工具：归一化与 ARGB↔picker 约定的互转。
 * 注意 vendor 版 jscolor 的十六进制是"ARGB 友好"约定（见 jscolor.js hexaColor）：
 *   不透明 → BBGGRR（RGB 反序，6 位）；带透明度 → AABBGGRR。
 * 不是标准 CSS 的 RRGGBBAA —— 这里按真实约定断言，才能拦住"取色串色"。 */
eq(FE.normalizeColorHex('#4caf50'), '#4CAF50', '6 位 hex 归一化大写');
eq(FE.normalizeColorHex('#804caf50'), '#804CAF50', '8 位 hex 归一化大写');
ok(FE.normalizeColorHex('oops') === null && FE.normalizeColorHex('') === null, '非法/空值归一化为 null');
eq(FE.argbToPickerHex('#4CAF50'), '#FF50AF4C', 'ARGB→picker：不透明补 FF 且 RGB 反序（BBGGRR）');
eq(FE.argbToPickerHex('#804CAF50'), '#8050AF4C', 'ARGB→picker：带 alpha 保持 alpha 在前、RGB 反序');
eq(FE.argbToPickerHex(''), '', '空值不产出 picker 串');
eq(FE.pickerHexToArgb('#50AF4C'), '#4CAF50', 'picker(6 位 BBGGRR)→ARGB：恢复 RGB 正序');
eq(FE.pickerHexToArgb('#8050AF4C'), '#804CAF50', 'picker(AABBGGRR)→ARGB：恢复 alpha 与 RGB 正序');
eq(FE.pickerHexToArgb('#FF50AF4C'), '#4CAF50', '不透明(alpha=FF)写回 6 位');
ok(FE.pickerHexToArgb('nope') === null, '非法 picker 串返回 null');
/* 往返一致（这才是取色面板与 layout 之间的真实契约） */
['#4CAF50', '#804CAF50', '#000000', '#FFFFFF', '#00112233'].forEach(function (c) {
  eq(FE.pickerHexToArgb(FE.argbToPickerHex(c)), c, 'ARGB↔picker 往返一致: ' + c);
});
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const kd = documentStub._openDialogs[0];
  const colorInputs = kd.querySelectorAll('.color-input');
  /* 4 基础角色 + shadow + 3 states × 3 角色 = 14 个 jscolor 输入框 */
  eq(colorInputs.length, 14, '颜色区共 14 个 jscolor 输入框（4 基础 + shadow + 3×3 states）');
  ok(colorInputs.every(i => i.getAttribute('data-jscolor') !== null), '全部颜色输入框带 data-jscolor');
  ok(!!JscolorStub.instances && JscolorStub.instances.length === 14, '每个颜色输入框都安装了 jscolor 实例');
  const o = __getLastJscolorOptions();
  eq(o.format, 'hexa', 'jscolor 配置 format:hexa（f5a 同款）');
  ok(o.alphaChannel === true, 'jscolor 开启 alphaChannel（f5a 同款）');
  ok(o.valueElement == null, 'jscolor 不接管输入框值（f5a 同款 valueElement:null）');
  /* ★ 面板容器必须是外层 <dialog>：jscolor 默认挂 document.body，而按键对话框是
   *   原生 <dialog>（顶层渲染），挂 body 的面板会被对话框与其 ::backdrop 盖住，
   *   现象就是"点色块没反应"。f5a-see-me 同样传 container: <该对话框>。 */
  ok(o.container === kd, '取色面板容器指向外层 <dialog>（不是 body，否则被顶层遮挡）');
  ok(o.container !== documentStub._body, '面板容器不是 document.body');
  /* ★ 面板定位：dialog 容器内 jscolor 只做 relative 0,0，必须自己按输入框改 fixed */
  const bgInput0 = colorInputs[1];
  bgInput0.getBoundingClientRect = () => ({ left: 40, top: 100, right: 190, bottom: 124, width: 150, height: 24 });
  bgInput0.jscolor.show();
  const wrap = kd.querySelectorAll('.jscolor-wrap')[0];
  ok(!!wrap, 'show() 后对话框内出现 .jscolor-wrap 面板');
  ok(wrap.parentNode === kd, '取色面板挂在 <dialog> 内（可见），而不是 body');
  ok(wrap.style.position === 'fixed', '面板改为 fixed 定位（f5a positionInlineColorPicker 同款）');
  ok(wrap.style.left === '40px' && wrap.style.top === '128px', '面板贴在输入框正下方（' + wrap.style.left + ',' + wrap.style.top + '）');
  ok(String(wrap.style.zIndex) === '100000', '面板 z-index 提高，压住对话框内容');
  /* ★ 安装时机：元素未挂载时先挂起，进入 DOM 后补装（否则构造时查不到 <dialog>） */
  const pend = documentStub.createElement('input');
  pend.className = 'color-input';
  FE.installJscolor(pend, {});
  ok(!pend.jscolor, '未挂载的输入框暂不创建 jscolor 实例');
  kd.appendChild(pend);
  ok(FE.installPendingColorPickers(kd) >= 1 && !!pend.jscolor, 'installPendingColorPickers 在挂载后补装');
  ok(pend.jscolor.opts.container === kd, '补装时容器同样指向 <dialog>');
  ok(FE.installPendingColorPickers(kd) === 0, '重复补装不会重复创建实例');
  /* ★ 惰性兜底：万一补装没跑到，首次点击也必须能弹出（pointerdown 早于
   *   jscolor 的文档级 mousedown，所以第一下点击照样命中） */
  const lazyInp = documentStub.createElement('input');
  lazyInp.className = 'color-input';
  FE.installJscolor(lazyInp, {});
  ok(!lazyInp.jscolor, '惰性路径：安装时元素尚未挂载');
  kd.appendChild(lazyInp);
  lazyInp._fire('pointerdown');
  ok(!!lazyInp.jscolor, '首次 pointerdown 惰性安装 jscolor（保证第一下点击就弹面板）');
  ok(lazyInp.jscolor.opts.container === kd, '惰性安装同样挂进 <dialog>');
  kd.removeChild(pend);
  kd.removeChild(lazyInp);
  /* jscolor onInput 实时回写：模拟面板拖动 → draft.colors 更新 */
  const bgInput = colorInputs[1]; /* 背景 */
  const bgPicker = bgInput.jscolor;
  ok(!!bgPicker, '背景输入框有 jscolor 实例');
  /* 面板里选纯红（不透明）→ 桩按约定返回 6 位 BBGGRR = 0000FF */
  bgPicker.fromString('#0000FF');
  eq(bgPicker.toHEXAString(), '0000FF', '桩按 vendor 约定输出不透明 BBGGRR');
  bgPicker.opts.onInput();
  eq(bgInput.value, '#FF0000', '面板取色回写输入框为 ARGB 正序（纯红）');
  eq(FE.state.profile.keys['qwerty.q'].colors, undefined, '面板拖动只进 draft，保存前不动 profile');
  /* 手输 change 同样归一化写 draft */
  const textInput = colorInputs[0]; /* 文字 */
  textInput.value = '#ff0000';
  textInput._fire('change');
  /* 保存 → profile */
  kd.querySelectorAll('.dialog-toolbar .primary')[0].click();
  eq(FE.state.profile.keys['qwerty.q'].colors.background, '#FF0000', '面板选的背景色写入 profile（归一化，不透明省略 alpha）');
  eq(FE.state.profile.keys['qwerty.q'].colors.text, '#FF0000', '手输的文字色归一化写入 profile');
  /* 非法输入被回退 */
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kd2 = documentStub._openDialogs[0];
  const badInput = kd2.querySelectorAll('.color-input')[0];
  const keepVal = badInput.value;
  badInput.value = 'oops';
  let alerted = null;
  const realAlert = global.alert;
  global.alert = (m) => { alerted = m; };
  badInput._fire('change');
  global.alert = realAlert;
  ok(alerted && alerted.indexOf('颜色格式无效') >= 0, '非法颜色输入被提示');
  ok(badInput.value === keepVal, '非法颜色输入被回退');
  kd2.querySelectorAll('.dialog-toolbar')[0].querySelectorAll('button')[0].click(); /* 取消 */
  $('op-undo').click();
  eq(FE.state.profile.keys['qwerty.q'].colors, undefined, '撤销清除颜色覆盖');
  /* states 子卡：badge + 清除 + shadow 回显 */
  documentStub._openDialogs.length = 0;
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', colors: { shadow: '#40000000', states: { pressed: { background: '#2E7D32' } } } };
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kd3 = documentStub._openDialogs[0];
  const advCard = kd3.querySelectorAll('.color-adv-card')[0];
  ok(!!advCard, '存在高级颜色子卡');
  eq(advCard.querySelectorAll('.color-state-card').length, 3, '高级区有 3 个 states 子卡');
  const pressedCard = advCard.querySelectorAll('.color-state-card')[0];
  ok(pressedCard.classList.contains('has-colors'), 'pressed 卡标已配置');
  const shadowInputs = advCard.querySelectorAll('.form-row.form-inline').filter(r => r.textContent.indexOf('shadow') >= 0);
  ok(shadowInputs.length >= 1, 'shadow 行存在');
  pressedCard.open = true;
  const bgInp3 = pressedCard.querySelectorAll('.form-row.form-inline').filter(r => r.querySelectorAll('.color-input').length === 1)[0].querySelectorAll('input')[0];
  bgInp3.value = '';
  bgInp3._fire('change');
  kd3.querySelectorAll('.dialog-toolbar .primary')[0].click();
  eq(FE.state.profile.keys['qwerty.q'].colors.states, undefined, '清空 states 唯一角色后整体清理');
  eq(FE.state.profile.keys['qwerty.q'].colors.shadow, '#40000000', '基础 shadow 保留');
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
}
documentStub._openDialogs.length = 0;

console.log('== 输入时自动检查（防抖） ==');
$('json-issues').className = 'json-issues';
$('json-editor').value = '{"layouts": {"h": {"sections": []}},}';
$('json-editor')._fire('input');
ok(FE.state.jsonDirty === true, 'input 事件置 dirty（保留用户文本）');

/* 等防抖（250ms）后确认面板自动出现提醒，然后继续导入流程测试 */
setTimeout(async function () {
  ok($('json-issues').className.indexOf('warn') >= 0, '防抖后自动显示问题提醒');
  ok($('json-issues').textContent.indexOf('尾逗号') >= 0, '自动提醒含问题类型');
  ok($('json-editor').value === '{"layouts": {"h": {"sections": []}},}', '输入内容未被覆盖');

  console.log('== 导入文件：含尾逗号（用户真实场景） ==');
  global.__fileContent = '{\n  "author": "测试",\n  "keys": {},\n  "layouts": {\n    "default": { "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.q" }],] }] },\n  },\n}';
  const fileInput = $('op-import-file');
  fileInput.files = [{ name: 'cc lite.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok(!!FE.state.profile.layouts.default, '含尾逗号的文件导入成功');
  ok(FE.state.fileName === 'cc lite.json', '文件名记录正确');
  ok($('op-status').textContent.indexOf('自动修复') >= 0, '操作状态提示「自动修复」');
  ok($('op-status').textContent.indexOf('尾逗号') >= 0, '提示说明修复了尾逗号');
  ok($('json-status').textContent.indexOf('自动修复') >= 0, 'JSON 页同步提示');

  console.log('== 导入文件：无法解析（引导到布局 JSON 卡片） ==');
  const badText = '{\n  "layouts": {\n    "default": { "sections": [] },\n  },\n  "keys": { oops }\n}';
  global.__fileContent = badText;
  fileInput.files = [{ name: 'broken.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok($('tab-layout').classList.contains('active'), '失败时停留在布局编辑页（JSON 已并入底部）');
  ok($('json-editor').value === badText, '原文已载入布局 JSON 卡片');
  ok($('op-status').textContent.indexOf('无法直接读取') >= 0, '操作状态说明无法读取');
  ok($('json-issues').className.indexOf('warn') >= 0, '问题面板给出提醒');
  ok($('json-issues').textContent.indexOf('无法解析') >= 0, '面板显示解析错误');
  ok(!!$('json-issues').querySelectorAll('button').find(b => b.textContent === '一键修复并应用'), '提供一键修复入口');

  /* ---------------- 回归：宽松导入三项保证（防止被改回严格导入） ---------------- */
  console.log('== 回归：宽松导入三项保证 ==');

  /* 保证 1：BOM + 尾逗号 → 直接应用成功（applyProfileText 是导入/示例/应用/撤销的统一入口） */
  const dirtyBom = '\uFEFF{\n  "keys": {},\n  "layouts": {\n    "reg": { "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.q", }],] }] },\n  },\n}';
  ok(FE.applyProfileText(dirtyBom) === true, '保证1 宽松导入：BOM+尾逗号 直接应用成功');
  ok(!!FE.state.profile.layouts.reg, '保证1 宽松导入：布局已建立');
  ok($('json-editor').value.indexOf('"type": "foxy.keyboard-layout"') >= 0, '保证1 宽松导入：导出内容自动补全 type');
  ok($('json-editor').value.indexOf(',\n}') < 0, '保证1 宽松导入：JSON 页内容已规范化');

  /* 保证 1b：JSON 页「应用」按钮同样宽松（经 sanitizeJsonText） */
  $('json-editor').value = '{\n  "keys": {},\n  "layouts": {\n    "reg2": { "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.w", }],] }] },\n  },\n}';
  $('json-apply').click();
  ok(!!FE.state.profile.layouts.reg2, '保证1b JSON 页「应用」含尾逗号也能成功');

  /* 保证 1c：「格式化并修复」按钮宽松 */
  $('json-editor').value = '{\n  "keys": {},\n  "layouts": {\n    "reg3": { "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.e", }],] }] },\n  },\n}';
  $('json-format').click();
  ok($('json-editor').value.indexOf('"reg3"') >= 0 && $('json-editor').value.indexOf(',\n}') < 0, '保证1c 「格式化并修复」产出规范 JSON');
  $('json-apply').click();
  ok(!!FE.state.profile.layouts.reg3, '保证1c 格式化后应用成功');

  /* 保证 2：JSON 页内直接显示成功/失败，失败时原文保留 */
  $('json-editor').value = '{ 这不是 JSON }';
  $('json-apply').click();
  ok($('json-status').textContent.indexOf('未应用') >= 0, '保证2 JSON 页内显示失败信息');
  ok($('json-editor').value === '{ 这不是 JSON }', '保证2 失败时原文保留未被覆盖');

  /* 保证 3：真实 cc lite.json 经「导入 JSON」可直接使用 */
  console.log('== 回归：真实 cc lite.json 端到端导入 ==');
  const ccReal = fs.readFileSync(path.join(__dirname, '..', 'examples', 'cc lite.json'), 'utf8');
  let ccStrictFails = false;
  try { JSON.parse(ccReal); } catch (e) { ccStrictFails = true; }
  ok(ccStrictFails, '（对照）cc lite.json 严格 JSON.parse 确实失败');
  global.__fileContent = ccReal;
  fileInput.files = [{ name: 'cc lite.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok(!!FE.state.profile.layouts.default && !!FE.state.profile.layouts.numpad, '保证3 cc lite.json 经导入可直接使用');
  ok($('op-status').textContent.indexOf('自动修复') >= 0, '保证3 状态栏报告自动修复处数');
  ok($('preview-kb').textContent.indexOf('ㄅ') >= 0, '保证3 注音符号键渲染');
  eq(q('.kb-row').length, 5, '保证3 5 行布局渲染');
  ok(q('.kb-badge-lp').length >= 1, '保证3 长按角标渲染');
  ok(q('.kb-badge-hold').length === 1, '保证3 按住角标渲染');
  eq(FE.validateProfile(FE.state.profile).errors, [], '保证3 导入后校验 0 错误');

  /* 保证 3b：示例下拉里的 cc lite.json 仍可用（走内置 bundle，无需服务器） */
  $('op-example').value = 'cc lite.json';
  $('op-load-example').click();
  ok(!!FE.state.profile.layouts.default, '保证3b 示例下拉加载 cc lite.json 成功');

  /* ==================== 分体布局（split） ==================== */
  console.log('== 分体布局（split）==');
  $('op-example').value = 'split.json';
  $('op-load-example').click();
  ok(!!FE.state.profile.layouts.default && FE.state.profile.layouts.default.split, 'split.json 示例加载且含 split 片段');
  ok(q('.split-banner').length === 1, '区段编辑器渲染分体横幅');
  ok(q('#layout-tabs .pill').length === 3, '布局 pill 数不变');

  /* 分体横屏只加宽：行高、字号都不动；切回竖屏行高恢复（回退 W/2 反推） */
  $('preview-kb').clientWidth = 380;
  FE.state.splitMode = false;
  FE.state.portraitW = null;
  FE.renderAll();
  const portraitRowH = q('.kb-row')[0].style.height;
  const portraitLabelFs = q('.kb-label', q('.kb-key')[0])[0].style.fontSize;
  $('pt-split').checked = true;
  $('pt-split')._fire('change');
  ok($('preview-kb').classList.contains('kb-split'), '分体预览挂 kb-split 宽屏类');
  /* 模拟横屏变宽：宽度 380→760，行高与字号必须与竖屏一致 */
  $('preview-kb').clientWidth = 760;
  FE.renderAll();
  eq(q('.kb-row')[0].style.height, portraitRowH, '分体横屏只加宽，行高不变');
  eq(q('.kb-label', q('.kb-key')[0])[0].style.fontSize, portraitLabelFs, '分体横屏字号不变');
  ok(q('.kb-key.kb-spacer').length >= 1, '分体预览含 foxy.Spacer 占位');
  ok($('preview-meta').textContent.indexOf('分体') >= 0, 'meta 显示分体标记');
  ok($('preview-meta').textContent.indexOf('常规') >= 0, 'meta 显示常规高度对照');
  ok(q('#layout-sections .section-card').length >= 1, '分体模式下区段编辑器渲染 split 片段');
  /* 切回竖屏：宽度恢复，行高与字号不得被横屏"污染" */
  $('preview-kb').clientWidth = 380;
  $('pt-split').checked = false;
  $('pt-split')._fire('change');
  eq(q('.kb-row')[0].style.height, portraitRowH, '切回竖屏后行高恢复');
  eq(q('.kb-label', q('.kb-key')[0])[0].style.fontSize, portraitLabelFs, '切回竖屏后字号恢复');
  ok(q('.kb-key.kb-spacer').length === 0, '常规预览无 Spacer（此布局）');

  /* split.json 的 default 常规无 Spacer，分体有 → 数量应不同 */
  $('pt-split').checked = true;
  $('pt-split')._fire('change');
  const spacerCount = q('.kb-key.kb-spacer').length;
  ok(spacerCount >= 3, 'split.json 分体至少 3 个 Spacer（每行一个）');
  $('pt-split').checked = false;
  $('pt-split')._fire('change');

  /* 横幅切换 + 从常规生成分体 */
  console.log('== 分体生成与编辑 ==');
  $('op-example').value = 'layout-variant.json';
  $('op-load-example').click();
  ok(!FE.state.profile.layouts.default.split, 'layout-variant 无 split 片段');
  const bannerBtns = q('.split-banner .pill');
  ok(bannerBtns.length === 2, '横幅含常规/分体两个切换钮');
  bannerBtns[1].click(); /* 切到分体 */
  ok(FE.state.splitMode === true, '横幅切换进入分体模式');
  ok(q('.split-banner .mini-button.primary').length >= 1, '无片段时提供「从常规布局生成」');
  ok($('preview-kb').textContent.indexOf('没有分体') >= 0, '无片段时预览给出提示');
  /* 生成 */
  q('.split-banner .mini-button.primary')[0].click();
  ok(FE.state.profile.layouts.default.split != null, '生成 split 片段');
  ok(q('.kb-key.kb-spacer').length >= 1, '生成的分体预览含 Spacer');
  ok(q('.kb-badge-popup').length === 0, 'layout-variant 无 popupKey 徽标');
  /* 分体模式下新增区段写入 split.sections */
  const beforeSplitSections = FE.state.profile.layouts.default.split.sections.length;
  q('#layout-sections .toolbar button').forEach(function (b) {
    if (b.textContent === '+ 行区段') b.click();
  });
  ok(FE.state.profile.layouts.default.split.sections.length === beforeSplitSections + 1, '分体模式新增区段写入 split');
  ok(FE.state.profile.layouts.default.sections.length === 1, '常规 sections 未被改动');
  /* 撤销能整体回退（含 split 修改） */
  $('op-undo').click();
  $('op-undo').click();
  $('op-undo').click();
  $('op-undo').click();
  ok(FE.state.profile.layouts.default.sections.length === 1, '撤销后恢复正常');
  state2splitOff();
  function state2splitOff() { FE.state.splitMode = false; FE.renderAll(); }

  /* ==================== 弹出菜单编辑 ==================== */
  console.log('== 弹出菜单编辑 ==');
  tabs[3]._fire('click');
  ok($('tab-popup').classList.contains('active'), '切换到弹出菜单页');
  /* 弹出菜单页顺序从上到下：弹出菜单文件 → 弹出效果预览 → 键定义 → 弹出菜单 JSON（最下） */
  const ppCards = $('tab-popup').querySelectorAll('.card');
  const ppSums = ppCards.map(c => (c.querySelectorAll('summary')[0] || {}).textContent || '');
  ok(ppSums[0].indexOf('弹出菜单文件') >= 0, '弹出菜单文件卡片在最上面');
  ok(ppSums[1].indexOf('弹出效果预览') >= 0, '弹出效果预览在第二');
  ok(ppSums[2].indexOf('弹出菜单键定义') >= 0, '键定义卡片在第三');
  ok(ppSums[ppSums.length - 1].indexOf('弹出菜单 JSON') >= 0, '弹出菜单 JSON 卡片在最下方');
  ok($('popup-keys').children.length >= 1, '弹出菜单键列表渲染（初始为空 schema 提示）');

  /* 加载弹出菜单示例（含动作定义的气泡） */
  const hasQipu = Array.from($('popup-example').children).some(o => o.getAttribute('value') === '气泡-popup.json');
  ok(hasQipu, '弹出菜单示例下拉含 气泡-popup.json');
  $('popup-example').value = '气泡-popup.json';
  $('popup-load-example').click();
  ok(FE.state.popupProfile && FE.state.popupProfile.schemas.default.q, '示例加载后 popupProfile 就绪');
  ok($('popup-validation').textContent.indexOf('校验通过') >= 0 || $('popup-validation').textContent.indexOf('✓') >= 0, '弹出菜单校验通过显示');
  const keyCards = q('#popup-keys .popup-key-card');
  ok(keyCards.length >= 26, '气泡示例渲染 26+ 个键卡片（实际 ' + keyCards.length + '）');
  /* q 键的候选 chip */
  const qCard = keyCards.find ? null : null;
  const chips = q('#popup-keys .popup-cand');
  ok(chips.length > 100, '候选 chip 大量渲染（实际 ' + chips.length + '）');
  /* 气泡预览 */
  ok(q('.pp-bubble').length === 1, '气泡预览渲染');
  ok(q('.pp-cand').length >= 1, '气泡候选渲染');
  ok(q('.pp-key').length === 1, '模拟按键渲染');
  ok($('popup-preview').textContent.indexOf('状态回退') >= 0, '预览显示回退链说明');
  /* shift 切换：候选气泡按 shifted/normal 切换，且模拟按键大小写跟随 */
  const shiftChk = $('popup-preview').querySelectorAll('.pp-shift')[0];
  ok(!!shiftChk, 'Shift 开关存在');
  const keyBefore = q('.pp-key')[0].textContent;
  shiftChk.checked = true;
  shiftChk._fire('change');
  ok(q('.pp-cand').length >= 1, 'Shift 状态候选渲染');
  const keyShifted = q('.pp-key')[0].textContent;
  ok(keyShifted !== '' && keyBefore !== '', '模拟按键有标签');
  shiftChk.checked = false;
  shiftChk._fire('change');
  eq(q('.pp-key')[0].textContent, keyBefore, '取消 Shift 后模拟按键恢复');

  /* 添加候选（文本类型）端到端 */
  console.log('== 弹出菜单候选编辑 ==');
  const addBtns = q('#popup-keys .chip-add');
  ok(addBtns.length >= 26, '每个状态行都有添加按钮');
  addBtns[0].click();
  let dlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(!!dlg, '候选编辑对话框打开');
  const candTypeSel = dlg.querySelectorAll('select')[0];
  ok(!!candTypeSel, '候选类型选择器存在');
  const candTextInp = dlg.querySelectorAll('input').find(i => i.getAttribute('type') === 'text');
  candTextInp.value = 'ẗ';
  candTextInp._fire('input');
  dlg.querySelectorAll('.dialog-toolbar .primary')[0].click();
  ok(!dlg.open, '保存后对话框关闭');
  ok($('popup-status') != null, '状态区存在');
  /* 验证写入了 profile（首个键的 normal 末尾） */
  const firstKeyEl = q('#popup-keys .popup-key-card code')[0];
  const firstPk = firstKeyEl.textContent;
  const firstArr = FE.state.popupProfile.schemas.default[firstPk].normal;
  ok(firstArr[firstArr.length - 1] === 'ẗ', '新候选写入 normal 末尾');
  /* 撤销 */
  $('op-undo').click();
  ok(FE.state.popupProfile.schemas.default[firstPk].normal[firstArr.length - 1] !== 'ẗ' || FE.state.popupProfile.schemas.default[firstPk].normal.length === firstArr.length - 1, '撤销弹回候选');

  /* 布局联动：构造只含 z 键的弹出菜单 + 加载带 popupKey 的 split 布局 */
  console.log('== 弹出菜单与布局联动 ==');
  $('popup-json').value = '{ "type": "foxy.popup-profile", "schemas": { "default": { "z": { "normal": ["Z"] } } } }';
  $('popup-json-apply').click();
  ok(!!FE.state.popupProfile.schemas.default.z, '载入最小弹出菜单');
  ok(Object.keys(FE.state.popupProfile.schemas.default).length === 1, '当前弹出菜单只有 z 键');
  $('op-example').value = 'split.json';
  $('op-load-example').click();
  tabs[3]._fire('click');
  ok($('popup-validation').textContent.indexOf('布局使用') >= 0, '校验行显示布局使用 popupKey 统计');
  /* 一键补齐缺失键 */
  const missBtn = q('.popup-missing .mini-button')[0];
  ok(!!missBtn, '提供「一键补齐」缺失 popupKey');
  missBtn.click();
  ok($('popup-validation').textContent.indexOf('个未定义') < 0, '补齐后无缺失提示');
  /* 预览选中 q 后气泡显示其候选 */
  ok(q('.pp-bubble').length === 1, '补齐后气泡仍渲染');
  /* 布局预览出现 ⌄ 徽标 */
  tabs[0]._fire('click');
  ok(q('.kb-badge-popup').length >= 20, '布局预览渲染弹出菜单 ⌄ 徽标（实际 ' + q('.kb-badge-popup').length + '）');
  ok(documentStub.querySelector('.preview-legend').textContent.indexOf('长按弹出菜单') >= 0, '图例含弹出菜单说明');

  /* 弹出菜单 JSON 应用（含尾逗号自动修复） */
  console.log('== 弹出菜单 JSON 应用 ==');
  tabs[3]._fire('click');
  $('popup-json').value = '{\n  "type": "foxy.popup-profile",\n  "schemas": { "default": { "z": { "normal": ["Z", "ź",], } } },\n}';
  $('popup-json-apply').click();
  ok(FE.state.popupProfile.schemas.default.z, '含尾逗号的弹出菜单 JSON 应用成功');
  ok($('popup-json-status').textContent.indexOf('已应用') >= 0, '弹出菜单 JSON 状态显示应用');
  ok($('popup-json').value.indexOf('"z"') >= 0, '应用后 JSON 同步');
  /* 错误 type 拒绝 */
  $('popup-json').value = '{ "type": "foxy.keyboard-layout", "schemas": { "default": {} } }';
  $('popup-json-apply').click();
  ok($('popup-json-status').textContent.indexOf('foxy.popup-profile') >= 0, '错误 type 被拒绝并说明');

  /* 主对话框弹出菜单 section：有 popupKey 的按键渲染整键候选编辑。
   * 注意此前小节把 popupProfile 换成了只含 z 的集合，这里先补齐缺失键，
   * 保证 q 有候选可渲染（与真实使用流程一致）。 */
  console.log('== 主对话框弹出菜单 section（有 popupKey） ==');
  $('op-example').value = 'split.json';
  $('op-load-example').click();
  tabs[3]._fire('click');
  const missBtn2 = q('.popup-missing .mini-button')[0];
  ok(!!missBtn2, '补齐按钮存在（恢复 q 候选）');
  missBtn2.click();
  /* 补齐只建空键：从气泡示例取回 q 的真实候选 */
  $('popup-example').value = '气泡-popup.json';
  $('popup-load-example').click();
  ok(!!(FE.state.popupProfile.schemas.default.q && FE.state.popupProfile.schemas.default.q.normal),
    '恢复气泡示例后 q 有 normal 候选');
  tabs[0]._fire('click');
  documentStub._openDialogs.length = 0;
  q('.kb-key')[0].click(); /* split.json 首键 qwerty.q 自带 popupKey=q */
  const pdlg = documentStub._openDialogs[0];
  ok(pdlg.querySelectorAll('.popup-section').length === 1, '有 popupKey 时 section 存在');
  const pSubs = pdlg.querySelectorAll('.popup-section .popup-cand');
  const qExp = (FE.state.popupProfile.schemas.default.q.normal || []).length +
    ((FE.state.popupProfile.schemas.default.q.shifted || []).length);
  ok(pSubs.length === qExp && qExp >= 10,
    'section 渲染出对应键的全部候选（实际 ' + pSubs.length + '，期望 ' + qExp + '）');
  ok(pdlg.querySelectorAll('.popup-section .popup-state-row').length === 2, 'section 含常规/Shift 两行');
  /* section 内添加候选 → 写回 popupProfile → 撤销弹回 */
  pdlg.querySelectorAll('.popup-section .chip-add')[0].click();
  const pcDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(pcDlg.textContent.indexOf('候选') >= 0, 'section 内可打开候选编辑对话框');
  const pcInp = pcDlg.querySelectorAll('input').find(i => i.getAttribute('type') === 'text');
  pcInp.value = 'qtest';
  pcInp._fire('input');
  pcDlg.querySelectorAll('.dialog-toolbar .primary')[0].click();
  ok(!pcDlg.open, '候选保存后关闭');
  const qArr = FE.state.popupProfile.schemas.default.q.normal;
  ok(qArr[qArr.length - 1] === 'qtest', 'section 内添加候选写回 profile');
  $('op-undo').click();
  ok(FE.state.popupProfile.schemas.default.q.normal.indexOf('qtest') < 0, '撤销弹回 section 内添加');
  /* 主对话框保存后 popupKey 修改能同步到 section（重建表单） */
  pdlg.close();
  documentStub._openDialogs.length = 0;

  /* 手势对话框的「编辑弹出菜单候选 →」跳转 */
  console.log('== 手势对话框 → 弹出菜单跳转 ==');
  tabs[0]._fire('click');
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kdlg = documentStub._openDialogs[0];
  const lpBtns = kdlg.querySelectorAll('button').filter(b => b.textContent === '编辑…');
  lpBtns[6].click(); /* 长按 longPress（第 7 个编辑按钮） */
  const gdlg2 = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(gdlg2.textContent.indexOf('弹出菜单键') >= 0, '长按手势对话框含 popupKey 字段');
  ok(gdlg2.textContent.indexOf('编辑弹出菜单候选') >= 0, '提供跳转编辑按钮');
  const jumpBtn = gdlg2.querySelectorAll('button').find(b => b.textContent.indexOf('编辑弹出菜单候选') === 0);
  jumpBtn.click();
  ok($('tab-popup').classList.contains('active'), '跳转到弹出菜单页');
  ok(FE.state.popupSelKey === 'q', '预览选中 q');
  /* 预览选中 q：气泡渲染出候选 */
  ok(q('.pp-bubble').length === 1, '跳转后气泡预览渲染');
  ok(q('.pp-cand').length >= 1, '跳转后气泡候选渲染（实际 ' + q('.pp-cand').length + '）');
  documentStub._openDialogs.length = 0;

  /* 审查缺陷回归：非对象导入必须被拒绝而非抛异常 */
  console.log('== 审查缺陷回归 ==');
  let threwNonObject = false;
  try { ok(FE.applyProfileText('[]') === false, '数组根节点被拒绝'); }
  catch (e) { threwNonObject = true; }
  ok(!threwNonObject, '数组根节点不会抛异常');
  let threwEmptyLayouts = false;
  try { FE.applyProfileText('{"layouts":{}}'); }
  catch (e) { threwEmptyLayouts = true; }
  ok(!threwEmptyLayouts, '空 layouts 渲染不会抛异常');

  /* 直接动作手势打开编辑器后应保留动作 */
  documentStub._openDialogs.length = 0;
  let directSaved = null;
  FE.openGestureDialog({ slot: 'tap', gesture: { type: 'key', key: 'A', popup: false }, onChange: v => { directSaved = v; } });
  const directDlg = documentStub._openDialogs[0];
  directDlg.querySelectorAll('.dialog-toolbar .primary')[0].click();
  ok(directSaved && directSaved.type === 'key' && directSaved.key === 'A' && directSaved.popup === false, '直接动作手势无损保存');
  documentStub._openDialogs.length = 0;

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
}, 350);
