/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * key-dialog.js — 按键编辑 / 手势 / 动作 / 状态变体 / 按键选择器 对话框
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});
var h = FE.h, clearEl = FE.clearEl;
var state = FE.state;

/* ================================================================
 * 模态框基础
 * ================================================================ */
function openModal(opts) {
  opts = opts || {};
  var dlg = document.createElement('dialog');
  dlg.className = 'editor-dialog' + (opts.wide ? ' wide' : '');
  /* 对话框内的候选 chip（弹出菜单 section 等）跟随键盘主题：
   * 与 #layout-sections / #popup-keys 同套规则，祖先打类即可（见 app.js syncEditorTheme）。 */
  if (FE.syncEditorTheme) { try { FE.syncEditorTheme(dlg); } catch (e) { /* 忽略 */ } }
  else if (state) { dlg.classList.add(state.theme === 'light' ? 'theme-light' : 'theme-dark'); }
  var form = h('form', { method: 'dialog', class: 'editor-form' });
  var titlebar = h('div', { class: 'dialog-titlebar' }, h('h3', null, opts.title || ''));
  var body = h('div', { class: 'dialog-body' });
  var toolbar = h('div', { class: 'toolbar dialog-toolbar' });
  form.appendChild(titlebar);
  form.appendChild(body);
  form.appendChild(toolbar);
  dlg.appendChild(form);
  document.body.appendChild(dlg);

  /* 两种关闭语义，**别再混用**：
   *   close()        强制关闭。保存/删除成功后、程序化收尾都走它，不触发守卫。
   *   requestClose() 用户主动关闭（点遮罩 / Esc / 「取消」按钮）。若 opts.onBeforeClose
   *                  判定有未保存改动，先确认再关。
   * 历史 bug：点遮罩直接 close()，用户辛苦改的内容**静默丢弃**。 */
  var confirming = false;   /* 确认框已弹出，避免叠第二个 */
  function forceClose() { if (dlg.open) dlg.close(); }
  /* 问一次「要不要丢弃改动」。返回值有三种，**调用方三种都要处理**：
   *   true  无改动 → 可立即离开。必须是**同步**的：跳转类操作若被推迟一帧，
   *         用户看到的是「点了没反应」（曾有测试因此变红）；
   *   false 守卫明确拒绝（如已有确认框在弹）；
   *   Promise<boolean> 有改动 → 已弹确认框，等用户选择。
   * 本函数不关闭对话框：谁来关、关完做什么，由调用方决定。 */
  function confirmDiscard() {
    var verdict;
    try { verdict = opts.onBeforeClose ? opts.onBeforeClose() : true; }
    catch (e) { verdict = true; }        /* 守卫自身出错不该把用户锁在框里 */
    if (verdict === false) return false;
    if (verdict && typeof verdict.then === 'function') {
      return verdict.then(function (v) { return v !== false; });
    }
    return true;
  }
  /* 拿到许可后执行 action：无改动同步执行，有改动则等用户确认后再执行 */
  function leaveThen(action) {
    var v = confirmDiscard();
    if (v === true) { action(); return; }
    if (v === false) return;
    v.then(function (ok) { if (ok) action(); }, function () { /* 确认框异常：保持打开 */ });
  }
  function requestClose() {
    if (confirming) return;
    var v = confirmDiscard();
    if (v === true) { forceClose(); return; }
    if (v === false) return;
    confirming = true;
    v.then(function (ok) { confirming = false; if (ok) forceClose(); },
           function () { confirming = false; });
  }
  dlg.addEventListener('close', function () { dlg.remove(); if (opts.onClose) opts.onClose(); });
  /* 点遮罩关闭。但要豁免"从取色面板拖出来"的手势：jscolor 滑块拖动是在
   * document 上挂 move/end 监听的，拖过头松手时浏览器合成的 click 会冒泡
   * 到 dialog（target 落在 dialog 空白区），不能算"点遮罩"。installJscolor
   * 会在面板 pointerdown/mousedown 时打标 FE._colorDragGuard（带时间戳）。 */
  dlg.addEventListener('click', function (e) {
    if (e.target !== dlg) return;
    try {
      var g = FE._colorDragGuard;
      if (g && (Date.now() - g) < 800) return;
    } catch (err) { /* 取时间失败则按普通遮罩点击处理 */ }
    requestClose();
  });
  /* Esc 默认会让 <dialog> 直接关闭：必须拦下来走同一条守卫路径 */
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); requestClose(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  dlg.showModal();
  return {
    el: dlg, body: body, toolbar: toolbar,
    close: forceClose, requestClose: requestClose,
    /* 跳转类按钮用这个：无改动**同步**执行 action（避免「点了没反应」），
     * 有改动才等确认。直接用 confirmDiscard() 会踩到「无改动返回 true
     * 而非 Promise」的坑。 */
    leaveThen: leaveThen
  };
}
FE.openModal = openModal;

/* ================================================================
 * 未保存改动的守卫
 * 用户点遮罩 / 按 Esc / 点「取消」时，若有改动就先确认，别静默丢弃。
 * ================================================================ */
/* 与键序无关的稳定序列化：编辑前后对象键序可能不同（重建表单会重排），
 * 直接 JSON.stringify 会把「没改」误判成「改了」。
 * undefined 要单独编码 —— JSON.stringify(undefined) 是 undefined 而非字符串，
 * 而「继承（undefined）」与「显式清除（null）」是两种不同语义，必须能区分。 */
function stableJson(v) {
  if (v === undefined) return '\u0000u';
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (FE.isPlainObject(v)) {
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableJson(v[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(v);
}
FE.stableJson = stableJson;

/* 生成一个 onBeforeClose：baseline 是打开时的快照，current 是当下的值。
 * ⚠️ `current()` 必须返回**原始值**（对象/数组/字符串），不要自己先 stableJson ——
 * 本函数内部会做稳定序列化；外面再序列化一次就成了双重编码，两边永远不相等，
 * 于是「没改」也被判成「改了」，守卫会把用户拦在确认框里。
 * 返回 true（可直接关）/ false（不该关）/ Promise<boolean>（问过用户了）。 */
FE.makeDiscardGuard = function (baseline, current, opts) {
  opts = opts || {};
  return function () {
    var now;
    try { now = stableJson(current()); } catch (e) { return true; }  /* 取不到就当没改，别卡住用户 */
    if (now === baseline) return true;
    return FE.uiConfirm(opts.message || '此对话框有未保存的改动，关闭将丢弃它们。', {
      title: opts.title || '放弃改动？',
      okLabel: opts.okLabel || '放弃改动',
      cancelLabel: opts.cancelLabel || '继续编辑',
      danger: true
    });
  };
};

/* 一步到位：把一个「返回原始值的快照函数」变成 onBeforeClose。
 * 同时管好 baseline，避免调用方各自 stableJson 时再踩双重编码的坑。
 * 返回 { onBeforeClose, note }：note() 用于表单重建后重新记基线（可选）。 */
FE.snapshotGuard = function (snapFn, opts) {
  var baseline = null;
  return {
    onBeforeClose: function () {
      if (baseline == null) return true;      /* 还没建好，无可丢内容 */
      return FE.makeDiscardGuard(baseline, snapFn, opts)();
    },
    /* 首轮建好后调用，记为基线。
     * 快照函数抛错时**不往外抛**：reset() 是在对话框刚建好、工具栏还没接上时调用的，
     * 抛出去会把整个打开流程打断（用户看到半截对话框）。取不到基线就视同
     * 「无可丢内容」，与 onBeforeClose 取不到当前值时的做法一致：宁可少拦，不锁住用户。 */
    reset: function () {
      try { baseline = stableJson(snapFn()); }
      catch (e) { baseline = null; }
    },
    hasBaseline: function () { return baseline != null; }
  };
};


/* ================================================================
 * 网页内建提示 / 确认 / 输入框（替代 alert / confirm / prompt）
 *
 * 为什么不用浏览器原生：
 *   · 它们**阻塞主线程**，样式无法与编辑器统一；
 *   · 移动端 / WebView 里表现不一致（有的还会被系统样式接管）；
 *   · 测试里无法断言内容，只能打桩成「永远点确定」，等于没测。
 *
 * 三个入口都返回 Promise：
 *   FE.uiAlert(message, opts)   → Promise<void>
 *   FE.uiConfirm(message, opts) → Promise<boolean>
 *   FE.uiPrompt(opts)           → Promise<string|null>（取消为 null）
 * opts 通用：{ title, message, okLabel, cancelLabel, danger }
 * uiPrompt 另有：{ value, placeholder, required, validate(v)→错误文字|null }
 *
 * message 里的 \n 会拆成多行显示（老代码的提示常带换行）。
 * ================================================================ */
/* 把多行消息铺进容器（split 后逐行 append，避免依赖 any 的数组子节点语义） */
function fillDialogMessage(host, message) {
  var lines = String(message == null ? '' : message).split('\n');
  lines.forEach(function (line) {
    host.appendChild(h('div', { class: 'ui-dialog-msg' }, line));
  });
  return host;
}
/* 保证只结算一次：Promise 重复 resolve 无害，但逻辑上要干净 */
function onceFlag() {
  var done = false;
  return function (fn) { return function (v) { if (done) return; done = true; fn(v); }; };
}

FE.uiAlert = function (message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var settle = onceFlag()(resolve);
    var m = openModal({ title: opts.title || '提示', onClose: function () { settle(); } });
    m.body.appendChild(fillDialogMessage(h('div', { class: 'ui-dialog-body' }), message));
    m.toolbar.appendChild(h('button', {
      /* class 里必须带 ui-dialog-ok：测试靠它定位「确定」（见 test-ui.js 的 uiOk/uiReadAlert） */
      type: 'button', class: 'mini-button primary ui-dialog-ok',
      onclick: function () { settle(); m.close(); }
    }, opts.okLabel || '好'));
  });
};

FE.uiConfirm = function (message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var settle = onceFlag()(resolve);
    var m = openModal({ title: opts.title || '请确认', onClose: function () { settle(false); } });
    m.body.appendChild(fillDialogMessage(h('div', { class: 'ui-dialog-body' }), message));
    m.toolbar.appendChild(h('button', {
      type: 'button', class: 'mini-button ui-dialog-cancel',
      onclick: function () { settle(false); m.close(); }
    }, opts.cancelLabel || '取消'));
    m.toolbar.appendChild(h('button', {
      type: 'button', class: 'mini-button ui-dialog-ok ' + (opts.danger ? 'danger' : 'primary'),
      onclick: function () { settle(true); m.close(); }
    }, opts.okLabel || '确定'));
  });
};

FE.uiPrompt = function (opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var settle = onceFlag()(resolve);
    var m = openModal({ title: opts.title || '请输入', onClose: function () { settle(null); } });
    if (opts.message != null && String(opts.message) !== '') {
      m.body.appendChild(fillDialogMessage(h('div', { class: 'ui-dialog-body' }), opts.message));
    }
    var input = h('input', {
      type: 'text', class: 'mini-input ui-dialog-input',
      value: opts.value != null ? String(opts.value) : '',
      placeholder: opts.placeholder || ''
    });
    var errBox = h('div', { class: 'ui-dialog-error' });
    m.body.appendChild(h('div', { class: 'form-row' }, input));
    m.body.appendChild(errBox);

    function submit() {
      var v = input.value;
      var msg = (typeof opts.validate === 'function') ? opts.validate(v)
        : ((opts.required && !String(v).trim()) ? '不能为空' : null);
      if (msg) {
        /* 校验失败就地报错，不关对话框——比再弹一次提示友好 */
        clearEl(errBox);
        errBox.appendChild(document.createTextNode(String(msg)));
        if (typeof input.focus === 'function') input.focus();
        return;
      }
      settle(v);
      m.close();
    }
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    });
    m.toolbar.appendChild(h('button', {
      type: 'button', class: 'mini-button ui-dialog-cancel',
      onclick: function () { settle(null); m.close(); }
    }, opts.cancelLabel || '取消'));
    m.toolbar.appendChild(h('button', {
      type: 'button', class: 'mini-button primary ui-dialog-ok',
      onclick: submit
    }, opts.okLabel || '确定'));
    /* 打开即聚焦输入框：这类对话框的下一步几乎总是打字 */
    if (typeof input.focus === 'function') input.focus();
  });
};

/* ================================================================
 * jscolor 颜色选择器（与 f5a-see-me 相同的交互）
 * - 点击输入框就地弹出 jscolor 面板：HSV 取色区 + 透明度滑杆 + ✓ 关闭，
 *   支持 #RRGGBB / #AARRGGBB（format hexa + alphaChannel）。
 * - 关键点（否则"点了没反应"）：
 *   1) 面板必须挂进最近的 <dialog>。jscolor 默认挂 document.body，而按键
 *      对话框是原生 <dialog>（showModal 进入顶层渲染），body 里的面板会被
 *      对话框及其 ::backdrop 盖住 —— 看起来就是"点了不弹"。
 *      f5a-see-me 同样传 container: el("layout-key-colors-dialog")。
 *   2) 面板在 dialog 内时 jscolor 只做 relative 0,0 摆位，需要自己按输入框
 *      位置改成 position:fixed（f5a 的 positionInlineColorPicker 同款）。
 *   3) 必须等输入框进入 DOM 后再 new jscolor：construct 需要能查到 <dialog>
 *      容器。本函数在元素未挂载时改为首次交互（pointerdown/mousedown/focus）
 *      惰性安装；pointerdown 早于 jscolor 的文档级 mousedown，所以第一次点击
 *      依然能弹出面板。也可由 FE.installPendingColorPickers 在挂载后主动安装。
 * opts: { onInput(hexOrNull), onDone(hexOrNull) }
 * 返回 { el, syncFromValue(v), destroy() }。
 * ================================================================ */
FE.COLOR_HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
FE.normalizeColorHex = function (v) {
  /* '#rrggbb' → 原样大写；'#aarrggbb' 同样；其余（空/非法）→ null */
  if (typeof v !== 'string') return null;
  var t = v.trim();
  if (t === '') return null;
  if (!FE.COLOR_HEX_RE.test(t)) return null;
  return '#' + t.slice(1).toUpperCase();
};
/* 本仓库 vendor 的 jscolor 被 f5a 改成"ARGB 友好"的十六进制约定（见 jscolor.js
 * 的 hexaColor / parseColorString）：
 *   - 不透明：BBGGRR（RGB 反序，6 位）
 *   - 带透明度：AABB GGRR（alpha 在前 + RGB 反序，8 位）
 * 这与标准 CSS 的 RRGGBBAA 不同 —— 按标准转换会让取出的颜色串色。
 * f5a-see-me 的 argbHexToRgbaHex / rgbaHexToArgbHex 就是为此而写，
 * 下面两个函数在本编辑器的 ARGB(#AARRGGBB) 与该约定之间互转。 */
