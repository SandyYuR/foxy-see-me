(function(){
'use strict';
var FE=window.FE, state=FE.state, h=FE.h, clearEl=FE.clearEl, openModal=FE.openModal;
FE.buildKeyEditor = function (opts) {
  var hosted = !!opts.surface;
  var isPlacement = opts.mode === 'placement';
  if (isPlacement && !FE.sessionContainer(state.profile, {
    layoutName: opts.layoutName || state.layoutName,
    split: opts.split == null ? state.splitMode : !!opts.split, location: opts.location
  })) return;

  var draft;
  if (isPlacement) {
    draft = FE.deepClone(opts.placement || {});
     if (opts.grid) {
       if (draft.column == null && draft.col != null) draft.column = draft.col;
       if (draft.columnSpan == null && draft.colSpan != null) draft.columnSpan = draft.colSpan;
       delete draft.col;
       delete draft.colSpan;
     }
    /* 扁平化 override 到直接字段：按文档优先级 直接字段 > override，
     * 所以先铺 override，再用直接字段覆盖它（冲突时直接字段赢）。 */
    if (FE.isPlainObject(draft.override)) {
      var ov = draft.override;
      delete draft.override;
      var direct = FE.deepClone(draft);
      // A map reset followed by a direct map cannot be flattened into one map:
      // doing so would reintroduce directions/colors from the referenced key.
      // Keep these reset boundaries when reopening a key after partial paste.
      var resets = {};
      ['swipe', 'drag', 'hintTextSize', 'colors'].forEach(function(field) {
        if (ov[field] === null) resets[field] = null;
      });
      var flat = {};
      /* 与 FE.evalPlacement 保持同一顺序：override 普通字段先合并，
       * 再合并直接字段；mergePatch 会保留 swipe/hintTextSize/colors 的
       * 方向/角色层级，并执行 null 语义，而不是整键覆盖。 */
      FE.mergePatch(flat, ov);
      FE.mergePatch(flat, direct);
      ['ref', 'when'].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(direct, k)) flat[k] = FE.deepClone(direct[k]);
      });
      /* evalPlacement 的 override 变体在直接字段之前、直接变体之后生效。
       * 将直接 patch 叠到每个 override 变体，等价保留“直接字段优先”；
       * 直接变体仍放在末尾，维持原有最后匹配者优先规则。 */
      var ovVariants = Array.isArray(ov.variants) ? ov.variants : [];
      var directVariants = Array.isArray(direct.variants) ? direct.variants : [];
      var flattenedVariants = ovVariants.map(function (variant) {
        var v = FE.deepClone(variant);
        FE.mergePatch(v, direct);
        return v;
      }).concat(FE.deepClone(directVariants));
      if (flattenedVariants.length) flat.variants = flattenedVariants;
      if (Object.keys(resets).length) flat.override = resets;
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
    return {draft: draft, moves: session ? session.moves : []};
  });
  var modal = opts.surface || openModal({
    title: isPlacement
      ? '编辑按键' + (opts.grid ? '（网格）' : '')
      : '编辑按键定义',
    wide: true,
    /* 点遮罩 / Esc / 「取消」前先问一句：有未保存改动就别静默丢弃 */
    onBeforeClose: guard.onBeforeClose
  });
  var session = FE.createKeySession(opts, draft);
  var activeGesture = null, gestureFlush = null, gestureEditor = null, pendingGesture = null;
  var rawEditor=null,rawBase=null;
  var formBuildSeq=0;
  var formHost = h('div');
  modal.body.appendChild(formHost);
  var commitErrors = h('div', {class: 'status error key-commit-errors', role: 'alert'});
  if (!hosted) modal.body.appendChild(commitErrors);
  function commitDialog() {
    draftChanged();
    var result = session.apply();
    commitErrors.textContent = result.ok ? '' : result.errors.join('；');
    if (result.ok) modal.close();
    else if (commitErrors.scrollIntoView) commitErrors.scrollIntoView({block: 'nearest'});
    return result.ok;
  }

  var nameInput = null;  // definition 模式下可改名

  function effObj() {
    var p = state.profile;
    var compiled = FE.compileSections([{ type: 'rows', rows: [[draft]] }], FE.NEUTRAL_STATUS, FE.scopeFrom(p));
    return compiled.sections[0].rows[0].keys[0].eff;
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
    var scrollBefore=modal.body.scrollTop||0,seq=++formBuildSeq,openSections={};
    Array.prototype.forEach.call(formHost.querySelectorAll('details'),function(section){
      var summary=section.querySelector('summary');if(summary)openSections[summary.textContent]=section.open;
    });
    var pendingRaw=rawEditor&&rawEditor.value!==rawBase?rawEditor.value:null;
    if(nameInput)session.name=nameInput.value;
    FE.closeActiveColorPicker();   /* 重建前收起取色面板，避免留下悬空面板 */
    clearEl(formHost);
    gestureFlush = null;

    /* 基本信息 */
    var basic = h('details', { class: 'card inner-card', open: true });
    basic.appendChild(h('summary', null, '基本信息'));
    var b = h('div', { class: 'inner-card-body' });

    if (!isPlacement) {
      nameInput = h('input', { type: 'text', class: 'mini-input', value: session.name || '', placeholder: '按键定义名称' });
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
    /* 图标：内置四个 + profile.icons 里自定义的名字 + 内联 svg:/xml: 载荷。
     * 用自定义选择器而不是原生 <select>：内联载荷当成 option 文本会把下拉撑成
     * 一大块横向长条，而且 option 画不出图形。见 FE.buildIconPicker。 */
    var iconPick = FE.buildIconPicker({
      get: function () { return draft.icon; },
      set: function (v) {
        if (v === undefined) delete draft.icon;
        else draft.icon = v;
        draftChanged();
      },
      inherited: function () { return effRaw('icon'); },
      scope: { profile: state.profile }
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '键类型'), ktSel),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '图标'), iconPick)));

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
    /* 已有值按规范大小写不敏感比较，避免手写 "alt" 的键在下拉里显示成「继承」 */
    var curMod = draft.modifier == null ? null
      : (FE.canonicalModifierName ? FE.canonicalModifierName(draft.modifier) : String(draft.modifier).toUpperCase());
    FE.MODIFIERS.forEach(function (m) { modSel.appendChild(h('option', { value: m, selected: curMod === m }, m)); });
    modSel.addEventListener('change', function () {
      if (modSel.value === '') delete draft.modifier;
      else if (modSel.value === '__null__') draft.modifier = null;
      else draft.modifier = modSel.value;
    });
    b.appendChild(h('div', { class: 'form-grid-2' },
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '状态标签'), slSel),
      h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '修饰键'), modSel)));
    /* 长按锁定是**运行时**行为，编辑器不建模按压时长，所以只在表单里说明语义：
     * 声明了 modifier 的键长按会隐式锁定该修饰键（即使没写 longPress）；
     * 写了显式 hold 手势则关闭这个隐式回退；没有 modifier 的原始键（如 rime.Alt_L）
     * 长按仍只发该键本身，不参与修饰键锁定。 */
    b.appendChild(h('div', { class: 'status' },
      '设置修饰键后，长按可锁定；配置“按住”手势后改用该手势。'));
    /* 选中 switch:<name> 源时才显示开关名输入框 */
    if (slIsSwitch) {
      b.appendChild(h('div', { class: 'form-row form-inline' },
        h('label', { class: 'mini-label' }, '开关名'), slSwitchInp));
    }

    if (hosted) {
      var advancedFields = h('details', { class: 'key-advanced-fields' }, h('summary', null, '更多属性：字号、状态与修饰键'));
      var children = Array.prototype.slice.call(b.children);
      children.forEach(function (node) { advancedFields.appendChild(node); });
      // Reuse the original controls/handlers; only their visual grouping changes.
      [nameInput, labelInp, iconPick, weightInp].forEach(function(control){
        if(!control)return;
        var row=control.parentNode;
        if(row&&row.classList.contains('form-row'))b.appendChild(row);
      });
      var source = h('div',{class:'status field-origin'},draft.label === undefined ? '标签继承自 '+(draft.ref||'默认值')+'；留空恢复继承。' : draft.label===null ? '标签已显式清空。' : '标签由此处覆盖；留空恢复继承。');
      b.appendChild(source);
      b.appendChild(h('button',{type:'button',class:'mini-button',onclick:function(){draft.label=null;buildForm();draftChanged();}},'清空标签'));
      b.appendChild(advancedFields);
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

    /* 手势行摘要：drag 有自己的形状（四方向 + 松手），单独出一句中文摘要，
     * 其余手势沿用「标签 + 动作」。 */
    function summaryOf(slot, val) {
      if (slot === 'drag') {
        if (val == null) return '（无）';
        var di = FE.dragInfo(val, FE.NEUTRAL_STATUS);
        if (!di) return '（结构无效）';
        var cn = { up: '上', down: '下', left: '左', right: '右' };
        var parts = [];
        FE.DRAG_DIRS.forEach(function (d) {
          if (!di.directions[d]) return;
          parts.push(cn[d] + ' ' + (di.directions[d].action ? di.directions[d].action.display : '无动作'));
        });
        var tail = di.end ? ('，松手 ' + (di.end.action ? di.end.action.display : '无动作')) : '';
        return (di.label ? '「' + di.label + '」 ' : '') +
          (parts.length ? parts.join(' / ') : '无每步动作') + tail;
      }
      var gi = val !== undefined && val !== null ? FE.gestureInfo(val, FE.NEUTRAL_STATUS) : null;
      return gi ? ((gi.label ? '「' + gi.label + '」 ' : '') + (gi.action ? gi.action.display : '无动作')) : '（无）';
    }
    function gestureRow(slot, label) {
      var val;
      if (slot.indexOf('swipe.') === 0) {
        val = (FE.isPlainObject(draft.swipe) ? draft.swipe[slot.slice(6)] : undefined);
      } else val = draft[slot];
      var summary = val !== undefined ? summaryOf(slot, val) : '（继承）';
      if (val === undefined) {
        var effG = effObj();
        var effVal = slot.indexOf('swipe.') === 0 ? (effG.swipe ? effG.swipe[slot.slice(6)] : undefined) : effG[slot];
        summary = summaryOf(slot, effVal === undefined ? null : effVal);
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

    if (hosted) {
      var controls = h('div', { class: 'gesture-directions', role: 'group', 'aria-label': '选择手势' });
      var moreGestures=h('details',{class:'gesture-more',open:activeGesture&&['longPress','doubleTap','hold','drag'].indexOf(activeGesture)>=0},h('summary',null,'长按、双击与连续手势'));
      var secondary=h('div',{class:'gesture-secondary'});moreGestures.appendChild(secondary);
      var body = h('div', { class: 'inline-gesture-body' });
      var slots = [['swipe.up','↑ 上滑'],['swipe.left','← 左滑'],['tap','点击'],['swipe.right','右滑 →'],['swipe.down','↓ 下滑'],['longPress','长按'],['doubleTap','双击'],['hold','按住'],['drag','连续拖动']];
      slots.forEach(function (pair) {
        var slot = pair[0], val = slot.indexOf('swipe.') === 0 ? draft.swipe && draft.swipe[slot.slice(6)] : draft[slot];
        var effective = slot.indexOf('swipe.') === 0 ? effObj().swipe && effObj().swipe[slot.slice(6)] : effObj()[slot];
        var btn = h('button', { type: 'button', class: 'gesture-direction', 'data-slot': slot,
          'aria-pressed': activeGesture === slot ? 'true' : 'false', onclick: function () {
            if (gestureFlush && !gestureFlush()) return;
            activeGesture = slot; buildForm(); draftChanged();
          } }, pair[1], h('span', { class: 'gesture-direction-summary' }, summaryOf(slot, effective)));
        if(['longPress','doubleTap','hold','drag'].indexOf(slot)>=0)secondary.appendChild(btn);else controls.appendChild(btn);
      });
      gb2.appendChild(controls);
      gb2.appendChild(moreGestures);
      gb2.appendChild(body);
      if (activeGesture) {
        var localValue = activeGesture.indexOf('swipe.') === 0 ? draft.swipe && draft.swipe[activeGesture.slice(6)] : draft[activeGesture];
        var inheritedValue = activeGesture.indexOf('swipe.') === 0 ? effObj().swipe && effObj().swipe[activeGesture.slice(6)] : effObj()[activeGesture];
        body.appendChild(h('div', { class: 'status' }, localValue === undefined ? '继承：' + summaryOf(activeGesture,inheritedValue) : localValue === null ? '此处已显式清除（点击仍保留继承动作）' : '此处覆盖'));
        var actions = h('div', { class: 'toolbar' });
        actions.appendChild(h('button', { type:'button', onclick:function(){ setGesture(activeGesture,undefined); activeGesture=null; buildForm(); draftChanged(); } }, '恢复继承'));
        if (activeGesture !== 'tap') actions.appendChild(h('button', { type:'button', onclick:function(){ setGesture(activeGesture,null); activeGesture=null; buildForm(); draftChanged(); } }, '清除此手势'));
        body.appendChild(actions);
        var embeddedBody=h('div'), embeddedToolbar=h('div'); body.appendChild(embeddedBody);
        var embedded = FE.buildGestureEditor({ slot:activeGesture, gesture:localValue, inline:true, cached:pendingGesture,
          surface:{ body:embeddedBody, toolbar:embeddedToolbar, close:function(){}, requestClose:function(){}, leaveThen:function(fn){modal.leaveThen(fn);} },
          onDraftChange:function(){ if (gestureFlush) gestureFlush(); draftChanged(); }
        });
        gestureEditor=embedded;pendingGesture=null;
        gestureFlush=function(){ if(!embedded.changed())return true; var value=embedded.read(); if (!value) return false; setGesture(activeGesture,value.value); return true; };
      }
    } else {
    gb2.appendChild(gestureRow('tap', '点击 tap'));
    gb2.appendChild(gestureRow('doubleTap', '双击 doubleTap'));
    ['up', 'down', 'left', 'right'].forEach(function (d) {
      gb2.appendChild(gestureRow('swipe.' + d, '滑动·' + ({ up: '上', down: '下', left: '左', right: '右' })[d]));
    });
    gb2.appendChild(gestureRow('longPress', '长按 longPress'));
    gb2.appendChild(gestureRow('hold', '按住 hold'));
    gb2.appendChild(gestureRow('drag', '拖动 drag'));
    }
    gcard2.appendChild(gb2);
    formHost.appendChild(gcard2);

    /* 状态变体 */
    var vcard = h('details', { class: 'card inner-card' });
    vcard.appendChild(h('summary', null, '状态变体（组字 / ASCII / 停用 / 选项开关 / 组合条件）'));
    var vb = h('div', { class: 'inner-card-body' });
    var variants = Array.isArray(draft.variants) ? draft.variants : [];
    variants.forEach(function (v, vi) {
      /* 条件摘要统一走 FE.condSummaryText：选项条件与 all_of/any_of/none_of
       * 直接 Object.keys 拼字符串会渲染成 [object Object]。 */
      var conds = FE.condSummaryText(v && v.when);
      var fields = v ? Object.keys(FE.omit(v, ['when'])).join(', ') : '';
      vb.appendChild(h('div', { class: 'variant-row' },
        h('span', { class: 'gesture-name' }, conds),
        h('span', { class: 'gesture-sum' }, fields),
        h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            FE.openVariantDialog({
              variant: v,
              cacheIndex: hosted ? vi : null,
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
          cacheIndex: hosted ? -1 : null,
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
      if (!r || r.value == null) return '未设置颜色';
      var from = FE.colorSourceLabel(r.source, r.detail);
      var tail;
      if (r.source === FE.COLOR_SOURCES.LAYOUT_STATE) {
        tail = '（本键自己的状态色设置）';
      } else if (r.source === FE.COLOR_SOURCES.LAYOUT_KEY) {
        tail = (kind === 'own') ? '（本键自己的设置）'
          : (kind === 'base') ? '（本键基础配色）'
            : '（继承的配色）';
      } else if (r.source === FE.COLOR_SOURCES.BUILTIN) {
        /* ⚠️ 必须区分两种口径，别一律写成「未导入主题」：
         *   · 主题**确实没导入** → 内置默认就是 Foxy 端的实际取值；
         *   · 主题已导入、但③ keyTypes 与④ 全局都没给这个字段 → 落到 App 内置默认色，
         *     这是编辑器的兜底显示（预览在已导入主题时不写内联色）。
         * 「清空后」的语义由调用方的「清空后 → 」前缀表达，这里不重复。 */
        tail = themeImported()
          ? '（使用默认色）'
          : '（未导入主题，使用默认色）';
      } else {
        tail = '（来自主题）';
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
        draftChanged();
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
        themeStateLine.append('已导入主题，正在预览'+(slot==='dark'?'深色':'浅色')+'配色。');
      } else {
        themeStateLine.append('未导入主题，当前使用 Foxy 默认配色。');
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
      '每行显示当前颜色和来源。留空恢复继承；主题中的颜色可通过“到主题页改”调整。'));
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
    cadvBody.appendChild(h('div', { class: 'status' }, '阴影可使用半透明色。若另设了“按下”状态配色，则优先使用状态配色。'));
    var hintEdges = [['hintTop', '提示·上 hintTop'], ['hintBottom', '提示·下 hintBottom'], ['hintLeft', '提示·左 hintLeft'], ['hintRight', '提示·右 hintRight']];
    var hgrid = h('div', { class: 'form-grid-2 color-role-grid' });
    hintEdges.forEach(function (he) {
      var hgs = roleGetSet(he[0]);
      hgrid.appendChild(colorRow(he[1], he[0], hgs[0], hgs[1]));
    });
    cadvBody.appendChild(hgrid);
    cadvBody.appendChild(h('div', { class: 'status' }, '可分别设置四个方向的提示颜色，未设置的方向继续使用继承颜色。'));
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
      body.appendChild(h('div', { class: 'status' }, sd[2] + '。仅在此状态下生效，留空使用基础配色。'));
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
    cb.appendChild(h('div', { class: 'status' }, '点击色框选颜色，也可输入十六进制色值；8 位色值的前两位表示透明度。'));
    ccard.appendChild(cb);
    formHost.appendChild(ccard);

    /* 高级 */
    var acard = h('details', { class: 'card inner-card' });
    acard.appendChild(h('summary', null, '高级'));
    var ab = h('div', { class: 'inner-card-body toolbar' });
    if(hosted){
      var rawDetails=h('details',{class:'key-raw-details'},h('summary',null,'原始 JSON（高级）'));
      rawEditor=h('textarea',{class:'json-editor small','aria-label':'当前按键原始 JSON',rows:8,spellcheck:'false'});
      if(pendingRaw===null)rawBase=JSON.stringify(draft,null,2);
      rawEditor.value=pendingRaw===null?rawBase:pendingRaw;
      rawEditor.addEventListener('input',function(){session.pendingText=rawEditor.value!==rawBase;draftChanged();});
      rawDetails.appendChild(rawEditor);
      rawDetails.appendChild(h('div',{class:'status'},'这里的改动在应用时写入；未完成的 JSON 也会缓存。'));
      ab.appendChild(rawDetails);
    } else ab.appendChild(h('button', {
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
    if (isPlacement && !hosted) {
      var saveAs = h('input', { type: 'text', class: 'mini-input', placeholder: '新按键定义名，如 my.tab' });
      ab.appendChild(saveAs);
      ab.appendChild(h('button', {
        type: 'button', class: 'mini-button',
        onclick: function () {
          var n = saveAs.value.trim();
          if (!n) { FE.uiAlert('请输入按键定义名称'); return; }
          if (state.profile.keys[n]) { FE.uiAlert('按键定义已存在: ' + n); return; }
          session.saveAs = n;
          if (!commitDialog()) session.saveAs = null;
        }
      }, '另存为按键定义'));
    } else if (!isPlacement) {
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
    if (isPlacement && !opts.grid && !hosted) {
      var mcard = h('details', { class: 'card inner-card' });
      mcard.appendChild(h('summary', null, '位置'));
      var mb = h('div', { class: 'inner-card-body toolbar' });
      var positionHint = h('div', {class: 'status', role: 'status'});
      function showPosition() {
        positionHint.textContent = '草稿位置：第 ' + (session.location.r + 1) + ' 行，第 ' + (session.location.k + 1) + ' 键。保存后生效，取消可放弃移动。';
      }
      showPosition();
      function moveBtn(label, dr, dk) {
        return h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            draftChanged();
            session.move(dr, dk);
            showPosition();
          }
        }, label);
      }
      mb.appendChild(moveBtn('← 左移', 0, -1));
      mb.appendChild(moveBtn('→ 右移', 0, 1));
      mb.appendChild(moveBtn('↑ 移到上一行', -1, 0));
      mb.appendChild(moveBtn('↓ 移到下一行', 1, 0));
      mb.appendChild(positionHint);
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
        '气泡配色在主题文件中设置，修改按键颜色不影响气泡。'));
      if (typeof FE.resolveThemeField !== 'function') return box;
      var fields = [
        ['popupTextColor', '气泡文字 popupTextColor'],
        ['popupBackgroundColor', '气泡背景 popupBackgroundColor']
      ];
      fields.forEach(function (f) {
        var r = FE.resolveThemeField(f[0], { includeBuiltin: true });
        var line = h('div', { class: 'status popup-color-line', 'data-theme-field': f[0] });
        var txt = (r.value == null)
          ? '未设置'
          : r.value + '　← ' + FE.colorSourceLabel(r.source, r.detail)
            + (r.source === FE.COLOR_SOURCES.BUILTIN
              ? '（默认色）'
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
        + '；当前版本不显示气泡边框。'));
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
          '尚未设置弹出菜单键（longPress.popupKey）。',
          h('div', null, '先在“手势 → 长按”中设置，再到弹出菜单页编辑候选。')));
        return;
      }
      pb.appendChild(h('div', { class: 'status' }, '候选保存在独立的弹出菜单文件中，请到对应页面编辑。'));
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
    if (hosted) {
      labelInp.setAttribute('aria-label', '按键标签');
      weightInp.setAttribute('aria-label', '宽度权重');
      labelInp.addEventListener('input', function () { if (labelInp.value === '') delete draft.label; else draft.label=labelInp.value; draftChanged(); });
      weightInp.addEventListener('input', function () { if (weightInp.value === '') delete draft.weight; else draft.weight=Number(weightInp.value); draftChanged(); });
      Array.prototype.forEach.call(formHost.querySelectorAll('input,select,textarea'),function(el){
        if (!el.getAttribute('aria-label')) {
          var row=el.parentElement, label=row && row.querySelector('label');
          if (label) el.setAttribute('aria-label',label.textContent);
        }
      });
    }
    Array.prototype.forEach.call(formHost.querySelectorAll('details'),function(section){
      var summary=section.querySelector('summary');
      if(summary&&Object.prototype.hasOwnProperty.call(openSections,summary.textContent))section.open=openSections[summary.textContent];
    });
    modal.body.scrollTop=scrollBefore;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(function(){if(seq===formBuildSeq)modal.body.scrollTop=scrollBefore;});
  }
  function draftChanged() {
    if (!session) return;
    session.draft=draft; session.name=nameInput ? nameInput.value.trim() : session.target.name;
    if (opts.onDraftChange) opts.onDraftChange(session);
  }
  formHost.addEventListener('change',draftChanged);
  formHost.addEventListener('click',function(){if(hosted)setTimeout(draftChanged,0);});
  buildForm();
  /* 首轮表单建好后记下基线：此后任何改动都能被 onBeforeClose 看出来。
   * 放在 buildForm() 之后是因为定义模式下 nameInput 要到那时才存在。 */
  guard.reset();

  if (hosted) {
    if (opts.pendingDraft) { draft=FE.deepClone(opts.pendingDraft); session.draft=draft; if (opts.pendingName) {session.name=opts.pendingName;nameInput=null;} buildForm(); }
    return { session:session, el:formHost, flush:function(){
      if (gestureFlush && !gestureFlush()) return false; draftChanged(); return true;
    }, restoreVariant:function(saved){
      var current=saved.index<0?{}:(draft.variants||[])[saved.index];
      if(FE.stableJson(current)!==FE.stableJson(saved.original))return false;
      FE.openVariantDialog({variant:current,cacheIndex:saved.index,cached:saved,onChange:function(value){
        if(!Array.isArray(draft.variants))draft.variants=[];
        if(saved.index<0)draft.variants.push(value);else draft.variants[saved.index]=value;
        buildForm();draftChanged();
      }});return true;
    }, snapshot:function(){
      return {activeGesture:activeGesture,gesture:gestureEditor&&activeGesture?gestureEditor.snapshot():null,rawDirty:!!(rawEditor&&rawEditor.value!==rawBase),
        scrollTop:modal.body.scrollTop||0,
        fields:FE.readEditorFields(formHost),expanded:Array.prototype.map.call(formHost.querySelectorAll('details'),function(e){return e.open;})};
    }, restore:function(ui){
      if(!ui)return;
      activeGesture=ui.activeGesture||null;pendingGesture=ui.gesture;buildForm();
      FE.restoreEditorFields(formHost,ui.fields);
      if(rawEditor&&!ui.rawDirty){rawEditor.value=rawBase;session.pendingText=false;}
      Array.prototype.forEach.call(formHost.querySelectorAll('details'),function(e,i){if(ui.expanded&&i<ui.expanded.length)e.open=ui.expanded[i];});
      modal.body.scrollTop=Number(ui.scrollTop)||0;
      if(typeof requestAnimationFrame==='function'){var restoredSeq=++formBuildSeq;requestAnimationFrame(function(){if(restoredSeq===formBuildSeq)modal.body.scrollTop=Number(ui.scrollTop)||0;});}
      draftChanged();
    }, apply:function(){
      if (gestureFlush && !gestureFlush()) return {ok:false,errors:['请完成当前手势的配置。']};
      if(rawEditor&&rawEditor.value!==rawBase){
        var report=FE.inspectJsonText(rawEditor.value);
        if(!report.parseOk)return {ok:false,errors:['原始 JSON 尚未完成，请修正后再应用。']};
        var value=JSON.parse(report.fixedText);
        if(!FE.isPlainObject(value))return {ok:false,errors:['按键 JSON 必须是对象。']};
        draft=value;session.pendingText=false;
      }
      draftChanged(); return session.apply();
    } };
  }
  /* ---------- 工具栏 ---------- */
  if (isPlacement) {
    modal.toolbar.appendChild(h('button', {
      type: 'button', class: 'danger',
      onclick: async function () {
        var ok = await FE.uiConfirm('删除此按键？', { title: '删除按键', danger: true, okLabel: '删除' });
        if (!ok) return;
        session.remove = true;
        if (!commitDialog()) session.remove = false;
      }
    }, '删除按键'));
  }
  /* 「取消」= 用户主动关闭：走守卫，有改动先确认 */
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      commitDialog();
    }
  }, '保存'));
};

