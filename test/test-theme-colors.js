/* 小狐狸 see me — 主题页颜色行文案 + 取色面板回显 测试
 * 用法: node test/test-theme-colors.js
 *
 * 独立成文件的原因：这两块都与「颜色值怎么在人眼前呈现」有关，
 * 且**回归价值高、改动频繁**，与 test-ui.js 的巨型断言集分开更好定位。
 *
 * 覆盖：
 *   ① 主题页每个颜色行都同时显示英文字段名与中文提示（26 全局色 + keyTypes 10 字段）；
 *   ② FE.argbToPickerHex / FE.pickerHexToArgb 的 6/8 位往返；
 *   ③ **关键回归**：输入框里是 8 位 ARGB（#AARRGGBB）时，取色面板拿到的必须是
 *      「经 FE.argbToPickerHex 换算后的 picker-hex」，而不是把 ARGB 当成
 *      vendor 的 AABBGGRR 直接解析出来的错值（现象：面板色与输入框色不一致）。
 *
 * 背景（见 js/jscolor/jscolor.js:811-867 的 parseColorString / 598-612 的 hexaColor）：
 * 本仓库 vendor 版 jscolor 的十六进制约定是
 *   不透明 → BBGGRR；带 alpha → AABBGGRR（RGB 反序）。
 * 而 Foxy 存的是 #AARRGGBB / #RRGGBB（RGB 正序）。两者 8 位时**字节序恰好相反**，
 * 谁把 Foxy 的串直接喂给 jscolor，谁就得到 R/B 互换的错色。
 * dom-stub.js 的 jscolor 桩刻意照抄了这个约定，所以下面的断言真能验出字节序。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { documentStub, localStorageStub, buildSkeleton, JscolorStub,
  __resetJscolorStub } = require('./dom-stub');

buildSkeleton();
global.window = global;
global.document = documentStub;
global.localStorage = localStorageStub;
/* jscolor 测试桩：照抄 `new window.jscolor(input, opts)` 的构造语义 */
global.jscolor = global.JscolorStub = JscolorStub;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.dispatchEvent = () => true;
/* 浏览器弹窗一律禁止：编辑器已全部改走 FE.uiAlert/uiConfirm/uiPrompt */
global.confirm = () => { throw new Error('不应使用浏览器 confirm（请用 FE.uiConfirm）'); };
global.prompt = () => { throw new Error('不应使用浏览器 prompt（请用 FE.uiPrompt）'); };
global.alert = (m) => { throw new Error('不应使用浏览器 alert（请用 FE.uiAlert）: ' + m); };
global.fetch = () => Promise.reject(new Error('no fetch in test'));
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
global.Blob = class {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.requestAnimationFrame = (fn) => { fn(); return 0; };
global.cancelAnimationFrame = () => {};

function load(file) {
  /* 缺席的文件静默跳过（与 test-ui.js 同一策略）：某个页面模块还没落地时，
   * 本套件不该整体崩掉，那会掩盖真正的失败。 */
  const p = path.join(__dirname, '..', 'js', file);
  if (!fs.existsSync(p)) return false;
  vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: file });
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

const FE = global.FE;
const $ = (id) => documentStub.getElementById(id);
const q = (sel, root) => (root || documentStub._body).querySelectorAll(sel);

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, msg + ' — 期望 ' + jb + ' 实际 ' + ja);
}
const CJK = /[\u4e00-\u9fa5]/;

/* ================================================================
 * ① 颜色转换：ARGB ↔ vendor picker 约定
 * ================================================================ */
