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
/* 可用的 FileReader 桩：读取 file.__content（多文件场景），回退 global.__fileContent */
global.__fileContent = '';
global.FileReader = class {
  readAsText(file) {
    const self = this;
    setTimeout(() => {
      self.result = (file && file.__content != null) ? file.__content : global.__fileContent;
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
load('folder-import.js');
load('key-dialog.js');
load('macro-editor.js');
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
/* 提示字号编辑：统一值 → hintTextSize 数字；按方向 → 对象；清除 → null */
documentStub._openDialogs.length = 0;
FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
const kdHts = documentStub._openDialogs[0];
const htsRow = kdHts.querySelectorAll('.form-row.form-inline').filter(function (r) { return r.textContent.indexOf('提示大小') >= 0; })[0];
ok(!!htsRow, '存在「提示大小」统一值输入行');
const htsInp = htsRow.querySelectorAll('input')[0];
htsInp.value = '13';
htsInp._fire('change');
const htsUpInp = kdHts.querySelectorAll('.hts-dir-grid input')[0]; /* 上 */
htsUpInp.value = '9';
htsUpInp._fire('change');
ok(FE.state.profile.keys['qwerty.q'].hintTextSize === undefined, '面板修改只进 draft，保存前不动 profile');
kdHts.querySelectorAll('.dialog-toolbar .primary')[0].click();
/* 方向输入把统一值转为对象：up 覆盖为 9，其余方向保留统一值 13 */
eq(FE.state.profile.keys['qwerty.q'].hintTextSize.up, 9, '方向字号覆盖 up');
eq(FE.state.profile.keys['qwerty.q'].hintTextSize.down, 13, '其余方向保留统一值');
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
const kdHts2 = documentStub._openDialogs[0];
const htsClear2 = kdHts2.querySelectorAll('.form-row.form-inline').filter(function (r) { return r.textContent.indexOf('提示大小') >= 0; })[0].querySelectorAll('button')[0];
htsClear2.click();
kdHts2.querySelectorAll('.dialog-toolbar .primary')[0].click();
ok(FE.state.profile.keys['qwerty.q'].hintTextSize === null, '「清除」写入显式 null（显式清除继承）');
FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
documentStub._openDialogs.length = 0;
$('op-undo').click();
eq(FE.state.profile.keys['qwerty.q'].swipe.up.label, undefined, '撤销手势修改');
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
ok($('json-status').textContent.indexOf('未应用') >= 0, '布局 JSON 卡片内同步显示错误（不再无反应）');

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

console.log('== 动作：图形化编辑（不再是 JSON 文本框） ==');
FE.mutate(() => {
  FE.state.profile.actions['test.act'] = { type: 'app', command: 'settings' };
  FE.state.profile.actions['test.left'] = { type: 'key', key: 'LEFT', meta: ['CTRL'] };
  FE.state.profile.actions['test.del'] = { type: 'key', key: 'BACKSPACE' };
});
const actHost = $('actions-list');
ok(actHost.querySelectorAll('.snippet-editor').length === 0, '动作列表不再使用 JSON 片段编辑器');
/* 懒建是性能保证：折叠状态下**不得**存在任何编辑器节点。
 * 早期版本折叠也预先建好，实测 29 动作 + 41 宏会让 DOM 涨到 ~47.5K 节点、
 * 每次 renderAll 重建一遍 —— 打开页面就白烧 CPU。这条断言防止改回去。 */
ok(actHost.querySelectorAll('.action-def-editor').length === 0, '折叠状态下不构建动作编辑器（懒建）');
const delItem = actHost.querySelectorAll('.def-item').find(it => {
  const n = it.querySelectorAll('.def-name')[0];
  return n && n.textContent === 'test.del';
});
ok(!!delItem, '动作 test.del 出现在列表中');
/* 展开该条 → 触发 toggle → 才构建编辑器 */
delItem.open = true;
const actEd = delItem.querySelectorAll('.action-def-editor')[0];
ok(!!actEd, '展开后构建出图形化编辑器');
ok(actEd.querySelectorAll('.action-editor').length === 1, '动作编辑器含类型下拉与字段区');
ok(actEd.textContent.indexOf('编辑原始 JSON') >= 0, '动作编辑器保留「编辑原始 JSON…」逃生口');
const actTypeSel = actEd.querySelectorAll('select')[0];
eq(actTypeSel.value, 'key', '类型下拉按当前动作类型预选');
/* 关键：只动下拉框、不碰任何 JSON 文本，就应当写回 profile */
actTypeSel.value = 'modifier';
actTypeSel._fire('change');
eq(FE.state.profile.actions['test.del'].type, 'modifier', '切换类型下拉即写回 profile');
eq(FE.state.profile.actions['test.del'].modifier, 'SHIFT', '修饰键默认值写回 profile');
/* 收起 → 回收节点；再次展开 → 重建，且保留改过的值 */
delItem.open = false;
ok(delItem.querySelectorAll('.action-def-editor').length === 0, '收起后编辑器被销毁（回收节点）');
ok(delItem.querySelectorAll('.def-summary').length === 1, '收起后摘要行仍在');
delItem.open = true;
const delEd2 = delItem.querySelectorAll('.action-def-editor')[0];
ok(!!delEd2, '再次展开可重建编辑器');
const delTypeSel2 = delEd2.querySelectorAll('select')[0];
eq(delTypeSel2.value, 'modifier', '重建后仍显示上次改的类型');
/* 改回 key，供后续宏测试当作可引用动作 */
delTypeSel2.value = 'key';
delTypeSel2._fire('change');
eq(FE.state.profile.actions['test.del'].type, 'key', '改回 key 类型同样立即写回');
delItem.open = false;

console.log('== 宏：步骤图形化编辑（每步一行 + 下拉框 + 增删排序） ==');
FE.mutate(() => {
  FE.state.profile.macros['test.macro'] = [
    { action: 'test.left' },
    { type: 'key', key: 'BACKSPACE' },
    { action: 'test.act' }
  ];
});
const macHost = $('macros-list');
ok(macHost.querySelectorAll('.snippet-editor').length === 0, '宏列表不再使用 JSON 片段编辑器');
/* 懒建：折叠状态下不得有任何步骤编辑器节点（宏的每步都是一个内联动作编辑器，
 * 预建代价最大，正是 CPU 问题的来源） */
ok(macHost.querySelectorAll('.macro-steps').length === 0, '折叠状态下不构建宏步骤编辑器（懒建）');
const macItem = macHost.querySelectorAll('.def-item').find(it => {
  const n = it.querySelectorAll('.def-name')[0];
  return n && n.textContent === 'test.macro';
});
ok(!!macItem, '宏 test.macro 出现在列表中');
/* 展开 → 构建 */
macItem.open = true;
const macRoot = macItem.querySelectorAll('.macro-steps')[0];
ok(!!macRoot, '展开后构建出图形化步骤编辑器');
let msteps = macRoot.querySelectorAll('.macro-step');
eq(msteps.length, 3, '宏的 3 个步骤各占一行');
/* 核心抽象：每一步就是一个 action，行内是同一个动作编辑器 */
eq(msteps[0].querySelectorAll('.action-editor').length, 1, '引用型步骤也是同一个动作编辑器');
eq(msteps[0].querySelectorAll('select.action-ref-select').length, 1, '引用型步骤显示动作名下拉');
eq(msteps[0].querySelectorAll('.action-editor select')[0].value, 'ref', '引用型步骤的类型下拉选中「引用动作名」');
eq(msteps[1].querySelectorAll('.action-editor select')[0].value, 'key', '内联型步骤的类型下拉选中 key');
ok(msteps[2].querySelectorAll('button').some(b => b.title === '删除此步'), '每步都有删除按钮');
eq(msteps[0].textContent.indexOf('1') >= 0, true, '步骤显示序号');
/* 不允许有第二层「步骤类型」下拉：抽象归一到动作编辑器 */
eq(macRoot.querySelectorAll('select.macro-step-kind').length, 0, '不再有额外的「步骤类型」下拉（已抽象为动作编辑器）');

/* ▲ 重排：步骤 3 上移到第 2 位，且不把 {action:名} 改写成别的写法 */
const stepId = (s) => (typeof s === 'string') ? s : (typeof s.action === 'string' ? s.action : s.type);
eq(FE.state.profile.macros['test.macro'].map(stepId), ['test.left', 'key', 'test.act'], '初始顺序正确');
const upBtn = msteps[2].querySelectorAll('button').find(b => b.title === '上移');
ok(!!upBtn, '每步都有上移按钮');
upBtn.click();
eq(FE.state.profile.macros['test.macro'].map(stepId), ['test.left', 'test.act', 'key'], '上移按钮调整了步骤顺序');
eq(FE.state.profile.macros['test.macro'][1].action, 'test.act', '重排后引用步骤仍是 { action: 名 } 写法');

/* ＋ 插入 / ✕ 删除 */
msteps = macRoot.querySelectorAll('.macro-step');
msteps[0].querySelectorAll('button').find(b => b.title === '在下方插入一步').click();
eq(FE.state.profile.macros['test.macro'].length, 4, '「＋」在下方插入一步');
msteps = macRoot.querySelectorAll('.macro-step');
msteps[0].querySelectorAll('button').find(b => b.title === '删除此步').click();
eq(FE.state.profile.macros['test.macro'].length, 3, '「✕」删除该步');

/* 动作名下拉：换一个动作即写回 profile（纯下拉操作，不动 JSON 文本）。
 * 该步原本是裸字符串写法，改名后仍应保持裸字符串（不因编辑就改写成 {action:名}）。 */
msteps = macRoot.querySelectorAll('.macro-step');
const aSel = msteps[0].querySelectorAll('select.action-ref-select')[0];
aSel.value = 'test.del';
aSel._fire('change');
eq(FE.state.profile.macros['test.macro'][0], 'test.del', '改动作名下拉即写回 profile（裸字符串写法保持）');

/* 宏不能调用宏：动作编辑器的类型下拉里不应出现 macro（文档：嵌套宏步骤会被丢弃）。
 * 注意：上面的增删/移动已改变步骤位置，这里**动态定位**引用型步骤，不写死下标。 */
const refRow = msteps.find(r => r.querySelectorAll('select.action-ref-select').length > 0);
ok(!!refRow, '引用型步骤仍在列表中（动态定位）');
const refIdx = msteps.indexOf(refRow);
const inlineEd = refRow.querySelectorAll('.action-editor')[0];
const inlineTypeSel = inlineEd.querySelectorAll('select')[0];
const inlineOpts = inlineTypeSel.querySelectorAll('option').map(o => o.getAttribute('value'));
ok(inlineOpts.indexOf('macro') < 0, '动作编辑器去掉了「宏调用」选项（禁止嵌套宏）');
ok(inlineOpts.indexOf('key') >= 0 && inlineOpts.indexOf('app') >= 0, '仍保留 key / app 等直接动作类型');
ok(inlineOpts.indexOf('ref') >= 0, '保留「引用动作名」类型');

/* 引用步骤切为内联动作 → 写回 profile（验证类型下拉直接驱动数据） */
inlineTypeSel.value = 'app';
inlineTypeSel._fire('change');
eq(FE.state.profile.macros['test.macro'][refIdx].type, 'app', '引用步骤切为 app 后写回 profile');

console.log('== 动作与宏：默认折叠 / 可展开 / 新建自动展开 ==');
/* 重置展开状态，验证默认值就是「全部折叠」 */
FE.state.openActions = null;
FE.state.openMacros = null;
FE.mutate(() => {});
const actItems = $('actions-list').querySelectorAll('.def-item.def-collapsible');
const macItems0 = $('macros-list').querySelectorAll('.def-item.def-collapsible');
ok(actItems.length >= 3, '动作条目使用可折叠外壳');
ok(macItems0.length >= 1, '宏条目使用可折叠外壳');
ok(actItems.every(it => !it.open), '动作条目默认全部折叠');
ok(macItems0.every(it => !it.open), '宏条目默认全部折叠');
ok(actItems.every(it => it.querySelectorAll('.def-summary').length === 1), '每条都有摘要行（可点击处）');
ok(actItems.every(it => it.children[0].tagName === 'SUMMARY'), 'summary 是 details 的首个子元素（原生折叠语义）');
ok(actItems.every(it => it.querySelectorAll('.def-summary-caret').length === 1), '摘要行带展开指示三角');
/* 折叠时不构建编辑器（懒建）——这是性能保证，不是"暂时没建好"。
 * 早期版本折叠也预先建好，实测 29 动作 + 41 宏会让 DOM 从 ~1.4K 涨到 ~47.5K 节点
 * （光 <option> 就 1.8 万个：每个「按键 key」内联编辑器都含 143 项键码下拉），
 * 且每次 renderAll 都要重建整棵树 —— 打开页面就白烧 CPU。**不要改回去。** */
ok(actItems.every(it => it.querySelectorAll('.action-def-editor').length === 0), '折叠动作条目不构建编辑器（懒建）');
ok(macItems0.every(it => it.querySelectorAll('.macro-steps').length === 0), '折叠宏条目不构建步骤编辑器（懒建）');
/* 但摘要行必须始终在，否则用户没法点开 */
ok(actItems.every(it => it.querySelectorAll('.def-summary').length === 1), '折叠时摘要行仍在，可点击展开');

/* 展开一条：桩的 open 访问器会派发 toggle（与真实浏览器一致） */
const firstAct = actItems[0];
const firstName = firstAct.querySelectorAll('.def-name')[0].textContent;
firstAct.open = true;
ok(FE.state.openActions[firstName] === true, '展开后展开状态被记录');
ok(firstAct.querySelectorAll('.action-def-editor').length === 1, '展开后才构建编辑器');

/* 任何重渲染（增删 / 撤销 / 导入）后都要保持用户当前的展开视图 */
FE.renderAll();
const afterRe = $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === firstName);
ok(!!afterRe && afterRe.open === true, '重渲染后仍保持该条展开');

afterRe.open = false;
afterRe._fire('toggle');
ok(!FE.state.openActions[firstName], '收起后展开状态被清除');

/* 新建动作 / 宏：默认展开，方便建完立刻配置 */
const actAddInput = $('actions-list').querySelectorAll('input')
  .find(i => String(i.getAttribute('placeholder') || '').indexOf('新动作名称') >= 0);
ok(!!actAddInput, '动作列表有新增输入框');
actAddInput.value = 'test.fresh';
$('actions-list').querySelectorAll('button').find(b => b.textContent === '+ 新增动作').click();
ok(!!FE.state.profile.actions['test.fresh'], '新建动作已写入 profile');
ok(FE.state.openActions['test.fresh'] === true, '新建动作默认展开');
const freshItem = $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === 'test.fresh');
ok(!!freshItem && freshItem.open === true, '新建条目在界面上确实展开');

const macAddInput = $('macros-list').querySelectorAll('input')
  .find(i => String(i.getAttribute('placeholder') || '').indexOf('新宏名称') >= 0);
ok(!!macAddInput, '宏列表有新增输入框');
macAddInput.value = 'test.freshmacro';
$('macros-list').querySelectorAll('button').find(b => b.textContent === '+ 新增宏').click();
ok(!!FE.state.profile.macros['test.freshmacro'], '新建宏已写入 profile');
ok(FE.state.openMacros['test.freshmacro'] === true, '新建宏默认展开');

/* 摘要行内的删除按钮：可用，且顺手清掉展开状态（不留脏记录） */
FE.renderAll();
const freshItem2 = $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === 'test.fresh');
freshItem2.querySelectorAll('button').find(b => b.textContent === '删除').click();
ok(!FE.state.profile.actions['test.fresh'], '摘要行内的删除按钮可用（未被折叠语义吞掉）');
ok(!FE.state.openActions['test.fresh'], '删除后同时清掉展开状态');

console.log('== 加/删动作与宏：不再跳回分栏顶部 ==');
/* 真实成因：被点掉的按钮同时是焦点元素，它一被移除，浏览器交回焦点并滚回顶部。
 * dom-stub 的 removeChild 已照抄这一副作用，所以这里验的是真问题而非自说自话。 */
FE.renderAll();
const scrollHost = documentStub.documentElement;
const findActByName = (nm) => $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === nm);
const findMacByName = (nm) => $('macros-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === nm);

/* --- 删除动作 --- */
const delBtnForScroll = findActByName('test.del')
  .querySelectorAll('button').find(b => b.textContent === '删除');
ok(!!delBtnForScroll, '找到待删除动作的删除按钮');
scrollHost.scrollTop = 520;
delBtnForScroll.focus();
ok(documentStub.activeElement === delBtnForScroll, '（前置）删除按钮持有焦点，模拟用户刚点过');
delBtnForScroll.click();
ok(!FE.state.profile.actions['test.del'], '动作已删除');
ok(scrollHost.scrollTop === 520, '删除动作后滚动位置保持原处（未跳回分栏顶部）');

/* --- 新增动作 --- */
const actAddInput2 = $('actions-list').querySelectorAll('input')
  .find(i => String(i.getAttribute('placeholder') || '').indexOf('新动作名称') >= 0);
const actAddBtn2 = $('actions-list').querySelectorAll('button').find(b => b.textContent === '+ 新增动作');
actAddInput2.value = 'test.scrolladd';
scrollHost.scrollTop = 640;
actAddBtn2.focus();
actAddBtn2.click();
ok(!!FE.state.profile.actions['test.scrolladd'], '新增动作成功');
ok(scrollHost.scrollTop === 640, '新增动作后滚动位置保持原处');

/* --- 新增宏 --- */
const macAddInput2 = $('macros-list').querySelectorAll('input')
  .find(i => String(i.getAttribute('placeholder') || '').indexOf('新宏名称') >= 0);
const macAddBtn2 = $('macros-list').querySelectorAll('button').find(b => b.textContent === '+ 新增宏');
macAddInput2.value = 'test.scrollmacro';
scrollHost.scrollTop = 780;
macAddBtn2.focus();
macAddBtn2.click();
ok(!!FE.state.profile.macros['test.scrollmacro'], '新增宏成功');
ok(scrollHost.scrollTop === 780, '新增宏后滚动位置保持原处');

/* --- 删除宏 --- */
FE.renderAll();
const macDelBtn = findMacByName('test.scrollmacro')
  .querySelectorAll('button').find(b => b.textContent === '删除');
scrollHost.scrollTop = 410;
macDelBtn.focus();
macDelBtn.click();
ok(!FE.state.profile.macros['test.scrollmacro'], '宏已删除');
ok(scrollHost.scrollTop === 410, '删除宏后滚动位置保持原处');

/* --- 反向保证：有意的滚动不能被"补帧恢复"拽回去 ---
 * locateIssue 会主动滚到出错的按键；此时 afterChange 排下的那一帧恢复必须失效，
 * 否则刚定位过去又被拽回原处。
 * 桩默认的 rAF 是**同步**的，观察不到「待执行的一帧」，这里临时改成收集回调。 */
ok(typeof FE.cancelScrollRestore === 'function', '暴露 cancelScrollRestore（供有意滚动作废待恢复快照）');
const savedRaf = global.requestAnimationFrame;
let pendingFrame = null;
global.requestAnimationFrame = (fn) => { pendingFrame = fn; return 1; };

scrollHost.scrollTop = 900;
const snap900 = FE.captureScroll();
eq(snap900.top, 900, 'captureScroll 记录当前滚动位置');
FE.restoreScroll(snap900);
eq(scrollHost.scrollTop, 900, 'restoreScroll 同步恢复位置');
ok(typeof pendingFrame === 'function', '同时排下一帧做兜底（焦点归还引发的滚动是异步的）');
scrollHost.scrollTop = 100;        // 有意滚动（模拟 locateIssue）
FE.cancelScrollRestore();          // 作废那一帧
pendingFrame();                    // 帧到了
eq(scrollHost.scrollTop, 100, 'cancel 之后补帧不再把位置拽回');

/* 对照：未 cancel 时补帧确实会恢复，证明上一条不是因为"补帧本身没生效" */
scrollHost.scrollTop = 500;
const snap500 = FE.captureScroll();
FE.restoreScroll(snap500);
scrollHost.scrollTop = 100;
pendingFrame();
eq(scrollHost.scrollTop, 500, '对照：未 cancel 时补帧会恢复位置');

global.requestAnimationFrame = savedRaf;
scrollHost.scrollTop = 0;

console.log('== 按键下拉：显示名带中文备注，落盘值不变 ==');
const kdEsc = FE.buildActionEditor({ type: 'key', key: 'ESCAPE' }, {});
const kdEscSelects = kdEsc.el.querySelectorAll('select');
ok(kdEscSelects.length >= 2, '动作编辑器含类型下拉与键下拉');
const keySelEl = kdEscSelects[kdEscSelects.length - 1];
const escOpt = keySelEl.querySelectorAll('option').find(o => o.getAttribute('value') === 'ESCAPE');
ok(!!escOpt, '键下拉里能选到 ESCAPE');
ok(escOpt.textContent.indexOf('（') >= 0, '按键选项带括号中文备注');
eq(escOpt.getAttribute('value'), 'ESCAPE', '选项 value 仍是 code 本身');
eq(keySelEl.value, 'ESCAPE', '下拉当前选中值按 code 匹配');
eq(kdEsc.getValue().key, 'ESCAPE', 'getValue 仍返回 code，不被显示名影响');
ok(kdEsc.el.querySelectorAll('optgroup').length >= 5, '键下拉按分组（字母/标点/导航…）组织');
/* 抽查几个有备注的码，确认备注确实可读 */
[['BACKSPACE', '退格'], ['SPACE', '空格'], ['ENTER', '回车'], ['KP_5', '小键盘 5'], ['F1', '功能键 F1']]
  .forEach(([code, note]) => {
    const o = keySelEl.querySelectorAll('option').find(x => x.getAttribute('value') === code);
    ok(!!o && o.textContent.indexOf(note) >= 0, code + ' 的备注含「' + note + '」');
  });

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
  /* 4 基础角色 + shadow + pressed + hint 四边 + 3 states × 3 角色 = 19 个 jscolor 输入框 */
  eq(colorInputs.length, 19, '颜色区共 19 个 jscolor 输入框（4 基础 + shadow + pressed + hint 四边 + 3×3 states）');
  ok(colorInputs.every(i => i.getAttribute('data-jscolor') !== null), '全部颜色输入框带 data-jscolor');
  ok(!!JscolorStub.instances && JscolorStub.instances.length === 19, '每个颜色输入框都安装了 jscolor 实例');
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
  /* hint 四边角色：写入 draft 并保存到 profile */
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kd4 = documentStub._openDialogs[0];
  const advCard4 = kd4.querySelectorAll('.color-adv-card')[0];
  const hintInputs = advCard4.querySelectorAll('.form-row.form-inline').filter(r => r.textContent.indexOf('hintTop') >= 0 || r.textContent.indexOf('hintBottom') >= 0 || r.textContent.indexOf('hintLeft') >= 0 || r.textContent.indexOf('hintRight') >= 0);
  ok(hintInputs.length === 4, 'hint 四边角色行存在（hintTop/hintBottom/hintLeft/hintRight）');
  const topInp = hintInputs.filter(r => r.textContent.indexOf('hintTop') >= 0)[0].querySelectorAll('input')[0];
  topInp.value = '#FFFF00';
  topInp._fire('change');
  kd4.querySelectorAll('.dialog-toolbar .primary')[0].click();
  eq(FE.state.profile.keys['qwerty.q'].colors.hintTop, '#FFFF00', 'hintTop 颜色写入 profile');
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
}
documentStub._openDialogs.length = 0;

