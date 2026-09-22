/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * macro-editor.js — 「动作与宏」页的图形化编辑器
 *
 * 为什么单独一个模块：这两块原先只是把 JSON 塞进 <textarea>（app.js 的 jsonTextarea），
 * 本质仍是手写 JSON，谈不上 GUI。这里改成与参照项目 f5a-see-me 同款的交互。
 *
 * 核心抽象（原作者的要点）：**宏的每一个步骤就是一个 action**。
 * 所以不另造「步骤类型」这一层，而是把 FE.buildActionEditor 抽象出来直接复用：
 * 一个步骤 = 一个 actionExpression（字符串=引用动作名 / 对象=内联动作），
 * 宏编辑器只负责「一行一步」的外壳：序号、增删、排序、以及 JSON 逃生口。
 * 动作（actions）列表同理，也是同一个 action 编辑器。
 *
 * 持久化契约（重要）：控件改动走 opts.commit(...) —— 由调用方**静默**写回
 * state.profile 并刷新 JSON/校验，**不触发 renderAll()**。否则每选一次下拉就重建
 * 整个列表，正在操作的控件会被销毁、焦点丢失。结构性改动（增删/移动步骤）才由
 * 编辑器自己重渲染所在的那一个卡片。
 *
 * 加载顺序：依赖 app.js 的 FE.h / FE.clearEl / FE.state 与 key-dialog.js 的
 * FE.buildActionEditor / FE.buildJsonSnippetEditor，因此**必须排在 key-dialog.js 之后**。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

function isPlainObject(o) { return FE.isPlainObject ? FE.isPlainObject(o) : false; }

/* ================================================================
 * 一、纯逻辑（Node 测试可直接使用，无 DOM 依赖）
 * ================================================================ */

/* 一个宏步骤（= 一个 actionExpression）→ 编辑器草稿。
 * 结构：{ spec, form, raw, readonly?, reason? }
 *   spec     —— 交给 FE.buildActionEditor 的值（字符串=引用，对象=内联）
 *   form     —— 'bare'（裸字符串）| 'wrapped'（{action:名}）| 'inline'（对象）
 *               用于往返稳定：没改过的步骤保持原写法，不因打开一次就被改写
 *   raw      —— 原始 JSON，供「原始 JSON…」逃生口
 *
 * 控件覆盖不到的写法归为 readonly：只读展示原因 + 引导用逃生口，**绝不静默改写**。
 * 典型是 {macro:名}：文档明确说嵌套宏在转换步骤时会被丢弃，所以不提供编辑入口。 */
FE.macroStepToDraft = function (step) {
  if (typeof step === 'string') {
    return { spec: step, form: 'bare', raw: step };
  }
  if (!isPlainObject(step)) {
    return { spec: null, form: 'raw', raw: step, readonly: true, reason: '不是字符串或动作对象' };
  }
  if (step.macro != null) {
    return { spec: null, form: 'raw', raw: step, readonly: true,
      reason: '宏步骤不能调用另一个宏（嵌套宏会被运行时丢弃），请改用引用动作名或内联动作' };
  }
  if (step.actions != null) {
    return { spec: null, form: 'raw', raw: step, readonly: true,
      reason: 'actions 数组不是文档列出的宏步骤写法（单步只需一个动作表达式）' };
  }
  if (step.action != null) {
    if (typeof step.action === 'string') {
      return { spec: step.action, form: 'wrapped', raw: step };
    }
    if (isPlainObject(step.action)) {
      return { spec: FE.deepClone(step.action), form: 'inline', raw: step };
    }
    return { spec: null, form: 'raw', raw: step, readonly: true,
      reason: 'action 字段既不是动作名也不是动作对象' };
  }
  if (step.type != null || step.ref != null) {
    return { spec: FE.deepClone(step), form: 'inline', raw: step };
  }
  return { spec: null, form: 'raw', raw: step, readonly: true,
    reason: '无法识别的步骤（既不是动作名，也没有 type）' };
};