console.log('== ARGB ↔ picker-hex 转换 ==');
ok(typeof FE.argbToPickerHex === 'function', 'FE.argbToPickerHex 存在');
ok(typeof FE.pickerHexToArgb === 'function', 'FE.pickerHexToArgb 存在');
/* 6 位：不透明补 FF，且 RGB 反序（RRGGBB → BBGGRR） */
eq(FE.argbToPickerHex('#4CAF50'), '#FF50AF4C', '6 位 → 补 FF + RGB 反序');
/* 8 位：alpha 留在最前，RGB 反序（AARRGGBB → AABBGGRR） */
eq(FE.argbToPickerHex('#8052F7BD'), '#80BDF752', '8 位 → alpha 在前 + RGB 反序');
eq(FE.argbToPickerHex(''), '', '空值不产出 picker 串');
/* 反向 */
eq(FE.pickerHexToArgb('#50AF4C'), '#4CAF50', '6 位 picker → RGB 正序');
eq(FE.pickerHexToArgb('#80BDF752'), '#8052F7BD', '8 位 picker → alpha + RGB 正序');
eq(FE.pickerHexToArgb('#FF50AF4C'), '#4CAF50', '不透明(FF)写回 6 位');
ok(FE.pickerHexToArgb('nope') === null, '非法 picker 串返回 null');

/* 往返一致：这才是面板与输入框之间的真实契约。
 * 注意两个约定：
 *   · argbToPickerHex 统一输出 **8 位 picker 串**（不透明补 FF，因为 picker 的
 *     hexa 约定要靠 alpha 位区分 6/8 位输出）；
 *   · pickerHexToArgb 把 alpha=FF 折叠回 **6 位**（App 语义：全不透明不需要 alpha）。
 * 所以往返的期望值 = 输入按上面规则折叠后的结果。 */
console.log('\n== 6/8 位往返一致 ==');
function collapseAlpha(argb) {
  const n = FE.normalizeColorHex(argb);
  if (!n) return n;
  /* ⚠️ 6 位输入**不含 alpha 位**（normalizeColorHex 对 6 位原样返回、不补 alpha），
   * 不能直接按 slice(1,3) 判 alpha —— 那样读到的其实是 **R 通道**，
   * 会把 '#FFFFFF' 误折成 '#FFFF'。必须先看长度是不是 9（8 位才有 alpha）。 */
  if (n.length === 7) return n;
  return (n.slice(1, 3) === 'FF') ? '#' + n.slice(3) : n;
}
['#000000', '#FFFFFF', '#4CAF50', '#8052F7BD', '#00112233', '#FF52F7BD'].forEach(function (c) {
  const picker = FE.argbToPickerHex(c);
  eq(picker.length, 9, 'argbToPickerHex 统一输出 8 位 picker 串: ' + c);
  eq(FE.pickerHexToArgb(picker), collapseAlpha(c), 'ARGB→picker→ARGB 往返一致（不透明折叠回 6 位）: ' + c);
  /* 再往返一次必须稳定（幂等，不来回抖动） */
  eq(FE.pickerHexToArgb(FE.argbToPickerHex(FE.pickerHexToArgb(picker))),
    collapseAlpha(c), '二次往返仍然一致: ' + c);
});

/* ================================================================
 * ② 宽容输入（#RGB / #ARGB / #RRGGBB / #AARRGGBB）
 * ================================================================ */
console.log('\n== 宽容输入归一化 ==');
ok(typeof FE.normalizeThemeColor === 'function', 'FE.normalizeThemeColor 存在（宽容输入用）');
eq(FE.normalizeThemeColor('#FFF'), '#FFFFFFFF', '#RGB 展开');
eq(FE.normalizeThemeColor('#8123'), '#88112233', '#ARGB 展开（alpha 与通道按位复制）');
eq(FE.normalizeThemeColor('#123456'), '#FF123456', '#RRGGBB 补 alpha');
eq(FE.normalizeThemeColor('#80123456'), '#80123456', '#AARRGGBB 原样大写');
ok(FE.normalizeThemeColor('#zzz') === null, '非法值 null');
eq(FE.normalizeColorHex('#4caf50'), '#4CAF50', 'normalizeColorHex 6 位大写');
ok(FE.normalizeColorHex('#8123') === null, 'normalizeColorHex 不认简写（要交宽容路径）');

/* ================================================================
 * ③ 主题页每个颜色行：英文名 + 中文提示**都可见**
 * ================================================================ */
