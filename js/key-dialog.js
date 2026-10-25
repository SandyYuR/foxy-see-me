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
 * 图标选择器：紧凑触发器 + 内联展开的可滚动列表（每项真实预览）
 *
 * 为什么不用原生 <select>：内联 SVG 载荷（svg:<svg …>）会作为 option 的
 * value 与可见文本进 DOM，而原生 select 的宽度由最长 option 决定 —— 一旦
 * 按键用了内联图标，下拉框就被撑成一大块横向长条；而且原生 option 画不出
 * 图形，作者只能盯着代码猜。这里触发器宽度只由容器决定（文字一律截断），
 * 列表走 .picker-list 自己滚动，每项左侧用 .kb-icon-wrap 渲染真实图形。
 *
 * opts:
 *   get()        当前值；undefined = 继承（不写 icon 字段），null = 清除
 *   set(v)       写回草稿（undefined / null / 字符串）
 *   inherited()  继承时的实际生效值（只用于显示）
 *   scope        { profile }，供 FE.iconSvgOf 解析 icons 映射
 * ================================================================ */
FE.buildIconPicker = function (opts) {
  opts = opts || {};
  var scope = opts.scope || { profile: state.profile };
  var wrap = h('div', { class: 'icon-pick' });
  var trigger = h('button', { type: 'button', class: 'icon-pick-trigger' });
  var pop = h('div', { class: 'icon-pick-pop picker-list', hidden: true });
  var codeBox = h('div', { class: 'icon-pick-codebox' });
  wrap.appendChild(trigger);
  wrap.appendChild(pop);
  wrap.appendChild(codeBox);

  function inheritedValue() {
    var v = typeof opts.inherited === 'function' ? opts.inherited() : opts.inherited;
    return (typeof v === 'string' && v) ? v : null;
  }
  /* 22px 预览方块：能解析出图形就渲染图形，否则留一个占位点保持行高一致 */
  function thumbOf(value) {
    var box = h('span', { class: 'kb-icon-wrap icon-pick-thumb' });
    var svg = (typeof value === 'string' && value) ? FE.iconSvgOf(value, scope) : null;
    if (svg) box.innerHTML = svg;
    else box.appendChild(h('span', { class: 'icon-pick-none' }, '·'));
    return box;
  }
  /* 内联载荷在列表里只留一行摘录：原文可能几千字符，绝不能撑开控件 */
  function srcExcerpt(s) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > 140 ? t.slice(0, 140) + '…' : t;
  }

  function makeItem(value, nameText, kind, srcText) {
    var cur = opts.get();
    var active = (value === undefined) ? (cur === undefined) : (cur === value);
    var item = h('div', { class: 'picker-item' + (active ? ' active' : ''), title: srcText || nameText });
    item.appendChild(thumbOf(value === undefined ? inheritedValue() : value));
    var main = h('div', { class: 'icon-pick-main' });
    main.appendChild(h('code', { class: 'icon-pick-name' }, nameText));
    if (srcText) main.appendChild(h('code', { class: 'icon-pick-src' }, srcText));
    item.appendChild(main);
    item.appendChild(h('span', { class: 'picker-kind' }, kind));
    item.addEventListener('click', function () {
      opts.set(value);
      pop.hidden = true;
      renderTrigger();
    });
    return item;
  }

  function buildList() {
    clearEl(pop);
    var cur = opts.get();
    var inh = inheritedValue();
    var names = FE.iconNames(scope);
    pop.appendChild(h('div', { class: 'picker-group' }, '继承 / 清除'));
    pop.appendChild(makeItem(undefined, '继承' + (inh ? '（' + inh + '）' : '（当前无生效图标）'),
      '不写 icon 字段，跟随引用链'));
    pop.appendChild(makeItem(null, '清除（null）', '显式屏蔽继承'));
    pop.appendChild(h('div', { class: 'picker-group' }, '内置'));
    FE.ICONS.forEach(function (t) {
      pop.appendChild(makeItem(t, t, '内置矢量'));
    });
    pop.appendChild(h('div', { class: 'picker-group' }, '自定义（icons 映射）'));
    if (names.length) {
      names.forEach(function (t) {
        pop.appendChild(makeItem(t, t, '自定义图标'));
      });
    } else {
      pop.appendChild(h('div', { class: 'picker-empty' }, '（暂无自定义图标：先在「自定义图标」卡片里新建，保存后即可选）'));
    }
    /* 当前值不在任何一组时要补一项，免得打开对话框就把它悄悄改掉 */
    if (typeof cur === 'string' && cur) {
      if (FE.isInlineIcon(cur)) {
        var renderable = !!FE.iconMarkupFromPayload(cur);
        pop.appendChild(h('div', { class: 'picker-group' }, '当前值（内联载荷）'));
        pop.appendChild(makeItem(cur, '内联 SVG（' + cur.slice(0, cur.indexOf(':') + 1) + '…）',
          renderable ? '可渲染' : '载荷无法渲染', srcExcerpt(cur)));
      } else if (FE.ICONS.indexOf(cur) < 0 && names.indexOf(cur) < 0) {
        pop.appendChild(h('div', { class: 'picker-group' }, '当前值（未匹配）'));
        pop.appendChild(makeItem(cur, cur, '不在 icons 映射里（键盘上不画）'));
      }
    }
  }

  function renderTrigger() {
    clearEl(trigger);
    clearEl(codeBox);
    var cur = opts.get();
    var inh = inheritedValue();
    var display = cur;
    var nameText;
    if (cur === undefined) {
      nameText = '继承' + (inh ? '（' + inh + '）' : '');
      display = inh;
    } else if (cur === null) {
      nameText = '清除（无图标）';
      display = null;
    } else {
      nameText = FE.isInlineIcon(cur) ? '内联 SVG' : String(cur);
    }
    trigger.appendChild(thumbOf(display));
    trigger.appendChild(h('span', { class: 'icon-pick-label' }, nameText));
    trigger.appendChild(h('span', { class: 'icon-pick-caret' }, '▾'));
    trigger.setAttribute('title', cur === undefined ? ('继承' + (inh ? '：' + inh : ''))
      : (cur === null ? '清除（null）' : String(cur)));
    /* 内联载荷：折叠展示完整代码，作者要能读到代码而不只是看图形 */
    if (typeof cur === 'string' && FE.isInlineIcon(cur)) {
      var det = h('details', { class: 'icon-pick-code' });
      det.appendChild(h('summary', null, '当前内联 SVG 代码（' + cur.length + ' 字符）'));
      var pre = h('pre', { class: 'icon-pick-pre' });
      pre.textContent = cur;
      det.appendChild(pre);
      codeBox.appendChild(det);
    }
  }

  trigger.addEventListener('click', function () {
    if (!pop.hidden) { pop.hidden = true; return; }
    /* 同一对话框里只允许一个图标列表展开，避免两个列表叠着 */
    var host = wrap.parentNode;
    if (host && typeof host.querySelectorAll === 'function') {
      var others = host.querySelectorAll('.icon-pick-pop');
      for (var i = 0; i < others.length; i++) { if (others[i] !== pop) others[i].hidden = true; }
    }
    buildList();
    pop.hidden = false;
  });

  renderTrigger();
  return wrap;
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
    key: '发送按键（经过 Rime）', modifier: '修饰键状态', text: '直接输入文字（text）', commit: '直接输入文字（commit）',
    switch_layout: '切换布局 switch_layout',
    switch_layout_once: '临时切换布局 switch_layout_once',
    app: '应用命令 app', macro: '宏调用 macro'
  };
  /* 选项顺序：引用形态优先（宏步骤最常用），随后是直接动作 */
  var ordered = [];
  if (allowRef) ordered.push(['ref', '引用动作名']);
  ordered.push(['', '（无动作）']);
  ordered.push(['key', typeLabels.key]);
  ['modifier', 'text', 'commit', 'switch_layout', 'switch_layout_once', 'app', 'macro'].forEach(function (k) {
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
      textTypeSel.appendChild(h('option', { value: 'text', selected: t !== 'commit' }, 'text（直接输入）'));
      textTypeSel.appendChild(h('option', { value: 'commit', selected: t === 'commit' }, 'commit（直接上屏）'));
      textTypeSel.addEventListener('change', function () { typeSel.value = textTypeSel.value; emit(); });
      textInp = h('input', { type: 'text', class: 'mini-input wide', value: spec && spec.text != null ? String(spec.text) : '', placeholder: '文本内容' });
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '方式'), textTypeSel));
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '内容'), textInp));
    } else if (t === 'switch_layout' || t === 'switch_layout_once') {
      var dlId = 'dl-layouts-' + (++dlLayoutSeq);
      layoutInp = h('input', { type: 'text', class: 'mini-input wide', list: dlId, value: spec && spec.layout != null ? String(spec.layout) : '', placeholder: '布局名（如 numpad；symbols/emoji/kaomoji 为内置面板）' });
      var dl = h('datalist', { id: dlId });
      Object.keys(state.profile.layouts || {}).forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      ['symbols', 'emoji', 'kaomoji'].forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      fields.appendChild(dl);
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '目标布局'), layoutInp));
      fields.appendChild(h('div', { class: 'dialog-hint' }, t === 'switch_layout_once'
        /* 临时层的语义只在 App 端生效，编辑器无法预览「下一次输入后自动返回」，
         * 所以这里必须把规则写清楚，别让用户以为它和普通切换一样会一直留着。 */
        ? '临时层：切换后，下一次有效输入完成会返回原布局。自动返回仅在 Foxy 中生效。'
        : '符号 / Emoji / 颜文字也可用「app」动作的 symbols / emoji / kaomoji 命令打开。'));
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
    if (t === 'switch_layout' || t === 'switch_layout_once') {
      if (!layoutInp.value.trim()) return null;
      /* 原样写回用户选的那个类型：把 once 悄悄降级成普通切换会让「临时层」失效。 */
      return { type: t, layout: layoutInp.value.trim() };
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
/* ================================================================
 * 状态变体对话框
 * opts: { variant, onChange(newVariant) }
 *
 * 条件对象的编辑器（布尔叶子 + 选项条件）由 buildConditionEditor 提供，
 * 键定义的状态变体与布局变体共用同一套 UI，避免两处各写一份 select 逻辑。
 * 组合条件（all_of / any_of / none_of）只读保留：图形化嵌套数组容易写错，
 * 而它本身是低频用法，改组合请直接编辑 JSON。
 * ================================================================ */
function buildConditionEditor(when, opts) {
  opts = opts || {};
  /* 变更回调：布局变体行直接用它把结果写回 profile（DOM 桩不冒泡，
   * 不能指望在外层容器上接 change）。键变体对话框不需要——保存时统一取值。 */
  function notify() { if (typeof opts.onChange === 'function') opts.onChange(); }
  var base = (when && FE.isPlainObject(when.rime)) ? when.rime : null;
  var boolSels = {};
  var boolBox = h('div', { class: 'form-row form-inline' });
  FE.STATUS_CONDS.forEach(function (c) {
    var cur = base ? base[c] : undefined;
    var s = h('select', { class: 'mini-select' });
    s.appendChild(h('option', { value: '' }, c + ':忽略'));
    s.appendChild(h('option', { value: '1', selected: cur === true }, c + ':真'));
    s.appendChild(h('option', { value: '0', selected: cur === false }, c + ':假'));
    s.addEventListener('change', notify);
    boolSels[c] = s;
    boolBox.appendChild(s);
  });

  /* 选项条件：Foxy 的选项名来自活动 schema 的 switches，编辑器读不到那份声明，
   * 因此这里只做「列出已经用过的名字 + 允许手填新名」。未声明的选项在 Foxy 端
   * 是中性（不决定结果），编辑器不去猜它有效与否。 */
  var optConds = [];
  var baseUsedOption = false;
  if (base) {
    if (typeof base.option === 'string' && base.option) {
      baseUsedOption = true;
      optConds.push({ name: base.option, value: base.value === undefined ? true : !!base.value });
    } else if (FE.isPlainObject(base.options)) {
      Object.keys(base.options).forEach(function (n) { optConds.push({ name: n, value: !!base.options[n] }); });
    }
  }

  var optListEl = h('div', { class: 'variant-option-list' });
  var suggBox = h('div', { class: 'variant-option-sugg' });
  var optBox = h('div', { class: 'variant-option-box' }, optListEl, suggBox);

  function suggestions() {
    var names = FE.ALWAYS_ON_OPTIONS.slice();
    var known = (FE.state && FE.state.validation && FE.state.validation.optionNames) || [];
    known.forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    return names;
  }
  /* 提示条不用 datalist：对话框关闭后元素仍留在文档里，反复打开会积攒同 id 的
   * datalist，为零依赖的纯前端加清理逻辑不划算。改成按钮，点一下填进最后一行。 */
  function renderSuggestions() {
    clearEl(suggBox);
    if (!optConds.length) return;
    var names = suggestions();
    if (!names.length) return;
    suggBox.appendChild(h('span', { class: 'status' }, '可用名：'));
    names.forEach(function (n) {
      suggBox.appendChild(h('button', {
        type: 'button', class: 'mini-button', title: '填入最后一行的选项名',
        onclick: function () {
          if (!optConds.length) return;
          optConds[optConds.length - 1].name = n;
          renderOptConds();
        }
      }, n));
    });
  }
  function renderOptConds() {
    clearEl(optListEl);
    renderSuggestions();
    if (!optConds.length) {
      optListEl.appendChild(h('span', { class: 'status' }, '（未按选项区分）'));
      return;
    }
    optConds.forEach(function (it, i) {
      var nameInp = h('input', { type: 'text', class: 'mini-input', value: it.name, placeholder: '选项名，如 full_shape' });
      nameInp.addEventListener('input', function () { it.name = nameInp.value.trim(); });
      /* 每敲一个字就重建整页会打断输入，所以只在失焦/确认时通知 */
      nameInp.addEventListener('change', notify);
      var valSel = h('select', { class: 'mini-select' });
      valSel.appendChild(h('option', { value: '1', selected: it.value === true }, '真'));
      valSel.appendChild(h('option', { value: '0', selected: it.value === false }, '假'));
      valSel.addEventListener('change', function () { it.value = valSel.value === '1'; notify(); });
      optListEl.appendChild(h('div', { class: 'gesture-row' },
        h('span', { class: 'gesture-name' }, '选项'), nameInp, valSel,
        h('button', {
          type: 'button', class: 'mini-button danger',
          onclick: function () { optConds.splice(i, 1); renderOptConds(); notify(); }
        }, '✕')));
    });
  }
  renderOptConds();

  var addBtn = h('button', {
    type: 'button', class: 'mini-button',
    onclick: function () { optConds.push({ name: '', value: true }); renderOptConds(); }
  }, '+ 添加选项条件');
  optBox.appendChild(addBtn);

  var groupNote = null;
  if (base) {
    var groups = FE.STATUS_GROUPS.filter(function (g) { return Object.prototype.hasOwnProperty.call(base, g); });
    if (groups.length) {
      groupNote = h('div', { class: 'status' },
        '含组合条件 ' + groups.join(' / ') + '（' + FE.condSummaryText(when) + '）：组合条件只读保留，编辑请改 JSON');
    }
  }

  var el = h('div', { class: 'cond-editor' },
    h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '状态条件（同时满足，最后匹配者生效）'), boolBox),
    h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '选项条件（开关名 → 真/假）'), optBox),
    groupNote);

  function getWhenRime() {
    var out = {};
    FE.STATUS_CONDS.forEach(function (c) {
      if (boolSels[c].value !== '') out[c] = boolSels[c].value === '1';
    });
    var pairs = optConds.filter(function (it) { return it.name; });
    /* 单个选项条件且原本写的是 option+value 时沿用原形态：两种写法语义相同，
     * 保留用户原样更容易与 schema / 文档对照。 */
    if (pairs.length === 1 && baseUsedOption) {
      out.option = pairs[0].name;
      out.value = pairs[0].value;
    } else if (pairs.length) {
      out.options = {};
      pairs.forEach(function (it) { out.options[it.name] = it.value; });
    }
    if (base) {
      FE.STATUS_GROUPS.forEach(function (g) {
        if (Object.prototype.hasOwnProperty.call(base, g)) out[g] = FE.deepClone(base[g]);
      });
    }
    return out;
  }
  function getWhen() {
    var rime = getWhenRime();
    return Object.keys(rime).length ? { rime: rime } : null;
  }
  function snapshot() {
    var r = {};
    FE.STATUS_CONDS.forEach(function (c) { r[c] = boolSels[c].value; });
    r.opts = optConds.map(function (it) { return it.name + '=' + (it.value ? '1' : '0'); });
    return r;
  }
  return { el: el, getWhenRime: getWhenRime, getWhen: getWhen, snapshot: snapshot };
}
FE.buildConditionEditor = buildConditionEditor;