FE.argbToPickerHex = function (argb) {
  var n = FE.normalizeColorHex(argb);
  if (n == null) return '';
  var hex = n.slice(1);
  var a, r, g, b;
  if (hex.length === 6) { a = 'FF'; r = hex.slice(0, 2); g = hex.slice(2, 4); b = hex.slice(4, 6); }
  else { a = hex.slice(0, 2); r = hex.slice(2, 4); g = hex.slice(4, 6); b = hex.slice(6, 8); }
  return '#' + a + b + g + r;
};
FE.pickerHexToArgb = function (pickerHex) {
  if (typeof pickerHex !== 'string') return null;
  var m = pickerHex.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return null;
  var hex = m[1].toUpperCase();
  var a, r, g, b;
  if (hex.length === 6) { a = 'FF'; b = hex.slice(0, 2); g = hex.slice(2, 4); r = hex.slice(4, 6); }
  else { a = hex.slice(0, 2); b = hex.slice(2, 4); g = hex.slice(4, 6); r = hex.slice(6, 8); }
  if (a === 'FF') return '#' + r + g + b;
  return '#' + a + r + g + b;
};

/* 最近的祖先 <dialog>：取色面板要挂进它才能显示在对话框之上 */
function nearestDialog(el) {
  var n = el ? el.parentNode : null;
  while (n && n.nodeType === 1) {
    if (String(n.tagName || '').toLowerCase() === 'dialog') return n;
    n = n.parentNode;
  }
  return null;
}
function isAttached(el) {
  var n = el;
  while (n) {
    if (n.nodeType === 9) return true;   /* document */
    n = n.parentNode;
  }
  return false;
}
/* 把 jscolor 面板摆到输入框正下方（视口内；下方放不下则翻到上方） */
var activeColorInput = null;   /* 当前弹出面板的输入框,供窗口缩放时重新摆位 */
var colorResizeBound = false;
function positionColorWrap(input) {
  if (!input) return;
  var container = nearestDialog(input) || document.body;
  if (!container || typeof container.querySelector !== 'function') return;
  var wrap = container.querySelector('.jscolor-wrap');
  if (!wrap || !wrap.style) return;
  var r = typeof input.getBoundingClientRect === 'function' ? input.getBoundingClientRect() : null;
  if (!r) return;
  var top = r.bottom + 4;
  var vh = window.innerHeight || 0;
  var ph = wrap.offsetHeight || 0;
  if (vh && ph && top + ph > vh - 8 && r.top - ph - 4 > 0) top = r.top - ph - 4;
  wrap.style.position = 'fixed';
  wrap.style.left = Math.round(r.left) + 'px';
  wrap.style.top = Math.round(top) + 'px';
  wrap.style.zIndex = '100000';
  watchColorWrap(wrap);
}
function bindColorReposition() {
  if (colorResizeBound) return;
  colorResizeBound = true;
  if (typeof window.addEventListener !== 'function') return;
  /* jscolor 自己在 resize/scroll 时会 redrawPosition；容器不是 body 时它会把
   * 面板摆成 relative 0,0（对话框左上角）。我们在它之后注册，覆盖回输入框下方。 */
  var reflow = function () {
    if (activeColorInput && activeColorInput.jscolor) positionColorWrap(activeColorInput);
  };
  window.addEventListener('resize', reflow);
  window.addEventListener('scroll', reflow);
}
/* 取色面板手势标记：面板内 pointerdown/mousedown 即打标（带时间戳），供
 * openModal 的遮罩点击判定豁免"从面板拖出来、松手落在 dialog 空白区"的
 * 合成 click。只打标不拦截，面板自己的拖动逻辑不受影响。 */
function markColorDragGuard() {
  try { FE._colorDragGuard = Date.now(); } catch (e) { /* 忽略 */ }
}
function watchColorWrap(wrap) {
  if (!wrap || wrap._foxyGuardWatched) return;
  wrap._foxyGuardWatched = true;
  try {
    wrap.addEventListener('pointerdown', markColorDragGuard);
    wrap.addEventListener('mousedown', markColorDragGuard);
  } catch (e) { /* 桩环境缺方法时忽略 */ }
}

FE.installJscolor = function (input, opts) {
  opts = opts || {};
  input._foxyColorOpts = opts;   /* 供 FE.installPendingColorPickers 挂载后补装 */
  function emitInput(v) { if (typeof opts.onInput === 'function') opts.onInput(v); }
  function emitDone(v) { if (typeof opts.onDone === 'function') opts.onDone(v); }

  /* 输入框里的值 → picker 内部颜色。**这是「面板色与输入框色一致」的唯一正确
   * 入口**：Foxy 存 #AARRGGBB（alpha 在前），而本仓库 vendor 版 jscolor 的
   * parseColorString 把 8 位串按 AABBGGRR 解析（RGB 反序，见 jscolor.js:822-831）。
   * 所以**绝不能让 jscolor 自己去读 input.value** —— 必须经 FE.argbToPickerHex
   * 换成本仓库约定后再 fromString 送进去，否则面板里 R/B 互换，显示的就不是
   * 输入框那个颜色。宽容输入（#RGB / #ARGB / #RRGGBB）先展开成 8 位。 */
  function toArgbTolerant(v) {
    var n = FE.normalizeColorHex(v);
    if (n) return n;
    if (typeof FE.normalizeThemeColor === 'function') return FE.normalizeThemeColor(v);
    return null;
  }
  function syncPickerFromInput() {
    /* 手输后把值同步进 picker（f5a 的 syncInlinePickerFromArgbInput 同款） */
    var p = input.jscolor;
    if (!p) return;
    var argb = toArgbTolerant(input.value);
    if (!argb) return;
    var pickerHex = FE.argbToPickerHex(argb);
    if (!pickerHex) return;
    try { p.fromString(pickerHex); } catch (e) { /* 忽略 */ }
  }
  /* 供「值在实例创建之后被别处改写」的路径主动同步（渲染、JSON 应用、清除按钮…） */
  input._foxySyncPicker = syncPickerFromInput;
  function syncInputFromPicker() {
    /* 面板拖动后把值写回输入框（f5a 的 syncArgbInputFromInlinePicker 同款）。
     * 面板不透明时输出 6 位（hexaColor 的 a==1 分支）；若输入框当前是 8 位
     * （用户之前设过透明度），则补 FF 保持 8 位，避免滑块滑到顶时前两位
     * 突然消失（#8052F7BD → #FF52F7BD 而不是 #52F7BD）。 */
    var p = input.jscolor;
    if (!p) return;
    var raw = null;
    try { raw = (typeof p.toHEXAString === 'function' ? p.toHEXAString() : p.toHEXString()); } catch (e) { return; }
    var argb = FE.pickerHexToArgb(raw);
    if (!argb) return;
    var cur = FE.normalizeColorHex(input.value);
    if (argb.length === 7 && cur && cur.length === 9) argb = '#FF' + argb.slice(1);
    input.value = argb;
  }

  var api = {
    el: input,
    syncFromValue: function (v) {
      /* 宽容输入（#RGB / #ARGB / #RRGGBB / #AARRGGBB）都要能正确回显：
       * 先按 8 位归一化，失败再走主题色归一化（含 3/4 位展开）。 */
      var n = FE.normalizeColorHex(v);
      if (n == null) n = toArgbTolerant(v);
      input.value = n || '';
      /* 实例可能还没建出来（未挂载）——那就等 ensurePicker 里那次同步 */
      syncPickerFromInput();
    },
    destroy: function () {
      try { if (input.jscolor && typeof input.jscolor.hide === 'function') input.jscolor.hide(); } catch (e) { /* 忽略 */ }
    }
  };

  /* 面板拖动/选色时 jscolor 触发的实时回调。
   * 真实 jscolor 经 triggerCallback 读**实例属性** thisObject['onInput']，
   * 而我们既把它作为构造选项传入、又挂到实例上（见 wirePicker），两条路径都通。 */
  function handlePickerInput() {
    syncInputFromPicker();
    activeColorInput = input;
    positionColorWrap(input);
    emitInput(FE.normalizeColorHex(input.value));
  }

  /* 给实例装上本编辑器的回调与面板摆位。**幂等**（_foxyWired 标记）：
   * 我们自己建的实例、以及 jscolor 全局自动安装抢先建出来的实例，都要能补装。 */
  function wirePicker(picker) {
    if (!picker || picker._foxyWired) return picker;
    picker._foxyWired = true;
    picker.onInput = handlePickerInput;
    /* show 之后按输入框位置摆好面板（dialog 容器内 jscolor 只做 relative 0,0） */
    var origShow = picker.show.bind(picker);
    picker.show = function () {
      /* ⭐ 弹出前再同步一次：输入框的值可能在上次关闭后被别处改过（清除按钮、
       * 表单重建回填、JSON 应用、撤销…）。面板只认 picker 内部通道，不重新
       * 喂一次就会继续显示上一次的颜色 —— 这是"有时对有时不对"的另一半。
       * 放在 origShow 之前，面板首帧就是对的（也省掉一次重绘）。 */
      syncPickerFromInput();
      var r = origShow();
      activeColorInput = input;
      positionColorWrap(input);
      markColorDragGuard();
      return r;
    };
    /* 关闭时补一次 Done 回调（实时值已由 onInput 发出） */
    var origHide = picker.hide.bind(picker);
    picker.hide = function () {
      var r = origHide();
      if (activeColorInput === input) activeColorInput = null;
      emitDone(FE.normalizeColorHex(input.value));
      return r;
    };
    bindColorReposition();
    return picker;
  }

  /* 接管一个「不是我们建出来的」实例。
   *
   * ⭐ 这就是「取色面板有时显示的颜色不是输入框里那个」的**真实成因**：
   * jscolor 在 DOMContentLoaded 会跑 jsc.pub.init() → installBySelector('[data-jscolor]')，
   * 把页面上所有带 data-jscolor 的输入框**用默认选项**建一遍实例。我们的颜色输入框
   * 都带 'data-jscolor': '{}'，只要它们在 DOMContentLoaded 之前就已进入 DOM
   * （主题页的 26 个字段就是在页面加载期渲染进 DOM 的），就会被这样抢先建出来。
   * 那条路径上：
   *   · format 默认 'auto'、valueElement 默认指向输入框本身；
   *   · 构造时 jsc 会读输入框的 value 交给 parseColorString，而 vendor 版对该串
   *     是**按 AABBGGRR（RGB 反序）**解析的（jscolor.js:822-831），Foxy 存的却是
   *     #AARRGGBB → 面板里 R 与 B 互换，显示的压根不是输入框那个颜色；
   *   · 而且它没有我们的 onInput / show / hide 包装。
   * 一旦它抢先建好，本函数原先的 `if (input.jscolor) return input.jscolor;`
   * 会直接把坏的实例返回，连同步都不做 —— 现象因此时有时无（取决于加载时序）。
   * 这里把它改造回我们的配置，并用 FE.argbToPickerHex 重新同步一次颜色。 */
  function adoptExisting(picker) {
    if (!picker) return null;
    try {
      picker.valueElement = null;   /* 别让它把 vendor 格式的串直接写回输入框 */
      picker.format = 'hexa';
      /* _currentFormat 才是真正参与 toString()/getFormat() 的那个字段，
       * 只改 .format 不改它，输出格式仍会是构造时的 'hex'（6 位无 alpha）。 */
      if (typeof picker._setFormat === 'function') picker._setFormat('hexa');
      else picker._currentFormat = 'hexa';
      picker.hash = true;
      picker.uppercase = true;
      picker.alphaChannel = true;
      /* 面板容器也要抢回来：自动安装那条路容器是 document.body，挂 body 的
       * 面板会被顶层 <dialog> 与 ::backdrop 盖住（测试里已锁住这条）。
       * 两处都写：真实 jscolor 的 drawPicker 读实例属性 THIS.container，
       * 而 options 里那份是构造时的配置留档。 */
      var dlg = nearestDialog(input);
      if (dlg) {
        picker.container = dlg;
        if (picker.opts) picker.opts.container = dlg;
      }
    } catch (e) { /* 降级实现可能只读，忽略 */ }
    wirePicker(picker);
    syncPickerFromInput();          /* ★ 关键：按 Foxy 的 ARGB 语义重新喂给 picker */
    return picker;
  }

  /* 真正创建实例：必须在元素已进入 DOM 之后调用（要能查到祖先 <dialog>） */
  function ensurePicker() {
    if (input.jscolor) return adoptExisting(input.jscolor);
    if (!window.jscolor) return null;    /* 降级：纯文本输入 */
    /* jscolor 的面板 CSS 与"点目标即弹出"的文档级 mousedown 监听都在 init()
     * 里注册（正常由 DOMContentLoaded 触发）。这里幂等补一次，确保脚本加载
     * 时机异常（如 DOMContentLoaded 已过）时点击依然能弹出面板。 */
    if (typeof window.jscolor.init === 'function' && document.readyState !== 'loading') {
      try { window.jscolor.init(); } catch (e) { /* 忽略 */ }
    }
    /* ⚠️ init() 会把页面上**所有**带 data-jscolor 的元素（**包括我们这一个**）
     * 用默认选项建一遍实例（jscolor.js:3435-3439 的 installBySelector）。
     * 必须在它之后再确认一次：否则下面那句 new 会因"实例已存在"抛错，被 catch
     * 成"降级为纯文本"，而实际留在元素上的是一个默认配置（format auto、
     * valueElement 指向输入框、容器 body）的**错误实例** —— 面板既串色又被遮挡。 */
    if (input.jscolor) return adoptExisting(input.jscolor);
    var picker = null;
    try {
      picker = new window.jscolor(input, {
        hash: true,
        closeButton: true,
        closeText: '✓',
        showOnClick: true,
        format: 'hexa',
        alphaChannel: true,
        valueElement: null,
        /* 挂进对话框（顶层），否则会被 dialog 与 ::backdrop 盖住 */
        container: nearestDialog(input) || undefined,
        /* 实时回调同时以「构造选项」和「实例属性」两种形态存在（wirePicker 里再赋
         * 一次实例属性）：真实 jscolor 经 triggerCallback 读实例属性触发，而调用方
         * / 测试也可能直接调 opts.onInput()。两者指向同一个函数，重复触发无害
         * （emitInput → apply 是幂等的）。 */
        onInput: handlePickerInput
      });
    } catch (e) {
      if (window.console && typeof window.console.warn === 'function') {
        console.warn('[foxy-editor] jscolor 初始化失败，颜色框降级为文本输入：', e);
      }
      return null;
    }
    wirePicker(picker);
    /* ⭐ 实例建好后**立刻**同步一次：构造期 jsc 会自己按 vendor 约定去解析
     * input.value（若它读了），而且我们从不让它承担"读输入框"的职责 —— 颜色
     * 一律由 FE.argbToPickerHex 换算后再喂进来，保证首次弹出面板就对。 */
    syncPickerFromInput();
    return picker;
  }

  if (isAttached(input)) {
    ensurePicker();
  } else {
    /* 未挂载：首次交互时惰性安装。pointerdown/touchstart 都早于 jscolor 的
     * 文档级 mousedown 监听，所以这一次点击照样能弹出面板。 */
    var lazy = function () { ensurePicker(); };
    input.addEventListener('pointerdown', lazy);
    input.addEventListener('mousedown', lazy);
    input.addEventListener('touchstart', lazy, { passive: true });
    input.addEventListener('focus', lazy);
  }

  /* 手输 change：归一化并回写 draft；非法则提示并回退 */
  input.addEventListener('change', function () {
    var raw = input.value.trim();
    if (raw === '') { emitInput(null); emitDone(null); return; }
    /* 走宽容归一化：除 #RRGGBB / #AARRGGBB 外，#RGB / #ARGB 简写也要能回显
     * （App 端同样宽容）。仍不合法的才提示并保留原值。 */
    var n = toArgbTolerant(raw);
    if (n == null) {
      FE.uiAlert('颜色格式无效，应为 #RRGGBB 或 #AARRGGBB');
      return;
    }
    input.value = n;
    syncPickerFromInput();
    emitInput(n);
    emitDone(n);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });
  return api;
};