console.log('\n== 主题页颜色行：英文名 + 中文提示并列可见 ==');
{
  ok(!!$('th-colors'), '主题页骨架含 #th-colors');
  /* 以内置默认色新建主题（不依赖 examples —— build-examples 不认主题类型） */
  FE.loadThemeProfileText(FE.serializeThemeProfile(FE.themeNewProfile()));
  FE.state.themeSlot = 'light';
  FE.renderThemeTab();

  const rows = q('#th-colors .form-row.form-inline');
  eq(rows.length, 26, '槽位全局配色渲染 26 行');
  const names = [];
  rows.forEach(function (row) {
    const code = row.querySelectorAll('code')[0];
    const doc = row.querySelectorAll('.th-field-doc')[0];
    const name = code ? String(code.textContent) : '';
    names.push(name);
    ok(!!code, '行内有英文字段名 <code>');
    ok(!!doc, name + '：行内有可见中文提示 .th-field-doc');
    if (doc) {
      const t = String(doc.textContent).trim();
      ok(t.length > 0, name + '：中文提示非空');
      ok(CJK.test(t), name + '：中文提示含汉字（实际 "' + t + '"）');
    }
    /* title 悬停说明继续保留（完整文案，含括号补充） */
    const label = row.querySelectorAll('.th-field-label')[0];
    ok(!!label && String(label.getAttribute('title')).indexOf(name) === 0,
      name + '：title 保留完整说明');
  });
  /* 字段名集合与权威顺序一致（英文必须原样，不能本地化改名） */
  eq(names.length, 26, '26 个字段名');
  ok(names.indexOf('keyboardColor') === 0, '首个字段 keyboardColor');
  ok(names.indexOf('accentColor') === 25, '末个字段 accentColor');
  ok(names.indexOf('keyHintTextBottomColor') >= 0, '含四方向提示色字段');

  /* 中文提示必须各不相同（照抄同一句就等于没有说明） */
  const docs = q('#th-colors .th-field-doc').map(function (d) { return String(d.textContent).trim(); });
  eq(new Set(docs).size, 26, '26 个中文提示互不重复');

  /* keyTypes 的 10 个字段同样要有中文（内置默认给了 FUNCTION / ACTION） */
  const ktRows = q('#th-keytypes .form-row.form-inline');
  ok(ktRows.length >= 20, 'keyTypes 至少渲染 20 行（FUNCTION/ACTION 各 10）');
  ktRows.forEach(function (row) {
    const code = row.querySelectorAll('code')[0];
    const doc = row.querySelectorAll('.th-field-doc')[0];
    const name = code ? String(code.textContent) : '';
    ok(!!doc, name + '：keyTypes 行内有可见中文提示');
    if (doc) ok(CJK.test(String(doc.textContent)), name + '：keyTypes 中文提示含汉字');
  });
  const ktDocs = q('#th-keytypes .th-field-doc').map(function (d) { return String(d.textContent).trim(); });
  eq(new Set(ktDocs).size, 10, 'keyTypes 的 10 个中文提示互不重复');

  /* 两个 keyTypes 分组同名字段的中文提示必须一致（同一语义不该两种说法） */
  const byField = {};
  ktRows.forEach(function (row) {
    const name = String(row.querySelectorAll('code')[0].textContent);
    const field = name.split('.').slice(1).join('.');
    const doc = String(row.querySelectorAll('.th-field-doc')[0].textContent).trim();
    if (byField[field] == null) byField[field] = doc;
    else eq(doc, byField[field], field + '：跨分组中文提示一致');
  });
}

/* ================================================================
 * ④ ★关键回归：8 位 ARGB 值必须被换算后喂给 picker
 * ================================================================ */
