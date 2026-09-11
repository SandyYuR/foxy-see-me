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
    directSpec = g.action != null ? g.action : (g.actions != null ? g.actions : null);
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
          if (Object.keys(extras).length) {
            var actObj = (state.profile.actions || {})[actionName];
            value = Object.assign({ action: actObj ? FE.deepClone(actObj) : { type: 'key', key: 'A' } }, extras);
          } else value = actionName;
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
            value = Object.assign({}, extras);
            if (isLongPress && repeatChk.checked) value.repeat = true;
            if (isLongPress && popupKeyInp.value.trim() !== '') value.popupKey = popupKeyInp.value.trim();
            if (act) value.action = act;
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
    var idInp = h('input', { type: 'text', class: 'mini-input', value: draft.id != null ? String(draft.id) : '', placeholder: '如 space（留空继承）' });
    idInp.addEventListener('change', function () {
      if (idInp.value === '') delete draft.id;
      else draft.id = idInp.value;
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '文字大小'), tsInp),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, 'ID'), idInp)));

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

    /* 颜色 */
    var ccard = h('details', { class: 'card inner-card' });
    ccard.appendChild(h('summary', null, '按键颜色覆盖（可选）'));
    var cb = h('div', { class: 'inner-card-body' });
    var colorRoles = [['text', '文字'], ['background', '背景'], ['border', '边框'], ['hint', '提示文字']];
    var cbox = h('div', { class: 'form-grid-2' });
    colorRoles.forEach(function (cr) {
      var cur = FE.isPlainObject(draft.colors) ? draft.colors[cr[0]] : null;
      var inp = h('input', { type: 'text', class: 'mini-input', value: cur != null ? String(cur) : '', placeholder: '#RRGGBB 或 #AARRGGBB' });
      inp.addEventListener('change', function () {
        if (!FE.isPlainObject(draft.colors)) draft.colors = {};
        if (inp.value.trim() === '') {
          delete draft.colors[cr[0]];
          if (!Object.keys(draft.colors).length) delete draft.colors;
        } else draft.colors[cr[0]] = inp.value.trim();
      });
      cbox.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, cr[1]), inp));
    });
    cb.appendChild(cbox);
    cb.appendChild(h('div', { class: 'status' }, '高级颜色（states、shadow 等）请使用“原始 JSON”。'));
    ccard.appendChild(cb);
    formHost.appendChild(ccard);

    /* 高级 */
    var acard = h('details', { class: 'card inner-card' });
    acard.appendChild(h('summary', null, '高级'));
    var ab = h('div', { class: 'inner-card-body toolbar' });
    ab.appendChild(h('button', {
      type: 'button', class: 'mini-button',
      onclick: function () {
        var m2 = openModal({ title: '编辑原始 JSON' });
        var ta = h('textarea', { class: 'json-editor', rows: 14, spellcheck: 'false' });
        ta.value = JSON.stringify(draft, null, 2);
        m2.body.appendChild(ta);
        m2.toolbar.appendChild(h('button', { type: 'button', onclick: function () { m2.close(); } }, '取消'));
        m2.toolbar.appendChild(h('button', {
          type: 'button', class: 'primary',
          onclick: function () {
            try {
              var v = JSON.parse(ta.value);
              if (!FE.isPlainObject(v)) throw new Error('必须是 JSON 对象');
              draft = v;
              m2.close();
              buildForm();
            } catch (e) { alert('JSON 无效: ' + e.message); }
          }
        }, '应用'));
        setTimeout(function () { ta.focus(); }, 50);
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
  function updNode(n) {
    var node = n;
    if (!FE.isPlainObject(node)) return;
    if (node.ref === oldN) node.ref = newN;
    updGestures(node);
    (Array.isArray(node.variants) ? node.variants : []).forEach(function (v) {
      if (FE.isPlainObject(v) && v.ref === oldN) v.ref = newN;
      if (FE.isPlainObject(v)) updGestures(v);
    });
  }
  Object.keys(nk).forEach(function (k) { updNode(nk[k]); });
  Object.keys(state.profile.layouts || {}).forEach(function (ln) {
    var L = state.profile.layouts[ln];
    if (!FE.isPlainObject(L) || !Array.isArray(L.sections)) return;
    L.sections.forEach(function (s) {
      if (!FE.isPlainObject(s)) return;
      if (s.type === 'rows') {
        FE.rowsOfSection(s).forEach(function (row) { row.keys.forEach(updNode); });
      } else if (s.type === 'grid' && Array.isArray(s.keys)) {
        s.keys.forEach(updNode);
      }
    });
  });
}
FE.renameKeyDef = renameKeyDef;
})();