/* 编辑器给出的值 → 宏步骤。value 为 null 表示这一步当前无效。 */
FE.macroValueToStep = function (value, form) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    /* 引用形态：原本是裸字符串就保持裸字符串，否则用 {action:名} */
    return form === 'bare' ? value : { action: value };
  }
  if (isPlainObject(value)) return FE.deepClone(value);
  return null;
};

FE.macroStepsToDrafts = function (steps) {
  return (Array.isArray(steps) ? steps : []).map(FE.macroStepToDraft);
};

/* 步骤 → 一行摘要。scope 可选（显式传入时动作名/宏名在 scope 里查）。 */
FE.describeMacroStep = function (step, scope) {
  if (typeof step === 'string') return '引用 ' + step;
  if (isPlainObject(step)) {
    if (step.macro != null) return '⚠ 宏调用 ' + step.macro;
    if (typeof step.action === 'string') return '引用 ' + step.action;
    if (isPlainObject(step.action)) return FE.actionDisplay(step.action);
    if (step.type != null) return FE.actionDisplay(step);
  }
  return '⚠ 无法识别';
};

FE.describeMacroSteps = function (steps, scope) {
  var arr = Array.isArray(steps) ? steps : [];
  if (!arr.length) return '（空宏）';
  var head = arr.slice(0, 3).map(function (s) { return FE.describeMacroStep(s, scope); }).join(' → ');
  return arr.length > 3 ? head + ' → …（共 ' + arr.length + ' 步）' : head;
};

/* 纯数据层的步骤重排（拖动与 ▲▼ 共用，便于测试直接覆盖）。
 * 作用于「步骤数组」本身，不关心每一步的内容形态。 */
FE.moveMacroStep = function (steps, from, to) {
  var arr = Array.isArray(steps) ? steps : [];
  if (from < 0 || from >= arr.length) return false;
  var next = Math.max(0, Math.min(to, arr.length - 1));
  if (next === from) return false;
  var moved = arr.splice(from, 1)[0];
  arr.splice(next, 0, moved);
  return true;
};

/* 宏的步骤完整性检查：只报「某步为空」，不做类型特判（每步就是一个 action，
 * 类型合法性交给 validateProfile 的动作校验）。返回提示文字数组。 */
FE.validateMacroStepsDraft = function (values) {
  var out = [];
  (Array.isArray(values) ? values : []).forEach(function (v, i) {
    if (v === null || v === undefined || v === '') out.push('步骤 ' + (i + 1) + '：尚未选择动作');
  });
  return out;
};

/* ================================================================
 * 二、UI 部分
 * ================================================================ */
if (typeof document === 'undefined' || typeof window === 'undefined' ||
    !document.getElementById('macros-list')) {
  return;
}
var h = FE.h, clearEl = FE.clearEl;

/* ================================================================
 * 宏步骤编辑器：一行一步，行内直接复用 action 编辑器
 * opts: { commit(stepsArray) } —— 每次有效改动后回调，由调用方静默写回
 * 返回 { el, getValue(), getDrafts() }
 * ================================================================ */
