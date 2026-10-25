(function () {
'use strict';
var FE=window.FE, state=FE.state, h=FE.h, clearEl=FE.clearEl, openModal=FE.openModal;
FE.buildGestureEditor = function (opts) {
  var g = opts.gesture;
  var slot = opts.slot;
  var isLongPress = slot === 'longPress';
  var isHold = slot === 'hold';
  /* drag 与 hold 一样是「带子槽位的手势对象」：自带 step / feedback / 四向每步动作
   * 与松手动作。进入本对话框时 slot 恰为 drag；四向与松手用嵌套对话框（slot 为
   * drag.up 之类）复用同一套「引用 / 直接动作 / 动作名 / 宏」编辑能力。 */
  var isDrag = slot === 'drag';
  var names = {
    tap: '点击（tap）', doubleTap: '双击（doubleTap）',
    'swipe.up': '上滑（swipe.up）', 'swipe.down': '下滑（swipe.down）',
    'swipe.left': '左滑（swipe.left）', 'swipe.right': '右滑（swipe.right）',
    longPress: '长按（longPress）', hold: '按住（hold）',
    drag: '拖动（drag）',
    'drag.up': '拖动·上（drag.up）', 'drag.down': '拖动·下（drag.down）',
    'drag.left': '拖动·左（drag.left）', 'drag.right': '拖动·右（drag.right）'
  };
  var guard = FE.snapshotGuard(function () {
    return {
      mode: modeSel.value,
      ref: refName,
      /* 动作名 / 宏只在各自来源下才算改动：两者是"下拉显示即已选"的控件，
       * 重建字段区时会自动回写首项，若不按来源过滤，切过去再切回来会被
       * 误判成"有未保存改动"，关闭时白弹一次确认。 */
      actionName: modeSel.value === 'action-name' ? actionName : null,
      macro: modeSel.value === 'macro' ? macroName : null,
      label: labelInp.value,
      hint: hintInp.value,
      popup: popupSel.value,
      repeat: repeatChk.checked,
      popupKey: popupKeyInp.value,
      direct: area._editor ? area._editor.getValue() : null,
      start: startEditor ? startEditor.getValue() : null,
      end: endEditor ? endEditor.getValue() : null,
      /* drag 的四个方向与松手不经过上面的 editor，单独进快照 */
      drag: isDrag ? FE.deepClone(dragDraft) : null,
      step: isDrag ? stepInp.value : '',
      feedback: isDrag ? feedbackSel.value : ''
    };
  });
  var inline = !!opts.inline;
  var errorBox = h('div', { class: 'gesture-error status error', role: 'alert' });
  function gestureError(message) { if (inline) errorBox.textContent = message; else FE.uiAlert(message); }
  var modal = opts.surface || openModal({
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
  if(opts.cached && opts.cached.refName!=null)refName=opts.cached.refName;
  var actionName = (mode === 'action-name' && typeof g === 'string') ? g : null;
  var macroName = (mode === 'macro' && FE.isPlainObject(g)) ? g.macro : null;
  var directSpec = null;
  if (mode === 'direct' && FE.isPlainObject(g)) {
    if (g.action != null) directSpec = g.action;
    else if (g.actions != null) directSpec = g.actions;
    else if (g.type != null) directSpec = FE.omit(g, ['label', 'popup', 'repeat', 'popupKey', 'hint']);
  }
  var startSpec = null, endSpec = null;
  var holdStartKey = null, holdEndKey = null;
  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  if (isHold && FE.isPlainObject(g)) {
    if (hasOwn(g, 'start')) { holdStartKey = 'start'; startSpec = g.start; }
    else if (hasOwn(g, 'action')) { holdStartKey = 'action'; startSpec = g.action; }
    else if (hasOwn(g, 'actions')) { holdStartKey = 'actions'; startSpec = g.actions; }
    if (hasOwn(g, 'end')) { holdEndKey = 'end'; endSpec = g.end; }
    else if (hasOwn(g, 'endAction')) { holdEndKey = 'endAction'; endSpec = g.endAction; }
    else if (hasOwn(g, 'endActions')) { holdEndKey = 'endActions'; endSpec = g.endActions; }
  }

  function buildHoldEditor(spec) {
    if (Array.isArray(spec)) {
      var jsonEd = FE.buildJsonSnippetEditor({
        value: JSON.stringify(spec, null, 2), rows: 5, applyOnBlur: false
      });
      return {
        el: jsonEd.el,
        getValue: function () {
          var a = jsonEd.check();
          /* 空/非法数组编辑不应在一次保存中静默抹掉原始备用形式。 */
          if (a.empty || a.error || !Array.isArray(a.value)) return FE.deepClone(spec);
          return a.value;
        }
      };
    }
    return FE.buildActionEditor(spec);
  }

  function readHoldSide(editor, original) {
    var value = editor ? editor.getValue() : null;
    /* buildActionEditor 不编辑数组；数组走 JSON 编辑器，空内容仍保留原数组。 */
    if (Array.isArray(original) && value == null) return FE.deepClone(original);
    return value;
  }

  function writeHoldSide(out, canonicalKey, originalKey, editor, original) {
    var value = readHoldSide(editor, original);
    if (value != null || originalKey) out[originalKey || canonicalKey] = value;
  }

  function addLongPressExtras(value) {
    if (!isLongPress) return value;
    var hasRepeat = repeatChk.checked || (FE.isPlainObject(g) && hasOwn(g, 'repeat'));
    var hasPopupKey = popupKeyInp.value.trim() !== '' || (FE.isPlainObject(g) && hasOwn(g, 'popupKey'));
    var out = value;
    /* 动作名称通常以字符串返回；一旦需要保留长按补丁就转成对象形态。 */
    if (typeof out === 'string') out = { action: out };
    if (!FE.isPlainObject(out)) out = out == null ? {} : { action: out };
    if (hasRepeat) out.repeat = repeatChk.checked;
    if (hasPopupKey) {
       var popupKey = popupKeyInp.value.trim();
       if (popupKey) out.popupKey = popupKey;
       else delete out.popupKey;
     }
    return out;
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
  /* drag 是独立的手势对象（schema 的 $defs.drag，不是 gesture），它没有"动作名称"
   * 与"宏调用"这两种来源：动作只挂在四个方向与松手上。 */
  if (isDrag) {
    Array.prototype.slice.call(modeSel.children).forEach(function (o) {
      if (o.value === 'action-name' || o.value === 'macro') modeSel.removeChild(o);
    });
    if (mode !== 'inherit' && mode !== 'ref') modeSel.value = 'direct';
  }

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

  /* ---- drag 专用面板（schema $defs.drag） ----
   * drag 与其它手势形状不同：它没有"自己的动作"，动作挂在四个方向与松手上，
   * 另有 step / feedback。四向与松手用嵌套的小对话框编辑（slot 为 drag.up 之类），
   * 因为这些槽位的值仍是完整的手势对象（字符串引用 / action / actions / type），
   * 全展开会让主对话框长到不可用。
   *
   * dragDraft 只留"本对话框不直接编辑"的字段（step / feedback / 四向 / end 家族），
   * 顶层已有控件的 ref / label / hint / popup 交给 labelInp 那批控件，
   * 这样保存时不会把同一字段写两遍。 */
  var dragDraft = (isDrag && FE.isPlainObject(g)) ? FE.deepClone(g) : {};
  if(opts.cached && opts.cached.dragDraft)dragDraft=FE.deepClone(opts.cached.dragDraft);
  if (!FE.isPlainObject(dragDraft)) dragDraft = {};
  if (isDrag) ['ref', 'label', 'hint', 'popup', 'step', 'feedback'].forEach(function (k) { delete dragDraft[k]; });

  /* step / feedback 的控件建一次，重画时重新挂进 box（输入值不丢） */
  var stepInp = h('input', {
    type: 'number', class: 'mini-input', min: '1', step: '1',
    value: (isDrag && FE.isPlainObject(g) && g.step != null) ? String(g.step) : ''
  });
  var feedbackSel = h('select', { class: 'mini-select' });
  FE.DRAG_FEEDBACKS.forEach(function (fb) {
    feedbackSel.appendChild(h('option', { value: fb }, fb === 'none' ? 'none（无反馈）' :
      (fb === 'vibrate' ? 'vibrate（逐步震动，默认）' : 'key（完整按键反馈）')));
  });
  /* 回填大小写不敏感：Foxy 契约允许 "KEY" / "Vibrate" 等写法，下拉统一选中
   * 对应的小写 option；非法值（非枚举）才回落 vibrate。保存时 collectDragValue
   * 写回的是下拉值，因此重新保存会把用户原文归一化成规范小写 —— 与 modifier
   * 字段「图形界面重新保存时写规范形式」同一政策。 */
  var fbValue = 'vibrate';
  if (isDrag && FE.isPlainObject(g) && typeof g.feedback === 'string') {
    var fbLower = g.feedback.toLowerCase();
    if (FE.DRAG_FEEDBACKS.indexOf(fbLower) >= 0) fbValue = fbLower;
  }
  feedbackSel.value = fbValue;

  function dragSlotValue(key) {
    return Object.prototype.hasOwnProperty.call(dragDraft, key) ? dragDraft[key] : undefined;
  }
  function setDragSlot(key, nv) {
    if (nv === undefined) delete dragDraft[key];
    else dragDraft[key] = nv;
    buildArea();
  }
  function dragSlotRow(key, label) {
    var val = dragSlotValue(key);
    var sum;
    if (val === undefined) {
      /* 没写就是继承（引用时来自被引用按键，否则无动作） */
      sum = '（继承）';
    } else if (val === null) {
      sum = '（已清除）';
    } else {
      var gi = FE.gestureInfo(val, FE.NEUTRAL_STATUS);
      sum = gi && gi.action ? gi.action.display : '（无动作）';
    }
    return h('div', { class: 'gesture-row' },
      h('span', { class: 'gesture-name' }, label),
      h('span', { class: 'gesture-sum' }, sum),
      h('button', {
        type: 'button', class: 'mini-button',
        onclick: function () {
          FE.openGestureDialog({
            slot: 'drag.' + key,
            gesture: val === undefined ? null : val,
            onChange: function (nv) { setDragSlot(key, nv); }
          });
        }
      }, '编辑…'),
      h('button', {
        type: 'button', class: 'mini-button danger',
        title: '置 null，屏蔽继承',
        onclick: function () { setDragSlot(key, null); }
      }, '清除'),
      val !== undefined ? h('button', {
        type: 'button', class: 'mini-button',
        title: '删除字段，恢复继承',
        onclick: function () { setDragSlot(key, undefined); }
      }, '继承') : null
    );
  }

  function buildDragPanel() {
    var box = area._dragBox || h('div', { class: 'gesture-drag-panel' });
    area._dragBox = box;
    clearEl(box);

    box.appendChild(h('div', { class: 'form-row form-inline' },
      h('label', { class: 'mini-label' }, '步长'),
      stepInp, h('span', { class: 'status' }, 'dp，留空取光标步长设置'),
      h('label', { class: 'mini-label' }, '反馈'), feedbackSel));
    FE.DRAG_DIRS.forEach(function (d) {
      box.appendChild(dragSlotRow(d, '拖动·' + ({ up: '上', down: '下', left: '左', right: '右' })[d]));
    });
    box.appendChild(dragSlotRow('end', '松手动作 end'));
    box.appendChild(h('div', { class: 'status' },
      '拖动时按设定步长重复执行方向动作，松手执行结束动作；轻点仍执行点击动作。'));
    area.appendChild(box);
  }

  /* drag 保存：以 dragDraft 为底（保留未在图形界面里出现的字段），
   * 再把对话框顶层控件的值写回去。四向与松手在 dragDraft 里已是最终形态。 */
  function collectDragValue(extras, hasRef) {
    var out = FE.deepClone(dragDraft);
    delete out.step;
    delete out.feedback;
    var stepNum = stepInp.value.trim() === '' ? null : Number(stepInp.value);
    if (stepNum != null && (!isFinite(stepNum) || stepNum <= 0)) {
      gestureError('步长必须是大于 0 的数字，或留空取光标步长设置');
      return null;
    }
    if (stepNum != null) out.step = stepNum;
    if (feedbackSel.value && feedbackSel.value !== 'vibrate') out.feedback = feedbackSel.value;
    /* 继承语义：既没有 ref 也没有任何实际内容，就当"移除字段"处理 */
    var hasBody = false;
    Object.keys(out).forEach(function (k) { if (out[k] !== undefined) hasBody = true; });
    if (!hasRef && !hasBody && !Object.keys(extras).length) return undefined;
    return Object.assign(out, extras);
  }

  function buildArea() {
    clearEl(area);
    /* 下拉控件每次重建，旧引用立刻作废：保存时只认当前这次渲染出来的控件，
     * 否则会读到上一个来源遗留的下拉（显示与保存对不上）。 */
    area._editor = null;
    area._actSel = null;
    area._macroSel = null;
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
      var actNames = Object.keys(acts);
      /* 下拉一渲染出来就必然显示某一项（首项），所以内部状态必须跟着显示走：
       * 否则"看起来已经选了"、保存时却判为空，用户会撞上「请选择动作」而无从下手。
       * 回写首项等价于"默认选中第一个"，与 buildActionEditor 里动作名下拉一致。 */
      if (!actionName && actNames.length) actionName = actNames[0];
      actNames.forEach(function (n) {
        sel.appendChild(h('option', { value: n, selected: actionName === n }, n + ' · ' + FE.actionDisplay(acts[n])));
      });
      if (!actNames.length) sel.appendChild(h('option', { value: '' }, '（尚无动作定义，请先在「动作与宏」页新增）'));
      /* 历史数据可能引用已删除的动作：补一项"未定义"，既不悄悄替换成别的
       * 动作，也不让下拉显示成空（与 buildActionEditor 的 ref 下拉同构）。 */
      if (actionName && actNames.indexOf(actionName) < 0) {
        sel.appendChild(h('option', { value: actionName, selected: true }, actionName + '（未在当前文件中定义）'));
      }
      sel.addEventListener('change', function () { actionName = sel.value; });
      if (actionName) sel.value = actionName;
      area._actSel = sel;
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '动作'), sel));
    } else if (m === 'macro') {
      var msel = h('select', { class: 'mini-select wide' });
      var macros = state.profile.macros || {};
      var macroNames = Object.keys(macros);
      /* 同 action-name：显示首项就回写首项，避免"显示已选、状态为空"。 */
      if (!macroName && macroNames.length) macroName = macroNames[0];
      macroNames.forEach(function (n) {
        msel.appendChild(h('option', { value: n, selected: macroName === n }, n));
      });
      if (!macroNames.length) msel.appendChild(h('option', { value: '' }, '（尚无宏定义，请先在「动作与宏」页新建）'));
      if (macroName && macroNames.indexOf(macroName) < 0) {
        msel.appendChild(h('option', { value: macroName, selected: true }, macroName + '（未在当前文件中定义）'));
      }
      msel.addEventListener('change', function () { macroName = msel.value; });
      if (macroName) msel.value = macroName;
      area._macroSel = msel;
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '宏'), msel));
    } else if (m === 'direct' && !isHold && !isDrag) {
      var ed = Array.isArray(directSpec) ? buildHoldEditor(directSpec) : FE.buildActionEditor(directSpec);
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
              if (!k) { gestureError('请先填写弹出菜单键 popupKey'); return; }
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
        startEditor = buildHoldEditor(startSpec);
        endEditor = buildHoldEditor(endSpec);
        area.appendChild(h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '开始动作' + (holdStartKey && holdStartKey !== 'start' ? '（' + holdStartKey + '）' : '')), startEditor.el));
        area.appendChild(h('div', { class: 'form-row' }, h('label', { class: 'mini-label' }, '结束动作' + (holdEndKey && holdEndKey !== 'end' ? '（' + holdEndKey + '）' : '')), endEditor.el));
      }
      if (isDrag) buildDragPanel();
    }
  }
  modeSel.addEventListener('change', buildArea);
  buildArea();

  /* 首轮 UI 建好后记基线：此后任何改动都能被 onBeforeClose 看出来 */
  guard.reset();

  if (!inline) modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'danger',
    onclick: function () { modal.close(); opts.onChange(null); }
  }, '清除（置 null 屏蔽继承）'));
  /* 「取消」走守卫：有改动先确认 */
  if (!inline) modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  var initialForm = null;
  function formValue() { return {fields:FE.readEditorFields(modal.body),ref:refName,drag:dragDraft}; }
  initialForm = FE.stableJson(formValue());
  function collectValue() {
    if (inline && FE.stableJson(formValue()) === initialForm) return { ok: true, value: g };

    errorBox.textContent = '';
      var m = modeSel.value;
      var value;
      if (m === 'inherit') { value = undefined; }
      else {
        var extras = {};
        if (labelInp.value !== '') extras.label = labelInp.value;
        else if(FE.isPlainObject(g)&&g.label===null)extras.label=null;
        if (hintInp.value !== '') extras.hint = hintInp.value;
        else if(FE.isPlainObject(g)&&g.hint===null)extras.hint=null;
        if (popupSel.value === '1') extras.popup = true;
        else if (popupSel.value === '0') extras.popup = false;
        else if(FE.isPlainObject(g)&&g.popup===null)extras.popup=null;
        if (m === 'ref') {
          if (!refName) { gestureError('请选择引用的按键'); return; }
          value = Object.assign({ ref: refName }, extras);
          /* hold 引用可额外覆盖 start/end（文档：A hold reference can additionally
           * override its start/... and end/... fields）。之前这里漏读，导致填了却丢失。 */
          if (isHold) {
            writeHoldSide(value, 'start', holdStartKey, startEditor, startSpec);
            writeHoldSide(value, 'end', holdEndKey, endEditor, endSpec);
          }
          /* drag 引用同样允许覆盖四向与松手（与 hold 引用覆盖 start/end 同理） */
          if (isDrag) {
            var dg = collectDragValue(extras, true);
            if (dg === null) return;
            value = Object.assign({ ref: refName }, dg);
          }
        } else if (m === 'action-name') {
          /* 保存以"下拉此刻显示的那一项"为准：DOM 是用户看到的真相，
           * 内部变量只是它的镜像（change 事件在部分操作路径上不一定会触发）。 */
          if (area._actSel) actionName = area._actSel.value || null;
          if (!actionName) {
            gestureError(Object.keys(state.profile.actions || {}).length
              ? '请选择动作'
              : '还没有任何动作定义：请先到「动作与宏」页新建一个动作');
            return;
          }
          value = Object.keys(extras).length ? Object.assign({ action: actionName }, extras) : actionName;
        } else if (m === 'macro') {
          if (area._macroSel) macroName = area._macroSel.value || null;
          if (!macroName) {
            gestureError(Object.keys(state.profile.macros || {}).length
              ? '请选择宏'
              : '还没有任何宏：请先到「动作与宏」页新建一个宏');
            return;
          }
          value = Object.assign({ macro: macroName }, extras);
        } else if (isDrag) {
          value = collectDragValue(extras, !!refName);
          if (value === null) return;
        } else {
          var act = area._editor ? area._editor.getValue() : null;
          if (isHold) {
            value = Object.assign({}, extras);
            writeHoldSide(value, 'start', holdStartKey, startEditor, startSpec);
            writeHoldSide(value, 'end', holdEndKey, endEditor, endSpec);
            var startKey = holdStartKey || 'start';
            var endKey = holdEndKey || 'end';
            if (value[startKey] == null && value[endKey] == null && !Object.keys(extras).length) {
              gestureError('请至少配置开始或结束动作'); return;
            }
          } else {
            var hasLongPressExtras = isLongPress && (
               popupKeyInp.value.trim() !== '' || repeatChk.checked ||
               (FE.isPlainObject(g) && (hasOwn(g, 'repeat') || hasOwn(g, 'popupKey'))));
             if (!act && !Object.keys(extras).length && !hasLongPressExtras) { gestureError('请配置动作'); return; }
            value = Array.isArray(act) ? Object.assign({ actions: act }, extras) : typeof act==='string' ? Object.assign({action:act},extras) : act ? Object.assign({}, act, extras) : Object.assign({}, extras);
          }
        }
        if (isLongPress) value = addLongPressExtras(value);
      }
      if (FE.isPlainObject(value) && FE.isPlainObject(g)) {
        var known = ['ref','macro','action','actions','type','key','meta','modifier','state','text','layout','command','argument','label','hint','popup','repeat','popupKey','start','end','endAction','endActions','step','feedback'];
        Object.keys(g).forEach(function (key) { if (known.indexOf(key) < 0 && !(key in value)) value[key] = FE.deepClone(g[key]); });
      }
      return { ok: true, value: value };
  }
  if (!inline) modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary', onclick: function () {
      var result = collectValue(); if (!result) return;
      modal.close(); opts.onChange(result.value);
    }
  }, '保存'));
  modal.body.appendChild(errorBox);
  function notify(event) {
    // Select fields rebuild on change. Their earlier input event still sees
    // controls for the previous type, so do not read them until change finishes.
    if(event && event.type==='input' && event.target.tagName==='SELECT')return;
    if (inline && opts.onDraftChange) opts.onDraftChange();
  }
  modal.body.addEventListener('input', notify);
  modal.body.addEventListener('change', notify);
  modal.body.addEventListener('click', function () { if (inline) setTimeout(notify, 0); });
  if(opts.cached)FE.restoreEditorFields(modal.body,opts.cached.fields);
  return { el: modal.body, read: collectValue, changed:function(){return FE.stableJson(formValue())!==initialForm;}, snapshot:function(){return {fields:FE.readEditorFields(modal.body),refName:refName,dragDraft:FE.deepClone(dragDraft)};} };
};
FE.openGestureDialog = function (opts) { return FE.buildGestureEditor(opts); };

})();