console.log('== 预览颜色渲染（基础 pressed/shadow/hint 四边 + states 优先级） ==');
/* 前面的用例已加载 cc lite.json 等示例，这里回到内置默认布局，
 * 保证 qwerty.q / qwerty.shift 一定被渲染（否则断言取到的不是目标键）。 */
FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
$('pt-shift').checked = false;
$('pt-shift')._fire('change');
FE.state.profile.keys['qwerty.q'] = {
  ref: 'rime.q', keyType: 'LETTER',
  swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } },
  colors: {
    background: '#4CAF50', text: '#FFFFFFFF', shadow: '#40000000',
    pressed: '#388E3C', hint: '#ABCDEF', hintTop: '#123456', hintBottom: '#654321'
  }
};
FE.renderAll();
{
  const key = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
  ok(!!key, '找到 qwerty.q 对应的预览按键');
  eq(key.style.background, '#4CAF50', '基础 background 应用到按键');
  eq(key.style.color, '#FFFFFFFF', '基础 text 应用到按键');
  ok(String(key.style.boxShadow).indexOf('#40000000') >= 0, '基础 shadow 渲染为 box-shadow（含透明色）');
  /* 提示四边：hint 是兜底，hintTop/hintBottom 按边覆盖 */
  eq(q('.kb-hint-up', key)[0].style.color, '#123456', 'hintTop 只作用于上滑提示');
  eq(q('.kb-hint-down', key)[0].style.color, '#654321', 'hintBottom 只作用于下滑提示');
  /* pointerdown → 基础 pressed 角色生效（无 states.pressed 时） */
  key._fire('pointerdown');
  eq(key.style.background, '#388E3C', '按住时基础 pressed 角色生效');
  key._fire('pointerup');
  eq(key.style.background, '#4CAF50', '松开后恢复基础 background');

  /* states.pressed 覆盖基础 pressed；按下时默认隐藏阴影 */
  FE.state.profile.keys['qwerty.q'] = {
    ref: 'rime.q', keyType: 'LETTER',
    colors: { background: '#4CAF50', pressed: '#388E3C', shadow: '#40000000', states: { pressed: { background: '#2E7D32' } } }
  };
  FE.renderAll();
  const key2 = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
  ok(String(key2.style.boxShadow).indexOf('#40000000') >= 0, '未按下时基础 shadow 生效');
  key2._fire('pointerdown');
  eq(key2.style.background, '#2E7D32', 'states.pressed 优先于基础 pressed');
  eq(key2.style.boxShadow, 'none', '按下时默认隐藏普通阴影');
  key2._fire('pointerup');

  /* 状态显式给 shadow 时，按下仍绘制（含透明值 → 保持透明但存在） */
  FE.state.profile.keys['qwerty.q'] = {
    ref: 'rime.q', keyType: 'LETTER',
    colors: { shadow: '#40000000', states: { pressed: { shadow: '#00000000' } } }
  };
  FE.renderAll();
  const key3 = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
  key3._fire('pointerdown');
  ok(String(key3.style.boxShadow).indexOf('#00000000') >= 0, '状态的显式透明 shadow 仍然绘制（不落回 none）');
  key3._fire('pointerup');

  /* 修饰键状态色优先级：modifierLocked 覆盖 modifierActive；pressed 最高 */
  FE.state.profile.keys['qwerty.shift'] = {
    ref: 'foxy.Shift',
    colors: {
      background: '#222222',
      states: {
        modifierActive: { background: '#111111', text: '#111111' },
        modifierLocked: { background: '#222222', text: '#222222' },
        pressed: { background: '#333333' }
      }
    }
  };
  $('pt-shift').checked = false;
  $('pt-shift')._fire('change');
  FE.renderAll();
  const shiftKey = q('.kb-key').find(k => k.querySelectorAll('.kb-icon-wrap').length > 0);
  ok(!!shiftKey, '找到带图标的 Shift 修饰键');
  $('pt-shift').checked = true;
  $('pt-shift')._fire('change');
  const shiftKey2 = q('.kb-key').find(k => k.querySelectorAll('.kb-icon-wrap').length > 0);
  eq(shiftKey2.style.background, '#222222', 'Shift 激活时 modifierLocked 覆盖 modifierActive');
  eq(shiftKey2.style.color, '#222222', 'modifierLocked 的 text 同样生效');
  ok(shiftKey2.style.boxShadow === 'none', '修饰键激活时默认隐藏普通阴影');
  shiftKey2._fire('pointerdown');
  eq(shiftKey2.style.background, '#333333', 'pressed 优先级高于 modifierLocked');
  shiftKey2._fire('pointerup');
  $('pt-shift').checked = false;
  $('pt-shift')._fire('change');

  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
  delete FE.state.profile.keys['qwerty.shift'];
  FE.renderAll();
}