console.log('\n== ★回归：ARGB 输入框 → 取色面板拿到正确颜色 ==');
{
  __resetJscolorStub();
  const dlg = documentStub.createElement('dialog');
  documentStub._body.appendChild(dlg);
  const input = documentStub.createElement('input');
  input.className = 'color-input';
  input.value = '#8052F7BD';          /* Foxy 语义：A=80 R=52 G=F7 B=BD */
  dlg.appendChild(input);

  /* 挂载后安装：ensurePicker 立即建实例并同步一次（首次弹出就必须是对的） */
  FE.installJscolor(input, {});
  const picker = input.jscolor;
  ok(!!picker, '挂载的输入框立即安装出 jscolor 实例');
  eq(picker.channels.r, 0x52, '★ picker 的 R 通道 = 0x52（不是被当成 AABBGGRR 解析的 0xBD）');
  eq(picker.channels.g, 0xF7, 'picker 的 G 通道 = 0xF7');
  eq(picker.channels.b, 0xBD, 'picker 的 B 通道 = 0xBD');
  eq(Math.round(picker.channels.a * 255), 0x80, 'picker 的 alpha = 0x80');
  /* 用桩按 vendor 约定输出反查：toHEXAString 应给出 AABBGGRR */
  eq(picker.toHEXAString(), '80BDF752', 'picker 自述值是 AABBGGRR 约定下的 80BDF752');
  /* 反向：picker → ARGB 必须回到输入框那个值 */
  eq(FE.pickerHexToArgb(picker.toHEXAString()), input.value, '★ picker 值转回 == 输入框值（不串色）');

  /* 面板弹出的那一刻也要同步：值可能在实例建好之后被别处改过 */
  input.value = '#4CAF50';
  picker.show();
  eq(picker.channels.r, 0x4C, 'show() 前重新同步：R = 0x4C');
  eq(picker.channels.g, 0xAF, 'show() 前重新同步：G = 0xAF');
  eq(picker.channels.b, 0x50, 'show() 前重新同步：B = 0x50');
  eq(picker.channels.a, 1, '6 位值 alpha = 1（不透明）');
  ok(picker.opts.container === dlg, '面板容器指向外层 <dialog>');

  /* 手输 6 位：change 路径同样同步 */
  input.value = '#0000ff';
  input._fire('change');
  eq(input.value, '#0000FF', '手输 6 位被归一化成大写');
  eq(picker.channels.r, 0x00, '手输后 R = 0x00');
  eq(picker.channels.b, 0xFF, '手输后 B = 0xFF（蓝，不是红）');

  /* 宽容输入 #ARGB 也要能正确回显 */
  input.value = '#8123';
  input._fire('change');
  eq(input.value, '#88112233', '#ARGB 手输展开成 #AARRGGBB');
  eq(picker.channels.r, 0x11, '#ARGB 展开后 R = 0x11');
  eq(picker.channels.b, 0x33, '#ARGB 展开后 B = 0x33');

  /* 值经外部 API 变化时同样同步 */
  const api = FE.installJscolor(input, {});
  api.syncFromValue('#8052F7BD');
  eq(input.value, '#8052F7BD', 'syncFromValue 写回输入框');
  eq(picker.channels.r, 0x52, 'syncFromValue 后 picker R = 0x52');
  eq(picker.channels.b, 0xBD, 'syncFromValue 后 picker B = 0xBD');
  dlg.removeChild(input);
}

/* ================================================================
 * ⑤ 回归：jscolor 全局自动安装抢先建出的实例要能被接管
 * ================================================================ */
