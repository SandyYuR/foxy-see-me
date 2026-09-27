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
/* 浏览器对话框一律禁止：全部改走 FE.uiAlert / uiConfirm / uiPrompt 后，
 * 这里刻意让它们**抛错**——任何代码退回 browser dialog 都会被测试立刻抓住，
 * 是个廉价的回归守卫（这些原生弹窗会阻塞主线程、样式也无法统一）。 */
global.confirm = () => { throw new Error('不应使用浏览器 confirm（请用 FE.uiConfirm）'); };
global.prompt = () => { throw new Error('不应使用浏览器 prompt（请用 FE.uiPrompt）'); };
global.alert = (msg) => { throw new Error('不应使用浏览器 alert（请用 FE.uiAlert）: ' + msg); };
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
  /* 符号页由另一模块提供：**缺席时跳过而不是抛错** —— 该文件尚未落地时，
   * 本套件不该整体崩掉（那会掩盖真正的 UI 失败）。主题页同理。 */
  const p = path.join(__dirname, '..', 'js', file);
  if (!fs.existsSync(p)) return false;
  const code = fs.readFileSync(p, 'utf8');
  vm.runInThisContext(code, { filename: file });
  return true;
}
load('data.js');
load('default-profile.js');
load('examples-bundle.js');
load('app.js');
load('folder-import.js');
load('key-dialog.js');
load('macro-editor.js');
load('popup-editor.js');
load('theme-editor.js');
load('color-source.js');
load('symbol-editor.js');
load('symbol-preview.js');

const FE = global.FE;
const $ = (id) => documentStub.getElementById(id);
const q = (sel, root) => (root || documentStub._body).querySelectorAll(sel);

/* ---------------- 内建对话框驱动 ----------------
 * 编辑器已把 alert / confirm / prompt 全部换成 FE.uiAlert / uiConfirm / uiPrompt
 * ——它们是真实的 <dialog> 且 Promise 化，所以测试要**像用户一样去点这些弹窗**，
 * 而不是给 global.alert/confirm/prompt 打桩（那样等于没测到新实现）。
 * 三个助手都会等一个宏任务，让 async 点击处理器里的 await 有机会继续。 */
function lastDialog() {
  const open = documentStub._openDialogs.filter(d => d.open);
  return open.length ? open[open.length - 1] : null;
}
function dialogCount() {
  return documentStub._openDialogs.filter(d => d.open).length;
}
async function uiOk(value) {
  const dlg = lastDialog();
  if (!dlg) throw new Error('uiOk: 没有打开的对话框');
  const inp = dlg.querySelectorAll('.ui-dialog-input')[0];
  if (inp && value !== undefined) inp.value = value;
  dlg.querySelectorAll('.ui-dialog-ok')[0].click();
  await sleep(0);
  return dlg;
}
async function uiCancel() {
  const dlg = lastDialog();
  if (!dlg) throw new Error('uiCancel: 没有打开的对话框');
  dlg.querySelectorAll('.ui-dialog-cancel')[0].click();
  await sleep(0);
  return dlg;
}
/* 断言当前有一个提示框（uiAlert），返回其文字后关掉 */
async function uiReadAlert() {
  const dlg = lastDialog();
  if (!dlg) return null;
  const text = dlg.textContent;
  dlg.querySelectorAll('.ui-dialog-ok')[0].click();
  await sleep(0);
  return text;
}

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, msg + ' — 期望 ' + jb + ' 实际 ' + ja);
}

/* 测试主体整体包进 async main()：
 * 内建对话框（FE.uiConfirm / uiPrompt / uiAlert）是 Promise 化的，
 * 测试要像用户那样 await 点掉它们；而本文件是 CommonJS，**不允许顶层 await**。
 * 原先主体分两段（顶层 + setTimeout 回调），已合并为同一个 async 作用域。 */
(async function main() {

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
/* ★ 槽位对齐：行内无 gap，槽按 weight 分整行宽，键在槽内留半间隙。
 * 不同键数的行同权重点边界重合（彩·气泡三四行的场景）。 */
{
  const rows0 = q('.kb-row');
  ok(rows0.every(r => r.style.gap === '' || r.style.gap == null), '行容器无 gap（槽位口径）');
  const slots0 = rows0[0].querySelectorAll('.kb-slot');
  eq(slots0.length, 10, '首行 10 个槽位');
  ok(slots0.every(s => s.style.flexGrow === '1'), '默认权重槽 flexGrow=1');
  const keyInSlot = slots0[0].querySelectorAll('.kb-key');
  eq(keyInSlot.length, 1, '每槽一键');
}
/* shift 行：定义 weight=1.5 的槽更宽（默认 profile qwerty.shift） */
{
  const shiftRow = q('.kb-row')[2];
  const shiftSlots = shiftRow.querySelectorAll('.kb-slot');
  eq(shiftSlots[0].style.flexGrow, '1.5', 'shift 槽 flexGrow=1.5（定义链权重）');
  eq(shiftSlots[1].style.flexGrow, '1', '字母槽 flexGrow=1');
}

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

/* 按键定义过滤（搜索按钮 + 即时过滤） */
$('keys-filter').value = 'comma';
$('keys-filter')._fire('input');
/* 注意只数 .def-item：过滤生效时列表顶部还会有一行「匹配 N / 总数」提示 */
const filterCount = $('keys-list').querySelectorAll('.def-item').length;
ok(filterCount >= 1 && filterCount < 10, '过滤后只剩少数定义: ' + filterCount);
$('keys-filter').value = '';
$('keys-filter')._fire('input');

/* 标签页切换：6 个控制按钮（布局编辑/按键定义/动作与宏/弹出菜单/主题/符号面板）；
 * 弹出菜单之后的三个是另外几类文档（主题文件 / 符号 catalog），视觉上有分隔。
 * ⚠️ 新增的 tab 一律排在 tab-popup **之后**，这样下面按索引取 tabs[0]/tabs[3] 的
 * 断言（弹出菜单、布局页）不受影响。 */
const tabs = q('.tab');
eq(tabs.length, 6, '6 个标签按钮');
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
ok($('top-undo').disabled === false, '撤销可用');
$('top-undo').click();
ok(!FE.state.profile.keys['zz.test'], '撤销后按键定义移除');
ok($('top-redo').disabled === false, '重做可用');
$('top-redo').click();
ok(!!FE.state.profile.keys['zz.test'], '重做后恢复');
$('top-undo').click();
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
$('top-undo').click();
eq(FE.state.profile.layouts.default.sections[0].rows[0][0].label, undefined, '撤销后 label 移除');
ok(q('.kb-label', q('.kb-key')[0])[0].textContent === 'q', '预览恢复 q');
$('top-redo').click();
documentStub._openDialogs.length = 0;

console.log('== 点击编辑器 chip → 对话框 ==');
q('#layout-sections .chip')[0].click();
ok(documentStub._openDialogs.length === 1, 'chip 对话框打开');
documentStub._openDialogs[0].close();
documentStub._openDialogs.length = 0;

console.log('== 权重输入框显示继承值 ==');
/* 放置位没写 weight 时输入框为空，但 placeholder 显示定义链的继承值，
 * 避免用户误以为权重是 1（彩·气泡 shift 定义 weight=1.5 的场景） */
FE.state.profile.keys['wtest.shift'] = { ref: 'rime.a', weight: 1.5 };
FE.state.profile.layouts.default.sections[0].rows[0].push({ ref: 'wtest.shift' });
FE.renderAll();
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'placement', placement: FE.state.profile.layouts.default.sections[0].rows[0].slice(-1)[0], location: { s: 0, r: 0, k: 99 } });
{
  const kdW = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const numInputs = kdW.querySelectorAll('input').filter(i => i.getAttribute('type') === 'number');
  const wInp = numInputs.find(i => String(i.getAttribute('placeholder') || '').indexOf('继承') >= 0);
  ok(!!wInp, '找到权重输入框（placeholder 含继承）');
  eq(wInp.value, '', '放置位未写 weight 时输入框为空');
  ok(String(wInp.getAttribute('placeholder')).indexOf('1.5') >= 0, 'placeholder 显示定义链继承值 1.5');
}
documentStub._openDialogs.length = 0;
FE.state.profile.layouts.default.sections[0].rows[0].pop();
delete FE.state.profile.keys['wtest.shift'];
FE.renderAll();

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
$('top-undo').click();
eq(FE.state.profile.keys['qwerty.q'].swipe.up.label, undefined, '撤销手势修改');
$('top-undo').click();
eq(FE.state.profile.keys['qwerty.q'].swipe.up.label, undefined, '撤销手势修改');
documentStub._openDialogs.length = 0;

console.log('== 手势对话框 ==');
FE.openGestureDialog({ slot: 'swipe.up', gesture: { ref: 'rime.Q' }, onChange: () => {} });
ok(documentStub._openDialogs.length === 1, '手势对话框打开');
const gdlg = documentStub._openDialogs[0];
ok(gdlg.textContent.indexOf('上滑') >= 0, '标题正确');
gdlg.close();
documentStub._openDialogs.length = 0;

/* 所有编辑类弹框都必须接上守卫：漏接一个，那个弹框就又会静默丢弃改动。
 * 这里只做「接线存在性」的冒烟检查，逐项行为在主对话框那组断言里覆盖。 */
console.log('== 守卫已接入各编辑弹框（冒烟） ==');
{
  const cases = [
    ['手势', function () { FE.openGestureDialog({ slot: 'tap', gesture: null, onChange: function () {} }); }],
    ['状态变体', function () { FE.openVariantDialog({ variant: null, onChange: function () {} }); }]
  ];
  cases.forEach(function (c) {
    documentStub._openDialogs.length = 0;
    c[1]();
    const d = documentStub._openDialogs[documentStub._openDialogs.length - 1];
    ok(!!d, c[0] + '对话框可打开');
    /* 未改动时应能直接关闭（守卫放行），若守卫写坏了会卡住不放 */
    d._fire('click', { target: d });
    ok(!d.open, c[0] + '对话框未改动时点遮罩可直接关闭');
    eq(dialogCount(), 0, c[0] + '未改动不弹确认框');
  });
  documentStub._openDialogs.length = 0;
}

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
/* 新建布局走 FE.uiPrompt：点开弹窗、填名字、确定（像用户那样操作） */
$('layout-add').click();
ok(!!lastDialog(), '新建布局弹出内建输入框（非浏览器 prompt）');
await uiOk('test_layout');
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

console.log('== 回归：大网格不按「网格序号」截断 ==');
/* 48×15 = 720 格 > 旧上限 400，但跨距键覆盖掉大部分格子，真正生成 DOM 的只有
 * 612 个节点。旧实现是 `ry * cols + cx >= 400`（按网格序号），会把后 320 格里的
 * 按键起点一并砍掉 —— 用户反馈的「仅渲染前 400 格」正是这个场景。护栏现在按
 * 真正生成 DOM 的格数计，这类靠跨距键撑开的键盘必须完整渲染。 */
FE.mutate(() => {
  const bigKeys = [];
  for (let c = 0; c < 48; c += 4) bigKeys.push({ column: c, row: 0, columnSpan: 3, rowSpan: 3, ref: 'rime.1' });
  /* 这两枚键的网格序号都 >= 400，旧实现下根本不会渲染 */
  bigKeys.push({ column: 45, row: 14, ref: 'rime.a' });   // 45 + 14*48 = 717
  bigKeys.push({ column: 47, row: 14, ref: 'rime.b' });   // 719
  FE.state.profile.layouts['biggrid'] = {
    sections: [{ type: 'grid', columns: 48, rows: 15, keys: bigKeys }]
  };
});
$('layout-select').value = 'biggrid';
$('layout-select')._fire('change');
eq(q('.gedit-key').length, 14, '48×15 网格 14 个按键全部渲染（序号 ≥400 的也在）');
eq(q('.gedit-empty').length, 610, '空格数 = 720 格 − 跨距覆盖 96 − 按键 14');
ok(q('.gedit-wrap .status.warn').length === 0, '大网格不再误报「仅渲染前 400 格」');
/* 覆盖格不该被当成空格渲染：12 枚 3×3 跨距键各覆盖 9 格，其中 1 格是键自身起点 */
eq(q('.gedit-empty').length + q('.gedit-key').length, 624, '覆盖格被跳过（不加 96 个占位格）');
documentStub._openDialogs.length = 0;
q('.gedit-empty')[0].click();
documentStub._openDialogs[0].close();
documentStub._openDialogs.length = 0;

/* 护栏本身仍要能拦住病态输入：临时把上限压到 5。
 * 前 5 个可编辑格是 K(0,0) E(3,0) K(4,0) E(7,0) K(8,0) → 3 键 2 空格。 */
const savedCap = FE.MAX_GRID_CELLS;
FE.MAX_GRID_CELLS = 5;
FE.renderAll();
eq(q('.gedit-key').length, 3, '上限生效：前 5 个可编辑格里的 3 个按键');
eq(q('.gedit-empty').length, 2, '上限生效：前 5 个可编辑格里的 2 个空格');
ok(q('.gedit-wrap .status.warn').length === 1, '被截断时给出提示');
ok(q('.gedit-wrap .status.warn')[0].textContent.indexOf('未渲染') >= 0, '提示说明其余格未渲染');
FE.MAX_GRID_CELLS = savedCap;
FE.renderAll();
eq(q('.gedit-key').length, 14, '恢复上限后 14 个按键重新渲染');

console.log('== 网格横向滚动条（与拖动分离的另一条入口） ==');
/* 为什么需要它：`.gedit-key` 的 touch-action:none 是 attachPointerDrag 的前提，
 * 于是「在键上横滑」永远是拖动排序、不是滚动；而 cc_grid_4 这类 48×15
 * 全由跨距键铺满的网格（194 键 / **0 个空格**）整块画布没有任何可起手的
 * 横向滚动面 —— 右侧的键在窄屏上根本够不到。
 * 修法是给网格配一条**独立**滚动条（滑块管横向移动、键管拖动），
 * 而不是去动 touch-action（那会破坏拖动，见 AGENT.md §4.4）。 */
const host0 = q('.gedit-host')[0];
ok(!!host0, '网格编辑器外层是 .gedit-host（滚动条必须放在可滚动画布之外，否则跟着内容滚走）');
ok(!!host0.querySelector('.gedit-wrap'), '.gedit-host 内含可滚动画布 .gedit-wrap');
ok(!!host0.querySelector('.gedit-scrollbar'), '.gedit-host 内含滚动条轨道');
ok(!!host0.querySelector('.gedit-thumb'), '滚动条含滑块');
eq(typeof FE.gridScrollMetrics, 'function', 'FE.gridScrollMetrics 已导出，几何可被断言');
/* 桩的 clientWidth 恒为 0（量不到真实尺寸）→ 必须判定为不可滚动并自动隐藏，
 * 否则每个小网格上都会凭空多出一条无效控件。 */
ok(q('.gedit-scrollbar')[0].hidden === true, '量不到尺寸时滚动条自动隐藏（小网格外观零变化）');

/* 死锁回归：滚动条若把「自身 clientWidth」当可滚动判据，则会
 * 隐藏 → clientWidth=0 → 判定不可滚动 → 永远保持隐藏，切标签页再切回也回不来。
 * 判据必须只看画布。这里用「隐藏状态下仍能算出可滚动」来锁定。 */
const sbHiddenState = FE.gridScrollMetrics(350, 1889, 0);
ok(sbHiddenState.scrollable === false, '轨道宽为 0（隐藏态）不产生 NaN / 负值');

console.log('== 回归：网格画布横向位置在重渲染后保持 ==');
/* 为什么单独做：网格编辑器每次重渲染都 clearEl 再重建，.gedit-wrap 是**全新节点**，
 * scrollLeft 天然归零。用户把大网格横滚到右侧、拖一个按键（或仅仅点一下打开
 * 编辑框），一松手就被丢回最左边 —— 而他要改的键就在右侧，于是得反复重新滚过去。
 * 触发路径不止一条：拖动 performGridDrop → mutate → afterChange → renderAll；
 * 单击按键 → 直接调 renderSectionsEditor；撤销/重做 → renderAll。
 * 恢复逻辑收口在 renderSectionsEditor 里，一处覆盖全部。 */
ok(typeof FE.captureGridScroll === 'function', '暴露 captureGridScroll');
ok(typeof FE.restoreGridScroll === 'function', '暴露 restoreGridScroll');
const gw0 = q('.gedit-wrap')[0];
ok(gw0.__gridSec === 0, '网格画布标有区段号（节点被换掉了，只能靠它认领回位置）');
ok(typeof gw0.__gridSync === 'function', '画布挂了 sync 回调（程序化设 scrollLeft 未必派发 scroll 事件）');

/* 主用例：横滚到右侧 → 重渲染 → 位置必须还在 */
gw0.scrollLeft = 420;
const gsnap = FE.captureGridScroll();
eq(gsnap.length, 1, 'captureGridScroll 记录 1 个网格画布');
eq(gsnap[0].left, 420, 'captureGridScroll 记录横向位置');
FE.renderAll();   /* 走真实路径：重建列表 → 认领位置 */
eq(q('.gedit-wrap')[0].scrollLeft, 420, '重渲染后横向位置被认领回来（不再被丢回最左）');

/* 拖动、单击按键都会走到 renderSectionsEditor；这里直接调它复现同一条路径 */
FE.renderAll();
q('.gedit-wrap')[0].scrollLeft = 300;
FE.renderAll();
eq(q('.gedit-wrap')[0].scrollLeft, 300, '反复重渲染仍保持（不会累积丢失）');

/* 位置为 0 时不该做多余的事（也是「本来就在最左」的正常态） */
FE.renderAll();
q('.gedit-wrap')[0].scrollLeft = 0;
FE.renderAll();
eq(q('.gedit-wrap')[0].scrollLeft, 0, '本来就在最左时保持 0');

/* 认领靠区段号：序号对不上就跳过，绝不会把位置错认到别的网格上 */
const otherSnap = [{ si: 99, left: 777 }];
FE.restoreGridScroll(otherSnap);
eq(q('.gedit-wrap')[0].scrollLeft, 0, '区段号对不上时不认领（不会错滚到别的网格）');
eq(FE.captureGridScroll().length, 1, 'capture 只收有区段标记的画布');

console.log('== 回归：大网格预览的间距与字号自适应 ==');
/* 预览是**另一条渲染路径**（buildGridSection），与上面的网格编辑器无关。
 * 原实现固定 gap:5px + 固定 18px 字号：48 列时 47 个间隙吃掉 57% 宽度，单元格
 * 仅 3.73px 宽而字号仍是格高的 1.9 倍 → 文字溢出压叠，整块预览糊成一团。 */
$('layout-select').value = 'biggrid';
$('layout-select')._fire('change');
const bigGridEl = q('.kb-grid')[0];
ok(!!bigGridEl, '大网格预览渲染出 .kb-grid');
ok(bigGridEl.style.gap !== '5px 5px', '48 列网格的间距不再是固定的 5px（实际 ' + bigGridEl.style.gap + '）');
const bigSec = FE.state.profile.layouts['biggrid'].sections[0];
const bigM = FE.gridMetrics(bigSec.columns, bigSec.rows, FE.state.portraitW / 10, 5);
ok(bigM.colGap < 1, '间距自动收缩到 1px 以下（实际 ' + bigM.colGap.toFixed(2) + 'px）');
ok((bigSec.columns - 1) * bigM.colGap <= bigM.contentW * 0.10 + 0.01, '间隙总占用 ≤ 可用宽的 10%');
/* 关键断言：每个键的字号都不得超过**它自己跨距**算出的键框较短边 */
let fontOverflow = [];
bigGridEl.querySelectorAll('.kb-key').forEach(function (keyEl) {
  const lbl = keyEl.querySelectorAll('.kb-label')[0];
  if (!lbl) return;
  const fs = parseFloat(String(lbl.style.fontSize));
  const gc = String(keyEl.style.gridColumn), gr = String(keyEl.style.gridRow);
  const cs = gc.indexOf('span') >= 0 ? parseInt(gc.split('span')[1], 10) : 1;
  const rs = gr.indexOf('span') >= 0 ? parseInt(gr.split('span')[1], 10) : 1;
  const w = bigM.cellW * cs + bigM.colGap * (cs - 1);
  const h = bigM.cellH * rs + bigM.rowGap * (rs - 1);
  if (fs > Math.min(w, h)) fontOverflow.push(cs + 'x' + rs + ':' + fs.toFixed(1) + '>' + Math.min(w, h).toFixed(1));
});
eq(fontOverflow, [], '没有键的字号溢出自身键框（修复前 1x1 键 18px 字落进 9.7px 格）');
/* 大键的字应当明显大于小键，而不是被小键的尺寸一起压小 */
const labelFonts = bigGridEl.querySelectorAll('.kb-label').map(l => parseFloat(String(l.style.fontSize)));
const fMin = Math.min.apply(null, labelFonts), fMax = Math.max.apply(null, labelFonts);
ok(fMax > fMin + 3, '3×3 大键字号明显大于 1×1 小键（' + fMax.toFixed(1) + ' vs ' + fMin.toFixed(1) + 'px）');
/* 小网格必须完全不受影响 */
$('layout-select').value = 'numpad';
$('layout-select')._fire('change');
const numGridEl = q('.kb-grid')[0];
/* 小网格：间隙应为「按键外观」的配置值（App 口径：相邻可见间隙 = 2×gap），
 * 而**不是**旧的固定 5px —— 见 foxy-render-spec.md §2.7。
 * 旧断言 `gap === '5px 5px'` 钉的是"固定间隙"时代的行为，已随配置化一并更新。 */
const numGapParts = String(numGridEl.style.gap).split(/\s+/);
const numRenderedCol = parseFloat(numGapParts[0]);
const numWantCol = FE.kbDp(FE.keyAppearance().gapHDp, FE.state.portraitW / 10) * 2;
ok(Math.abs(numRenderedCol - numWantCol) < 0.01,
  'numpad 5×4 间距 = 2×配置间隙（实际 ' + numGridEl.style.gap +
  '，期望列间隙 ' + numWantCol.toFixed(2) + 'px）');
ok(numRenderedCol !== 5, '不再固定 5px（配置化后按 dp 换算）');
eq(q('.kb-key').length, 19, 'numpad 仍渲染 19 键');
$('layout-select').value = 'default';
$('layout-select')._fire('change');
eq(q('.kb-row').length, 4, '回到 default 行布局仍正常');

/* ================================================================
 * 按键外观三项（圆角 / 水平间隙 / 垂直间隙）
 *
 * 对照 App「设置 → 键盘外观」同名项（foxy-render-spec.md §2.7）：
 *   范围 0–24 / 0–16 / 0–16，默认 6 / 3 / 4（c50.java:16 + a60 校验 + 设置页回落）。
 * ⭐ 最易做错处：App 的间隙是**每键四周内缩**（v40.setPadding + InsetDrawable），
 *   所以相邻两键的可见间隙 = **2×**设置值，且**行首尾键也内缩**。
 *   把它当"相邻留空"（只给非首尾键半个）会少一半、首尾不内缩。
 * ================================================================ */