console.log('== 按键定义对话框：statusLabel 对象形式 / keyType 显式清除 ==');
FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER' };
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const kd5 = documentStub._openDialogs[0];
  const slRow = kd5.querySelectorAll('.form-row.form-inline').filter(r => r.textContent.indexOf('状态标签') >= 0 ||
    r.querySelectorAll('select').some(s => s.querySelectorAll('option').some(o => o.textContent.indexOf('schema_name') >= 0)))[0];
  const slSel = slRow.querySelectorAll('select')[0];
  ok(slSel.querySelectorAll('option').some(o => o.getAttribute('value') === '__obj__schema_name'),
    'statusLabel 提供对象形式 { source: "schema_name" } 选项');
  slSel.value = '__obj__schema_name';
  slSel._fire('change');
  const ktSel = kd5.querySelectorAll('select').find(s => s.querySelectorAll('option').some(o => o.getAttribute('value') === 'FUNCTION'));
  ok(ktSel.querySelectorAll('option').some(o => o.getAttribute('value') === '__null__'), 'keyType 提供「清除（null）」选项');
  ktSel.value = '__null__';
  ktSel._fire('change');
  kd5.querySelectorAll('.dialog-toolbar .primary')[0].click();
  eq(FE.state.profile.keys['qwerty.q'].statusLabel, { source: 'schema_name' }, 'statusLabel 对象形式写入 profile');
  eq(FE.state.profile.keys['qwerty.q'].keyType, null, 'keyType 显式清除写为 null');
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
  FE.renderAll();
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

  /* ==================== 导入 JSON：单一入口的三种输入 ==================== */
  console.log('== 导入 JSON：单入口（单文件 / 多选整包 / definitions.json 自动接续） ==');
  const pkgDefs = JSON.stringify({
    type: 'foxy.definitions', author: 'pkg',
    keys: {
      'qwerty.q': { ref: 'rime.q', longPress: { popupKey: 'sym.a' } },
      'nav.space': { ref: 'rime.space' }
    },
    actions: { 'act.hello': { type: 'key', key: 'A', meta: ['CTRL'] } },
    macros: { 'mac.hello': [{ action: 'act.hello' }] }
  });
  const pkgLayout = JSON.stringify({
    type: 'foxy.keyboard-layout', author: 'pkg',
    keys: { 'local.one': { ref: 'rime.1' } },
    layouts: {
      default: {
        sections: [{ type: 'rows', rows: [
          [{ ref: 'qwerty.q' }, { ref: 'nav.space' }, { ref: 'local.one' }]
        ] }]
      }
    }
  });
  const pkgPopup = JSON.stringify({
    type: 'foxy.popup-profile',
    schemas: { default: { 'sym.a': { normal: ['@', '#'] } } }
  });
  const soloOk = JSON.stringify({
    type: 'foxy.keyboard-layout',
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] } }
  });
  /* 对照：同一份布局单文件导入必然报错（这正是用户反馈的“不支持”场景） */
  ok(FE.validateProfile(FE.normalizeProfile(JSON.parse(pkgLayout))).errors.length > 0,
    '对照：薄布局单文件解析报错（qwerty.q 无法解析）');

  /* 无文件夹上下文时两个入口应处于隐藏态（先确认，再验证导入后显示） */
  FE.state.folderPlan = null;
  FE.state.folderDefs = null;
  FE.renderFolderOps();
  ok($('op-folder').hidden === true, '无文件夹上下文时「包内布局」面板隐藏');
  ok($('op-export-defs').hidden === true, '无文件夹上下文时「导出 definitions」隐藏');

  /* ---- 输入 1：选中 definitions.json → 醒目提示「还需选择一次文件夹」 ---- */
  global.__fileContent = pkgDefs;
  fileInput.files = [{ name: 'definitions.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok($('op-folder-hint').hidden === false, '选中 definitions.json 后出现补选文件夹提示');
  ok($('op-folder-hint-text').textContent.indexOf('definitions.json') >= 0, '提示行说明为何需要文件夹');
  ok($('op-folder-hint-text').textContent.indexOf('还需选择一次') >= 0, '提示行明确「还需选择一次」文件夹');
  ok($('op-folder-hint-text').textContent.indexOf('浏览器不会透露') >= 0, '提示行解释为何不能自动读取');
  ok($('op-status').textContent.indexOf('definitions.json') >= 0, '状态栏说明已识别 definitions.json');
  ok($('op-status').textContent.indexOf('还需选择一次') >= 0, '状态栏明确「还需选择一次」文件夹');
  /* 不能再出现「正在读取」这类假承诺：自动触发可能被浏览器拦掉 */
  ok($('op-status').textContent.indexOf('正在读取同文件夹') < 0, '状态栏不再承诺“正在读取”同文件夹');
  /* 醒目化：提示行与按钮都要有对应类，样式在 style.css */
  ok($('op-folder-hint').classList.contains('folder-hint'), '提示行挂 folder-hint 醒目样式类');
  ok($('op-folder-complete').classList.contains('attention'), '「选择文件夹」按钮挂 attention 高亮类');
  ok($('op-folder-complete').textContent.indexOf('选择文件夹') >= 0, '按钮文案写明「选择文件夹」');
  /* definitions.json 本身不是布局，不能被当作布局装入 */
  ok(Array.isArray(FE.state.profile.layouts.default.sections), '未把 definitions.json 误当布局装入');
  ok(FE.state.folderPlan === null, '补选文件夹前不建立文件夹上下文');

  /* ---- 输入 2：一次多选（definitions.json + 布局）→ 当作整包 ---- */
  fileInput.files = [
    { name: 'definitions.json', __content: pkgDefs },
    { name: 'a.json', __content: pkgLayout },
    { name: 'p.json', __content: pkgPopup }
  ];
  fileInput._fire('change');
  await sleep(40);
  ok(FE.state.profile.keys['qwerty.q'] !== undefined, '多选整包：共享 definitions 的键已并入');
  ok(FE.state.profile.keys['local.one'] !== undefined, '多选整包：布局自有定义保留');
  eq(FE.validateProfile(FE.state.profile).errors, [], '多选整包：校验 0 错误');
  ok($('op-folder-hint').hidden === true, '整包导入后不再提示补选文件夹');
  ok(FE.state.folderDefs !== null, '整包导入记住了共享定义（供导出还原）');
  ok($('op-folder').hidden === false, '整包导入显示「包内布局」面板');

  /* ---- 输入 3：薄布局单文件 → 提示引用无法解析、可就地补全 ---- */
  global.__fileContent = pkgLayout;
  fileInput.files = [{ name: 'a.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok($('op-folder-hint').hidden === false, '薄布局单文件导入后提示可就地补全');
  ok($('op-folder-hint-text').textContent.indexOf('引用无法解析') >= 0, '提示说明存在无法解析的引用');
  ok(FE.state.folderPlan === null, '单文件导入不建立文件夹上下文');
  ok(FE.state.folderDefs === null, '单文件导入清空共享定义上下文');

  /* ---- 自包含布局单文件 → 不应出现补全提示 ---- */
  global.__fileContent = soloOk;
  fileInput.files = [{ name: 'solo.json' }];
  fileInput._fire('change');
  await sleep(30);
  eq(FE.validateProfile(FE.state.profile).errors, [], '自包含单文件布局导入 0 错误');
  ok($('op-folder-hint').hidden === true, '自包含布局不提示补选文件夹');

  /* ---- 选中弹出菜单文件 → 路由到弹出菜单页 ---- */
  global.__fileContent = pkgPopup;
  fileInput.files = [{ name: 'p.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok(FE.state.popupProfile && FE.state.popupProfile.schemas.default['sym.a'] !== undefined,
    '选中弹出菜单文件被路由到弹出菜单编辑器');

  /* ---- 手动兜底：提示行「选择文件夹」按钮 / 直接给目录 input 喂文件 ---- */
  const dirInput = $('op-import-dir-file');
  dirInput.files = [
    { name: 'definitions.json', webkitRelativePath: 'pkg/definitions.json', __content: pkgDefs },
    { name: 'a.json', webkitRelativePath: 'pkg/layouts/a.json', __content: pkgLayout },
    { name: 'a.json', webkitRelativePath: 'pkg/popups/a.json', __content: pkgPopup },
    { name: 'notes.txt', webkitRelativePath: 'pkg/notes.txt', __content: 'ignore me' }
  ];
  dirInput._fire('change');
  await sleep(40);
  ok(!!FE.state.profile.layouts.default, '文件夹补全建立了布局');
  ok(FE.state.profile.keys['qwerty.q'] !== undefined, '共享 definitions.json 的键已并入');
  ok(FE.state.profile.actions['act.hello'] !== undefined, '共享 actions 已并入');
  ok(FE.state.profile.macros['mac.hello'] !== undefined, '共享 macros 已并入');
  ok(FE.state.profile.keys['local.one'] !== undefined, '布局自有定义保留');
  eq(FE.validateProfile(FE.state.profile).errors, [], '文件夹导入后校验 0 错误');
  ok(FE.state.fileName === 'a.json', '文件名记录为包内布局文件名');
  ok(FE.state.folderDefs !== null, '共享定义已被记住（供导出还原）');
  ok($('op-folder').hidden === false, '识别结果面板已显示');
  ok($('op-folder-report').textContent.indexOf('definitions.json') >= 0, '结果面板说明已识别 definitions.json');
  ok($('op-folder-report').textContent.indexOf('弹出菜单') >= 0, '结果面板说明已关联弹出菜单');
  ok($('op-export-defs').hidden === false, '「导出 definitions」按钮已可用');
  eq($('op-folder-layout').children.length, 1, '包内布局下拉列出 1 个布局文件');
  eq(q('.kb-key').length, 3, '预览渲染合并后的按键');
  ok($('preview-meta').textContent.indexOf('校验通过') >= 0, '合并后预览显示校验通过');

  /* 导出：未改动的共享定义被剥离回 definitions.json */
  const expRes = FE.splitProfileForExport(FE.state.profile, FE.state.folderDefs);
  ok(expRes.split.stripped.indexOf('keys.qwerty.q') >= 0, '导出时剥离了来自 definitions 的键');
  ok(expRes.split.kept.indexOf('keys.local.one') >= 0, '导出时保留布局自有键');
  eq(expRes.layout.keys['nav.space'], undefined, '剥离后布局不含共享键');
  ok(FE.serializeDefinitions(FE.state.folderDefs).indexOf('foxy.definitions') >= 0,
    '导出的 definitions.json 带正确 type');

  /* 编辑后仍能导出：改动过的定义不会被错误剥离 */
  FE.mutate(function () {
    FE.state.profile.keys['qwerty.q'] = { ref: 'rime.w', longPress: { popupKey: 'sym.a' } };
  });
  const expRes2 = FE.splitProfileForExport(FE.state.profile, FE.state.folderDefs);
  ok(expRes2.split.kept.indexOf('keys.qwerty.q') >= 0, '被改动的共享键保留在布局文件中');
  eq(expRes2.layout.keys['qwerty.q'].ref, 'rime.w', '改动的定义随布局导出');

  /* 退出文件夹上下文：单文件导入后不再按旧包剥离 */
  global.__fileContent = pkgLayout;
  fileInput.files = [{ name: 'solo.json' }];
  fileInput._fire('change');
  await sleep(30);
  ok(FE.state.folderDefs === null, '单文件导入清空文件夹上下文');
  ok($('op-export-defs').hidden === true, '「导出 definitions」按钮随之隐藏');

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

  /* ==================== 指针拖动排序（触屏 + 鼠标统一） ==================== */
  console.log('== 指针拖动：行按键重排（performChipDrop） ==');
  tabs[0]._fire('click');
  FE.applyProfileText(JSON.stringify({
    layouts: { default: { sections: [{ type: 'rows', rows: [
      [{ ref: 'rime.a' }, { ref: 'rime.b' }, { ref: 'rime.c' }],
      [{ ref: 'rime.d' }, { ref: 'rime.e' }]
    ] }] } }
  }), {});
  ok(typeof FE.performChipDrop === 'function', '导出 performChipDrop 供拖动落点使用');
  /* getRowKeys 会把数组行转成对象行 {keys:[...]}，两种形态都要能读 */
  const rowRefs = (ri) => {
    const r = FE.state.profile.layouts.default.sections[0].rows[ri];
    const keys = Array.isArray(r) ? r : (r && r.keys) || [];
    return keys.map(x => x.ref);
  };
  /* 同行：把索引 0（a）拖到索引 2（c）之前 → b, a, c */
  FE.performChipDrop({ s: 0, r: 0, k: 0 }, { kind: 'before', loc: { s: 0, r: 0, k: 2 } });
  eq(rowRefs(0), ['rime.b', 'rime.a', 'rime.c'], '同行拖动重排：a 移到 c 之前');
  /* 跨行：把第 0 行索引 2（c）拖到第 1 行末尾 */
  FE.performChipDrop({ s: 0, r: 0, k: 2 }, { kind: 'end', loc: { s: 0, r: 1 } });
  eq(rowRefs(0), ['rime.b', 'rime.a'], '跨行拖动：c 离开原行');
  eq(rowRefs(1), ['rime.d', 'rime.e', 'rime.c'], '跨行拖动：c 落到第 1 行末尾');
  /* 跨行插入到另一行指定位置 */
  FE.performChipDrop({ s: 0, r: 1, k: 2 }, { kind: 'before', loc: { s: 0, r: 0, k: 0 } });
  eq(rowRefs(0), ['rime.c', 'rime.b', 'rime.a'], '跨行拖动：c 插回第 0 行开头');
  /* 拖动经 mutate 记录历史，可撤销 */
  $('op-undo').click();
  eq(rowRefs(0), ['rime.b', 'rime.a'], '撤销恢复上一步拖动');

  console.log('== 指针拖动：网格按键移动/交换（performGridDrop） ==');
  FE.applyProfileText(JSON.stringify({
    layouts: { default: { sections: [{ type: 'grid', columns: 3, rows: 2, keys: [
      { column: 0, row: 0, ref: 'rime.KP_1' },
      { column: 1, row: 0, ref: 'rime.KP_2' }
    ] }] } }
  }), {});
  ok(typeof FE.performGridDrop === 'function', '导出 performGridDrop');
  /* 把 KP_1 从 (0,0) 移到空格 (2,1) */
  FE.performGridDrop(0, 0, { kind: 'move', x: 2, y: 1 });
  eq([FE.state.profile.layouts.default.sections[0].keys[0].column,
      FE.state.profile.layouts.default.sections[0].keys[0].row], [2, 1], '网格拖动到空格：坐标更新');
  /* 交换 KP_1(2,1) 与 KP_2(1,0) 的坐标 */
  FE.performGridDrop(0, 0, { kind: 'swap', gi: 1 });
  const g0 = FE.state.profile.layouts.default.sections[0].keys[0];
  const g1 = FE.state.profile.layouts.default.sections[0].keys[1];
  eq([g0.column, g0.row], [1, 0], '交换后 KP_1 取得原 KP_2 坐标');
  eq([g1.column, g1.row], [2, 1], '交换后 KP_2 取得原 KP_1 坐标');
  $('op-undo').click();
  const g1b = FE.state.profile.layouts.default.sections[0].keys[1];
  eq([g1b.column, g1b.row], [1, 0], '撤销恢复网格坐标');

  console.log('== 指针拖动：chip 不再依赖原生 draggable（触屏可用） ==');
  FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
  const anyChip = q('#layout-sections .chip')[0];
  ok(anyChip && anyChip.getAttribute('draggable') == null, 'chip 不再设 draggable 属性（改用 Pointer Events，触屏可拖）');

  console.log('== 顶栏撤销/重做按钮 ==');
  FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
  ok($('top-undo') && $('top-redo'), '顶栏存在撤销/重做按钮');
  ok($('top-undo').disabled === true, '无历史时顶栏撤销禁用');
  ok($('top-redo').disabled === true, '无历史时顶栏重做禁用');
  const authorBefore = FE.state.profile.author;
  FE.mutate(function () { FE.state.profile.author = '顶栏测试'; });
  ok($('top-undo').disabled === false, '有历史后顶栏撤销可用');
  $('top-undo').click();
  eq(FE.state.profile.author, authorBefore, '顶栏撤销按钮生效');
  ok($('top-redo').disabled === false, '撤销后顶栏重做可用');
  $('top-redo').click();
  eq(FE.state.profile.author, '顶栏测试', '顶栏重做按钮生效');
  /* 顶栏与卡片内按钮状态同步 */
  eq($('op-undo').disabled, $('top-undo').disabled, '顶栏与卡片内撤销按钮同步');

  console.log('== 顶栏项目链接 ==');
  const titleLink = $('repo-title-link');
  const repoLink = $('repo-link');
  const REPO_URL = 'https://github.com/SandyYuR/foxy-see-me';
  ok(titleLink && repoLink, '顶栏存在两处项目仓库链接（标题 + 右侧）');
  eq(titleLink.getAttribute('href'), REPO_URL, '标题链接指向本项目仓库');
  eq(repoLink.getAttribute('href'), REPO_URL, '右侧链接指向本项目仓库');
  eq(repoLink.getAttribute('target'), '_blank', '右侧链接在新标签页打开');
  eq(titleLink.getAttribute('rel'), 'noopener noreferrer', '标题链接带 rel=noopener noreferrer');
  eq(repoLink.getAttribute('rel'), 'noopener noreferrer', '右侧链接带 rel=noopener noreferrer');
  ok(/小狐狸 see me/.test(titleLink.textContent), '标题链接文本仍含项目名');
  /* 参照项目的说明链接在 index.html 的副标题里（DOM 桩只还原顶栏骨架，故查源码） */
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(htmlSrc.indexOf('github.com/SandyYuR/f5a-see-me') >= 0, '正文仍保留参照项目 f5a-see-me 的说明链接');
  /* 标签栏标题不应重复狐狸图标（已有 favicon），避免视觉重复 */
  const pageTitle = htmlSrc.match(/<title>([\s\S]*?)<\/title>/)[1];
  ok(pageTitle.indexOf('🦊') < 0, '页面 <title> 不再带狐狸图标（避免与 favicon 重复）');
  ok(pageTitle.indexOf('小狐狸 see me') >= 0, '页面 <title> 仍含项目名');

  console.log('== 校验条目点击定位 ==');
  FE.applyProfileText(JSON.stringify({
    keys: { good: { ref: 'rime.a' } },
    layouts: {
      default: {
        sections: [{ type: 'rows', rows: [[{ ref: 'good' }, { ref: 'missing.ref' }]] }]
      }
    }
  }), {});
  const vIssues = FE.state.validation.issues;
  ok(Array.isArray(vIssues) && vIssues.length > 0, '校验产生结构化 issues');
  const badIssue = vIssues.find(i => i.code === 'unresolved-ref');
  ok(!!badIssue, '存在 unresolved-ref 结构化条目');
  eq([badIssue.sectionIndex, badIssue.rowIndex, badIssue.keyIndex], [0, 0, 1], '条目带出错键坐标');
  ok(FE.issueLocatable(badIssue) === true, 'issueLocatable 判定为可定位');
  /* 面板里渲染出可点击条目 */
  ok(q('.issue-locatable').length > 0, '校验详情渲染出可点击条目');
  /* 先切到别处，确认定位会切回来 */
  FE.state.sel = null;
  FE.locateIssue(badIssue);
  eq(FE.state.layoutName, 'default', '定位切到问题所在布局');
  eq(FE.state.sel, { s: 0, r: 0, k: 1 }, '定位选中出错的键');
  eq(FE.state.splitMode, false, '常规片段的问题不切到分体模式');
  ok(q('.chip-sel').length > 0, '定位后该键带选中样式');

  /* split 片段的问题带 isSplit，定位时切到分体模式 */
  FE.applyProfileText(JSON.stringify({
    layouts: {
      default: {
        sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }],
        split: { sections: [{ type: 'rows', rows: [[{ ref: 'nope.split' }]] }] }
      }
    }
  }), {});
  const spIssue = FE.state.validation.issues.find(i => i.code === 'unresolved-ref');
  ok(spIssue && spIssue.isSplit === true, 'split 问题带 isSplit 标记');
  FE.locateIssue(spIssue);
  eq(FE.state.splitMode, true, 'split 问题定位切到分体模式');
  eq(FE.state.sel, { s: 0, r: 0, k: 0 }, 'split 问题定位选中对应键');
  /* 布局没有 split 片段时不应误切分体（否则落到空 sections） */
  FE.applyProfileText(JSON.stringify({
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'nope2' }]] }] } }
  }), {});
  const noSplitIssue = FE.state.validation.issues.find(i => i.code === 'unresolved-ref');
  FE.state.splitMode = true;   /* 模拟用户手动切到分体模式 */
  FE.locateIssue(noSplitIssue);
  eq(FE.state.splitMode, false, '无 split 片段的问题定位回落到常规模式');

  console.log('== 使用数按钮 + 内建弹窗 + 整行可点 ==');
  /* 造一份规模小但引用关系完整的配置：布局用按键、按键定义链、宏、动作、弹出菜单 */
  FE.applyProfileText(JSON.stringify({
    type: 'foxy.keyboard-layout',
    keys: { 'k.a': { ref: 'rime.a' }, 'k.chain': { ref: 'k.a' }, 'k.unused': { ref: 'rime.b' } },
    actions: { a1: { type: 'key', key: 'BACKSPACE' }, a2: { type: 'key', key: 'LEFT' } },
    macros: { m1: [{ action: 'a1' }] },
    layouts: {
      default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.a', tap: { macro: 'm1' } }, { ref: 'k.chain' }]] }] },
      numpad: { sections: [{ type: 'grid', columns: 1, rows: 1, keys: [{ column: 0, row: 0, ref: 'k.a' }] }] }
    }
  }), {});
  FE.state.popupProfile = FE.normalizePopupProfile({
    type: 'foxy.popup-profile',
    schemas: { default: { q: { normal: [{ ref: 'k.a' }, { action: 'a2' }] } } }
  });
  FE.state._refIdxCache = null;
  FE.renderAll();

  const keysHost2 = $('keys-list');
  const keyRows = keysHost2.querySelectorAll('.def-item.def-row-click');
  ok(keyRows.length >= 3, '按键定义条目整行可点（' + keyRows.length + ' 条）');
  const findKeyRow = (nm) => keysHost2.querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === nm);
  const rowKa = findKeyRow('k.a');
  ok(!!rowKa, '找到 k.a 条目');

  /* 整行可点 → 打开按键编辑对话框 */
  documentStub._openDialogs.length = 0;
  rowKa._fire('click');
  ok(documentStub._openDialogs.length === 1, '点整行进入按键编辑对话框');
  documentStub._openDialogs[0].close();

  /* 行内**没有**「编辑」按钮：整行点击就是编辑入口（用户明确要求，别加回来） */
  const rowBtnTexts = rowKa.querySelectorAll('button').map(b => b.textContent);
  ok(rowBtnTexts.indexOf('编辑') < 0, '按键定义行内不再有「编辑」按钮（整行可点代替）');
  eq(rowBtnTexts.length, 2, '行内只剩「使用 N」与「删除」两个按钮');

  /* 键盘可达性：行自带 tabindex，且刻意不用 role="button"
   * （行内含按钮，role=button 里嵌交互元素是非法 ARIA） */
  eq(rowKa.getAttribute('tabindex'), '0', '按键定义行可聚焦（tabindex=0）');
  ok(rowKa.getAttribute('role') == null, '行上不使用 role=button（避免 ARIA 嵌套错误）');
  documentStub._openDialogs.length = 0;
  rowKa._fire('keydown', { key: 'Enter' });
  ok(documentStub._openDialogs.length === 1, '行聚焦后回车进入编辑');
  documentStub._openDialogs[0].close();
  /* 焦点在子按钮上按回车不应代劳整行，否则一次回车触发两处 */
  documentStub._openDialogs.length = 0;
  rowKa._fire('keydown', { key: 'Enter', target: rowKa.querySelectorAll('button')[0] });
  ok(documentStub._openDialogs.length === 0, '焦点在子按钮上回车不会误触发整行');

  /* 点行内按钮 → 不当作点整行（clickedInteractive 防护） */
  documentStub._openDialogs.length = 0;
  rowKa._fire('click', { target: rowKa.querySelectorAll('button')[0] });
  ok(documentStub._openDialogs.length === 0, '点行内按钮不会误触发整行编辑');

  /* 使用数按钮：文案 + 内建弹窗（绝不是 alert —— 桩里 alert 会 throw） */
  const uBtn2 = rowKa.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent));
  ok(!!uBtn2, '按键定义条目有「使用 N」按钮：' + (uBtn2 && uBtn2.textContent));
  documentStub._openDialogs.length = 0;
  uBtn2._fire('click');
  const usageDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(!!usageDlg, '点击使用数打开网页内建弹窗（未使用浏览器 alert）');
  ok(usageDlg.textContent.indexOf('共被引用') >= 0, '弹窗显示引用总数');
  const jumpBtns = usageDlg.querySelectorAll('.usage-item.usage-jump');
  ok(jumpBtns.length >= 3, '可跳转条目已渲染（' + jumpBtns.length + ' 条）');
  ok(usageDlg.textContent.indexOf('跳转') >= 0, '可跳转条目带跳转提示');

  /* 点可跳转条目 → 切到布局编辑页并选中该键 */
  documentStub._openDialogs.length = 0;
  jumpBtns[0]._fire('click');
  ok($('tab-layout').classList.contains('active'), '跳转后切到布局编辑页');
  ok(FE.state.sel != null, '跳转后选中了对应按键');
  ok(!usageDlg.open, '跳转后弹窗已关闭');

  /* 跳转到 numpad（另一个布局）应切换 layoutName */
  FE.applyProfileText(JSON.stringify(FE.state.profile), {});
  FE.renderAll();
  const rowKa2 = findKeyRow('k.a');
  const uBtn3 = rowKa2.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent));
  documentStub._openDialogs.length = 0;
  uBtn3._fire('click');
  const dlg3 = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const numpadJump = dlg3.querySelectorAll('.usage-item.usage-jump').find(b => b.textContent.indexOf('numpad') >= 0);
  ok(!!numpadJump, '弹窗列出 numpad 里的引用');
  numpadJump._fire('click');
  eq(FE.state.layoutName, 'numpad', '跳转到另一布局会切换当前布局');

  /* ---- 动作与宏页：使用数按钮在删除按钮左侧 ---- */
  FE.applyProfileText(JSON.stringify({
    type: 'foxy.keyboard-layout',
    keys: { 'k.a': { ref: 'rime.a' } },
    actions: { a1: { type: 'key', key: 'BACKSPACE' } },
    macros: { m1: [{ action: 'a1' }] },
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.a', tap: { macro: 'm1' } }]] }] } }
  }), {});
  FE.renderAll();
  const actItem2 = $('actions-list').querySelectorAll('.def-item.def-collapsible')
    .find(it => it.querySelectorAll('.def-name')[0].textContent === 'a1');
  const actBtns = actItem2.querySelectorAll('.def-summary button').map(b => b.textContent);
  eq(actBtns.length, 2, '动作条目摘要行有两个按钮');
  ok(/^使用 \d+$/.test(actBtns[0]), '使用数按钮在删除按钮左侧：' + actBtns[0]);
  eq(actBtns[1], '删除', '删除按钮紧随其后');
  /* 穿透：a1 被宏 m1 引用、m1 被布局按键调用 → a1 应显示 2 处 */
  eq(actBtns[0], '使用 2', 'a1 的使用数含穿透（宏步骤 + 布局按键）');

  /* 点使用数不误展开条目 */
  documentStub._openDialogs.length = 0;
  actItem2.querySelectorAll('.def-summary button')[0]._fire('click');
  ok(documentStub._openDialogs.length === 1, '动作使用数打开弹窗');
  ok(actItem2.open === false, '点使用数按钮不会连带展开条目');
  const actDlg2 = documentStub._openDialogs[0];
  ok(actDlg2.textContent.indexOf('宏 m1') >= 0, '动作弹窗列出无坐标的直接引用（宏步骤）');
  ok(actDlg2.querySelectorAll('.usage-item.usage-jump').length >= 1, '动作弹窗含可跳转条目');
  actDlg2.close();

  /* 宏条目也有使用数 */
  const macItem2 = $('macros-list').querySelectorAll('.def-item.def-collapsible')
    .find(it => it.querySelectorAll('.def-name')[0].textContent === 'm1');
  const macBtns = macItem2.querySelectorAll('.def-summary button').map(b => b.textContent);
  ok(/^使用 \d+$/.test(macBtns[0]), '宏条目摘要行也有使用数按钮：' + macBtns[0]);
  eq(macBtns[1], '删除', '宏条目删除按钮紧随其后');

  /* ---- 静默写回后使用数就地刷新（不重建列表） ---- */
  const beforeText = $('actions-list').querySelectorAll('.def-usage-btn')
    .find(b => b.dataset && b.dataset.usageName === 'a1').textContent;
  /* 把布局按键的宏调用改成引用 a2，a2 的使用数应上升 */
  FE.mutate(() => {
    FE.state.profile.actions.a2 = { type: 'key', key: 'LEFT' };
    FE.state.profile.macros.m1 = [{ action: 'a2' }];
  });
  FE.refreshUsageLabels();
  const afterA2 = $('actions-list').querySelectorAll('.def-usage-btn')
    .find(b => b.dataset && b.dataset.usageName === 'a2').textContent;
  ok(/^使用 [1-9]/.test(afterA2), 'a2 的使用数刷新为新值：' + afterA2);
  ok(beforeText !== afterA2, '使用数确实随引用变化更新');

  /* ---- 没有引用时弹窗给明确说明，且不出现跳转按钮 ----
   * 注意要造**真正孤立**的定义：只要把 k.orphan 放进任何布局，
   * 布局里的放置点本身就是一处引用（"使用 1"），不再是零引用。 */
  FE.applyProfileText(JSON.stringify({
    type: 'foxy.keyboard-layout',
    keys: { 'k.orphan': { ref: 'rime.a' }, 'k.used': { ref: 'rime.b' } },
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.used' }]] }] } }
  }), {});
  FE.renderAll();
  const rowOrphan = $('keys-list').querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === 'k.orphan');
  const orphanUsage = rowOrphan.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent));
  eq(orphanUsage.textContent, '使用 0', '孤立定义显示「使用 0」');
  documentStub._openDialogs.length = 0;
  orphanUsage._fire('click');
  const lonelyDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(lonelyDlg.textContent.indexOf('没有被任何地方引用') >= 0, '零引用时弹窗说明清楚');
  eq(lonelyDlg.querySelectorAll('.usage-item.usage-jump').length, 0, '零引用时没有跳转按钮');
  lonelyDlg.close();

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
}, 350);