/* 关掉当前弹出的取色面板（表单重建 / 对话框关闭前调用，避免留下悬空面板） */
FE.closeActiveColorPicker = function () {
  var inp = activeColorInput;
  activeColorInput = null;
  if (inp && inp.jscolor && typeof inp.jscolor.hide === 'function') {
    try { inp.jscolor.hide(); } catch (e) { /* 忽略 */ }
  }
};

/* 挂载后补装：buildForm 末尾调用一次，让输入框一进入 DOM 就装好 jscolor
 * （这样 jscolor 自己的文档级 mousedown 也能直接命中，不依赖惰性兜底）。 */
FE.installPendingColorPickers = function (root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  var inputs = root.querySelectorAll('.color-input');
  var n = 0;
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    if (inp.jscolor || !inp._foxyColorOpts) continue;
    if (!isAttached(inp)) continue;
    FE.installJscolor(inp, inp._foxyColorOpts);
    n++;
  }
  return n;
};

/* ================================================================
 * 按键选择器
 * ================================================================ */
FE.openKeyPicker = function (opts) {
  var modal = openModal({ title: opts.title || '选择按键', wide: true });

  function effLabelOf(name) {
    var ev = FE.evalPlacement({ ref: name }, FE.NEUTRAL_STATUS);
    return FE.rawLabelOf(ev.eff, FE.NEUTRAL_STATUS) || '';
  }

  function buildPickerList(q) {
    var wrap = h('div');
    var uk = (state.profile && FE.isPlainObject(state.profile.keys)) ? state.profile.keys : {};
    var userNames = Object.keys(uk).filter(function (n) {
      if (!q) return true;
      var kd = uk[n];
      return n.toLowerCase().indexOf(q) >= 0 ||
        (FE.isPlainObject(kd) && typeof kd.ref === 'string' && kd.ref.toLowerCase().indexOf(q) >= 0) ||
        effLabelOf(n).toLowerCase().indexOf(q) >= 0;
    });
    if (userNames.length) {
      wrap.appendChild(h('div', { class: 'picker-group' }, '用户按键'));
      userNames.forEach(function (n) {
        wrap.appendChild(pickerItem(n, effLabelOf(n), '用户定义' + (uk[n] && uk[n].ref ? ' · ' + uk[n].ref : '')));
      });
    }
    var cats = {};
    Object.keys(FE.BUILTIN_KEYS).forEach(function (n) {
      var b = FE.BUILTIN_KEYS[n];
      var label = b.label != null ? String(b.label) : '';
      if (q && n.toLowerCase().indexOf(q) < 0 && label.toLowerCase().indexOf(q) < 0) return;
      (cats[b._cat] = cats[b._cat] || []).push(n);
    });
    Object.keys(cats).forEach(function (cat) {
      wrap.appendChild(h('div', { class: 'picker-group' }, cat));
      cats[cat].forEach(function (n) {
        wrap.appendChild(pickerItem(n, FE.BUILTIN_KEYS[n].label, '内置'));
      });
    });
    if (!wrap.childNodes.length) wrap.appendChild(h('div', { class: 'status' }, '没有匹配项'));
    return wrap;
  }

  function pickerItem(name, label, kind) {
    return h('div', {
      class: 'picker-item' + (opts.current === name ? ' active' : ''),
      onclick: function () { modal.close(); opts.onPick(name, false); }
    },
      h('code', null, name),
      h('span', { class: 'picker-label' }, label || ' '),
      h('span', { class: 'picker-kind' }, kind));
  }

  var filter = h('input', { type: 'text', placeholder: '搜索：名称 / 标签，如 q、BackSpace、剪切…', class: 'mini-input wide' });
  var list = h('div', { class: 'picker-list' });
  list.appendChild(buildPickerList(''));
  filter.addEventListener('input', function () {
    clearEl(list);
    list.appendChild(buildPickerList(filter.value.trim().toLowerCase()));
  });
  modal.body.appendChild(h('div', { class: 'form-row' }, filter));
  modal.body.appendChild(list);
  if (opts.allowInline) {
    modal.toolbar.appendChild(h('button', {
      type: 'button',
      onclick: function () { modal.close(); opts.onPick(null, true); }
    }, '内联按键（无引用）'));
  }
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.close(); } }, '取消'));
  setTimeout(function () { filter.focus(); }, 50);
};

/* ================================================================
 * 动作编辑器（嵌入组件）—— 所有「需要一个动作」的地方共用这一个组件：
 * 按键手势、动作定义列表、宏的每一个步骤。
 *
 * spec 可以是一个 actionExpression：
 *   · 字符串            → 引用已命名动作（type 下拉选中 ref）
 *   · 动作对象 {type…}  → 直接动作
 *   · { action: X }     → 内联引用，语义等价于 X 本身
 *   · { macro: 名 }     → 宏调用
 *
 * opts:
 *   allowRef  是否提供「引用动作名」这一形态（宏步骤里这是常见写法）
 *   exclude   要隐藏的类型，如 ['macro']（宏步骤不能调用宏，嵌套会被运行时丢弃）
 *   onChange  任一控件改动 / 切换类型后回调（调用方据此写回，不用自己找控件绑事件）
 * 返回 { el, getValue() }；getValue() 对引用形态返回字符串，其余返回对象，空则 null。
 * ================================================================ */
/* 每个动作编辑器实例一份 datalist：id 必须唯一。
 * 同页可能同时存在多个动作编辑器（宏的每一步一个 + 动作定义列表 + 手势对话框），
 * 写死 id 会产生重复 id（非法 HTML，且 list= 的关联行为不可靠）。 */
var dlLayoutSeq = 0;

FE.buildActionEditor = function (spec, opts) {
  opts = opts || {};
  var excluded = Array.isArray(opts.exclude) ? opts.exclude : [];
  var allowRef = opts.allowRef === true;

  /* 引用形态：spec 是字符串，或 { action: '名字' } */
  var refName = null;
  if (typeof spec === 'string') { refName = spec; spec = null; }
  else if (FE.isPlainObject(spec)) {
    spec = FE.deepClone(spec);
    if (typeof spec.action === 'string') { refName = spec.action; spec = null; }
    else if (FE.isPlainObject(spec.action)) { spec = FE.deepClone(spec.action); }
  } else spec = null;

  var initType = refName != null ? 'ref'
    : (spec ? (spec.macro != null ? 'macro' : (spec.type || '')) : '');

  var root = h('div', { class: 'action-editor' });
  var typeSel = h('select', { class: 'mini-select' });
  var typeLabels = {
    key: '按键 key', modifier: '修饰 modifier', text: '文本 text', commit: '上屏 commit',
    switch_layout: '切换布局 switch_layout', app: '应用命令 app', macro: '宏调用 macro'
  };
  /* 选项顺序：引用形态优先（宏步骤最常用），随后是直接动作 */
  var ordered = [];
  if (allowRef) ordered.push(['ref', '引用动作名']);
  ordered.push(['', '（无动作）']);
  ordered.push(['key', typeLabels.key]);
  ['modifier', 'text', 'commit', 'switch_layout', 'app', 'macro'].forEach(function (k) {
    if (excluded.indexOf(k) < 0) ordered.push([k, typeLabels[k]]);
  });
  ordered.forEach(function (pair) {
    typeSel.appendChild(h('option', { value: pair[0], selected: pair[0] === initType }, pair[1]));
  });

  var fields = h('div', { class: 'action-fields' });
  root.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '类型'), typeSel));
  root.appendChild(fields);

  var keySel, metaChks = [], modSel, modStateSel, textInp, textTypeSel, layoutInp, cmdSel, argInp, macroSel, refSel;

  function emit() { if (typeof opts.onChange === 'function') opts.onChange(); }

  /* 控件是每次 buildFields 新建的，所以绑事件也在这里做（DOM 桩不冒泡，逐个绑） */
  function bindFields() {
    ['select', 'input', 'textarea'].forEach(function (tag) {
      fields.querySelectorAll(tag).forEach(function (c) {
        c.addEventListener('change', emit);
      });
    });
  }

  function buildFields() {
    clearEl(fields);
    metaChks = [];
    var t = typeSel.value;
    if (t === 'ref') {
      /* 引用已命名动作：列出 actions，当前值不在表内时补一个"未定义"项 */
      refSel = h('select', { class: 'mini-select wide action-ref-select' });
      var acts = (state.profile && FE.isPlainObject(state.profile.actions)) ? state.profile.actions : {};
      var names = Object.keys(acts);
      var hasCur = false;
      names.forEach(function (n) {
        var isCur = n === refName;
        if (isCur) hasCur = true;
        refSel.appendChild(h('option', { value: n, selected: isCur }, n + ' · ' + FE.actionDisplay(acts[n])));
      });
      if (!names.length) refSel.appendChild(h('option', { value: '' }, '（尚无动作定义，请先在「动作与宏」页新增）'));
      if (refName && !hasCur) {
        refSel.appendChild(h('option', { value: refName, selected: true }, refName + '（未在当前文件中定义）'));
      }
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '动作名'), refSel));
    } else if (t === 'key') {
      keySel = h('select', { class: 'mini-select wide' });
      FE.KEYCODE_GROUPS.forEach(function (g) {
        var og = h('optgroup', { label: g.label });
        /* 显示名仿 f5a-see-me：英文键名后加括号备注（如 ESCAPE（Esc 退出））。
         * value 始终是 code 本身，所以写出的 JSON 不受显示名影响。 */
        g.names.forEach(function (n) {
          og.appendChild(h('option', { value: n, selected: spec && spec.key === n }, FE.keycodeDisplayName(n)));
        });
        keySel.appendChild(og);
      });
      if (spec && spec.key && !FE.ALL_KEYCODES[spec.key]) {
        keySel.insertBefore(h('option', { value: spec.key, selected: true }, spec.key + '（自定义）'), keySel.firstChild);
      }
      var metaBox = h('div', { class: 'meta-checks' });
      ['SHIFT', 'CTRL', 'ALT', 'META'].forEach(function (m) {
        var chk = h('input', { type: 'checkbox' });
        var has = spec && spec.meta && (Array.isArray(spec.meta) ? spec.meta : [spec.meta]).some(function (x) {
          var name = FE.canonicalMetaName ? FE.canonicalMetaName(x) : String(x).toUpperCase();
          return name === m;
        });
        chk.checked = !!has;
        metaChks.push({ m: m, chk: chk });
        metaBox.appendChild(h('label', { class: 'mini-label check' }, chk, m));
      });
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '键'), keySel));
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '修饰'), metaBox));
    } else if (t === 'modifier') {
      modSel = h('select', { class: 'mini-select' });
      var modifierValue = FE.canonicalModifierName
        ? FE.canonicalModifierName(spec && spec.modifier)
        : (spec && spec.modifier != null ? String(spec.modifier).toUpperCase() : '');
      FE.MODIFIERS.forEach(function (m) { modSel.appendChild(h('option', { value: m, selected: modifierValue === m }, m)); });
      modStateSel = h('select', { class: 'mini-select' });
      /* TOGGLE_LOCKED 是命令（未锁定→锁定，已锁定→关闭），文档列为合法状态 */
      FE.MODIFIER_STATES.forEach(function (s) {
        modStateSel.appendChild(h('option', { value: s, selected: !spec || spec.state === s || (s === 'ONESHOT' && !spec.state) }, s));
      });
      fields.appendChild(h('div', { class: 'form-row form-inline' },
        h('label', { class: 'mini-label' }, '修饰键'), modSel,
        h('label', { class: 'mini-label' }, '状态'), modStateSel));
    } else if (t === 'text' || t === 'commit') {
      textTypeSel = h('select', { class: 'mini-select' });
      textTypeSel.appendChild(h('option', { value: 'text', selected: initType !== 'commit' }, 'text（直接输入）'));
      textTypeSel.appendChild(h('option', { value: 'commit', selected: initType === 'commit' }, 'commit（直接上屏）'));
      textTypeSel.addEventListener('change', function () { typeSel.value = textTypeSel.value; });
      textInp = h('input', { type: 'text', class: 'mini-input wide', value: spec && spec.text != null ? String(spec.text) : '', placeholder: '文本内容' });
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '方式'), textTypeSel));
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '内容'), textInp));
    } else if (t === 'switch_layout') {
      var dlId = 'dl-layouts-' + (++dlLayoutSeq);
      layoutInp = h('input', { type: 'text', class: 'mini-input wide', list: dlId, value: spec && spec.layout != null ? String(spec.layout) : '', placeholder: '布局名（如 numpad；symbols/emoji/kaomoji 为内置面板）' });
      var dl = h('datalist', { id: dlId });
      Object.keys(state.profile.layouts || {}).forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      ['symbols', 'emoji', 'kaomoji'].forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      fields.appendChild(dl);
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '目标布局'), layoutInp));
      fields.appendChild(h('div', { class: 'dialog-hint' }, '符号 / Emoji / 颜文字也可用「app」动作的 symbols / emoji / kaomoji 命令打开。'));
    } else if (t === 'app') {
      cmdSel = h('select', { class: 'mini-select wide' });
      FE.APP_COMMANDS.forEach(function (c) {
        cmdSel.appendChild(h('option', { value: c[0], selected: spec && spec.command === c[0] }, c[0] + ' · ' + c[1]));
      });
      argInp = h('input', { type: 'text', class: 'mini-input wide', value: spec && spec.argument != null ? String(spec.argument) : '', placeholder: '参数（仅 commit_text 等需要）' });
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '命令'), cmdSel));
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '参数'), argInp));
    } else if (t === 'macro') {
      macroSel = h('select', { class: 'mini-select wide' });
      var hasMacro = false;
      Object.keys(state.profile.macros || {}).forEach(function (n) {
        hasMacro = true;
        macroSel.appendChild(h('option', { value: n, selected: spec && spec.macro === n }, n));
      });
      if (!hasMacro) macroSel.appendChild(h('option', { value: '' }, '（尚无宏，请在“动作与宏”中添加）'));
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '宏'), macroSel));
    }
    bindFields();
  }
  typeSel.addEventListener('change', function () { buildFields(); emit(); });
  buildFields();

  function getValue() {
    var t = typeSel.value;
    if (!t) return null;
    if (t === 'ref') {
      /* 引用形态返回字符串：actionExpression 允许字符串，宏步骤里这是常见写法 */
      if (!refSel || !refSel.value) return null;
      return refSel.value;
    }
    if (t === 'key') {
      if (!keySel.value) return null;
      var a = { type: 'key', key: keySel.value };
      var ms = metaChks.filter(function (x) { return x.chk.checked; }).map(function (x) { return x.m; });
      if (ms.length) a.meta = ms;
      return a;
    }
    if (t === 'modifier') return { type: 'modifier', modifier: modSel.value, state: modStateSel.value };
    if (t === 'text' || t === 'commit') {
      if (!textInp.value) return null;
      return { type: textTypeSel ? textTypeSel.value : t, text: textInp.value };
    }
    if (t === 'switch_layout') {
      if (!layoutInp.value.trim()) return null;
      return { type: 'switch_layout', layout: layoutInp.value.trim() };
    }
    if (t === 'app') {
      if (!cmdSel.value) return null;
      var b = { type: 'app', command: cmdSel.value };
      if (argInp && argInp.value.trim()) b.argument = argInp.value.trim();
      return b;
    }
    if (t === 'macro') {
      if (!macroSel.value) return null;
      return { macro: macroSel.value };
    }
    return null;
  }

  return { el: root, getValue: getValue };
};