console.log('\n== ★回归：被全局自动安装抢先的实例必须被接管并纠正 ==');
{
  __resetJscolorStub();
  const dlg = documentStub.createElement('dialog');
  documentStub._body.appendChild(dlg);
  const input = documentStub.createElement('input');
  input.className = 'color-input';
  input.value = '#8052F7BD';
  dlg.appendChild(input);

  /* 模拟 jscolor 在 DOMContentLoaded 的全局安装：用**默认选项**直接建一个实例。
   * 真实的 jscolor 这时会自己读 input.value 并按 vendor 约定解析（RGB 反序）；
   * 我们的桩用标准序读构造值，所以这里手动把它拧成「错色」以复现该场景。 */
  const stray = new JscolorStub(input, {});
  stray.channels = { r: 0xBD, g: 0xF7, b: 0x52, a: 0x80 / 255 };  /* R/B 互换的错色 */
  stray.format = 'auto';
  stray.valueElement = input;       /* 默认指向输入框本身 */

  /* 此时 input.jscolor 已存在 —— 修复前 ensurePicker 会直接把它返回，错色留在面板里 */
  FE.installJscolor(input, {});
  const adopted = input.jscolor;
  ok(adopted === stray, '复用了已存在的实例（没有重复创建）');
  eq(adopted.valueElement, null, '接管后 valueElement 置 null（不让它把 vendor 串写回输入框）');
  eq(String(adopted.format).toLowerCase(), 'hexa', '接管后 format 纠正为 hexa');
  eq(String(adopted._currentFormat).toLowerCase(), 'hexa', '接管后 _currentFormat 也纠正（真正参与输出）');
  ok(adopted.alphaChannel === true, '接管后开启 alphaChannel');
  ok(adopted.container === dlg, '接管后面板容器抢回 <dialog>（不是 body）');
  eq(adopted.channels.r, 0x52, '★ 接管后 R 被纠正为 0x52（错色 0xBD 被覆盖）');
  eq(adopted.channels.b, 0xBD, '★ 接管后 B 被纠正为 0xBD');
  eq(FE.pickerHexToArgb(adopted.toHEXAString()), '#8052F7BD', '接管后 picker 值 == 输入框值');

  /* 接管后的实例也要带上我们的回调与摆位包装 */
  ok(typeof adopted.show === 'function' && typeof adopted.hide === 'function', '接管后 show/hide 可用');
  adopted.show();
  const wrap = dlg.querySelectorAll('.jscolor-wrap')[0];
  ok(!!wrap && wrap.parentNode === dlg, '接管后 show() 把面板挂进 <dialog>');
  ok(wrap.style.position === 'fixed', '接管后面板仍走 fixed 定位');
  /* onInput 回调在实例属性上（真实 jscolor 经 triggerCallback 读它） */
  ok(typeof adopted.onInput === 'function', '接管后实例属性 onInput 已装上');
  dlg.removeChild(input);
}

/* ================================================================
 * ⑥ ★回归：主题页每个色框都必须有 jscolor 实例（= 有色块预览）
 *
 * 这就是「取色框**有时**不显示已选颜色预览」的真正成因，务必钉住：
 * jscolor 的"已选颜色预览"是它画在**输入框自身** background-image 上的
 * 色块（vendor jscolor.js:2336 的 setPreviewElementBg，构造期
 * processValueInput → exposeColor 触发）。**没有实例就没有色块**。
 *
 * colorRow 里那句 FE.installJscolor 执行时输入框还没进 DOM，走的是"挂起、
 * 待挂载后补装"分支；按键对话框在 buildForm 末尾补了 installPendingColorPickers，
 * **主题页原先漏了** → 刚渲染完时 46 个色框一个实例都没有，只有用户点过的那个
 * 才建实例、才有预览，于是"有时显示、有时不显示"；而选完色会触发
 * afterChange → renderAll 重建表单，实例随旧元素丢弃，预览又消失。
 * ================================================================ */