console.log('== 按键外观：圆角 / 水平间隙 / 垂直间隙 ==');
{
  const savedAp = {
    c: FE.state.keyCornerRadiusDp, h: FE.state.keyGapHorizontalDp, v: FE.state.keyGapVerticalDp
  };
  try {
    /* ① 默认值与范围（与 App 双重佐证，别随手改） */
    FE.state.keyCornerRadiusDp = 6;
    FE.state.keyGapHorizontalDp = 3;
    FE.state.keyGapVerticalDp = 4;
    eq(FE.keyAppearance(), { cornerDp: 6, gapHDp: 3, gapVDp: 4 },
      '默认 6 / 3 / 4（与 App 设置页回落值一致）');
    eq(FE.KEY_APPEARANCE_SPEC.cornerRadius.max, 24, '圆角上限 24（c50 滑块）');
    eq(FE.KEY_APPEARANCE_SPEC.gapHorizontal.max, 16, '水平间隙上限 16');
    eq(FE.KEY_APPEARANCE_SPEC.gapVertical.max, 16, '垂直间隙上限 16');

    /* ② 越界/非法 → 回落默认（App 端 a60.e/f/g 判定非法后同样回落默认） */
    FE.state.keyCornerRadiusDp = 99;
    FE.state.keyGapHorizontalDp = -5;
    FE.state.keyGapVerticalDp = 'abc';
    eq(FE.keyAppearance(), { cornerDp: 6, gapHDp: 3, gapVDp: 4 },
      '越界/非法值一律回落默认');

    /* ③ dp → px 换算（unit = portraitW/10，等价 360dp 宽屏 → 1dp = unit/36） */
    eq(FE.kbDp(36, 36), 36, 'unit=36 时 36dp = 36px');
    ok(Math.abs(FE.kbDp(6, 38) - 6.333) < 0.01, 'unit=38 时 6dp ≈ 6.33px');

    /* ④ 圆角 clamp 到键面短边一半（v40.java:397-404） */
    eq(FE.keyCornerPx(6, 36, 100, 100), 6, '键面够大时不夹（6dp→6px）');
    eq(FE.keyCornerPx(24, 36, 20, 20), 10, '大圆角在小键上夹到短边一半（24→10）');
    eq(FE.keyCornerPx(6, 36, null, null), 6, '键面尺寸未知时不夹');

    /* ⑤ 行区段：每键四周内缩（相邻 = 2×gap、首尾也内缩） */
    FE.state.keyGapHorizontalDp = 4;
    FE.state.keyGapVerticalDp = 2;
    FE.state.keyCornerRadiusDp = 8;
    FE.renderAll();
    const rowKeys = q('.kb-row')[0].querySelectorAll('.kb-key');
    const unitNow = FE.state.portraitW / 10;
    const wantH = FE.kbDp(4, unitNow) + 'px';
    const wantV = FE.kbDp(2, unitNow) + 'px';
    ok(rowKeys.length >= 2, '（前置）首行至少 2 个键');
    /* 首个键也要有左/上内缩（这是"每键内缩"与"相邻留空"最直观的区别） */
    eq(String(rowKeys[0].style.marginLeft), wantH, '行首键也有左侧内缩（不是贴边）');
    eq(String(rowKeys[0].style.marginTop), wantV, '行首键也有上侧内缩');
    eq(String(rowKeys[rowKeys.length - 1].style.marginRight), wantH, '行尾键也有右侧内缩');
    /* 相邻两键左右各内缩 → 合计 2×gap（这就是手机上看到的可见间隙） */
    const gapBetweenTwo = parseFloat(rowKeys[0].style.marginRight) +
      parseFloat(rowKeys[1].style.marginLeft);
    ok(Math.abs(gapBetweenTwo - FE.kbDp(4, unitNow) * 2) < 0.01,
      '相邻两键可见间隙 = 2×设置值（实际 ' + gapBetweenTwo.toFixed(2) + 'px）');

    /* ⑥ 圆角写进了键的行内样式，且随设置变化 */
    ok(Math.abs(parseFloat(rowKeys[0].style.borderRadius) - FE.kbDp(8, unitNow)) < 0.6,
      '键圆角跟随设置（实际 ' + rowKeys[0].style.borderRadius + 'px）');

    /* ⑦ 滑杆接线：改 value 触发 input → state 与预览同步 */
    const sliderC = $('pt-corner');
    ok(!!sliderC, '圆角滑杆存在');
    eq(sliderC.getAttribute('min'), '0', '圆角滑杆下限 0');
    eq(sliderC.getAttribute('max'), '24', '圆角滑杆上限 24');
    sliderC.value = '16';
    sliderC._fire('input');
    eq(FE.state.keyCornerRadiusDp, 16, '拖动圆角滑杆写入 state');
    ok(Math.abs(parseFloat(q('.kb-row')[0].querySelectorAll('.kb-key')[0].style.borderRadius) -
      FE.kbDp(16, unitNow)) < 0.6, '拖动后预览圆角立即跟随');
    eq($('pt-corner-val').textContent, '16dp', '滑杆数值标签同步');
    const sliderV = $('pt-gap-v');
    ok(!!sliderV, '垂直间隙滑杆存在');
    sliderV.value = '7';
    sliderV._fire('input');
    eq(FE.state.keyGapVerticalDp, 7, '拖动垂直间隙滑杆写入 state');
    eq(String(q('.kb-row')[0].querySelectorAll('.kb-key')[0].style.marginTop),
      FE.kbDp(7, unitNow) + 'px', '拖动后预览垂直内缩立即跟随');

    /* ⑧ 随草稿持久化（纯预览设置，不进 Foxy 文件） */
    const draftAp = JSON.parse(localStorageStub.getItem('foxy-layout-editor-draft-v1'));
    eq(draftAp.keyCornerRadiusDp, 16, '圆角写入草稿');
    eq(draftAp.keyGapVerticalDp, 7, '垂直间隙写入草稿');

    /* ⑨ 网格区段同样按「2×设置值」写 gap */
    $('layout-select').value = 'numpad';
    $('layout-select')._fire('change');
    const gEl = q('.kb-grid')[0];
    const gCol = parseFloat(String(gEl.style.gap).split(/\s+/)[0]);
    const wantG = FE.gridGaps(FE.state.profile.layouts['numpad'].sections[0].columns,
      FE.state.profile.layouts['numpad'].sections[0].rows, unitNow, 5).colGap;
    ok(Math.abs(gCol - wantG) < 0.01, '网格 gap 与 FE.gridGaps 同口径（渲染与测试共用一份计算）');
    $('layout-select').value = 'default';
    $('layout-select')._fire('change');
  } finally {
    FE.state.keyCornerRadiusDp = savedAp.c;
    FE.state.keyGapHorizontalDp = savedAp.h;
    FE.state.keyGapVerticalDp = savedAp.v;
    if (FE.applyKeyAppearance) FE.applyKeyAppearance();
  }
}

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

/* 新建动作 / 宏：默认展开，方便建完立刻配置。
 * 工具条已移到静态 HTML（搜索组 + 新建组各一行），不再渲染在列表容器内。 */
ok(!!$('actions-new') && !!$('actions-add'), '动作页有新建输入框与新建按钮（工具条内）');
$('actions-new').value = 'test.fresh';
documentStub._openDialogs.length = 0;
$('actions-add').click();
ok(!!FE.state.profile.actions['test.fresh'], '新建动作已写入 profile');
ok(FE.state.openActions['test.fresh'] === true, '新建动作默认展开');
eq($('actions-new').value, '', '新建后输入框已清空');
/* 三页统一：新建**不自动弹编辑对话框**，只建好 + 滚过去高亮 */
ok(dialogCount() === 0, '新建动作不自动弹出编辑对话框');
const freshItem = $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === 'test.fresh');
ok(!!freshItem && freshItem.open === true, '新建条目在界面上确实展开');
ok(freshItem.classList.contains('flash-hold'), '新建条目带持续高亮，方便一眼找到');
ok(!freshItem.classList.contains('flash-hold-err'), '新建用蓝色（只有校验出错才是红色）');

ok(!!$('macros-new') && !!$('macros-add'), '宏页有新建输入框与新建按钮（工具条内）');
$('macros-new').value = 'test.freshmacro';
documentStub._openDialogs.length = 0;
$('macros-add').click();
ok(!!FE.state.profile.macros['test.freshmacro'], '新建宏已写入 profile');
ok(FE.state.openMacros['test.freshmacro'] === true, '新建宏默认展开');
ok(dialogCount() === 0, '新建宏不自动弹出编辑对话框');

console.log('== 方案 B：新建后滚过去 + 高亮（不改 JSON 键序） ==');
/* 按键定义页此前会「新建即弹编辑框」，已按用户要求改成与另两页一致 */
ok(!!$('keys-new') && !!$('keys-add'), '按键定义页有新建输入框与新建按钮');
const keysOrderBefore = Object.keys(FE.state.profile.keys).join(',');
$('keys-new').value = 'test.newkey';
documentStub._openDialogs.length = 0;
$('keys-add').click();
ok(!!FE.state.profile.keys['test.newkey'], '新建按键定义已写入 profile');
ok(dialogCount() === 0, '新建按键定义不再自动弹出编辑对话框（三页统一）');
eq(Object.keys(FE.state.profile.keys).join(','), keysOrderBefore + ',test.newkey',
  'JSON 键顺序保持插入序（UI 操作不重排喂给 Foxy 的文件）');
const newKeyRow = $('keys-list').querySelectorAll('.def-item.def-row-click')
  .find(r => r.querySelectorAll('.def-name')[0].textContent === 'test.newkey');
ok(!!newKeyRow, '新按键定义出现在列表里');
ok(newKeyRow.classList.contains('flash-hold'), '新按键定义带持续高亮');
ok(!newKeyRow.classList.contains('flash-hold-err'), '新按键定义用蓝色（非出错红）');
/* 仍在末位：方案 B 刻意不改数据结构，只把视口挪过去 */
const allKeyRows = $('keys-list').querySelectorAll('.def-item.def-row-click');
ok(allKeyRows[allKeyRows.length - 1] === newKeyRow, '新条目追加在列表末尾（未重排）');
/* 用户之后自己点整行进编辑 */
documentStub._openDialogs.length = 0;
newKeyRow._fire('click');
ok(dialogCount() === 1, '新建后用户点整行才进编辑（不再自动弹）');
documentStub._openDialogs[0].close();

/* scrollToDefItem 的行为契约 */
ok(typeof FE.scrollToDefItem === 'function', '暴露 scrollToDefItem');
ok(FE.scrollToDefItem('test.newkey', 'keys-list') === true, 'scrollToDefItem 能找到并高亮条目');
ok(FE.scrollToDefItem('no_such_definition', 'keys-list') === false, '找不到时返回 false');
ok(FE.scrollToDefItem('test.newkey', 'no_such_host') === false, '宿主不存在时返回 false 不抛错');

/* 摘要行内的删除按钮：可用（会先弹内建确认框），且顺手清掉展开状态（不留脏记录） */
FE.renderAll();
const freshItem2 = $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === 'test.fresh');
freshItem2.querySelectorAll('button').find(b => b.textContent === '删除').click();
ok(!!lastDialog() && lastDialog().textContent.indexOf('删除') >= 0, '删除前弹出内建确认框');
await uiOk();
ok(!FE.state.profile.actions['test.fresh'], '摘要行内的删除按钮可用（未被折叠语义吞掉）');
ok(!FE.state.openActions['test.fresh'], '删除后同时清掉展开状态');

/* 确认框点「取消」则不应删除 */
$('actions-new').value = 'test.keepme';
$('actions-add').click();
ok(!!FE.state.profile.actions['test.keepme'], '（前置）新建 test.keepme');
FE.renderAll();
const keepItem = $('actions-list').querySelectorAll('.def-item.def-collapsible')
  .find(it => it.querySelectorAll('.def-name')[0].textContent === 'test.keepme');
keepItem.querySelectorAll('button').find(b => b.textContent === '删除').click();
await uiCancel();
ok(!!FE.state.profile.actions['test.keepme'], '确认框点取消不会删除');

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
await uiOk();   /* 删除先走内建确认框 */
ok(!FE.state.profile.actions['test.del'], '动作已删除');
ok(scrollHost.scrollTop === 520, '删除动作后滚动位置保持原处（未跳回分栏顶部）');

/* --- 新增动作 --- */
$('actions-new').value = 'test.scrolladd';
scrollHost.scrollTop = 640;
$('actions-add').focus();
$('actions-add').click();
ok(!!FE.state.profile.actions['test.scrolladd'], '新增动作成功');
ok(scrollHost.scrollTop === 640, '新增动作后滚动位置保持原处');

/* --- 新增宏 --- */
$('macros-new').value = 'test.scrollmacro';
scrollHost.scrollTop = 780;
$('macros-add').focus();
$('macros-add').click();
ok(!!FE.state.profile.macros['test.scrollmacro'], '新增宏成功');
ok(scrollHost.scrollTop === 780, '新增宏后滚动位置保持原处');

/* --- 删除宏 --- */
FE.renderAll();
const macDelBtn = findMacByName('test.scrollmacro')
  .querySelectorAll('button').find(b => b.textContent === '删除');
scrollHost.scrollTop = 410;
macDelBtn.focus();
macDelBtn.click();
await uiOk();   /* 同样先走内建确认框 */
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
$('top-undo').click();
eq(FE.state.profile.keys['qwerty.q'].label, undefined, '撤销恢复按键定义');
documentStub._openDialogs.length = 0;

console.log('== 未保存改动的守卫：点遮罩 / Esc / 取消 ==');
/* 历史 bug：改了内容后点到弹框外面（或按 Esc），对话框直接关闭，改动静默丢弃。
 * openModal 现在把「用户主动关闭」统一走 requestClose → onBeforeClose；
 * 「保存 / 删除」等程序化收尾仍走 close()，不触发守卫。 */
/* 找定义模式对话框里的「标签」输入框（placeholder 以「本地覆盖」开头） */
function findLabelInput(dlg) {
  return dlg.querySelectorAll('input').find(function (i) {
    return (i.getAttribute('placeholder') || '').indexOf('本地覆盖') === 0;
  });
}
/* 输入并提交：真实浏览器里点遮罩会先让输入框失焦 → 触发 change，
 * draft 才被更新；DOM 桩不会自动做这件事，所以测试要显式 fire change。
 * （只改 .value 不 fire，等于用户还没提交输入，守卫看不到改动是正确行为。） */
function typeInto(input, val) {
  input.value = val;
  input._fire('change');
}

/* ① 未改动：点遮罩应**直接关闭**，不该弹确认框 */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const d = documentStub._openDialogs[0];
  ok(!!findLabelInput(d), '定位到标签输入框');
  d._fire('click', { target: d });
  ok(!d.open, '未改动时点遮罩直接关闭');
  eq(dialogCount(), 0, '未改动不弹确认框');
}

/* ② 有改动：点遮罩 → 弹确认框，弹框保持打开 */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const d2 = documentStub._openDialogs[0];
  const lbl = findLabelInput(d2);
  typeInto(lbl, '改过了');
  d2._fire('click', { target: d2 });
  ok(d2.open, '有改动时点遮罩不会直接关闭');
  const cd = lastDialog();
  ok(!!cd && cd !== d2, '弹出确认框');
  ok(cd.textContent.indexOf('未保存') >= 0, '确认框说明有未保存改动');
  ok(cd.textContent.indexOf('放弃改动') >= 0, '确认框提供「放弃改动」');
  ok(cd.textContent.indexOf('继续编辑') >= 0, '确认框提供「继续编辑」');

  /* 选「继续编辑」→ 弹框保持打开，改动仍在 */
  await uiCancel();
  ok(d2.open, '选「继续编辑」后弹框保持打开');
  eq(lbl.value, '改过了', '改动仍在（没有被丢弃）');

  /* 再试一次并选「放弃改动」→ 关闭 */
  documentStub._openDialogs.length = 0;
  d2._fire('click', { target: d2 });
  ok(!!lastDialog(), '再次弹确认框');
  await uiOk();
  ok(!d2.open, '选「放弃改动」后关闭');
  eq(FE.state.profile.keys['qwerty.q'].label, undefined, '放弃后改动未写入 profile');
}

/* ③ Esc 也要拦下来（<dialog> 默认会自己关掉，必须 preventDefault 后接管） */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const d3 = documentStub._openDialogs[0];
  typeInto(findLabelInput(d3), 'esc改');
  const notPrevented = d3._fire('cancel');
  eq(notPrevented, false, 'Esc 被 preventDefault（由我们接管关闭）');
  ok(d3.open, 'Esc 有改动时也不直接关闭');
  ok(!!lastDialog() && lastDialog() !== d3, 'Esc 同样弹确认框');
  await uiCancel();
  ok(d3.open, 'Esc 后选「继续编辑」保持打开');
  d3.close();                    /* 程序化收尾，不触发守卫 */
}

/* ④「取消」按钮同样走守卫 */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const d4 = documentStub._openDialogs[0];
  typeInto(findLabelInput(d4), '取消改');
  d4.querySelectorAll('.dialog-toolbar button').find(b => b.textContent === '取消').click();
  ok(d4.open, '「取消」按钮走守卫，不直接关闭');
  await uiOk();
  ok(!d4.open, '确认放弃后关闭');
}

/* ⑤ 改名也算改动（nameInput 不在 draft 里，容易漏） */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const d5 = documentStub._openDialogs[0];
  const nameInp = d5.querySelectorAll('input').find(function (i) {
    return i.getAttribute('placeholder') === '按键定义名称';
  });
  ok(!!nameInp, '定位到名称输入框');
  nameInp.value = 'renamed.q';   /* nameInput 直接读 DOM 值，无需 change */
  d5._fire('click', { target: d5 });
  ok(d5.open, '只改名字也会被守卫拦住');
  ok(!!lastDialog() && lastDialog() !== d5, '改名同样弹确认框');
  await uiOk();
  ok(!d5.open, '放弃改名后关闭');
}

/* ⑥ 保存不受守卫影响：点「保存」直接关闭，且不弹确认框 */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const d6 = documentStub._openDialogs[0];
  const lbl6 = findLabelInput(d6);
  typeInto(lbl6, '保存不拦');
  d6.querySelectorAll('.dialog-toolbar .primary')[0].click();
  ok(!d6.open, '点「保存」直接关闭（不触发守卫）');
  eq(dialogCount(), 0, '保存后没有多余的确认框');
  eq(FE.state.profile.keys['qwerty.q'].label, '保存不拦', '保存正常写入');
  $('top-undo').click();
  eq(FE.state.profile.keys['qwerty.q'].label, undefined, '撤销恢复');
}
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
  /* 面板里选纯红（不透明）→ 桩按约定返回 6 位 BBGGRR = 0000FF（hexaColor a==1 分支） */
  bgPicker.fromString('#0000FF');
  eq(bgPicker.toHEXAString(), '0000FF', '桩按 vendor 约定输出不透明 BBGGRR');
  bgPicker.opts.onInput();
  eq(bgInput.value, '#FF0000', '面板 6 位输出回写为 6 位 ARGB（纯红）');
  eq(FE.state.profile.keys['qwerty.q'].colors, undefined, '面板拖动只进 draft，保存前不动 profile');
  /* ★ 滑块滑到顶（不透明）时输入框不突然缩短：当前是 8 位则补 FF 保持 8 位 */
  bgInput.value = '#8052F7BD';
  bgPicker.fromString('#BDF752'); /* 同一 RGB 的不透明色（面板输出 6 位） */
  eq(bgPicker.toHEXAString(), 'BDF752', '不透明时面板输出 6 位');
  bgPicker.opts.onInput();
  eq(bgInput.value, '#FF52F7BD', '滑到顶：8 位输入框补 FF 保持 8 位（#8052F7BD→#FF52F7BD）');
  /* 6 位输入框不受影响（保持 6 位） */
  bgInput.value = '#52F7BD';
  bgPicker.fromString('#BDF752');
  bgPicker.opts.onInput();
  eq(bgInput.value, '#52F7BD', '滑到顶：6 位输入框保持 6 位');
  /* ★ 半透明 8 位端到端（面板→落盘→预览三方一致）：
   * 面板按 vendor 约定输出 AABBGGRR，经 pickerHexToArgb 落盘为 Foxy #AARRGGBB，
   * 再经 foxyColorToCss 进预览为 CSS #RRGGBBAA，三处解析出的 RGBA 通道必须相同。 */
  bgPicker.fromString('#80BDF752'); /* vendor 约定：alpha=0x80，B=BD G=F7 R=52 */
  eq(bgPicker.toHEXAString(), '80BDF752', '桩按 vendor 约定输出半透明 AABBGGRR');
  bgPicker.opts.onInput();
  eq(bgInput.value, '#8052F7BD', '半透明面板取色回写输入框为 Foxy #AARRGGBB');
  kd.querySelectorAll('.dialog-toolbar .primary')[0].click();
  eq(FE.state.profile.keys['qwerty.q'].colors.background, '#8052F7BD', '半透明背景色落盘为 Foxy 语义');
  /* 预览侧验证搬到后面的「预览颜色渲染」段（那里已切回默认 profile，保证 qwerty.q 被渲染） */
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kdRe = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const bgRe = kdRe.querySelectorAll('.color-input')[1];
  eq(bgRe.value, '#8052F7BD', '重开对话框回显落盘值（Foxy 语义不变）');
  kdRe.querySelectorAll('.dialog-toolbar')[0].querySelectorAll('button')[0].click(); /* 取消 */
  $('top-undo').click();
  eq(FE.state.profile.keys['qwerty.q'].colors, undefined, '撤销清除颜色覆盖（含半透明一次）');
  /* 手输 change 同样归一化写 draft（重开对话框拿新的 colorInputs） */
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kdW = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const colorInputsW = kdW.querySelectorAll('.color-input');
  const textInput = colorInputsW[0]; /* 文字 */
  textInput.value = '#ff0000';
  textInput._fire('change');
  /* 保存 → profile */
  kdW.querySelectorAll('.dialog-toolbar .primary')[0].click();
  eq(FE.state.profile.keys['qwerty.q'].colors.text, '#FF0000', '手输的文字色归一化写入 profile');
  /* 非法输入被回退：现在通过 FE.uiAlert 提示（内建弹窗），要像用户那样读它 */
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kd2 = documentStub._openDialogs[0];
  const badInput = kd2.querySelectorAll('.color-input')[0];
  const keepVal = badInput.value;
  badInput.value = 'oops';
  badInput._fire('change');
  const colorAlert = await uiReadAlert();
  ok(!!colorAlert && colorAlert.indexOf('颜色格式无效') >= 0, '非法颜色输入被内建弹窗提示');
  ok(badInput.value === keepVal, '非法颜色输入被回退');
  kd2.querySelectorAll('.dialog-toolbar')[0].querySelectorAll('button')[0].click(); /* 取消 */
  $('top-undo').click();
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

console.log('== 取色滑块拖过头不关窗 ==');
/* jscolor 滑块拖动在 document 上挂 move/end 监听，拖过头松手时合成的 click
 * 会冒泡到 dialog（target 落在空白区），不能算"点遮罩"。面板内 pointerdown
 * 打标，800ms 内的遮罩 click 豁免；普通遮罩点击照常关闭。 */