/* ================================================================
 * 手势对话框
 * opts: { slot, gesture, onChange(value) }
 *   value: undefined=移除字段(继承) / null=显式清除 / 对象或字符串
 * ================================================================ */
FE.openGestureDialog = function (opts) {
  var g = opts.gesture;
  var slot = opts.slot;
  var isLongPress = slot === 'longPress';
  var isHold = slot === 'hold';
  var names = {
    tap: '点击（tap）', doubleTap: '双击（doubleTap）',
    'swipe.up': '上滑（swipe.up）', 'swipe.down': '下滑（swipe.down）',
    'swipe.left': '左滑（swipe.left）', 'swipe.right': '右滑（swipe.right）',
    longPress: '长按（longPress）', hold: '按住（hold）'
  };
  var guard = FE.snapshotGuard(function () {
    return {
      mode: modeSel.value,
      ref: refName,
      actionName: actionName,
      macro: macroName,
      label: labelInp.value,
      hint: hintInp.value,
      popup: popupSel.value,
      repeat: repeatChk.checked,
      popupKey: popupKeyInp.value,
      direct: area._editor ? area._editor.getValue() : null,
      start: startEditor ? startEditor.getValue() : null,
      end: endEditor ? endEditor.getValue() : null
    };
  });
  var modal = openModal({
    title: '编辑手势 · ' + (names[slot] || slot),
    /* 有改动时点遮罩 / Esc / 「取消」要先确认 */
    onBeforeClose: guard.onBeforeClose
  });

  var mode;
  if (g == null) mode = 'inherit';
  else if (typeof g === 'string') mode = 'action-name';
  else if (FE.isPlainObject(g)) {
    if (g.ref != null) mode = 'ref';
    else if (g.macro != null) mode = 'macro';
    else mode = 'direct';
  } else mode = 'direct';

  var refName = (mode === 'ref' && FE.isPlainObject(g)) ? g.ref : null;
  var actionName = (mode === 'action-name' && typeof g === 'string') ? g : null;
  var macroName = (mode === 'macro' && FE.isPlainObject(g)) ? g.macro : null;
  var directSpec = null;
  if (mode === 'direct' && FE.isPlainObject(g)) {
    if (g.action != null) directSpec = g.action;
    else if (g.actions != null) directSpec = g.actions;
    else if (g.type != null) directSpec = FE.omit(g, ['label', 'popup', 'repeat', 'popupKey', 'hint']);
  }
  var startSpec = null, endSpec = null;
  if (isHold && FE.isPlainObject(g)) {
    startSpec = g.start != null ? g.start : null;
    endSpec = g.end != null ? g.end : null;
  }

  var modeSel = h('select', { class: 'mini-select' });
  var modeOptions = [
    ['inherit', '继承 / 移除此手势'],
    ['ref', '引用按键（ref）'],
    ['direct', '直接动作'],
    ['action-name', '动作名称（actions 里定义的）'],
    ['macro', '宏调用']
  ];
  modeOptions.forEach(function (m) { modeSel.appendChild(h('option', { value: m[0], selected: m[0] === mode }, m[1])); });

  var modeBox = h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '来源'), modeSel);
  var area = h('div', { class: 'gesture-area' });
  modal.body.appendChild(modeBox);
  modal.body.appendChild(area);

  var labelInp = h('input', { type: 'text', class: 'mini-input wide', value: (FE.isPlainObject(g) && g.label != null) ? String(g.label) : '', placeholder: '显示标签（留空继承被引用按键的标签）' });
  /* hint 是手势对象的独立补丁字段（与 label 并列）：显示为滑动提示文字，
   * 缺省时回退到 label / 被引用按键的标签。 */
  var hintInp = h('input', { type: 'text', class: 'mini-input wide', value: (FE.isPlainObject(g) && g.hint != null) ? String(g.hint) : '', placeholder: '提示文字 hint（留空继承 label）' });
  var popupSel = h('select', { class: 'mini-select' });
  [['', '弹出预览：继承'], ['1', '弹出预览：显示'], ['0', '弹出预览：隐藏']].forEach(function (o) {
    popupSel.appendChild(h('option', { value: o[0], selected: FE.isPlainObject(g) && g.popup === (o[0] === '1') && o[0] !== '' }, o[1]));
  });
  if (FE.isPlainObject(g) && g.popup === false) popupSel.value = '0';
  else if (FE.isPlainObject(g) && g.popup === true) popupSel.value = '1';

  var repeatChk = h('input', { type: 'checkbox' });
  repeatChk.checked = !!(FE.isPlainObject(g) && g.repeat);
  var popupKeyInp = h('input', { type: 'text', class: 'mini-input', value: (FE.isPlainObject(g) && g.popupKey != null) ? String(g.popupKey) : '', placeholder: '如 q（弹出菜单 profile 的键）' });

  var startEditor = null, endEditor = null;

  function buildArea() {
    clearEl(area);
    var m = modeSel.value;
    if (m === 'ref') {
      var show = h('button', {
        type: 'button', onclick: function () {
          FE.openKeyPicker({
            title: '选择手势引用的按键',
            current: refName,
            onPick: function (name) { refName = name; buildArea(); }
          });
        }
      }, refName ? '引用: ' + refName + '（点击更换）' : '选择按键…');
      area.appendChild(h('div', { class: 'form-row' }, show));
      var ev = refName ? FE.evalPlacement({ ref: refName }, FE.NEUTRAL_STATUS) : null;
      if (ev && !ev.unresolved) {
        var ti = FE.tapInfo(ev.eff, FE.NEUTRAL_STATUS);
        area.appendChild(h('div', { class: 'status' }, '将执行其点击动作: ' + (ti && ti.action ? ti.action.display : '（无）') + ' · 标签: ' + (FE.rawLabelOf(ev.eff, FE.NEUTRAL_STATUS) || '（无）')));
      } else if (refName) {
        area.appendChild(h('div', { class: 'status error' }, '⚠ 引用无法解析: ' + refName));
      }
    } else if (m === 'action-name') {
      var sel = h('select', { class: 'mini-select wide' });
      var acts = state.profile.actions || {};
      var has = false;
      Object.keys(acts).forEach(function (n) {
        has = true;
        sel.appendChild(h('option', { value: n, selected: actionName === n }, n + ' · ' + FE.actionDisplay(acts[n])));
      });
      if (!has) sel.appendChild(h('option', { value: '' }, '（尚无动作定义）'));
      sel.addEventListener('change', function () { actionName = sel.value; });
      if (actionName) sel.value = actionName;
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '动作'), sel));
    } else if (m === 'macro') {
      var msel = h('select', { class: 'mini-select wide' });
      var macros = state.profile.macros || {};
      var hasm = false;
      Object.keys(macros).forEach(function (n) {
        hasm = true;
        msel.appendChild(h('option', { value: n, selected: macroName === n }, n));
      });
      if (!hasm) msel.appendChild(h('option', { value: '' }, '（尚无宏定义）'));
      msel.addEventListener('change', function () { macroName = msel.value; });
      if (macroName) msel.value = macroName;
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '宏'), msel));
    } else if (m === 'direct') {
      var ed = FE.buildActionEditor(directSpec);
      area.appendChild(h('div', { class: 'form-row' }, ed.el));
      area._editor = ed;
    }
    /* 通用字段 */
    if (m !== 'inherit') {
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '标签'), labelInp, popupSel));
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '提示 hint'), hintInp));
      if (isLongPress) {
        area.appendChild(h('div', { class: 'form-row form-inline' },
          h('label', { class: 'mini-label check' }, repeatChk, ' 连续重复'),
          h('label', { class: 'mini-label' }, '弹出菜单键', popupKeyInp)));
        /* 弹出菜单联动：候选数提示 + 跳转编辑 */
        var pkHint = h('span', { class: 'status' });
        function updPkHint() {
          var k = popupKeyInp.value.trim();
          if (!k) { pkHint.textContent = '填写 popupKey 后可编辑其长按候选'; return; }
          if (FE.state && FE.state.popupProfile && FE.popupCandidates) {
            var schemaName = FE.popupSchemaName ? FE.popupSchemaName(FE.state.popupProfile, FE.state.popupSchema) : 'default';
            var c = FE.popupCandidates(FE.state.popupProfile, schemaName, k, false);
            pkHint.textContent = c ? '弹出菜单中该键有 ' + c.length + ' 个候选' : '弹出菜单未定义该键（可跳转补齐）';
          } else {
            pkHint.textContent = '候选在「弹出菜单」标签页编辑';
          }
        }
        popupKeyInp.addEventListener('input', updPkHint);
        updPkHint();
        area.appendChild(h('div', { class: 'form-row form-inline' },
          pkHint,
          h('button', {
            type: 'button', class: 'mini-button',
            onclick: function () {
              var k = popupKeyInp.value.trim();
              if (!k) { FE.uiAlert('请先填写弹出菜单键 popupKey'); return; }
              /* 跳走同样会丢掉当前改动，走一样的守卫。
               * 用 leaveThen 而非 confirmDiscard().then()：后者在「无改动」时
               * 返回的是 true 而不是 Promise，.then() 会直接报错。 */
              modal.leaveThen(function () {
                modal.close();
                if (FE.jumpToPopupEditor) FE.jumpToPopupEditor(k);
              });
            }
          }, '编辑弹出菜单候选 →')));
      }
      if (isHold) {
        startEditor = FE.buildActionEditor(startSpec);
        endEditor = FE.buildActionEditor(endSpec);
        area.appendChild(h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '开始动作'), startEditor.el));
        area.appendChild(h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '结束动作'), endEditor.el));
      }
    }
  }
  modeSel.addEventListener('change', buildArea);
  buildArea();

  /* 首轮 UI 建好后记基线：此后任何改动都能被 onBeforeClose 看出来 */
  guard.reset();

  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'danger',
    onclick: function () { modal.close(); opts.onChange(null); }
  }, '清除（置 null 屏蔽继承）'));
  /* 「取消」走守卫：有改动先确认 */
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      var m = modeSel.value;
      var value;
      if (m === 'inherit') { value = undefined; }
      else {
        var extras = {};
        if (labelInp.value !== '') extras.label = labelInp.value;
        if (hintInp.value !== '') extras.hint = hintInp.value;
        if (popupSel.value === '1') extras.popup = true;
        else if (popupSel.value === '0') extras.popup = false;
        if (m === 'ref') {
          if (!refName) { FE.uiAlert('请选择引用的按键'); return; }
          value = Object.assign({ ref: refName }, extras);
          /* hold 引用可额外覆盖 start/end（文档：A hold reference can additionally
           * override its start/... and end/... fields）。之前这里漏读，导致填了却丢失。 */
          if (isHold) {
            var stRef = startEditor ? startEditor.getValue() : null;
            var enRef = endEditor ? endEditor.getValue() : null;
            if (stRef) value.start = stRef;
            if (enRef) value.end = enRef;
          }
        } else if (m === 'action-name') {
          if (!actionName) { FE.uiAlert('请选择动作'); return; }
          value = Object.keys(extras).length ? Object.assign({ action: actionName }, extras) : actionName;
        } else if (m === 'macro') {
          if (!macroName) { FE.uiAlert('请选择宏'); return; }
          value = Object.assign({ macro: macroName }, extras);
        } else {
          var act = area._editor ? area._editor.getValue() : null;
          if (isHold) {
            value = Object.assign({}, extras);
            var st = startEditor ? startEditor.getValue() : null;
            var en = endEditor ? endEditor.getValue() : null;
            if (st) value.start = st;
            if (en) value.end = en;
            if (!value.start && !value.end && !Object.keys(extras).length) { FE.uiAlert('请至少配置开始或结束动作'); return; }
          } else {
            if (!act && !Object.keys(extras).length) { FE.uiAlert('请配置动作'); return; }
            value = act ? Object.assign({}, act, extras) : Object.assign({}, extras);
            if (isLongPress && repeatChk.checked) value.repeat = true;
            if (isLongPress && popupKeyInp.value.trim() !== '') value.popupKey = popupKeyInp.value.trim();
          }
        }
      }
      modal.close();
      opts.onChange(value);
    }
  }, '保存'));
};

/* ================================================================
 * 状态变体对话框
 * opts: { variant, onChange(newVariant) }
 * ================================================================ */
