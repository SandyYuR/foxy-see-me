/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * popup-editor.js — 弹出菜单（foxy.popup-profile）编辑标签页
 *
 * 弹出菜单是独立于布局的 JSON 文件（<外部存储>/foxy/frontend/popups/<profile>.json），
 * 布局里的 longPress.popupKey 是它的查找键。状态回退：
 *   schema[state] -> schemas.default[state] -> schema.normal -> default.normal
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

/* ================================================================
 * 纯逻辑部分（Node 测试可直接使用）
 * ================================================================ */
FE.normalizePopupProfile = function (p) {
  if (!FE.isPlainObject(p)) p = {};
  if (!FE.isPlainObject(p.schemas) || !Object.keys(p.schemas).length) p.schemas = { default: {} };
  if (!FE.isPlainObject(p.actions)) p.actions = {};
  return p;
};

FE.popupSchemaName = function (p, requested) {
  var schemas = p && FE.isPlainObject(p.schemas) ? p.schemas : {};
  if (requested && FE.isPlainObject(schemas[requested])) return requested;
  if (FE.isPlainObject(schemas['default'])) return 'default';
  return Object.keys(schemas).find(function (n) { return FE.isPlainObject(schemas[n]); }) || 'default';
};

FE.serializePopupProfile = function (p) {
  var out = FE.deepClone(p);
  if (out.type == null) out.type = 'foxy.popup-profile';
  var ordered = {};
  if (out.type != null) ordered.type = out.type;
  if (out.author != null) ordered.author = out.author;
  for (var k in out) {
    if (k === 'type' || k === 'author') continue;
    if (Object.prototype.hasOwnProperty.call(out, k)) ordered[k] = out[k];
  }
  return JSON.stringify(ordered, null, 2);
};

/* 候选 → 显示文本 */
FE.popupCandidateLabel = function (c) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (FE.isPlainObject(c)) {
    if (c.label != null) return String(c.label);
    if (typeof c.action === 'string') return c.action;
    if (FE.isPlainObject(c.action)) return FE.actionDisplay(c.action);
    if (c.macro != null) return '宏 ' + c.macro;
    if (c.ref != null) return String(c.ref);
  }
  return JSON.stringify(c);
};

/* 候选的动作摘要（tooltip 用） */
FE.popupCandidateSummary = function (c) {
  if (c == null) return '';
  if (typeof c === 'string') return '上屏 “' + c + '”';
  if (FE.isPlainObject(c)) {
    if (typeof c.action === 'string') return '动作 ' + c.action;
    if (FE.isPlainObject(c.action)) return FE.actionDisplay(c.action);
    if (Array.isArray(c.actions)) return c.actions.length + ' 个动作';
    if (c.macro != null) return '宏 ' + c.macro + '（definitions.json）';
    if (c.ref != null) return '共享键 ' + c.ref + '（definitions.json）';
  }
  return JSON.stringify(c);
};

/* 候选是否为对象形式 */
FE.popupCandidateKind = function (c) {
  if (typeof c === 'string') return 'text';
  if (FE.isPlainObject(c)) {
    if (typeof c.action === 'string') return 'action-name';
    if (FE.isPlainObject(c.action)) return 'action';
    if (Array.isArray(c.actions)) return 'actions';
    if (c.macro != null) return 'macro';
    if (c.ref != null) return 'ref';
  }
  return 'unknown';
};

/* 校验弹出菜单 profile */
FE.validatePopupProfile = function (pp) {
  var errors = [], warnings = [];
  function err(m) { errors.push(m); }
  function warn(m) { warnings.push(m); }
  if (!FE.isPlainObject(pp)) { err('弹出菜单不是 JSON 对象'); return { errors: errors, warnings: warnings }; }
  if (pp.type != null && pp.type !== 'foxy.popup-profile') {
    err('type 必须为 "foxy.popup-profile"，当前为 ' + JSON.stringify(pp.type));
  }
  var schemas = FE.isPlainObject(pp.schemas) ? pp.schemas : {};
  var schemaNames = Object.keys(schemas);
  /* 文档/schema：schemas 必须含 default 分组（状态回退链的最终来源） */
  if (!schemaNames.length) err('schemas 不能为空');
  else if (!FE.isPlainObject(schemas['default'])) {
    err('schemas 必须包含 default 分组（它是状态回退链的最终来源）');
  }
  var actions = FE.isPlainObject(pp.actions) ? pp.actions : {};
  Object.keys(actions).forEach(function (an) {
    if (FE.validateAction) FE.validateAction(actions[an], '弹出菜单动作 “' + an + '”', err, null);
  });

  /* 校验一个候选数组；baseWhere 为该数组的定位前缀 */
  function checkCandList(list, baseWhere) {
    if (!Array.isArray(list)) { err(baseWhere + ' 必须是数组'); return; }
    list.forEach(function (c, ci) {
      var where = baseWhere + '[' + ci + ']';
      if (c == null) { err(where + ' 候选不能为 null'); return; }
      if (typeof c !== 'string' && !FE.isPlainObject(c)) { err(where + ' 候选必须是字符串或对象'); return; }
      if (FE.isPlainObject(c)) {
        if (typeof c.action === 'string' && !actions[c.action]) err(where + ' 引用动作名不存在: ' + c.action);
        if (FE.isPlainObject(c.action) && FE.validateAction) FE.validateAction(c.action, where + '.action', err, null);
        /* actions 数组形式（文档：Object items may use action, actions, macro, or ref） */
        if (c.actions != null) {
          if (!Array.isArray(c.actions)) err(where + ' 的 actions 必须是数组');
          else if (FE.validateAction) c.actions.forEach(function (a, ai) { FE.validateAction(a, where + '.actions[' + ai + ']', err, null); });
        }
        if (c.action == null && c.actions == null && c.macro == null && c.ref == null) err(where + ' 对象候选缺少 action / actions / macro / ref');
        if (c.macro != null) warn(where + ' 宏 “' + c.macro + '” 需在 definitions.json 中定义（编辑器无法校验）');
        if (c.ref != null) warn(where + ' 共享键 “' + c.ref + '” 需在 definitions.json 中定义（编辑器无法校验）');
      }
    });
  }

  schemaNames.forEach(function (sn) {
    var s = schemas[sn];
    if (!FE.isPlainObject(s)) { err('schema “' + sn + '” 不是对象'); return; }
    Object.keys(s).forEach(function (pk) {
      var entry = s[pk];
      var base = 'schema “' + sn + '” 按键 “' + pk + '”';
      /* 裸数组简写：整个候选列表即 normal 状态（schema 里 candidateArray 是 keyCandidates 的一种） */
      if (Array.isArray(entry)) { checkCandList(entry, base); return; }
      if (!FE.isPlainObject(entry)) { err(base + ' 不是对象（必须是候选数组或 { normal, shifted } 对象）'); return; }
      /* schema 里该对象 additionalProperties:false —— 只认 normal / shifted */
      Object.keys(entry).forEach(function (st) {
        if (st !== 'normal' && st !== 'shifted') {
          err(base + ' 含不支持的状态 “' + st + '”（仅支持 normal / shifted）');
        }
      });
      ['normal', 'shifted'].forEach(function (st) {
        if (entry[st] === undefined || entry[st] === null) return; /* null = 显式清除 */
        checkCandList(entry[st], base + ' 的 ' + st);
      });
    });
  });
  return { errors: errors, warnings: warnings };
};