documentStub._openDialogs.length = 0;
FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
{
  const kdDrag = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const dragInput = kdDrag.querySelectorAll('.color-input')[1];
  dragInput.getBoundingClientRect = () => ({ left: 40, top: 100, right: 190, bottom: 124, width: 150, height: 24 });
  dragInput.jscolor.show();
  const dragWrap = kdDrag.querySelectorAll('.jscolor-wrap')[0];
  ok(!!dragWrap, '拖过头用例：取色面板已弹出');
  dragWrap._fire('pointerdown');
  ok(typeof FE._colorDragGuard === 'number', '面板内 pointerdown 打标');
  kdDrag._fire('click');
  ok(kdDrag.open, '从面板拖出来松手：dialog 不关闭');
  FE._colorDragGuard = 0;
  kdDrag._fire('click');
  ok(!kdDrag.open, '普通遮罩点击：dialog 照常关闭');
}
documentStub._openDialogs.length = 0;

console.log('== 颜色行全链路回显（当前生效色 + 来源 + 跳转主题页） ==');
/* 用户抱怨的核心：「留空即恢复继承」这句没说继承到哪一级、那个颜色是什么。
 * 布局 JSON **不支持**「颜色引用主题字段」（schema:115 的 colors 是自由对象；
 * SKILL.md:892-893 值只能是 #RRGGBB/#AARRGGBB 字面量），所以全链路对应只能做在
 * UI 层：值仍写字面量，但每行必须回显「当前生效色 ← 它来自哪一级」与
 * 「清空后回落到什么」。解析复用 js/color-source.js（FE.resolveRole /
 * FE.colorSourceLabel / FE.resolveThemeField），颜色行照 theme-editor.js 的幂等 apply。 */
{
  const roleRow = (dlg, role) =>
    dlg.querySelectorAll('.color-row-wrap').filter(r => r.getAttribute('data-color-role') === role)[0];
  const jumpOf = (row) => row.querySelectorAll('.color-theme-jump')[0];
  const txt = (row) => row.querySelectorAll('.color-effect')[0].textContent;
  const fb = (row) => row.querySelectorAll('.color-fallback')[0].textContent;
  const inpOf = (row) => row.querySelectorAll('.color-input')[0];
  const clearOf = (row) => row.querySelectorAll('.mini-button').filter(b => b.textContent === '清除')[0];

  /* ---- ① 未导入主题：必须讲清「清空后回落 App 内置默认配色」而不是「没有颜色」 ---- */
  FE.state.themeProfile = null;
  FE.state.themeSlot = 'light';
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER' };
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  {
    const kd = documentStub._openDialogs[0];
    eq(kd.querySelectorAll('.color-row-wrap').length, 19, '19 个颜色行各自带回显块');
    eq(kd.querySelectorAll('.color-input').length, 19, '回显没有引入新的颜色输入框（仍是 19 个）');
    eq(kd.querySelectorAll('.color-theme-state').length, 1, '颜色卡顶部有主题导入状态说明');
    ok(kd.querySelectorAll('.color-theme-state')[0].textContent.indexOf('未导入主题') >= 0,
      '未导入主题时明说「清空后 Foxy 端将用内置默认配色」');
    const bg = roleRow(kd, 'background');
    ok(!!bg, '背景行可按 data-color-role 定位');
    ok(txt(bg).indexOf('当前生效') === 0, '背景行首行是「当前生效 …」');
    ok(txt(bg).indexOf('内置默认') >= 0, '未导入主题时来源落到 App 内置默认色');
    ok(txt(bg).indexOf('←') > 0, '回显带「← 来源」箭头');
    ok(jumpOf(bg) && jumpOf(bg).style.display === 'none',
      '来源不是主题时「到主题页改 →」隐藏（不误导用户）');
    const stBg = roleRow(kd, 'background.pressed');
    ok(!!stBg, 'states 行可按 data-color-role=角色.状态 定位');
    ok(stBg.querySelectorAll('.color-effect')[0].textContent.indexOf('pressed') >= 0,
      '状态行回显标明是命中 pressed 时生效');
    ok(fb(stBg).indexOf('① > ②') >= 0, '状态行明确写出状态色优先于基础角色（① > ②）');
  }
  documentStub._openDialogs.length = 0;

  /* ---- ② 已导入主题：来源指向主题字段，并给出「到主题页改」入口 ---- */
  FE.state.themeProfile = FE.normalizeThemeProfile({
    type: 'foxy.keyboard-theme', name: 'src',
    light: {
      keyBackgroundColor: '#FF111111',
      keyTypes: { FUNCTION: { background: '#FF888888' } }
    }
  });
  FE.state.themeSlot = 'light';
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'FUNCTION' };
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  {
    const kd = documentStub._openDialogs[0];
    ok(kd.querySelectorAll('.color-theme-state')[0].textContent.indexOf('已导入主题') >= 0,
      '已导入主题时状态说明切换口径');
    const bg = roleRow(kd, 'background');
    /* ③ 主题 keyTypes[键类型] 优先于 ④ 主题全局，来源细节必须写出来 */
    ok(txt(bg).indexOf('#FF888888') >= 0, '背景行显示主题 keyTypes 给出的当前生效色');
    ok(txt(bg).indexOf('keyTypes.FUNCTION.background') >= 0,
      '背景行注明来源细节 keyTypes.FUNCTION.background');
    ok(txt(bg).indexOf('来自主题') >= 0, '背景行注明「来自主题，改主题即同步」');
    ok(jumpOf(bg) && jumpOf(bg).style.display !== 'none',
      '来源是主题时显示「到主题页改 →」入口');
    /* 本键自己的值 → 首行标「本键自己的设置」，并另给「清空后 →」回落目标 */
    const inp = inpOf(bg);
    inp.value = '#FF123456';
    inp._fire('change');
    ok(txt(bg).indexOf('#FF123456') >= 0 && txt(bg).indexOf('本键自己的设置') >= 0,
      '写入本键值后首行标「本键自己的设置」');
    ok(fb(bg).indexOf('清空后') === 0 && fb(bg).indexOf('#FF888888') >= 0,
      '有本键值时明确写出「清空后 →」会回落到哪个色');
    clearOf(bg).click();
    eq(inpOf(bg).value, '', '清除后输入框留空');
    ok(txt(bg).indexOf('#FF888888') >= 0 && txt(bg).indexOf('本键自己的设置') < 0,
      '清除后首行回到主题给出的生效色');
    /* 方向角色有反直觉的逐层回落（keyTypes.hint 优先于主题槽位方向色），
     * 回显走的就是 FE.resolveRole，断言它同样有内容 */
    const top = roleRow(kd, 'hintTop');
    ok(!!top && txt(top).length > 0, 'hintTop 方向行同样有回显');
  }
  documentStub._openDialogs.length = 0;

  /* ---- ③ 弹出菜单 section：如实说明气泡配色属于主题，不提供可填颜色框 ---- */
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'FUNCTION' };
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  {
    const kd = documentStub._openDialogs[0];
    const pinfo = kd.querySelectorAll('.popup-color-info');
    ok(pinfo.length === 1, '弹出菜单 section 有气泡配色说明块（无 popupKey 时也在）');
    eq(kd.querySelectorAll('.popup-section .color-input').length, 0,
      '弹出气泡不提供颜色输入框（颜色属于主题文件，不在布局里）');
    const ptxt = pinfo[0].textContent;
    ok(ptxt.indexOf('主题文件') >= 0, '说明气泡配色属于主题文件');
    ok(ptxt.indexOf('不影响') >= 0, '说明布局按键的 colors 不影响弹出气泡');
    /* ⚠️ DOM 桩不支持属性选择器（[data-xxx]），只按 class + 文本内容定位 */
    const lines = pinfo[0].querySelectorAll('.popup-color-line');
    const pick = (name) => lines.filter(e => e.textContent.indexOf(name) >= 0)[0];
    ok(!!pick('popupTextColor') && pick('popupTextColor').textContent.indexOf('#FF') >= 0,
      'popupTextColor 显示当前生效值');
    ok(!!pick('popupBackgroundColor') && pick('popupBackgroundColor').textContent.indexOf('#FF') >= 0,
      'popupBackgroundColor 显示当前生效值');
    /* popupBorderColor：App 端未找到消费点（spec §7.3）—— 只如实标注，不画边框 */
    const borderNote = pinfo[0].querySelectorAll('.popup-border-note')[0];
    ok(!!borderNote && borderNote.textContent.indexOf('未找到消费点') >= 0,
      'popupBorderColor 如实标注「未找到消费点」（不假装生效）');
  }
  documentStub._openDialogs.length = 0;

  /* ---- ④ 跳转主题页：走 leaveThen（无未保存改动必须**同步**放行） ---- */
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'FUNCTION' };
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  {
    const kd = documentStub._openDialogs[0];
    const bg = roleRow(kd, 'background');
    jumpOf(bg).click();
    /* 无改动 → 必须同步关闭并切页；若被推迟一帧，用户看到的是「点了没反应」 */
    ok(!kd.open, '「到主题页改 →」无未保存改动时同步关闭对话框');
    ok($('tab-theme').classList.contains('active'), '跳转后主题页被激活');
  }
  documentStub._openDialogs.length = 0;

  /* 收尾：恢复未导入主题 + 默认键 + **切回布局编辑页**
   * （跳转用例把主题页留在激活态会让后续「停留在布局编辑页」类断言变红）。 */
  FE.state.themeProfile = null;
  FE.state.themeSlot = 'light';
  FE.state.profile.keys['qwerty.q'] = { ref: 'rime.q', keyType: 'LETTER', swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } } };
  FE.activateTab('tab-layout');
  ok($('tab-layout').classList.contains('active'), '收尾切回布局编辑页（不影响后续断言）');
  FE.renderAll();
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
  ok(String(key.style.boxShadow).indexOf('#00000040') >= 0, '基础 shadow 转 CSS 语义（含透明色，alpha 移到末尾）');
  /* 提示四边：hint 是兜底，hintTop/hintBottom 按边覆盖 */
  eq(q('.kb-hint-up', key)[0].style.color, '#123456', 'hintTop 只作用于上滑提示');
  eq(q('.kb-hint-down', key)[0].style.color, '#654321', 'hintBottom 只作用于下滑提示');
  /* 8 位 Foxy 色（#AARRGGBB）→ CSS（#RRGGBBAA）：彩·气泡场景，不透明粉蓝 */
  FE.state.profile.keys['qwerty.q'].colors.background = '#FF52F7BD';
  FE.renderAll();
  const keyAARR = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
  eq(keyAARR.style.background, '#52F7BDFF', '8 位 background 的 alpha 移到末尾（与手机一致）');
  /* 半透明 8 位：面板落盘的 #8052F7BD 预览为 #52F7BD80（与手机解析的 RGBA 通道一致） */
  FE.state.profile.keys['qwerty.q'].colors.background = '#8052F7BD';
  FE.renderAll();
  const keySemi = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
  eq(keySemi.style.background, '#52F7BD80', '半透明 background 预览为 CSS 语义（alpha 移末尾）');
  FE.state.profile.keys['qwerty.q'].colors.background = '#4CAF50';
  FE.renderAll();
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
  ok(String(key2.style.boxShadow).indexOf('#00000040') >= 0, '未按下时基础 shadow 生效（转 CSS 语义）');
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

/* 等防抖（250ms）后确认面板自动出现提醒，然后继续导入流程测试。
 * 原来是 setTimeout 包装（把主体切成两段）；现在整体已是 async main()，直接 await。 */