FE.openVariantDialog = function (opts) {
  var v = FE.isPlainObject(opts.variant) ? FE.deepClone(opts.variant) : {};
  var guard = FE.snapshotGuard(function () {
    var conds = {};
    ['composing', 'ascii_mode', 'disabled'].forEach(function (c) { conds[c] = condSels[c].value; });
    return {
      conds: conds,
      ref: refName,
      label: labelInp.value,
      shiftedLabel: shiftedInp.value,
      /* tapValue 的 undefined（未设置）与 null（显式清除）是两种语义，
       * stableJson 会分别编码，不会被当成同一个值 */
      tap: tapValue,
      extra: extraTa.value
    };
  });
  var modal = openModal({
    title: '编辑状态变体',
    onBeforeClose: guard.onBeforeClose
  });

  var condSels = {};
  var condBox = h('div', { class: 'form-row form-inline' });
  ['composing', 'ascii_mode', 'disabled'].forEach(function (c) {
    var cur = v.when && v.when.rime ? v.when.rime[c] : undefined;
    var s = h('select', { class: 'mini-select' });
    s.appendChild(h('option', { value: '' }, c + ':忽略'));
    s.appendChild(h('option', { value: '1', selected: cur === true }, c + ':真'));
    s.appendChild(h('option', { value: '0', selected: cur === false }, c + ':假'));
    condSels[c] = s;
    condBox.appendChild(s);
  });
  modal.body.appendChild(h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '当条件（同时满足，最后匹配者生效）'), condBox));

  var refName = typeof v.ref === 'string' ? v.ref : null;
  var refBtn = h('button', {
    type: 'button',
    onclick: function () {
      FE.openKeyPicker({
        title: '选择变体替换引用（可选）',
        current: refName,
        onPick: function (name) { refName = name; refBtn.textContent = refName ? '替换引用: ' + refName : '设置替换引用…（可选）'; }
      });
    }
  }, refName ? '替换引用: ' + refName : '设置替换引用…（可选）');
  modal.body.appendChild(h('div', { class: 'form-row' }, refBtn));

  var labelInp = h('input', { type: 'text', class: 'mini-input', value: v.label != null ? String(v.label) : '', placeholder: '标签' });
  var shiftedInp = h('input', { type: 'text', class: 'mini-input', value: v.shiftedLabel != null ? String(v.shiftedLabel) : '', placeholder: 'Shift 标签' });
  modal.body.appendChild(h('div', { class: 'form-grid-2' },
    h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '标签'), labelInp),
    h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, 'Shift标签'), shiftedInp)));

  var tapValue = v.tap !== undefined ? FE.deepClone(v.tap) : undefined;
  var tapBtn = h('button', {
    type: 'button',
    onclick: function () {
      FE.openGestureDialog({
        slot: 'tap',
        gesture: tapValue,
        onChange: function (nv) { tapValue = nv; updateTapSummary(); }
      });
    }
  }, '配置点击动作…');
  var tapSum = h('span', { class: 'status' });
  function updateTapSummary() {
    var gi = tapValue !== undefined ? FE.gestureInfo(tapValue, FE.NEUTRAL_STATUS) : null;
    tapSum.textContent = gi && gi.action ? gi.action.display : '（未设置）';
  }
  updateTapSummary();
  modal.body.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '点击'), tapBtn, tapSum));

  var known = ['when', 'ref', 'label', 'shiftedLabel', 'tap'];
  var extraObj = {};
  Object.keys(v).forEach(function (k) { if (known.indexOf(k) < 0) extraObj[k] = v[k]; });
  var extraTa = h('textarea', { class: 'json-editor small', rows: 3, spellcheck: 'false' });
  extraTa.value = Object.keys(extraObj).length ? JSON.stringify(extraObj, null, 2) : '';
  modal.body.appendChild(h('div', { class: 'form-row' },
    h('label', { class: 'mini-label' }, '其他字段 JSON（如 weight、icon、modifier 等，可选）'), extraTa));

  /* 「取消」走守卫：有改动先确认 */
  guard.reset();
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      var out = {};
      var when = {};
      ['composing', 'ascii_mode', 'disabled'].forEach(function (c) {
        if (condSels[c].value !== '') when[c] = condSels[c].value === '1';
      });
      if (Object.keys(when).length) out.when = { rime: when };
      if (refName) out.ref = refName;
      if (labelInp.value !== '') out.label = labelInp.value;
      if (shiftedInp.value !== '') out.shiftedLabel = shiftedInp.value;
      if (tapValue !== undefined) out.tap = tapValue;
      var extra = {};
      if (extraTa.value.trim() !== '') {
        try { extra = JSON.parse(extraTa.value); } catch (e) { FE.uiAlert('其他字段 JSON 无效: ' + e.message); return; }
      }
      Object.keys(extra).forEach(function (k) { if (!(k in out)) out[k] = extra[k]; });
      modal.close();
      opts.onChange(out);
    }
  }, '保存'));
};

/* ================================================================
 * 主按键对话框（放置 / 按键定义）
 * opts: { mode:'placement'|'definition', placement?, name?, location?, grid? }
 * ================================================================ */