console.log('\n== ★回归：主题页色框必须全都有取色器实例（色块预览）==');
{
  __resetJscolorStub();
  FE.loadThemeProfileText(FE.serializeThemeProfile(FE.themeNewProfile()));
  FE.state.themeSlot = 'light';
  FE.renderThemeTab();

  /* ① 刚渲染完：两个区块的**所有**色框都要有实例（不能等用户点击） */
  const colorInputs = q('#th-colors .color-input');
  const ktInputs = q('#th-keytypes .color-input');
  ok(colorInputs.length === 26, '（前置）#th-colors 有 26 个色框（实际 ' + colorInputs.length + '）');
  ok(ktInputs.length >= 20, '（前置）#th-keytypes 至少 20 个色框（实际 ' + ktInputs.length + '）');
  const missing = colorInputs.filter(function (i) { return !i.jscolor; });
  eq(missing.length, 0, '★ 刚渲染完：26 个全局色框**全部**已有实例（缺 ' + missing.length + ' 个）');
  const ktMissing = ktInputs.filter(function (i) { return !i.jscolor; });
  eq(ktMissing.length, 0, '★ 刚渲染完：keyTypes 色框**全部**已有实例（缺 ' + ktMissing.length + ' 个）');

  /* ② 实例带的是**我们的**配置与回调（不是 jscolor 全局自动安装的裸实例）。
   * ⚠️ 断言走 `picker.opts`：DOM 桩只把构造选项留档在 opts 上，**不会**像真实
   *    jscolor 那样把 format/valueElement/alphaChannel 落到实例属性
   *    （真实版由 setOption 逐个赋值，jscolor.js:3135-3145）。用实例属性断言会误红。
   *    实例属性那条只对 onInput 有效 —— wirePicker 确实在实例上赋了它。 */
  const one = colorInputs[0];
  eq(one.jscolor.opts.valueElement, null,
    '构造选项 valueElement=null（不让 vendor 串写回输入框）');
  eq(String(one.jscolor.opts.format || '').toLowerCase(), 'hexa', '构造选项 format=hexa');
  ok(one.jscolor.opts.alphaChannel === true, '构造选项开启 alphaChannel');
  ok(typeof one.jscolor.onInput === 'function', '实例属性 onInput 已装上（面板拖动实时回写）');

  /* ③ 色块预览用的那个颜色通道必须与输入框值一致（不是 R/B 互换的错色） */
  one.value = '#8052F7BD';           /* A=80 R=52 G=F7 B=BD */
  one.jscolor.show();                /* show() 前会重新同步一次 */
  eq(one.jscolor.channels.r, 0x52, '★ 预览色 R = 0x52（未被当成 AABBGGRR 解析成 0xBD）');
  eq(one.jscolor.channels.g, 0xF7, '预览色 G = 0xF7');
  eq(one.jscolor.channels.b, 0xBD, '预览色 B = 0xBD');

  /* ④ 选完色（afterChange → renderAll 重建表单）之后**仍然**有实例 —— 
   *    这条是"有时不显示"的关键：重建后必须重新补装，否则预览消失。 */
  one.value = '#FF445566';
  one._fire('change');
  const after = q('#th-colors .color-input');
  eq(after.length, 26, '选色后仍渲染 26 个色框');
  const afterMissing = after.filter(function (i) { return !i.jscolor; });
  eq(afterMissing.length, 0, '★ 选完色重建表单后**仍然**全部有实例（缺 ' + afterMissing.length + ' 个）');
  eq(q('#th-keytypes .color-input').filter(function (i) { return !i.jscolor; }).length, 0,
    '★ 选完色后 keyTypes 色框也仍然全部有实例');

  /* ⑤ 切走再切回主题页：同样齐备（activateTab 会重渲染） */
  FE.activateTab('tab-layout');
  FE.activateTab('tab-theme');
  eq(q('#th-colors .color-input').filter(function (i) { return !i.jscolor; }).length, 0,
    '★ 切页往返后 26 个色框仍有实例');

  /* ⑥ 重复渲染：表单会**重建**（新元素），新元素必须同样带上实例；
   *    且不能对同一元素重复安装（真实 jscolor 对同元素重复 new 会抛错，桩也照抄了）。 */
  const oldNode = q('#th-colors .color-input')[0];
  const oldInst = oldNode.jscolor;
  FE.renderThemeTab();
  const newNode = q('#th-colors .color-input')[0];
  ok(newNode !== oldNode, '（前置）重渲染会重建输入框元素（故不能断言"复用同一实例"）');
  ok(!!newNode.jscolor, '★ 重渲染后的新输入框也有实例');
  ok(newNode.jscolor !== oldInst, '实例随元素重建（旧实例已随旧元素丢弃）');
  eq(q('#th-colors .color-input').filter(function (i) { return !i.jscolor; }).length, 0,
    '重渲染后 26 个色框全部有实例');
  /* 同一元素上重复补装必须是空操作（幂等），不能把已有的实例冲掉 */
  const same = q('#th-colors .color-input')[0];
  const sameInst = same.jscolor;
  FE.installPendingColorPickers($('th-colors'));
  ok(same.jscolor === sameInst, '重复 installPendingColorPickers 不重建已有实例（幂等）');
}