/* 重命名按键定义并更新全部引用 */
function renameKeyDef(oldN, newN, profile) {
  profile = profile || state.profile;
  var keys = profile.keys;
  var entries = Object.keys(keys).map(function (k) { return [k === oldN ? newN : k, keys[k]]; });
  var nk = {};
  entries.forEach(function (e) { nk[e[0]] = e[1]; });
  profile.keys = nk;

  function updActionSpec(spec) {
    if (!FE.isPlainObject(spec)) return;
    if (spec.ref === oldN) spec.ref = newN;
    if (FE.isPlainObject(spec.action)) updActionSpec(spec.action);
    else if (Array.isArray(spec.action)) spec.action.forEach(updActionSpec);
    if (Array.isArray(spec.actions)) spec.actions.forEach(updActionSpec);
  }
  function updGesture(g) {
    if (!FE.isPlainObject(g)) return;
    updActionSpec(g);
    ['start', 'end', 'endAction'].forEach(function (f) { updActionSpec(g[f]); });
    ['actions', 'endActions'].forEach(function (f) {
      if (Array.isArray(g[f])) g[f].forEach(updActionSpec);
    });
  }
  function updGestures(c) {
    FE.GESTURE_SLOTS.forEach(function (f) { updGesture(c[f]); });
    if (FE.isPlainObject(c.swipe)) {
      FE.SWIPE_DIRS.forEach(function (d) { updGesture(c.swipe[d]); });
    }
    /* drag 的每步动作与松手动作同样可能引用动作/宏名，重命名必须一并改写 */
    if (FE.isPlainObject(c.drag)) {
      FE.DRAG_DIRS.forEach(function (d) { updGesture(c.drag[d]); });
      FE.DRAG_END_SLOTS.forEach(function (s) { updGesture(c.drag[s]); });
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
  Object.keys(profile.layouts || {}).forEach(function (ln) {
    var L = profile.layouts[ln];
    if (!FE.isPlainObject(L)) return;
    walkSections(L.sections);
    if (FE.isPlainObject(L.split)) walkSections(L.split.sections);
  });
}
FE.renameKeyDef = renameKeyDef;

FE.openKeyDialog = function(opts) { return FE.buildKeyEditor(opts); };
})();