FE.buildMacroStepEditor = function (steps, opts) {
  opts = opts || {};
  var drafts = FE.macroStepsToDrafts(steps);
  var editors = [];           // 与 drafts 等长的 action 编辑器（readonly 项为 null）
  var root = h('div', { class: 'macro-steps' });
  var dragFrom = null;

  /* 各步的当前值：readonly 项原样返回原始 JSON，保证往返不改写 */
  function values() {
    return drafts.map(function (d, i) {
      if (d.readonly) return d.raw;
      var ed = editors[i];
      return ed ? ed.getValue() : d.spec;
    });
  }

  function stepsOut() {
    var vals = values();
    var steps = [], invalid = [];
    vals.forEach(function (v, i) {
      if (drafts[i].readonly) { steps.push(v); return; }
      var s = FE.macroValueToStep(v, drafts[i].form);
      if (s === null) invalid.push(i + 1);
      else steps.push(s);
    });
    return { steps: steps, invalid: invalid };
  }

  function commit() {
    if (typeof opts.commit !== 'function') return;
    var out = stepsOut();
    /* 有无效步骤时不写回，避免把半个宏存进 profile；行内已有红字提示 */
    if (out.invalid.length) return;
    opts.commit(out.steps);
  }

  function redraw() { render(); commit(); }

  function moveBy(i, delta) {
    /* 先把各行编辑器的当前值固化回草稿，再重排，避免丢改动 */
    var vals = values();
    drafts.forEach(function (d, k) { if (!d.readonly) d.spec = vals[k]; });
    if (FE.moveMacroStep(drafts, i, i + delta)) redraw();
  }

  function insertAfter(i) {
    var vals = values();
    drafts.forEach(function (d, k) { if (!d.readonly) d.spec = vals[k]; });
    var acts = (isPlainObject(FE.state.profile.actions)) ? FE.state.profile.actions : {};
    var names = Object.keys(acts);
    /* 新步骤默认给一个可用值：有动作定义就引用第一个，否则内联一个 Backspace */
    var step = names.length ? names[0] : { type: 'key', key: 'BACKSPACE' };
    drafts.splice(i + 1, 0, FE.macroStepToDraft(step));
    redraw();
  }

  function removeAt(i) {
    var vals = values();
    drafts.forEach(function (d, k) { if (!d.readonly) d.spec = vals[k]; });
    drafts.splice(i, 1);
    redraw();
  }

  function render() {
    clearEl(root);
    editors = [];
    if (!drafts.length) {
      root.appendChild(h('div', { class: 'status' }, '这个宏还没有步骤。点下方「+ 添加步骤」开始。'));
    }

    drafts.forEach(function (d, i) {
      var row = h('div', { class: 'macro-step' });
      row.appendChild(h('span', { class: 'macro-step-handle', title: '按住拖动可调整顺序' }, '⠿'));
      row.appendChild(h('span', { class: 'macro-step-index' }, String(i + 1)));

      var main = h('div', { class: 'macro-step-main' });
      if (d.readonly) {
        /* 控件覆盖不到的写法：只读展示 + 引导用逃生口，不静默改写 */
        editors.push(null);
        main.appendChild(h('div', { class: 'status warn' }, '⚠ ' + (d.reason || '无法识别')));
        main.appendChild(h('code', { class: 'macro-step-raw' }, JSON.stringify(d.raw)));
      } else {
        /* 每一步就是一个 action —— 直接复用统一的动作编辑器。
         * allowRef：宏步骤常写「引用动作名」；exclude macro：禁止嵌套宏。 */
        var ed = FE.buildActionEditor(d.spec, {
          allowRef: true,
          exclude: ['macro'],
          onChange: function () { commit(); }
        });
        editors.push(ed);
        main.appendChild(h('div', { class: 'form-row' }, ed.el));
      }
      row.appendChild(main);

      var tools = h('div', { class: 'macro-step-tools' });
      tools.appendChild(h('button', { type: 'button', class: 'icon-button', title: '上移', onclick: function () { moveBy(i, -1); } }, '▲'));
      tools.appendChild(h('button', { type: 'button', class: 'icon-button', title: '下移', onclick: function () { moveBy(i, 1); } }, '▼'));
      tools.appendChild(h('button', { type: 'button', class: 'icon-button', title: '在下方插入一步', onclick: function () { insertAfter(i); } }, '＋'));
      tools.appendChild(h('button', { type: 'button', class: 'icon-button', title: '编辑该步的原始 JSON', onclick: function () { openStepJson(i); } }, '{ }'));
      tools.appendChild(h('button', { type: 'button', class: 'icon-button danger', title: '删除此步', onclick: function () { removeAt(i); } }, '✕'));
      row.appendChild(tools);

      bindMacroStepDrag(row, i);
      root.appendChild(row);
    });

    var warns = FE.validateMacroStepsDraft(values());
    if (warns.length) root.appendChild(h('div', { class: 'status warn' }, '⚠ ' + warns.join('；')));

    root.appendChild(h('div', { class: 'toolbar' },
      h('button', {
        type: 'button', class: 'mini-button macro-step-add',
        onclick: function () { insertAfter(drafts.length - 1); }
      }, '+ 添加步骤')));
  }

  /* 该步的原始 JSON（逃生口）：编辑一条步骤，保存后该行按新内容重建 */
  function openStepJson(i) {
    var d = drafts[i];
    var cur = d.readonly ? d.raw : (function () {
      var v = values()[i];
      var s = FE.macroValueToStep(v, d.form);
      return s === null ? d.raw : s;
    })();
    var snip = null;
    /* baseline 由守卫内部序列化，**别自己先转字符串**：早期写成
     * `jsonBaseline = snip.getValue()` 再交给守卫，守卫会把它当对象再序列化一次
     * → 两边永远不等 → 没改也被判成改了，用户被白弹确认框。 */
    var guard = FE.snapshotGuard(function () { return snip ? snip.getValue() : null; },
      { message: '步骤 JSON 有未保存的改动，关闭将丢弃它们。' });
    var modal = FE.openModal({
      title: '步骤 ' + (i + 1) + ' 原始 JSON', wide: true,
      /* 改了 JSON 又点遮罩/Esc 关掉 = 白写，先问一句 */
      onBeforeClose: guard.onBeforeClose
    });
    snip = FE.buildJsonSnippetEditor({
      value: JSON.stringify(cur, null, 2),
      rows: 8, applyOnBlur: false, applyAfterFix: false, onApply: function () {}
    });
    guard.reset();
    modal.body.appendChild(h('div', { class: 'dialog-hint' },
      '支持尾逗号 / 注释等自动修复。保存后该步骤按新内容重建控件。'));
    modal.body.appendChild(snip.el);
    modal.toolbar.appendChild(h('button', {
      type: 'button', class: 'mini-button primary', onclick: function () {
        var v = snip.getValue();
        if (v === undefined) return;      /* 空内容不就地删除，避免误操作 */
        var parsed;
        try { parsed = JSON.parse(v); } catch (e) { return; }
        drafts[i] = FE.macroStepToDraft(parsed);
        modal.close();
        redraw();
      }
    }, '保存'));
  }

  /* 拖动把手调整顺序：按指针 Y 与其余各行中线比较得出目标下标。
   * 落点几何在 DOM 桩里测不了（getBoundingClientRect 全 0），故实际数据变更走
   * FE.moveMacroStep，由测试直接覆盖。 */
  function bindMacroStepDrag(row, index) {
    var handle = row.querySelectorAll('.macro-step-handle')[0];
    if (!handle || typeof handle.addEventListener !== 'function') return;
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var pid = e.pointerId;
      dragFrom = index;
      row.classList.add('dragging');
      function targetIndex(clientY) {
        var rows = root.querySelectorAll('.macro-step');
        var others = [];
        rows.forEach(function (r, i) { if (i !== dragFrom) others.push(r); });
        for (var s = 0; s < others.length; s++) {
          var rect = others[s].getBoundingClientRect();
          if (clientY < rect.top + rect.height / 2) return s;
        }
        return rows.length - 1;
      }
      function onMove(ev) {
        if (ev.pointerId !== pid) return;
        if (ev.cancelable) ev.preventDefault();
        /* 拖动中只做视觉提示，不改数据、不动 DOM（清空 root 会把正在拖的行也删掉） */
        var rows = root.querySelectorAll('.macro-step');
        var to = targetIndex(ev.clientY);
        rows.forEach(function (r) { r.classList.remove('drop-gap'); });
        if (to >= 0 && to < rows.length) rows[to].classList.add('drop-gap');
      }
      function onUp(ev) {
        if (ev.pointerId !== pid) return;
        var to = targetIndex(ev.clientY);
        var from = dragFrom;
        finish();
        var vals = values();
        drafts.forEach(function (d, k) { if (!d.readonly) d.spec = vals[k]; });
        if (FE.moveMacroStep(drafts, from, to)) redraw();
      }
      function finish() {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onUp, true);
        row.classList.remove('dragging');
        root.querySelectorAll('.macro-step').forEach(function (r) { r.classList.remove('drop-gap'); });
        dragFrom = null;
      }
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);
    });
  }

  render();
  return {
    el: root,
    getDrafts: function () { return drafts; },
    getValue: function () { return stepsOut().steps; },
    getValues: values
  };
};