/* 查找候选（状态回退：schema[state] → default[state] → schema.normal → default.normal） */
FE.popupCandidates = function (pp, schemaName, popupKey, shifted) {
  var schemas = (pp && FE.isPlainObject(pp.schemas)) ? pp.schemas : {};
  var s = schemas[schemaName];
  var d = schemas['default'];
  /* 整键写成裸数组时（`"q": ["a","b"]`）等价于 { normal: [...] }，
   * 此时 shifted 无显式值，走 normal 回退。 */
  function stateOf(holder, st) {
    if (!holder) return undefined;
    var e = holder[popupKey];
    if (Array.isArray(e)) return st === 'normal' ? e : undefined;
    if (!FE.isPlainObject(e)) return undefined;
    return e[st];
  }
  var st = shifted ? 'shifted' : 'normal';
  var v = stateOf(s, st);
  if (v === undefined) v = stateOf(d, st);
  if (v === undefined && st === 'shifted') {
    v = stateOf(s, 'normal');
    if (v === undefined) v = stateOf(d, 'normal');
  }
  return Array.isArray(v) ? v : null;
};

/* ================================================================
 * UI 部分
 * ================================================================ */
if (typeof document === 'undefined' || typeof window === 'undefined' ||
    !document.getElementById('popup-keys')) {
  return;
}
var state = FE.state;
var h = FE.h, clearEl = FE.clearEl, $ = FE.$;

function pmutate(fn) { FE.mutate(fn); }

/* 取某 popupKey 在某 schema 下的"整键编辑体"（供标签页卡片与按键对话框共用）。
 * 返回 { host, hasAny }：host 是装好 normal/shifted 两行编辑器的容器；
 * schema 缺此键时 host 只装提示行并带"一键创建"按钮。
 * opts.onChanged(): 发生增删改后回调（调用方可据此刷新外层，如重建对话框表单）。 */
function buildPopupKeyEditor(schemaName, pk, opts) {
  opts = opts || {};
  var P = pp();
  schemaName = FE.popupSchemaName(P, schemaName);
  var schema = P.schemas[schemaName];
  var host = h('div', { class: 'popup-key-editor' });
  var usedRefs = collectLayoutPopupKeys()[pk];
  var usedLabels = FE.popupUsageLabels(usedRefs);
  /* 标题行：键名 + 布局使用处 + 预览跳转 */
  host.appendChild(h('div', { class: 'section-head' },
    h('span', { class: 'section-title' },
      h('code', null, pk),
      usedLabels.length ? h('span', { class: 'def-badges', title: usedLabels.join('\n') }, ' · 布局使用 ' + usedLabels.length + ' 处') : null),
    h('span', { class: 'section-tools' },
      h('button', {
        type: 'button', class: 'icon-button', title: '在弹出菜单页预览中查看',
        onclick: function () {
          state.popupSelKey = pk;
          if (FE.renderPopupTab) FE.renderPopupTab();
        }
      }, '👁'))));
  var entry = schema ? schema[pk] : null;
  if (!entry) {
    host.appendChild(h('div', { class: 'status warn' },
      '当前 schema（' + schemaName + '）未定义该键，弹出时按回退链查找。'));
    host.appendChild(h('button', {
      type: 'button', class: 'mini-button',
      onclick: function () {
        pmutate(function () { pp().schemas[schemaName][pk] = { normal: [] }; });
        if (typeof opts.onChanged === 'function') opts.onChanged();
      }
    }, '在此 schema 下创建空键'));
    return { host: host, hasAny: false };
  }
  ['normal', 'shifted'].forEach(function (st) {
    host.appendChild(stateRow(P, schemaName, pk, st));
  });
  return { host: host, hasAny: true };
}
FE.buildPopupKeyEditor = buildPopupKeyEditor;

function pp() {
  if (!state.popupProfile) state.popupProfile = FE.normalizePopupProfile({});
  else state.popupProfile = FE.normalizePopupProfile(state.popupProfile);
  return state.popupProfile;
}