FE.openKeyDialog = function (opts) {
  var isPlacement = opts.mode === 'placement';
  /* container 在操作时实时解析（移动按键可能改变行容器） */
  function container() { return FE.placementContainer(opts.location); }
  if (isPlacement && !container()) return;

  var draft;
  if (isPlacement) {
    draft = FE.deepClone(opts.placement || {});
    /* 扁平化 override 到直接字段：按文档优先级 直接字段 > override，
     * 所以先铺 override，再用直接字段覆盖它（冲突时直接字段赢）。 */
    if (FE.isPlainObject(draft.override)) {
      var ov = draft.override;
      delete draft.override;
      var flat = FE.deepClone(ov);
      Object.keys(draft).forEach(function (k) { flat[k] = FE.deepClone(draft[k]); });
      draft = flat;
    }
  } else {
    draft = FE.deepClone((state.profile.keys || {})[opts.name] || {});
  }

  /* 未保存改动的守卫。快照函数返回**原始值**（由 snapshotGuard 内部序列化）——
   * 自己先 stableJson 会双重编码，导致「没改」被误判成「改了」。 */
  var guard = FE.snapshotGuard(function () {
    if (!isPlacement && nameInput) {
      return { def: draft, name: String(nameInput.value) };  // 定义模式改名也算改动
    }
    return draft;
  });
  var modal = openModal({
    title: isPlacement
      ? '编辑按键' + (opts.grid ? '（网格）' : '')
      : '编辑按键定义',
    wide: true,
    /* 点遮罩 / Esc / 「取消」前先问一句：有未保存改动就别静默丢弃 */
    onBeforeClose: guard.onBeforeClose
  });
  var formHost = h('div');
  modal.body.appendChild(formHost);

  var nameInput = null;  // definition 模式下可改名

  function effObj() {
    return FE.evalPlacement(draft, FE.NEUTRAL_STATUS).eff;
  }
  function effRaw(field) {
    var e = effObj();
    return e[field];
  }

  function refSummary() {
    if (isPlacement) return draft.ref ? draft.ref : '内联按键（无引用）';
    return (draft.ref ? draft.ref : '（无基础引用）');
  }

  /* ---------- 表单构建 ---------- */
  function buildForm() {
    FE.closeActiveColorPicker();   /* 重建前收起取色面板，避免留下悬空面板 */
    clearEl(formHost);

    /* 基本信息 */
    var basic = h('details', { class: 'card inner-card', open: true });
    basic.appendChild(h('summary', null, '基本信息'));
    var b = h('div', { class: 'inner-card-body' });

    if (!isPlacement) {
      nameInput = h('input', { type: 'text', class: 'mini-input', value: opts.name || '', placeholder: '按键定义名称' });
      b.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '名称'), nameInput,
        h('span', { class: 'status' }, '（改名会自动更新所有引用）')));
    }

    var refBtn = h('button', { type: 'button', onclick: function () {
      FE.openKeyPicker({
        title: '选择引用',
        current: draft.ref || null,
        onPick: function (name, inline) {
          if (inline) delete draft.ref;
          else draft.ref = name;
          buildForm();
        }
      });
    } }, refSummary() + '（点击更换）');
    b.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '引用'), refBtn));
    var chainInfo = FE.evalPlacement(draft, FE.NEUTRAL_STATUS);
    if (chainInfo.chain.length) {
      b.appendChild(h('div', { class: 'status' }, '解析链: ' + chainInfo.chain.join(' → ')));
    }
    if (chainInfo.unresolved) {
      b.appendChild(h('div', { class: 'status error' }, '⚠ 引用无法解析: ' + chainInfo.unresolved));
    }

    var labelInp = h('input', { type: 'text', class: 'mini-input', value: draft.label != null ? String(draft.label) : '', placeholder: '本地覆盖（留空继承: ' + (FE.rawLabelOf(effObj(), FE.NEUTRAL_STATUS) || '无') + '）' });
    labelInp.addEventListener('change', function () {
      if (labelInp.value === '') delete draft.label;
      else draft.label = labelInp.value;
    });
    var shiftedInp = h('input', { type: 'text', class: 'mini-input', value: draft.shiftedLabel != null ? String(draft.shiftedLabel) : '', placeholder: '留空继承' });
    shiftedInp.addEventListener('change', function () {
      if (shiftedInp.value === '') delete draft.shiftedLabel;
      else draft.shiftedLabel = shiftedInp.value;
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '标签'), labelInp),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, 'Shift标签'), shiftedInp)));

    var ktSel = h('select', { class: 'mini-select' });
    ktSel.appendChild(h('option', { value: '', selected: draft.keyType == null }, '继承' + (effRaw('keyType') ? '（' + effRaw('keyType') + '）' : '')));
    ktSel.appendChild(h('option', { value: '__null__', selected: draft.keyType === null }, '清除（null）'));
    FE.KEY_TYPES.forEach(function (t) { ktSel.appendChild(h('option', { value: t, selected: draft.keyType === t }, t)); });
    ktSel.addEventListener('change', function () {
      if (ktSel.value === '') delete draft.keyType;
      else if (ktSel.value === '__null__') draft.keyType = null;
      else draft.keyType = ktSel.value;
    });
    var iconSel = h('select', { class: 'mini-select' });
    iconSel.appendChild(h('option', { value: '', selected: draft.icon == null }, '继承' + (effRaw('icon') ? '（' + effRaw('icon') + '）' : '')));
    iconSel.appendChild(h('option', { value: '__null__', selected: draft.icon === null }, '清除（null）'));
    FE.ICONS.forEach(function (t) { iconSel.appendChild(h('option', { value: t, selected: draft.icon === t }, t)); });
    iconSel.addEventListener('change', function () {
      if (iconSel.value === '') delete draft.icon;
      else if (iconSel.value === '__null__') draft.icon = null;
      else draft.icon = iconSel.value;
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '键类型'), ktSel),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '图标'), iconSel)));

    var effWeight = effRaw('weight');
    var weightInp = h('input', { type: 'number', step: 'any', min: '0', class: 'mini-input', value: typeof draft.weight === 'number' ? String(draft.weight) : '', placeholder: '留空继承' + (effWeight != null ? '(' + effWeight + ')' : '(1)') });
    var weightAuto = h('input', { type: 'checkbox' });
    weightAuto.checked = draft.weight === 'auto';
    weightInp.disabled = weightAuto.checked;
    weightAuto.addEventListener('change', function () {
      if (weightAuto.checked) { draft.weight = 'auto'; weightInp.disabled = true; }
      else { delete draft.weight; weightInp.disabled = false; }
    });
    weightInp.addEventListener('change', function () {
      if (weightInp.value === '') delete draft.weight;
      else draft.weight = parseFloat(weightInp.value);
    });
    var effHeight = effRaw('height');
    var heightInp = h('input', { type: 'number', step: 'any', min: '0', class: 'mini-input', value: typeof draft.height === 'number' ? String(draft.height) : '', placeholder: '留空继承' + ((typeof effHeight === 'number' && effHeight > 0) ? '(' + effHeight + ')' : '(1)') });
    heightInp.addEventListener('change', function () {
      if (heightInp.value === '') delete draft.height;
      else draft.height = parseFloat(heightInp.value);
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label check' }, weightAuto, ' 权重'), weightInp),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '高度'), heightInp)));

    var tsInp = h('input', { type: 'number', step: '1', min: '1', class: 'mini-input', value: typeof draft.textSize === 'number' ? String(draft.textSize) : '', placeholder: 'sp，留空继承' });
    tsInp.addEventListener('change', function () {
      if (tsInp.value === '') delete draft.textSize;
      else draft.textSize = parseInt(tsInp.value, 10);
    });
    /* 提示文字大小：统一值（数字）或按方向对象 {up,down,left,right}；「清除」写显式 null。
     * 语义：方向输入把数字转为对象时，其余方向保留原统一值；统一值输入则整体覆盖并清空方向框。 */
    var htsDirs = {};
    var htsInp = h('input', { type: 'number', step: '1', min: '1', class: 'mini-input', value: typeof draft.hintTextSize === 'number' ? String(draft.hintTextSize) : '', placeholder: 'sp，留空继承' });
    ['up', 'down', 'left', 'right'].forEach(function (d) {
      var dv = FE.isPlainObject(draft.hintTextSize) ? draft.hintTextSize[d] : undefined;
      var di = h('input', { type: 'number', step: '1', min: '1', class: 'mini-input', value: typeof dv === 'number' ? String(dv) : '', placeholder: 'sp', title: '该方向滑动提示字号（sp）' });
      htsDirs[d] = di;
      di.addEventListener('change', function () {
        if (di.value === '') {
          if (!FE.isPlainObject(draft.hintTextSize)) return;
          delete draft.hintTextSize[d];
          if (!Object.keys(draft.hintTextSize).length) delete draft.hintTextSize;
        } else {
          var prev = (typeof draft.hintTextSize === 'number') ? draft.hintTextSize : null;
          if (!FE.isPlainObject(draft.hintTextSize)) {
            delete draft.hintTextSize;
            draft.hintTextSize = {};
            htsInp.value = '';
            if (prev != null) {
              ['up', 'down', 'left', 'right'].forEach(function (od) {
                if (od !== d) draft.hintTextSize[od] = prev;
              });
            }
          }
          draft.hintTextSize[d] = parseInt(di.value, 10);
        }
      });
    });
    var htsClear = h('button', { type: 'button', class: 'mini-button', title: '显式清除（null）：移除继承的提示字号', onclick: function () {
      draft.hintTextSize = null;
      htsInp.value = '';
      ['up', 'down', 'left', 'right'].forEach(function (d) { htsDirs[d].value = ''; });
    } }, '清除');
    htsInp.addEventListener('change', function () {
      if (htsInp.value === '') {
        if (draft.hintTextSize == null || typeof draft.hintTextSize === 'number') delete draft.hintTextSize;
      } else {
        var nv = parseInt(htsInp.value, 10);
        delete draft.hintTextSize;
        draft.hintTextSize = nv;
        ['up', 'down', 'left', 'right'].forEach(function (d) { htsDirs[d].value = ''; });
      }
    });
    var idInp = h('input', { type: 'text', class: 'mini-input', value: draft.id != null ? String(draft.id) : '', placeholder: '如 space（留空继承）' });
    idInp.addEventListener('change', function () {
      if (idInp.value === '') delete draft.id;
      else draft.id = idInp.value;
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '文字大小'), tsInp),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, 'ID'), idInp)));
    var htsRow = h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '提示大小'), htsInp, htsClear);
    b.appendChild(htsRow);
    var htsGrid = h('div', { class: 'form-grid-2 hts-dir-grid' });
    [['up', '上'], ['down', '下'], ['left', '左'], ['right', '右']].forEach(function (dd) {
      htsGrid.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '提示·' + dd[1]), htsDirs[dd[0]]));
    });
    b.appendChild(htsGrid);

    var slSel = h('select', { class: 'mini-select' });
    var slCur = draft.statusLabel;
    var slObjSource = FE.isPlainObject(slCur) && typeof slCur.source === 'string' ? slCur.source : null;
    var slIsSwitch = !!(slObjSource && slObjSource.indexOf('switch:') === 0);
    slSel.appendChild(h('option', { value: '', selected: slCur == null }, '继承（' + (effRaw('statusLabel') != null ? (typeof effRaw('statusLabel') === 'string' ? effRaw('statusLabel') : '对象') : '无') + '）'));
    slSel.appendChild(h('option', { value: '__null__', selected: slCur === null }, '清除（null）'));
    slSel.appendChild(h('option', { value: 'schema_name', selected: slCur === 'schema_name' }, 'schema_name（方案名，字符串）'));
    slSel.appendChild(h('option', { value: '__obj__schema_name', selected: slObjSource === 'schema_name' }, '{ "source": "schema_name" }（对象形式）'));
    slSel.appendChild(h('option', { value: '__switch__', selected: slIsSwitch }, 'switch:<开关名>（该开关的当前状态标签）'));
    /* switch:<name> 源需要填开关名（文档：switch:<name> 取该开关的当前状态标签） */
    var slSwitchInp = h('input', {
      type: 'text', class: 'mini-input',
      value: slIsSwitch ? slObjSource.slice(7) : '',
      placeholder: '开关名，如 ascii_mode',
      style: { display: slIsSwitch ? '' : 'none' }
    });
    slSwitchInp.addEventListener('change', function () {
      var swName = slSwitchInp.value.trim();
      if (!swName) { delete draft.statusLabel; }
      else draft.statusLabel = { source: 'switch:' + swName };
      buildForm();
    });
    slSel.addEventListener('change', function () {
      if (slSel.value === '') delete draft.statusLabel;
      else if (slSel.value === '__null__') draft.statusLabel = null;
      else if (slSel.value === '__switch__') draft.statusLabel = { source: 'switch:' + slSwitchInp.value.trim() };
      else if (slSel.value.indexOf('__obj__') === 0) draft.statusLabel = { source: slSel.value.slice(7) };
      else draft.statusLabel = slSel.value;
      buildForm();
    });
    var modSel = h('select', { class: 'mini-select' });
    modSel.appendChild(h('option', { value: '', selected: draft.modifier == null }, '继承（' + (effRaw('modifier') || '无') + '）'));
    modSel.appendChild(h('option', { value: '__null__', selected: draft.modifier === null }, '清除（null）'));
    FE.MODIFIERS.forEach(function (m) { modSel.appendChild(h('option', { value: m, selected: draft.modifier === m }, m)); });
    modSel.addEventListener('change', function () {
      if (modSel.value === '') delete draft.modifier;
      else if (modSel.value === '__null__') draft.modifier = null;
      else draft.modifier = modSel.value;
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '状态标签'), slSel),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '修饰键'), modSel)));
    /* 选中 switch:<name> 源时才显示开关名输入框 */
    if (slIsSwitch) {
      b.appendChild(h('div', { class: 'form-row form-inline' },
        h('label', { class: 'mini-label' }, '开关名'), slSwitchInp));
    }

    basic.appendChild(b);
    formHost.appendChild(basic);

    /* 网格坐标 */
    if (isPlacement && opts.grid) {
      var gcard = h('details', { class: 'card inner-card', open: true });
      gcard.appendChild(h('summary', null, '网格位置'));
      var gb = h('div', { class: 'inner-card-body form-grid-2' });
      function gridNum(field, label, ph) {
        var inp = h('input', { type: 'number', step: '1', min: '0', class: 'mini-input', value: draft[field] != null ? String(draft[field]) : '', placeholder: ph });
        inp.addEventListener('change', function () {
          if (inp.value === '') delete draft[field];
          else draft[field] = parseInt(inp.value, 10);
        });
        return h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, label), inp);
      }
      gb.appendChild(gridNum('column', '列 (column)', '0 起'));
      gb.appendChild(gridNum('row', '行 (row)', '0 起'));
      gb.appendChild(gridNum('columnSpan', '列跨 (columnSpan)', '默认 1'));
      gb.appendChild(gridNum('rowSpan', '行跨 (rowSpan)', '默认 1'));
      gcard.appendChild(gb);
      formHost.appendChild(gcard);
    }

    /* 手势 */
    var gcard2 = h('details', { class: 'card inner-card', open: true });
    gcard2.appendChild(h('summary', null, '手势'));
    var gb2 = h('div', { class: 'inner-card-body' });

    function gestureRow(slot, label) {
      var cur = draft;
      var val;
      if (slot.indexOf('swipe.') === 0) {
        val = (FE.isPlainObject(draft.swipe) ? draft.swipe[slot.slice(6)] : undefined);
      } else val = draft[slot];
      var gi = val !== undefined ? FE.gestureInfo(val, FE.NEUTRAL_STATUS) : null;
      var summary = gi ? ((gi.label ? '「' + gi.label + '」 ' : '') + (gi.action ? gi.action.display : '无动作')) : '（继承）';
      if (val === undefined) {
        var effG = effObj();
        var effVal = slot.indexOf('swipe.') === 0 ? (effG.swipe ? effG.swipe[slot.slice(6)] : undefined) : effG[slot];
        var gi2 = effVal !== undefined && effVal != null ? FE.gestureInfo(effVal, FE.NEUTRAL_STATUS) : null;
        summary = gi2 ? ((gi2.label ? '「' + gi2.label + '」 ' : '') + (gi2.action ? gi2.action.display : '无动作')) : '（无）';
      }
      var canClear = slot !== 'tap';
      return h('div', { class: 'gesture-row' },
        h('span', { class: 'gesture-name' }, label),
        h('span', { class: 'gesture-sum' }, summary),
        h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            FE.openGestureDialog({
              slot: slot,
              gesture: val === undefined ? null : val,
              onChange: function (nv) {
                setGesture(slot, nv);
                buildForm();
              }
            });
          }
        }, '编辑…'),
        canClear ? h('button', {
          type: 'button', class: 'mini-button danger',
          title: '置 null，屏蔽继承',
          onclick: function () { setGesture(slot, null); buildForm(); }
        }, '清除') : null,
        canClear && val !== undefined ? h('button', {
          type: 'button', class: 'mini-button',
          title: '删除字段，恢复继承',
          onclick: function () { setGesture(slot, undefined); buildForm(); }
        }, '继承') : null
      );
    }
    function setGesture(slot, nv) {
      if (slot.indexOf('swipe.') === 0) {
        var d = slot.slice(6);
        if (!FE.isPlainObject(draft.swipe)) draft.swipe = {};
        if (nv === undefined) delete draft.swipe[d];
        else draft.swipe[d] = nv;
        if (!Object.keys(draft.swipe).length) delete draft.swipe;
      } else {
        if (nv === undefined) delete draft[slot];
        else draft[slot] = nv;
      }
    }

    gb2.appendChild(gestureRow('tap', '点击 tap'));
    gb2.appendChild(gestureRow('doubleTap', '双击 doubleTap'));
    ['up', 'down', 'left', 'right'].forEach(function (d) {
      gb2.appendChild(gestureRow('swipe.' + d, '滑动·' + ({ up: '上', down: '下', left: '左', right: '右' })[d]));
    });
    gb2.appendChild(gestureRow('longPress', '长按 longPress'));
    gb2.appendChild(gestureRow('hold', '按住 hold'));
    gcard2.appendChild(gb2);
    formHost.appendChild(gcard2);

    /* 状态变体 */
    var vcard = h('details', { class: 'card inner-card' });
    vcard.appendChild(h('summary', null, '状态变体（组字 / ASCII / 停用时切换）'));
    var vb = h('div', { class: 'inner-card-body' });
    var variants = Array.isArray(draft.variants) ? draft.variants : [];
    variants.forEach(function (v, vi) {
      var conds = v && v.when && v.when.rime ? Object.keys(v.when.rime).map(function (c) { return c + '=' + v.when.rime[c]; }).join(' ') : '（无条件）';
      var fields = v ? Object.keys(FE.omit(v, ['when'])).join(', ') : '';
      vb.appendChild(h('div', { class: 'variant-row' },
        h('span', { class: 'gesture-name' }, conds),
        h('span', { class: 'gesture-sum' }, fields),
        h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            FE.openVariantDialog({
              variant: v,
              onChange: function (nv) { draft.variants[vi] = nv; buildForm(); }
            });
          }
        }, '编辑…'),
        h('button', {
          type: 'button', class: 'mini-button danger',
          onclick: function () { draft.variants.splice(vi, 1); if (!draft.variants.length) delete draft.variants; buildForm(); }
        }, '✕')
      ));
    });
    vb.appendChild(h('button', {
      type: 'button', class: 'mini-button',
      onclick: function () {
        FE.openVariantDialog({
          variant: null,
          onChange: function (nv) {
            if (!Array.isArray(draft.variants)) draft.variants = [];
            draft.variants.push(nv);
            buildForm();
          }
        });
      }
    }, '+ 添加变体'));
    vcard.appendChild(vb);
    formHost.appendChild(vcard);

    /* 颜色：4 个常用角色 + shadow + states，全部用 jscolor 点选（f5a-see-me 同款） */
    var ccard = h('details', { class: 'card inner-card' });
    ccard.appendChild(h('summary', null, '按键颜色覆盖（可选）'));
    var cb = h('div', { class: 'inner-card-body' });
    var draftColors = function () {
      if (!FE.isPlainObject(draft.colors)) draft.colors = {};
      return draft.colors;
    };
    function cleanupColors() {
      /* 清理空的 states 子对象与空的 colors，避免残留 {} */
      var c = draft.colors;
      if (!FE.isPlainObject(c)) return;
      if (FE.isPlainObject(c.states)) {
        Object.keys(c.states).forEach(function (k) {
          if (!FE.isPlainObject(c.states[k]) || !Object.keys(c.states[k]).length) delete c.states[k];
        });
        if (!Object.keys(c.states).length) delete c.states;
      }
      if (!Object.keys(c).length) delete draft.colors;
    }
    /* ---------------- 全链路回显（当前生效色 + 它来自哪一级） ----------------
     * 为什么只能做在 UI 层：Foxy 布局 JSON **不支持**「颜色引用主题字段」
     * （skills/foxy-keyboard-layout.schema.json:115 的 colors 是自由对象；
     *  SKILL.md:892-893 规定值只能是 #RRGGBB / #AARRGGBB 字面量）。
     * 所以值仍写字面量，但每一行都要让用户看见：
     *   · 当前实际生效的是哪个色、由哪一级给出（① 状态色 > ② 本键 colors > ③ 主题 keyTypes > ④ 主题全局）；
     *   · 留空（清除）后会继承/回落到哪一个色；
     *   · 若来源是主题 → 给一个「到主题页改」入口。
     * 解析全部复用 js/color-source.js（FE.resolveRole / FE.colorSourceLabel）。 */
    var effectRefreshers = [];
    function hasColorSource() { return typeof FE.resolveRole === 'function'; }
    function roleOpts() { return { includeBuiltin: true }; }
    /* 内联样式小工具：本任务不允许改 style.css，所以回显块的排版只用内联样式。
     * 字号取 11.5px 与 .status（12.5px）同档，在 ≤640px 手机宽度下也读得清。 */
    function st(o) { return o; }
    var ST_BOX = st({ margin: '0 0 8px 0', padding: '0 0 0 2px' });
    var ST_TEXT = st({ fontSize: '11.5px', lineHeight: '1.5', margin: '2px 0', color: '#9aa0a8', wordBreak: 'break-all' });
    var ST_FALLBACK = st({ fontSize: '11.5px', lineHeight: '1.5', margin: '0', color: '#8a8f98', wordBreak: 'break-all' });
    var ST_ROW = st({ margin: '6px 0 0 0' });
    var ST_JUMP = st({ fontSize: '11.5px', padding: '1px 6px' });
    function effSafe() {
      try { return effObj(); } catch (e) { return null; }
    }
    /* 剥掉「本行自己那一个值」的轻量 eff，用来算「清空后会回落到哪一级」。
     * 只保留 resolveRole 真正读取的字段（colors / keyType / spacer），避免深克隆。
     * 非状态行剥 colors[role]；状态行剥 colors.states[state][role]。 */
    function effWithout(eff, role, stateName) {
      if (!FE.isPlainObject(eff)) return eff;
      var out = { keyType: eff.keyType, spacer: eff.spacer, colors: null };
      var c = FE.isPlainObject(eff.colors) ? eff.colors : null;
      if (!c) return out;
      var nc = {};
      Object.keys(c).forEach(function (k) {
        if (k === 'states') return;
        if (!stateName && k === role) return;
        nc[k] = c[k];
      });
      if (FE.isPlainObject(c.states)) {
        var ns = {};
        Object.keys(c.states).forEach(function (st) {
          var so = c.states[st];
          if (!FE.isPlainObject(so)) return;
          var no = {};
          Object.keys(so).forEach(function (k) {
            if (stateName === st && k === role) return;
            no[k] = so[k];
          });
          if (Object.keys(no).length) ns[st] = no;
        });
        if (Object.keys(ns).length) nc.states = ns;
      }
      out.colors = nc;
      return out;
    }
    /* 一行「色值 ← 来源」文案。own 为真 = 这个值就是本行（本键）自己写的那一个。 */
    /* 一行「色值 ← 来源」文案。kind 说明这个值在继承链里的身份，措辞必须跟着变：
     *   'own'   本行自己写的那一个（本键自己的设置）
     *   'base'  状态行留空时回落到的**本键基础角色**（colors[role]，同为布局 values）
     *   'chain' 其余情况（引用链上级 / 主题 / 内置默认）
     * ⚠️ 别把 base 写成「引用链上级」：状态行的基础色就是本键自己的 colors[role]。 */
    function roleText(r, kind) {
      kind = kind || 'chain';
      if (!r || r.value == null) return '未定义（该键与主题都未给出此颜色 → Foxy 端不绘制）';
      var from = FE.colorSourceLabel(r.source, r.detail);
      var tail;
      if (r.source === FE.COLOR_SOURCES.LAYOUT_STATE) {
        tail = '（本键自己的状态色设置）';
      } else if (r.source === FE.COLOR_SOURCES.LAYOUT_KEY) {
        tail = (kind === 'own') ? '（本键自己的设置）'
          : (kind === 'base') ? '（本键基础角色的 colors）'
            : '（引用链上级的布局 colors）';
      } else if (r.source === FE.COLOR_SOURCES.BUILTIN) {
        /* ⚠️ 必须区分两种口径，别一律写成「未导入主题」：
         *   · 主题**确实没导入** → 内置默认就是 Foxy 端的实际取值；
         *   · 主题已导入、但③ keyTypes 与④ 全局都没给这个字段 → 落到 App 内置默认色，
         *     这是编辑器的兜底显示（预览在已导入主题时不写内联色）。
         * 「清空后」的语义由调用方的「清空后 → 」前缀表达，这里不重复。 */
        tail = themeImported()
          ? '（主题未给此级 → 按 App 内置默认色兜底显示）'
          : '（未导入主题 → 按 App 内置默认配色）';
      } else {
        tail = '（来自主题，改主题即同步）';
      }
      return r.value + '　← ' + from + tail;
    }
    /* 主题是否已导入（决定回显口径：主题值 vs App 内置默认兜底） */
    function themeImported() {
      var p = FE.state && FE.state.themeProfile;
      return !!p && typeof p === 'object';
    }
    function themeSourced(r) {
      return !!r && typeof r.source === 'string' && r.source.indexOf('theme.') === 0;
    }
    /* 「到主题页改」入口。⚠️ 主题页与对话框不能同时开着：必须走 leaveThen
     * （无未保存改动时同步放行，有改动则先确认），确认后再 close() + 切标签页。
     * 直接用 requestClose() 会在有改动时只关框、不跳转（用户看到「点了没反应」）。 */
    function themeJumpBtn(extraClass) {
      return h('button', {
        type: 'button', class: 'mini-button color-theme-jump' + (extraClass ? ' ' + extraClass : ''),
        title: '此颜色由主题文件决定；去主题页修改（未保存的改动会先确认）',
        onclick: function () {
          modal.leaveThen(function () {
            modal.close();
            if (FE.activateTab) FE.activateTab('tab-theme');
          });
        }
      }, '到主题页改 →');
    }
    function refreshColorEffects(eff) {
      var e = eff === undefined ? effSafe() : eff;
      effectRefreshers.forEach(function (fn) {
        try { fn(e); } catch (err) { /* 单行回显出错不影响其它行 */ }
      });
    }

    /* 单个颜色行：jscolor 输入框 + 「清除」按钮 + **全链路回显块**。
     * get/set 用于读写 draft 中对应位置的值（支持 states.xxx.role 嵌套）；
     * rowOpts.state 非空表示这是 colors.states[state][role] 行。 */
    function colorRow(label, role, get, set, rowOpts) {
      rowOpts = rowOpts || {};
      var stateName = rowOpts.state || null;
      var cur = get();
      var inp = h('input', {
        type: 'text', class: 'mini-input color-input', spellcheck: 'false',
        value: cur != null ? String(cur) : '', placeholder: '点击取色 / #RRGGBB 或 #AARRGGBB',
        'data-jscolor': '{}'
      });
      var committed = cur != null ? String(cur) : '';
      /* ⭐ 唯一的提交入口，且必须**幂等**（照 theme-editor.js 的 colorRow 写法）：
       * FE.installJscolor 在输入框上自挂 change（依次发 onInput + onDone），本函数
       * 自己也挂 change 处理手输 —— jscolor 那个先注册所以先跑，一次手输会被提交
       * 两次（连带压两条历史 / 写两次 draft）。先比 committed，同值即空操作。
       * 注意本对话框是「点保存才落盘」，所以这里只写 draft，不碰 profile。 */
      function apply(nv) {
        var key = nv == null ? '' : String(nv);
        if (key === committed) return false;
        committed = key;
        set(nv);
        /* 只刷新回显文本，不重建表单 —— 拖动取色时重建会把正在拖的面板拆掉 */
        refreshColorEffects();
        return true;
      }
      FE.installJscolor(inp, {
        onInput: function (nv) { if (nv != null) apply(nv); },
        onDone: function (nv) { if (nv != null) apply(nv); }
      });
      inp.addEventListener('change', function () {
        var raw = inp.value.trim();
        if (raw === '') { apply(null); cleanupColors(); return; }
        var n = FE.normalizeColorHex(raw);
        if (n == null) {
          /* 非法格式：提示并回退到上次提交值（installJscolor 内已 alert，这里只回退） */
          inp.value = committed;
          return;
        }
        inp.value = n;
        apply(n);
      });
      var clearBtn = h('button', {
        type: 'button', class: 'mini-button',
        title: '清除此颜色（恢复继承：留空后由下一级给出）',
        onclick: function () {
          inp.value = '';
          try { if (inp.jscolor && typeof inp.jscolor.hide === 'function') inp.jscolor.hide(); } catch (e) { /* 忽略 */ }
          apply(null);
          cleanupColors();
          refreshStateBadges();
        }
      }, '清除');
      var row = h('div', { class: 'form-row form-inline', style: ST_ROW }, h('label', { class: 'mini-label' }, label), inp, clearBtn);
      /* 回显块放在行**下面**（form-inline 是 flex row，塞进去会挤同一行） */
      var box = h('div', { class: 'color-effect-box', style: ST_BOX });
      var jump = themeJumpBtn();
      Object.assign(jump.style, ST_JUMP);
      box.appendChild(jump);
      var l1 = h('div', { class: 'status color-effect', style: ST_TEXT });
      var l2 = h('div', { class: 'status color-fallback', style: ST_FALLBACK });
      box.appendChild(l1);
      box.appendChild(l2);
      var wrap = h('div', {
        class: 'color-row-wrap' + (stateName ? ' color-row-wrap-state' : ''),
        'data-color-role': role + (stateName ? '.' + stateName : '')
      }, row, box);
      /* 本行回显：留空 → 写出「当前生效色 + 它来自哪一级」；有本键值 → 另写清空后会回落到什么。
       * 状态行额外说明 ① > ②（状态色优先于基础角色）。 */
      function refreshEffect(eff) {
        clearEl(l1);
        clearEl(l2);
        if (!hasColorSource()) { jump.style.display = 'none'; return; }
        var opts = roleOpts();
        var own = get() != null;
        var rCur = FE.resolveRole(role, eff, opts);
        var rBase = FE.resolveRole(role, effWithout(eff, role, stateName), opts);
        /* 剥掉本行值之后取到的来源身份：落在本键 colors 上就是「基础角色」，
         * 落在主题/内置上就照 chain 措辞（roleText 内部按 source 再细分）。 */
        var baseKind = (rBase.source === FE.COLOR_SOURCES.LAYOUT_KEY) ? 'base' : 'chain';
        if (stateName) {
          var ownVal = own ? FE.colorNorm(get()) : null;
          l1.append('命中 ' + stateName + ' 时生效 ' + (ownVal != null
            ? ownVal + '　← ' + FE.colorSourceLabel(FE.COLOR_SOURCES.LAYOUT_STATE, stateName) + '（本键自己的设置）'
            : roleText(rBase, baseKind) + '（该状态留空，直接走基础链）'));
          l2.append('状态色优先于基础角色（① > ②）；未命中该状态时用 ' + roleText(rBase, baseKind)
            + (own ? '。清空后同上' : ''));
        } else {
          l1.append('当前生效 ' + roleText(rCur, own ? 'own' : 'chain'));
          if (own) l2.append('清空后 → ' + roleText(rBase, baseKind));
          else l2.append('本行留空：Foxy 端将用上面这个当前生效值。');
        }
        jump.style.display = (themeSourced(rCur) || themeSourced(rBase)) ? '' : 'none';
      }
      effectRefreshers.push(refreshEffect);
      refreshEffect(effSafe());
      return wrap;
    }
    function roleGetSet(role) {
      return [
        function () { return FE.isPlainObject(draft.colors) ? draft.colors[role] : null; },
        function (nv) {
          if (nv == null) {
            if (FE.isPlainObject(draft.colors)) {
              delete draft.colors[role];
              cleanupColors();
            }
          } else draftColors()[role] = nv;
        }
      ];
    }
    function stateGetSet(st, role) {
      return [
        function () {
          return (FE.isPlainObject(draft.colors) && FE.isPlainObject(draft.colors.states) &&
            FE.isPlainObject(draft.colors.states[st])) ? draft.colors.states[st][role] : null;
        },
        function (nv) {
          if (nv == null) {
            if (FE.isPlainObject(draft.colors) && FE.isPlainObject(draft.colors.states) &&
              FE.isPlainObject(draft.colors.states[st])) {
              delete draft.colors.states[st][role];
              cleanupColors();
            }
          } else {
            var c = draftColors();
            if (!FE.isPlainObject(c.states)) c.states = {};
            if (!FE.isPlainObject(c.states[st])) c.states[st] = {};
            c.states[st][role] = nv;
          }
        }
      ];
    }
    var stateBadges = [];
    function refreshStateBadges() {
      /* 更新 states 子卡的「已配置」标记（不重建行，面板不闪断） */
      stateBadges.forEach(function (b) {
        var has = FE.isPlainObject(draft.colors) && FE.isPlainObject(draft.colors.states) &&
          FE.isPlainObject(draft.colors.states[b.st]) && Object.keys(draft.colors.states[b.st]).length > 0;
        b.card.classList.toggle('has-colors', has);
        var sum = b.card.querySelectorAll('summary')[0];
        if (sum) {
          sum.textContent = '';
          sum.appendChild(h('span', { class: 'color-state-dot' }));
          sum.appendChild(document.createTextNode(b.title + (has ? '（已配置）' : '')));
        }
      });
    }
    /* 主题导入状态：决定每一行「留空后回落」到底落成主题色还是 App 内置默认色。
     * 未导入时必须当面讲清楚，否则用户会以为留空 = 没颜色。 */
    var themeStateLine = h('div', { class: 'status color-theme-state' });
    function refreshThemeStateLine() {
      clearEl(themeStateLine);
      if (themeImported()) {
        var slot = (FE.state && FE.state.themeSlot) || 'light';
        themeStateLine.append('已导入主题（当前槽位 ' + slot + '）：每行「当前生效」里来自主题的色，改主题即同步；'
          + '清空本键覆盖后会回落到该行标注的那一级。');
      } else {
        themeStateLine.append('未导入主题：每行「当前生效」显示的是 App 内置默认配色（includeBuiltin 兜底）；'
          + '清空后 Foxy 端将用内置默认配色，而不是「没有颜色」。导入主题后这些值会自动变成主题给出的色。');
      }
    }
    refreshThemeStateLine();
    cb.appendChild(themeStateLine);
    var colorRoles = [['text', '文字'], ['background', '背景'], ['border', '边框'], ['hint', '提示文字']];
    var cbox = h('div', { class: 'form-grid-2 color-role-grid' });
    colorRoles.forEach(function (cr) {
      var gs = roleGetSet(cr[0]);
      cbox.appendChild(colorRow(cr[1] + ' ' + cr[0], cr[0], gs[0], gs[1]));
    });
    cb.appendChild(cbox);
    cb.appendChild(h('div', { class: 'status color-legend' },
      '每一行都回显「当前生效色 ← 它来自哪一级」：'
      + '① 布局 colors.states[状态][角色] > ② 布局每键 colors[角色] > ③ 主题 keyTypes[键类型][角色] > ④ 主题 26 色全局默认。'
      + '留空即清除本键覆盖，回落给下一级；来源是主题时可用「到主题页改 →」跳过去（主题页与本对话框不能同时开，跳转会先确认未保存改动）。'));
    /* 高级颜色：shadow + pressed + hint 四边 + states（pressed / modifierActive / modifierLocked），
     * 同卡内子卡点选。角色清单与 FOXY 文档一致：
     * text / background / pressed / border / shadow / hint / hintTop / hintBottom / hintLeft / hintRight */
    var cadv = h('details', { class: 'card inner-card color-adv-card' });
    cadv.appendChild(h('summary', null, '高级颜色（shadow、pressed、hint 四边、按下/修饰状态）'));
    var cadvBody = h('div', { class: 'inner-card-body' });
    var sgs = roleGetSet('shadow');
    cadvBody.appendChild(colorRow('阴影 shadow', 'shadow', sgs[0], sgs[1]));
    var pgs = roleGetSet('pressed');
    cadvBody.appendChild(colorRow('按下背景 pressed', 'pressed', pgs[0], pgs[1]));
    cadvBody.appendChild(h('div', { class: 'status' }, 'shadow 为按键阴影色（通常半透明，如 #40000000）；pressed 为按住时的背景色。pressed 是「基础角色」，若下方 states.pressed 也配了色，按住时以 states.pressed 为准（① > ②）。'));
    var hintEdges = [['hintTop', '提示·上 hintTop'], ['hintBottom', '提示·下 hintBottom'], ['hintLeft', '提示·左 hintLeft'], ['hintRight', '提示·右 hintRight']];
    var hgrid = h('div', { class: 'form-grid-2 color-role-grid' });
    hintEdges.forEach(function (he) {
      var hgs = roleGetSet(he[0]);
      hgrid.appendChild(colorRow(he[1], he[0], hgs[0], hgs[1]));
    });
    cadvBody.appendChild(hgrid);
    cadvBody.appendChild(h('div', { class: 'status' }, 'hint 四边为各方向滑动提示的文字色；基础角色的「提示文字 hint」作用于全部方向，四边角色优先。注意主题侧方向回落有一条反直觉规则：keyTypes[键类型].hint 优先于「主题槽位自己的方向色」，本行回显已按 App 端真实顺序解析。'));
    var STATES = [
      ['pressed', '按下 pressed', '手指按住按键时；优先级最高'],
      ['modifierLocked', '修饰锁定 modifierLocked', 'Shift 等修饰键处于锁定态时'],
      ['modifierActive', '修饰激活 modifierActive', 'Shift 等修饰键处于激活（单次）态时；优先级最低']
    ];
    STATES.forEach(function (sd) {
      var so = FE.isPlainObject(draft.colors) && FE.isPlainObject(draft.colors.states) &&
        FE.isPlainObject(draft.colors.states[sd[0]]) ? draft.colors.states[sd[0]] : null;
      var card = h('details', { class: 'card inner-card color-state-card' + (so ? ' has-colors' : '') });
      card.appendChild(h('summary', null,
        h('span', { class: 'color-state-dot' }),
        sd[1] + (so ? '（已配置）' : '')));
      var body = h('div', { class: 'inner-card-body' });
      body.appendChild(h('div', { class: 'status' }, sd[2] + '。状态配色优先于上方基础角色（① > ②）：这些行只在命中该状态时生效，留空则回落基础角色 → 主题。'));
      var grid = h('div', { class: 'form-grid-2 color-role-grid' });
      [['background', '背景'], ['text', '文字'], ['shadow', '阴影']].forEach(function (rr) {
        var gs2 = stateGetSet(sd[0], rr[0]);
        grid.appendChild(colorRow(rr[1] + ' ' + rr[0], rr[0], gs2[0], gs2[1], { state: sd[0] }));
      });
      body.appendChild(grid);
      card.appendChild(body);
      stateBadges.push({ st: sd[0], title: sd[1], card: card });
      cadvBody.appendChild(card);
    });
    cadv.appendChild(cadvBody);
    cb.appendChild(cadv);
    cb.appendChild(h('div', { class: 'status' }, '点击输入框弹出 jscolor 取色面板（HSV 取色区 + 透明度滑杆），也可直接输入 #RRGGBB / #AARRGGBB；留空即恢复继承。'));
    ccard.appendChild(cb);
    formHost.appendChild(ccard);

    /* 高级 */
    var acard = h('details', { class: 'card inner-card' });
    acard.appendChild(h('summary', null, '高级'));
    var ab = h('div', { class: 'inner-card-body toolbar' });
    ab.appendChild(h('button', {
      type: 'button', class: 'mini-button',
      onclick: function () {
        var ed = null;
        /* baseline 必须是「原始值→序列化」的唯一入口（由守卫内部做）。
         * 早期写成 `jsonBaseline = ed.getValue()`（原始字符串）再交给守卫，
         * 守卫会把它当对象再序列化一次 → 两边永远不等 → 没改也被判成改了。 */
        var guard = FE.snapshotGuard(function () { return ed ? ed.getValue() : null; },
          { message: '原始 JSON 有未应用的改动，关闭将丢弃它们。' });
        var m2 = openModal({
          title: '编辑原始 JSON', wide: true,
          /* 改了 JSON 又直接点遮罩/Esc 关掉 = 白写，先问一句 */
          onBeforeClose: guard.onBeforeClose
        });
        ed = FE.buildJsonSnippetEditor({
          value: JSON.stringify(draft, null, 2),
          rows: 14,
          applyOnBlur: false,   /* 由对话框的「应用」按钮决定何时生效 */
          applyAfterFix: false
        });
        guard.reset();
        m2.body.appendChild(ed.el);
        m2.body.appendChild(h('div', { class: 'status' },
          '支持一键修复：多余尾逗号、注释、单引号字符串、未加引号的键名、全角标点等。'));
        m2.toolbar.appendChild(h('button', { type: 'button', onclick: function () { m2.requestClose(); } }, '取消'));
        m2.toolbar.appendChild(h('button', {
          type: 'button', class: 'primary',
          onclick: function () {
            var a = ed.check();
            if (a.report && a.report.issues.length) { ed.fix(); a = ed.check(); } /* 先修复再应用 */
            if (a.empty) { FE.uiAlert('内容不能为空'); return; }
            if (a.error) { FE.uiAlert('JSON 无效: ' + a.error); return; }
            if (!FE.isPlainObject(a.value)) { FE.uiAlert('必须是 JSON 对象（按键定义/放置）'); return; }
            draft = a.value;
            m2.close();
            buildForm();
          }
        }, '应用'));
        setTimeout(function () {
          var ta = ed.el.querySelector('textarea');
          if (ta && typeof ta.focus === 'function') ta.focus();
        }, 50);
      }
    }, '编辑原始 JSON…'));
    if (isPlacement) {
      var saveAs = h('input', { type: 'text', class: 'mini-input', placeholder: '新按键定义名，如 my.tab' });
      ab.appendChild(saveAs);
      ab.appendChild(h('button', {
        type: 'button', class: 'mini-button',
        onclick: function () {
          var n = saveAs.value.trim();
          if (!n) { FE.uiAlert('请输入按键定义名称'); return; }
          if (state.profile.keys[n]) { FE.uiAlert('按键定义已存在: ' + n); return; }
          var def = FE.deepClone(draft);
          ['column', 'row', 'columnSpan', 'rowSpan'].forEach(function (f) { delete def[f]; });
          FE.mutate(function () {
            state.profile.keys[n] = def;
            var repl = {};
            ['column', 'row', 'columnSpan', 'rowSpan'].forEach(function (f) { if (draft[f] != null) repl[f] = draft[f]; });
            var cont = container();
            if (cont) cont[opts.location.k] = Object.assign({ ref: n }, repl);
          });
          modal.close();
        }
      }, '另存为按键定义'));
    } else {
      ab.appendChild(h('button', {
        type: 'button', class: 'mini-button',
        onclick: function () {
          var used = FE.countKeyUsage(opts.name);
          FE.uiAlert('被引用 ' + used.count + ' 处' + (used.places.length ? '：\n' + used.places.join('\n') : ''));
        }
      }, '查找使用处'));
    }
    acard.appendChild(ab);
    formHost.appendChild(acard);

    /* 位置移动（行模式） */
    if (isPlacement && !opts.grid) {
      var mcard = h('details', { class: 'card inner-card' });
      mcard.appendChild(h('summary', null, '位置'));
      var mb = h('div', { class: 'inner-card-body toolbar' });
      function moveBtn(label, dr, dk) {
        return h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            FE.mutate(function () {
              var nl = FE.movePlacement(opts.location, dr, dk);
              if (nl) opts.location = nl;
            });
          }
        }, label);
      }
      mb.appendChild(moveBtn('← 左移', 0, -1));
      mb.appendChild(moveBtn('→ 右移', 0, 1));
      mb.appendChild(moveBtn('↑ 移到上一行', -1, 0));
      mb.appendChild(moveBtn('↓ 移到下一行', 1, 0));
      mcard.appendChild(mb);
      formHost.appendChild(mcard);
    }

    /* 弹出菜单：与基本信息/手势/状态变体/按键颜色覆盖同级的独立折叠 section。
     * 内容 = 弹出菜单标签页"弹出菜单键定义"卡片里对应按键的整键候选编辑
     * （常规 / Shift，由 FE.buildPopupKeyEditor 共用渲染）。 */
    var pcard = h('details', { class: 'card inner-card popup-section' });
    pcard.appendChild(h('summary', null, '弹出菜单（长按弹出候选）'));
    var pb = h('div', { class: 'inner-card-body' });
    pcard.appendChild(pb);
    formHost.appendChild(pcard);

    /* 弹出气泡配色说明（③ 的关键补充）。
     * App 端「按键上方的单标签气泡」（foxy-render-spec.md §7.1 / pt.java:30,39）：
     *   文字 = popupTextColor、背景 = popupBackgroundColor；圆角 6dp、高 44dp、
     *   字号 24sp（受 fontSizeCap 限制为该键键字号）。
     * 这两个色**属于主题文件，不在布局里**，而且**布局按键的 colors 不影响气泡**
     * ——所以这里刻意不提供可填颜色框，只如实显示当前生效值与来源 + 跳转入口，
     * 让用户明白「为什么这里不能填颜色」。
     * ⚠️ popupBorderColor 在 App 端**未找到消费点**（§7.3 / m00.x），
     * 所以不为它画边框、也不假装它生效，只标注它不参与绘制。 */
    function popupColorInfo() {
      var box = h('div', { class: 'popup-color-info' });
      box.appendChild(h('div', { class: 'status' },
        '气泡配色属于主题文件（不在布局里）：布局按键的 colors 只影响键盘上的按键，'
        + '不影响长按弹出的候选气泡。所以这里没有颜色输入框 —— 要改请到主题页。'));
      if (typeof FE.resolveThemeField !== 'function') return box;
      var fields = [
        ['popupTextColor', '气泡文字 popupTextColor'],
        ['popupBackgroundColor', '气泡背景 popupBackgroundColor']
      ];
      fields.forEach(function (f) {
        var r = FE.resolveThemeField(f[0], { includeBuiltin: true });
        var line = h('div', { class: 'status popup-color-line', 'data-theme-field': f[0] });
        var txt = (r.value == null)
          ? '未定义（主题未给此字段 → Foxy 端不绘制）'
          : r.value + '　← ' + FE.colorSourceLabel(r.source, r.detail)
            + (r.source === FE.COLOR_SOURCES.BUILTIN
              ? '（未导入主题 → 用 App 内置默认色）'
              : '（来自主题，改主题即同步）');
        line.append(h('code', null, f[0]), ' ', txt);
        box.appendChild(line);
      });
      /* popupBorderColor：如实说明未找到消费点，不画边框、也不假装它生效 */
      var rb = FE.resolveThemeField('popupBorderColor', {});
      box.appendChild(h('div', { class: 'status popup-color-line popup-border-note', 'data-theme-field': 'popupBorderColor' },
        h('code', null, 'popupBorderColor'),
        ' ',
        (rb.value == null ? '主题未给此字段' : rb.value + '（主题里已有值）')
        + ' —— App 端未找到消费点，气泡不画边框；这里照实说明，不假装它生效。'));
      box.appendChild(h('div', { class: 'status' },
        '气泡固定几何（不受布局控制）：圆角 6dp、高 44dp、字号 24sp（受 fontSizeCap 限制为该键键字号）。'));
      if (typeof themeJumpBtn === 'function') box.appendChild(themeJumpBtn('popup-theme-jump'));
      return box;
    }

    /* 从 draft（含直接字段与继承链）解析出此按键的 popupKey */
    function resolvePopupKey() {
      var g = draft.longPress;
      if (g != null && FE.isPlainObject(g) && g.popupKey != null && String(g.popupKey).trim() !== '') {
        return String(g.popupKey).trim();
      }
      var eff = null;
      try { eff = effObj(); } catch (e) { eff = null; }
      var lp = eff && FE.isPlainObject(eff.longPress) ? eff.longPress.popupKey : null;
      if (lp != null && String(lp).trim() !== '') return String(lp).trim();
      return '';
    }
    function refreshPopupSection() {
      clearEl(pb);
      /* 先放「气泡配色属于主题」的说明：**无论有没有 popupKey 都要显示** ——
       * 用户正是在这里困惑「为什么不能填颜色」。这段由本函数重建时一并重挂，
       * 否则 clearEl(pb) 会把它清掉。 */
      pb.appendChild(popupColorInfo());
      /* draft 可能在手势编辑后变化，每次重建时重算 */
      var pk = resolvePopupKey();
      if (!pk) {
        pb.appendChild(h('div', { class: 'status' },
          '此按键当前没有 longPress.popupKey。',
          h('div', null, '请先在上方「手势 → 长按 longPress」中填写「弹出菜单键」，保存手势后再回来这里编辑候选。')));
        return;
      }
      if (typeof FE.buildPopupKeyEditor !== 'function') {
        pb.appendChild(h('div', { class: 'status' }, '弹出菜单模块未加载，请到「弹出菜单」标签页编辑。'));
        return;
      }
      var schemaName = (FE.state && FE.state.popupSchema) || 'default';
      pb.appendChild(h('div', { class: 'form-row form-inline' },
        h('label', { class: 'mini-label' }, '弹出菜单键'),
        h('code', null, pk),
        h('span', { class: 'status' }, 'schema: ' + schemaName + '（在弹出菜单页切换）')));
      pb.appendChild(FE.buildPopupKeyEditor(schemaName, pk, {
        onChanged: function () { buildForm(); }
      }).host);
      pb.appendChild(h('div', { class: 'form-row form-inline' },
        h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            /* 跳走同样会丢掉当前改动，走一样的守卫（leaveThen：无改动时同步放行） */
            modal.leaveThen(function () {
              modal.close();
              if (FE.jumpToPopupEditor) FE.jumpToPopupEditor(pk);
            });
          }
        }, '到弹出菜单页编辑 →')));
    }
    refreshPopupSection();
    /* 表单已挂进 <dialog>：给所有颜色输入框补装 jscolor。
     * 颜色行是在 row 尚未 append 时创建的，而 jscolor 构造需要能查到祖先
     * <dialog>（面板要挂进对话框顶层，否则被 dialog/::backdrop 盖住看不见）。 */
    FE.installPendingColorPickers(formHost);
  }
  buildForm();
  /* 首轮表单建好后记下基线：此后任何改动都能被 onBeforeClose 看出来。
   * 放在 buildForm() 之后是因为定义模式下 nameInput 要到那时才存在。 */
  guard.reset();

  /* ---------- 工具栏 ---------- */
  if (isPlacement) {
    modal.toolbar.appendChild(h('button', {
      type: 'button', class: 'danger',
      onclick: async function () {
        var ok = await FE.uiConfirm('删除此按键？', { title: '删除按键', danger: true, okLabel: '删除' });
        if (!ok) return;
        FE.mutate(function () {
          var cont = container();
          if (cont) cont.splice(opts.location.k, 1);
        });
        modal.close();
      }
    }, '删除按键'));
  }
  /* 「取消」= 用户主动关闭：走守卫，有改动先确认 */
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      if (isPlacement) {
        FE.mutate(function () {
          var cont = container();
          if (cont) cont[opts.location.k] = FE.deepClone(draft);
        });
      } else {
        var newName = nameInput ? nameInput.value.trim() : opts.name;
        if (!newName) { FE.uiAlert('名称不能为空'); return; }
        if (newName !== opts.name) {
          if (state.profile.keys[newName]) { FE.uiAlert('按键定义已存在: ' + newName); return; }
        }
        FE.mutate(function () {
          if (newName !== opts.name) {
            renameKeyDef(opts.name, newName);
          }
          state.profile.keys[newName] = FE.deepClone(draft);
        });
      }
      modal.close();
    }
  }, '保存'));
};