/* ================================================================
 * 单个动作定义的编辑器（actions 列表用）—— 与宏步骤同一个动作编辑器
 * opts: { commit(spec), onReplace(spec) }
 *   commit    —— 控件改动 → 由调用方静默写回
 *   onReplace —— 「原始 JSON」保存 → 整块替换（形状可能完全变了）
 * 返回 { el, getValue(), rebuild(spec) }
 * ================================================================ */
FE.buildActionDefEditor = function (name, spec, opts) {
  opts = opts || {};
  var root = h('div', { class: 'action-def-editor' });
  var ed = null;

  function build(value) {
    clearEl(root);
    /* 动作定义本身可以是一个动作表达式：字符串=引用其它动作名，
     * 也可以内联一个动作；宏调用也允许（动作里包宏是合法的）。 */
    ed = FE.buildActionEditor(value, {
      allowRef: true,
      onChange: function () { commit(); }
    });
    root.appendChild(h('div', { class: 'form-row' }, ed.el));
    root.appendChild(h('div', { class: 'toolbar' },
      h('button', {
        type: 'button', class: 'mini-button',
        onclick: function () { openActionJson(); }
      }, '编辑原始 JSON…')));
  }

  function commit() {
    if (typeof opts.commit !== 'function') return;
    var v = ed.getValue();
    if (v == null || v === '') return;    /* 未选好：不写回空值 */
    opts.commit(v);
  }

  function openActionJson() {
    var snip = null;
    /* 同 openStepJson：baseline 交给守卫序列化，别自己先转字符串（会双重编码） */
    var guard = FE.snapshotGuard(function () { return snip ? snip.getValue() : null; },
      { message: '动作 JSON 有未保存的改动，关闭将丢弃它们。' });
    var modal = FE.openModal({
      title: '动作 “' + name + '” 原始 JSON', wide: true,
      /* 改了 JSON 又点遮罩/Esc 关掉 = 白写，先问一句 */
      onBeforeClose: guard.onBeforeClose
    });
    snip = FE.buildJsonSnippetEditor({
      value: JSON.stringify(ed.getValue(), null, 2),
      rows: 8, applyOnBlur: false, applyAfterFix: false, onApply: function () {}
    });
    guard.reset();
    modal.body.appendChild(h('div', { class: 'dialog-hint' },
      '支持尾逗号 / 注释等自动修复。保存后整块替换该动作（可换成与当前控件不同的形状）。'));
    modal.body.appendChild(snip.el);
    modal.toolbar.appendChild(h('button', {
      type: 'button', class: 'mini-button primary', onclick: function () {
        var nv = snip.getValue();
        if (nv === undefined || nv === '') return;
        var parsed;
        try { parsed = JSON.parse(nv); } catch (e) { return; }
        modal.close();
        if (typeof opts.onReplace === 'function') opts.onReplace(parsed);
        else build(parsed);
      }
    }, '保存'));
  }

  build(spec);
  return {
    el: root,
    getValue: function () { return ed ? ed.getValue() : null; },
    rebuild: build
  };
};

/* ================================================================
 * 首次渲染收尾
 * app.js 的 boot() 在 app.js 加载时就跑过一次，那时本模块还没定义
 * FE.buildActionDefEditor / FE.buildMacroStepEditor，两个列表只能给占位。
 * 这里等本模块就绪后补一次渲染。只重建这两个容器，不动其它 UI，
 * 以免打断用户可能已经开始的编辑（例如预览区的选中态）。
 * ================================================================ */
(function bootMacroEditors() {
  if (typeof FE.renderActionsTab !== 'function') return;
  try { FE.renderActionsTab(); } catch (e) { /* 渲染失败不应阻塞页面其余部分 */ }
})();

})();