function setPopupStatus(msg, kind) {
  var el = $('popup-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}

/* ---------------- 布局联动：收集布局中使用的 popupKey ----------------
 * 返回 `{ popupKey: [{ label, loc }] }`。
 * loc 供「使用数」弹窗跳转：布局按键给布局坐标（locateIssue 用），
 * 按键定义给 { defKind:'key', defName }（jumpToDef 用）。
 * ⚠️ 值从「字符串数组」升级成「对象数组」是为了支持跳转；调用方要 labels
 * 时用 FE.popupUsageLabels(used[pk])，别再直接 join。 */
FE.popupUsageLabels = function (refs) {
  return (Array.isArray(refs) ? refs : []).map(function (r) {
    return r && r.label != null ? String(r.label) : String(r);
  });
};

function collectLayoutPopupKeys() {
  var found = {};
  var profile = state.profile;
  if (!profile) return found;
  function add(pk, label, loc) {
    if (found[pk] === undefined) found[pk] = [];
    found[pk].push({ label: label, loc: loc });
  }
  function pkOf(c) {
    if (!FE.isPlainObject(c)) return null;
    var lp = FE.isPlainObject(c.longPress) ? c.longPress.popupKey : null;
    return (lp == null || lp === '') ? null : lp;
  }
  /* 按键定义：挂在定义自身（含变体里写的 longPress） */
  Object.keys(profile.keys || {}).forEach(function (kn) {
    var kd = profile.keys[kn];
    var lp = pkOf(kd);
    if (lp) add(lp, '按键定义 ' + kn, { defKind: 'key', defName: kn });
    if (FE.isPlainObject(kd) && Array.isArray(kd.variants)) {
      kd.variants.forEach(function (v, vi) {
        var vlp = pkOf(v);
        if (vlp) add(vlp, '按键定义 ' + kn + ' 变体' + (vi + 1), { defKind: 'key', defName: kn });
      });
    }
  });
  function walkSections(sections, layoutName, isSplit) {
    (Array.isArray(sections) ? sections : []).forEach(function (s, si) {
      if (!FE.isPlainObject(s)) return;
      function take(k, ki, rowIdx, group, where) {
        var ev = FE.evalPlacement(k, FE.NEUTRAL_STATUS);
        var lp = (ev.eff && FE.isPlainObject(ev.eff.longPress)) ? ev.eff.longPress.popupKey : null;
        if (lp == null || lp === '') return;
        add(lp, where, {
          layout: layoutName, isSplit: !!isSplit,
          sectionIndex: si, rowIndex: rowIdx, keyIndex: ki, group: group
        });
      }
      if (s.type === 'rows') {
        FE.rowsOfSection(s).forEach(function (row, ri) {
          row.keys.forEach(function (k, ki) {
            take(k, ki, ri, 'rows', layoutName + ' 区段' + si + ' 行' + ri + ' 键' + ki);
          });
        });
      } else if (s.type === 'grid' && Array.isArray(s.keys)) {
        s.keys.forEach(function (k, ki) {
          take(k, ki, null, 'grid', layoutName + ' 区段' + si + ' 网格键' + ki);
        });
      }
    });
  }
  Object.keys(profile.layouts || {}).forEach(function (ln) {
    var L = profile.layouts[ln];
    if (!FE.isPlainObject(L)) return;
    walkSections(L.sections, ln, false);
    if (FE.isPlainObject(L.split)) walkSections(L.split.sections, ln, true);
  });
  return found;
}

/* ---------------- 渲染 ---------------- */
function renderPopupTab() {
  renderPopupToolbar();
  renderPopupKeys();
  renderPopupPreview();
  renderPopupJson();
  renderPopupValidation();
}

function renderPopupToolbar() {
  var author = $('popup-author');
  if (author && document.activeElement !== author) {
    author.value = pp().author != null ? String(pp().author) : '';
  }
  var sel = $('popup-schema');
  if (!sel) return;
  clearEl(sel);
  Object.keys(pp().schemas).forEach(function (sn) {
    sel.appendChild(h('option', { value: sn }, sn));
  });
  if (!pp().schemas[state.popupSchema]) state.popupSchema = FE.popupSchemaName(pp(), state.popupSchema);
  sel.value = state.popupSchema;
}

/* 搜索匹配文本 = popupKey + 各候选的显示标签。
 * 所以「搜 q」能命中键名，「搜 ā」能命中把它作为候选的那个键。 */
function popupMatchText(pk, entry) {
  var parts = [pk];
  function take(list) {
    (Array.isArray(list) ? list : []).forEach(function (c) {
      parts.push(FE.popupCandidateLabel(c));
      parts.push(FE.popupCandidateSummary(c));
    });
  }
  if (Array.isArray(entry)) take(entry);
  else if (FE.isPlainObject(entry)) { take(entry.normal); take(entry.shifted); }
  return parts.join(' ');
}

/* 「使用数」的数据源：哪些布局/按键定义用了这个 popupKey。
 * 与 buildRefIndex 无关（popupKey 不是 ref），所以直接由 collectLayoutPopupKeys
 * 的 refs 拼出弹窗要的形状，并给 collapsibleDefItem 传 usageKind:null +
 * onUsage —— 见 app.js 里那段注释。 */
function popupUsageOf(refs) {
  var items = (Array.isArray(refs) ? refs : []).map(function (r) {
    return { label: r.label, loc: r.loc };
  });
  return { count: items.length, items: items };
}

function renderPopupKeys() {
  var host = $('popup-keys');
  if (!host) return;
  clearEl(host);
  var P = pp();
  var schema = P.schemas[state.popupSchema];
  if (!schema) { state.popupSchema = FE.popupSchemaName(P, state.popupSchema); schema = P.schemas[state.popupSchema] || {}; }
  var used = collectLayoutPopupKeys();
  var all = Object.keys(schema).sort();
  var filter = FE.defFilterValue('popup-filter');
  var names = FE.defMatch(all, filter, function (pk) { return popupMatchText(pk, schema[pk]); });
  FE.appendMatchHint(host, names.length, all.length, filter, 'popupKey');

  /* 与按键定义 / 动作宏三页同构：默认**全部折叠**，展开态记在
   * state.openPopupKeys，重渲染后保持用户当前的视图。
   * 懒建由 collapsibleDefItem 负责 —— 气泡示例有 26+ 个键、每键两个状态行，
   * 全量建出来会白烧 CPU（同 §动作与宏 的性能陷阱）。 */
  var openSet = FE.ensureOpenSet('openPopupKeys');
  names.forEach(function (pk) {
    var refs = used[pk];
    host.appendChild(popupKeyCard(P, state.popupSchema, pk, refs, openSet));
  });
  if (!names.length && !filter) {
    host.appendChild(h('div', { class: 'status' }, '该 schema 还没有按键。用下方添加，或从布局的 longPress.popupKey 联动生成。'));
  }

  /* 从布局使用处一键补齐缺失的键（过滤时不显示，避免与筛选结果混淆） */
  var missing = filter ? [] : Object.keys(used).filter(function (k) { return !schema[k]; });
  if (missing.length) {
    host.appendChild(h('div', { class: 'popup-missing' },
      h('div', { class: 'status warn' }, '布局中使用了 ' + missing.length + ' 个此 schema 未定义的 popupKey：' + missing.join('、')),
      h('button', {
        class: 'mini-button', onclick: function () {
          pmutate(function () {
            missing.forEach(function (k) { schema[k] = { normal: [] }; });
          });
        }
      }, '一键补齐')));
  }
  var addInp = h('input', { type: 'text', placeholder: '新 popupKey，如 q / 1 / space', class: 'mini-input' });
  host.appendChild(h('div', { class: 'toolbar' },
    addInp,
    h('button', {
      class: 'mini-button', onclick: function () {
        var k = addInp.value.trim();
        if (!k) { FE.uiAlert('请输入 popupKey'); return; }
        if (schema[k]) { FE.uiAlert('该键已存在: ' + k); return; }
        /* 新建后展开，方便立刻配置（与动作/宏页一致） */
        FE.ensureOpenSet('openPopupKeys')[k] = true;
        pmutate(function () { schema[k] = { normal: [] }; });
      }
    }, '+ 添加按键')));
}

function popupKeyCard(P, schemaName, pk, refs, openSet) {
  var usage = popupUsageOf(refs);
  var badge = h('span', { class: 'def-badges' },
    usage.count ? ('布局使用 ' + usage.count + ' 处') : '布局未使用');
  return FE.collapsibleDefItem(pk, badge, openSet, {
    extraClass: 'popup-key-card',
    section: 'popupKeys',
    summaryTitle: '展开并配置弹出菜单键「' + pk + '」',
    usageKind: null,          /* 数据源不是 refIndex，别挂 data-* */
    usageTitle: '查看哪些布局用到了这个 popupKey',
    usage: usage,
    onUsage: function () {
      FE.showUsageDialog('弹出菜单键 “' + pk + '” 的使用情况', popupUsageOf(refs));
    },
    confirmDelete: '删除 popupKey “' + pk + '”？',
    onDelete: async function () {
      var ok = await FE.uiConfirm('删除 popupKey “' + pk + '”？', { title: '删除按键', danger: true, okLabel: '删除' });
      if (!ok) return;
      pmutate(function () { delete pp().schemas[schemaName][pk]; });
    },
    build: function (body) {
      body.appendChild(buildPopupKeyEditor(schemaName, pk, {}).host);
    }
  });
}

function stateRow(P, schemaName, pk, st) {
  var entry = P.schemas[schemaName] && P.schemas[schemaName][pk];
  if (!entry) return h('div', { class: 'status error' }, '当前 schema 中不存在该键');
  var arr = Array.isArray(entry[st]) ? entry[st] : null;
  var row = h('div', { class: 'popup-state-row' });
  row.appendChild(h('span', { class: 'popup-state-name', title: st === 'normal' ? '常规状态候选' : 'Shift 状态候选（缺省回退到 normal）' },
    st === 'normal' ? '常规' : 'Shift'));
  var chips = h('div', { class: 'chip-box popup-cands' });
  if (arr === null) {
    chips.appendChild(h('span', { class: 'status' }, '（未定义，回退' + (st === 'shifted' ? '到常规' : '自 default schema') + '）'));
  } else if (!arr.length) {
    chips.appendChild(h('span', { class: 'status' }, '（空）'));
  } else {
    arr.forEach(function (c, ci) {
      chips.appendChild(candidateChip(P, schemaName, pk, st, ci, c, arr));
    });
  }
  chips.appendChild(h('button', {
    class: 'chip chip-add', title: '添加候选',
    onclick: function () { openCandidateDialog(P, schemaName, pk, st, -1, null); }
  }, '+'));
  row.appendChild(chips);
  if (arr !== null) {
    row.appendChild(h('button', {
      class: 'mini-button', title: '删除整个 ' + st + ' 候选列表',
      onclick: function () {
        pmutate(function () { delete pp().schemas[schemaName][pk][st]; });
      }
    }, '清空'));
  } else {
    row.appendChild(h('button', {
      class: 'mini-button', title: '添加 ' + st + ' 候选列表',
      onclick: function () {
        pmutate(function () { pp().schemas[schemaName][pk][st] = []; });
      }
    }, '启用'));
  }
  return row;
}

function candidateChip(P, schemaName, pk, st, ci, c, arr) {
  var kind = FE.popupCandidateKind(c);
  var kindBadge = kind === 'text' ? '' : ({ 'action-name': '动作', 'action': '动作', 'macro': '宏', 'ref': '引用' })[kind] || '';
  var chip = h('div', {
    class: 'chip popup-cand' + (kind === 'text' ? '' : ' chip-fn'),
    title: FE.popupCandidateSummary(c),
    onclick: function () { openCandidateDialog(P, schemaName, pk, st, ci, c); }
  },
    h('span', { class: 'chip-label' }, FE.popupCandidateLabel(c) || '？'),
    kindBadge ? h('span', { class: 'chip-badges' }, kindBadge) : null,
    h('span', { class: 'cand-idx' }, String(ci + 1)));
  /* 顺序调整 */
  var ctrls = h('span', { class: 'cand-order' },
    h('button', {
      class: 'icon-button', title: '左移', onclick: function (e) {
        e.stopPropagation();
        if (ci <= 0) return;
        pmutate(function () {
          var t = arr[ci - 1]; arr[ci - 1] = arr[ci]; arr[ci] = t;
        });
      }
    }, '◀'),
    h('button', {
      class: 'icon-button', title: '右移', onclick: function (e) {
        e.stopPropagation();
        if (ci >= arr.length - 1) return;
        pmutate(function () {
          var t = arr[ci + 1]; arr[ci + 1] = arr[ci]; arr[ci] = t;
        });
      }
    }, '▶'));
  chip.appendChild(ctrls);
  return chip;
}

/* ---------------- 候选编辑对话框 ---------------- */
function openCandidateDialog(P, schemaName, pk, st, ci, cand) {
  var isNew = ci < 0;
  var kind0 = isNew ? 'text' : FE.popupCandidateKind(cand);
  /* 可比较快照（纯读取，不触发校验弹窗）：类型 + 各分支的编辑内容。
   * ⚠️ 返回**原始值**，不要自己 FE.stableJson —— 守卫内部会序列化，
   * 重复序列化（双重编码）会让「没改」被判成「改了」，把用户拦在确认框里。
   * actions 分支要连 JSON 片段编辑器的**原文**一起比：用户改的是文本，
   * 要等点「保存」才写回 draft.actionsArr，只比 draft 会漏判。 */
  var guard = FE.snapshotGuard(function () {
    return {
      kind: kindSel.value,
      text: draft.text,
      label: draft.label,
      action: actionEditor ? actionEditor.getValue() : null,
      actions: draft.actionsArr,
      actionsRaw: actionsEditor ? actionsEditor.getValue() : null,
      actionName: draft.actionName,
      macro: draft.macro,
      ref: draft.ref
    };
  });
  var modal = FE.openModal({
    title: (isNew ? '添加' : '编辑') + '候选 · ' + pk + ' / ' + (st === 'normal' ? '常规' : 'Shift'),
    wide: true,
    onBeforeClose: guard.onBeforeClose
  });
  var draft = { kind: kind0, text: '', label: '', actionObj: null, actionName: '', macro: '', ref: '', actionsArr: null };
  if (!isNew) {
    if (kind0 === 'text') draft.text = String(cand);
    else {
      draft.label = cand.label != null ? String(cand.label) : '';
      if (kind0 === 'action-name') draft.actionName = String(cand.action);
      if (kind0 === 'action') draft.actionObj = FE.deepClone(cand.action);
      if (kind0 === 'actions') draft.actionsArr = FE.deepClone(cand.actions);
      if (kind0 === 'macro') draft.macro = String(cand.macro);
      if (kind0 === 'ref') draft.ref = String(cand.ref);
    }
  }

  var kindSel = h('select', { class: 'mini-select' });
  [['text', '文本（上屏该文本）'], ['action', '动作对象'], ['actions', '动作序列（actions 数组）'], ['action-name', '动作名（actions 里定义的）'], ['macro', '宏调用（definitions.json）'], ['ref', '共享键引用（definitions.json）']]
    .forEach(function (o) { kindSel.appendChild(h('option', { value: o[0] }, o[1])); });
  kindSel.value = draft.kind;

  var area = h('div', { class: 'gesture-area' });
  var actionEditor = null;
  var actionsEditor = null;
  function buildArea() {
    clearEl(area);
    var k = kindSel.value;
    if (k === 'text') {
      var ti = h('input', { type: 'text', class: 'mini-input wide', value: draft.text, placeholder: '如 ā 或 1' });
      ti.addEventListener('input', function () { draft.text = ti.value; });
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '文本'), ti));
      area.appendChild(h('div', { class: 'status' }, '字符串简写：长按弹出后点按即上屏该文本。'));
    } else {
      var li = h('input', { type: 'text', class: 'mini-input wide', value: draft.label, placeholder: '显示文本（留空则用动作摘要）' });
      li.addEventListener('input', function () { draft.label = li.value; });
      area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '显示文本'), li));
      if (k === 'action') {
        actionEditor = FE.buildActionEditor(draft.actionObj);
        area.appendChild(h('div', { class: 'form-row' }, actionEditor.el));
      } else if (k === 'actions') {
        /* 动作序列：用 JSON 片段编辑器（体检 + 一键修复），保证 actions 数组可编辑/往返 */
        actionsEditor = FE.buildJsonSnippetEditor({
          value: JSON.stringify(draft.actionsArr && draft.actionsArr.length ? draft.actionsArr : [{ type: 'key', key: 'A' }], null, 2),
          applyOnBlur: true,
          applyAfterFix: true,
          onApply: function (v) { draft.actionsArr = Array.isArray(v) ? v : null; }
        });
        area.appendChild(h('div', { class: 'form-row' }, actionsEditor.el));
        area.appendChild(h('div', { class: 'status' }, '按顺序执行的动作对象数组，例如 [{"type":"key","key":"A","meta":["CTRL"]}]。'));
      } else if (k === 'action-name') {
        var sel = h('select', { class: 'mini-select wide' });
        var acts = Object.keys(pp().actions || {});
        if (!acts.length) sel.appendChild(h('option', { value: '' }, '（尚无动作定义，可在下方 actions JSON 中添加）'));
        acts.forEach(function (n) { sel.appendChild(h('option', { value: n }, n + ' · ' + FE.actionDisplay(pp().actions[n]))); });
        sel.value = draft.actionName || acts[0] || '';
        draft.actionName = sel.value;
        sel.addEventListener('change', function () { draft.actionName = sel.value; });
        area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '动作'), sel));
      } else if (k === 'macro') {
        var mi = h('input', { type: 'text', class: 'mini-input wide', value: draft.macro, placeholder: '宏名称（definitions.json）' });
        mi.addEventListener('input', function () { draft.macro = mi.value; });
        area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '宏'), mi));
      } else if (k === 'ref') {
        var ri = h('input', { type: 'text', class: 'mini-input wide', value: draft.ref, placeholder: '共享键名称（definitions.json）' });
        ri.addEventListener('input', function () { draft.ref = ri.value; });
        area.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '共享键'), ri));
      }
    }
  }
  kindSel.addEventListener('change', buildArea);
  buildArea();

  /* 首轮 UI 建好后记基线 */
  guard.reset();

  modal.body.appendChild(h('div', { class: 'form-row form-inline' }, h('label', { class: 'mini-label' }, '类型'), kindSel));
  modal.body.appendChild(area);

  if (!isNew) {
    modal.toolbar.appendChild(h('button', {
      type: 'button', class: 'danger',
      onclick: function () {
        pmutate(function () { pp().schemas[schemaName][pk][st].splice(ci, 1); });
        modal.close();
      }
    }, '删除候选'));
  }
  /* 「取消」走守卫：有改动先确认 */
  modal.toolbar.appendChild(h('button', { type: 'button', onclick: function () { modal.requestClose(); } }, '取消'));
  modal.toolbar.appendChild(h('button', {
    type: 'button', class: 'primary',
    onclick: function () {
      var k = kindSel.value;
      var value;
      if (k === 'text') {
        if (draft.text === '') { FE.uiAlert('请输入文本'); return; }
        value = draft.text;
      } else if (k === 'action') {
        var act = actionEditor ? actionEditor.getValue() : null;
        if (!act) { FE.uiAlert('请配置动作'); return; }
        value = draft.label !== '' ? { label: draft.label, action: act } : { action: act };
      } else if (k === 'actions') {
        if (actionsEditor) actionsEditor.apply();
        if (!Array.isArray(draft.actionsArr) || !draft.actionsArr.length) { FE.uiAlert('请配置至少一个动作（JSON 数组）'); return; }
        value = draft.label !== '' ? { label: draft.label, actions: draft.actionsArr } : { actions: draft.actionsArr };
      } else if (k === 'action-name') {
        if (!draft.actionName) { FE.uiAlert('请选择动作'); return; }
        value = draft.label !== '' ? { label: draft.label, action: draft.actionName } : { action: draft.actionName };
      } else if (k === 'macro') {
        if (!draft.macro) { FE.uiAlert('请输入宏名称'); return; }
        value = draft.label !== '' ? { label: draft.label, macro: draft.macro } : { macro: draft.macro };
      } else {
        if (!draft.ref) { FE.uiAlert('请输入共享键名称'); return; }
        value = draft.label !== '' ? { label: draft.label, ref: draft.ref } : { ref: draft.ref };
      }
      pmutate(function () {
        var entry = pp().schemas[schemaName][pk];
        if (!Array.isArray(entry[st])) entry[st] = [];
        if (isNew) entry[st].push(value);
        else entry[st][ci] = value;
      });
      modal.close();
    }
  }, '保存'));
}