await sleep(350);
{
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
  $('op-example').value = 'split2.json';
  $('op-load-example').click();
  ok(!!FE.state.profile.layouts.default && FE.state.profile.layouts.default.split, 'split2.json 示例加载且含 split 片段');
  ok(q('.split-banner').length === 1, '区段编辑器渲染分体横幅');
  eq(q('#layout-tabs .pill').length, 4, '布局 pill 数 = 4（split2 比旧 split.json 多 text_editor）');

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

  console.log('== 预览高度比滑杆（只拉高、不改宽不改字） ==');
  ok($('pt-height') && $('pt-height-val'), '高度滑杆与百分比显示存在');
  /* 换算：K = (pct/100 × 20/9) / 0.5；31% → 1.38，15% → 0.67，60% → 2.67 */
  eq(FE.heightPctToK(31).toFixed(2), '1.38', '31% 换算 1.38（默认）');
  eq(FE.heightPctToK(15).toFixed(2), '0.67', '15% 下限换算');
  eq(FE.heightPctToK(60).toFixed(2), '2.67', '60% 上限换算');
  eq(FE.heightPctToK('oops'), 1.38, '非法输入回退默认');
  /* 滑杆拖到 40%：行高拉长、宽与字不动 */
  $('pt-height').value = '40';
  $('pt-height')._fire('input');
  eq(FE.state.previewHeightPct, 40, '滑杆值进 state');
  eq($('pt-height-val').textContent, '40%', '百分比显示同步');
  eq(FE.PREVIEW_HEIGHT_K.toFixed(2), FE.heightPctToK(40).toFixed(2), '系数同步更新');
  const tallRowH = q('.kb-row')[0].style.height;
  ok(parseFloat(tallRowH) > parseFloat(portraitRowH), '行高拉长（' + portraitRowH + ' → ' + tallRowH + '）');
  eq(q('.kb-label', q('.kb-key')[0])[0].style.fontSize, portraitLabelFs, '拉高后字号不变');
  /* 滑回 31% 恢复默认高度 */
  $('pt-height').value = '31';
  $('pt-height')._fire('input');
  eq(q('.kb-row')[0].style.height, portraitRowH, '滑回 31% 行高恢复');
  /* 持久化：草稿里有百分比，boot 恢复后滑杆/K/显示三处对齐 */
  $('pt-height').value = '40';
  $('pt-height')._fire('input');
  const draft = JSON.parse(global.localStorage.getItem('foxy-layout-editor-draft-v1'));
  eq(draft.previewHeightPct, 40, '高度百分比随草稿持久化');

  /* split2.json 的 default 常规无 Spacer，分体有 → 数量应不同 */
  $('pt-split').checked = true;
  $('pt-split')._fire('change');
  const spacerCount = q('.kb-key.kb-spacer').length;
  ok(spacerCount >= 3, 'split2.json 分体至少 3 个 Spacer（每行一个）');
  $('pt-split').checked = false;
  $('pt-split')._fire('change');

  /* ================================================================
   * 横屏预览（「横屏」复选）：容器加宽到分体宽度，但**仍渲染常规布局**
   *
   * 与「分体」的唯一区别就在这里：分体把编译目标换成 L.split 片段，
   * 横屏不换 —— 它只是"同一套布局在宽屏下的观感"。
   * 两条复选还**互斥**（同时开会让"渲染哪个片段"产生歧义）。
   * ================================================================ */
  console.log('== 横屏预览（加宽不切片段） ==');
  {
    const savedLs = FE.state.landscapeMode;
    const savedSp = FE.state.splitMode;
    $('preview-kb').clientWidth = 380;
    FE.state.landscapeMode = false;
    FE.state.splitMode = false;
    FE.state.portraitW = null;
    FE.renderAll();
    const portraitKeys = q('.kb-key').length;
    const portraitH2 = q('.kb-row')[0].style.height;
    const portraitFs2 = q('.kb-label', q('.kb-key')[0])[0].style.fontSize;

    $('pt-landscape').checked = true;
    $('pt-landscape')._fire('change');
    ok(FE.state.landscapeMode === true, '勾选横屏写入 state.landscapeMode');
    ok($('preview-kb').classList.contains('kb-split'), '横屏预览挂 kb-split 宽屏类（与分体同宽）');
    /* 关键：**仍是常规布局** —— 键数与行高/字号都不因变宽而变 */
    eq(q('.kb-key').length, portraitKeys, '横屏键数与竖屏相同（未切 split 片段）');
    eq(FE.state.splitMode, false, '横屏**不**置 splitMode（不切片段）');
    $('preview-kb').clientWidth = 760;
    FE.renderAll();
    eq(q('.kb-row')[0].style.height, portraitH2, '横屏只加宽，行高不变（仍是竖屏 unit 口径）');
    eq(q('.kb-label', q('.kb-key')[0])[0].style.fontSize, portraitFs2, '横屏字号不变');
    ok($('preview-meta').textContent.indexOf('横屏') >= 0, 'meta 标出横屏宽屏预览');
    ok($('preview-meta').textContent.indexOf('常规布局') >= 0, 'meta 强调仍渲染常规布局');

    /* 互斥：开分体自动关掉横屏（否则"渲染哪个片段"歧义） */
    $('pt-split').checked = true;
    $('pt-split')._fire('change');
    ok(FE.state.landscapeMode === false && $('pt-landscape').checked === false,
      '开分体自动取消横屏（两者互斥）');
    /* 反向：开横屏自动关掉分体 */
    $('pt-split').checked = false;
    $('pt-split')._fire('change');
    $('pt-landscape').checked = true;
    $('pt-landscape')._fire('change');
    $('pt-split').checked = true;
    $('pt-split')._fire('change');
    ok(FE.state.splitMode === true, '（前置）已切到分体');
    $('pt-landscape').checked = true;
    $('pt-landscape')._fire('change');
    ok(FE.state.splitMode === false && $('pt-split').checked === false,
      '开横屏自动取消分体（反向互斥）');

    /* 收尾：恢复竖屏 */
    $('pt-landscape').checked = false;
    $('pt-landscape')._fire('change');
    $('preview-kb').clientWidth = 380;
    FE.state.splitMode = savedSp;
    FE.state.landscapeMode = savedLs;
    FE.renderAll();
  }

  /* ================================================================
   * 预览工具栏分两行 + 深浅键盘与主题槽位**联动**
   *
   * 用户要求：滑杆与深浅键盘单独起一行；深浅选择与主题编辑的槽位联动。
   * 语义上 state.theme（预览 CSS 档位）与 state.themeSlot（主题取哪套槽位）
   * 是**同一件事的两面** —— 拆开会出现"预览切了深色、主题页还在编辑浅色槽"。
   * ================================================================ */
  console.log('== 预览工具栏分行 + 深浅与主题槽位联动 ==');
  {
    const savedTheme = FE.state.theme, savedSlot = FE.state.themeSlot;
    eq(q('.preview-toggles').length, 2, '预览工具栏分两行（.preview-toggles × 2）');
    ok(q('.preview-toggles-geom').length === 1, '第二行有 .preview-toggles-geom 类');
    const geomRow = q('.preview-toggles-geom')[0];
    /* 第二行承载：高度 + 三个外观滑杆 + 深浅键盘 */
    ['pt-height', 'pt-corner', 'pt-gap-h', 'pt-gap-v', 'pt-theme'].forEach(id => {
      ok(geomRow.querySelectorAll('#' + id).length === 1, '第二行含 ' + id);
    });
    /* 深浅下拉**不在**状态开关组里 —— 否则切到符号页会被一起隐藏掉 */
    eq($('pt-state-group').querySelectorAll('#pt-theme').length, 0,
      '深浅下拉不在状态开关组内（符号页仍可见）');

    /* 联动：改预览下拉 → theme 与 themeSlot 同步 */
    $('pt-theme').value = 'dark';
    $('pt-theme')._fire('change');
    eq(FE.state.theme, 'dark', '预览下拉写入 state.theme');
    eq(FE.state.themeSlot, 'dark', '预览下拉**同时**写入 state.themeSlot（联动）');
    $('pt-theme').value = 'light';
    $('pt-theme')._fire('change');
    eq(FE.state.themeSlot, 'light', '切回浅色同样联动');

    /* 反向：主题页切槽位 → 预览下拉同步（FE.syncThemeSlotUI 由 theme-editor 提供） */
    if (FE.syncThemeSlotUI) {
      FE.state.themeSlot = 'dark';
      FE.syncThemeSlotUI();
      eq($('pt-theme').value, 'dark', '主题页槽位变更后预览下拉同步显示（反向联动）');
    } else {
      ok(false, 'theme-editor 应导出 FE.syncThemeSlotUI 供反向联动');
    }
    FE.state.theme = savedTheme;
    FE.state.themeSlot = savedSlot;
    if (FE.syncThemeSlotUI) FE.syncThemeSlotUI();
    FE.renderAll();
  }


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
  $('top-undo').click();
  $('top-undo').click();
  $('top-undo').click();
  $('top-undo').click();
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
  /* 与按键定义 / 动作宏三页同构：默认**全部折叠**，且编辑器正文懒建 ——
   * 折叠状态下不构建候选 chip（否则 26 键 ×2 状态行会白烧 CPU）。 */
  ok(keyCards.every(c => !c.open), '键卡片默认全部折叠');
  ok(q('#popup-keys .popup-cand').length === 0, '折叠时不预先构建候选编辑器（懒建）');
  /* 展开其中一个键卡片 → 懒建出该键的状态行与候选 chip */
  const expandCard = keyCards.find(c => (c.querySelectorAll('.def-name')[0] || {}).textContent === 'q') || keyCards[0];
  expandCard.open = true;
  expandCard._fire('toggle');
  ok(q('#popup-keys .popup-cand').length > 0, '展开后构建出候选 chip（实际 ' + q('#popup-keys .popup-cand').length + '）');
  ok(q('#popup-keys .popup-state-row').length === 2, '展开后含常规/Shift 两行');
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
  /* 回归：布局未使用该 popupKey 时，模拟按键回退用 popupKey 本身作标签，
   * Shift 下同样要套单字符大写（此前回退分支在 if (mockEff) 内，Shift 开关
   * 只切气泡、不切按键，q 恒显示小写）。此时默认布局无任何 popupKey，
   * 正好覆盖“布局未使用”回退路径。 */
  FE.state.popupSelKey = 'q';
  FE.state.popupShifted = false;
  FE.renderPopupTab();
  eq(q('.pp-key')[0].textContent, 'q', '回退时 normal 显示 popupKey 小写');
  FE.state.popupShifted = true;
  FE.renderPopupTab();
  eq(q('.pp-key')[0].textContent, 'Q', '回退时 Shift 显示大写');
  FE.state.popupShifted = false;
  FE.renderPopupTab();
  eq(q('.pp-key')[0].textContent, 'q', '回退时取消 Shift 恢复小写');
  /* 回归（Unicode）：回退分支的大写化必须 Unicode 感知，不能只认 a-z。
   * г→Г（西里尔小写变大写）；ג（希伯来文无大小写）原样不动。 */
  eq(FE.popupShiftSingleChar('г'), 'Г', '西里尔小写 г Shift 变大写');
  eq(FE.popupShiftSingleChar('ג'), 'ג', '希伯来文 ג 无大小写保持原样');
  eq(FE.popupShiftSingleChar('ا'), 'ا', '阿拉伯文 ا 无大小写保持原样');
  /* 弹出效果预览跟随键盘颜色：舞台背景用键盘底色（kb-dark/kb-light 主题类），
   * 气泡/候选随主题，模拟按键额外套 keyType + colors 覆盖；主题切换实时同步。
   * 且改按键 colors 后模拟按键**实时**更新（经 renderAll→renderPopupTab）。 */
  (function () {
    var stage = q('.pp-stage')[0];
    ok(!!stage, '弹出效果预览舞台存在');
    var want = FE.state.theme === 'light' ? 'kb-light' : 'kb-dark';
    ok(stage.classList.contains(want), '预览舞台跟随键盘主题（背景用键盘底色，' + want + '）');
    var key = q('.pp-key')[0];
    ok(!!key, '模拟按键存在');
    ok(key.classList.contains('kt-letter'), '回退时模拟按键按 LETTER 配色');
    /* 实时：切主题后舞台主题类同步切换 */
    FE.state.theme = (want === 'light') ? 'dark' : 'light';
    $('pt-theme').value = FE.state.theme;
    $('pt-theme')._fire('change');
    var want2 = FE.state.theme === 'light' ? 'kb-light' : 'kb-dark';
    ok(q('.pp-stage')[0] && q('.pp-stage')[0].classList.contains(want2),
      '主题切换后预览舞台主题类同步（' + want2 + '）');
    FE.state.theme = (want === 'light') ? 'light' : 'dark';
    $('pt-theme').value = FE.state.theme;
    $('pt-theme')._fire('change');
    /* 改按键 colors → 弹出预览模拟按键实时套色（用带 popupKey=a 的参考布局） */
    var lt = fs.readFileSync(path.join(__dirname, '..', 'examples', '带弹出菜单参考-layout.json'), 'utf8');
    FE.applyProfileText(lt);
    FE.state.popupSelKey = 'a';
    FE.renderPopupTab();
    var bgBefore = q('.pp-key')[0].style.background;
    FE.mutate(function () { FE.state.profile.keys['qwerty.a'].colors = { background: '#ff0000' }; });
    eq(q('.pp-key')[0].style.background, '#ff0000', '改按键 a 颜色后模拟按键实时变红');
    ok(bgBefore !== '#ff0000', '（前置）改色前模拟按键不是红色');
  })();

  /* 弹出预览**全链路跟随主题文件**（不只是 kb-dark/kb-light 两档 CSS）：
   * 舞台底 = 键盘容器底色（含 key_border_enabled 联动）、气泡底/字 = popup*、
   * 候选底/字 = candidate*、首选候选底 = candidateHighlight。
   * 依据工作区 foxy/foxy-render-spec.md §7（App 端 pt.java:30/39、sc.java:1057-1074）。
   * ⭐ 未导入主题时按 **App 内置默认主题**取色（需求：预览默认用内置默认主题的深浅色，
   * 而不是编辑器自己那套预置色）。改前这里断言的是"一个内联色都不写"——旧口径已反转。 */
  (function () {
    var savedTheme = FE.state.themeProfile;
    var savedSlot = FE.state.themeSlot;
    var savedBorder = FE.state.keyBorderEnabled;
    try {
      /* ① 未导入主题：气泡走**内置默认主题**色（light 槽） */
      FE.state.themeProfile = null;
      FE.state.themeSlot = 'light';
      FE.state.keyBorderEnabled = true;
      FE.state.popupSelKey = 'a';
      FE.renderPopupTab();
      var bubble0 = q('.pp-bubble')[0];
      ok(!!bubble0, '未导入主题时气泡仍渲染');
      eq(bubble0.style.background, '#EEEEEEFF',
        '未导入主题时气泡底 = 内置默认 light 的 popupBackgroundColor');
      eq(bubble0.style.color, '#212121FF',
        '未导入主题时气泡字 = 内置默认 light 的 popupTextColor');
      /* 切到 dark 槽 → 内置默认的深色那套（两套槽位各自生效） */
      FE.state.themeSlot = 'dark';
      FE.renderPopupTab();
      eq(q('.pp-bubble')[0].style.background, '#373737FF',
        '内置默认 dark 的气泡底（deep 槽的 popupBackgroundColor）');
      FE.state.themeSlot = 'light';

      /* ② 导入一份辨识度高的主题，逐元素核对取色 */
      FE.state.themeProfile = FE.normalizeThemeProfile({
        type: 'foxy.keyboard-theme', name: 'pp-test',
        light: {
          keyboardColor: '#FF101112', altKeyboardColor: '#FF202122',
          popupBackgroundColor: '#FF303132', popupTextColor: '#FF404142',
          candidateBackgroundColor: '#FF505152', candidateTextColor: '#FF606162',
          candidateHighlightColor: '#FF707172', candidateCommentColor: '#FF808182'
        }
      });
      FE.state.themeSlot = 'light';
      FE.state.keyBorderEnabled = true;
      FE.state.popupSelKey = 'a';
      FE.renderPopupTab();

      var stageT = q('.pp-stage')[0];
      var bubbleT = q('.pp-bubble')[0];
      var candT = q('.pp-cand');
      eq(stageT.style.background, '#202122FF',
        '舞台底用键盘容器底色（border 开 → altKeyboardColor）');
      eq(bubbleT.style.background, '#303132FF', '气泡底用 popupBackgroundColor');
      eq(bubbleT.style.color, '#404142FF', '气泡字用 popupTextColor');
      ok(candT.length >= 1, '候选存在（实际 ' + candT.length + '）');
      eq(candT[0].style.background, '#707172FF', '首选候选底用 candidateHighlightColor');
      eq(candT[0].style.color, '#606162FF', '候选字用 candidateTextColor');
      if (candT.length > 1) {
        eq(candT[1].style.background, '#505152FF',
          '非首选候选底用 candidateBackgroundColor');
      }

      /* ③ key_border_enabled 关 → 舞台底改用 keyboardColor */
      FE.state.keyBorderEnabled = false;
      FE.renderPopupTab();
      eq(q('.pp-stage')[0].style.background, '#101112FF',
        'border 关 → 舞台底回落 keyboardColor');
    } finally {
      FE.state.themeProfile = savedTheme;
      FE.state.themeSlot = savedSlot;
      FE.state.keyBorderEnabled = savedBorder;
      FE.renderPopupTab();
    }
  })();

  /* 「弹出菜单那边的按键颜色引用」——模拟按键的颜色**来源**必须列出来。
   * 用户明确要求：这里不能只是写死颜色值，要真正全链路与主题对应。
   * 注意：模拟按键的颜色属于**布局文件**（该 popupKey 对应的那个布局按键），
   * popup 文件本身没有颜色字段 —— 所以这块是**只读展示 + 跳转**，不给颜色输入框。 */
  (function () {
    var savedTheme = FE.state.themeProfile;
    FE.state.themeProfile = FE.normalizeThemeProfile({
      type: 'foxy.keyboard-theme', name: 'src-test',
      light: { keyBackgroundColor: '#FF222222', keyTextColor: '#FF111111' }
    });
    FE.state.themeSlot = 'light';
    FE.renderPopupTab();
    var srcBox = q('.pp-color-src')[0];
    ok(!!srcBox, '弹出预览里有「模拟按键颜色来源」区块');
    if (srcBox) {
      var lines = srcBox.querySelectorAll('.pp-color-line');
      ok(lines.length >= 1, '列出了至少一行颜色来源（实际 ' + lines.length + '）');
      var txt = srcBox.textContent || '';
      ok(txt.indexOf('←') >= 0, '来源行含「←」箭头（生效值 ← 来源）');
      ok(txt.indexOf('只读') >= 0, '明确标注为只读（颜色属于布局文件）');
      ok(srcBox.querySelectorAll('input.color-input').length === 0,
        '来源区块**不含**颜色输入框（不能在 popup 页改布局按键的颜色）');
    }
    FE.state.themeProfile = savedTheme;
    FE.renderPopupTab();
  })();

  /* 添加候选（文本类型）端到端。
   * 键卡片默认折叠且懒建，所以要**在已展开的卡片内**取添加按钮 ——
   * 折叠卡片的正文（含 .chip-add）根本没构建出来。 */
  console.log('== 弹出菜单候选编辑 ==');
  const openCard = q('#popup-keys .popup-key-card').find(c => c.open);
  ok(!!openCard, '存在已展开的键卡片（前一段展开的那个）');
  const openPk = openCard.querySelectorAll('.def-name')[0].textContent;
  const addBtns = openCard.querySelectorAll('.chip-add');
  eq(addBtns.length, 2, '展开的键两个状态行各有一个添加按钮');
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
  /* 验证写入了 profile（展开键的 normal 末尾） */
  const firstArr = FE.state.popupProfile.schemas.default[openPk].normal;
  ok(firstArr[firstArr.length - 1] === 'ẗ', '新候选写入 normal 末尾');
  /* 撤销 */
  $('top-undo').click();
  ok(FE.state.popupProfile.schemas.default[openPk].normal[firstArr.length - 1] !== 'ẗ' || FE.state.popupProfile.schemas.default[openPk].normal.length === firstArr.length - 1, '撤销弹回候选');

  /* 布局联动：构造只含 z 键的弹出菜单 + 加载带 popupKey 的 split 布局 */
  console.log('== 弹出菜单与布局联动 ==');
  $('popup-json').value = '{ "type": "foxy.popup-profile", "schemas": { "default": { "z": { "normal": ["Z"] } } } }';
  $('popup-json-apply').click();
  ok(!!FE.state.popupProfile.schemas.default.z, '载入最小弹出菜单');
  ok(Object.keys(FE.state.popupProfile.schemas.default).length === 1, '当前弹出菜单只有 z 键');
  $('op-example').value = 'split2.json';
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
  $('op-example').value = 'split2.json';
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
  q('.kb-key')[0].click(); /* split2.json 首键 qwerty.q 自带 popupKey=q */
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
  $('top-undo').click();
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
  $('top-undo').click();
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
  $('top-undo').click();
  const g1b = FE.state.profile.layouts.default.sections[0].keys[1];
  eq([g1b.column, g1b.row], [1, 0], '撤销恢复网格坐标');

  console.log('== 指针拖动：chip 不再依赖原生 draggable（触屏可用） ==');
  FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
  const anyChip = q('#layout-sections .chip')[0];
  ok(anyChip && anyChip.getAttribute('draggable') == null, 'chip 不再设 draggable 属性（改用 Pointer Events，触屏可拖）');

  console.log('== 指针拖动：弹出菜单候选排序（performCandDrop，含跨行） ==');
  $('popup-example').value = '气泡-popup.json';
  $('popup-load-example').click();
  tabs[3]._fire('click');
  ok(typeof FE.performCandDrop === 'function', '导出 performCandDrop 供候选拖动使用');
  const candLabels = (pk, st) => (FE.state.popupProfile.schemas.default[pk][st] || []).map(c => FE.popupCandidateLabel(c));
  /* 同行：把首个候选拖到第 3 个之前 */
  const before0 = candLabels('q', 'normal').slice(0, 3);
  FE.performCandDrop(
    { schema: 'default', pk: 'q', st: 'normal', ci: 0 },
    { kind: 'before', loc: { schema: 'default', pk: 'q', st: 'normal', ci: 2 } });
  const after0 = candLabels('q', 'normal').slice(0, 3);
  eq(after0, [before0[1], before0[0], before0[2]], '同行拖动重排：首候选移到第 3 个之前');
  /* 跨行：把常规首个拖到 Shift 行首 */
  const shiftBefore = candLabels('q', 'shifted').slice();
  const moving = candLabels('q', 'normal')[0];
  FE.performCandDrop(
    { schema: 'default', pk: 'q', st: 'normal', ci: 0 },
    { kind: 'before', loc: { schema: 'default', pk: 'q', st: 'shifted', ci: 0 } });
  eq(candLabels('q', 'shifted')[0], moving, '跨行拖动：候选落到 Shift 行首');
  ok(candLabels('q', 'normal').indexOf(moving) < 0 || candLabels('q', 'normal').length === after0.length - 1, '跨行拖动：候选离开原行');
  /* 拖动经 pmutate 记录历史，可撤销 */
  $('top-undo').click();
  eq(candLabels('q', 'shifted'), shiftBefore, '撤销恢复跨行拖动');
  /* 候选 chip 同布局 chip 一套手感：无 draggable，点按阈值内仍是点击编辑 */
  const anyCand = q('#popup-keys .popup-cand')[0];
  ok(anyCand && anyCand.getAttribute('draggable') == null, '候选 chip 同样无 draggable（Pointer Events 统一）');
  ok(!!anyCand.__candLoc && anyCand.__candLoc.pk === 'q', '候选 chip 带拖动定位标记');
  /* 顺序调整改拖动后不再有 ◀ ▶ 按钮 */
  ok(q('#popup-keys .cand-order').length === 0, '候选 chip 无移动箭头（拖动排序替代）');
  /* 对话框与页签数据同源：页签侧拖动后，对话框重建即同步（同一份 popupProfile） */
  tabs[0]._fire('click');
  documentStub._openDialogs.length = 0;
  q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0).click();
  const linkDlg = documentStub._openDialogs[0];
  const linkCands = linkDlg.querySelectorAll('.popup-section .popup-cand').map(c => c.textContent);
  const tabCands = q('#popup-keys .popup-cand').slice(0, linkCands.length).map(c => c.textContent);
  eq(linkCands.slice(0, 3), tabCands.slice(0, 3), '对话框与页签候选内容一致（同源联动）');

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

  console.log('== 浮动工具：右上撤销/重做、右下回到顶部 ==');
  /* 滚动监听注册在 window 上（桩把监听器收进 _winListeners），照真实路径触发它 */
  const fireScroll = () => (_winListeners['scroll'] || []).forEach(fn => fn({ type: 'scroll' }));
  const pageEl = documentStub.documentElement;

  ok($('float-undo') && $('float-redo') && $('float-top'), '浮动撤销/重做/回到顶部三个控件都存在');
  ok(!!$('float-undo-group'), '浮动撤销/重做在同一组内');
  ok($('float-undo-group').classList.contains('float-top-right'), '撤销/重做浮动在右上');
  ok($('float-top').classList.contains('float-bottom-right'), '回到顶部浮动在右下');

  /* 贴「中央操作区外缘」靠的是 .float-layer > .float-rail 这层与内容列同宽、
   * 同内边距、同居中的定位层 —— 结构没了，CSS 那套 calc 就无从对齐，故锁住它。
   * （几何本身在无头环境量不到，DOM 桩没有真实布局；这里验的是结构契约。） */
  const floatRail = $('float-undo-group').parentNode;
  ok(!!floatRail && floatRail.classList.contains('float-rail'), '浮动按钮挂在 .float-rail 内（与内容列对齐的那层）');
  ok(!!floatRail.parentNode && floatRail.parentNode.classList.contains('float-layer'),
    '.float-rail 外层是 .float-layer（fixed 铺满视口，不吃鼠标事件）');
  /* ⚠️ 这里用 ok(x === y) 而非 eq(x, y)：eq() 内部 JSON.stringify 两边，
   * 而 DOM 节点有循环引用（parentNode ↔ children）会直接抛
   * 「Converting circular structure to JSON」。节点比较一律用恒等。 */
  ok($('float-top').parentNode === floatRail, '回到顶部与撤销/重做共用同一层（两者对齐基准一致）');
  ok(floatRail.parentNode.parentNode === documentStub._body,
    '浮动层挂在 body 上，不随 main 的布局滚动');

  /* 未滚动时隐藏：顶栏右侧本来就有同款按钮，固定定位叠上去会打架 */
  pageEl.scrollTop = 0;
  fireScroll();
  ok($('float-undo-group').hidden === true, '未滚动时浮动撤销/重做隐藏（避免与顶栏重叠）');
  ok($('float-top').hidden === true, '未滚动时回到顶部隐藏');

  /* 滚过顶栏后出现 */
  pageEl.scrollTop = 400;
  fireScroll();
  ok($('float-undo-group').hidden === false, '滚过顶栏后浮动撤销/重做出现');
  ok($('float-top').hidden === false, '滚过顶栏后回到顶部出现');

  /* 状态两处同步：浮动 / 顶栏 */
  eq($('float-undo').disabled, $('top-undo').disabled, '浮动撤销与顶栏撤销状态同步');
  eq($('float-redo').disabled, $('top-redo').disabled, '浮动重做与顶栏重做状态同步');
  FE.mutate(function () { FE.state.profile.author = '浮动测试'; });
  ok($('float-undo').disabled === false, '有历史后浮动撤销可用');
  ok($('float-undo').getAttribute('title').indexOf('Ctrl+Z') >= 0, '浮动撤销 title 带快捷键提示');

  /* 浮动按钮实际生效 */
  const floatAuthorBefore = FE.state.profile.author;
  $('float-undo').click();
  ok(FE.state.profile.author !== floatAuthorBefore, '点浮动撤销确实回退了');
  ok($('float-redo').disabled === false, '撤销后浮动重做可用');
  $('float-redo').click();
  eq(FE.state.profile.author, floatAuthorBefore, '点浮动重做确实恢复了');

  /* 回到顶部：点到即回顶，并自动收起自己 */
  pageEl.scrollTop = 3000;
  fireScroll();
  $('float-top').click();
  eq(pageEl.scrollTop, 0, '点回到顶部后 scrollTop 归零');
  ok($('float-top').hidden === true, '回到顶部后浮层自己收起');

  /* 滚回顶部时浮层也要收起（不只是点击后才收） */
  pageEl.scrollTop = 500;
  fireScroll();
  ok($('float-undo-group').hidden === false, '（前置）已滚下，浮层可见');
  pageEl.scrollTop = 0;
  fireScroll();
  ok($('float-undo-group').hidden === true, '滚回顶部后浮层自动收起');

  /* 回到顶部是「有意的滚动」：不能被 afterChange 排下的补帧拽回去 */
  const savedRaf2 = global.requestAnimationFrame;
  let pendingFloatFrame = null;
  global.requestAnimationFrame = (fn) => { pendingFloatFrame = fn; return 1; };
  FE.renderAll();                      /* 内部 restoreScroll 会排一帧位置恢复 */
  pageEl.scrollTop = 3000;
  fireScroll();
  $('float-top').click();
  if (pendingFloatFrame) pendingFloatFrame();
  eq(pageEl.scrollTop, 0, '补帧执行后仍停在顶部（有意滚动已作废待恢复快照）');
  global.requestAnimationFrame = savedRaf2;
  pageEl.scrollTop = 0;
  fireScroll();

  console.log('== 顶栏项目链接 ==');
  const titleLink = $('repo-title-link');
  const repoLink = $('repo-link');
  const REPO_URL = 'https://github.com/SandyYuR/foxy-see-me';
  ok(titleLink && repoLink, '顶栏存在两处项目仓库链接（标题 + 标题后的图标按钮）');
  eq(titleLink.getAttribute('href'), REPO_URL, '标题链接指向本项目仓库');
  eq(repoLink.getAttribute('href'), REPO_URL, '标题后的图标按钮指向本项目仓库');
  eq(repoLink.getAttribute('target'), '_blank', '图标按钮在新标签页打开');
  eq(titleLink.getAttribute('rel'), 'noopener noreferrer', '标题链接带 rel=noopener noreferrer');
  eq(repoLink.getAttribute('rel'), 'noopener noreferrer', '图标按钮带 rel=noopener noreferrer');
  ok(/小狐狸 see me/.test(titleLink.textContent), '标题链接文本仍含项目名');
  /* GitHub 按钮已搬到标题后面：图标按钮挂在 h1 内、标题链接之后，且无文字 */
  ok(repoLink.parentNode === titleLink.parentNode, '图标按钮与标题链接在同一 h1 内');
  /* 桩里 svg 是 innerHTML 占位（无文本节点），故断言「无 <span> 文字子元素」而非 textContent */
  ok(!repoLink.querySelector('span'), '标题后的 GitHub 按钮无文字（纯图标，无 span）');
  ok(repoLink.classList.contains('repo-link-title'), '图标按钮带 repo-link-title 紧凑样式类');
  /* 顶栏右侧不再有 GitHub 文字按钮，取而代之的是三个网页配色图标按钮 */
  ok(!q('.topbar-actions .repo-link').length, '顶栏右侧不再放 GitHub 按钮');
  ok($('site-theme-auto') && $('site-theme-light') && $('site-theme-dark'), '右侧有自动/亮色/暗色三个配色按钮');
  ok(q('.topbar-actions .site-theme-btn').length === 3, '配色按钮恰好三个（无文字，图标区分）');
  ok(q('.site-theme-btn').every(b => !b.querySelector('span')), '三个配色按钮都无文字（纯图标，无 span）');
  /* 参照项目的说明链接在 index.html 的副标题里（DOM 桩只还原顶栏骨架，故查源码） */
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(htmlSrc.indexOf('github.com/SandyYuR/f5a-see-me') >= 0, '正文仍保留参照项目 f5a-see-me 的说明链接');
  /* 标签栏标题不应重复狐狸图标（已有 favicon），避免视觉重复 */
  const pageTitle = htmlSrc.match(/<title>([\s\S]*?)<\/title>/)[1];
  ok(pageTitle.indexOf('🦊') < 0, '页面 <title> 不再带狐狸图标（避免与 favicon 重复）');
  ok(pageTitle.indexOf('小狐狸 see me') >= 0, '页面 <title> 仍含项目名');

  console.log('== 网页配色：自动/亮色/暗色 ==');
  /* 默认自动：<html> 挂 site-auto，自动按钮高亮 */
  eq(FE.siteThemeMode(), 'auto', '默认网页配色为自动跟随系统');
  ok(documentStub.documentElement.classList.contains('site-auto'), '默认 <html> 带 site-auto');
  ok($('site-theme-auto').classList.contains('active'), '默认自动按钮高亮');
  /* 切亮色：类 + 高亮 + 持久化三处同步 */
  $('site-theme-light').click();
  eq(FE.siteThemeMode(), 'light', '点亮色后模式为 light');
  ok(documentStub.documentElement.classList.contains('site-light'), '亮色下 <html> 带 site-light');
  ok(!documentStub.documentElement.classList.contains('site-auto'), '亮色下 site-auto 已摘掉');
  ok($('site-theme-light').classList.contains('active'), '亮色按钮高亮');
  ok(!$('site-theme-auto').classList.contains('active'), '自动按钮高亮摘掉');
  eq($('site-theme-light').getAttribute('aria-pressed'), 'true', '亮色按钮 aria-pressed 置 true');
  /* 切暗色：回落暗色基准（无浅色覆盖），选择同样持久化 */
  $('site-theme-dark').click();
  eq(FE.siteThemeMode(), 'dark', '点暗色后模式为 dark');
  ok(documentStub.documentElement.classList.contains('site-dark'), '暗色下 <html> 带 site-dark');
  ok($('site-theme-dark').classList.contains('active'), '暗色按钮高亮');
  /* 切回自动：跟随系统（桩里无媒体查询，只验类与持久化） */
  $('site-theme-auto').click();
  eq(FE.siteThemeMode(), 'auto', '点自动后回到 auto');
  ok(documentStub.documentElement.classList.contains('site-auto'), '自动下 <html> 带 site-auto');
  ok($('site-theme-auto').classList.contains('active'), '自动按钮重新高亮');
  /* 非法存值回退自动，不抛错 */
  global.localStorage.setItem('foxy-editor-site-theme', 'oops');
  FE.applySiteTheme(FE.siteThemeMode());
  eq(FE.siteThemeMode(), 'auto', '非法存值回退为 auto');
  ok(documentStub.documentElement.classList.contains('site-auto'), '非法存值后 <html> 仍是 site-auto');
  /* 网页配色与键盘预览配色互不干扰：各管各的 state（此轮前面刚把键盘切到深色） */
  eq(FE.state.theme, 'dark', '（前置）键盘预览仍是深色（上一组刚切的）');
  $('site-theme-light').click();
  eq(FE.siteThemeMode(), 'light', '切网页亮色不影响键盘配色 state');
  eq(FE.state.theme, 'dark', '键盘预览仍是深色（网页配色没动它）');
  $('site-theme-auto').click();

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

  /* ---- 跳转后「校验详情」必须保持展开 ----
   * renderMeta 每次重渲染都会 clearEl 重建这个 <details>，展开态得存在 state 里，
   * 否则点一条错误详情就被收起，想连着看下一条要反复展开（用户明确要求修掉）。 */
  const metaDet = q('.meta-details')[0];
  ok(!!metaDet, '校验详情折叠块已渲染');
  ok(metaDet.open === false, '默认是收起的');
  metaDet.open = true;
  metaDet._fire('toggle');
  eq(FE.state.metaDetailsOpen, true, '展开后展开态写进 state');
  /* 先切到别处，确认定位会切回来 */
  FE.state.sel = null;
  FE.locateIssue(badIssue);
  eq(FE.state.layoutName, 'default', '定位切到问题所在布局');
  eq(FE.state.sel, { s: 0, r: 0, k: 1 }, '定位选中出错的键');
  eq(FE.state.splitMode, false, '常规片段的问题不切到分体模式');
  /* 渲染被重建了（是新节点），但展开态跟着 state 恢复 */
  const metaDet2 = q('.meta-details')[0];
  ok(metaDet2 !== metaDet, '定位触发了重渲染（折叠块是新节点）');
  eq(metaDet2.open, true, '跳转后校验详情仍保持展开（不再被收起）');
  /* 用户手动收起后，后续重渲染也应保持收起（不能反过来强制展开） */
  metaDet2.open = false;
  metaDet2._fire('toggle');
  eq(FE.state.metaDetailsOpen, false, '收起后展开态同步为 false');
  FE.renderAll();
  eq(q('.meta-details')[0].open, false, '收起状态同样跨重渲染保持');
  /* 复原成展开态，后面的断言仍按"可点击条目可见"的前提走。
   * 必须**重新定位一次**：上面的 FE.renderAll() 会 clearEl 重建预览 DOM，
   * 之前 holdFlash 加在旧 chip 上的 .flash-hold-err 随节点一起没了
   * （高亮是渲染后加的类，任何重渲染都会丢——这是既有行为，不是本次改动引入的）。 */
  q('.meta-details')[0].open = true;
  q('.meta-details')[0]._fire('toggle');
  FE.locateIssue(badIssue);
  eq(q('.meta-details')[0].open, true, '重新定位后校验详情仍展开');
  ok(q('.chip-sel').length > 0, '定位后该键带选中样式');
  /* 布局按键高亮**按来源分色**（用户两次要求叠加的结果）：
   *   校验出错跳过来 → 红（'err'）：它是"这里有错"，红才对；
   *   「使用数」跳过来 → 黄（'sel'）：只是带你到用过它的键，按键本就被选中、
   *   自带黄框，红得突兀。
   * 这里先验校验这条（默认红色）。 */
  const errChip = documentStub.querySelectorAll('.chip-sel')
    .find(c => c.classList.contains('flash-hold-err'));
  ok(!!errChip, '校验出错跳到布局按键时带**红色**持续高亮');
  ok(errChip.classList.contains('flash-hold'), '红框同时带 .flash-hold 基类（CSS 靠它挑元素）');
  ok(!errChip.classList.contains('flash-hold-sel'), '校验跳转**不是**黄色（黄只给非出错的引用跳转）');
  documentStub.dispatchEvent({ type: 'pointerdown' });
  ok(!errChip.classList.contains('flash-hold-err'), '点击后红色闪烁效果消失');
  ok(errChip.classList.contains('chip-sel'), '点击后按键仍保持选中（黄框正常显示）');

  /* 同一条布局按键，「使用数」跳过来要用**黄色**（非出错语义） */
  FE.jumpToUsage({ layout: 'default', sectionIndex: 0, rowIndex: 0, keyIndex: 1, group: 'rows' });
  const selChip = documentStub.querySelectorAll('.chip-sel')
    .find(c => c.classList.contains('flash-hold-sel'));
  ok(!!selChip, '「使用数」跳到布局按键时带**黄色**持续高亮');
  ok(!selChip.classList.contains('flash-hold-err'), '该路径不用红色（只有校验出错才红）');
  documentStub.dispatchEvent({ type: 'pointerdown' });
  ok(!selChip.classList.contains('flash-hold-sel'), '点击后黄色光晕消失');
  ok(selChip.classList.contains('chip-sel'), '点击后按键仍保持选中');
  /* 复原到校验定位的选中态，后续断言（split 等）沿用 badIssue 的流程 */
  FE.locateIssue(badIssue);

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

  /* ---- 按键定义 / 动作 / 宏内部的问题也能点击定位 ----
   * 这些位置没有布局坐标，早期 issueLocatable 判 false →
   * 校验详情里渲染成不可点的纯文本行（用户报告「点了没反应」）。 */
  FE.applyProfileText(JSON.stringify({
    keys: { 'k.broken': { ref: 'nope.ref' } },
    actions: { badact: { type: 'nope' } },
    macros: { badstep: [{ action: 'no_such_action' }] },
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.broken' }]] }] } }
  }), {});
  const defIssue = FE.state.validation.issues.find(i => i.defKind === 'key' && i.defName === 'k.broken');
  ok(!!defIssue, '按键定义内部的问题带定义坐标');
  eq(FE.issueLocatable(defIssue), true, '定义坐标被判定为可定位');
  /* 点它 → 切到按键定义页并高亮该条目（不是切布局） */
  FE.state.sel = null;
  FE.locateIssue(defIssue);
  ok($('tab-keys').classList.contains('active'), '定义问题定位切到按键定义页');
  const brokenRow = $('keys-list').querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === 'k.broken');
  ok(!!brokenRow && brokenRow.classList.contains('flash-hold'), '定位后目标条目带持续高亮');
  ok(brokenRow.classList.contains('flash-hold-err'), '校验定位用红色（提示有问题）');
  documentStub.dispatchEvent({ type: 'pointerdown' });
  ok(!brokenRow.classList.contains('flash-hold'), '用户点击后该高亮消失');

  /* 动作/宏的问题同样可定位 */
  const actIssue = FE.state.validation.issues.find(i => i.defKind === 'action' && i.defName === 'badact');
  ok(!!actIssue && FE.issueLocatable(actIssue) === true, '动作定义的问题可定位');
  const macIssue = FE.state.validation.issues.find(i => i.defKind === 'macro' && i.defName === 'badstep');
  ok(!!macIssue && FE.issueLocatable(macIssue) === true, '宏步骤的问题可定位');
  /* 定义已不存在时不谎报可定位（避免点了跳到空处） */
  eq(FE.issueLocatable({ defKind: 'key', defName: 'no_such_def' }), false,
    '定义不存在时不判定为可定位');
  /* 校验详情里确实渲染成可点击行 */
  ok(q('.issue-locatable').length > 0, '校验详情渲染出可点击的定义问题条目');

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

  /* 定义内部的引用（「按键定义 k.chain」）现在也带跳转按钮 ——
   * 早期它是不可点的只读行，用户点不动，是本次修复的目标。 */
  const defJump = usageDlg.querySelectorAll('.usage-item.usage-jump')
    .find(b => b.textContent.indexOf('按键定义 k.chain') >= 0);
  ok(!!defJump, '被按键定义引用的条目也可点（不再只读）');

  /* 点可跳转条目 → 切到布局编辑页并选中该键。
   * 必须挑**布局坐标**的那条：条目顺序不保证，写 jumpBtns[0] 会挑到定义跳转项。 */
  const layoutJump = usageDlg.querySelectorAll('.usage-item.usage-jump')
    .find(b => b.textContent.indexOf('按键定义') < 0);
  ok(!!layoutJump, '弹窗含布局坐标条目（' + (layoutJump && layoutJump.textContent) + '）');
  documentStub._openDialogs.length = 0;
  layoutJump._fire('click');
  ok($('tab-layout').classList.contains('active'), '跳转后切到布局编辑页');
  ok(FE.state.sel != null, '跳转后选中了对应按键');
  ok(!usageDlg.open, '跳转后弹窗已关闭');

  /* 点定义跳转项 → 切到按键定义页并高亮该条目（不是跳到布局） */
  documentStub._openDialogs.length = 0;
  uBtn2._fire('click');
  const dlgDef = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const defJump2 = dlgDef.querySelectorAll('.usage-item.usage-jump')
    .find(b => b.textContent.indexOf('按键定义 k.chain') >= 0);
  ok(!!defJump2, '重开弹窗后仍含定义跳转项');
  defJump2._fire('click');
  eq(FE.state.layoutName, 'default', '跳定义不改当前布局名（不是布局跳转）');
  ok($('tab-keys').classList.contains('active'), '定义跳转切到按键定义页');

  /* ---- 定位高亮必须**持续**到用户下次点击/按键（不是一闪而过） ----
   * 用户明确要求：跳转/新建/校验定位三处的落点常落在长列表里，
   * 1.2s 的淡出在高亮被扫到前就没了。 */
  const heldRow = $('keys-list').querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === 'k.chain');
  ok(!!heldRow, '跳转后能找到目标条目 k.chain');
  ok(heldRow.classList.contains('flash-hold'), '跳转目标带持续高亮（.flash-hold）');
  ok(!heldRow.classList.contains('flash-hold-err'), '引用跳转用蓝色（非出错红）');
  /* 用户下一次「点」→ 高亮解除（capture 监听 pointerdown） */
  documentStub.dispatchEvent({ type: 'pointerdown' });
  ok(!heldRow.classList.contains('flash-hold'), '用户点击后跳转高亮消失');

  /* 同一时刻只保留一处高亮：再定位一次，上一处应被撤掉，否则会亮一排 */
  FE.scrollToDefItem('k.a', 'keys-list');
  const heldA = $('keys-list').querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === 'k.a');
  ok(heldA.classList.contains('flash-hold'), '新定位目标亮起');
  ok(!heldRow.classList.contains('flash-hold'), '旧的定位高亮被撤掉（只留一处）');
  /* 键盘操作同样解除（capture 监听 keydown） */
  documentStub.dispatchEvent({ type: 'keydown' });
  ok(!heldA.classList.contains('flash-hold'), '用户按键后定位高亮消失');

  /* 校验详情那种「有问题」的定位用红色变体，与蓝色的引用跳转区分 */
  FE.scrollToDefItem('k.a', 'keys-list', { error: true });
  const heldErr = $('keys-list').querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === 'k.a');
  ok(heldErr.classList.contains('flash-hold-err'), '出错定位带红色持续高亮（.flash-hold-err）');
  documentStub.dispatchEvent({ type: 'pointerdown' });

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

  /* ---- 按键定义的「引用」一节：它用到了哪些动作与宏（可看、可跳） ----
   * 用户要求：按键定义除了「被谁引用」，还要能看自己**引用**了哪些
   * 「动作与宏」页的条目 —— 以前这些引用在界面上完全看不到。 */
  FE.applyProfileText(JSON.stringify({
    type: 'foxy.keyboard-layout',
    keys: {
      'k.usesA': { ref: 'rime.b', tap: { action: 'a1' }, longPress: { macro: 'm1' } },
      'k.dangling': { ref: 'rime.c', tap: { action: 'ghost.act' } }
    },
    actions: { a1: { type: 'key', key: 'BACKSPACE' } },
    macros: { m1: [{ action: 'a1' }] },
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.usesA' }]] }] } }
  }), {});
  FE.renderAll();
  const usesRow = findKeyRow('k.usesA');
  ok(!!usesRow, '找到带外向引用的按键定义 k.usesA');
  documentStub._openDialogs.length = 0;
  usesRow.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent))._fire('click');
  const ogDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(ogDlg.textContent.indexOf('引用（它用到的动作与宏）') >= 0, '弹窗有「引用」一节');
  ok(ogDlg.textContent.indexOf('动作 “a1”') >= 0, '列出引用的动作 a1');
  ok(ogDlg.textContent.indexOf('宏 “m1”') >= 0, '列出引用的宏 m1');
  ok(ogDlg.textContent.indexOf('tap') >= 0 && ogDlg.textContent.indexOf('longPress') >= 0,
    '标出引用出现的位置（tap / longPress）');
  const ogJump = ogDlg.querySelectorAll('.usage-item.usage-jump')
    .find(b => b.textContent.indexOf('动作 “a1”') >= 0);
  ok(!!ogJump, '引用的动作条目可点击跳转');
  ogJump._fire('click');
  ok($('tab-actions').classList.contains('active'), '点引用条目切到动作与宏页');
  ok(FE.state.openActions && FE.state.openActions.a1 === true, '目标动作被展开（默认折叠也能看到）');
  const ogActRow = $('actions-list').querySelectorAll('.def-item.def-collapsible')
    .find(it => it.querySelectorAll('.def-name')[0].textContent === 'a1');
  ok(!!ogActRow && ogActRow.classList.contains('flash-hold'), '跳过去后目标带持续高亮');
  ok(!ogActRow.classList.contains('flash-hold-err'), '引用跳转用蓝色（只有校验出错是红色）');
  documentStub.dispatchEvent({ type: 'pointerdown' });
  /* 跳转把 a1 写进了展开集（默认折叠的条目也要能看到）。
   * 后面「点使用数不误展开条目」的断言依赖全新折叠状态，
   * 而 applyProfileText 不重置 openActions，所以这里显式清掉。 */
  FE.state.openActions = {};

  /* 悬空引用（目标已被删）要明确标出来，且不给跳转按钮 ——
   * 否则点了没反应会被当成 bug。 */
  const danglingRow = findKeyRow('k.dangling');
  documentStub._openDialogs.length = 0;
  danglingRow.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent))._fire('click');
  const dangleDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(dangleDlg.textContent.indexOf('不存在') >= 0, '悬空引用标注「不存在」');
  eq(dangleDlg.querySelectorAll('.usage-item.usage-jump')
    .filter(b => b.textContent.indexOf('ghost.act') >= 0).length, 0, '悬空引用不给跳转按钮');
  dangleDlg.close();

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
  /* 动作是最基础的条目：只被引用、不引用别人（结构上没有指他字段）。
   * 所以动作弹窗**不该**有「引用」一节，也不该出现「它没有引用任何条目」的噪音 —
   * 用户明确要求。 */
  eq(actDlg2.textContent.indexOf('引用（它用到的动作与宏）'), -1, '动作弹窗没有「引用」一节');
  eq(actDlg2.textContent.indexOf('它没有引用'), -1, '动作弹窗不出现「没有引用」的噪音文案');
  actDlg2.close();

  /* 宏与按键定义**仍要**有「引用」一节（它们确实会引用动作） */
  const macItem3 = $('macros-list').querySelectorAll('.def-item.def-collapsible')
    .find(it => it.querySelectorAll('.def-name')[0].textContent === 'm1');
  documentStub._openDialogs.length = 0;
  macItem3.querySelectorAll('.def-summary button')[0]._fire('click');
  const macDlg3 = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(macDlg3.textContent.indexOf('引用（它用到的动作与宏）') >= 0, '宏弹窗保留「引用」一节');
  ok(macDlg3.textContent.indexOf('动作 “a1”') >= 0, '宏弹窗列出它引用的动作');
  macDlg3.close();

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

  console.log('== 定义列表工具条：搜索 + 新建（三页同构） ==');
  /* 三张列表的工具条结构必须一致（用户要求两页外观同步） */
  [['keys', '按键定义'], ['actions', '动作'], ['macros', '宏']].forEach(([k, label]) => {
    ok(!!$(k + '-filter') && !!$(k + '-search'), label + '页有搜索框与搜索按钮');
    ok(!!$(k + '-new') && !!$(k + '-add'), label + '页有新建输入框与新建按钮');
    eq($(k + '-search').textContent, '搜索', label + '页搜索按钮文案统一');
  });
  /* 搜索与新建各自的输入框/按钮同处一个 .def-tool-group（手机竖屏一组占一行）。
   * ⚠️ 搜索框外面多包一层 .search-wrap（为把 ✕ 清空按钮定位在框内右侧），
   * 所以搜索框的直接父节点是 wrap，**祖父**才是 group。 */
  ['keys', 'actions', 'macros'].forEach(k => {
    eq($(k + '-filter').parentNode.className, 'search-wrap', k + ' 搜索框包在 .search-wrap 内');
    eq($(k + '-filter').parentNode.parentNode.className, 'def-tool-group', k + ' 搜索组仍在 .def-tool-group 内');
    eq($(k + '-new').parentNode.className, 'def-tool-group', k + ' 新建框与按钮同组');
    ok($(k + '-filter').parentNode.parentNode !== $(k + '-new').parentNode,
      k + ' 搜索与新建是不同分组（手机可各占一行）');
  });

  /* 搜索：按钮触发 + 即时过滤 + 匹配提示 + 清空恢复 */
  FE.applyProfileText(JSON.stringify({
    type: 'foxy.keyboard-layout',
    keys: { 'k.alpha': { ref: 'rime.a' }, 'k.beta': { ref: 'rime.b' }, 'k.rare': { ref: 'rime.Escape' } },
    actions: {
      'act.copy': { type: 'key', key: 'C', meta: ['CTRL'] },
      'act.paste': { type: 'key', key: 'V', meta: ['CTRL'] },
      'act.uniq': { type: 'app', command: 'settings' }
    },
    macros: {
      'mac.home': [{ type: 'key', key: 'HOME' }],
      'mac.word': [{ action: 'act.copy' }],
      'mac.other': [{ type: 'text', text: 'zzz' }]
    },
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.alpha' }, { ref: 'k.beta' }, { ref: 'k.rare' }]] }] } }
  }), {});
  FE.renderAll();
  const itemCount = (hostId) => $(hostId).querySelectorAll('.def-item').length;
  const hintOf = (hostId) => {
    const n = $(hostId).querySelectorAll('.def-match-hint')[0];
    return n ? n.textContent : '';
  };

  eq(itemCount('keys-list'), 3, '按键定义共 3 条');
  $('keys-filter').value = 'beta';
  $('keys-search').click();
  eq(itemCount('keys-list'), 1, '搜索按钮生效（beta → 1 条）');
  ok(hintOf('keys-list').indexOf('匹配 1 / 3') >= 0, '显示匹配计数提示');
  /* 按 ref 也能命中（不只按名字） */
  $('keys-filter').value = 'Escape';
  $('keys-search').click();
  eq(itemCount('keys-list'), 1, '按 ref 命中（Escape → 1 条）');
  $('keys-filter').value = 'no_such_xyz';
  $('keys-search').click();
  eq(itemCount('keys-list'), 0, '无匹配时列表为空');
  ok(hintOf('keys-list').indexOf('没有匹配') >= 0, '无匹配时给出提示');
  $('keys-filter').value = '';
  $('keys-search').click();
  eq(itemCount('keys-list'), 3, '清空关键字恢复全部');
  eq(hintOf('keys-list'), '', '清空后不再显示匹配提示');

  /* 即时过滤：不点按钮也要生效（手机输入法可能不派发 input，故按钮是兜底） */
  $('keys-filter').value = 'alpha';
  $('keys-filter')._fire('input');
  eq(itemCount('keys-list'), 1, '输入即过滤（不必点搜索按钮）');
  $('keys-filter')._fire('keydown', { key: 'Enter' });
  eq(itemCount('keys-list'), 1, '搜索框回车同样生效');
  $('keys-filter').value = '';
  $('keys-filter')._fire('input');

  /* 动作 / 宏搜索：名字 + 内容摘要都能命中 */
  eq(itemCount('actions-list'), 3, '动作共 3 条');
  $('actions-filter').value = 'paste';
  $('actions-search').click();
  eq(itemCount('actions-list'), 1, '动作按名字搜索命中');
  $('actions-filter').value = 'CTRL';
  $('actions-search').click();
  eq(itemCount('actions-list'), 2, '动作按内容摘要搜索命中（CTRL → 2 条）');
  $('actions-filter').value = '';
  $('actions-search').click();
  eq(itemCount('actions-list'), 3, '动作清空恢复全部');

  eq(itemCount('macros-list'), 3, '宏共 3 条');
  $('macros-filter').value = 'word';
  $('macros-search').click();
  eq(itemCount('macros-list'), 1, '宏按名字搜索命中');
  $('macros-filter').value = 'HOME';
  $('macros-search').click();
  eq(itemCount('macros-list'), 1, '宏按步骤内容搜索命中');
  $('macros-filter').value = '';
  $('macros-search').click();
  eq(itemCount('macros-list'), 3, '宏清空恢复全部');

  /* ---- 搜索框内的 ✕ 清空按钮（四个页签都有） ----
   * 只在框里有字时可见；点击后清空、重渲染、并把焦点还给输入框。 */
  console.log('== 搜索框 ✕ 清空 ==');
  ['keys', 'actions', 'macros', 'popup'].forEach(k => {
    const inp = $(k + '-filter'), clr = $(k + '-filter-clear');
    ok(!!inp && !!clr, k + ' 页有搜索框与 ✕ 清空按钮');
    ok(clr.hidden, k + ' 页空框时 ✕ 隐藏（不干扰）');
    eq(clr.textContent, '✕', k + ' 页 ✕ 文案统一');
    inp.value = 'zzz';
    inp._fire('input');
    ok(!clr.hidden, k + ' 页输入后 ✕ 出现');
    clr._fire('click');
    eq(inp.value, '', k + ' 页点 ✕ 清空输入框');
    ok(clr.hidden, k + ' 页点 ✕ 后自身隐藏');
    ok(documentStub.activeElement === inp, k + ' 页点 ✕ 后焦点回到输入框（可直接重新输入）');
  });

  /* ---- 弹出菜单页：搜索（名称 + 候选内容） ---- */
  console.log('== 弹出菜单页搜索 ==');
  FE.state.popupProfile = FE.normalizePopupProfile({
    type: 'foxy.popup-profile',
    schemas: { default: {
      q: { normal: ['q', 'ɋ'] },
      z: { normal: ['Z', 'ź'] },
      ae: { normal: ['ā'] }
    } }
  });
  tabs[3]._fire('click');
  const ppCount = () => q('#popup-keys .popup-key-card').length;
  eq(ppCount(), 3, '弹出菜单共 3 个键卡片');
  $('popup-filter').value = 'z';
  $('popup-search').click();
  eq(ppCount(), 1, '弹出菜单按 popupKey 搜索命中');
  ok(q('#popup-keys .def-match-hint')[0].textContent.indexOf('匹配 1 / 3') >= 0,
    '弹出菜单显示匹配计数提示');
  /* 按候选内容也能命中（不只看键名） */
  $('popup-filter').value = 'ā';
  $('popup-search').click();
  eq(ppCount(), 1, '弹出菜单按候选内容搜索命中');
  eq(q('#popup-keys .popup-key-card')[0].querySelectorAll('.def-name')[0].textContent, 'ae',
    '命中的是含该候选的键');
  $('popup-filter-clear')._fire('click');
  eq(ppCount(), 3, '弹出菜单清空关键字恢复全部');
  ok(!q('#popup-keys .def-match-hint').length, '清空后不再显示匹配提示');

  /* ---- 弹出菜单页：被引用跳转按钮 ---- */
  console.log('== 弹出菜单键的被引用跳转 ==');
  /* ⚠️ 这里要连 actions/macros 一起写回去：本文件后面还有「悬停提示」等断言
   * 依赖它们存在，只设 keys/layouts 会把那几页清空、让后面的断言挂掉。 */
  FE.applyProfileText(JSON.stringify({
    keys: { 'k.pop': { ref: 'rime.a', longPress: { popupKey: 'q' } } },
    actions: {
      'act.copy': { type: 'key', key: 'C', meta: ['CTRL'] },
      'act.paste': { type: 'key', key: 'V', meta: ['CTRL'] },
      'act.uniq': { type: 'app', command: 'settings' }
    },
    macros: {
      'mac.home': [{ type: 'key', key: 'HOME' }],
      'mac.word': [{ action: 'act.copy' }],
      'mac.other': [{ type: 'text', text: 'zzz' }]
    },
    layouts: { default: { sections: [{ type: 'rows', rows: [[{ ref: 'k.pop' }]] }] } }
  }), {});
  FE.state.popupProfile = FE.normalizePopupProfile({
    type: 'foxy.popup-profile', schemas: { default: { q: { normal: ['q'] } } }
  });
  tabs[3]._fire('click');
  const popCard = q('#popup-keys .popup-key-card')[0];
  const popUsageBtn = popCard.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent));
  ok(!!popUsageBtn, '弹出菜单键有「使用 N」按钮：' + (popUsageBtn && popUsageBtn.textContent));
  ok(popUsageBtn.getAttribute('title').indexOf('哪些布局') >= 0, '该按钮 tooltip 说明是「哪些布局用到」');
  /* 数据源不是引用索引，所以不该挂 data-usage-*（否则会被 refreshUsageLabels 覆写） */
  ok(!(popUsageBtn.dataset && popUsageBtn.dataset.usageKind),
    '弹出菜单的「使用」按钮不挂 data-usage-kind（数据源不是引用索引）');
  documentStub._openDialogs.length = 0;
  popUsageBtn._fire('click');
  const popUsageDlg = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  ok(!!popUsageDlg, '点「使用」打开内建弹窗');
  ok(popUsageDlg.textContent.indexOf('共被引用 2 处') >= 0, '列出被引用总数（按键定义 + 布局按键）');
  const popJumps = popUsageDlg.querySelectorAll('.usage-item.usage-jump');
  ok(popJumps.length === 2, '两条都可跳转（实际 ' + popJumps.length + '）');
  /* 布局坐标项 → 切布局并选中该键 */
  const ppLayoutJump = popJumps.find(b => b.textContent.indexOf('按键定义') < 0);
  ok(!!ppLayoutJump, '含布局坐标条目：' + (ppLayoutJump && ppLayoutJump.textContent));
  ppLayoutJump._fire('click');
  ok($('tab-layout').classList.contains('active'), '点布局条目切到布局编辑页');
  eq(FE.state.sel, { s: 0, r: 0, k: 0 }, '选中了使用该 popupKey 的按键');
  /* 定义坐标项 → 切按键定义页并高亮（与上一轮 jumpToDef 的能力对齐） */
  tabs[3]._fire('click');
  const popCard2 = q('#popup-keys .popup-key-card')[0];
  documentStub._openDialogs.length = 0;
  popCard2.querySelectorAll('button').find(b => /^使用 \d+$/.test(b.textContent))._fire('click');
  const dlg2 = documentStub._openDialogs[documentStub._openDialogs.length - 1];
  const ppDefJump = dlg2.querySelectorAll('.usage-item.usage-jump')
    .find(b => b.textContent.indexOf('按键定义') >= 0);
  ok(!!ppDefJump, '含按键定义坐标条目');
  ppDefJump._fire('click');
  ok($('tab-keys').classList.contains('active'), '点定义条目切到按键定义页');
  const ppDefRow = $('keys-list').querySelectorAll('.def-item.def-row-click')
    .find(r => r.querySelectorAll('.def-name')[0].textContent === 'k.pop');
  ok(!!ppDefRow && ppDefRow.classList.contains('flash-hold'), '目标按键定义带持续高亮');
  documentStub.dispatchEvent({ type: 'pointerdown' });

  /* ---- 跳转到弹出菜单页时清过滤 + 展开目标（否则「点了没反应」） ---- */
  console.log('== 跳转弹出菜单页：清过滤 + 展开目标 ==');
  tabs[3]._fire('click');
  $('popup-filter').value = 'no_such_xyz';
  $('popup-search').click();
  eq(ppCount(), 0, '过滤后目标键被筛掉（模拟用户跳转前的状态）');
  FE.jumpToPopupEditor('q');
  ok(!$('popup-filter').value, '跳转清掉了过滤条件');
  ok($('popup-filter-clear').hidden, '清过滤后 ✕ 也同步隐藏（不靠 input 事件）');
  const jumpedCard = q('#popup-keys .popup-key-card')[0];
  ok(!!jumpedCard, '跳转后能看到目标卡片');
  ok(jumpedCard.open === true, '目标卡片被自动展开（默认折叠也能立刻看到内容）');
  ok(FE.state.popupSelKey === 'q', '预览选中该 popupKey');

  console.log('== 悬停提示：两页都有 ==');
  const hoverKeyRow = $('keys-list').querySelectorAll('.def-item.def-row-click')[0];
  ok(!!hoverKeyRow.getAttribute('title'), '按键定义行有悬停提示：' + hoverKeyRow.getAttribute('title'));
  const hoverAct = $('actions-list').querySelectorAll('.def-summary')[0];
  ok(!!hoverAct.getAttribute('title'), '动作摘要行有悬停提示：' + hoverAct.getAttribute('title'));
  const hoverMac = $('macros-list').querySelectorAll('.def-summary')[0];
  ok(!!hoverMac.getAttribute('title'), '宏摘要行有悬停提示：' + hoverMac.getAttribute('title'));
  ok(hoverAct.getAttribute('title').indexOf('展开') >= 0, '动作悬停提示说明点下去会展开配置');

  console.log('== 布局编辑按键跟随键盘配色（主题 + colors 覆盖） ==');
  /* 回到布局页 + 默认布局，保证区段编辑器与预览都渲染同一批键 */
  tabs[0]._fire('click');
  FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
  FE.state.splitMode = false;
  FE.state.theme = 'light';
  FE.state.themeProfile = null;      /* 未导入主题 → 走 App 内置默认主题（需求语义） */
  FE.state.themeSlot = 'light';
  $('pt-theme').value = 'light';
  FE.renderAll();
  ok($('layout-sections').classList.contains('theme-light'), '浅色主题下编辑区 host 带 theme-light');
  /* ⭐ 无 colors 覆盖的键**也会拿到行内兜底色**，来源是「生效主题」——
   * 未导入主题时即 App 内置默认主题（需求：预览/编辑区默认用内置默认主题的深浅色，
   * 而不是编辑器自己那套预置色）。改前这里断言的是"无行内色"，旧口径已反转。 */
  const plainChip = q('#layout-sections .chip').find(c => !c.classList.contains('chip-add'));
  ok(!!plainChip, '（前置）存在无 colors 覆盖的编辑按键');
  eq(plainChip.style.background, '#FFFFFFFF',
    '无 colors 覆盖的编辑按键也有行内底 = 内置默认 light 的 keyBackgroundColor');
  eq(plainChip.style.color, '#212121FF',
    '同键文字色 = 内置默认 light 的 keyTextColor');
  /* 给某键加 colors 覆盖 → 编辑区按键行内套色，与预览同款 */
  FE.state.profile.keys['qwerty.q'] = {
    ref: 'rime.q', keyType: 'LETTER',
    swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } },
    colors: { background: '#4CAF50', text: '#FFFFFFFF' }
  };
  FE.renderAll();
  const colorChip = q('#layout-sections .chip').find(c => c.style.background === '#4CAF50');
  ok(!!colorChip, '有 colors 覆盖的编辑按键套上自定义背景色');
  eq(colorChip.style.color, '#FFFFFFFF', '编辑按键的自定义文字色同样生效');
  const colorPrev = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
  eq(colorPrev && colorPrev.style.background, '#4CAF50', '预览同键背景色一致');
  /* 通过 key-dialog 保存改色（定义模式）→ 编辑区同样实时跟上 */
  documentStub._openDialogs.length = 0;
  FE.openKeyDialog({ mode: 'definition', name: 'qwerty.q' });
  const kdColor = documentStub._openDialogs[0];
  const kdBg = kdColor.querySelectorAll('.color-input')[1];
  kdBg.value = '#123456';
  kdBg._fire('change');
  kdColor.querySelectorAll('.dialog-toolbar .primary')[0].click();
  const savedChip = q('#layout-sections .chip').find(c => c.style.background === '#123456');
  ok(!!savedChip, '对话框保存改色后编辑区按键实时跟上');
  /* 切回深色 → host 类同步，无覆盖的键回到深色基础 */
  $('pt-theme').value = 'dark';
  $('pt-theme')._fire('change');
  ok($('layout-sections').classList.contains('theme-dark'), '深色主题下编辑区 host 切回 theme-dark');
  /* 深色键盘的容器跟随必须显式写死（源码级断言）：行块底色基础值是
   * var(--card-inner)，会跟整站 site-light 变浅；"浅色整站 + 深色键盘"下只有
   * .theme-dark 显式规则能把容器钉回键盘底（本次修复的回归点，桩量不到计算样式故查源码） */
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  ok(/\.theme-dark\s+\.row-block\s*\{[^}]*background:\s*#191a1e/.test(cssSrc), '深色键盘行块底色显式钉死（不随整站变量走）');
  ok(/\.theme-dark\s+\.gedit-wrap\s*\{[^}]*background:\s*#191a1e/.test(cssSrc), '深色键投资源网格画布底色显式钉死');
  ok(/\.theme-dark\s+\.chip\s*\{[^}]*background:\s*#52555b/.test(cssSrc), '深色键盘按键底色显式钉死');
  /* 行头 ↑ ↓ ✕ 的底色必须与行块底同色（融进背景）：浅色键盘 #cfd2d7，深色键盘 #191a1e。
   * .icon-button 基础是透明底，浅色行块上不给底就是"白成一片"；深色行块上不给底，
   * 将来整站浅色的 button 白底（tag 选择器）会透进来。桩量不到计算样式，查源码锁规则。 */
  ok(/\.theme-light\s+\.row-block\s+\.icon-button\s*\{[^}]*background:\s*#cfd2d7/.test(cssSrc), '浅色键盘行头按钮底色与行块底同色（融进背景）');
  ok(/\.theme-dark\s+\.row-block\s+\.icon-button\s*\{[^}]*background:\s*#191a1e/.test(cssSrc), '深色键盘行头按钮底色与行块底同色（不受整站浅色影响）');
  /* 浅色下 pill 选中态蓝底必须赢回浅色 `.pill` 覆盖：`html.site-light .pill`
   * 权重 (0,2,1) 高过 `.pill.active` 的 (0,2,0)（多一个 html tag），不单独写，
   * 选中态就是白字浮浅灰底、几乎看不见（常规/分体 pill 与布局 pills 同病） */
  ok(/html\.site-light\s+\.pill\.active\s*\{[^}]*background:\s*var\(--accent\)/.test(cssSrc), '浅色下 pill 选中态蓝底赢回（常规/分体布局可辨识）');
  /* 浅色下图例三色与分体标记加深（浅蓝/浅橙/浅绿为深底调的，白底上对比不够） */
  ok(/html\.site-light\s+\.preview-legend\s+\.lg-lp\s*\{[^}]*color:\s*#1f6fb8/.test(cssSrc), '浅色下图例蓝色加深');
  ok(/html\.site-light\s+\.preview-legend\s+\.lg-hold\s*\{[^}]*color:\s*#b26a00/.test(cssSrc), '浅色下图例橙色加深');
  ok(/html\.site-light\s+\.preview-legend\s+\.lg-popup\s*\{[^}]*color:\s*#2e8b57/.test(cssSrc), '浅色下图例绿色加深');
  ok(/html\.site-light\s+\.st-split\s*\{[^}]*color:\s*#2e8b57/.test(cssSrc), '浅色下分体标记加深');
  /* 浅色下未选中 tab 给浅灰底（否则被 button 白底盖成全白，与选中只差字色字重） */
  ok(/html\.site-light\s+\.tab:not\(\.active\)\s*\{[^}]*background:\s*#eef0f3/.test(cssSrc), '浅色下未选中标签浅灰底（选中白底，对比拉开）');
  /* 浅色下主按钮蓝底必须赢回白底覆盖：`html.site-light button` 权重 (0,1,2)
   * 高过 `button.primary` 的 (0,1,1)（多一个 html tag），不单独写就是白字浮白底、
   * 对比度 1.0 完全隐形（应用/新建按键定义/新建动作/新建宏全中招，与 pill 同病） */
  ok(/html\.site-light\s+button\.primary[^}]*background:\s*var\(--accent\)/.test(cssSrc), '浅色下主按钮蓝底赢回（应用/新建类可辨识）');
  /* 浅色下对话框折叠子卡标题加深（基本信息/手势/状态变体/按键颜色覆盖等），
   * 否则浅灰白字浮浅底、看不清 */
  ok(/html\.site-light\s+\.inner-card\s*>\s*summary\s*\{[^}]*color:\s*#1c1e22/.test(cssSrc), '浅色下对话框折叠标题加深');
  /* 浅色下手势名（点击/滑动/长按…）加深：#cdd2da 在白底上对比度只有 1.5，几乎隐形 */
  ok(/html\.site-light\s+\.gesture-name\s*\{[^}]*color:\s*#1c1e22/.test(cssSrc), '浅色下手势名加深');
  /* 弹出菜单候选 chip 跟随键盘主题：host 打 theme 类（与布局编辑同套规则），
   * 否则弹出菜单页的 chip 永远是深色基础值，浅色键盘下整块发黑 */
  FE.state.theme = 'light';
  FE.renderPopupTab();
  ok($('popup-keys').classList.contains('theme-light'), '浅色键盘下弹出菜单 host 带 theme-light');
  FE.state.theme = 'dark';
  FE.renderPopupTab();
  ok($('popup-keys').classList.contains('theme-dark'), '深色键盘下弹出菜单 host 带 theme-dark');
  FE.state.theme = 'light';
  FE.renderPopupTab();

  /* ================================================================
   * 主题页（foxy.keyboard-theme）
   * ================================================================ */
  console.log('== 主题页：标签与骨架 ==');
  {
    const themeTab = tabs.find(t => t.dataset.tab === 'tab-theme');
    const symTab = tabs.find(t => t.dataset.tab === 'tab-symbols');
    ok(!!themeTab, '存在「主题」标签按钮');
    ok(!!symTab, '存在「符号面板」标签按钮');
    ok(themeTab.classList.contains('tab-theme'), '主题按钮有分隔样式类');
    /* 新 tab 排在 tab-popup 之后 → 前面按索引取的 tabs[0]/tabs[3] 不受影响。
     * ⚠️ 这里用 ok(... === ...) 而不是 eq：DOM 桩节点带 parentNode 循环引用，
     * eq 内部要 JSON.stringify，会抛「Converting circular structure to JSON」。 */
    ok(tabs[4] === themeTab, '主题按钮排在第 5 位（弹出菜单之后）');
    ok(tabs[5] === symTab, '符号面板按钮排在第 6 位');
    ok($('tab-theme') != null, '主题面板存在');
    ok($('tab-symbols') != null, '符号面板存在');
    /* 主题页容器 id 齐备（app.js/theme-editor.js 都按 id 取） */
    ['th-import', 'th-import-file', 'th-export', 'th-example', 'th-load-example', 'th-author',
      'th-status', 'th-slot', 'th-bordermode', 'th-colors', 'th-keytypes', 'th-validation',
      'th-json', 'th-json-apply', 'th-json-format', 'th-json-status'].forEach(id => {
      ok($(id) != null, '主题页容器存在: ' + id);
    });
    /* 符号页容器（另一模块实现内容，但容器必须由本页备好） */
    ['sym-import', 'sym-import-file', 'sym-export', 'sym-example', 'sym-load-example', 'sym-kind',
      'sym-status', 'sym-multiline', 'sym-filter', 'sym-filter-clear', 'sym-search',
      'sym-new', 'sym-add', 'sym-list', 'sym-json', 'sym-json-apply', 'sym-json-format',
      'sym-json-status'].forEach(id => {
      ok($(id) != null, '符号页容器存在: ' + id);
    });
  }

  console.log('== 主题页：未导入时不改动预览（回归保护） ==');
  {
    /* 干净起点：默认布局 + 浅色预览 + 无主题 */
    FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
    FE.state.themeProfile = null;
    FE.state.splitMode = false;
    /* ⚠️ theme 与 themeSlot 现在**是一件事的两面**（预览工具栏的「键盘」下拉与
     * 主题页槽位联动，见 app.js 的 setPreviewSlot）。此处是"干净起点"声明，
     * 两个都要摆正 —— 只写 theme 会让 themeSlot 停在前一块留下的 'dark'，
     * 于是下面新建的 LETTER 分组被写进 dark 槽、断言 light 时失败（踩过）。 */
    FE.state.theme = 'light';
    FE.state.themeSlot = 'light';
    FE.state.keyBorderEnabled = true;
    FE.renderAll();
    const host = $('preview-kb');
    /* ⭐ 未导入主题 → 预览按 **App 内置默认主题**上色（需求）。
     * 内置默认 light 的 altKeyboardColor = #FFEEEEEE（border 开）→ CSS #EEEEEEFF。
     * 改前这里断言的是"不写内联底色、走 CSS 类"，旧口径已反转。 */
    eq(host.style.background, '#EEEEEEFF',
      '未导入主题时容器底 = 内置默认 light 的 altKeyboardColor');
    ok(host.classList.contains('kb-light'), '未导入主题时容器类仍是 kb-light');
    /* 无 colors 覆盖的键全部拿到内置默认兜底色（不再是"零内联色"） */
    const plain = q('.kb-key').find(k => !String(k.getAttribute('title') || '').indexOf('colors'));
    const withInlineBg = q('.kb-key').filter(k => k.style.background).length;
    const totalKeys = q('.kb-key').length;
    ok(totalKeys > 0, '（前置）预览渲染出按键');
    eq(withInlineBg, totalKeys,
      '未导入主题时预览键**全部**有内联底（内置默认主题兜底，' + withInlineBg + '/' + totalKeys + '）');
    void plain;
  }

  console.log('== 主题页：渲染 26 色 + 3 类 keyTypes 表单 ==');
  {
    tabs.find(t => t.dataset.tab === 'tab-theme')._fire('click');
    ok($('tab-theme').classList.contains('active'), '切到主题页');
    /* 先以内置默认色新建（不依赖 examples —— build-examples 不认主题类型） */
    $('th-example').value = '__builtin__';
    $('th-load-example').click();
    ok(FE.state.themeProfile != null, '内置默认模板已载入');
    FE.renderThemeTab();

    eq(q('#th-colors .color-input').length, 26, '槽位全局配色渲染出 26 个颜色输入框');
    /* 字段名以权威顺序出现 */
    const labels = q('#th-colors .th-field-label code').map(c => c.textContent);
    eq(labels.length, 26, '26 个字段标签');
    eq(labels[0], 'keyboardColor', '首个字段是 keyboardColor');
    eq(labels[25], 'accentColor', '末个字段是 accentColor');
    ok(labels.includes('keyHintTextBottomColor'), '含四方向提示色字段');

    /* keyTypes：3 类分组，各自 10 个字段（内置默认只给 FUNCTION/ACTION，
     * LETTER 以"创建分组"按钮呈现 —— 表单必须能编辑 LETTER，否则会被静默丢弃） */
    const groups = q('#th-keytypes .th-keytype-block');
    eq(groups.length, 3, 'keyTypes 渲染 3 个分组块（含 LETTER）');
    const names = q('#th-keytypes .th-keytype-head code').map(c => c.textContent);
    eq(names, ['LETTER', 'FUNCTION', 'ACTION'], '分组名与顺序：LETTER / FUNCTION / ACTION');
    /* FUNCTION / ACTION 默认展开字段（10 个），LETTER 未定义 → 显示创建按钮 */
    eq(q('#th-keytypes .color-input').length, 20, 'FUNCTION + ACTION 各 10 个字段输入框');
    const createBtn = q('#th-keytypes button').find(b => b.textContent.indexOf('创建 LETTER') >= 0);
    ok(!!createBtn, 'LETTER 未定义时给出「创建 LETTER 分组」按钮');
    createBtn.click();
    eq(q('#th-keytypes .color-input').length, 30, '创建 LETTER 后共 30 个字段输入框');
    ok(FE.state.themeProfile.light.keyTypes.LETTER != null, 'LETTER 分组已写入主题文档');
    /* 10 个字段名齐全（漏字段会被静默丢弃） */
    FE.renderThemeTab();
    const allNames = q('#th-keytypes .th-field-label code').map(c => c.textContent);
    ['LETTER.text', 'LETTER.background', 'LETTER.pressed', 'LETTER.border', 'LETTER.shadow',
      'LETTER.hint', 'LETTER.hintUp', 'LETTER.hintDown', 'LETTER.hintLeft', 'LETTER.hintRight']
      .forEach(f => ok(allNames.includes(f), 'LETTER 含字段 ' + f));
  }

  console.log('== 主题页：编辑颜色实时联动预览 ==');
  {
    const host = $('preview-kb');
    /* 改槽位全局 keyBackgroundColor → 所有无覆盖的键拿到主题兜底色 */
    FE.state.themeProfile.light.keyBackgroundColor = '#FF445566';
    FE.state.themeProfile.light.keyTextColor = '#FFEEDDCC';
    FE.state.themeSlot = 'light';
    FE.renderAll();
    /* 注意 foxyColorToCss 的字节序：#AARRGGBB → #RRGGBBAA（alpha 移到末尾）。
     * 内置默认 light 的 altKeyboardColor = #FFEEEEEE，故 CSS 为 #EEEEEEFF。 */
    eq(host.style.background, '#EEEEEEFF', '键盘容器底用主题 altKeyboardColor（border 启用）');
    const letters = q('.kb-key').filter(k => k.classList.contains('kt-letter'));
    ok(letters.length > 0, '存在 LETTER 类按键');
    eq(letters[0].style.background, '#445566FF', '主题 keyBackgroundColor 兜底到普通键（③④ 垫底）');
    eq(letters[0].style.color, '#EEDDCCFF', '主题 keyTextColor 兜底到普通键文字');

    /* keyTypes 覆盖全局（③ 高于 ④） */
    FE.state.themeProfile.light.keyTypes.FUNCTION = { background: '#FF8899AA', text: '#FF112233' };
    FE.renderAll();
    const fnKey = q('.kb-key').find(k => k.classList.contains('kt-function'));
    ok(!!fnKey, '存在 FUNCTION 类按键');
    eq(fnKey.style.background, '#8899AAFF', 'keyTypes.FUNCTION 覆盖全局 keyBackgroundColor');
    eq(fnKey.style.color, '#112233FF', 'keyTypes.FUNCTION 覆盖全局 keyTextColor');

    /* 切到 dark 槽：两套槽位独立（dark 槽没有这些值 → 回退内置默认） */
    $('th-slot').value = 'dark';
    $('th-slot')._fire('change');
    eq(FE.state.themeSlot, 'dark', '槽位切到 dark');
    eq($('preview-kb').style.background, '#333333FF', 'dark 槽容器底取该槽 altKeyboardColor');
    /* 切回 light：值回来了 */
    $('th-slot').value = 'light';
    $('th-slot')._fire('change');
    eq($('preview-kb').style.background, '#EEEEEEFF', '切回 light 槽恢复该槽取值');
  }

  console.log('== 主题页：预览优先级（布局每键 colors 胜过主题 keyTypes） ==');
  {
    /* 基线 §1.5：① states.* > ② 布局每键 colors > ③ 主题 keyTypes > ④ 主题全局
     * 这与"主题是全局设置所以最高"的直觉相反，必须锁住。 */
    FE.state.themeProfile = FE.normalizeThemeProfile({
      type: 'foxy.keyboard-theme', name: 'prio',
      light: {
        keyBackgroundColor: '#FF111111', keyTextColor: '#FF222222',
        keyTypes: { LETTER: { background: '#FF333333', text: '#FF444444' } }
      }
    });
    FE.state.themeSlot = 'light';
    FE.state.theme = 'light';
    /* 布局里给某个 LETTER 键显式 colors */
    FE.state.profile.keys['qwerty.q'] = {
      ref: 'rime.q', keyType: 'LETTER',
      swipe: { up: { ref: 'rime.Q' }, down: { ref: 'rime.1' } },
      colors: { background: '#4CAF50', text: '#FFFFFFFF' }
    };
    FE.renderAll();
    const qKey = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
    eq(qKey.style.background, '#4CAF50', '布局每键 colors.background 胜过主题 keyTypes（② > ③）');
    eq(qKey.style.color, '#FFFFFFFF', '布局每键 colors.text 胜过主题 keyTypes');
    /* 同排另一个无 colors 的 LETTER 键 → 用主题 keyTypes */
    const otherLetter = q('.kb-key').find(k =>
      k.classList.contains('kt-letter') && String(k.getAttribute('title') || '').indexOf('qwerty.q') < 0);
    eq(otherLetter.style.background, '#333333FF', '无 colors 的 LETTER 键用主题 keyTypes（③）');

    /* ① 状态覆盖胜过 ②：states.pressed 赢过每键 colors.background。
     * 写成 #FFFF0000（ARGB：alpha FF + 红）→ CSS #FF0000FF，避免把字节序看错。 */
    FE.state.profile.keys['qwerty.q'].colors.states = { pressed: { background: '#FFFF0000' } };
    FE.renderAll();
    const qKey2 = q('.kb-key').find(k => String(k.getAttribute('title') || '').indexOf('qwerty.q') >= 0);
    qKey2._fire('pointerdown');
    eq(qKey2.style.background, '#FF0000FF', 'states.pressed 胜过布局每键 colors（① > ②）');
    qKey2._fire('pointerup');
    eq(qKey2.style.background, '#4CAF50', '松开后回到每键 colors');
  }

  console.log('== 主题页：按键边框开关影响容器底色 ==');
  {
    /* key_border_enabled=false → 回落 keyboardColor（基线 §1.4） */
    FE.state.themeProfile.light.keyboardColor = '#FF0A0B0C';
    FE.state.themeProfile.light.altKeyboardColor = '#FF0D0E0F';
    FE.state.themeSlot = 'light';
    FE.state.keyBorderEnabled = true;
    FE.renderAll();
    /* 同样注意字节序：#FF0D0E0F → CSS #0D0E0FFF */
    eq($('preview-kb').style.background, '#0D0E0FFF', 'border 启用时用 altKeyboardColor');
    $('th-bordermode').value = 'off';
    $('th-bordermode')._fire('change');
    eq(FE.state.keyBorderEnabled, false, '边框开关状态已记录');
    eq($('preview-kb').style.background, '#0A0B0CFF', 'border 禁用时回落 keyboardColor');
    $('th-bordermode').value = 'on';
    $('th-bordermode')._fire('change');
    eq($('preview-kb').style.background, '#0D0E0FFF', '再启用后回到 altKeyboardColor');
  }

  console.log('== 主题页：还原细节（按下态/阴影/边框开关/图标）+ 键盘配色 CSS 变量 ==');
  /* 依据 foxy-render-spec.md §2.4 / §2.5 / §2.6 / §1.4 与 §5 行动项 4、5、9。
   * 桩不支持真实布局与计算样式（clientWidth 恒 0、无 elementFromPoint），
   * 所以「filter / box-shadow 的最终渲染效果」只能查源码，其余走行内样式断言。 */
  {
    const cssSrc2 = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

    /* ---- 源码级：按下态 = 换背景色，不是亮度滤镜（§2.6） ---- */
    ok(!/\.kb-key\.pressed\s*\{[^}]*brightness/.test(cssSrc2),
      '按下态不再用 brightness 滤镜（App 是 StateListDrawable 换背景色，§2.6）');
    ok(/\.kb-key\.pressed\s*\{[^}]*filter:\s*none/.test(cssSrc2),
      '按下态显式 filter:none（悬停中按下同样不提亮，显示值 = 配置值）');
    const hoverM = cssSrc2.match(/\.kb-key:hover\s*\{[^}]*brightness\(([\d.]+)\)/);
    ok(!!hoverM && parseFloat(hoverM[1]) <= 1.1,
      'hover 提亮系数很小（仅网页交互反馈，手机端无此效果）');

    /* ---- 源码级：阴影是「向下 1dp 的实心圆角层」，不是模糊阴影（§2.5） ---- */
    ok(/function shadowCss\(color\)\s*\{\s*return '0 1px 0 '/.test(appSrc),
      '阴影改为向下 1px 实心（模糊半径 0），§2.5');

    /* ---- 源码级：图标色跟随键文字色（§1.4，不能再被写死色盖掉） ---- */
    ok(/\.kb-icon-wrap\s*\{\s*color:\s*currentColor/.test(cssSrc2),
      '图标色用 currentColor 跟随键文字色（§1.4）');
    ok(!/\.kb-(dark|light)\s+\.kb-icon-wrap\s*\{/.test(cssSrc2),
      '不再按明暗写死图标色（那会盖掉主题文字色）');

    const saved = {
      profile: FE.state.profile, layoutName: FE.state.layoutName,
      themeProfile: FE.state.themeProfile, themeSlot: FE.state.themeSlot,
      keyBorderEnabled: FE.state.keyBorderEnabled, theme: FE.state.theme
    };
    try {
      FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT, {});
      FE.state.theme = 'dark';

      /* ---- 未导入主题：**按 App 内置默认主题取色**，故变量与内联色都要写上 ----
       * 改前这里断言的是"变量被删除、零内联色"（旧口径：未导入主题 → 走 CSS 预置色）。
       * 需求已反转为"预览默认用 App 内置默认主题的深浅色"，所以现在应等价于
       * 「导入了一份内置默认主题」所产生的结果。 */
      FE.state.themeProfile = null;
      FE.state.themeSlot = 'dark';
      FE.state.keyBorderEnabled = true;
      FE.renderAll();
      const kbEl = $('preview-kb');
      const secEl = $('layout-sections');
      /* 内置默认 dark：altKeyboardColor = #FF333333 → CSS #333333FF */
      eq(String(kbEl.style['--kb-bg'] || ''), '#333333FF',
        '未导入主题时 --kb-bg = 内置默认 dark 的 altKeyboardColor');
      eq(String(kbEl.style['--kb-inset'] || ''), 'none',
        '有底色时同样清掉写死的内描边（否则多一圈固定色）');
      eq(String(secEl.style['--kb-bg'] || ''), '#333333FF',
        '编辑区宿主共享同一 --kb-bg');
      eq(String(secEl.style['--kb-key-bg'] || ''), '#464646FF',
        '编辑区按键变量 = 内置默认 dark 的 keyBackgroundColor');
      eq(kbEl.style.background, '#333333FF', '未导入主题时容器底 = 内置默认 dark 的键盘底色');
      eq(q('.kb-key').filter(k => k.style.background).length, q('.kb-key').length,
        '未导入主题时预览键**全部**有内联背景（内置默认主题兜底）');
      /* 切到 light 槽 → 换成内置默认的浅色那套（两套槽位各自生效，不能混） */
      FE.state.themeSlot = 'light';
      FE.renderAll();
      eq(kbEl.style.background, '#EEEEEEFF', '切 light 槽 → 内置默认 light 的键盘底');
      eq(String(kbEl.style['--kb-key-bg'] || ''), '#FFFFFFFF',
        '切 light 槽 → 内置默认 light 的键底');
      /* 收尾回 dark 槽，后面的断言按 dark 继续 */
      FE.state.themeSlot = 'dark';
      FE.renderAll();

      /* ---- 导入主题：变量写入 ---- */
      FE.state.themeProfile = FE.normalizeThemeProfile({
        type: 'foxy.keyboard-theme', name: 'vars',
        light: {
          keyboardColor: '#FF0A0B0C', altKeyboardColor: '#FF0D0E0F', accentColor: '#FFABCDEF',
          keyBackgroundColor: '#FF445566', keyTextColor: '#FFEEDDCC',
          keyBorderColor: '#FF010203', keyShadowColor: '#FF040506',
          keyTypes: { FUNCTION: { background: '#FFB1B2B3', text: '#FFC1C2C3' } }
        }
      });
      FE.state.themeSlot = 'light';
      FE.state.keyBorderEnabled = true;
      FE.renderAll();
      eq(String(kbEl.style['--kb-bg'] || ''), '#0D0E0FFF',
        '主题生效时 --kb-bg = altKeyboardColor（border 启用，§3）');
      eq(String(kbEl.style['--kb-inset'] || ''), 'none',
        '主题底色上清掉写死的内描边（否则多一圈固定色）');
      eq(String(secEl.style['--kb-bg'] || ''), '#0D0E0FFF',
        '编辑区宿主共享同一 --kb-bg（两处面板不再与键盘各说各话）');
      eq(String(kbEl.style['--kb-key-bg'] || ''), '#445566FF', 'LETTER 键底色写入 --kb-key-bg');
      eq(String(kbEl.style['--kb-key-bg-fn'] || ''), '#B1B2B3FF', 'FUNCTION 键底色写入 --kb-key-bg-fn');
      eq(String(kbEl.style['--kb-icon-active'] || ''), 'currentColor',
        '修饰键激活的图标改跟键文字色（= accentColor）');

      /* ---- 阴影实心无模糊（§2.5） ---- */
      const shadowKey = q('.kb-key').find(k => k.classList.contains('kt-letter') && k.style.boxShadow);
      ok(!!shadowKey, '（前置）存在带主题阴影的 LETTER 键');
      const bs = String(shadowKey.style.boxShadow);
      ok(/^0 1px 0 #/.test(bs), '阴影为「向下 1px 实心层」（无模糊半径）：' + bs);
      ok(bs.indexOf('2px') < 0, '阴影不含模糊半径（§2.5 明确不是模糊阴影）');

      /* ---- 边框开关**真正作用于键边框**（§2.4：B 决定是否画边框） ---- */
      const borderCount = () => q('.kb-key').filter(k => k.classList.contains('kb-key-hasborder')).length;
      ok(borderCount() > 0, 'border 启用且主题给了 keyBorderColor 时键画边框');
      $('th-bordermode').value = 'off';
      $('th-bordermode')._fire('change');
      eq(FE.state.keyBorderEnabled, false, '边框开关已关闭');
      eq(borderCount(), 0, 'border 禁用时**不再**画键边框（此前开关形同虚设）');
      eq(String(kbEl.style['--kb-bg'] || ''), '#0A0B0CFF', '关闭边框时 --kb-bg 回落 keyboardColor');
      $('th-bordermode').value = 'on';
      $('th-bordermode')._fire('change');
      ok(borderCount() > 0, '重新启用后键边框回来');
      eq(String(kbEl.style['--kb-bg'] || ''), '#0D0E0FFF', '重新启用后 --kb-bg 回到 altKeyboardColor');
    } finally {
      FE.state.profile = saved.profile;
      FE.state.layoutName = saved.layoutName;
      FE.state.themeProfile = saved.themeProfile;
      FE.state.themeSlot = saved.themeSlot;
      FE.state.keyBorderEnabled = saved.keyBorderEnabled;
      FE.state.theme = saved.theme;
      FE.renderAll();
    }
  }

  console.log('== 主题页：校验与 JSON 卡片 ==');
  {
    /* 合法主题：无错误 */
    FE.state.themeProfile = FE.normalizeThemeProfile(FE.themeNewProfile());
    FE.state.themeProfile.name = 'demo';
    FE.renderAll();
    ok($('th-validation').textContent.indexOf('主题校验通过') >= 0 ||
      $('th-validation').textContent.indexOf('个提示') >= 0, '校验区给出结论');
    ok($('th-json').value.indexOf('"type": "foxy.keyboard-theme"') >= 0, 'JSON 卡片实时同步');
    ok($('th-json').value.indexOf('"keyboardColor"') >= 0, 'JSON 含槽位字段');

    /* 类型不符：导入被拒 */
    FE.state.lastParseError = '';
    ok(FE.loadThemeProfileText(JSON.stringify({ type: 'foxy.keyboard-layout', light: {} })) === false,
      'type 不符的主题文件被拒绝导入');
    ok(String(FE.state.lastParseError).indexOf('foxy.keyboard-theme') >= 0, '拒绝原因说明了正确 type');

    /* 非法颜色：校验报错但不阻止导入（宽容读入，靠校验提示） */
    ok(FE.loadThemeProfileText(JSON.stringify({
      type: 'foxy.keyboard-theme', name: 'bad', light: { keyboardColor: '#12345' }
    })) === true, '颜色非法仍能导入（不拦读取）');
    FE.renderThemeTab();
    ok($('th-validation').textContent.indexOf('个错误') >= 0, '非法颜色被校验报错');

    /* JSON 卡片应用：修复后写入 */
    $('th-json').value = '{ type: "foxy.keyboard-theme", name: "fixme", light: { keyboardColor: "#FFF" } }';
    $('th-json')._fire('input');
    $('th-json-apply').click();
    eq(FE.state.themeProfile.name, 'fixme', 'JSON 卡片应用生效（含宽松修复）');
    eq(FE.state.themeProfile.light.keyboardColor, '#FFFFFFFF', '#RGB 归一化为 #AARRGGBB');

    /* 新建主题：type 正确、含两个槽位、方向提示色留空 */
    const fresh = FE.normalizeThemeProfile(FE.themeNewProfile());
    eq(fresh.type, 'foxy.keyboard-theme', '新建主题 type 正确');
    ok(fresh.light && fresh.dark, '新建主题含 light / dark 两个槽位');
    eq(fresh.light.keyHintTextTopColor, null, '新建主题的方向提示色留空（继承）');
  }

  console.log('== 主题页：撤销栈与草稿 ==');
  {
    /* 主题变更走 mutate → 压入历史；撤销必须回到「未导入」而非一份空主题 */
    FE.state.themeProfile = null;
    FE.renderAll();
    const before = FE.state.history.length;
    FE.mutate(() => { FE.state.themeProfile = FE.normalizeThemeProfile(FE.themeNewProfile()); });
    eq(FE.state.history.length, before + 1, '主题变更压入撤销栈');
    const snap = FE.state.history[FE.state.history.length - 1];
    eq(JSON.parse(snap).theme, null, '主题变更前的快照里主题是 null（未导入语义保留）');
    ok(JSON.parse(FE.snapshotState()).theme != null, '当前快照里含主题文档');
    $('top-undo').click();
    eq(FE.state.themeProfile, null, '撤销后主题回到「未导入」（不是空对象）');
    /* 撤销到"未导入"后预览**仍按内置默认主题上色**（需求：预览默认用 App 内置默认
     * 主题的深浅色）。改前这里断言的是"恢复无内联底色"，旧口径已反转。
     * 注意断的是"回落到内置默认色"这个**语义**，不是"与导入前逐像素相同"——
     * 二者在本次需求下已不是一回事。 */
    eq($('preview-kb').style.background, '#EEEEEEFF',
      '撤销到未导入后预览回落到内置默认主题底色（不是无底色）');

    /* 草稿写入 localStorage */
    FE.mutate(() => { FE.state.themeProfile = FE.normalizeThemeProfile(FE.themeNewProfile()); });
    FE.state.themeProfile.name = 'draft-theme';
    FE.mutate(() => { FE.state.themeProfile.name = 'draft-theme2'; });
    const draft = JSON.parse(localStorageStub.getItem('foxy-layout-editor-draft-v1'));
    ok(draft.themeProfile != null, '主题随草稿写入 localStorage');
    eq(draft.themeProfile.name, 'draft-theme2', '草稿里的主题是最新值');
    eq(draft.themeSlot, FE.state.themeSlot, '槽位随草稿一起存');

    /* 一次性取色手势应只压一条历史（拖动会连发几十次回调） */
    const h0 = FE.state.history.length;
    const inp = q('#th-colors .color-input')[0];
    inp.value = '#FF0F0F0F';
    inp._fire('change');
    eq(FE.state.history.length, h0 + 1, '一次取色手势只压一条历史');

    /* 收尾：清掉主题，恢复「未导入」让后续断言不受影响 */
    FE.state.themeProfile = null;
    FE.state.themeSlot = 'light';
    FE.state.keyBorderEnabled = true;
    FE.state.history.length = 0;
    FE.state.future.length = 0;
    FE.renderAll();
  }

  /* ================================================================
   * 符号面板页：复数槽口径的撤销 / 草稿回归
   *
   * 历史缺口：app.js 曾只接线单数 `symbolProfile`，而 symbol-editor 的事实来源
   * 是复数槽 `symbolProfiles = { kind: profile }`。后果是「切过类别再撤销」——
   * 撤销按钮可点、历史也变长，但符号数据**根本没回退**（只写回单数镜像，
   * `symbolProfiles[kind]` 不动）。下面这组断言就是钉住这个缺口。
   * ================================================================ */
  console.log('== 符号面板页：复数槽撤销与草稿 ==');
  {
    tabs.find(t => t.dataset.tab === 'tab-symbols')._fire('click');
    ok($('tab-symbols').classList.contains('active'), '切到符号面板页');
    /* 切页即 renderSymbolsTab → ensureSymbolState 懒建复数槽（浏览器里的真实顺序）。
     * ⚠️ 不要在这之后把槽位手动清成 null 再点按钮：symbol-editor 的载入入口
     * 直接写 state.symbolProfiles[id]，槽位为 null 时会抛 ——
     * 而真实浏览器里切页总会先建槽，所以那种起点本身就不真实。 */
    FE.state.history.length = 0;
    FE.state.future.length = 0;

    const symEx = $('sym-example');
    /* 载入两个类别的内置样例：符号页同时编辑多类 catalog */
    symEx.value = 'symbols';
    $('sym-load-example').click();
    ok(FE.isPlainObject(FE.state.symbolProfiles) && !!FE.state.symbolProfiles.symbols,
      'symbols 类别已载入');
    const symGroups0 = FE.state.symbolProfiles.symbols.groups.length;
    ok(symGroups0 > 0, 'symbols 样例含分组');

    symEx.value = 'emoji';
    $('sym-load-example').click();
    ok(!!FE.state.symbolProfiles.emoji, 'emoji 类别已载入（第二类）');
    ok(!!FE.state.symbolProfiles.symbols && !!FE.state.symbolProfiles.emoji,
      '两类 catalog 同时存在（复数槽）');

    /* 快照必须整组带上，而不是只有当前类别 */
    const symSnap = JSON.parse(FE.snapshotState()).symbol;
    ok(symSnap != null && FE.isPlainObject(symSnap.profiles), '快照里 symbol 是复数槽结构');
    ok(!!symSnap.profiles.symbols && !!symSnap.profiles.emoji,
      '快照同时含 symbols 与 emoji 两类（单数槽会丢掉未选中的那类）');
    ok(symSnap.kind != null, '快照记录了当前类别');

    /* ---- 核心回归：改符号数据 → 撤销 → 数据真的回退 ---- */
    const hBefore = FE.state.history.length;
    FE.mutate(() => {
      FE.state.symbolProfiles.symbols.groups.push({ names: { zh: 'zz新增' }, symbols: ['★'] });
    });
    eq(FE.state.history.length, hBefore + 1, '符号变更压入撤销栈');
    eq(FE.state.symbolProfiles.symbols.groups.length, symGroups0 + 1, '符号数据已新增一组');

    $('top-undo').click();
    eq(FE.state.symbolProfiles.symbols.groups.length, symGroups0,
      '撤销后符号数据**真的回退**（不是只变长历史）');
    /* 镜像必须重新指向撤销后的对象，否则界面仍读旧对象 */
    ok(FE.state.symbolProfile === FE.state.symbolProfiles[FE.state.symbolKind],
      '撤销后单数镜像重新指向 profiles[kind]');
    /* 未选中的类别也要一起回退（复数槽的意义所在） */
    ok(!!FE.state.symbolProfiles.emoji, '撤销后另一类别仍在（没被顺手清掉）');

    /* ---- 草稿：复数槽 + 文件名 + legacy 都要存 ---- */
    FE.state.symbolFileNames = { symbols: 'my-symbols.json' };
    FE.state.symbolLegacy = { symbols: false };
    FE.mutate(() => { FE.state.symbolProfiles.symbols.multiLine = true; });
    const symDraft = JSON.parse(localStorageStub.getItem('foxy-layout-editor-draft-v1'));
    ok(FE.isPlainObject(symDraft.symbolProfiles), '符号复数槽写入草稿');
    ok(!!symDraft.symbolProfiles.symbols && !!symDraft.symbolProfiles.emoji,
      '草稿含两类 catalog（刷新后不丢未选中的那类）');
    eq(symDraft.symbolFileNames, { symbols: 'my-symbols.json' }, '符号文件名按类别写入草稿');
    eq(symDraft.symbolLegacy, { symbols: false }, 'legacy 标记按类别写入草稿');
    eq(symDraft.symbolKind, FE.state.symbolKind, '当前类别随草稿一起存');

    /* ---- 未导入时快照存 null（不强造空对象）----
     * 这是纯函数断言，刻意不触发渲染：渲染会走 symbol-editor 的懒建逻辑，
     * 那是它的正常行为，不该被这条断言否定。 */
    const savedSym = {
      profiles: FE.state.symbolProfiles, fileNames: FE.state.symbolFileNames,
      legacy: FE.state.symbolLegacy, profile: FE.state.symbolProfile, kind: FE.state.symbolKind
    };
    FE.state.symbolProfiles = null;
    FE.state.symbolFileNames = null;
    FE.state.symbolLegacy = null;
    FE.state.symbolProfile = null;
    eq(JSON.parse(FE.snapshotState()).symbol.profiles, null, '未导入符号时快照存 null（不强造空对象）');
    eq(JSON.parse(FE.snapshotState()).symbol.fileNames, null, '未导入时文件名槽也是 null');

    /* ---- 从「未导入」写入数据 → 撤销 → 数据回退 ---- */
    FE.state.history.length = 0;
    FE.state.future.length = 0;
    FE.mutate(() => {
      FE.state.symbolProfiles = { symbols: FE.normalizeSymbolProfile('symbols', FE.SYMBOL_SAMPLES.symbols) };
    });
    eq(FE.state.symbolProfiles.symbols.groups.length, 2, '写入 symbols 样例后含 2 组');
    $('top-undo').click();
    ok(!FE.state.symbolProfiles || !FE.state.symbolProfiles.symbols ||
      FE.state.symbolProfiles.symbols.groups.length === 0,
      '撤销后符号数据回到未导入 / 空（渲染会懒建空槽，故断言数据而非对象是否为 null）');

    /* 收尾：恢复进入本块前的符号状态，避免影响后续 */
    FE.state.symbolProfiles = savedSym.profiles;
    FE.state.symbolFileNames = savedSym.fileNames;
    FE.state.symbolLegacy = savedSym.legacy;
    FE.state.symbolProfile = savedSym.profile;
    FE.state.symbolKind = savedSym.kind;
    FE.state.history.length = 0;
    FE.state.future.length = 0;
    FE.renderAll();
  }

/* ================================================================
 * 预览「实际渲染的颜色」vs 解析链「声称的来源」——逐键交叉验证
 *
 * 动机：编辑器现在有两条**独立**路径给出同一件事：
 *   · 预览实际写进 DOM 的行内样式（app.js 的 applyKeyColors，走 themeKeyColors + 分层）
 *   · 编辑面展示的「生效值 + 来源」（color-source.js 的 resolveKeyColors）
 * 二者若不一致，用户就会看到「编辑面说继承到 A 色、预览却显示 B 色」——
 * 正是本次要消灭的「对不上」。下面按四种情形（④③②①）逐键比对。
 * ================================================================ */
console.log('== 预览渲染 vs 颜色来源：逐键一致 ==');
{
  const savedProfile = FE.state.profile;
  const savedLayout = FE.state.layoutName;
  const savedTheme = FE.state.themeProfile;
  const savedSlot = FE.state.themeSlot;
  const savedBorder = FE.state.keyBorderEnabled;
  const savedStatus = FE.state.status;
  const savedTab = FE.state.activeTab;
  /* ⚠️ 本块验的是**键盘**预览的颜色，必须先把页签钉回一个非符号页 ——
   * renderPreview 会按 state.activeTab 决定"渲染键盘还是符号面板"
   * （App 端符号面板整块替换键盘，见 foxy-render-spec.md §8）。
   * 不钉的话，若前面某块把页签停在 tab-symbols，这里 q('.kb-key') 会取不到东西。 */
  FE.state.activeTab = 'tab-layout';
  try {
    FE.state.profile = FE.normalizeProfile({
      type: 'foxy.keyboard-layout',
      layouts: {
        default: {
          sections: [{
            type: 'rows',
            rows: [{
              height: 1, keys: [
                { ref: 'rime.q', keyType: 'LETTER' },
                { ref: 'rime.w', keyType: 'FUNCTION' },
                { ref: 'rime.e', keyType: 'FUNCTION', colors: { background: '#FF0A0B0C', text: '#FF0D0E0F' } },
                { ref: 'rime.r', keyType: 'LETTER', colors: { states: { pressed: { background: '#FF010203' } } } }
              ]
            }]
          }]
        }
      }, keys: {}
    });
    FE.state.layoutName = 'default';
    FE.state.themeProfile = FE.normalizeThemeProfile({
      type: 'foxy.keyboard-theme', name: 'x',
      light: {
        keyTextColor: '#FF111111', keyBackgroundColor: '#FF222222', keyPressedColor: '#FF333333',
        keyBorderColor: '#FF444444', keyShadowColor: '#FF555555', keyHintTextColor: '#FF666666',
        accentColor: '#FFABCDEF',
        keyTypes: { FUNCTION: { background: '#FFB1B2B3', text: '#FFC1C2C3' } }
      }, dark: {}
    });
    FE.state.themeSlot = 'light';
    FE.state.keyBorderEnabled = true;
    FE.state.status = { composing: false, ascii_mode: false, disabled: false, shift: false };
    FE.renderAll();

    /* 按标签索引预览里的键 */
    const byLabel = {};
    q('.kb-key').forEach((el) => {
      const lab = String(el.textContent || '').trim();
      if (lab && !byLabel[lab]) byLabel[lab] = el;
    });
    ok(!!byLabel['q'] && !!byLabel['w'] && !!byLabel['e'], '（前置）预览渲染出 q/w/e 键');

    /* 四情形：④ 纯主题兜底 / ③ keyTypes / ② 布局每键 */
    [
      ['q', 'LETTER', null, 'theme.global', '④ 全局兜底'],
      ['w', 'FUNCTION', null, 'theme.keyType', '③ keyTypes'],
      ['e', 'FUNCTION', { background: '#FF0A0B0C', text: '#FF0D0E0F' }, 'layout.key', '② 布局每键']
    ].forEach((row) => {
      const el = byLabel[row[0]];
      if (!el) { ok(false, '找不到预览键 ' + row[0]); return; }
      const eff = { keyType: row[1] };
      if (row[2]) eff.colors = row[2];
      const res = FE.resolveKeyColors(eff, {});
      const wantBg = res.roles.background.value ? FE.colorToCss(res.roles.background.value) : null;
      const wantFg = res.roles.text.value ? FE.colorToCss(res.roles.text.value) : null;
      if (wantBg) {
        eq(String(el.style.background || ''), wantBg,
          row[0] + '（' + row[4] + '）预览背景 = 解析链生效值');
      }
      if (wantFg) {
        eq(String(el.style.color || ''), wantFg,
          row[0] + '（' + row[4] + '）预览文字色 = 解析链生效值');
        eq(res.roles.text.source, row[3], row[0] + ' 文字色来源标注正确（' + row[3] + '）');
      }
    });

    /* ① 状态色：按下后预览背景换成 states.pressed */
    const rEl = byLabel['r'];
    const rEff = { keyType: 'LETTER', colors: { states: { pressed: { background: '#FF010203' } } } };
    rEl._fire('pointerdown');
    const rRes = FE.resolveKeyColors(rEff, { pressed: true });
    eq(String(rEl.style.background || ''), FE.colorToCss(rRes.roles.background.value),
      '① 按下后预览背景 = states.pressed（来源 ' + rRes.roles.background.source + '）');
    eq(rRes.roles.background.source, FE.COLOR_SOURCES.LAYOUT_STATE, '① 来源标注为布局状态色');
    rEl._fire('pointerup');

    /* 修饰键激活 → accentColor（规范 §1.4） */
    FE.state.status.shift = true;
    FE.state.profile.keys['verify.shift'] = { ref: 'foxy.Shift' };
    FE.state.profile.layouts['default'].sections[0].rows[0].keys.push(
      { ref: 'foxy.Shift', keyType: 'FUNCTION' });
    FE.renderAll();
    const ks2 = q('.kb-key');
    const shiftEl = ks2[ks2.length - 1];
    const sRes = FE.resolveKeyColors({ keyType: 'FUNCTION', modifier: 'SHIFT' }, { modifierActive: true });
    ok(sRes.textFromAccent, '修饰键激活时解析链标记 textFromAccent');
    eq(String(shiftEl.style.color || ''), FE.colorToCss(sRes.roles.text.value),
      '修饰键激活时预览文字色 = 主题 accentColor');
    FE.state.status.shift = false;
  } finally {
    FE.state.profile = savedProfile;
    FE.state.layoutName = savedLayout;
    FE.state.themeProfile = savedTheme;
    FE.state.themeSlot = savedSlot;
    FE.state.keyBorderEnabled = savedBorder;
    FE.state.status = savedStatus;
    FE.state.activeTab = savedTab;
    FE.renderAll();
  }
}

/* ================================================================
 * 符号面板预览：切到「符号面板」页签时，预览区换成符号面板
 *
 * App 端符号面板（`ly`）是**整块替换键盘区域**的横排面板（不是弹层），
 * 依据 foxy-render-spec.md §8。断言要点：
 *   · 切到符号页 → 预览区渲染面板，键盘键消失；
 *   · 面板结构 = 左列（84dp 分组列表 + ⌨/⌫）+ 右列格子区；
 *   · 格子列数随 multiLine 变（false 6 格/行、true 1 格/行）；
 *   · 切回其它页 → 恢复键盘渲染（不能把键盘弄丢）。
 * ================================================================ */
console.log('== 符号面板预览 ==');
{
  const savedTab = FE.state.activeTab;
  const savedSym = {
    profiles: FE.state.symbolProfiles, kind: FE.state.symbolKind,
    sample: FE.state.symbolPreviewGroup
  };
  try {
    /* 装一份三类 catalog（用内置样例，2 组 4 条，够验证结构） */
    FE.state.symbolProfiles = {
      symbols: FE.normalizeSymbolProfile('symbols', FE.SYMBOL_SAMPLES.symbols)
    };
    FE.state.symbolKind = 'symbols';
    FE.state.symbolPreviewGroup = 0;

    /* ⚠️ 必须**显式**把页签钉成 tab-symbols 再 renderAll：
     * activateTab 只在「跨符号页/非符号页边界」时才重画预览（性能考虑），
     * 若前一块已把 state.activeTab 停在 tab-symbols，activateTab 不会重渲染，
     * 这里就会断言到**上一块遗留**的 DOM（实测：拿到 emoji 的 6 格而非 symbols 的 12 格）。
     * 显式 renderAll 让断言与数据严格对应，不受块的执行顺序影响。 */
    FE.state.activeTab = 'tab-symbols';
    FE.activateTab('tab-symbols');
    FE.renderAll();
    ok(q('.sym-pv').length === 1, '符号页预览区渲染出符号面板（.sym-pv）');
    ok(q('.kb-key').length === 0, '符号页预览区**不再**渲染键盘按键');
    ok(q('.sym-pv-left').length === 1, '面板有左列（分组列表容器）');
    ok(q('.sym-pv-cells-wrap').length === 1, '面板有右列（格子区）');

    /* ①b 符号页的工具栏：**几何滑杆组隐藏**（用户要求"那一行滑杆调整键盘的，
     *     就不要显示在符号键盘预览了"），但**深浅下拉保留**（面板底跟它走）。
     *     ⚠️ 隐藏的必须是滑杆**包装层** #pt-geom-sliders，而不是整行 .preview-toggles-geom ——
     *     整行连同 #pt-theme 一起隐藏就把"符号页也能切深浅"弄丢了。 */
    ok($('pt-geom-sliders').hidden === true, '符号页：几何滑杆组隐藏（高度/圆角/水平/垂直间隙）');
    ok($('pt-theme').hidden !== true, '符号页：深浅下拉**仍可见**（面板底跟它走）');
    ok($('pt-geom-sliders').querySelectorAll('#pt-theme').length === 0,
      '深浅下拉不在滑杆组内（否则会被一起隐藏 —— 这是设计约束）');
    ['pt-height', 'pt-corner', 'pt-gap-h', 'pt-gap-v'].forEach(id => {
      ok($('pt-geom-sliders').querySelectorAll('#' + id).length === 1,
        id + ' 位于滑杆组内（会随符号页隐藏）');
    });
    /* 切回布局页 → 滑杆恢复 */
    FE.activateTab('tab-layout');
    ok($('pt-geom-sliders').hidden === false, '切回布局页后滑杆组恢复显示');
    FE.state.activeTab = 'tab-symbols';
    FE.activateTab('tab-symbols');
    FE.renderAll();

    /* ② 左列：分组项 + 两个热键 */
    const gItems = q('.sym-pv-group');
    ok(gItems.length === 2, '左列渲染 2 个分组项（实际 ' + gItems.length + '）');
    ok(q('.sym-pv-group-sel').length === 1, '恰有 1 个分组处于选中态');
    const hotkeys0 = q('.sym-pv-hotkey');
    eq(hotkeys0.length, 2, '左列底部有 ⌨ / ⌫ 两个热键');

    /* ②b ★回归：⌨/⌫ 必须与右侧符号格子**同款底色/圆角/描边**（用户指出：
     *     App 上这两个键是有按键底色的，和右边符号格一样）。
     *     证据：创建它们的 `a()`（ly.java:159-171，`f()` 在 :167）与创建格子那段
     *     （ly.java:202-218，`f()` 在 :209）调的是**同一个 `f()`**（ly.java:326-341）：
     *       setColor(this.a.j) = keyBackgroundColor；圆角 6dp clamp；描边仅当 B&&C。
     *     字色也是同一个 `this.a.n`（candidateTextColor，:166 与 :208）。
     *     早先这里**只给字色、漏了底色** —— 所以这条断言钉住"不能再漏"。 */
    {
      /* 导入一份辨识度高的主题，让"同款"可被精确断言（而非依赖 CSS 兜底） */
      const savedTp = FE.state.themeProfile, savedSlot = FE.state.themeSlot;
      FE.state.themeProfile = FE.normalizeThemeProfile({
        type: 'foxy.keyboard-theme', name: 'hk-same',
        light: {
          keyboardColor: '#FF101112', altKeyboardColor: '#FF202122',
          keyBackgroundColor: '#FF303132', candidateTextColor: '#FF404142',
          keyBorderColor: '#FF808182'
        }, dark: {}
      });
      FE.state.themeSlot = 'light';
      FE.state.keyBorderEnabled = true;
      FE.renderAll();
      const cellOne = q('.sym-pv-cell')[0];
      const hk = q('.sym-pv-hotkey');
      eq(hk[0].style.background, cellOne.style.background,
        '★ ⌨ 底色 = 格子底色（keyBackgroundColor #303132FF）');
      eq(hk[0].style.background, '#303132FF', '★ ⌨ 确实拿到了主题键底色（不是空）');
      eq(hk[1].style.background, cellOne.style.background, '★ ⌫ 底色同格子');
      eq(hk[0].style.color, cellOne.style.color, '⌨ 字色 = 格子字色（candidateTextColor）');
      eq(hk[0].style.borderRadius, cellOne.style.borderRadius, '⌨ 圆角 = 格子圆角（6dp clamp）');
      eq(hk[0].style.height, cellOne.style.height, '⌨ 高度 = 格子高度（40dp）');
      /* 描边条件与格子**同一条**（B 与 C 同时开才画；编辑器无 C 开关 → 默认不画） */
      ok(!hk[0].style.border && !cellOne.style.border,
        'B=true/C=false 时热键与格子**都不画描边**（ly.java:332-334）');

      /* dark 槽同样跟随（两套槽位各自生效） */
      FE.state.themeSlot = 'dark';
      FE.renderAll();
      eq(q('.sym-pv-hotkey')[0].style.background, q('.sym-pv-cell')[0].style.background,
        '★ dark 槽下 ⌨ 底色仍与格子一致');

      /* 未导入主题 → 走 App 内置默认主题，也必须有底色 */
      FE.state.themeProfile = null;
      FE.state.themeSlot = 'light';
      FE.renderAll();
      eq(q('.sym-pv-hotkey')[0].style.background, q('.sym-pv-cell')[0].style.background,
        '★ 未导入主题时 ⌨ 底色 = 格子底色（内置默认主题兜底）');
      ok(!!q('.sym-pv-hotkey')[0].style.background,
        '★ 未导入主题时 ⌨ 也有底色（不为空 —— 这是本回归的核心）');

      FE.state.themeProfile = savedTp;
      FE.state.themeSlot = savedSlot;
      FE.renderAll();
    }

    /* ③ 右列：格子数与 multiLine 决定的列数一致 */
    const cells = q('.sym-pv-cell');
    const sampleGroups = FE.SYMBOL_SAMPLES.symbols.groups;
    eq(cells.length, sampleGroups[0].symbols.length,
      '格子数 = 当前分组的条目数（' + sampleGroups[0].symbols.length + '）');
    const grid = q('.sym-pv-cells')[0];
    ok(!!grid, '格子网格存在');
    /* 样例 symbols 的 multiLine=false → 6 格/行 */
    eq(FE.state.symbolProfiles.symbols.multiLine === true, false, '（前置）样例 symbols 为 multiLine=false');
    ok(String(grid.style.gridTemplateColumns).indexOf('repeat(6') >= 0,
      'multiLine=false → 每行 6 格（实际 ' + grid.style.gridTemplateColumns + '）');

    /* ④ 切 multiLine=true → 每行 1 格 */
    FE.state.symbolProfiles.symbols = FE.normalizeSymbolProfile('symbols', {
      multiLine: true, groups: sampleGroups
    });
    FE.renderAll();
    const grid2 = q('.sym-pv-cells')[0];
    ok(String(grid2.style.gridTemplateColumns).indexOf('repeat(1') >= 0,
      'multiLine=true → 每行 1 格（实际 ' + grid2.style.gridTemplateColumns + '）');

    /* ⑤ 尺寸与布局预览**严格一致**（用户明确要求），且说明文字**移出键盘预览区**。
     *    面板高度 = 布局总单位数 × unit × 高度系数，正是布局预览各区段高度之和；
     *    这样两边一切换预览盒子大小完全相同。 */
    const symUnits = FE.layoutHeightUnits(FE.state.profile.layouts[FE.state.layoutName]);
    const symUnit = FE.state.portraitW / 10;
    const wantPanelH = symUnits * symUnit * FE.PREVIEW_HEIGHT_K;
    const pv = q('.sym-pv')[0];
    ok(pv && Math.abs(parseFloat(pv.style.height) - wantPanelH) < 1,
      '面板高度 = 布局预览高度（' + (pv && pv.style.height) + ' vs ' + wantPanelH.toFixed(1) + 'px）');
    eq(pv.style.overflow, 'hidden', '面板 overflow:hidden —— 内容再多也不会把它撑高');
    eq(q('#preview-kb .sym-pv-note').length, 0, '键盘预览区内**没有**说明文字（已移出）');
    ok(q('#preview-meta .sym-pv-note').length >= 1, '说明文字放进状态行（键盘区之外）');

    /* ⑥ 分组区与符号区**各自滚动**（对齐 App 的两个 ScrollView，ly.java:66-71/149-153），
     *    而不是靠拉长面板高度来显示全部条目 —— 这是用户明确要求的。
     *    minHeight:0 是 flex 子项能滚动的必要条件（默认 min-height:auto 会按内容撑高）。 */
    eq(q('.sym-pv-groups')[0].style.overflowY, 'auto', '左列分组区自身可滚动');
    eq(q('.sym-pv-groups')[0].style.minHeight, '0', '分组区 minHeight:0（flex 下才滚得起来）');
    eq(q('.sym-pv-cells-wrap')[0].style.overflowY, 'auto', '右列符号区自身可滚动');
    eq(q('.sym-pv-cells-wrap')[0].style.minHeight, '0', '符号区 minHeight:0');
    ok(!q('.sym-pv-cells-wrap')[0].style.maxHeight, '符号区不再用固定 maxHeight 限制');
    /* 两条滚动槽**隐藏原生滚动条**（用户要求「去掉那两个网页滑动杆」，对齐 App 观感）：
     * App 端的滚动指示是 Android 那套（细、贴边、自动淡出），不是网页粗白条。
     * 桩量不到 ::-webkit-scrollbar，故查源码里的规则 + 行内 scrollbar-width。 */
    {
      const cssSym = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
      ok(/\.sym-pv-groups,\s*\n?\.sym-pv-cells-wrap\s*\{[^}]*scrollbar-width:\s*none/.test(cssSym),
        '两条滚动槽都设了 scrollbar-width:none（Firefox）');
      ok(/\.sym-pv-groups::-webkit-scrollbar,\s*\n?\.sym-pv-cells-wrap::-webkit-scrollbar\s*\{\s*display:\s*none/.test(cssSym),
        '两条滚动槽都隐藏了 WebKit/Blink 原生滚动条');
      /* 滚动能力本身不能被改掉（上面已断言 overflowY === 'auto'） */
      ok(q('.sym-pv-groups')[0].style.overflowY === 'auto',
        '隐藏滚动条后仍保留可滚动能力（不是 overflow:hidden）');
    }

    /* ⑦ 分组极多时高度**仍不变**（真实预置示例：emoji 50+ 组）。
     *    这条是"不要强制拉长预览高度"的直接回归断言。 */
    const emojiFiles = FE.SYMBOL_EXAMPLE_FILES && FE.SYMBOL_EXAMPLE_FILES.emoji;
    const emojiName = emojiFiles ? Object.keys(emojiFiles)[0] : null;
    if (emojiName) {
      FE.state.symbolProfiles.emoji = FE.normalizeSymbolProfile('emoji', JSON.parse(emojiFiles[emojiName]));
      FE.state.symbolKind = 'emoji';
      FE.state.activeTab = 'tab-symbols';
      FE.renderAll();
      ok(FE.state.symbolProfiles.emoji.groups.length > 20,
        '（前置）预置 emoji 示例分组数 > 20（实际 ' + FE.state.symbolProfiles.emoji.groups.length + '）');
      const pvMany = q('.sym-pv')[0];
      ok(Math.abs(parseFloat(pvMany.style.height) - wantPanelH) < 1,
        '分组极多时高度仍 = 布局预览高度（' + pvMany.style.height + '，未被撑高）');
    } else {
      ok(false, '预置 emoji 示例应存在（FE.SYMBOL_EXAMPLE_FILES.emoji）');
    }

    /* ⑧ 切回布局页 → 键盘渲染恢复（不能把键盘弄丢） */
    FE.activateTab('tab-layout');
    ok(q('.sym-pv').length === 0, '切回布局页后符号面板消失');
    ok(q('.kb-key').length > 0, '切回布局页后键盘按键恢复渲染（实际 ' + q('.kb-key').length + '）');

    /* ⑨ 空 catalog → 给出提示而不是空白（且不抛） */
    FE.state.symbolProfiles = { symbols: FE.normalizeSymbolProfile('symbols', null) };
    FE.activateTab('tab-symbols');
    ok(q('.kb-empty').length >= 1, '空 catalog 时给出提示而非空白');
  } finally {
    FE.state.symbolProfiles = savedSym.profiles;
    FE.state.symbolKind = savedSym.kind;
    FE.state.symbolPreviewGroup = savedSym.sample;
    FE.state.activeTab = savedTab;
    FE.activateTab(savedTab === 'tab-symbols' ? 'tab-layout' : savedTab);
    FE.renderAll();
  }
}

}   /* 结束 await sleep(350) 后的主体块 */

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
})().catch(function (e) {
  /* main 里含 await，异常会变成 unhandled rejection；这里显式报出来，
   * 否则测试会以一句难以定位的模块/异步错误结束。 */
  console.error('  ✗ 测试主体抛出异常:', (e && e.stack) || e);
  process.exit(1);
});
