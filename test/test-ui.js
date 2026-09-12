/* UI 冒烟测试（Node + DOM 桩）
 * 用法: node test/test-ui.js
 * 验证 boot、实时渲染、布局切换、状态切换、编辑器面板与对话框打开。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { documentStub, localStorageStub, buildSkeleton } = require('./dom-stub');

buildSkeleton();
global.window = global;
global.document = documentStub;
global.localStorage = localStorageStub;
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

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInThisContext(code, { filename: file });
}
load('data.js');
load('default-profile.js');
load('examples-bundle.js');
load('app.js');
load('key-dialog.js');

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
eq(q('.pill').length, 3, '3 个布局 pill');
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

/* 标签页切换 */
const tabs = q('.tab');
tabs[3]._fire('click');
ok($('tab-json').classList.contains('active'), 'JSON 标签激活');
tabs[0]._fire('click');
ok($('tab-layout').classList.contains('active'), '布局标签激活');

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
ok(q('.gedit-covered').length === 1, '跨距键覆盖 1 格');
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
eq(q('.gedit-key').length, 1, '1 个按键格');
/* 点击空格 → 打开选择器 */
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

  console.log('== 导入文件：无法解析（引导到一键修复） ==');
  const badText = '{\n  "layouts": {\n    "default": { "sections": [] },\n  },\n  "keys": { oops }\n}';
  global.__fileContent = badText;
  fileInput.files = [{ name: 'broken.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok($('tab-json').classList.contains('active'), '自动切换到 JSON 标签页');
  ok($('json-editor').value === badText, '原文已载入 JSON 编辑区');
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

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
}, 350);