/* ---------------- 气泡预览 ---------------- */
function renderPopupPreview() {
  var host = $('popup-preview');
  if (!host) return;
  clearEl(host);
  var P = pp();
  var used = collectLayoutPopupKeys();
  var schema = P.schemas[state.popupSchema] || P.schemas['default'];
  var allKeys = Object.keys(schema).sort();
  Object.keys(used).sort().forEach(function (k) { if (allKeys.indexOf(k) < 0) allKeys.push(k); });
  if (!allKeys.length) {
    host.appendChild(h('div', { class: 'status' }, '没有可预览的 popupKey。'));
    return;
  }
  if (!state.popupSelKey || allKeys.indexOf(state.popupSelKey) < 0) state.popupSelKey = allKeys[0];
  var pk = state.popupSelKey;

  var keySel = h('select', { class: 'mini-select' });
  allKeys.forEach(function (k) { keySel.appendChild(h('option', { value: k }, k + (used[k] ? '（布局在用）' : ''))); });
  keySel.value = pk;
  keySel.addEventListener('change', function () { state.popupSelKey = keySel.value; renderPopupPreview(); });

  var shiftChk = h('input', { type: 'checkbox', class: 'pp-shift' });
  shiftChk.checked = state.popupShifted;
  shiftChk.addEventListener('change', function () { state.popupShifted = shiftChk.checked; renderPopupPreview(); });

  host.appendChild(h('div', { class: 'toolbar' },
    h('label', { class: 'mini-label' }, '按键', keySel),
    h('label', { class: 'mini-label check' }, shiftChk, ' Shift 状态')));

  /* 模拟按键的显示标签：找布局里第一个使用该 popupKey 的按键，
   * 按预览 Shift 开关套 shiftedLabel / 大小写（与键盘预览一致）。
   * 注意：只动这个模拟按键的标签；上方候选气泡与下方说明保持原逻辑。 */
  var mockEff = findMockEff(pk);
  var mockLabel = pk;
  if (mockEff) {
    var raw = null;
    try { raw = FE.rawLabelOf(mockEff, FE.NEUTRAL_STATUS); } catch (e) { raw = null; }
    if (raw == null) raw = pk;
    mockLabel = String(raw);
    if (state.popupShifted) {
      if (typeof mockEff.shiftedLabel === 'string') mockLabel = mockEff.shiftedLabel;
      else if (/^[a-z]$/.test(mockLabel)) mockLabel = mockLabel.toUpperCase();
    }
  }

  var cands = FE.popupCandidates(P, state.popupSchema, pk, state.popupShifted);
  var stage = h('div', { class: 'pp-stage' });
  var bubble = h('div', { class: 'pp-bubble' });
  if (!cands || !cands.length) {
    bubble.appendChild(h('span', { class: 'pp-empty-hint' }, used[pk] ? '（弹出菜单未定义该键的候选）' : '（未定义候选）'));
  } else {
    cands.forEach(function (c, idx) {
      bubble.appendChild(h('span', {
        class: 'pp-cand' + (idx === 0 ? ' pp-cand-first' : ''),
        title: (idx === 0 ? '首选（大）· ' : '') + FE.popupCandidateSummary(c)
      }, FE.popupCandidateLabel(c) || '？'));
    });
  }
  var keyMock = h('div', { class: 'pp-key' }, mockLabel);
  var wrap = h('div', { class: 'pp-wrap' }, bubble, keyMock);
  stage.appendChild(wrap);
  host.appendChild(stage);
  host.appendChild(h('div', { class: 'status' },
    '状态回退：schema[' + (state.popupShifted ? 'shifted' : 'normal') + '] → default[' + (state.popupShifted ? 'shifted' : 'normal') + '] → schema.normal → default.normal' +
    (used[pk] ? ' · 布局使用 ' + used[pk].length + ' 处' : ' · 布局未使用该键')));
}