FE.openVariantDialog = function (opts) {
  var v = FE.isPlainObject(opts.variant) ? FE.deepClone(opts.variant) : {};
  var condEd = buildConditionEditor(v.when);
  var guard = FE.snapshotGuard(function () {
    return {
      cond: condEd.snapshot(),
      ref: refName,
      label: labelInp.value,
      shiftedLabel: shiftedInp.value,
      /* tapValue 的 undefined（未设置）与 null（显式清除）是两种语义，
       * stableJson 会分别编码，不会被当成同一个值 */
      tap: tapValue,
      extra: extraTa.value
    };
  });
  var modal = openModal({ title: '编辑状态变体', onBeforeClose: guard.onBeforeClose });
  modal.body.appendChild(condEd.el);
  var refName = typeof v.ref === 'string' ? v.ref : null;
  if(opts.cached)refName=opts.cached.refName;
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
  if(opts.cached&&opts.cached.hasTap)tapValue=opts.cached.tap;
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
  if(opts.cacheIndex!=null)modal.el.__draftSnapshot=function(){return {kind:'key-variant',index:opts.cacheIndex,original:v,
    refName:refName,hasTap:tapValue!==undefined,tap:tapValue,fields:FE.readEditorFields(modal.body)};};
  if(opts.cached)FE.restoreEditorFields(modal.body,opts.cached.fields);
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      var out = {};
      var when = condEd.getWhen();
      if (when) out.when = when;
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
 * 自定义图标编辑器（顶层 icons 映射）
 * opts: { name, payload, taken, onChange(newName, newPayload) }
 *
 * Foxy 的自定义图标 = 「名字 → 内联 svg:/xml: 载荷」，名字可以被键的 icon 引用，
 * 载荷也可以直接写在键上（与工具栏按钮 icon 同形式）。这里不解析 SVG 语义，
 * 只校验「带 svg:/xml: 前缀且清洗后仍有标记」，并把清洗结果渲染成预览。
 * ================================================================ */
FE.openIconDialog = function (opts) {
  opts = opts || {};
  var taken = opts.taken || {};
  var guard = FE.snapshotGuard(function () {
    return { name: nameInp.value, payload: payloadTa.value };
  });
  var modal = openModal({ title: opts.name ? ('编辑自定义图标 “' + opts.name + '”') : '新建自定义图标', onBeforeClose: guard.onBeforeClose });

  var nameInp = h('input', {
    type: 'text', class: 'mini-input',
    value: opts.name != null ? String(opts.name) : '',
    placeholder: '图标名，如 foxy.heart'
  });
  var payloadTa = h('textarea', { class: 'json-editor small', rows: 6, spellcheck: 'false' });
  payloadTa.value = opts.payload != null ? String(opts.payload) : 'svg:';
  var preview = h('div', { class: 'icon-preview' });
  var errBox = h('div', { class: 'ui-dialog-error' });

  function renderPreview() {
    clearEl(preview);
    var markup = FE.iconMarkupFromPayload(payloadTa.value);
    if (!markup) {
      preview.appendChild(h('span', { class: 'mini-label' }, '（载荷无法渲染：需以 svg: 或 xml: 开头）'));
      return;
    }
    var box = h('span', { class: 'kb-icon-wrap', style: { width: '34px', height: '34px' } });
    box.innerHTML = markup;
    preview.appendChild(box);
    preview.appendChild(h('span', { class: 'mini-label' }, '按键文字色着色（SVG 自带颜色优先）'));
  }
  payloadTa.addEventListener('input', renderPreview);
  payloadTa.addEventListener('change', renderPreview);

  modal.body.appendChild(h('div', { class: 'form-row' },
    h('label', { class: 'mini-label' }, '名字'), nameInp));
  modal.body.appendChild(h('div', { class: 'form-row' },
    h('label', { class: 'mini-label' }, '内联 SVG/XML 载荷（svg: 或 xml: 开头）'), payloadTa));
  modal.body.appendChild(h('div', { class: 'form-row' }, preview));
  modal.body.appendChild(errBox);
  modal.body.appendChild(h('div', { class: 'mini-label' },
    '编辑器只清掉 <script> 与内联事件属性（on*）与 javascript: 链接，其余标记原样保留。'));
  renderPreview();

  function fail(msg) {
    clearEl(errBox);
    errBox.appendChild(document.createTextNode(String(msg)));
  }

  /* 「取消」走守卫：有改动先确认 */
  guard.reset();
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      var name = nameInp.value.trim();
      var payload = payloadTa.value.trim();
      if (!name) return fail('名字不能为空');
      if (FE.isBuiltinIcon(name)) return fail('“' + name + '” 是内置图标名，不需要自定义');
      if (taken[name] && name !== opts.name) return fail('已经有同名图标: ' + name);
      if (!FE.isInlineIcon(payload)) return fail('载荷必须以 svg: 或 xml: 开头');
      if (!FE.iconMarkupFromPayload(payload)) return fail('载荷清洗后没有任何标记，无法渲染');
      modal.close();
      opts.onChange(name, payload);
    }
  }, '保存'));
};

/* ================================================================
 * 主按键对话框（放置 / 按键定义）
 * opts: { mode:'placement'|'definition', placement?, name?, location?, grid? }
 * ================================================================ */
})();