/* 重命名按键定义并更新全部引用 */
function renameKeyDef(oldN, newN) {
  var keys = state.profile.keys;
  var entries = Object.keys(keys).map(function (k) { return [k === oldN ? newN : k, keys[k]]; });
  var nk = {};
  entries.forEach(function (e) { nk[e[0]] = e[1]; });
  state.profile.keys = nk;

  function updGestures(c) {
    ['tap', 'doubleTap', 'longPress', 'hold'].forEach(function (f) {
      if (FE.isPlainObject(c[f]) && c[f].ref === oldN) c[f].ref = newN;
    });
    if (FE.isPlainObject(c.swipe)) {
      FE.SWIPE_DIRS.forEach(function (d) {
        if (FE.isPlainObject(c.swipe[d]) && c.swipe[d].ref === oldN) c.swipe[d].ref = newN;
      });
    }
  }
  function updNode(node) {
    if (!FE.isPlainObject(node)) return;
    if (node.ref === oldN) node.ref = newN;
    updGestures(node);
    (Array.isArray(node.variants) ? node.variants : []).forEach(updNode);
    if (FE.isPlainObject(node.override)) updNode(node.override);
  }
  function walkSections(sections) {
    (Array.isArray(sections) ? sections : []).forEach(function (s) {
      if (!FE.isPlainObject(s)) return;
      if (s.type === 'rows') {
        FE.rowsOfSection(s).forEach(function (row) { row.keys.forEach(updNode); });
      } else if (s.type === 'grid' && Array.isArray(s.keys)) {
        s.keys.forEach(updNode);
      }
    });
  }
  Object.keys(nk).forEach(function (k) { updNode(nk[k]); });
  Object.keys(state.profile.layouts || {}).forEach(function (ln) {
    var L = state.profile.layouts[ln];
    if (!FE.isPlainObject(L)) return;
    walkSections(L.sections);
    if (FE.isPlainObject(L.split)) walkSections(L.split.sections);
  });
}
FE.renameKeyDef = renameKeyDef;
})();