function findMockLabel(pk) {
  var eff = findMockEff(pk);
  if (!eff) return null;
  try { return FE.rawLabelOf(eff, FE.NEUTRAL_STATUS) || null; }
  catch (e) { return null; }
}

/* 供弹出预览用的“第一个使用该 popupKey 的按键 eff”（不应用 Shift，由调用方定） */
function findMockEff(pk) {
  var profile = state.profile;
  if (!profile) return null;
  var best = null;
  function walkSections(sections) {
    return (Array.isArray(sections) ? sections : []).some(function (s) {
      if (!FE.isPlainObject(s)) return false;
      var keys = [];
      if (s.type === 'rows') FE.rowsOfSection(s).forEach(function (row) { keys = keys.concat(row.keys); });
      else if (s.type === 'grid' && Array.isArray(s.keys)) keys = s.keys;
      return keys.some(function (k) {
        var ev = FE.evalPlacement(k, FE.NEUTRAL_STATUS);
        var lp = (ev.eff && FE.isPlainObject(ev.eff.longPress)) ? ev.eff.longPress.popupKey : null;
        if (String(lp) === String(pk)) { best = ev.eff || best; return true; }
        return false;
      });
    });
  }
  Object.keys(profile.layouts || {}).some(function (ln) {
    var L = profile.layouts[ln];
    if (!FE.isPlainObject(L)) return false;
    return walkSections(L.sections) || (FE.isPlainObject(L.split) && walkSections(L.split.sections));
  });
  return best;
}