/* ================================================================
 * ⑦ ★回归：26 个颜色行的排版必须**完全一致**（标签独占整行）
 *
 * 现象（用户实机截图指出）：`accentColor` 那一行的色值框跑到与标签**同一行**，
 * 「清除」按钮被挤到下一行；其余 25 行都是「标签一行、框 + 按钮一行」。
 *
 * 成因：`.th-color-grid .mini-label { flex: 1 1 auto }` —— 标签按**内容宽度**
 * 参与 flex 计算。26 个字段标签长短悬殊（`candidateBarColor` 的中文注释长，
 * `accentColor` 只有「强调色」三个字），**只有最短的那个**省出的空间刚好容得下
 * `.color-input`(150px)，于是它不换行、其余 25 个换行 → 那一行看起来与众不同。
 *
 * 修法：标签 `flex-basis` 改为 **100%**，在 `flex-wrap: wrap` 下恒定独占整行，
 * 色框与按钮必然成组换到第二行。
 *
 * ⚠️ DOM 桩没有布局引擎（量不到换行），所以这条只能查 CSS 源码 ——
 * 与 test-ui.js 查 `::-webkit-scrollbar` 规则同一做法。
 * 实机复核：headless Edge 截图，26 行签名（inpX|btnX|rowH）一致。
 * ================================================================ */
console.log('\n== ★回归：26 个颜色行排版一致（标签独占整行）==');
{
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const m = css.match(/\.th-color-grid\s+\.mini-label\s*\{([^}]*)\}/);
  ok(!!m, '（前置）存在 .th-color-grid .mini-label 规则');
  const body = m ? m[1].replace(/\s+/g, ' ').trim() : '';
  ok(/flex\s*:\s*1\s+1\s+100%/.test(body),
    '★ 标签 flex-basis = 100%（恒定独占整行）—— 实际声明: ' + JSON.stringify(body));
  ok(!/flex\s*:\s*1\s+1\s+auto/.test(body),
    '★ 不能是 flex: 1 1 auto（短标签会与色框挤同一行，accentColor 就是这样跑偏的）');
  /* 行本身必须允许 wrap，100% 的 basis 才表现为「独占一行后换行」 */
  const row = css.match(/\.th-color-grid\s+\.form-row\.form-inline\s*\{([^}]*)\}/);
  ok(!!row, '（前置）存在 .th-color-grid 行规则');
  /* 26 行共用同一 class，不存在「给某一行特调」的覆盖 */
  FE.loadThemeProfileText(FE.serializeThemeProfile(FE.themeNewProfile()));
  FE.state.themeSlot = 'light';
  FE.renderThemeTab();
  const labels = q('#th-colors .th-field-label');
  eq(labels.length, 26, '26 行的标签都挂 .th-field-label（同一条规则一视同仁）');
  const accRows = labels.filter(function (l) {
    const c = l.querySelectorAll('code')[0];
    return c && String(c.textContent) === 'accentColor';
  });
  eq(accRows.length, 1, 'accentColor 行没有单独覆盖（与其他行共用同一规则）');
  /* 每行的子元素结构也必须同构：label + input + button（顺序一致） */
  const sigs = q('#th-colors .form-row.form-inline').map(function (r) {
    return r.children.map(function (c) { return c.tagName; }).join('+');
  });
  eq(new Set(sigs).size, 1, '★ 26 行的子元素序列完全一致（唯一签名: ' + sigs[0] + '）');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
