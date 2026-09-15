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
  var form = h('form', { method: 'dialog', class: 'editor-form' });
  var titlebar = h('div', { class: 'dialog-titlebar' }, h('h3', null, opts.title || ''));
  var body = h('div', { class: 'dialog-body' });
  var toolbar = h('div', { class: 'toolbar dialog-toolbar' });
  form.appendChild(titlebar);
  form.appendChild(body);
  form.appendChild(toolbar);
  dlg.appendChild(form);
  document.body.appendChild(dlg);
  function close() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', function () { dlg.remove(); if (opts.onClose) opts.onClose(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  dlg.showModal();
  return { el: dlg, body: body, toolbar: toolbar, close: close };
}
FE.openModal = openModal;

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

FE.installJscolor = function (input, opts) {
  opts = opts || {};
  input._foxyColorOpts = opts;   /* 供 FE.installPendingColorPickers 挂载后补装 */
  function emitInput(v) { if (typeof opts.onInput === 'function') opts.onInput(v); }
  function emitDone(v) { if (typeof opts.onDone === 'function') opts.onDone(v); }

  function syncPickerFromInput() {
    /* 手输后把值同步进 picker（f5a 的 syncInlinePickerFromArgbInput 同款） */
    var p = input.jscolor;
    if (!p) return;
    var pickerHex = FE.argbToPickerHex(input.value);
    if (!pickerHex) return;
    try { p.fromString(pickerHex); } catch (e) { /* 忽略 */ }
  }
  function syncInputFromPicker() {
    /* 面板拖动后把值写回输入框（f5a 的 syncArgbInputFromInlinePicker 同款） */
    var p = input.jscolor;
    if (!p) return;
    var raw = null;
    try { raw = (typeof p.toHEXAString === 'function' ? p.toHEXAString() : p.toHEXString()); } catch (e) { return; }
    var argb = FE.pickerHexToArgb(raw);
    if (argb) input.value = argb;
  }

  var api = {
    el: input,
    syncFromValue: function (v) {
      var n = FE.normalizeColorHex(v);
      input.value = n || '';
      syncPickerFromInput();
    },
    destroy: function () {
      try { if (input.jscolor && typeof input.jscolor.hide === 'function') input.jscolor.hide(); } catch (e) { /* 忽略 */ }
    }
  };

  /* 真正创建实例：必须在元素已进入 DOM 之后调用（要能查到祖先 <dialog>） */
  function ensurePicker() {
    if (input.jscolor) return input.jscolor;
    if (!window.jscolor) return null;    /* 降级：纯文本输入 */
    /* jscolor 的面板 CSS 与"点目标即弹出"的文档级 mousedown 监听都在 init()
     * 里注册（正常由 DOMContentLoaded 触发）。这里幂等补一次，确保脚本加载
     * 时机异常（如 DOMContentLoaded 已过）时点击依然能弹出面板。 */
    if (typeof window.jscolor.init === 'function' && document.readyState !== 'loading') {
      try { window.jscolor.init(); } catch (e) { /* 忽略 */ }
    }
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
        onInput: function () {
          syncInputFromPicker();
          activeColorInput = input;
          positionColorWrap(input);
          emitInput(FE.normalizeColorHex(input.value));
        }
      });
    } catch (e) {
      if (window.console && typeof window.console.warn === 'function') {
        console.warn('[foxy-editor] jscolor 初始化失败，颜色框降级为文本输入：', e);
      }
      return null;
    }
    /* show 之后按输入框位置摆好面板（dialog 容器内 jscolor 只做 relative 0,0） */
    var origShow = picker.show.bind(picker);
    picker.show = function () {
      var r = origShow();
      activeColorInput = input;
      positionColorWrap(input);
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
    var n = FE.normalizeColorHex(raw);
    if (n == null) {
      alert('颜色格式无效，应为 #RRGGBB 或 #AARRGGBB');
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
 * 动作编辑器（嵌入组件）
 * 返回 { el, getValue() }
 * ================================================================ */
FE.buildActionEditor = function (spec) {
  spec = FE.isPlainObject(spec) ? FE.deepClone(spec) : null;
  var initType = spec ? (spec.macro != null ? 'macro' : (spec.type || '')) : '';

  var root = h('div', { class: 'action-editor' });
  var typeSel = h('select', { class: 'mini-select' });
  var typeLabels = { '': '（无动作）', key: '按键 key', modifier: '修饰 modifier', text: '文本 text', commit: '上屏 commit', switch_layout: '切换布局 switch_layout', app: '应用命令 app', macro: '宏调用 macro' };
  Object.keys(typeLabels).forEach(function (t) {
    typeSel.appendChild(h('option', { value: t, selected: t === initType }, typeLabels[t]));
  });
  var fields = h('div', { class: 'action-fields' });
  root.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '类型'), typeSel));
  root.appendChild(fields);

  var keySel, metaChks = [], modSel, modStateSel, textInp, textTypeSel, layoutInp, cmdSel, argInp, macroSel;

  function buildFields() {
    clearEl(fields);
    metaChks = [];
    var t = typeSel.value;
    if (t === 'key') {
      keySel = h('select', { class: 'mini-select wide' });
      FE.KEYCODE_GROUPS.forEach(function (g) {
        var og = h('optgroup', { label: g.label });
        g.names.forEach(function (n) { og.appendChild(h('option', { value: n, selected: spec && spec.key === n }, n)); });
        keySel.appendChild(og);
      });
      if (spec && spec.key && !FE.ALL_KEYCODES[spec.key]) {
        keySel.insertBefore(h('option', { value: spec.key, selected: true }, spec.key + '（自定义）'), keySel.firstChild);
      }
      var metaBox = h('div', { class: 'meta-checks' });
      ['SHIFT', 'CTRL', 'ALT', 'META'].forEach(function (m) {
        var chk = h('input', { type: 'checkbox' });
        var has = spec && spec.meta && (Array.isArray(spec.meta) ? spec.meta : [spec.meta]).map(function (x) { return String(x).toUpperCase(); }).indexOf(m) >= 0;
        chk.checked = !!has;
        metaChks.push({ m: m, chk: chk });
        metaBox.appendChild(h('label', { class: 'mini-label check' }, chk, m));
      });
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '键'), keySel));
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '修饰'), metaBox));
    } else if (t === 'modifier') {
      modSel = h('select', { class: 'mini-select' });
      FE.MODIFIERS.forEach(function (m) { modSel.appendChild(h('option', { value: m, selected: spec && spec.modifier === m }, m)); });
      modStateSel = h('select', { class: 'mini-select' });
      ['ONESHOT', 'LOCKED', 'OFF'].forEach(function (s) { modStateSel.appendChild(h('option', { value: s, selected: !spec || spec.state === s || (s === 'ONESHOT' && !spec.state) }, s)); });
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
      layoutInp = h('input', { type: 'text', class: 'mini-input wide', list: 'dl-layouts', value: spec && spec.layout != null ? String(spec.layout) : '', placeholder: '布局名（如 numpad；symbols/emoji/kaomoji 为内置面板）' });
      var dl = h('datalist', { id: 'dl-layouts' });
      Object.keys(state.profile.layouts || {}).forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      ['symbols', 'emoji', 'kaomoji'].forEach(function (n) { dl.appendChild(h('option', { value: n })); });
      fields.appendChild(dl);
      fields.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '目标布局'), layoutInp));
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
  }
  typeSel.addEventListener('change', buildFields);
  buildFields();

  function getValue() {
    var t = typeSel.value;
    if (!t) return null;
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
  var modal = openModal({ title: '编辑手势 · ' + (names[slot] || slot) });

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

  var labelInp = h('input', { type: 'text', class: 'mini-input wide', value: (FE.isPlainObject(g) && g.label != null) ? String(g.label) : '', placeholder: '显示标签 / 滑动提示文字（留空继承）' });
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
              if (!k) { alert('请先填写弹出菜单键 popupKey'); return; }
              if (FE.jumpToPopupEditor) { modal.close(); FE.jumpToPopupEditor(k); }
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

  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'danger',
    onclick: function () { modal.close(); opts.onChange(null); }
  }, '清除（置 null 屏蔽继承）'));
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.close(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      var m = modeSel.value;
      var value;
      if (m === 'inherit') { value = undefined; }
      else {
        var extras = {};
        if (labelInp.value !== '') extras.label = labelInp.value;
        if (popupSel.value === '1') extras.popup = true;
        else if (popupSel.value === '0') extras.popup = false;
        if (m === 'ref') {
          if (!refName) { alert('请选择引用的按键'); return; }
          value = Object.assign({ ref: refName }, extras);
        } else if (m === 'action-name') {
          if (!actionName) { alert('请选择动作'); return; }
          value = Object.keys(extras).length ? Object.assign({ action: actionName }, extras) : actionName;
        } else if (m === 'macro') {
          if (!macroName) { alert('请选择宏'); return; }
          value = Object.assign({ macro: macroName }, extras);
        } else {
          var act = area._editor ? area._editor.getValue() : null;
          if (isHold) {
            value = Object.assign({}, extras);
            var st = startEditor ? startEditor.getValue() : null;
            var en = endEditor ? endEditor.getValue() : null;
            if (st) value.start = st;
            if (en) value.end = en;
            if (!value.start && !value.end && !Object.keys(extras).length) { alert('请至少配置开始或结束动作'); return; }
          } else {
            if (!act && !Object.keys(extras).length) { alert('请配置动作'); return; }
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
  var modal = openModal({ title: '编辑状态变体' });

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

  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.close(); } }, '取消'));
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
        try { extra = JSON.parse(extraTa.value); } catch (e) { alert('其他字段 JSON 无效: ' + e.message); return; }
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
    if (FE.isPlainObject(draft.override)) {  /* 扁平化 override 到直接字段 */
      var ov = draft.override;
      delete draft.override;
      Object.keys(ov).forEach(function (k) { draft[k] = FE.deepClone(ov[k]); });
    }
  } else {
    draft = FE.deepClone((state.profile.keys || {})[opts.name] || {});
  }

  var modal = openModal({
    title: isPlacement
      ? '编辑按键' + (opts.grid ? '（网格）' : '')
      : '编辑按键定义',
    wide: true
  });
  var formHost = h('div');
  modal.body.appendChild(formHost);

  var nameInput = null; // definition 模式下可改名

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
    FE.KEY_TYPES.forEach(function (t) { ktSel.appendChild(h('option', { value: t, selected: draft.keyType === t }, t)); });
    ktSel.addEventListener('change', function () {
      if (ktSel.value === '') delete draft.keyType;
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

    var weightInp = h('input', { type: 'number', step: 'any', min: '0', class: 'mini-input', value: typeof draft.weight === 'number' ? String(draft.weight) : '', placeholder: '留空=1' });
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
    var heightInp = h('input', { type: 'number', step: 'any', min: '0', class: 'mini-input', value: typeof draft.height === 'number' ? String(draft.height) : '', placeholder: '留空=1' });
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
    slSel.appendChild(h('option', { value: '', selected: slCur == null }, '继承（' + (effRaw('statusLabel') != null ? (typeof effRaw('statusLabel') === 'string' ? effRaw('statusLabel') : '对象') : '无') + '）'));
    slSel.appendChild(h('option', { value: '__null__', selected: slCur === null }, '清除（null）'));
    slSel.appendChild(h('option', { value: 'schema_name', selected: slCur === 'schema_name' }, 'schema_name（方案名）'));
    slSel.addEventListener('change', function () {
      if (slSel.value === '') delete draft.statusLabel;
      else if (slSel.value === '__null__') draft.statusLabel = null;
      else draft.statusLabel = slSel.value;
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
    /* 单个颜色行：jscolor 输入框 + 「清除」按钮。
     * get/set 用于读写 draft 中对应位置的值（支持 states.xxx.role 嵌套）。 */
    function colorRow(label, get, set) {
      var cur = get();
      var inp = h('input', {
        type: 'text', class: 'mini-input color-input', spellcheck: 'false',
        value: cur != null ? String(cur) : '', placeholder: '点击取色 / #RRGGBB 或 #AARRGGBB',
        'data-jscolor': '{}'
      });
      var committed = cur != null ? String(cur) : '';
      FE.installJscolor(inp, {
        onInput: function (nv) {
          /* jscolor 面板拖动实时回调：先写 draft，非法（null）则不动 */
          if (nv == null) return;
          committed = nv;
          set(nv);
        },
        onDone: function (nv) {
          if (nv == null) return;
          committed = nv;
          set(nv);
        }
      });
      inp.addEventListener('change', function () {
        var raw = inp.value.trim();
        if (raw === '') { committed = ''; set(null); cleanupColors(); return; }
        var n = FE.normalizeColorHex(raw);
        if (n == null) {
          /* 非法格式：提示并回退到上次提交值（installJscolor 内已 alert，这里只回退） */
          inp.value = committed;
          return;
        }
        committed = n;
        inp.value = n;
        set(n);
      });
      var clearBtn = h('button', {
        type: 'button', class: 'mini-button',
        title: '清除此颜色（恢复继承）',
        onclick: function () {
          committed = '';
          inp.value = '';
          try { if (inp.jscolor && typeof inp.jscolor.hide === 'function') inp.jscolor.hide(); } catch (e) { /* 忽略 */ }
          set(null);
          cleanupColors();
          refreshStateBadges();
        }
      }, '清除');
      return h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, label), inp, clearBtn);
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
    var colorRoles = [['text', '文字'], ['background', '背景'], ['border', '边框'], ['hint', '提示文字']];
    var cbox = h('div', { class: 'form-grid-2' });
    colorRoles.forEach(function (cr) {
      var gs = roleGetSet(cr[0]);
      cbox.appendChild(colorRow(cr[1], gs[0], gs[1]));
    });
    cb.appendChild(cbox);
    /* 高级颜色：shadow + pressed + hint 四边 + states（pressed / modifierActive / modifierLocked），
     * 同卡内子卡点选。角色清单与 FOXY 文档一致：
     * text / background / pressed / border / shadow / hint / hintTop / hintBottom / hintLeft / hintRight */
    var cadv = h('details', { class: 'card inner-card color-adv-card' });
    cadv.appendChild(h('summary', null, '高级颜色（shadow、pressed、hint 四边、按下/修饰状态）'));
    var cadvBody = h('div', { class: 'inner-card-body' });
    var sgs = roleGetSet('shadow');
    cadvBody.appendChild(colorRow('阴影 shadow', sgs[0], sgs[1]));
    var pgs = roleGetSet('pressed');
    cadvBody.appendChild(colorRow('按下背景 pressed', pgs[0], pgs[1]));
    cadvBody.appendChild(h('div', { class: 'status' }, 'shadow 为按键阴影色（通常半透明，如 #40000000）；pressed 为按住时的背景色。'));
    var hintEdges = [['hintTop', '提示·上 hintTop'], ['hintBottom', '提示·下 hintBottom'], ['hintLeft', '提示·左 hintLeft'], ['hintRight', '提示·右 hintRight']];
    var hgrid = h('div', { class: 'form-grid-2' });
    hintEdges.forEach(function (he) {
      var hgs = roleGetSet(he[0]);
      hgrid.appendChild(colorRow(he[1], hgs[0], hgs[1]));
    });
    cadvBody.appendChild(hgrid);
    cadvBody.appendChild(h('div', { class: 'status' }, 'hint 四边为各方向滑动提示的文字色；基础角色的「提示文字 hint」作用于全部方向，四边角色优先。'));
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
      body.appendChild(h('div', { class: 'status' }, sd[2] + '。状态配色优先于上方基础角色。'));
      var grid = h('div', { class: 'form-grid-2' });
      [['background', '背景'], ['text', '文字'], ['shadow', '阴影']].forEach(function (rr) {
        var gs2 = stateGetSet(sd[0], rr[0]);
        grid.appendChild(colorRow(rr[1], gs2[0], gs2[1]));
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
        var m2 = openModal({ title: '编辑原始 JSON', wide: true });
        var ed = FE.buildJsonSnippetEditor({
          value: JSON.stringify(draft, null, 2),
          rows: 14,
          applyOnBlur: false,   /* 由对话框的「应用」按钮决定何时生效 */
          applyAfterFix: false
        });
        m2.body.appendChild(ed.el);
        m2.body.appendChild(h('div', { class: 'status' },
          '支持一键修复：多余尾逗号、注释、单引号字符串、未加引号的键名、全角标点等。'));
        m2.toolbar.appendChild(h('button', { type: 'button', onclick: function () { m2.close(); } }, '取消'));
        m2.toolbar.appendChild(h('button', {
          type: 'button', class: 'primary',
          onclick: function () {
            var a = ed.check();
            if (a.report && a.report.issues.length) { ed.fix(); a = ed.check(); } /* 先修复再应用 */
            if (a.empty) { alert('内容不能为空'); return; }
            if (a.error) { alert('JSON 无效: ' + a.error); return; }
            if (!FE.isPlainObject(a.value)) { alert('必须是 JSON 对象（按键定义/放置）'); return; }
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
          if (!n) { alert('请输入按键定义名称'); return; }
          if (state.profile.keys[n]) { alert('按键定义已存在: ' + n); return; }
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
          alert('被引用 ' + used.count + ' 处' + (used.places.length ? '：\n' + used.places.join('\n') : ''));
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
            if (FE.jumpToPopupEditor) { modal.close(); FE.jumpToPopupEditor(pk); }
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

  /* ---------- 工具栏 ---------- */
  if (isPlacement) {
    modal.toolbar.appendChild(h('button', {
      type: 'button', class: 'danger',
      onclick: function () {
        if (!confirm('删除此按键？')) return;
        FE.mutate(function () {
          var cont = container();
          if (cont) cont.splice(opts.location.k, 1);
        });
        modal.close();
      }
    }, '删除按键'));
  }
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.close(); } }, '取消'));
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
        if (!newName) { alert('名称不能为空'); return; }
        if (newName !== opts.name) {
          if (state.profile.keys[newName]) { alert('按键定义已存在: ' + newName); return; }
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