/* ---------------- JSON 视图 ---------------- */
var popupJsonDirty = false;
function renderPopupJson() {
  var ta = $('popup-json');
  if (!ta) return;
  if (document.activeElement === ta) return;
  if (popupJsonDirty) return;
  ta.value = FE.serializePopupProfile(pp());
}
function setPopupJsonStatus(msg, kind) {
  var el = $('popup-json-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}

/* ---------------- 校验与布局联动报告 ---------------- */
function renderPopupValidation() {
  var v = FE.validatePopupProfile(pp());
  var used = collectLayoutPopupKeys();
  var schema = pp().schemas[state.popupSchema] || {};
  var missingInPopup = Object.keys(used).filter(function (k) { return !schema[k]; });
  var parts = [];
  if (v.errors.length) parts.push(h('span', { class: 'st-error' }, '✗ ' + v.errors.length + ' 个错误'));
  if (v.warnings.length) parts.push(h('span', { class: 'st-warn' }, ' ⚠ ' + v.warnings.length + ' 个提示'));
  if (!v.errors.length && !v.warnings.length) parts.push(h('span', { class: 'st-ok' }, '✓ 弹出菜单校验通过'));
  parts.push(' · schema ' + Object.keys(pp().schemas).length + ' 个 · 键 ' + Object.keys(schema).length + ' 个');
  parts.push(' · 布局使用 popupKey ' + Object.keys(used).length + ' 个');
  if (missingInPopup.length) parts.push(h('span', { class: 'st-warn' }, ' · ' + missingInPopup.length + ' 个未定义: ' + missingInPopup.slice(0, 6).join('、') + (missingInPopup.length > 6 ? '…' : '')));
  var host = $('popup-validation');
  if (host) {
    clearEl(host);
    host.appendChild(h('span', null, parts));
    var det = h('details', { class: 'meta-details' });
    det.appendChild(h('summary', null, '校验详情'));
    var list = h('ul', { class: 'meta-list' });
    v.errors.forEach(function (m) { list.appendChild(h('li', { class: 'st-error' }, m)); });
    v.warnings.forEach(function (m) { list.appendChild(h('li', { class: 'st-warn' }, m)); });
    if (!v.errors.length && !v.warnings.length) list.appendChild(h('li', { class: 'st-ok' }, '没有发现问题'));
    det.appendChild(list);
    host.appendChild(det);
  }
}

/* ---------------- 载入/保存 ---------------- */
FE.loadPopupProfileText = function (text, fileName) {
  var p;
  try { p = JSON.parse(FE.sanitizeJsonText(text)); } catch (e) {
    state.lastParseError = e.message;
    setPopupStatus('弹出菜单 JSON 解析失败: ' + e.message, 'error');
    return false;
  }
  if (p && p.type != null && p.type !== 'foxy.popup-profile') {
    var typeMsg = 'type 应为 foxy.popup-profile，当前为 ' + JSON.stringify(p.type);
    state.lastParseError = typeMsg;
    setPopupStatus('这不是弹出菜单文件（' + typeMsg + '）', 'error');
    return false;
  }
  if (!FE.isPlainObject(p)) {
    state.lastParseError = '弹出菜单根节点必须是 JSON 对象';
    setPopupStatus(state.lastParseError, 'error');
    return false;
  }
  p = FE.normalizePopupProfile(p);
  state.popupProfile = p;
  if (fileName) state.popupFileName = fileName;
  state.popupSchema = FE.popupSchemaName(p, 'default');
  state.popupSelKey = null;
  popupJsonDirty = false;
  FE.afterChange();
  return true;
};

function initPopupTab() {
  /* 归一化（boot 只存了原始草稿） */
  state.popupProfile = FE.normalizePopupProfile(state.popupProfile || {});

  $('popup-import').addEventListener('click', function () { $('popup-import-file').click(); });
  $('popup-import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (FE.loadPopupProfileText(String(reader.result), file.name)) {
        setPopupStatus('已导入 ' + file.name, 'ok');
      }
    };
    reader.readAsText(file, 'utf-8');
  });
  $('popup-export').addEventListener('click', function () {
    var text = FE.serializePopupProfile(pp());
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.popupFileName || 'popups.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    setPopupStatus('已导出 ' + a.download, 'ok');
  });

  /* 示例（弹出菜单类） */
  var ex = $('popup-example');
  if (ex) {
    clearEl(ex);
    ex.appendChild(h('option', { value: '' }, '选择弹出菜单示例…'));
    if (FE.EXAMPLE_META) {
      Object.keys(FE.EXAMPLE_META).sort().forEach(function (n) {
        if (FE.EXAMPLE_META[n].kind !== 'popup') return;
        ex.appendChild(h('option', { value: n }, n));
      });
    }
    $('popup-load-example').addEventListener('click', function () {
      var v = ex.value;
      if (!v) { FE.uiAlert('请选择示例'); return; }
      var text = FE.EXAMPLE_FILES ? FE.EXAMPLE_FILES[v] : null;
      if (text == null) { setPopupStatus('示例未找到: ' + v, 'error'); return; }
      if (FE.loadPopupProfileText(text, v)) setPopupStatus('已加载示例 ' + v, 'ok');
    });
  }

  var author = $('popup-author');
  author.addEventListener('change', function () {
    pmutate(function () {
      if (author.value.trim() === '') delete pp().author;
      else pp().author = author.value.trim();
    });
  });

  var schemaSel = $('popup-schema');
  schemaSel.addEventListener('change', function () {
    state.popupSchema = schemaSel.value || 'default';
    renderPopupTab();
  });
  $('popup-schema-add').addEventListener('click', async function () {
    var n = await FE.uiPrompt({
      title: '新建 schema', message: '新 schema 名称（如 luna_pinyin，default 为缺省）：',
      placeholder: 'luna_pinyin', required: true
    });
    if (n == null) return;
    n = String(n).trim();
    if (!n) return;
    if (pp().schemas[n]) { FE.uiAlert('schema 已存在：' + n, { title: '无法新建' }); return; }
    pmutate(function () { pp().schemas[n] = {}; });
    state.popupSchema = n;
  });
  $('popup-schema-del') && $('popup-schema-del').addEventListener('click', async function () {
    var n = state.popupSchema;
    if (n === 'default') { FE.uiAlert('不能删除 default schema', { title: '无法删除' }); return; }
    var ok = await FE.uiConfirm('删除 schema “' + n + '”？', { title: '删除 schema', danger: true, okLabel: '删除' });
    if (!ok) return;
    pmutate(function () {
      delete pp().schemas[n];
      state.popupSchema = 'default';
    });
  });

  /* JSON 应用 / 格式化 */
  var ta = $('popup-json');
  ta.addEventListener('input', function () { popupJsonDirty = true; });
  $('popup-json-apply').addEventListener('click', function () {
    var rep = FE.inspectJsonText(ta.value);
    if (FE.loadPopupProfileText(ta.value)) {
      popupJsonDirty = false;
      setPopupJsonStatus(rep.total
        ? '✓ 已应用（自动修复 ' + rep.total + ' 处问题：' + formatIssueListLocal(rep.issues) + '）'
        : '✓ 已应用', rep.total ? 'warn' : 'ok');
    } else {
      setPopupJsonStatus('✗ 未应用（原文保留）。错误: ' + (FE.state.lastParseError || ''), 'error');
    }
  });
  $('popup-json-format').addEventListener('click', function () {
    var rep = FE.inspectJsonText(ta.value);
    if (!rep.parseOk) {
      setPopupJsonStatus('JSON 无效: ' + (rep.parseError || '') +
        (rep.total ? '（检测到 ' + rep.total + ' 处可修复问题）' : ''), 'error');
      return;
    }
    ta.value = JSON.stringify(JSON.parse(rep.fixedText), null, 2);
    popupJsonDirty = true;
    setPopupJsonStatus(rep.total ? '已格式化并修复 ' + rep.total + ' 处问题（尚未应用）' : '已格式化（尚未应用）', 'ok');
  });

  /* 键列表搜索（与按键定义 / 动作宏三页共用同一套接线：即时过滤 + 按钮兜底 +
   * 框内 ✕ 清空）。wireSearch 在 app.js 模块作用域导出。 */
  if (FE.wireSearch) FE.wireSearch('popup-filter', 'popup-search', renderPopupKeys, 'popup-filter-clear');

  renderPopupTab();
}
FE.renderPopupTab = renderPopupTab;

/* 供布局编辑器跳转：选中某 popupKey 并切到弹出菜单页。
 * 与 jumpToDef 同理，必须**清掉该页的过滤**并**展开目标卡片** ——
 * 键列表现在默认折叠、且可能正被搜索过滤，不清不展的话跳过来只看得到
 * 一排收起的摘要行（甚至连目标都被筛掉了），用户会以为「点了没反应」。 */
FE.jumpToPopupEditor = function (popupKey) {
  state.popupSelKey = popupKey || state.popupSelKey;
  if (popupKey) {
    var fi = $('popup-filter');
    if (fi && fi.value) { fi.value = ''; if (FE.syncSearchClear) FE.syncSearchClear('popup-filter'); }
    FE.ensureOpenSet('openPopupKeys')[popupKey] = true;
  }
  FE.activateTab('tab-popup');
  renderPopupTab();
  if (popupKey) FE.scrollToDefItem(popupKey, 'popup-keys', { hold: true });
};

function formatIssueListLocal(issues) {
  return issues.map(function (it) {
    var ls = it.lines.slice(0, 6).join('、');
    return it.label + ' ×' + it.count + (ls ? '（第 ' + ls + ' 行）' : '');
  }).join('；');
}

initPopupTab();
})();
