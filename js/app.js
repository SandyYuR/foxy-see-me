/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * app.js — 状态管理、引用解析引擎、变体合并、校验器、预览渲染与编辑器 UI
 *
 * 文件分为两部分：
 *   1. 纯逻辑部分（无 DOM 依赖，Node 测试可直接加载）
 *   2. UI 部分（浏览器中初始化）
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

/* ================================================================
 * 一、通用工具
 * ================================================================ */
function isPlainObject(o) { return Object.prototype.toString.call(o) === '[object Object]'; }
function deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
function omit(obj, keys) {
  var out = {};
  if (!isPlainObject(obj)) return out;
  outer: for (var k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    for (var j = 0; j < keys.length; j++) if (k === keys[j]) continue outer;
    out[k] = obj[k];
  }
  return out;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
FE.isPlainObject = isPlainObject;
FE.deepClone = deepClone;
FE.omit = omit;
FE.clamp = clamp;

/* ================================================================
 * 二、编辑器状态
 * ================================================================ */
var NEUTRAL_STATUS = { composing: false, ascii_mode: false, disabled: false };
var state = {
  profile: null,          // 当前布局 profile（foxy.keyboard-layout JSON）
  fileName: 'foxy-layout.json',
  folderPlan: null,       // 「导入文件夹」的识别结果（FE.planFolderImport 产物）
  folderDefs: null,       // 该文件夹里的共享 definitions.json（导出时用于还原分包）
  folderLayoutPath: null, // 当前正在编辑的包内布局文件路径
  folderHint: null,       // 需补选文件夹时的提示文案（null = 不提示，由 renderFolderOps 派生渲染）
  layoutName: null,       // 当前正在编辑/预览的命名布局
  status: { composing: false, ascii_mode: false, disabled: false, shift: false },
  statusSample: '朙月拼音',
  theme: 'dark',
  includeType: true,
  sel: null,              // 选中按键 {s, r, k}
  validation: { errors: [], warnings: [] },
  compiled: null,         // 预览的编译产物（FE.compileLayout 结果，随时可重建）
  history: [],
  future: [],
  splitMode: false,       // 分体键盘：预览与区段编辑作用于 split 片段
  portraitW: null,      // 竖屏基准宽度（分体横屏预览时记住，切回后恢复）
  popupProfile: null,     // 弹出菜单 profile（foxy.popup-profile JSON，由 popup-editor.js 管理）
  popupFileName: 'popups.json',
  popupSchema: 'default', // 弹出菜单当前编辑的 schema
  popupSelKey: null,      // 弹出菜单预览选中的 popupKey
  popupShifted: false     // 弹出菜单预览使用 shifted 候选
};
FE.state = state;
FE.NEUTRAL_STATUS = NEUTRAL_STATUS;

/* ================================================================
 * 三、引用解析引擎
 * ================================================================ */
function userKeys() { return (state.profile && isPlainObject(state.profile.keys)) ? state.profile.keys : {}; }

/* ---------------- 定义作用域 ----------------
 * 解析器默认读 state.profile（浏览器主路径行为不变）。需要解析「一份尚未装入 state 的
 * profile」的场合（如校验、离线体检）可显式传入 scope，从而不再临时改写全局 state——
 * 后者会让 validateProfile 不可重入、不可并发。 */
function scopeFrom(profile) {
  var p = isPlainObject(profile) ? profile : {};
  return {
    profile: p,
    keys: isPlainObject(p.keys) ? p.keys : {},
    actions: isPlainObject(p.actions) ? p.actions : {},
    macros: isPlainObject(p.macros) ? p.macros : {}
  };
}
FE.scopeFrom = scopeFrom;

function lookupDef(name, scope) {
  var keys = scope ? scope.keys : userKeys();
  if (Object.prototype.hasOwnProperty.call(keys, name)) return keys[name];
  if (FE.BUILTIN_KEYS && FE.BUILTIN_KEYS[name]) return FE.BUILTIN_KEYS[name];
  return null;
}
FE.lookupDef = lookupDef;

/* 将补丁字段合并到目标（处理 swipe / hintTextSize / colors 的按方向/角色合并） */
function mergePatch(target, patch) {
  for (var k in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    if (k === 'ref' || k === 'when' || k === 'variants') continue;
    var v = patch[k];
    if (k === 'tap' && v === null) continue;           // tap:null 保留继承的点击动作
    /* 文档 null 语义：label 清空为空字符串；weight/height 恢复解析器默认 1 */
    if (v === null && k === 'label') { target.label = ''; continue; }
    if (v === null && (k === 'weight' || k === 'height')) { target[k] = 1; continue; }
    if (k === 'swipe') {
      var base = (target.swipe && isPlainObject(target.swipe)) ? deepClone(target.swipe) : {};
      if (v === null) base = {};
      else if (isPlainObject(v)) {
        for (var d in v) { if (v[d] === null) delete base[d]; else base[d] = deepClone(v[d]); }
      }
      target.swipe = base;
    } else if (k === 'hintTextSize') {
      if (isPlainObject(v) && isPlainObject(target.hintTextSize)) {
        var ht = deepClone(target.hintTextSize);
        for (var hd in v) { if (v[hd] === null) delete ht[hd]; else ht[hd] = v[hd]; }
        target.hintTextSize = ht;
      } else {
        target.hintTextSize = deepClone(v);
      }
    } else if (k === 'colors' && isPlainObject(v) && isPlainObject(target.colors)) {
      var col = deepClone(target.colors);
      for (var r in v) {
        if (r === 'states' && isPlainObject(v.states)) {
          var st = isPlainObject(col.states) ? deepClone(col.states) : {};
          for (var sn in v.states) st[sn] = Object.assign({}, isPlainObject(st[sn]) ? st[sn] : {}, v.states[sn]);
          col.states = st;
        } else col[r] = deepClone(v[r]);
      }
      target.colors = col;
    } else {
      target[k] = deepClone(v);
    }
  }
  return target;
}
FE.mergePatch = mergePatch;

function variantMatches(when, status) {
  if (!when || !isPlainObject(when.rime)) return true;
  var r = when.rime;
  var conds = Object.keys(r);
  for (var i = 0; i < conds.length; i++) {
    var cond = conds[i];
    if (FE.STATUS_CONDS.indexOf(cond) < 0) return false;
    if (!!r[cond] !== !!status[cond]) return false;
  }
  return true;
}
FE.variantMatches = variantMatches;

function applyVariants(eff, variants, status, seen, scope) {
  if (!Array.isArray(variants) || !variants.length) return eff;
  var match = null;
  for (var i = 0; i < variants.length; i++) {
    if (variants[i] && variantMatches(variants[i].when, status)) match = variants[i];
  }
  if (!match) return eff;
  var patch = omit(match, ['when']);
  if (typeof match.ref === 'string' && match.ref) {
    var sub = evalKeyRef(match.ref, status, seen, scope);
    var eff2 = sub.eff;
    mergePatch(eff2, omit(patch, ['ref']));
    return eff2;
  }
  mergePatch(eff, patch);
  return eff;
}
FE.applyVariants = applyVariants;

/* 解析用户按键定义引用链：name → ... → 内置/终点
 * scope 可选：省略时读 state.profile（浏览器主路径），显式传入则完全独立于全局状态。 */
function evalKeyRef(refName, status, seen, scope) {
  seen = seen || {};
  var node = lookupDef(refName, scope);
  var result = { eff: {}, chain: [], unresolved: null, cycle: null };
  if (!node) { result.unresolved = refName; return result; }
  if (seen[refName]) { result.cycle = refName; return result; }
  seen[refName] = true;
  result.chain.push(refName);
  if (node.ref != null) {
    if (typeof node.ref !== 'string') { result.unresolved = String(node.ref); return result; }
    var sub = evalKeyRef(node.ref, status, seen, scope);
    result.eff = sub.eff;
    result.chain = sub.chain.concat(result.chain);
    if (sub.unresolved) result.unresolved = sub.unresolved;
    if (sub.cycle) result.cycle = sub.cycle;
  }
  mergePatch(result.eff, omit(node, ['ref', 'variants']));
  result.eff = applyVariants(result.eff, node.variants, status, seen, scope);
  return result;
}
FE.evalKeyRef = evalKeyRef;

/* 解析一个放置（placement）为有效按键对象。
 * 优先级（Foxy 文档）：定义链(含定义变体) < override 变体与字段 < 直接放置字段(含放置变体)。
 * 注意：早期文档写的是「直接字段 < override」，现已反转为直接字段优先。 */
FE.evalPlacement = function (placement, status, scope) {
  status = status || NEUTRAL_STATUS;
  var out = { eff: {}, chain: [], unresolved: null, cycle: null, placement: placement || {} };
  if (isPlainObject(placement) && typeof placement.ref === 'string' && placement.ref) {
    var sub = evalKeyRef(placement.ref, status, null, scope);
    out.eff = sub.eff;
    out.chain = sub.chain;
    out.unresolved = sub.unresolved;
    out.cycle = sub.cycle;
  }
  if (isPlainObject(placement)) {
    if (isPlainObject(placement.override)) {
      mergePatch(out.eff, omit(placement.override, ['variants']));
      out.eff = applyVariants(out.eff, placement.override.variants, status, null, scope);
    }
    mergePatch(out.eff, omit(placement, ['ref', 'override', 'variants']));
    out.eff = applyVariants(out.eff, placement.variants, status, null, scope);
  }
  return out;
};

/* ---------------- 动作与手势解析 ---------------- */
FE.actionDisplay = function (a) {
  if (a == null) return '无';
  if (!isPlainObject(a)) return String(a);
  if (a.__builtin) return '内置动作 ' + a.__builtin;
  switch (a.type) {
    case 'key': {
      var meta = a.meta ? (Array.isArray(a.meta) ? a.meta : [a.meta]) : [];
      var parts = meta.map(function (m) { var s = String(m).toUpperCase(); return s === 'CONTROL' ? 'CTRL' : s; });
      var p = parts.join('+');
      return (p ? p + '+' : '') + String(a.key || '?');
    }
    case 'modifier': return '修饰 ' + a.modifier + (a.state ? ' · ' + a.state : '');
    case 'text': return '文本 “' + a.text + '”';
    case 'commit': return '上屏 “' + a.text + '”';
    case 'switch_layout': return '切换布局 ' + a.layout;
    case 'app': return '命令 ' + a.command + (a.argument ? ' ' + a.argument : '');
    default: return '动作 ' + JSON.stringify(a);
  }
};

/* 动作规格 → { actions:[...], display, unresolved? } 或 null
 * 支持字符串(actions 名)、数组、{macro}、{action}/{actions}、直接动作对象
 * scope 可选：省略时读 state.profile，显式传入则完全独立于全局状态。 */
FE.resolveActionSpec = function (spec, scope) {
  if (spec == null) return null;
  if (typeof spec === 'string') {
    var actions = scope ? scope.actions : ((state.profile && isPlainObject(state.profile.actions)) ? state.profile.actions : {});
    var a = actions[spec];
    if (a != null) return { actions: [deepClone(a)], display: '动作 ' + spec, kind: 'action-name', name: spec };
    return { actions: [], display: '未解析动作 ' + spec, unresolved: spec, kind: 'action-name', name: spec };
  }
  if (Array.isArray(spec)) {
    return { actions: spec.map(deepClone), display: spec.length ? spec.length + ' 个动作' : '空动作列表', kind: 'list' };
  }
  if (isPlainObject(spec)) {
    if (spec.macro != null) {
      var macros = scope ? scope.macros : ((state.profile && isPlainObject(state.profile.macros)) ? state.profile.macros : {});
      var m = macros[spec.macro];
      var disp = '宏 ' + spec.macro + (Array.isArray(m) ? '（' + m.length + ' 步）' : '');
      var r = { actions: [deepClone(spec)], display: m ? disp : '未解析宏 ' + spec.macro, kind: 'macro', name: spec.macro };
      if (!m) r.unresolved = spec.macro;
      return r;
    }
    if (spec.action != null) return FE.resolveActionSpec(spec.action, scope);
    if (spec.actions != null) return FE.resolveActionSpec(spec.actions, scope);
    if (spec.type != null) return { actions: [deepClone(spec)], display: FE.actionDisplay(spec), kind: 'direct' };
  }
  return null;
};

/* 有效点击手势信息：{action, label, ownLabel, hint, popup}
 * ownLabel 区分「tap 对象里直接写的 label」与「经 tap.ref 从被引用按键继承的 label」：
 * 前者优先级最高，后者低于外层的 key/variant label（见 Foxy 文档 label 优先级规则）。 */
FE.tapInfo = function (eff, status, depth, scope) {
  depth = depth || 0;
  if (depth > 12 || !isPlainObject(eff)) return null;
  var t = eff.tap;
  if (t == null) return null;
  if (typeof t === 'string') {
    var r = FE.resolveActionSpec(t, scope);
    return r ? { action: r, label: null, ownLabel: false, popup: undefined } : null;
  }
  if (!isPlainObject(t)) return null;
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  if (t.ref != null) {
    if (typeof t.ref !== 'string') return null;
    var sub = FE.evalPlacement({ ref: t.ref }, status, scope);
    var nested = FE.tapInfo(sub.eff, status, depth + 1, scope);
    var label, ownLabel = hasOwn(t, 'label');
    if (ownLabel) label = (t.label == null) ? '' : t.label;   /* tap 自带 label（含 null 清空）最高 */
    else if (nested && nested.label != null && nested.label !== '') label = nested.label;
    else label = rawLabelOf(sub.eff, status, depth + 1, scope);
    var act = nested ? nested.action : null;
    if (hasOwn(t, 'action') || hasOwn(t, 'actions')) {
      var spec = hasOwn(t, 'action') ? t.action : t.actions;
      act = (spec === null) ? FE.resolveActionSpec([], scope) : FE.resolveActionSpec(spec, scope);
    }
    var hint = hasOwn(t, 'hint') ? ((t.hint == null) ? '' : t.hint)
      : (nested && nested.hint !== undefined ? nested.hint : undefined);
    var popup = hasOwn(t, 'popup') ? ((t.popup === null) ? false : t.popup)
      : (nested ? nested.popup : undefined);
    return { action: act, label: label, ownLabel: ownLabel, hint: hint, popup: popup };
  }
  var act2 = FE.resolveActionSpec(
    t.action != null ? t.action :
    (t.actions != null ? t.actions :
      (t.macro != null ? t : (t.type != null ? t : null))), scope
  );
  if (hasOwn(t, 'action') && t.action === null) act2 = FE.resolveActionSpec([], scope);
  if (hasOwn(t, 'actions') && t.actions === null) act2 = FE.resolveActionSpec([], scope);
  return {
    action: act2,
    label: hasOwn(t, 'label') ? ((t.label == null) ? '' : t.label) : null,
    ownLabel: hasOwn(t, 'label'),
    /* undefined = 未指定（回退 label）；'' = 显式 null 清空 */
    hint: hasOwn(t, 'hint') ? ((t.hint == null) ? '' : t.hint) : undefined,
    popup: hasOwn(t, 'popup') ? ((t.popup === null) ? false : t.popup) : undefined
  };
};

/* 主标签原始值（不应用 Shift 状态）。
 * Foxy 文档优先级：tap 对象自带 label > 外层 key/variant label > 被引用 tap 的 label。
 * 外层 label 显式为 null 时按「清空为空字符串」处理，不再回退到被引用按键的标签。 */
function rawLabelOf(eff, status, depth, scope) {
  depth = depth || 0;
  if (depth > 12 || !isPlainObject(eff)) return null;
  var ti = FE.tapInfo(eff, status, depth + 1, scope);
  if (ti && ti.ownLabel) return (ti.label == null) ? '' : String(ti.label);
  if (eff.label === null) return '';
  if (eff.label != null) return String(eff.label);
  if (ti && ti.label != null && String(ti.label) !== '') return String(ti.label);
  return null;
}
FE.rawLabelOf = rawLabelOf;

/* 手势对象 → {label, action, hint, popup, repeat, popupKey, start, end, raw}
 * null 语义（Foxy 文档）：label/hint 清空为空串、popup 变 false、action/actions 变空列表。 */
FE.gestureInfo = function (g, status, depth, scope) {
  if (g == null) return null;
  if (typeof g === 'string') {
    return { raw: g, action: FE.resolveActionSpec(g, scope), label: null };
  }
  if (!isPlainObject(g)) return null;
  depth = depth || 0;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var out = { raw: g };
  var refLabel = null, refHint, refPopup;
  if (g.ref != null && typeof g.ref === 'string') {
    var sub = FE.evalPlacement({ ref: g.ref }, status, scope);
    var nestedTap = FE.tapInfo(sub.eff, status, depth + 1, scope);
    out.action = nestedTap ? nestedTap.action : null;
    refLabel = (nestedTap && nestedTap.label != null && String(nestedTap.label) !== '')
      ? String(nestedTap.label) : rawLabelOf(sub.eff, status, depth + 1, scope);
    refHint = nestedTap ? nestedTap.hint : undefined;
    refPopup = nestedTap ? nestedTap.popup : undefined;
    if (isPlainObject(sub.eff.hold)) out.inheritedHold = sub.eff.hold;
  } else {
    out.action = FE.resolveActionSpec(
      g.action != null ? g.action :
      (g.actions != null ? g.actions :
        (g.macro != null || g.type != null ? g : null)), scope
    );
    refHint = undefined;
    refPopup = undefined;
  }
  if (has(g, 'label')) out.label = (g.label == null) ? '' : g.label;
  else out.label = refLabel;
  if (has(g, 'hint')) out.hint = (g.hint == null) ? '' : g.hint;
  else if (refHint !== undefined) out.hint = refHint;
  if (has(g, 'popup')) out.popup = (g.popup === null) ? false : g.popup;
  else out.popup = refPopup;
  /* 手势引用可用 action/actions 覆盖被引用手势的动作；null 表示空动作列表 */
  if (has(g, 'action') || has(g, 'actions')) {
    var spec = has(g, 'action') ? g.action : g.actions;
    out.action = (spec == null) ? FE.resolveActionSpec([], scope) : FE.resolveActionSpec(spec, scope);
  }
  if (g.repeat != null) out.repeat = g.repeat;
  if (g.popupKey != null) out.popupKey = g.popupKey;
  /* hold 的两侧可写成 start/end，也可写成 action/actions + endAction/endActions：
   * 后者是「起始侧用 action(s)、结束侧用 endAction(s)」，省略的一侧沿用被引用的 hold。 */
  var holdShaped = has(g, 'start') || has(g, 'end') || has(g, 'endAction') || has(g, 'endActions');
  if (has(g, 'start')) out.start = (g.start == null) ? null : g.start;
  else if ((has(g, 'action') || has(g, 'actions')) && holdShaped) {
    out.start = has(g, 'action') ? g.action : g.actions;
  } else if (out.inheritedHold && out.inheritedHold.start != null) out.start = out.inheritedHold.start;
  if (has(g, 'end')) out.end = (g.end == null) ? null : g.end;
  else if (has(g, 'endAction')) out.end = (g.endAction == null) ? null : g.endAction;
  else if (has(g, 'endActions')) out.end = (g.endActions == null) ? null : g.endActions;
  else if (out.inheritedHold && out.inheritedHold.end != null) out.end = out.inheritedHold.end;
  return out;
};

/* ================================================================
 * 四、区段 / 行 / 网格计算
 * ================================================================ */
FE.rowsOfSection = function (section) {
  var rows = Array.isArray(section.rows) ? section.rows : [];
  var n = rows.length;
  var defH = n > 0 ? 5 / n : 5;
  return rows.map(function (r) {
    if (Array.isArray(r)) return { heightUnits: defH, width: null, totalWeight: null, keys: r, objectForm: false, raw: r };
    if (isPlainObject(r)) return {
      heightUnits: (typeof r.height === 'number' && r.height > 0) ? r.height : defH,
      width: (typeof r.width === 'number' && r.width > 0) ? r.width : null,
      totalWeight: (typeof r.totalWeight === 'number' && r.totalWeight > 0) ? r.totalWeight : null,
      keys: Array.isArray(r.keys) ? r.keys : [],
      objectForm: true, raw: r
    };
    return { heightUnits: defH, width: null, totalWeight: null, keys: [], objectForm: false, raw: r };
  });
};

FE.rowWeights = function (row) {
  var keys = row.keys || [];
  var ws = keys.map(function (k) {
    if (isPlainObject(k) && k.weight != null) return k.weight;
    return 1;
  });
  var hasTotal = typeof row.totalWeight === 'number' && row.totalWeight > 0;
  var fixedSum = 0, autoCount = 0;
  ws.forEach(function (w) { if (w === 'auto') autoCount++; else fixedSum += (Number(w) || 0); });
  if (autoCount === 0) return ws.map(function (w) { return Number(w) || 0; });
  var autoVal = hasTotal ? Math.max(0, row.totalWeight - fixedSum) / autoCount : 1;
  return ws.map(function (w) { return w === 'auto' ? autoVal : (Number(w) || 0); });
};

FE.gridDims = function (section) {
  return {
    columns: (Number.isInteger(section.columns) && section.columns > 0) ? section.columns : 1,
    rows: (Number.isInteger(section.rows) && section.rows > 0) ? section.rows : 1,
    rowHeights: Array.isArray(section.rowHeights) ? section.rowHeights : null
  };
};

FE.layoutHeightUnits = function (L) {
  if (!isPlainObject(L) || !Array.isArray(L.sections)) return 0;
  var total = 0;
  L.sections.forEach(function (s) {
    if (!isPlainObject(s)) return;
    if (s.type === 'rows') {
      FE.rowsOfSection(s).forEach(function (r) { total += r.heightUnits; });
    } else if (s.type === 'grid') {
      if (Array.isArray(s.rowHeights) && s.rowHeights.length) {
        s.rowHeights.forEach(function (x) { total += (Number(x) || 0); });
      } else total += 5;
    }
  });
  return total;
};

/* 布局级状态变体：返回实际应渲染的布局名 */
FE.resolvePreviewLayout = function (profile, name, status, seen) {
  seen = seen || {};
  if (seen[name]) return name;
  seen[name] = true;
  var L = profile && profile.layouts && profile.layouts[name];
  if (!isPlainObject(L)) return name;
  if (Array.isArray(L.variants)) {
    var target = null;
    for (var i = 0; i < L.variants.length; i++) {
      var v = L.variants[i];
      if (v && typeof v.layout === 'string' && variantMatches(v.when, status)) target = v.layout;
    }
    if (target && profile.layouts[target]) return FE.resolvePreviewLayout(profile, target, status, seen);
  }
  return name;
};

/* ================================================================
 * 五、校验器
 * ================================================================ */
function appCommandExists(command) {
  return (FE.APP_COMMANDS || []).some(function (x) { return x[0] === command; });
}

/* 校验一个直接动作；profile 可省略（popup profile 没有命名布局上下文）。 */
function validateAction(action, where, err, profile) {
  if (!isPlainObject(action)) { err(where + ' 必须是动作对象'); return; }
  var t = action.type;
  if (typeof t !== 'string' || !t) { err(where + ' 缺少动作 type'); return; }
  if (t === 'key') {
    if (typeof action.key !== 'string' || !action.key) err(where + ' 的 key 动作缺少 key');
    else if (!FE.ALL_KEYCODES[action.key]) err(where + ' 使用了不支持的 KeyCode: ' + action.key);
    if (action.meta != null) {
      var meta = Array.isArray(action.meta) ? action.meta : [action.meta];
      meta.forEach(function (m) {
        if (['SHIFT', 'CTRL', 'ALT', 'META'].indexOf(String(m).toUpperCase()) < 0) err(where + ' 使用了不支持的 meta: ' + m);
      });
    }
  } else if (t === 'modifier') {
    if (FE.MODIFIERS.indexOf(action.modifier) < 0) err(where + ' 使用了不支持的 modifier: ' + action.modifier);
    if (action.state != null && FE.MODIFIER_STATES.indexOf(action.state) < 0) {
      err(where + ' 使用了不支持的 modifier state: ' + action.state);
    }
  } else if (t === 'text' || t === 'commit') {
    if (typeof action.text !== 'string') err(where + ' 的 ' + t + ' 动作缺少字符串 text');
  } else if (t === 'switch_layout') {
    if (typeof action.layout !== 'string' || !action.layout) err(where + ' 的 switch_layout 动作缺少 layout');
    /* symbols/emoji/kaomoji 既是 app 命令名，实测也可作为 switch_layout 目标
     * （多个官方示例如此使用），因此豁免"目标不存在"检查。 */
    else if (profile && isPlainObject(profile.layouts) && !profile.layouts[action.layout] && ['symbols', 'emoji', 'kaomoji'].indexOf(action.layout) < 0) {
      err(where + ' 的 switch_layout 目标不存在: ' + action.layout);
    }
  } else if (t === 'app') {
    if (typeof action.command !== 'string' || !action.command) err(where + ' 的 app 动作缺少 command');
    else if (!appCommandExists(action.command)) err(where + ' 使用了不支持的 app command: ' + action.command);
    /* commit_text 的 argument 是可选的（文档：reads its content from the optional
     * argument field）；仅当写了 argument 但类型不对时报错。 */
    else if (action.command === 'commit_text' && action.argument != null && typeof action.argument !== 'string') err(where + ' 的 commit_text 命令的 argument 必须是字符串');
    /* select_schema / select_switch_option 需要 argument，缺失则 Foxy 端空转 */
    else if ((action.command === 'select_schema' || action.command === 'select_switch_option') && (typeof action.argument !== 'string' || !action.argument)) err(where + ' 的 ' + action.command + ' 命令缺少字符串 argument');
  } else {
    err(where + ' 使用了不支持的动作 type: ' + t);
  }
}
FE.validateAction = validateAction;

function refNameOf(placement) {
  return (isPlainObject(placement) && typeof placement.ref === 'string') ? placement.ref : '内联按键';
}

function checkGestureRefs(container, where, err, profile, scope) {
  var acts = scope ? scope.actions : ((state.profile && isPlainObject(state.profile.actions)) ? state.profile.actions : {});
  var macros = scope ? scope.macros : ((state.profile && isPlainObject(state.profile.macros)) ? state.profile.macros : {});
  function checkOne(g, gw) {
    if (g == null) return;
    if (isPlainObject(g) && typeof g.ref === 'string' && !lookupDef(g.ref, scope)) err(gw + '.ref 引用无法解析: ' + g.ref);
    if (typeof g === 'string') {
      if (!acts[g]) err(gw + ' 引用动作名不存在: ' + g);
      return;
    }
    if (!isPlainObject(g)) { err(gw + ' 的手势结构无效'); return; }
    if (g.macro != null) {
      if (!macros[g.macro]) err(gw + ' 引用宏不存在: ' + g.macro);
    }
    if (g.action != null) {
      if (typeof g.action === 'string') {
        if (!acts[g.action]) err(gw + ' 引用动作名不存在: ' + g.action);
      } else if (Array.isArray(g.action)) {
        g.action.forEach(function (a, i) { validateAction(a, gw + '.action[' + i + ']', err, profile); });
      } else validateAction(g.action, gw + '.action', err, profile);
    }
    if (g.actions != null) {
      if (!Array.isArray(g.actions)) err(gw + '.actions 必须是数组');
      else g.actions.forEach(function (a, i) { validateAction(a, gw + '.actions[' + i + ']', err, profile); });
    }
    if (g.type != null) validateAction(g, gw, err, profile);
    if (g.start != null) validateAction(g.start, gw + '.start', err, profile);
    if (g.end != null) validateAction(g.end, gw + '.end', err, profile);
    if (g.endAction != null) validateAction(g.endAction, gw + '.endAction', err, profile);
    /* endActions 是数组形式（hold 结束侧的动作序列） */
    if (g.endActions != null) {
      if (!Array.isArray(g.endActions)) err(gw + '.endActions 必须是数组');
      else g.endActions.forEach(function (a, i) { validateAction(a, gw + '.endActions[' + i + ']', err, profile); });
    }
  }
  ['tap', 'doubleTap', 'longPress', 'hold'].forEach(function (f) { checkOne(container[f], where + ' 的 ' + f); });
  if (isPlainObject(container.swipe)) FE.SWIPE_DIRS.forEach(function (d) { checkOne(container.swipe[d], where + ' 的 swipe.' + d); });
}

FE.validateProfile = function (profile) {
  var errors = [], warnings = [], issues = [];
  /* 定位上下文：进入区段/行/按键时设置，err/warn 自动带上坐标，
   * 这样 UI 能「点击错误 → 跳转并选中该键」。字符串版 errors/warnings 保持原样。 */
  var ctx = null;
  function addIssue(level, msg, loc) {
    if (level === 'error') errors.push(msg); else warnings.push(msg);
    /* loc 只覆盖它显式给出的键，其余坐标沿用当前 ctx：
     * 否则在 checkPlacement 里写 err(msg, {code:'no-tap'}) 会把区段/行/键坐标整块丢掉。 */
    var src = null;
    if (ctx && loc) src = Object.assign({}, ctx, loc);
    else src = loc || ctx;
    var it = { level: level, message: msg, path: (src && src.path) || '配置' };
    if (src) {
      if (src.code) it.code = src.code;
      if (src.layout != null) it.layout = src.layout;
      if (src.isSplit) it.isSplit = true;
      if (src.section != null) it.sectionIndex = src.section;
      if (src.row != null) it.rowIndex = src.row;
      if (src.key != null) it.keyIndex = src.key;
      if (src.group) it.group = src.group;
    }
    issues.push(it);
  }
  function err(msg, loc) { addIssue('error', msg, loc); }
  function warn(msg, loc) { addIssue('warn', msg, loc); }
  /* 在给定定位上下文中执行 fn，结束后恢复（支持嵌套：区段 → 行 → 按键） */
  function inCtx(next, fn) {
    var prev = ctx;
    ctx = next;
    try { return fn(); } finally { ctx = prev; }
  }

  /* 显式作用域：解析器（lookupDef / evalPlacement / resolveActionSpec）全部走 scope，
   * 不再临时改写 state.profile。因此 validateProfile 现在可重入、可并发，
   * 也能校验一份尚未装入编辑器状态的 profile（如 check-real-files）。 */
  var scope = scopeFrom(profile);
  {
    if (!isPlainObject(profile)) { err('配置不是 JSON 对象'); return { errors: errors, warnings: warnings, issues: issues }; }
    if (profile.type != null && profile.type !== 'foxy.keyboard-layout') {
      err('type 字段必须为 "foxy.keyboard-layout"，当前为 ' + JSON.stringify(profile.type));
    }
    if (!isPlainObject(profile.layouts) || Object.keys(profile.layouts).length === 0) {
      err('layouts 必须是非空对象');
    }

    var keys = isPlainObject(profile.keys) ? profile.keys : {};
    var layoutNames = isPlainObject(profile.layouts) ? Object.keys(profile.layouts) : [];

    /* ---- 按键定义 ---- */
    var color = {};
    function visitKeyRef(n, path) {
      if (color[n] === 2) return;
      if (color[n] === 1) { err('按键引用链存在循环: ' + path.join(' → ') + ' → ' + n); return; }
      color[n] = 1;
      var d = keys[n];
      if (isPlainObject(d) && typeof d.ref === 'string') visitKeyRef(d.ref, path.concat([n]));
      color[n] = 2;
    }
    for (var kn in keys) {
      if (!Object.prototype.hasOwnProperty.call(keys, kn)) continue;
      var kd = keys[kn];
      if (!isPlainObject(kd)) { err('按键定义 “' + kn + '” 不是对象'); continue; }
      if (kd.ref != null && typeof kd.ref !== 'string') err('按键定义 “' + kn + '” 的 ref 必须是字符串');
      else if (typeof kd.ref === 'string' && !lookupDef(kd.ref, scope)) err('按键定义 “' + kn + '” 的 ref 无法解析: ' + kd.ref);
      if (kd.ref === kn) err('按键定义 “' + kn + '” 引用了自身');
      if (kd.hold != null && kd.longPress != null) err('按键定义 “' + kn + '” 同时定义了 hold 与 longPress');
      checkGestureRefs(kd, '按键定义 “' + kn + '”', err, profile, scope);
      if (Array.isArray(kd.variants)) {
        kd.variants.forEach(function (v, vi) {
          if (!isPlainObject(v)) { err('按键定义 “' + kn + '” 的变体 ' + vi + ' 不是对象'); return; }
          if (typeof v.ref === 'string' && !lookupDef(v.ref, scope)) err('按键定义 “' + kn + '” 变体 ' + vi + ' 的 ref 无法解析: ' + v.ref);
          checkGestureRefs(v, '按键定义 “' + kn + '” 变体 ' + vi, err, profile, scope);
        });
      }
    }
    for (var kn2 in keys) if (Object.prototype.hasOwnProperty.call(keys, kn2)) visitKeyRef(kn2, []);

    /* ---- 命名布局 ---- */
    layoutNames.forEach(function (ln) {
      var L = profile.layouts[ln];
      if (!isPlainObject(L)) { err('布局 “' + ln + '” 不是对象'); return; }
      if (Array.isArray(L.variants)) {
        L.variants.forEach(function (v, vi) {
          if (!isPlainObject(v) || typeof v.layout !== 'string') err('布局 “' + ln + '” 的变体 ' + vi + ' 缺少 layout 字段');
          else if (!(v.layout in profile.layouts)) err('布局 “' + ln + '” 的变体指向不存在的布局: ' + v.layout);
        });
        /* 布局变体循环检测 */
        var lcolor = {};
        function visitLayout(n, path) {
          if (lcolor[n] === 2) return;
          if (lcolor[n] === 1) { err('布局变体存在循环: ' + path.join(' → ') + ' → ' + n); return; }
          lcolor[n] = 1;
          var LL = profile.layouts[n];
          if (isPlainObject(LL) && Array.isArray(LL.variants)) {
            LL.variants.forEach(function (v) {
              if (isPlainObject(v) && typeof v.layout === 'string' && v.layout in profile.layouts) visitLayout(v.layout, path.concat([n]));
            });
          }
          lcolor[n] = 2;
        }
        visitLayout(ln, []);
      }
      if (isPlainObject(L.override)) {
        ['keyboardHeightPercent', 'keyboardHeightPercentLandscape'].forEach(function (f) {
          var v = L.override[f];
          if (v != null && (typeof v !== 'number' || v < 0.1 || v > 0.9)) {
            warn('布局 “' + ln + '” 的 ' + f + ' 建议在 0.1–0.9 之间，当前为 ' + JSON.stringify(v));
          }
        });
      }
      if (!Array.isArray(L.sections) || !L.sections.length) {
        err('布局 “' + ln + '” 缺少有效的 sections');
      } else {
        validateSectionsArr(L.sections, ln, false);
      }

      /* ---- 分体片段（split） ---- */
      if (L.split !== undefined) {
        if (!isPlainObject(L.split)) {
          err('布局 “' + ln + '” 的 split 必须是对象');
        } else if (!Array.isArray(L.split.sections) || !L.split.sections.length) {
          err('布局 “' + ln + '” 的 split 片段缺少有效的 sections');
        } else {
          validateSectionsArr(L.split.sections, ln, true);
          var unSplit = FE.layoutHeightUnits(L), usSplit = FE.layoutHeightUnits(L.split);
          if (Math.abs(unSplit - usSplit) > 0.01) {
            warn('布局 “' + ln + '” 常规(' + (Math.round(unSplit * 100) / 100) +
              ') 与分体(' + (Math.round(usSplit * 100) / 100) + ')高度单位不一致');
          }
        }
      }

      /* ---- 文本编辑布局（text_editor）：必须恰好一个 rows 区段、恰好一行 ---- */
      if (ln === 'text_editor') {
        var tSecs = Array.isArray(L.sections) ? L.sections : [];
        var tRowsSecs = tSecs.filter(function (s) { return isPlainObject(s) && s.type === 'rows'; });
        if (tSecs.length !== 1 || tRowsSecs.length !== 1) {
          err('布局 “text_editor” 必须恰好包含一个 rows 区段，当前为 ' + tSecs.length +
            ' 个区段；Foxy 会回退到内置编辑行');
        } else {
          var tRows = FE.rowsOfSection(tRowsSecs[0]);
          if (tRows.length !== 1) {
            err('布局 “text_editor” 的 rows 区段必须恰好包含一行，当前为 ' + tRows.length +
              ' 行；Foxy 会回退到内置编辑行');
          }
        }
      }
    });

    /* 校验一个 sections 数组（常规或分体片段共用） */
    function validateSectionsArr(sections, ln, isSplit) {
      var pfx = '布局 “' + ln + '”' + (isSplit ? ' 分体片段' : '');
      sections.forEach(function (s, si) {
        inCtx({ path: pfx + ' 区段 ' + si, layout: ln, isSplit: !!isSplit, section: si }, function () {
        if (!isPlainObject(s)) { err(pfx + ' 的区段 ' + si + ' 不是对象', { code: 'section-not-object', path: pfx + ' 区段 ' + si, layout: ln, isSplit: !!isSplit, section: si }); return; }
        if (s.type === 'rows') {
          FE.rowsOfSection(s).forEach(function (row, ri) {
            inCtx({ path: pfx + ' 区段 ' + si + ' 行 ' + ri, layout: ln, isSplit: !!isSplit, section: si, row: ri, group: 'rows' }, function () {
            var hasAuto = false, fixedSum = 0;
            row.keys.forEach(function (k) {
              var w = isPlainObject(k) && k.weight != null ? k.weight : 1;
              if (w === 'auto') hasAuto = true; else fixedSum += (Number(w) || 0);
            });
            if (hasAuto && row.totalWeight == null) {
              err(pfx + ' 区段 ' + si + ' 行 ' + ri + ' 使用了 weight:"auto" 但未提供 totalWeight', { code: 'auto-without-totalweight' });
            } else if (hasAuto && row.totalWeight <= fixedSum + 1e-9) {
              err(pfx + ' 区段 ' + si + ' 行 ' + ri + ' 的 totalWeight(' + row.totalWeight + ') 不足以分配 auto 权重', { code: 'totalweight-too-small' });
            }
            row.keys.forEach(function (k, ki) {
              checkPlacement(k, pfx, si, '行 ' + ri + ' 按键 ' + ki, { code: null, path: pfx + ' 区段 ' + si + ' 行 ' + ri + ' 按键 ' + ki, layout: ln, isSplit: !!isSplit, section: si, row: ri, key: ki, group: 'rows' });
            });
            });
          });
        } else if (s.type === 'grid') {
          var cols = s.columns, rws = s.rows;
          if (!Number.isInteger(cols) || cols < 1) err(pfx + ' 区段 ' + si + ' 的 columns 无效', { code: 'bad-grid-columns' });
          if (!Number.isInteger(rws) || rws < 1) err(pfx + ' 区段 ' + si + ' 的 rows 无效', { code: 'bad-grid-rows' });
          if (s.rowHeights != null && !Array.isArray(s.rowHeights)) err(pfx + ' 区段 ' + si + ' 的 rowHeights 必须是数组', { code: 'bad-rowheights' });
          var C = Number.isInteger(cols) ? cols : 1, R = Number.isInteger(rws) ? rws : 1;
          var occ = {};
          (Array.isArray(s.keys) ? s.keys : []).forEach(function (k, ki) {
            var gkey = { path: pfx + ' 区段 ' + si + ' 网格按键 ' + ki, layout: ln, isSplit: !!isSplit, section: si, key: ki, group: 'grid' };
            if (!isPlainObject(k)) { err(pfx + ' 区段 ' + si + ' 网格按键 ' + ki + ' 不是对象', Object.assign({}, gkey, { code: 'key-not-object' })); return; }
            /* 网格坐标：column/row 为正名，col 是文档认可的别名；跨距同理 colSpan/col 别名。
             * 别名缺失会让合法布局被误判为「缺少整数 column/row」。 */
            var c = Number.isInteger(k.column) ? k.column : k.col;
            var r = k.row;
            var csRaw = k.columnSpan != null ? k.columnSpan : k.colSpan;
            var cs = csRaw != null ? csRaw : 1, rs = k.rowSpan != null ? k.rowSpan : 1;
            var label = refNameOf(k);
            if (!Number.isInteger(c) || !Number.isInteger(r)) { err(pfx + ' 网格按键 ' + label + ' 缺少整数 column/row', Object.assign({}, gkey, { code: 'grid-missing-cell' })); }
            else {
              if (cs < 1 || rs < 1) err(pfx + ' 网格按键 ' + label + ' 的跨距必须 ≥1', Object.assign({}, gkey, { code: 'grid-bad-span' }));
              if (c < 0 || r < 0 || c + cs > C || r + rs > R) err(pfx + ' 网格按键 ' + label + ' 超出网格范围', Object.assign({}, gkey, { code: 'grid-out-of-range' }));
              var limC = Math.min(c + cs, C), limR = Math.min(r + rs, R);
              for (var y = Math.max(0, r); y < limR; y++) {
                for (var x = Math.max(0, c); x < limC; x++) {
                  var id = x + ',' + y;
                  if (occ[id] != null) err(pfx + ' 网格按键 ' + label + ' 与 ' + occ[id] + ' 在单元格 (' + id + ') 重叠', Object.assign({}, gkey, { code: 'grid-overlap' }));
                  else occ[id] = label;
                }
              }
            }
            checkPlacement(k, pfx, si, '网格按键 ' + label, gkey);
          });
          if (Number.isInteger(cols) && cols > 0 && Number.isInteger(rws) && rws > 0) {
            var holes = [];
            for (var gy = 0; gy < R; gy++) for (var gx = 0; gx < C; gx++) {
              if (occ[gx + ',' + gy] == null) holes.push('(' + gx + ',' + gy + ')');
            }
            /* 文档只要求网格不重叠、不越界，并未要求铺满；空格子会渲染为留白，
             * 属合法（如异形回车、留白布局）。这里给提示而非错误，避免误报。 */
            if (holes.length) warn(pfx + ' 区段 ' + si + ' 网格有 ' + holes.length + ' 个空单元格（将渲染为留白）: ' + holes.slice(0, 8).join('、') + (holes.length > 8 ? '…' : ''), { code: 'grid-holes' });
          }
        } else {
          err(pfx + ' 区段 ' + si + ' 的 type 必须是 rows 或 grid', { code: 'bad-section-type' });
        }
        });
      });
    }

    function checkPlacement(k, pfx, si, where, kctx) {
      if (!isPlainObject(k)) { err(pfx + ' ' + where + ' 不是对象', Object.assign({}, kctx, { code: 'key-not-object' })); return; }
      var full = pfx + ' ' + where;
      /* 该按键内的所有问题都带上 kctx（区段/行/键坐标），供 UI 跳转定位 */
      inCtx(kctx, function () {
      if (k.ref != null && typeof k.ref !== 'string') err(full + ' 的 ref 必须是字符串', { code: 'bad-ref-type' });
      else if (typeof k.ref === 'string' && k.ref && !lookupDef(k.ref, scope)) err(full + ' 的 ref 无法解析: ' + k.ref, { code: 'unresolved-ref' });
      var ev = FE.evalPlacement(k, NEUTRAL_STATUS, scope);
      if (ev.unresolved) err(full + ' 引用链无法解析: ' + ev.unresolved, { code: 'unresolved-ref' });
      if (ev.cycle) err(full + ' 引用链存在循环: ' + ev.cycle, { code: 'ref-cycle' });
      if (ev.eff.tap == null) err(full + '（' + refNameOf(k) + '）解析后缺少点击动作 tap', { code: 'no-tap' });
      if (ev.eff.hold != null && ev.eff.longPress != null) err(full + '（' + refNameOf(k) + '）同时定义了 hold 与 longPress', { code: 'hold-longpress' });
      checkGestureRefs(k, full, err, profile, scope);
      if (Array.isArray(k.variants)) k.variants.forEach(function (v, vi) {
        if (!isPlainObject(v)) { err(full + ' 的变体 ' + vi + ' 不是对象', { code: 'variant-not-object' }); return; }
        if (typeof v.ref === 'string' && !lookupDef(v.ref, scope)) err(full + ' 变体 ' + vi + ' 的 ref 无法解析: ' + v.ref, { code: 'unresolved-ref' });
        checkGestureRefs(v, full + ' 变体 ' + vi, err, profile, scope);
      });
      if (isPlainObject(k.override)) {
        checkGestureRefs(k.override, full + ' override', err, profile, scope);
        if (Array.isArray(k.override.variants)) k.override.variants.forEach(function (v, vi) {
          if (!isPlainObject(v)) { err(full + ' override 变体 ' + vi + ' 不是对象', { code: 'variant-not-object' }); return; }
          if (typeof v.ref === 'string' && !lookupDef(v.ref, scope)) err(full + ' override 变体 ' + vi + ' 的 ref 无法解析: ' + v.ref, { code: 'unresolved-ref' });
          checkGestureRefs(v, full + ' override 变体 ' + vi, err, profile, scope);
        });
      }
      /* 三个布尔状态共 8 种组合，逐一验证最终引用、tap 与手势冲突。 */
      for (var mask = 0; mask < 8; mask++) {
        var st = { composing: !!(mask & 1), ascii_mode: !!(mask & 2), disabled: !!(mask & 4) };
        var sev = FE.evalPlacement(k, st, scope);
        var suffix = '（状态 composing=' + st.composing + ', ascii_mode=' + st.ascii_mode + ', disabled=' + st.disabled + '）';
        if (sev.unresolved) err(full + suffix + ' 引用链无法解析: ' + sev.unresolved, { code: 'unresolved-ref', state: st });
        if (sev.cycle) err(full + suffix + ' 引用链存在循环: ' + sev.cycle, { code: 'ref-cycle', state: st });
        if (sev.eff.tap == null) err(full + suffix + ' 解析后缺少点击动作 tap', { code: 'no-tap', state: st });
        if (sev.eff.hold != null && sev.eff.longPress != null) err(full + suffix + ' 同时定义了 hold 与 longPress', { code: 'hold-longpress', state: st });
      }
      });
    }

    /* ---- 顶层动作 ---- */
    var topActions = isPlainObject(profile.actions) ? profile.actions : {};
    Object.keys(topActions).forEach(function (an) { validateAction(topActions[an], '动作 “' + an + '”', err, profile); });

    /* ---- 高度单位兼容性 ---- */
    if (layoutNames.length > 1) {
      var unitsArr = layoutNames.map(function (ln) { return FE.layoutHeightUnits(profile.layouts[ln]); });
      var mn = Math.min.apply(null, unitsArr), mx = Math.max.apply(null, unitsArr);
      if (mx - mn > 0.01) {
        warn('各布局总高度单位不一致（切换时键盘高度会变化）：' +
          layoutNames.map(function (ln, i) { return ln + '=' + (Math.round(unitsArr[i] * 100) / 100); }).join('、'));
      }
    }

    /* ---- 宏 ---- */
    var macros = isPlainObject(profile.macros) ? profile.macros : {};
    for (var mn2 in macros) {
      if (!Object.prototype.hasOwnProperty.call(macros, mn2)) continue;
      if (!Array.isArray(macros[mn2])) { err('宏 “' + mn2 + '” 必须是数组'); continue; }
      macros[mn2].forEach(function (step, i) {
        var where = '宏 “' + mn2 + '” 步骤 ' + i;
        var target = isPlainObject(step) && typeof step.action === 'string' ? step.action : (typeof step === 'string' ? step : null);
        if (target) {
          if (!(isPlainObject(profile.actions) && profile.actions[target])) err(where + ' 引用动作名不存在: ' + target);
        } else if (isPlainObject(step) && isPlainObject(step.action)) {
          validateAction(step.action, where + '.action', err, profile);
        } else if (isPlainObject(step) && step.type != null) {
          validateAction(step, where, err, profile);
        } else {
          err(where + ' 结构无效');
        }
      });
    }
  }
  /* errors/warnings 保持字符串数组（历史 API 与既有断言不变）；
   * issues 为等长的结构化版本，带 code 与区段/行/键坐标，供 UI 跳转定位。 */
  return { errors: errors, warnings: warnings, issues: issues };
};

/* ================================================================
 * 六、profile 归一化与序列化
 * ================================================================ */
FE.normalizeProfile = function (p) {
  if (!isPlainObject(p)) p = {};
  if (!isPlainObject(p.keys)) p.keys = {};
  if (!isPlainObject(p.layouts)) p.layouts = {};
  if (!isPlainObject(p.actions)) p.actions = {};
  if (!isPlainObject(p.macros)) p.macros = {};
  return p;
};

FE.serializeProfile = function (p, includeType) {
  var out = deepClone(p);
  if (includeType !== false && out.type == null) out.type = 'foxy.keyboard-layout';
  if (includeType === false) delete out.type;
  /* 把 type 移到最前，author 随后 */
  var ordered = {};
  if (out.type != null) ordered.type = out.type;
  if (out.author != null) ordered.author = out.author;
  for (var k in out) {
    if (k === 'type' || k === 'author') continue;
    if (Object.prototype.hasOwnProperty.call(out, k)) ordered[k] = out[k];
  }
  return JSON.stringify(ordered, null, 2);
};

/* ---------------- 宽松 JSON 诊断与修复 ----------------
 * 手工编辑的布局文件常见问题：UTF-8 BOM、多余尾逗号、注释、单引号字符串、
 * 未加引号的键名、全角标点。inspectJsonText 报告问题（类型/次数/行号/字符位置）
 * 并给出修复后的文本；sanitizeJsonText 是其简化封装，只返回修复后的文本。
 * 扫描是"字符串感知"的：字符串内部的内容一律原样保留。 */
var FULLWIDTH_MAP = {
  '\uFF0C': ',',  /* ， */
  '\uFF1A': ':',  /* ： */
  '\uFF1B': ';',  /* ； */
  '\u201C': '"',  /* “ */
  '\u201D': '"',  /* ” */
  '\u2018': '"',  /* ‘ */
  '\u2019': '"',  /* ’ */
  '\uFF3B': '[',  /* ［ */
  '\uFF3D': ']',  /* ］ */
  '\uFF5B': '{',  /* ｛ */
  '\uFF5D': '}',  /* ｝ */
  '\u3000': ' '   /* 全角空格 */
};

FE.inspectJsonText = function (text) {
  var original = String(text);
  var src = original;
  var bomOffset = 0;
  var bomFound = src.charCodeAt(0) === 0xFEFF;
  if (bomFound) { src = src.slice(1); bomOffset = 1; }
  var n = src.length, i = 0, line = 1;
  var out = [];
  var found = { trailingComma: [], lineComment: [], blockComment: [], singleQuote: [], unquotedKey: [], fullwidth: [] };
  function record(kind, pos) { found[kind].push({ line: line, pos: pos + bomOffset }); }

  while (i < n) {
    var c = src.charAt(i);

    if (c === '\n') { line++; out.push(c); i++; continue; }

    /* 双引号字符串（顺带把全角引号规范化为双引号）
     * 规则：ASCII " 开启的字符串只由 ASCII " 闭合，内部的全角引号视为内容保留；
     *       全角引号开启的字符串由全角引号或 ASCII " 闭合。 */
    if (c === '"' || c === '\u201C' || c === '\u201D') {
      var openedAscii = (c === '"');
      if (!openedAscii) record('fullwidth', i);
      out.push('"');
      i++;
      while (i < n) {
        var d = src.charAt(i);
        if (d === '\\') {
          out.push(d);
          var nx = src.charAt(i + 1);
          if (nx) { out.push(nx); if (nx === '\n') line++; i += 2; } else i++;
          continue;
        }
        if (d === '\n') { line++; out.push(d); i++; continue; }
        if (openedAscii ? (d === '"') : (d === '"' || d === '\u201C' || d === '\u201D')) {
          if (!openedAscii && d !== '"') record('fullwidth', i);
          out.push('"');
          i++;
          break;
        }
        out.push(d); i++;
      }
      continue;
    }

    /* 单引号字符串 → 双引号（同上规则） */
    if (c === "'" || c === '\u2018' || c === '\u2019') {
      var singleAscii = (c === "'");
      record('singleQuote', i);
      if (!singleAscii) record('fullwidth', i);
      i++;
      var buf = '';
      while (i < n) {
        var d2 = src.charAt(i);
        if (d2 === '\\') {
          var e2 = src.charAt(i + 1);
          if (e2 === "'" || e2 === '\u2018' || e2 === '\u2019') { buf += "'"; i += 2; continue; }
          if (e2 === '"') { buf += '\\"'; i += 2; continue; }
          if (e2 === '\\') { buf += '\\\\'; i += 2; continue; }
          if (e2 === 'n') { buf += '\\n'; i += 2; continue; }
          if (e2 === 't') { buf += '\\t'; i += 2; continue; }
          if (e2 === 'r') { buf += '\\r'; i += 2; continue; }
          buf += '\\' + (e2 || ''); i += 2; continue;
        }
        if (d2 === '"') { buf += '\\"'; i++; continue; }
        if (d2 === '\n') line++;
        if (singleAscii ? (d2 === "'") : (d2 === "'" || d2 === '\u2018' || d2 === '\u2019')) { i++; break; }
        buf += d2; i++;
      }
      out.push('"' + buf + '"');
      continue;
    }

    /* 注释 */
    if (c === '/' && src.charAt(i + 1) === '/') {
      record('lineComment', i);
      while (i < n && src.charAt(i) !== '\n') i++;
      continue;
    }
    if (c === '/' && src.charAt(i + 1) === '*') {
      record('blockComment', i);
      i += 2;
      var keptNewline = false;
      while (i < n && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) {
        if (src.charAt(i) === '\n') { line++; out.push('\n'); keptNewline = true; } /* 保留换行以维持行号 */
        i++;
      }
      i += 2;
      /* 单行块注释至少留下空白，防止相邻 token 被静默拼接。 */
      if (!keptNewline) out.push(' ');
      continue;
    }

    /* } / ] 前的多余尾逗号 */
    if (c === ',') {
      var j = i + 1;
      while (j < n && /\s/.test(src.charAt(j))) j++;
      if (j < n && (src.charAt(j) === '}' || src.charAt(j) === ']')) {
        record('trailingComma', i);
        i++;
        continue;
      }
      out.push(c); i++; continue;
    }

    /* 全角结构标点（全角逗号同样参与尾逗号判定） */
    if (FULLWIDTH_MAP[c] != null) {
      if (FULLWIDTH_MAP[c] === ',') {
        var mj = i + 1;
        while (mj < n && /\s/.test(src.charAt(mj))) mj++;
        if (mj < n && (src.charAt(mj) === '}' || src.charAt(mj) === ']')) {
          record('fullwidth', i);
          record('trailingComma', i);
          i++;
          continue;
        }
      }
      record('fullwidth', i);
      out.push(FULLWIDTH_MAP[c]);
      i++;
      continue;
    }

    /* 未加引号的键名（identifier 后跟冒号） */
    if (/[A-Za-z_$]/.test(c)) {
      var k = i;
      while (k < n && /[A-Za-z0-9_$]/.test(src.charAt(k))) k++;
      var m = k;
      while (m < n && /\s/.test(src.charAt(m))) m++;
      if (src.charAt(m) === ':') {
        record('unquotedKey', i);
        out.push('"' + src.slice(i, k) + '"');
        i = k;
        continue;
      }
    }

    out.push(c); i++;
  }

  var issues = [];
  if (bomFound) {
    issues.push({ kind: 'bom', label: '文件开头的 UTF-8 BOM 字符', count: 1, lines: [1], positions: [0], fixable: true });
  }
  [
    ['trailingComma', '多余尾逗号（对象/数组最后一项之后）'],
    ['lineComment', '行注释 //（JSON 不支持）'],
    ['blockComment', '块注释 /* */（JSON 不支持）'],
    ['singleQuote', '单引号字符串（JSON 只接受双引号）'],
    ['unquotedKey', '未加引号的键名'],
    ['fullwidth', '全角标点/引号（，： “” 等）']
  ].forEach(function (pair) {
    var arr = found[pair[0]];
    if (!arr.length) return;
    issues.push({
      kind: pair[0], label: pair[1], count: arr.length,
      lines: arr.map(function (x) { return x.line; }),
      positions: arr.map(function (x) { return x.pos; }),
      fixable: true
    });
  });

  var fixedText = out.join('');
  var total = issues.reduce(function (a, b) { return a + b.count; }, 0);
  var report = {
    issues: issues,
    total: total,
    fixedText: fixedText,
    changed: fixedText !== original,
    parseOk: false,
    parseError: null
  };
  try { JSON.parse(fixedText); report.parseOk = true; }
  catch (e) { report.parseError = e.message; }
  return report;
};

/* 宽松 JSON 文本清理（仅返回修复后的文本） */
FE.sanitizeJsonText = function (text) {
  return FE.inspectJsonText(text).fixedText;
};

/* 按方向的提示字号查找：方向名大小写不敏感（Foxy 文档：Direction names are case-insensitive）。
 * 放在 UI 段之前导出，纯逻辑测试（无 DOM）也能直接断言。 */
function hintSizeOf(hts, dir) {
  if (typeof hts === 'number') return hts;
  if (!isPlainObject(hts)) return null;
  if (typeof hts[dir] === 'number') return hts[dir];
  for (var hk in hts) {
    if (!Object.prototype.hasOwnProperty.call(hts, hk)) continue;
    if (hk.toLowerCase() === dir && typeof hts[hk] === 'number') return hts[hk];
  }
  return null;
}
FE.hintSizeOf = hintSizeOf;

/* ================================================================
 * 四之二、布局编译（纯数据中间层）
 * ================================================================ */
/* 把 profile + 布局名 + 状态编译成纯数据快照。渲染器与编辑器都消费这份快照，因此：
 *   1. 每个键的引用解析/手势解析只做一次——此前预览、chip、网格单元格各自 evalPlacement
 *      一遍，大布局每次重渲染要重复解析数百次；
 *   2. 渲染只读编译产物，不再逐处解析（tooltip/标签/提示都在编译期算好）。
 * 本函数不产生任何 DOM，可在 Node 中直接断言。
 * 入口：FE.compileSections(sections, status, scope) 与 FE.compileLayout(profile, name, opts)。 */
function compileKeyItem(placement, loc, status, scope) {
  var ev = FE.evalPlacement(placement, status, scope);
  var eff = ev.eff;
  var item = {
    placement: placement, eff: eff,
    chain: ev.chain, unresolved: ev.unresolved, cycle: ev.cycle,
    s: loc.s, r: loc.r, k: loc.k, group: loc.group,
    ref: (isPlainObject(placement) && typeof placement.ref === 'string') ? placement.ref : null,
    /* 宽度权重：放置位直接字段优先于解析结果 */
    weight: (isPlainObject(placement) && placement.weight != null) ? placement.weight
      : (eff.weight != null ? eff.weight : 1),
    height: (typeof eff.height === 'number' && eff.height > 0) ? eff.height : 1,
    keyType: eff.keyType || null,
    icon: eff.icon || null,
    modifier: eff.modifier || null,
    spacer: !!eff.spacer,
    isBroken: !!(ev.unresolved || ev.cycle),
    isStatusLabel: eff.statusLabel != null,
    hints: {},        /* 四向滑动提示：{ text, display, label } */
    summaries: {}     /* 手势动作摘要：{ display, label, popupKey? } */
  };
  /* 主标签原始值（未应用 Shift）；渲染时按状态决定最终显示 */
  item.label = rawLabelOf(eff, status, 0, scope);
  item.shiftedLabel = (typeof eff.shiftedLabel === 'string') ? eff.shiftedLabel : null;

  function summarize(g) {
    var gi = FE.gestureInfo(g, status, 0, scope);
    if (!gi) return null;
    return {
      display: gi.action ? gi.action.display : '',
      label: (gi.label != null && String(gi.label) !== '') ? String(gi.label) : null,
      popupKey: gi.popupKey != null ? String(gi.popupKey) : null
    };
  }

  item.summaries.tap = summarize(eff.tap);
  /* 与旧 tooltip 行为一致：手势存在就给摘要行（即使动作未能解析） */
  ['doubleTap', 'longPress', 'hold'].forEach(function (f) {
    if (eff[f] == null) return;
    item.summaries[f] = summarize(eff[f]) || { display: '', label: null, popupKey: null };
  });
  /* 四向滑动提示：文字优先级 hint > label（hint 显式 null 视为清空，不回退） */
  if (isPlainObject(eff.swipe)) {
    FE.SWIPE_DIRS.forEach(function (d) {
      var g = eff.swipe[d];
      if (g == null) return;
      var gi = FE.gestureInfo(g, status, 0, scope);
      var txt = '';
      if (gi) {
        if (gi.hint !== undefined) txt = String(gi.hint);
        else if (gi.label != null) txt = String(gi.label);
      }
      if (!txt) return;
      item.hints[d] = {
        text: txt,
        display: gi && gi.action ? gi.action.display : '',
        label: (gi && gi.label != null && String(gi.label) !== '') ? String(gi.label) : null
      };
    });
  }
  /* 徽标标签：长按（蓝）、按住（橙） */
  if (item.summaries.longPress && item.summaries.longPress.label) item.lpLabel = item.summaries.longPress.label;
  if (item.summaries.hold && item.summaries.hold.label) item.holdLabel = item.summaries.hold.label;
  /* 长按弹出菜单键（键下方 ⌄ 徽标） */
  if (isPlainObject(eff.longPress) && eff.longPress.popupKey != null && eff.longPress.popupKey !== '') {
    item.popupKey = String(eff.longPress.popupKey);
  }
  return item;
}

/* 编译一个 sections 数组（常规布局、split 片段、编辑器当前区段共用同一实现）。
 * 返回 { sections, totalUnits }，键项带 s/k 坐标，与源数组索引一一对应。 */
FE.compileSections = function (sections, status, scope) {
  status = status || NEUTRAL_STATUS;
  var out = { sections: [], totalUnits: 0 };
  (Array.isArray(sections) ? sections : []).forEach(function (s, si) {
    /* 非法/未知区段压入占位项：保持 sections[i] 与源码索引对齐，
     * 区段编辑器与「点击错误定位」都依赖这个对应关系。 */
    if (!isPlainObject(s)) { out.sections.push({ type: null, sectionIndex: si, invalid: true }); return; }
    if (s.type === 'rows') {
      var rows = [], total = 0;
      FE.rowsOfSection(s).forEach(function (row, ri) {
        var weights = FE.rowWeights(row);
        var maxKH = 1;
        row.keys.forEach(function (kk) {
          var kh = isPlainObject(kk) && typeof kk.height === 'number' && kk.height > 0 ? kk.height : 1;
          if (kh > maxKH) maxKH = kh;
        });
        var items = row.keys.map(function (kk, ki) {
          var it = compileKeyItem(kk, { s: si, r: ri, k: ki, group: 'rows' }, status, scope);
          it.grow = Number(weights[ki]) || 0;
          it.maxKeyHeight = maxKH;
          return it;
        });
        rows.push({ heightUnits: row.heightUnits, width: row.width, totalWeight: row.totalWeight, keys: items, rowIndex: ri });
        total += row.heightUnits;
      });
      out.sections.push({ type: 'rows', sectionIndex: si, rows: rows, heightUnits: total, keys: null });
      out.totalUnits += total;
    } else if (s.type === 'grid') {
      var dims = FE.gridDims(s);
      var gUnits = (dims.rowHeights && dims.rowHeights.length)
        ? dims.rowHeights.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) : 5;
      /* 用 map 而非 push：保留与源 keys 数组一致的索引（含 null 占位），
       * 编辑器与定位功能都依赖 items[i] 与 section.keys[i] 一一对应。 */
      var gItems = (Array.isArray(s.keys) ? s.keys : []).map(function (kk, gi) {
        if (!isPlainObject(kk)) return null;
        var it = compileKeyItem(kk, { s: si, r: null, k: gi, group: 'grid' }, status, scope);
        it.column = Number.isInteger(kk.column) ? kk.column : (Number.isInteger(kk.col) ? kk.col : 0);
        it.row = Number.isInteger(kk.row) ? kk.row : 0;
        var csP = kk.columnSpan != null ? kk.columnSpan : kk.colSpan;
        it.columnSpan = csP != null ? csP : 1;
        it.rowSpan = kk.rowSpan != null ? kk.rowSpan : 1;
        return it;
      });
      out.sections.push({
        type: 'grid', sectionIndex: si, columns: dims.columns, rows: dims.rows,
        rowHeights: dims.rowHeights, totalUnits: gUnits, keys: gItems
      });
      out.totalUnits += gUnits;
    } else {
      out.sections.push({ type: null, sectionIndex: si, invalid: true });
    }
  });
  return out;
};

FE.compileLayout = function (profile, layoutName, opts) {
  opts = opts || {};
  var status = opts.status || NEUTRAL_STATUS;
  var scope = opts.scope || scopeFrom(profile);
  var out = {
    ok: true, layoutName: layoutName, resolvedName: layoutName, split: !!opts.split,
    status: status, sections: [], totalUnits: 0, hasSplit: false, issues: []
  };
  if (!isPlainObject(profile) || !isPlainObject(profile.layouts)) {
    out.ok = false; out.issues.push({ code: 'missing-layout', message: '配置没有 layouts' });
    return out;
  }
  /* 布局级状态变体先解析，再决定取常规片段还是 split 片段。
   * opts.noVariants：不解析变体，编译 layoutName 本身——区段编辑器编辑的是当前布局的
   * sections 数组，若这里跟着变体跳到别的布局，键索引会与编辑目标错位。 */
  var resolvedName = opts.noVariants ? layoutName : FE.resolvePreviewLayout(profile, layoutName, status);
  out.resolvedName = resolvedName;
  var L = profile.layouts[resolvedName] || profile.layouts[layoutName];
  if (!isPlainObject(L)) {
    out.ok = false; out.issues.push({ code: 'missing-layout', message: '找不到布局 ' + layoutName });
    return out;
  }
  out.hasSplit = isPlainObject(L.split);
  var frag = L;
  if (opts.split) {
    if (!out.hasSplit) {
      out.ok = false; out.issues.push({ code: 'no-split', message: '该布局没有 split 片段' });
      return out;
    }
    frag = L.split;
  }
  out.fragment = frag;
  var compiled = FE.compileSections(frag.sections, status, scope);
  out.sections = compiled.sections;
  out.totalUnits = compiled.totalUnits;
  return out;
};

/* 遍历编译结果中的所有键项（渲染/统计/检查器共用同一份产物） */
FE.eachCompiledKey = function (compiled, cb) {
  (compiled && compiled.sections ? compiled.sections : []).forEach(function (sec) {
    if (sec.type === 'rows') {
      sec.rows.forEach(function (row) { row.keys.forEach(function (k) { cb(k, sec, row); }); });
    } else if (sec.type === 'grid') {
      (sec.keys || []).forEach(function (k) { cb(k, sec, null); });
    }
  });
};

/* ================================================================
 * ================================================================
 *  UI 部分（浏览器）
 * ================================================================
 * ================================================================ */
if (typeof document === 'undefined' || typeof window === 'undefined' ||
    !document.getElementById('preview-kb')) {
  return;
}

var LS_KEY = 'foxy-layout-editor-draft-v1';
var $ = function (id) { return document.getElementById(id); };

/* ---------------- DOM 构建辅助 ---------------- */
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) {
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      /* null/undefined/false 均跳过：布尔属性（selected 等）设为 "false" 仍视为存在 */
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && isPlainObject(v)) Object.assign(el.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
  }
  for (var i = 2; i < arguments.length; i++) {
    appendKids(el, arguments[i]);
  }
  return el;
}
function appendKids(el, kid) {
  if (kid == null || kid === false) return;
  if (Array.isArray(kid)) { kid.forEach(function (x) { appendKids(el, x); }); return; }
  if (kid.nodeType) el.appendChild(kid);
  else el.appendChild(document.createTextNode(String(kid)));
}
function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/* ---------------- 历史与变更 ---------------- */
function snapshot() {
  return JSON.stringify({ layout: state.profile, popup: state.popupProfile || null });
}
function pushHistory() {
  state.history.push(snapshot());
  if (state.history.length > 100) state.history.shift();
  state.future = [];
}
function mutate(fn) {
  pushHistory();
  fn();
  afterChange();
}
function restoreSnapshot(s) {
  var o;
  try { o = JSON.parse(s); } catch (e) { return false; }
  state.profile = FE.normalizeProfile(o.layout || {});
  state.popupProfile = o.popup != null ? o.popup : null;
  if (state.popupProfile != null && FE.normalizePopupProfile) {
    state.popupProfile = FE.normalizePopupProfile(state.popupProfile);
  }
  state.jsonDirty = false;
  var names = Object.keys(state.profile.layouts);
  if (!state.profile.layouts[state.layoutName]) {
    state.layoutName = state.profile.layouts['default'] ? 'default' : (names[0] || null);
  }
  if (state.popupProfile && !state.popupProfile.schemas[state.popupSchema]) state.popupSchema = 'default';
  state.sel = null;
  afterChange();
  return true;
}
function undo() {
  if (!state.history.length) return;
  state.future.push(snapshot());
  restoreSnapshot(state.history.pop());
}
function redo() {
  if (!state.future.length) return;
  state.history.push(snapshot());
  restoreSnapshot(state.future.pop());
}
function afterChange() {
  state.validation = FE.validateProfile(state.profile);
  autosave();
  renderAll();
}
FE.mutate = mutate;
FE.afterChange = afterChange;
FE.renderAll = function () { renderAll(); };

function autosave() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      profile: state.profile, layoutName: state.layoutName, fileName: state.fileName,
      popupProfile: state.popupProfile || null, popupFileName: state.popupFileName,
      splitMode: state.splitMode, includeType: state.includeType
    }));
  } catch (e) { /* 忽略存储失败 */ }
}

function applyProfileText(text, opts) {
  opts = opts || {};
  var p;
  try { p = JSON.parse(FE.sanitizeJsonText(text)); } catch (e) {
    state.lastParseError = e.message;
    setOpStatus('JSON 解析失败: ' + e.message + '（已自动清理 BOM 与多余尾逗号后仍无法解析，请检查语法）', 'error');
    return false;
  }
  if (!isPlainObject(p)) {
    state.lastParseError = '配置根节点必须是 JSON 对象';
    setOpStatus(state.lastParseError, 'error');
    return false;
  }
  p = FE.normalizeProfile(p);
  state.profile = p;
  /* 单文件导入 / 示例 / JSON 页应用：均为「自包含单文件」语义，
   * 清掉文件夹导入上下文与补全提示，避免导出时按旧包剥离定义而错拆、提示残留。 */
  state.folderPlan = null;
  state.folderDefs = null;
  state.folderLayoutPath = null;
  state.folderHint = null;
  state.jsonDirty = false;
  var names = Object.keys(p.layouts);
  state.layoutName = (opts.layoutName && p.layouts[opts.layoutName]) ? opts.layoutName
    : (p.layouts[state.layoutName] ? state.layoutName : null);
  if (!state.layoutName) state.layoutName = p.layouts['default'] ? 'default' : (names[0] || null);
  state.sel = null;
  if (!opts.keepHistory) { state.history = []; state.future = []; }
  afterChange();
  return true;
}
FE.applyProfileText = applyProfileText;

function setOpStatus(msg, kind) {
  var el = $('op-status');
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}

function setJsonStatus(msg, kind) {
  var el = $('json-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}

/* ---------------- JSON 问题提醒 / 一键修复 ---------------- */
function issueLineText(it) {
  if (!it.lines || !it.lines.length) return '';
  var shown = it.lines.slice(0, 6);
  var txt = shown.join('、');
  if (it.lines.length > shown.length) txt += ' 等';
  return '（第 ' + txt + ' 行）';
}

function formatIssueList(issues) {
  return issues.map(function (it) {
    return it.label + ' ×' + it.count + issueLineText(it);
  }).join('；');
}

/* 渲染问题面板：notice 非空时显示一条结果提示 */
function renderJsonIssues(report, notice) {
  var host = $('json-issues');
  if (!host) return;
  clearEl(host);
  if (notice) {
    host.className = 'json-issues ok';
    host.append('✓ ' + notice);
    return;
  }
  if (!report) { host.className = 'json-issues'; return; }
  if (!report.issues.length) {
    if (report.parseOk) {
      host.className = 'json-issues ok';
      host.append('✓ JSON 语法检查通过，未发现可修复问题');
    } else {
      host.className = 'json-issues error';
      host.append('✗ JSON 无法解析: ' + (report.parseError || '未知错误') + '（未发现可自动修复的问题，请检查括号/引号是否配对）');
    }
    return;
  }
  host.className = 'json-issues warn';
  host.appendChild(h('div', null, '⚠ 检测到 ' + report.total + ' 处可修复问题：' + formatIssueList(report.issues)));
  if (!report.parseOk) {
    host.appendChild(h('div', { class: 'st-error' }, '修复这些问题后仍无法解析：' + (report.parseError || '')));
  }
  var actions = h('div', { class: 'json-issues-actions' });
  actions.appendChild(h('button', {
    class: 'mini-button primary',
    onclick: function () { fixJsonText(true); }
  }, '一键修复并应用'));
  actions.appendChild(h('button', {
    class: 'mini-button',
    onclick: function () { fixJsonText(false); }
  }, '仅修复文本'));
  var first = report.issues[0];
  if (first && first.positions && first.positions.length) {
    actions.appendChild(h('button', {
      class: 'mini-button',
      onclick: function () { locateJsonIssue(first.positions[0]); }
    }, '定位到第 ' + first.lines[0] + ' 行'));
  }
  host.appendChild(actions);
}

/* 把光标跳到指定字符位置（并粗略滚动到可见处）；taEl 省略时作用于 JSON 主编辑区 */
function locateJsonIssue(pos, taEl) {
  var ta = taEl || $('json-editor');
  if (!ta) return;
  var text = String(ta.value);
  var start = Math.max(0, pos - 40);
  var end = Math.min(text.length, pos + 40);
  if (typeof ta.focus === 'function') ta.focus();
  if (typeof ta.setSelectionRange === 'function') {
    try { ta.setSelectionRange(start, end); } catch (e) { /* 忽略 */ }
  }
  var lineNo = text.slice(0, pos).split('\n').length;
  if (typeof ta.scrollTop === 'number' || ta.scrollTop === undefined) {
    try { ta.scrollTop = Math.max(0, (lineNo - 3) * 18); } catch (e2) { /* 忽略 */ }
  }
}

/* ================================================================
 * 通用 JSON 片段编辑器：编辑 + 实时体检 + 一键修复
 * 动作（actions）/ 宏（macros）/ 按键"原始 JSON"三处共用，行为与主 JSON 页一致。
 * opts: { value, rows, placeholder, onApply(value|null, report), applyOnBlur, applyAfterFix }
 * 返回 { el, getValue(), check(), fix(), apply() }
 * ================================================================ */
FE.buildJsonSnippetEditor = function (opts) {
  opts = opts || {};
  var ta = h('textarea', { class: 'json-editor small', rows: opts.rows || 4, spellcheck: 'false' });
  ta.value = opts.value != null ? String(opts.value) : '';
  if (opts.placeholder) ta.setAttribute('placeholder', opts.placeholder);
  var notice = h('div', { class: 'json-issues small' });
  var status = h('div', { class: 'status' });
  var root = h('div', { class: 'snippet-editor' }, ta, notice, status);
  var timer = null;
  var api = { el: root };

  function analyze() {
    var text = String(ta.value);
    if (text.trim() === '') return { report: null, value: null, error: null, empty: true };
    var report = FE.inspectJsonText(text);
    var value = null, error = null;
    if (report.parseOk) {
      try { value = JSON.parse(report.fixedText); } catch (e) { error = e.message; }
    } else error = report.parseError;
    return { report: report, value: value, error: error, empty: false };
  }

  function render(a) {
    clearEl(notice);
    if (a.empty) {
      notice.className = 'json-issues small';
      status.className = 'status';
      status.textContent = '';
      return;
    }
    if (a.report.issues.length) {
      notice.className = 'json-issues small warn';
      notice.appendChild(h('div', null, '⚠ ' + a.report.total + ' 处可修复问题：' + formatIssueList(a.report.issues)));
      if (!a.report.parseOk) {
        notice.appendChild(h('div', { class: 'st-error' }, '修复后仍无法解析：' + (a.report.parseError || '')));
      }
      var actions = h('div', { class: 'json-issues-actions' });
      actions.appendChild(h('button', {
        type: 'button', class: 'mini-button primary',
        onclick: function () { api.fix(); }
      }, '一键修复'));
      var first = a.report.issues[0];
      if (first.positions && first.positions.length) {
        actions.appendChild(h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () { locateJsonIssue(first.positions[0], ta); }
        }, '定位到第 ' + first.lines[0] + ' 行'));
      }
      notice.appendChild(actions);
      status.className = 'status warn';
      status.textContent = a.report.parseOk ? '可一键修复' : '修复后仍无法解析';
    } else if (a.error) {
      notice.className = 'json-issues small error';
      notice.append('✗ JSON 无法解析: ' + a.error + '（未发现可自动修复的问题）');
      status.className = 'status error';
      status.textContent = 'JSON 无效';
    } else {
      notice.className = 'json-issues small ok';
      notice.append('✓ JSON 语法检查通过');
      status.className = 'status';
      status.textContent = '';
    }
  }

  api.getValue = function () { return ta.value; };
  api.check = function () { var a = analyze(); render(a); return a; };

  api.fix = function () {
    var a = analyze();
    if (!a.report || !a.report.issues.length) return false;
    var n = a.report.total, summary = formatIssueList(a.report.issues);
    ta.value = a.report.fixedText;
    var after = analyze();
    render(after);
    if (after.error) {
      status.className = 'status error';
      status.textContent = '已修复 ' + n + ' 处问题，但仍无法解析: ' + after.error;
      return false;
    }
    status.className = 'status ok';
    status.textContent = '已修复 ' + n + ' 处问题：' + summary;
    if (opts.applyAfterFix === true) api.apply();
    return true;
  };

  api.apply = function () {
    var a = analyze();
    if (a.empty) {
      if (opts.onApply) opts.onApply(null, null);
      status.className = 'status warn';
      status.textContent = '内容为空（该项将被删除）';
      return true;
    }
    if (a.error) {
      render(a);
      status.className = 'status error';
      status.textContent = 'JSON 无效: ' + a.error +
        (a.report && a.report.total ? '（可点击「一键修复」）' : '');
      return false;
    }
    if (opts.onApply) opts.onApply(a.value, a.report);
    render(a);
    status.className = 'status ok';
    status.textContent = a.report.total ? ('已应用（自动修复 ' + a.report.total + ' 处问题）') : '已应用';
    return true;
  };

  ta.addEventListener('input', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; render(analyze()); }, 250);
  });
  if (opts.applyOnBlur !== false) {
    ta.addEventListener('blur', function () { api.apply(); });
  }
  api.check();
  return api;
};

/* 检查 JSON 编辑区内容并刷新问题面板 */
function checkJsonText() {
  var ta = $('json-editor');
  if (!ta) return null;
  var report = FE.inspectJsonText(ta.value);
  renderJsonIssues(report);
  return report;
}
FE.checkJsonText = function () { return checkJsonText(); };

/* 一键修复：applyAfter=true 时修复后直接应用 */
function fixJsonText(applyAfter) {
  var ta = $('json-editor');
  if (!ta) return;
  var rep = FE.inspectJsonText(ta.value);
  if (!rep.issues.length) {
    setJsonStatus(rep.parseOk ? '没有检测到需要修复的问题' : ('无法自动修复：' + (rep.parseError || '')), rep.parseOk ? 'ok' : 'error');
    renderJsonIssues(rep);
    return;
  }
  var n = rep.total;
  var summary = formatIssueList(rep.issues);
  state.jsonDirty = true;
  ta.value = rep.fixedText;
  var after = FE.inspectJsonText(ta.value);
  if (applyAfter) {
    if (applyProfileText(ta.value)) {
      state.jsonDirty = false;
      setOpStatus('已修复 ' + n + ' 处 JSON 问题并应用', 'ok');
      setJsonStatus('✓ 已修复 ' + n + ' 处问题并应用', 'ok');
      renderJsonIssues(FE.inspectJsonText(ta.value), '已修复 ' + n + ' 处问题并应用：' + summary);
    } else {
      setJsonStatus('已修复 ' + n + ' 处问题，但仍无法解析: ' + (state.lastParseError || ''), 'error');
      renderJsonIssues(FE.inspectJsonText(ta.value));
    }
  } else {
    if (!after.parseOk) {
      /* 修完了却还解析不了：必须明确告知，而不是给个"已修复"的假绿灯 */
      renderJsonIssues(after);
      if (after.issues.length) setJsonStatus('已修复 ' + n + ' 处问题，但仍有 ' + after.total + ' 处可修复问题', 'warn');
      else setJsonStatus('已修复 ' + n + ' 处问题，但仍无法解析: ' + (after.parseError || ''), 'error');
    } else {
      setJsonStatus('已修复 ' + n + ' 处问题（尚未应用，点击「应用」后生效）', 'ok');
      renderJsonIssues(after, '已修复 ' + n + ' 处问题：' + summary + '（尚未应用）');
    }
  }
}
FE.fixJsonText = fixJsonText;

var jsonCheckTimer = null;
function scheduleJsonCheck() {
  if (jsonCheckTimer) clearTimeout(jsonCheckTimer);
  jsonCheckTimer = setTimeout(function () { jsonCheckTimer = null; checkJsonText(); }, 250);
}

/* 切换标签页（供导入失败时跳转到 JSON 页等场景复用） */
function activateTab(id) {
  document.querySelectorAll('.tab').forEach(function (b) {
    var on = b.dataset.tab === id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tabpanel').forEach(function (p) { p.classList.remove('active'); });
  var panel = document.getElementById(id);
  if (panel) panel.classList.add('active');
  if (id === 'tab-keys') renderKeysTab();
  if (id === 'tab-popup' && FE.renderPopupTab) FE.renderPopupTab();
}
FE.activateTab = activateTab;

/* ---------------- 当前布局访问 ---------------- */
function curLayout() {
  return (state.profile && state.layoutName && state.profile.layouts[state.layoutName]) || null;
}
/* 当前编辑模式（常规 / 分体）下的 sections；split 模式且片段缺失时返回 [] */
function curSections() {
  var L = curLayout();
  if (!L) return [];
  if (state.splitMode) {
    if (!isPlainObject(L.split)) return [];
    return Array.isArray(L.split.sections) ? L.split.sections : [];
  }
  return Array.isArray(L.sections) ? L.sections : [];
}
/* 同 curSections，但确保容器存在（split 片段缺失时创建），用于增删类操作 */
function ensureCurSections() {
  var L = curLayout();
  if (!L) return null;
  if (state.splitMode) {
    if (!isPlainObject(L.split)) L.split = {};
    if (!Array.isArray(L.split.sections)) L.split.sections = [];
    return L.split.sections;
  }
  if (!Array.isArray(L.sections)) L.sections = [];
  return L.sections;
}
/* ================================================================
 * 预览渲染
 * ================================================================ */
var ICONS_SVG = {
  backspace: '<svg viewBox="0 0 24 24" class="kb-icon"><path d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-6.2-6.2a1 1 0 0 1 0-1.6L9 5zm2.4 4.3-1.06 1.06L12.3 12.3l-1.96 1.96L11.4 15.3l1.96-1.95 1.95 1.95 1.07-1.07-1.96-1.95 1.96-1.96-1.07-1.06-1.95 1.95-1.96-1.95z" fill="currentColor"/></svg>',
  shift: '<svg viewBox="0 0 24 24" class="kb-icon"><path d="M12 3.5 3.8 12.6c-.4.5-.05 1.2.58 1.2H9v5.2c0 .6.44 1 1 1h4c.56 0 1-.4 1-1v-5.2h4.62c.63 0 .98-.7.58-1.2L12 3.5z" fill="currentColor"/></svg>',
  shiftOutline: '<svg viewBox="0 0 24 24" class="kb-icon"><path d="M12 4.4 4.9 12.4h3.6v5.4c0 .3.27.55.6.55h5.8c.33 0 .6-.25.6-.55v-5.4h3.6L12 4.4z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  enter: '<svg viewBox="0 0 24 24" class="kb-icon"><path d="M19 6.5v5.6c0 .9-.72 1.6-1.6 1.6H6.7l2.6-2.6-1.2-1.2-4.6 4.6 4.6 4.6 1.2-1.2-2.6-2.6h11.1c1.66 0 3-1.34 3-3V6.5h-2.2z" fill="currentColor"/></svg>'
};

/* 有效标签（应用 Shift 与状态标签示例）。
 * status / statusSample 由调用方传入，不再隐式读全局 state，便于任意状态渲染。 */
function displayLabel(eff, status, statusSample) {
  status = status || state.status;
  if (eff.statusLabel != null) {
    return statusSample != null ? statusSample : (state.statusSample || '示例');
  }
  var raw = rawLabelOf(eff, status) || '';
  if (status.shift) {
    if (typeof eff.shiftedLabel === 'string') return eff.shiftedLabel;
    if (/^[a-z]$/.test(raw)) return raw.toUpperCase();
  }
  return raw;
}

/* 提示字号：按方向查找（hintSizeOf 定义在纯逻辑段，方向名大小写不敏感） */
function hintFontPx(eff, dir, unit) {
  var base = unit * 0.24;
  var n = hintSizeOf(eff.hintTextSize, dir);
  var scale = (typeof n === 'number') ? n / 11 : 1;
  return clamp(base * scale, 6, 16);
}

function keyFontPx(eff, unit) {
  var scale = (typeof eff.textSize === 'number') ? eff.textSize / 22 : 1;
  return clamp(unit * 0.42 * scale, 8, 42);
}

/* 阴影色 → CSS box-shadow（shadow 角色只给颜色，偏移/模糊沿用主题口径） */
function shadowCss(color) { return '0 1px 2px ' + color; }

/* 键面着色。status 显式传入（不再隐式读全局 state），使渲染可对任意状态进行。 */
function applyKeyColors(el, eff, pressed, status) {
  status = status || state.status;
  var c = eff.colors;
  if (!isPlainObject(c)) return;
  var col = {};
  if (typeof c.background === 'string') col.background = c.background;
  if (typeof c.text === 'string') col.color = c.text;
  if (typeof c.border === 'string') { col.borderColor = c.border; el.classList.add('kb-key-hasborder'); }
  if (typeof c.shadow === 'string') col.boxShadow = shadowCss(c.shadow);
  /* 基础 pressed 角色：手指按住该键时的背景色（优先级低于 states.pressed） */
  if (pressed && typeof c.pressed === 'string') col.background = c.pressed;

  /* 运行时状态色：优先级 modifierActive < modifierLocked < pressed，按序叠加 */
  var modifierOn = !pressed && eff.modifier === 'SHIFT' && status.shift;
  var chain = [];
  if (isPlainObject(c.states)) {
    if (modifierOn) {
      if (isPlainObject(c.states.modifierActive)) chain.push(c.states.modifierActive);
      if (isPlainObject(c.states.modifierLocked)) chain.push(c.states.modifierLocked);
    }
    if (pressed && isPlainObject(c.states.pressed)) chain.push(c.states.pressed);
  }
  var stateShadow = null;
  chain.forEach(function (st) {
    if (typeof st.background === 'string') col.background = st.background;
    if (typeof st.text === 'string') col.color = st.text;
    if (typeof st.shadow === 'string') stateShadow = st.shadow;
  });
  /* 按下与修饰锁定的键默认隐藏普通阴影；只有该状态显式给出 shadow 才绘制（含透明值） */
  if (pressed || modifierOn) col.boxShadow = stateShadow ? shadowCss(stateShadow) : 'none';

  Object.assign(el.style, col);
  applyHintColors(el, eff);
}

/* 提示文字颜色：基础 hint 作用于全部四向，hintTop/hintBottom/hintLeft/hintRight 按边覆盖。
 * 单独抽出是因为滑动提示元素是在按键主体着色之后才 append 的，
 * buildPreviewKey 需要在挂完提示后再调用一次。 */
function applyHintColors(el, eff) {
  var c = eff.colors;
  if (!isPlainObject(c)) return;
  var hintBase = typeof c.hint === 'string' ? c.hint : null;
  var hintEdge = { up: c.hintTop, down: c.hintBottom, left: c.hintLeft, right: c.hintRight };
  var hints = el.querySelectorAll('.kb-hint');
  for (var hi = 0; hi < hints.length; hi++) {
    var hel = hints[hi];
    var dir = null;
    for (var dj in hintEdge) {
      if (hel.classList.contains('kb-hint-' + dj)) { dir = dj; break; }
    }
    var hc = (dir && typeof hintEdge[dir] === 'string') ? hintEdge[dir] : hintBase;
    if (hc) hel.style.color = hc;
  }
}

/* 键位 tooltip：直接由编译产物生成，不再逐次解析手势与动作 */
function itemTooltip(item, shift) {
  var lines = [];
  lines.push('引用: ' + (item.ref || '（内联按键）'));
  if (item.chain && item.chain.length) lines.push('解析链: ' + item.chain.join(' → '));
  var tap = item.summaries.tap;
  lines.push('点击: ' + (tap && tap.display ? tap.display : '（继承）'));
  FE.SWIPE_DIRS.forEach(function (d) {
    var hh = item.hints[d];
    if (!hh) return;
    lines.push('滑动' + ({ up: '上', down: '下', left: '左', right: '右' })[d] + ': ' +
      (hh.display || '') + (hh.label ? ' 「' + hh.label + '」' : ''));
  });
  ['longPress', 'hold', 'doubleTap'].forEach(function (f) {
    var s = item.summaries[f];
    if (!s) return;
    lines.push((f === 'longPress' ? '长按' : f === 'hold' ? '按住' : '双击') + ': ' +
      (s.display || '') + (s.label ? ' 「' + s.label + '」' : ''));
  });
  if (item.popupKey) {
    var tipLine = '长按弹出: popupKey=' + item.popupKey;
    if (state.popupProfile && FE.popupCandidates) {
      var popupSchema = FE.popupSchemaName ? FE.popupSchemaName(state.popupProfile, state.popupSchema) : 'default';
      var pc = FE.popupCandidates(state.popupProfile, popupSchema, item.popupKey, shift);
      tipLine += pc ? ' · ' + pc.length + ' 个候选' : ' · 弹出菜单未定义';
    }
    lines.push(tipLine);
  }
  if (item.unresolved) lines.push('⚠ 引用无法解析: ' + item.unresolved);
  return lines.join('\n');
}

/* 由编译产物渲染单个键：引用解析、手势摘要、提示文字都已在编译期算好。
 * 这里不再调用 evalPlacement，大布局重渲染时省掉数百次重复解析。 */
function buildKeyEl(item, unit, opts) {  opts = opts || {};
  var eff = item.eff;
  var status = state.status;
  var maxKeyHeight = opts.maxKeyHeight != null ? opts.maxKeyHeight : 1;
  // 全链路只用一个 unit（竖屏口径）：行高、字号、图标、提示全部由此算。
  // 分体的"变宽"只靠容器 kb-split + flex 拉伸，绝不在这里乘系数。
  var el = h('div', {
    class: 'kb-key' + (item.keyType ? ' kt-' + String(item.keyType).toLowerCase() : '') +
      (item.isBroken ? ' kb-key-broken' : '') +
      (isSel(item.s, item.r, item.k) ? ' kb-key-sel' : ''),
    title: itemTooltip(item, status.shift)
  });
  if (item.spacer) el.classList.add('kb-spacer');
  el.style.flexGrow = String(opts.grow != null ? opts.grow : 0);
  el.style.flexBasis = '0';
  if (maxKeyHeight > 0) {
    var hfrac = item.height / maxKeyHeight;
    if (hfrac < 0.999) {
      el.style.height = (hfrac * 100) + '%';
      el.style.alignSelf = 'center';
    }
  }
  applyKeyColors(el, eff, false, status);

  if (eff.icon && ICONS_SVG[eff.icon]) {
    var wrap = h('span', { class: 'kb-icon-wrap' });
    var svg = ICONS_SVG[eff.icon];
    if (eff.icon === 'shift' && eff.modifier === 'SHIFT') {
      svg = state.status.shift ? ICONS_SVG.shift : ICONS_SVG.shiftOutline;
      if (state.status.shift) wrap.classList.add('kb-icon-active');
    }
    wrap.innerHTML = svg;
    var iw = clamp(unit * 0.52, 14, 40);
    wrap.style.width = iw + 'px';
    wrap.style.height = iw + 'px';
    el.appendChild(wrap);
  } else {
    var label = displayLabel(eff);
    if (label !== '' && label != null) {
      el.appendChild(h('span', {
        class: 'kb-label',
        style: { fontSize: keyFontPx(eff, unit) + 'px' }
      }, label));
    }
  }

  /* 滑动提示：文字与动作摘要在编译期已算好 */
  var hasHints = false;
  FE.SWIPE_DIRS.forEach(function (d) {
    var hh = item.hints[d];
    if (!hh) return;
    hasHints = true;
    el.appendChild(h('span', {
      class: 'kb-hint kb-hint-' + d,
      style: { fontSize: hintFontPx(eff, d, unit) + 'px' }
    }, hh.text));
  });
  if (hasHints) {
    /* 提示元素刚挂上，此时再上色（applyKeyColors 调用时它们还不存在） */
    applyHintColors(el, eff);
  }
  /* 长按徽标（蓝） */
  if (item.lpLabel) {
    el.appendChild(h('span', { class: 'kb-badge-lp', style: { fontSize: hintFontPx(eff, 'up', unit) + 'px' } }, item.lpLabel));
  }
  /* 按住徽标（橙） */
  if (item.holdLabel) {
    el.appendChild(h('span', { class: 'kb-badge-lp kb-badge-hold', style: { fontSize: hintFontPx(eff, 'up', unit) + 'px' } }, item.holdLabel));
  }
  /* 长按弹出菜单徽标（键下方中央的 ⌄） */
  if (item.popupKey) {
    var pkTitle = '长按弹出菜单 popupKey: ' + item.popupKey;
    if (state.popupProfile && FE.popupCandidates) {
      var popupSchema = FE.popupSchemaName ? FE.popupSchemaName(state.popupProfile, state.popupSchema) : 'default';
      var cands = FE.popupCandidates(state.popupProfile, popupSchema, item.popupKey, status.shift);
      pkTitle += cands ? '（' + cands.length + ' 个候选）' : '（当前弹出菜单未定义该键）';
    }
    el.appendChild(h('span', { class: 'kb-badge-popup', title: pkTitle }, '⌄'));
  }

  el.addEventListener('pointerdown', function () { el.classList.add('pressed'); applyKeyColors(el, eff, true, status); });
  el.addEventListener('pointerup', function () { el.classList.remove('pressed'); applyKeyColors(el, eff, false, status); });
  el.addEventListener('pointerleave', function () { el.classList.remove('pressed'); applyKeyColors(el, eff, false, status); });
  el.addEventListener('click', function (e) {
    e.stopPropagation();
    state.sel = { s: item.s, r: item.r, k: item.k };
    renderPreview();
    renderLayoutTab();
    if (FE.openKeyDialog) {
      FE.openKeyDialog({ mode: 'placement', placement: item.placement, location: { s: item.s, r: item.r, k: item.k } });
    }
  });
  return el;
}

function isSel(s, r, k) {
  var sel = state.sel;
  return !!sel && sel.s === s && sel.r === r && sel.k === k;
}

/* 以下三个 build* 都吃 FE.compileLayout 的编译产物（纯数据），不再自行解析引用。 */
function buildRowsSection(compiledSection, unit) {
  var wrap = h('div', { class: 'kb-section' });
  compiledSection.rows.forEach(function (row) {
    var rowEl = h('div', { class: 'kb-row' });
    if (row.width != null) {
      rowEl.style.width = (row.width * 100) + '%';
      rowEl.style.marginLeft = 'auto';
      rowEl.style.marginRight = 'auto';
    }
    rowEl.style.height = Math.max(18, row.heightUnits * unit) + 'px';
    row.keys.forEach(function (item) {
      rowEl.appendChild(buildKeyEl(item, unit, { grow: item.grow, maxKeyHeight: item.maxKeyHeight }));
    });
    wrap.appendChild(rowEl);
  });
  return wrap;
}

function buildGridSection(compiledSection, unit) {
  var el = h('div', { class: 'kb-grid' });
  el.style.gridTemplateColumns = 'repeat(' + compiledSection.columns + ', 1fr)';
  if (compiledSection.rowHeights && compiledSection.rowHeights.length) {
    el.style.gridTemplateRows = compiledSection.rowHeights.map(function (x) { return (Number(x) || 1) + 'fr'; }).join(' ');
  } else {
    el.style.gridTemplateRows = 'repeat(' + compiledSection.rows + ', 1fr)';
  }
  el.style.height = Math.max(24, compiledSection.totalUnits * unit) + 'px';
  (compiledSection.keys || []).forEach(function (item) {
    var keyEl = buildKeyEl(item, unit, { grow: '', maxKeyHeight: 1 });
    keyEl.style.gridColumn = (item.column + 1) + ' / span ' + Math.max(1, item.columnSpan);
    keyEl.style.gridRow = (item.row + 1) + ' / span ' + Math.max(1, item.rowSpan);
    keyEl.style.flexGrow = '';
    el.appendChild(keyEl);
  });
  return el;
}

/* 把编译产物渲染进容器（预览与将来的导出/对比渲染共用） */
function renderCompiledInto(host, compiled, unit) {
  (compiled.sections || []).forEach(function (sec) {
    if (sec.type === 'rows') host.appendChild(buildRowsSection(sec, unit));
    else if (sec.type === 'grid') host.appendChild(buildGridSection(sec, unit));
  });
}

function renderPreview() {
  var host = $('preview-kb');
  if (!host) return;
  clearEl(host);
  /* 先清空编译产物：提前返回的分支若留着上一次的结果，
   * renderMeta 的键数统计与后续消费 state.compiled 的逻辑会读到过期数据。 */
  state.compiled = null;
  host.className = 'kb ' + (state.theme === 'light' ? 'kb-light' : 'kb-dark') +
    (state.splitMode ? ' kb-split' : '');
  var L = curLayout();
  if (!L) {
    host.appendChild(h('div', { class: 'kb-empty' }, '当前没有布局，请在“布局编辑”中添加。'));
    renderMeta();
    return;
  }
  if (state.splitMode && !isPlainObject(L.split)) {
    host.appendChild(h('div', { class: 'kb-empty' },
      '布局 “' + state.layoutName + '” 没有分体（split）片段。',
      h('div', { class: 'status' }, '在“布局编辑”底部的区段工具栏切换到「分体布局」并生成片段。')));
    renderMeta();
    return;
  }
  var rawW = host.clientWidth;
  var W = rawW || 380;
  // 分体 = 横屏宽键盘：容器本身已放宽（kb-split），按键靠 flex 自动拉宽；
  // 这里只求一个"竖屏口径"的 unit（行高、字号、提示全用它），几何自然不动。
  // 注意：.kb 的 max-width 不能加 transition，否则切回竖屏那一帧量到的还是
  // 收缩中的宽值，portraitW 被污染后字和行高一起变大。另这里只在真实可见
  // （rawW>0）时记忆竖屏宽度，避免隐藏面板时的 0/回退值污染。
  if (!state.splitMode) {
    if (rawW > 0) state.portraitW = rawW;
    else if (state.portraitW == null) state.portraitW = 380;
  } else if (state.portraitW == null) {
    // 首次打开就处在分体模式（草稿恢复）：宽容器约是竖屏 2 倍，反推回去。
    // 注意只做这一次：不能每帧都 W/2，否则窗口/面板每次重排都会抖。
    state.portraitW = W / 2;
  }
  var unit = state.portraitW / 10;
  /* 一次性编译：引用解析与手势摘要在编译期完成，渲染只读结果 */
  var compiled = FE.compileLayout(state.profile, state.layoutName, {
    split: state.splitMode, status: state.status
  });
  state.compiled = compiled;
  renderCompiledInto(host, compiled, unit);
  if (!compiled.sections.length) {
    host.appendChild(h('div', { class: 'kb-empty' },
      state.splitMode ? '分体片段没有区段。' : '布局没有区段。'));
  }
  renderMeta();
}

function renderMeta() {
  var meta = $('preview-meta');
  clearEl(meta);
  var L = curLayout();
  var parts = [];
  if (state.layoutName) {
    var resolvedName = FE.resolvePreviewLayout(state.profile, state.layoutName, state.status);
    parts.push(h('b', null, state.layoutName));
    if (resolvedName !== state.layoutName) parts.push(' → 实际渲染 ' + resolvedName + '（状态变体）');
    if (state.splitMode) {
      parts.push(h('span', { class: 'st-split' }, ' · 分体 split'));
      var hasSplit = L && isPlainObject(L.split);
      if (!hasSplit) {
        parts.push(h('span', { class: 'st-warn' }, ' · 无分体片段（回退渲染提示）'));
        meta.appendChild(h('span', null, parts));
        appendValidationDetails(meta);
        return;
      }
      var usN = FE.layoutHeightUnits(L), usS = FE.layoutHeightUnits(L.split);
      parts.push(' · 高度 ' + (Math.round(usS * 100) / 100) + ' 单位（常规 ' + (Math.round(usN * 100) / 100) + '）');
    } else {
      parts.push(' · 高度 ' + (Math.round(FE.layoutHeightUnits(L) * 100) / 100) + ' 单位');
    }
    /* 键数直接由编译产物统计，避免再遍历一遍原始 sections */
    var keyCount = 0;
    (state.compiled ? state.compiled.sections : []).forEach(function (sec) {
      if (sec.type === 'rows') sec.rows.forEach(function (r) { keyCount += r.keys.length; });
      else if (sec.type === 'grid' && Array.isArray(sec.keys)) keyCount += sec.keys.length;
    });
    parts.push(' · ' + keyCount + ' 键');
  }
  meta.appendChild(h('span', null, parts));
  appendValidationDetails(meta);
}

/* 该条问题能否定位：有布局名，或有区段/键坐标 */
function issueLocatable(it) {
  if (!it) return false;
  if (it.layout && state.profile && isPlainObject(state.profile.layouts) && state.profile.layouts[it.layout]) return true;
  return it.sectionIndex != null;
}

/* 点击校验条目 → 切到对应布局 / 分体片段，选中目标键并滚动到它。
 * 校验结果里的坐标（layout / isSplit / sectionIndex / rowIndex / keyIndex）由
 * validateProfile 的结构化 issues 提供。 */
function locateIssue(it) {
  if (!it) return;
  if (it.layout && state.profile && isPlainObject(state.profile.layouts) && state.profile.layouts[it.layout]) {
    state.layoutName = it.layout;
  }
  var L = curLayout();
  var wantSplit = !!it.isSplit;
  /* 只在布局确实有 split 片段时切到分体模式，否则会落到空 sections */
  state.splitMode = !!(wantSplit && L && isPlainObject(L.split));
  if (it.sectionIndex != null) {
    var isGrid = it.group === 'grid' || it.rowIndex == null;
    state.sel = {
      s: it.sectionIndex,
      r: isGrid ? null : it.rowIndex,
      k: it.keyIndex != null ? it.keyIndex : 0
    };
  } else {
    state.sel = null;
  }
  activateTab('tab-layout');
  renderAll();
  scrollToSelection();
}

function scrollToSelection() {
  var sel = state.sel;
  if (!sel) return;
  var target = null, i, nodes;
  if (sel.r == null) {
    nodes = document.querySelectorAll('.gedit-cell');
    for (i = 0; i < nodes.length; i++) {
      var gk = nodes[i].__gridKey;
      if (gk && gk.si === sel.s && gk.gi === sel.k) { target = nodes[i]; break; }
    }
  } else {
    nodes = document.querySelectorAll('.chip');
    for (i = 0; i < nodes.length; i++) {
      var cl = nodes[i].__chipLoc;
      if (cl && cl.s === sel.s && cl.r === sel.r && cl.k === sel.k) { target = nodes[i]; break; }
    }
  }
  if (!target) return;
  var card = (target.closest && target.closest('details.card')) || null;
  if (card) card.open = true;
  /* dom-stub 不实现 scrollIntoView，测试环境下静默跳过 */
  if (target.scrollIntoView) target.scrollIntoView({ block: 'center' });
  else if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center' });
  target.classList.add('issue-flash');
}
FE.locateIssue = locateIssue;
FE.issueLocatable = issueLocatable;

function appendValidationDetails(meta) {
  var v = state.validation || {};
  var errs = v.errors || [], warns = v.warnings || [];
  var vparts = [];
  if (errs.length) vparts.push(h('span', { class: 'st-error' }, ' ✗ ' + errs.length + ' 个错误'));
  if (warns.length) vparts.push(h('span', { class: 'st-warn' }, ' ⚠ ' + warns.length + ' 个警告'));
  /* 可定位条目的提示，让用户知道能点 */
  var issues = Array.isArray(v.issues) ? v.issues : null;
  var locatable = 0;
  if (issues) issues.forEach(function (it) { if (issueLocatable(it)) locatable++; });
  if (!errs.length && !warns.length) vparts.push(h('span', { class: 'st-ok' }, ' ✓ 校验通过'));
  else if (locatable) vparts.push(h('span', { class: 'st-dim' }, ' · 点击条目可定位'));
  meta.appendChild(h('span', null, vparts));

  var det = h('details', { class: 'meta-details' });
  det.appendChild(h('summary', null, '校验详情'));
  var list = h('ul', { class: 'meta-list' });
  if (issues && issues.length) {
    issues.forEach(function (it) {
      var cls = it.level === 'error' ? 'st-error' : 'st-warn';
      var li = h('li', { class: cls });
      if (issueLocatable(it)) {
        li.classList.add('issue-locatable');
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.title = '点击定位到 ' + (it.path || '该位置');
        li.addEventListener('click', function () { locateIssue(it); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); locateIssue(it); }
        });
      }
      li.appendChild(h('span', { class: 'issue-msg' }, it.message));
      if (it.path) li.appendChild(h('span', { class: 'issue-path', title: it.path }, it.path));
      list.appendChild(li);
    });
  } else {
    /* 回退：老式字符串数组（例如外部传入的校验结果） */
    errs.forEach(function (m) { list.appendChild(h('li', { class: 'st-error' }, m)); });
    warns.forEach(function (m) { list.appendChild(h('li', { class: 'st-warn' }, m)); });
  }
  if (!errs.length && !warns.length) list.appendChild(h('li', { class: 'st-ok' }, '没有发现问题'));
  det.appendChild(list);
  meta.appendChild(det);
}

/* ================================================================
 * 布局编辑 Tab
 * ================================================================ */
function renderLayoutTab() {
  renderLayoutSelect();
  renderLayoutSettings();
  renderSectionsEditor();
  renderLayoutTabsPills();
}

function renderLayoutSelect() {
  var sel = $('layout-select');
  clearEl(sel);
  var names = state.profile ? Object.keys(state.profile.layouts) : [];
  names.forEach(function (n) {
    sel.appendChild(h('option', { value: n }, n));
  });
  if (!names.length) sel.appendChild(h('option', { value: '' }, '（无布局）'));
  sel.value = state.layoutName || '';
  var del = $('layout-del');
  if (del) del.disabled = names.length <= 0;
}

function renderLayoutTabsPills() {
  var host = $('layout-tabs');
  if (!host) return;
  clearEl(host);
  var names = state.profile ? Object.keys(state.profile.layouts) : [];
  names.forEach(function (n) {
    host.appendChild(h('button', {
      class: 'pill' + (n === state.layoutName ? ' active' : ''),
      onclick: function () {
        state.layoutName = n;
        state.sel = null;
        renderAll();
      }
    }, n));
  });
}

function renderLayoutSettings() {
  var L = curLayout();
  var hp = $('ls-height-p'), hl = $('ls-height-landscape');
  var ov = (L && isPlainObject(L.override)) ? L.override : {};
  if (hp && document.activeElement !== hp) {
    hp.value = ov.keyboardHeightPercent != null ? String(Math.round(ov.keyboardHeightPercent * 100)) : '';
  }
  if (hl && document.activeElement !== hl) {
    hl.value = ov.keyboardHeightPercentLandscape != null ? String(Math.round(ov.keyboardHeightPercentLandscape * 100)) : '';
  }

  /* 布局变体 */
  var vhost = $('layout-variants');
  clearEl(vhost);
  var variants = (L && Array.isArray(L.variants)) ? L.variants : [];
  variants.forEach(function (v, vi) {
    var condSel = function (cond) {
      var val = v && v.when && v.when.rime ? v.when.rime[cond] : undefined;
      var s = h('select', { class: 'mini-select' });
      s.appendChild(h('option', { value: '' }, cond + ':忽略'));
      s.appendChild(h('option', { value: '1', selected: val === true }, cond + ':真'));
      s.appendChild(h('option', { value: '0', selected: val === false }, cond + ':假'));
      s.onchange = function () {
        mutate(function () {
          var vv = curLayout().variants[vi];
          if (!vv.when || !isPlainObject(vv.when.rime)) vv.when = { rime: {} };
          if (s.value === '') delete vv.when.rime[cond];
          else vv.when.rime[cond] = s.value === '1';
          if (!Object.keys(vv.when.rime).length) delete vv.when;
        });
      };
      return s;
    };
    var target = h('select', { class: 'mini-select' });
    Object.keys(state.profile.layouts).forEach(function (n) {
      target.appendChild(h('option', { value: n, selected: v.layout === n }, n));
    });
    target.onchange = function () {
      mutate(function () { curLayout().variants[vi].layout = target.value; });
    };
    vhost.appendChild(h('div', { class: 'variant-row' },
      '当', condSel('composing'), condSel('ascii_mode'), condSel('disabled'),
      '→ 使用', target,
      h('button', { class: 'icon-button', title: '删除此变体', onclick: function () { mutate(function () { curLayout().variants.splice(vi, 1); }); } }, '✕')
    ));
  });
  var addVariant = h('button', {
    class: 'mini-button', onclick: function () {
      mutate(function () {
        var l = curLayout();
        if (!l) return;
        if (!Array.isArray(l.variants)) l.variants = [];
        l.variants.push({ when: { rime: { composing: true } }, layout: Object.keys(state.profile.layouts)[0] || 'default' });
      });
    }
  }, '+ 添加布局变体');
  addVariant.disabled = !L;
  vhost.appendChild(addVariant);
}

/* ---------------- 区段编辑器 ---------------- */
function renderSectionsEditor() {
  var host = $('layout-sections');
  clearEl(host);
  var L = curLayout();
  var hasSplit = !!(L && isPlainObject(L.split));

  /* 模式横幅：常规 / 分体（切换后等一帧重渲染，见分体开关注释） */
  function setSplitMode(v) {
    state.splitMode = v;
    state.sel = null;
    renderAll();
    requestAnimationFrame(function () { renderPreview(); });
  }
  var banner = h('div', { class: 'split-banner' });
  banner.appendChild(h('button', {
    class: 'pill' + (!state.splitMode ? ' active' : ''),
    onclick: function () { setSplitMode(false); }
  }, '常规布局'));
  banner.appendChild(h('button', {
    class: 'pill' + (state.splitMode ? ' active' : '') + (hasSplit ? '' : ' pill-dim'),
    title: '分体键盘（split）片段：由 Foxy 的分体设置选择，不经 switch_layout 切换',
    onclick: function () { setSplitMode(true); }
  }, '分体布局 split'));
  if (state.splitMode && !hasSplit && L) {
    banner.appendChild(h('span', { class: 'status warn' }, '当前布局没有 split 片段'));
    banner.appendChild(h('button', {
      class: 'mini-button primary',
      title: '复制常规区段，并在每行中间插入 foxy.Spacer 占位（含 weight:"auto" 的行除外）',
      onclick: generateSplitFromNormal
    }, '从常规布局生成'));
    banner.appendChild(h('button', {
      class: 'mini-button',
      onclick: function () {
        mutate(function () {
          var l = curLayout();
          if (!l) return;
          l.split = { sections: [{ type: 'rows', rows: [[]] }] };
        });
      }
    }, '空白片段'));
  }
  if (state.splitMode && hasSplit) {
    var usN = FE.layoutHeightUnits(L), usS = FE.layoutHeightUnits(L.split);
    banner.appendChild(h('span', {
      class: 'status' + (Math.abs(usN - usS) > 0.01 ? ' warn' : '')
    }, '高度 ' + (Math.round(usS * 100) / 100) + ' / 常规 ' + (Math.round(usN * 100) / 100) + ' 单位'));
    banner.appendChild(h('button', {
      class: 'mini-button',
      title: '用常规区段重新生成分体片段（覆盖现有分体内容）',
      onclick: generateSplitFromNormal
    }, '重新生成'));
    banner.appendChild(h('button', {
      class: 'mini-button danger',
      onclick: function () {
        if (!confirm('删除分体片段？（可用撤销恢复）')) return;
        mutate(function () { delete curLayout().split; });
      }
    }, '删除分体片段'));
  }
  host.appendChild(banner);

  if (state.splitMode && !hasSplit) {
    host.appendChild(h('div', { class: 'status' },
      'Foxy 不会自动拆分行；分体片段需要显式编写（用 foxy.Spacer 或权重留出中间空隙）。',
      h('div', null, '可「从常规布局生成」后，再把按键在两侧之间移动调整。')));
    return;
  }

  var sections = curSections();
  /* 一次性编译当前编辑片段：键的引用解析与手势摘要在编译期完成，
   * chip / 网格单元格只读结果（原来每渲染一个 chip 就 evalPlacement 一次）。 */
  var compiled = FE.compileSections(sections, state.status).sections;
  sections.forEach(function (s, si) {
    var csec = compiled[si];
    if (!isPlainObject(s) || !csec || csec.invalid) { host.appendChild(sectionCardBroken(si)); return; }
    if (s.type === 'rows') host.appendChild(rowsSectionCard(s, si, csec));
    else if (s.type === 'grid') host.appendChild(gridSectionCard(s, si, csec));
    else host.appendChild(sectionCardBroken(si));
  });
  host.appendChild(h('div', { class: 'toolbar' },
    h('button', { onclick: function () { addSection('rows'); } }, '+ 行区段'),
    h('button', { onclick: function () { addSection('grid'); } }, '+ 网格区段')
  ));
}

/* 从常规区段生成分体片段：每行中间插入 foxy.Spacer（weight 2），
 * 含 weight:"auto" 的行（如空格行）与过短的行保持原样 */
function generateSplitFromNormal() {
  mutate(function () {
    var L = curLayout();
    if (!L) return;
    var normal = Array.isArray(L.sections) ? deepClone(L.sections) : [];
    normal.forEach(function (s) {
      if (!isPlainObject(s) || s.type !== 'rows' || !Array.isArray(s.rows)) return;
      s.rows = s.rows.map(function (r) {
        var isObj = isPlainObject(r);
        var keys = isObj ? (Array.isArray(r.keys) ? r.keys : []) : (Array.isArray(r) ? r : []);
        var hasAuto = keys.some(function (k) { return isPlainObject(k) && k.weight === 'auto'; });
        if (keys.length < 4 || hasAuto) return r;
        var mid = Math.ceil(keys.length / 2);
        var nr = keys.slice(0, mid)
          .concat([{ ref: 'foxy.Spacer', weight: 2 }])
          .concat(keys.slice(mid));
        if (isObj) {
          r.keys = nr;
          if (typeof r.totalWeight === 'number') r.totalWeight += 2;
          return r;
        }
        return nr;
      });
    });
    L.split = { sections: normal };
    state.splitMode = true;
  });
}
FE.generateSplitFromNormal = generateSplitFromNormal;

function sectionCardBroken(si) {
  return h('details', { class: 'card section-card', open: true },
    h('summary', null, '区段 ' + (si + 1) + '（结构无效）'),
    h('button', {
      class: 'danger', onclick: function () {
        mutate(function () { curSections().splice(si, 1); });
      }
    }, '删除此区段'));
}

function sectionHeader(si, label) {
  return h('div', { class: 'section-head' },
    h('span', { class: 'section-title' }, label),
    h('span', { class: 'section-tools' },
      h('button', { class: 'icon-button', title: '上移', onclick: function () { moveSection(si, -1); } }, '↑'),
      h('button', { class: 'icon-button', title: '下移', onclick: function () { moveSection(si, 1); } }, '↓'),
      h('button', { class: 'icon-button danger', title: '删除区段', onclick: function () { mutate(function () { curSections().splice(si, 1); }); } }, '🗑')
    ));
}

function moveSection(si, delta) {
  var arr = curSections();
  var nj = si + delta;
  if (nj < 0 || nj >= arr.length) return;
  mutate(function () {
    var tmp = arr[si];
    arr[si] = arr[nj];
    arr[nj] = tmp;
  });
}

function addSection(type) {
  mutate(function () {
    var arr = ensureCurSections();
    if (!arr) return;
    if (type === 'rows') arr.push({ type: 'rows', rows: [[]] });
    else arr.push({ type: 'grid', columns: 4, rows: 3, keys: [] });
  });
}

/* ---- 行区段卡片 ---- */
function rowsSectionCard(section, si, csec) {
  var card = h('details', { class: 'card section-card', open: true });
  card.appendChild(h('summary', null, '区段 ' + (si + 1) + ' · 行'));
  var body = h('div', { class: 'section-body' });
  body.appendChild(sectionHeader(si, '行区段'));
  var rows = section.rows;
  if (!Array.isArray(rows)) {
    body.appendChild(h('div', { class: 'status warn' }, 'rows 不是数组'));
    card.appendChild(body);
    return card;
  }
  rows.forEach(function (r, ri) {
    body.appendChild(rowEditor(section, si, ri, csec.rows[ri]));
  });
  body.appendChild(h('div', { class: 'toolbar' },
    h('button', {
      class: 'mini-button', onclick: function () {
        mutate(function () { section.rows.push([]); });
      }
    }, '+ 添加行')
  ));
  card.appendChild(body);
  return card;
}

function rowEditor(section, si, ri, crow) {
  var rows = section.rows;
  var raw = rows[ri];
  var isObj = isPlainObject(raw);
  /* 编译产物提供每个键项的解析结果；缺失时回退为就地编译（例如结构正在被编辑） */
  var items = (crow && crow.keys) || null;

  function getKeys() {
    var r = section.rows[ri];
    if (isPlainObject(r)) {
      if (!Array.isArray(r.keys)) r.keys = [];
      return r.keys;
    }
    /* 转为对象行 */
    var obj = { keys: Array.isArray(r) ? r : [] };
    section.rows[ri] = obj;
    return obj.keys;
  }
  function setRowProp(prop, value) {
    mutate(function () {
      var ks = getKeys();
      var r = section.rows[ri];
      if (value === '' || value == null) delete r[prop];
      else r[prop] = value;
    });
  }

  var head = h('div', { class: 'row-head' },
    h('span', { class: 'row-title' }, '行 ' + (ri + 1) + (isObj ? '' : '（数组）')),
    h('label', { class: 'mini-label' }, '宽度',
      numInput(isObj && raw.width != null ? raw.width : '', function (v) { setRowProp('width', v === '' ? null : parseFloat(v)); }, '0–1，如 0.9')),
    h('label', { class: 'mini-label' }, '高度',
      numInput(isObj && raw.height != null ? raw.height : '', function (v) { setRowProp('height', v === '' ? null : parseFloat(v)); }, '单位，默认 5/行数')),
    h('label', { class: 'mini-label' }, '总权重',
      numInput(isObj && raw.totalWeight != null ? raw.totalWeight : '', function (v) { setRowProp('totalWeight', v === '' ? null : parseFloat(v)); }, 'weight:auto 时必填')),
    h('span', { class: 'section-tools' },
      h('button', { class: 'icon-button', title: '上移行', onclick: function () { moveRow(si, ri, -1); } }, '↑'),
      h('button', { class: 'icon-button', title: '下移行', onclick: function () { moveRow(si, ri, 1); } }, '↓'),
      h('button', { class: 'icon-button danger', title: '删除行', onclick: function () { mutate(function () { section.rows.splice(ri, 1); }); } }, '✕')
    )
  );

  var chipBox = h('div', { class: 'chip-box' });
  chipBox.__boxLoc = { s: si, r: ri };   /* 供指针拖动识别“落到该行末尾” */
  (items || []).forEach(function (item) {
    if (!item) return;
    chipBox.appendChild(keyChip(item));
  });
  chipBox.appendChild(h('button', {
    class: 'chip chip-add',
    onclick: function () {
      addKeyToRow(si, ri);
    }
  }, '+ 键'));

  return h('div', { class: 'row-block' }, head, chipBox);
}

function getRowKeys(section, ri) {
  var r = section.rows[ri];
  if (isPlainObject(r)) {
    if (!Array.isArray(r.keys)) r.keys = [];
    return r.keys;
  }
  var obj = { keys: Array.isArray(r) ? r : [] };
  section.rows[ri] = obj;
  return obj.keys;
}

function numInput(value, oninput, title) {
  var inp = h('input', { type: 'number', step: 'any', class: 'mini-input', title: title || '' });
  inp.value = value != null && value !== '' ? String(value) : '';
  inp.addEventListener('change', function () { oninput(inp.value); });
  return inp;
}

function moveRow(si, ri, delta) {
  var section = curSections()[si];
  if (!section) return;
  var nj = ri + delta;
  if (nj < 0 || nj >= section.rows.length) return;
  mutate(function () {
    var tmp = section.rows[ri];
    section.rows[ri] = section.rows[nj];
    section.rows[nj] = tmp;
  });
}

/* ================================================================
 * 指针拖动（鼠标 + 触屏统一）
 * ----------------------------------------------------------------
 * 原生 HTML5 拖放（draggable + dragstart/drop）在移动端触摸时根本不触发，
 * 导致手机上无法拖动按键排序。这里改用 Pointer Events 统一实现，PC 与手机
 * 行为一致：按住并移动超过阈值即进入拖动，松手落到目标位置；未超过阈值则
 * 视为普通点击（打开编辑对话框）。
 * ================================================================ */
var lastPointerDragEnd = 0;
function pointerDragSuppressClick() { return (Date.now() - lastPointerDragEnd) < 250; }

function findAncestor(node, test) {
  while (node && node.nodeType === 1) {
    if (test(node)) return node;
    node = node.parentNode;
  }
  return null;
}

function elemFromPoint(x, y) {
  return (typeof document.elementFromPoint === 'function') ? document.elementFromPoint(x, y) : null;
}

function clearAllDropMarks() {
  ['.chip.drop-before', '.chip-box.drop-target', '.gedit-drop'].forEach(function (sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      list[i].classList.remove('drop-before', 'drop-target', 'gedit-drop');
    }
  });
}

function buildDragGhost(el, x, y) {
  if (typeof el.cloneNode !== 'function') return null;
  var g = el.cloneNode(true);
  g.classList.add('drag-ghost');
  g.classList.remove('dragging', 'chip-sel', 'gedit-drop');
  g.style.position = 'fixed';
  g.style.left = x + 'px';
  g.style.top = y + 'px';
  g.style.margin = '0';
  g.style.width = (el.offsetWidth || 56) + 'px';
  g.style.height = (el.offsetHeight || 44) + 'px';
  g.style.pointerEvents = 'none';
  g.style.zIndex = '99999';
  g.style.opacity = '0.92';
  g.style.transform = 'translate(-50%, -50%)';
  if (document.body) document.body.appendChild(g);
  return g;
}
function moveDragGhost(g, x, y) {
  if (!g) return;
  g.style.left = x + 'px';
  g.style.top = y + 'px';
}

/* 通用指针拖动绑定。opts:
 *   dropTarget(x,y) → { el, markClass, ... } | null   命中目标（用于高亮与落点）
 *   onDrop(target)                                     松手时执行实际数据变更
 *   onStart()                                          进入拖动时（可选） */
function attachPointerDrag(el, opts) {
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var startX = e.clientX, startY = e.clientY, pid = e.pointerId;
    var started = false, ghost = null;
    function onMove(ev) {
      if (ev.pointerId !== pid) return;
      if (!started) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
        started = true;
        el.classList.add('dragging');
        ghost = buildDragGhost(el, ev.clientX, ev.clientY);
        try { el.setPointerCapture(pid); } catch (err) {}
        if (opts.onStart) opts.onStart();
      }
      if (ev.cancelable) ev.preventDefault();
      moveDragGhost(ghost, ev.clientX, ev.clientY);
      clearAllDropMarks();
      var t = opts.dropTarget(ev.clientX, ev.clientY);
      if (t && t.el && t.markClass) t.el.classList.add(t.markClass);
    }
    function onUp(ev) {
      if (ev.pointerId !== pid) return;
      var wasDragging = started;
      var t = started ? opts.dropTarget(ev.clientX, ev.clientY) : null;
      finish();
      if (wasDragging) { lastPointerDragEnd = Date.now(); opts.onDrop(t); }
    }
    function finish() {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      el.classList.remove('dragging');
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      clearAllDropMarks();
      try { el.releasePointerCapture(pid); } catch (err) {}
    }
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}

/* 行 chip 落点解析：命中另一个 chip → 插入其前；命中行容器空白 → 追加到该行末尾。
 * 仅允许同一区段内移动（跨行自由排布，覆盖“删除再添加”的旧流程）。 */
function chipDropTarget(x, y, si) {
  var from = elemFromPoint(x, y);
  if (!from) return null;
  var chip = findAncestor(from, function (n) { return n.__chipLoc != null; });
  if (chip && chip.__chipLoc.s === si) {
    return { kind: 'before', loc: chip.__chipLoc, el: chip, markClass: 'drop-before' };
  }
  var box = findAncestor(from, function (n) { return n.__boxLoc != null; });
  if (box && box.__boxLoc.s === si) {
    return { kind: 'end', loc: box.__boxLoc, el: box, markClass: 'drop-target' };
  }
  return null;
}

function performChipDrop(from, target) {
  if (!target) return;
  if (target.kind === 'before') {
    var to = target.loc;
    if (to.s === from.s && to.r === from.r && to.k === from.k) return;
    mutate(function () {
      var section = curSections()[from.s];
      var src = getRowKeys(section, from.r);
      var item = src.splice(from.k, 1)[0];
      if (item === undefined) return;
      var dst = getRowKeys(section, to.r);
      var idx = (from.r === to.r && from.k < to.k) ? to.k - 1 : to.k;
      idx = clamp(idx, 0, dst.length);
      dst.splice(idx, 0, item);
      state.sel = { s: from.s, r: to.r, k: idx };
    });
  } else if (target.kind === 'end') {
    var to2 = target.loc;
    mutate(function () {
      var section = curSections()[from.s];
      var src = getRowKeys(section, from.r);
      var item = src.splice(from.k, 1)[0];
      if (item === undefined) return;
      var dst = getRowKeys(section, to2.r);
      dst.push(item);
      state.sel = { s: from.s, r: to2.r, k: dst.length - 1 };
    });
  }
}

/* 网格按键落点解析：命中空格 → 移动坐标；命中另一按键 → 交换坐标。 */
function gridDropTarget(x, y, si) {
  var from = elemFromPoint(x, y);
  if (!from) return null;
  var keyCell = findAncestor(from, function (n) { return n.__gridKey != null; });
  if (keyCell && keyCell.__gridKey.si === si) {
    return { kind: 'swap', gi: keyCell.__gridKey.gi, el: keyCell, markClass: 'gedit-drop' };
  }
  var empty = findAncestor(from, function (n) { return n.__gridEmpty != null; });
  if (empty && empty.__gridEmpty.si === si) {
    return { kind: 'move', x: empty.__gridEmpty.x, y: empty.__gridEmpty.y, el: empty, markClass: 'gedit-drop' };
  }
  return null;
}

function performGridDrop(si, gi, target) {
  if (!target) return;
  mutate(function () {
    var section = curSections()[si];
    if (!isPlainObject(section) || !Array.isArray(section.keys)) return;
    var k = section.keys[gi];
    if (!isPlainObject(k)) return;
    if (target.kind === 'move') {
      k.column = target.x; k.row = target.y;
      state.sel = { s: si, r: null, k: gi };
    } else if (target.kind === 'swap') {
      var other = section.keys[target.gi];
      if (!isPlainObject(other) || other === k) return;
      var tc = other.column, tr = other.row;
      other.column = k.column; other.row = k.row;
      k.column = tc; k.row = tr;
      state.sel = { s: si, r: null, k: gi };
    }
  });
}

/* ---- 按键 chip（吃编译产物，不再自行解析引用） ---- */
function keyChip(item) {
  var placement = item.placement;
  var loc = { s: item.s, r: item.r, k: item.k };
  var label = item.label || (item.icon ? '⚙' : '？');
  var chip = h('div', {
    class: 'chip' + (item.keyType === 'FUNCTION' || item.keyType === 'ACTION' ? ' chip-fn' : '') +
      (isSel(loc.s, loc.r, loc.k) ? ' chip-sel' : '') +
      (item.isBroken ? ' chip-broken' : ''),
    title: itemTooltip(item, state.status.shift),
    onclick: function () {
      if (pointerDragSuppressClick()) return;   /* 刚拖动完，不当作点击 */
      state.sel = loc;
      renderPreview();
      renderSectionsEditor();
      if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'placement', placement: placement, location: loc });
    }
  });
  chip.__chipLoc = { s: loc.s, r: loc.r, k: loc.k };
  chip.appendChild(h('span', { class: 'chip-label' }, String(label).slice(0, 6)));
  chip.appendChild(h('span', { class: 'chip-sub' }, placement && placement.ref ? placement.ref : '内联'));
  var badges = [];
  if (isPlainObject(placement) && placement.weight != null) badges.push('w:' + placement.weight);
  if (isPlainObject(placement) && isPlainObject(placement.override) && Object.keys(placement.override).length) badges.push('OV');
  if (isPlainObject(placement) && placement.height != null) badges.push('h:' + placement.height);
  if (badges.length) chip.appendChild(h('span', { class: 'chip-badges' }, badges.join(' ')));
  attachPointerDrag(chip, {
    dropTarget: function (x, y) { return chipDropTarget(x, y, loc.s); },
    onDrop: function (target) { performChipDrop({ s: loc.s, r: loc.r, k: loc.k }, target); }
  });
  return chip;
}

function addKeyToRow(si, ri) {
  if (!FE.openKeyPicker) return;
  FE.openKeyPicker({
    title: '向行 ' + (ri + 1) + ' 添加按键',
    allowInline: true,
    onPick: function (name, inline) {
      mutate(function () {
        var section = curSections()[si];
        var keys = getRowKeys(section, ri);
        if (inline) keys.push({});
        else keys.push({ ref: name });
        state.sel = { s: si, r: ri, k: keys.length - 1 };
      });
      if (inline && FE.openKeyDialog) {
        var section = curSections()[si];
        var keys2 = getRowKeys(section, ri);
        FE.openKeyDialog({ mode: 'placement', placement: keys2[keys2.length - 1], location: { s: si, r: ri, k: keys2.length - 1 } });
      }
    }
  });
}

/* ---- 网格区段卡片 ---- */
function gridSectionCard(section, si, csec) {
  var card = h('details', { class: 'card section-card', open: true });
  card.appendChild(h('summary', null, '区段 ' + (si + 1) + ' · 网格'));
  var body = h('div', { class: 'section-body' });
  body.appendChild(sectionHeader(si, '网格区段'));

  var dims = FE.gridDims(section);
  var ctrls = h('div', { class: 'form-row form-inline' },
    h('label', { class: 'mini-label' }, '列',
      numInput(dims.columns, function (v) {
        mutate(function () {
          var n = parseInt(v, 10);
          if (!Number.isInteger(n) || n < 1) return;
          section.columns = n;
        });
      })),
    h('label', { class: 'mini-label' }, '行',
      numInput(dims.rows, function (v) {
        mutate(function () {
          var n = parseInt(v, 10);
          if (!Number.isInteger(n) || n < 1) return;
          section.rows = n;
        });
      })),
    h('label', { class: 'mini-label' }, '行高(单位,逗号分隔)',
      (function () {
        var inp = h('input', { type: 'text', class: 'mini-input wide', placeholder: '默认均分（总5单位）' });
        inp.value = Array.isArray(section.rowHeights) ? section.rowHeights.join(',') : '';
        inp.addEventListener('change', function () {
          mutate(function () {
            if (inp.value.trim() === '') delete section.rowHeights;
            else {
              var arr = inp.value.split(',').map(function (x) { return parseFloat(x.trim()); }).filter(function (x) { return isFinite(x) && x > 0; });
              if (arr.length) section.rowHeights = arr;
            }
          });
        });
        return inp;
      })())
  );
  body.appendChild(ctrls);
  body.appendChild(gridEditor(section, si, csec));
  card.appendChild(body);
  return card;
}

function gridEditor(section, si, csec) {
  var dims = FE.gridDims(section);
  var cols = dims.columns, rws = dims.rows;
  var wrap = h('div', { class: 'gedit-wrap' });
  var grid = h('div', { class: 'gedit' });
  grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(34px, 1fr))';

  /* 单元格 → 按键索引 */
  var cellMap = {};
  var keysArr = Array.isArray(section.keys) ? section.keys : [];
  keysArr.forEach(function (k, gi) {
    if (!isPlainObject(k)) return;
    var c = Number.isInteger(k.column) ? k.column : 0;
    var r = Number.isInteger(k.row) ? k.row : 0;
    var cs = k.columnSpan != null ? k.columnSpan : 1;
    var rs = k.rowSpan != null ? k.rowSpan : 1;
    for (var y = r; y < r + rs; y++) {
      for (var x = c; x < c + cs; x++) {
        if (y >= 0 && y < rws && x >= 0 && x < cols) cellMap[x + ',' + y] = { gi: gi, start: (x === c && y === r) };
      }
    }
  });

  for (var ry = 0; ry < rws; ry++) {
    for (var cx = 0; cx < cols; cx++) {
      if (ry * cols + cx >= 400) continue;
      (function (x, y) {
        var place = { gridColumn: String(x + 1), gridRow: String(y + 1) };
        var info = cellMap[x + ',' + y];
        if (info && !info.start) {
          /* 被跨距按键覆盖的格子:跨距键本身已占满该区域(占位格会与其重叠
           * 并因 DOM 靠后而绘制在上层,把键的下半/右半遮住),不再单独渲染。 */
          return;
        }
        if (info) {
          var item = csec.keys[info.gi];
          if (!item) return;
          var cs = item.columnSpan;
          var rs = item.rowSpan;
          if (cs > 1) place.gridColumn = (x + 1) + ' / span ' + cs;
          if (rs > 1) place.gridRow = (y + 1) + ' / span ' + rs;
          var cell = h('div', {
            class: 'gedit-cell gedit-key' + (isSel(si, null, info.gi) ? ' chip-sel' : '') + (item.isBroken ? ' chip-broken' : ''),
            title: itemTooltip(item, state.status.shift),
            style: place
          });
          cell.style.zIndex = '1';
          var label = item.label || (item.icon ? '⚙' : '？');
          cell.appendChild(h('span', { class: 'gedit-label' }, String(label).slice(0, 4)));
          cell.appendChild(h('span', { class: 'gedit-sub' }, item.ref || '内联'));
          if (cs > 1 || rs > 1) cell.appendChild(h('span', { class: 'gedit-span' }, cs + '×' + rs));
          cell.__gridKey = { si: si, gi: info.gi };
          (function (gi) {
            cell.addEventListener('click', function () {
              if (pointerDragSuppressClick()) return;   /* 刚拖动完，不当作点击 */
              state.sel = { s: si, r: null, k: gi };
              renderPreview();
              renderSectionsEditor();
              if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'placement', placement: keysArr[gi], location: { s: si, r: null, k: gi }, grid: true });
            });
            attachPointerDrag(cell, {
              dropTarget: function (px, py) { return gridDropTarget(px, py, si); },
              onDrop: function (target) { performGridDrop(si, gi, target); }
            });
          })(info.gi);
          grid.appendChild(cell);
        } else {
          var emptyCell = h('div', {
            class: 'gedit-cell gedit-empty',
            style: place,
            title: '在 (' + x + ',' + y + ') 添加按键',
            onclick: function () {
              if (!FE.openKeyPicker) return;
              FE.openKeyPicker({
                title: '在网格 (' + x + ',' + y + ') 放置按键',
                allowInline: true,
                onPick: function (name, inline) {
                  mutate(function () {
                    if (!Array.isArray(section.keys)) section.keys = [];
                    var entry = inline ? { column: x, row: y } : { column: x, row: y, ref: name };
                    section.keys.push(entry);
                    state.sel = { s: si, r: null, k: section.keys.length - 1 };
                  });
                  if (inline && FE.openKeyDialog) {
                    FE.openKeyDialog({ mode: 'placement', placement: section.keys[section.keys.length - 1], location: { s: si, r: null, k: section.keys.length - 1 }, grid: true });
                  }
                }
              });
            }
          }, '+');
          emptyCell.__gridEmpty = { si: si, x: x, y: y };
          grid.appendChild(emptyCell);
        }
      })(cx, ry);
    }
  }
  wrap.appendChild(grid);
  if (rws * cols > 400) {
    wrap.appendChild(h('div', { class: 'status warn' }, '网格较大（' + cols + '×' + rws + '），仅渲染前 400 格'));
  }
  return wrap;
}

/* ================================================================
 * 按键定义 Tab
 * ================================================================ */
function renderKeysTab() {
  var host = $('keys-list');
  if (!host) return;
  clearEl(host);
  var filter = ($('keys-filter') && $('keys-filter').value || '').trim().toLowerCase();
  var keys = state.profile && isPlainObject(state.profile.keys) ? state.profile.keys : {};
  var names = Object.keys(keys).filter(function (n) {
    if (!filter) return true;
    var kd = keys[n];
    return n.toLowerCase().indexOf(filter) >= 0 ||
      (isPlainObject(kd) && typeof kd.ref === 'string' && kd.ref.toLowerCase().indexOf(filter) >= 0);
  });
  if (!names.length) {
    host.appendChild(h('div', { class: 'status' }, filter ? '没有匹配的按键定义。' : '尚无按键定义。布局中的内联按键不会出现在这里。'));
    return;
  }
  names.forEach(function (n) {
    var kd = keys[n];
    if (!isPlainObject(kd)) return;
    var ev = FE.evalPlacement({ ref: n }, NEUTRAL_STATUS);
    var eff = ev.eff;
    var badges = [];
    if (kd.ref) badges.push('ref: ' + kd.ref);
    var gestures = [];
    if (eff.tap != null || kd.tap != null) gestures.push('点击');
    if (kd.swipe || eff.swipe) gestures.push('滑动' + Object.keys(isPlainObject(kd.swipe) ? kd.swipe : {}).length);
    if (kd.longPress) gestures.push('长按');
    if (kd.hold) gestures.push('按住');
    if (kd.doubleTap) gestures.push('双击');
    var label = rawLabelOf(eff, NEUTRAL_STATUS) || (eff.icon ? '图标 ' + eff.icon : '');
    host.appendChild(h('div', { class: 'def-item' },
      h('div', { class: 'def-main' },
        h('code', { class: 'def-name', onclick: function () { if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'definition', name: n }); } }, n),
        h('span', { class: 'def-label' }, label),
        h('span', { class: 'def-badges' }, [eff.keyType || '', badges.join(' '), gestures.join('·')].filter(Boolean).join(' · '))
      ),
      h('div', { class: 'def-tools' },
        h('button', {
          onclick: function () { if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'definition', name: n }); }
        }, '编辑'),
        h('button', {
          onclick: function () {
            var used = countKeyUsage(n);
            alert('按键定义 “' + n + '” 被引用 ' + used.count + ' 处' + (used.places.length ? '：\n' + used.places.join('\n') : ''));
          }
        }, '使用 ' + countKeyUsage(n).count),
        h('button', {
          class: 'danger', onclick: function () {
            var used = countKeyUsage(n);
            var msg = '删除按键定义 “' + n + '”？';
            if (used.count) msg += '\n它正被 ' + used.count + ' 处引用，删除后这些引用将无法解析。';
            if (confirm(msg)) mutate(function () { delete state.profile.keys[n]; });
          }
        }, '删除')
      )
    ));
  });
}

function countKeyUsage(name) {
  var places = [];
  var profile = state.profile;
  function checkGestures(container, where) {
    ['tap', 'doubleTap', 'longPress', 'hold'].forEach(function (f) {
      var g = container[f];
      if (isPlainObject(g) && g.ref === name) places.push(where + ' ' + f);
    });
    if (isPlainObject(container.swipe)) {
      FE.SWIPE_DIRS.forEach(function (d) {
        var g = container.swipe[d];
        if (isPlainObject(g) && g.ref === name) places.push(where + ' swipe.' + d);
      });
    }
    (Array.isArray(container.variants) ? container.variants : []).forEach(function (v, i) {
      if (isPlainObject(v)) checkNode(v, where + ' 变体' + i);
    });
    if (isPlainObject(container.override)) checkNode(container.override, where + ' override');
  }
  function checkNode(node, where) {
    if (!isPlainObject(node)) return;
    if (node.ref === name) places.push(where);
    checkGestures(node, where);
  }
  function walkSections(sections, prefix) {
    (Array.isArray(sections) ? sections : []).forEach(function (s, si) {
      if (!isPlainObject(s)) return;
      if (s.type === 'rows') FE.rowsOfSection(s).forEach(function (row, ri) {
        row.keys.forEach(function (k, ki) { checkNode(k, prefix + ' 区段' + si + ' 行' + ri + ' 键' + ki); });
      });
      else if (s.type === 'grid' && Array.isArray(s.keys)) s.keys.forEach(function (k, ki) {
        checkNode(k, prefix + ' 区段' + si + ' 网格键' + ki);
      });
    });
  }
  Object.keys(profile.keys || {}).forEach(function (kn) { checkNode(profile.keys[kn], '按键定义 ' + kn); });
  Object.keys(profile.layouts || {}).forEach(function (ln) {
    var L = profile.layouts[ln];
    if (!isPlainObject(L)) return;
    walkSections(L.sections, ln);
    if (isPlainObject(L.split)) walkSections(L.split.sections, ln + ' 分体');
  });
  return { count: places.length, places: places };
}
FE.countKeyUsage = countKeyUsage;

/* ================================================================
 * 动作与宏 Tab
 * ================================================================ */
function renderActionsTab() {
  renderActionsList();
  renderMacrosList();
}
/* 跨文件调用（macro-editor.js 就绪后要补一次渲染，见该模块末尾） */
FE.renderActionsTab = renderActionsTab;

/* 「动作与宏」页的图形化编辑：控件改动静默写回。
 * 关键：**不能**调 afterChange()/renderAll() —— 那会重建整个列表，
 * 正在操作的下拉框会被销毁、选择丢失。这里只压历史 + 重校验 + 刷新 JSON 文本，
 * 卡片上的徽标由调用方就地更新。结构性改动（增删/换形状）才走 mutate()。 */
function commitActionEdits() {
  state.validation = FE.validateProfile(state.profile);
  autosave();
  renderJsonTab();
  updateUndoButtons();
}

/* 值没变就不压历史，避免「只是重渲染一下」也留一个撤销点 */
function commitIfChanged(getCurrent, next) {
  if (JSON.stringify(next) === JSON.stringify(getCurrent)) return false;
  pushHistory();
  return true;
}

function renderActionsList() {
  var host = $('actions-list');
  if (!host) return;
  clearEl(host);
  var actions = state.profile && isPlainObject(state.profile.actions) ? state.profile.actions : {};
  var names = Object.keys(actions);

  if (!names.length) {
    host.appendChild(h('div', { class: 'status' },
      '尚无动作定义。动作是可复用的单个动作，可被按键以字符串形式引用，如 "tap": "my.action"。'));
  }

  /* buildActionDefEditor 来自 macro-editor.js，它排在 app.js 之后加载，
   * 而 boot() 在 app.js 加载时就跑过一次 —— 首次渲染时可能还没就绪。
   * 那时给出占位，加载完成后由 macro-editor.js 触发重渲染。 */
  if (typeof FE.buildActionDefEditor !== 'function') {
    if (names.length) host.appendChild(h('div', { class: 'status' }, '正在载入图形化编辑器…'));
    appendActionAddRow(host);
    return;
  }

  names.forEach(function (n) {
    var badge = h('span', { class: 'def-badges' }, FE.actionDisplay(actions[n]));
    var item = h('div', { class: 'def-item col def-gui' },
      h('div', { class: 'def-main' },
        h('code', { class: 'def-name' }, n),
        badge,
        h('button', {
          class: 'danger mini-button',
          onclick: function () {
            if (!confirm('删除动作 “' + n + '”？引用它的地方会变成未解析引用。')) return;
            mutate(function () { delete state.profile.actions[n]; });
          }
        }, '删除')));

    var ed = FE.buildActionDefEditor(n, actions[n], {
      commit: function (spec) {
        if (!isPlainObject(spec)) return;
        /* 从 state.profile 取实时值：撤销 / 导入会整块替换 profile，
         * 闭包里的 actions 只是渲染那一刻的快照，不能当作事实来源。 */
        var live = isPlainObject(state.profile.actions) ? state.profile.actions : (state.profile.actions = {});
        if (!commitIfChanged(live[n], spec)) { badge.textContent = FE.actionDisplay(spec); return; }
        live[n] = spec;
        badge.textContent = FE.actionDisplay(spec);
        commitActionEdits();
      },
      onReplace: function (spec) {
        /* 形状可能完全变了（如从 key 变成 modifier）：整列表重建最稳妥。
         * 此刻用户刚关掉对话框，重建不会打断他正在操作的控件。 */
        mutate(function () { state.profile.actions[n] = spec; });
      }
    });
    item.appendChild(ed.el);
    host.appendChild(item);
  });

  appendActionAddRow(host);
}

function appendActionAddRow(host) {
  var addName = h('input', { type: 'text', placeholder: '新动作名称，如 editor.select_all', class: 'mini-input wide' });
  host.appendChild(h('div', { class: 'toolbar' },
    addName,
    h('button', {
      type: 'button', class: 'mini-button',
      onclick: function () {
        var n = addName.value.trim();
        if (!n) { alert('请输入动作名称'); return; }
        if (state.profile.actions[n]) { alert('动作已存在'); return; }
        mutate(function () { state.profile.actions[n] = { type: 'key', key: 'A' }; });
      }
    }, '+ 新增动作')
  ));
}

function renderMacrosList() {
  var host = $('macros-list');
  if (!host) return;
  clearEl(host);
  var macros = state.profile && isPlainObject(state.profile.macros) ? state.profile.macros : {};
  var names = Object.keys(macros);

  if (!names.length) {
    host.appendChild(h('div', { class: 'status' },
      '尚无宏。宏是有序的动作步骤序列，用 { "macro": "名称" } 在被按键调用。'));
  }

  if (typeof FE.buildMacroStepEditor !== 'function') {
    if (names.length) host.appendChild(h('div', { class: 'status' }, '正在载入图形化编辑器…'));
    appendMacroAddRow(host);
    return;
  }

  names.forEach(function (n) {
    var badge = h('span', { class: 'def-badges' }, FE.describeMacroSteps(macros[n]));
    var item = h('div', { class: 'def-item col def-gui' },
      h('div', { class: 'def-main' },
        h('code', { class: 'def-name' }, n),
        badge,
        h('button', {
          class: 'danger mini-button',
          onclick: function () {
            if (!confirm('删除宏 “' + n + '”？引用它的地方会变成未解析引用。')) return;
            mutate(function () { delete state.profile.macros[n]; });
          }
        }, '删除')));

    var ed = FE.buildMacroStepEditor(macros[n], {
      commit: function (steps) {
        if (!Array.isArray(steps)) return;
        /* 同上：实时读取，不依赖渲染时的快照 */
        var live = isPlainObject(state.profile.macros) ? state.profile.macros : (state.profile.macros = {});
        commitIfChanged(live[n], steps);
        live[n] = steps;
        badge.textContent = FE.describeMacroSteps(steps);
        commitActionEdits();
      }
    });
    item.appendChild(ed.el);
    host.appendChild(item);
  });

  appendMacroAddRow(host);
}

function appendMacroAddRow(host) {
  var addName = h('input', { type: 'text', placeholder: '新宏名称，如 delete_to_line_start', class: 'mini-input wide' });
  host.appendChild(h('div', { class: 'toolbar' },
    addName,
    h('button', {
      type: 'button', class: 'mini-button',
      onclick: function () {
        var n = addName.value.trim();
        if (!n) { alert('请输入宏名称'); return; }
        if (state.profile.macros[n]) { alert('宏已存在'); return; }
        mutate(function () { state.profile.macros[n] = [{ action: { type: 'key', key: 'BACKSPACE' } }]; });
      }
    }, '+ 新增宏')
  ));
}

/* ================================================================
 * JSON Tab
 * ================================================================ */
function renderJsonTab() {
  var ta = $('json-editor');
  if (!ta) return;
  if (document.activeElement === ta) return;
  /* 用户手改过且尚未应用时，保留其文本不被覆盖 */
  if (state.jsonDirty) return;
  ta.value = FE.serializeProfile(state.profile, state.includeType);
  checkJsonText();
}

/* ================================================================
 * 总渲染
 * ================================================================ */
function renderAll() {
  renderPreview();
  renderLayoutTab();
  renderKeysTab();
  renderActionsTab();
  renderJsonTab();
  renderOps();
  updateUndoButtons();
  if (FE.renderPopupTab) FE.renderPopupTab();
}

function renderOps() {
  var a = $('op-author'), t = $('op-type');
  if (a && document.activeElement !== a) a.value = state.profile && state.profile.author != null ? String(state.profile.author) : '';
  if (t) t.checked = state.includeType !== false;
  if (FE.renderFolderOps) renderFolderOps();
}

function updateUndoButtons() {
  /* 两处入口：顶栏右侧常驻按钮 + 「布局与文件操作」卡片内按钮，状态保持同步 */
  var u = $('op-undo'), r = $('op-redo');
  if (u) { u.disabled = !state.history.length; u.title = state.history.length ? '撤销' : '没有可撤销的操作'; }
  if (r) { r.disabled = !state.future.length; r.title = state.future.length ? '重做' : '没有可重做的操作'; }
  var tu = $('top-undo'), tr = $('top-redo');
  if (tu) {
    tu.disabled = !state.history.length;
    tu.title = (state.history.length ? '撤销' : '没有可撤销的操作') + ' (Ctrl+Z)';
  }
  if (tr) {
    tr.disabled = !state.future.length;
    tr.title = (state.future.length ? '重做' : '没有可重做的操作') + ' (Ctrl+Y)';
  }
}

function downloadJson(text, name) {
  var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name || 'foxy-layout.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* 导出布局文本。若当前来自「导入文件夹」，把未被改动的共享定义剥离回
 * definitions.json，还原成运行时那套分包结构（薄布局 + definitions.json）。 */
function exportLayoutText() {
  if (state.folderDefs && state.folderPlan && FE.splitProfileForExport) {
    var r = FE.splitProfileForExport(state.profile, state.folderDefs);
    var n = r.split.stripped.length;
    return {
      text: FE.serializeProfile(r.layout, state.includeType),
      note: n
        ? '已导出 ' + state.fileName + '（剥离 ' + n + ' 项来自 definitions.json 的定义；' +
          '共享定义用「导出 definitions」还原）'
        : '已导出 ' + state.fileName + '（没有可剥离的共享定义）'
    };
  }
  return {
    text: FE.serializeProfile(state.profile, state.includeType),
    note: '已导出 ' + (state.fileName || 'foxy-layout.json')
  };
}

/* 读单个 File 为文本（Promise 封装，便于按序读取整个文件夹） */
function readFileText(file) {
  return new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result)); };
    reader.onerror = function () { resolve(null); };
    try { reader.readAsText(file, 'utf-8'); } catch (e) { resolve(null); }
  });
}

/* 把识别结果装入编辑器：合并共享定义 → 自包含 profile → 自动关联弹出菜单 */
function loadFromFolderPlan(plan, layoutPath) {
  var built = FE.buildProfileFromPlan(plan, layoutPath);
  if (!built) { setOpStatus('该文件夹里没有可用的布局文件', 'error'); return false; }
  /* 先关联弹出菜单（它内部会渲染一次），随后用新布局再渲染一次 */
  if (built.popupMatch && built.popupMatch.covered > 0 && FE.loadPopupProfileText) {
    FE.loadPopupProfileText(built.popupMatch.entry.text, built.popupMatch.entry.name);
  }
  state.profile = FE.normalizeProfile(built.profile);
  state.folderPlan = plan;
  state.folderDefs = plan.definitions ? plan.definitions.data : null;
  state.folderLayoutPath = built.entry.path;
  state.folderHint = null;   // 整包已识别，补全提示随之失效
  state.fileName = built.entry.name;
  state.layoutName = state.profile.layouts['default'] ? 'default'
    : (Object.keys(state.profile.layouts)[0] || null);
  state.sel = null;
  state.history = [];
  state.future = [];
  afterChange();
  return true;
}
FE.loadFromFolderPlan = loadFromFolderPlan;

/* 文件夹识别结果面板：包内布局下拉 + 共享定义/弹出菜单关联说明 */
function renderFolderOps() {
  var box = $('op-folder'), sel = $('op-folder-layout'), rep = $('op-folder-report');
  var defsBtn = $('op-export-defs');
  if (defsBtn) defsBtn.hidden = !state.folderDefs;
  /* 提示行由 state.folderHint 派生：加载示例 / JSON 页应用 / 整包导入后都会随之消失，
   * 不能直接改 DOM，否则会残留一条过期提示。 */
  var hintRow = $('op-folder-hint'), hintTxt = $('op-folder-hint-text');
  if (hintRow) hintRow.hidden = !state.folderHint;
  if (hintTxt) { clearEl(hintTxt); if (state.folderHint) hintTxt.append(state.folderHint); }
  if (!box || !sel) return;
  var plan = state.folderPlan;
  if (!plan || !plan.layouts.length) { box.hidden = true; if (rep) clearEl(rep); return; }
  box.hidden = false;
  clearEl(sel);
  plan.layouts.forEach(function (it) {
    sel.appendChild(h('option', { value: it.path }, it.path));
  });
  sel.value = state.folderLayoutPath || (plan.layouts[0] && plan.layouts[0].path) || '';
  if (!rep) return;
  clearEl(rep);
  rep.className = 'status ' + (plan.errors.length ? 'warn' : 'ok');
  var built = FE.buildProfileFromPlan(plan, state.folderLayoutPath);
  var parts = [FE.describePlan(plan)];
  if (built && built.report.keys.length) {
    parts.push('并入共享键 ' + built.report.keys.length +
      (built.report.overridden.length ? '（本地覆盖 ' + built.report.overridden.length + '）' : ''));
  }
  if (built && built.report.macros.length) parts.push('宏 ' + built.report.macros.length + ' 个');
  if (built && built.popupMatch && built.popupMatch.covered > 0) {
    parts.push('弹出菜单 ' + built.popupMatch.entry.name + '（覆盖 ' +
      built.popupMatch.covered + '/' + built.popupMatch.total + ' 个 popupKey）');
  }
  rep.append('✓ ' + parts.join(' · '));
  if (built && built.popupMatch && built.popupMatch.missing.length) {
    rep.append(h('div', { class: 'st-warn' },
      '弹出菜单里缺少这些 popupKey：' + built.popupMatch.missing.join('、')));
  }
  plan.errors.forEach(function (e) { rep.append(h('div', { class: 'st-warn' }, '· ' + e)); });
  plan.warnings.forEach(function (w) { rep.append(h('div', { class: 'st-warn' }, '· ' + w)); });
}
FE.renderFolderOps = renderFolderOps;

/* ================================================================
 * 顶部工具栏 / 标签页 / 事件绑定
 * ================================================================ */
function initTabs() {
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateTab(btn.dataset.tab);
      var ta = $('json-editor');
      if (ta) {
        // 布局类各页（布局编辑/按键定义/动作与宏）与布局 JSON 上下文联动；
        // 弹出菜单是独立文档，不联动。
        if (btn.dataset.tab === 'tab-layout' || btn.dataset.tab === 'tab-keys' ||
          btn.dataset.tab === 'tab-actions') renderJsonTab();
      }
    });
  });
}

function initToolbar() {
  /* 布局选择 */
  $('layout-select').addEventListener('change', function () {
    state.layoutName = this.value || null;
    state.sel = null;
    renderAll();
  });
  $('layout-add').addEventListener('click', function () {
    var name = prompt('新布局名称（如 luna_pinyin）：');
    if (!name) return;
    name = name.trim();
    if (!name || state.profile.layouts[name]) { if (name) alert('布局已存在'); return; }
    mutate(function () {
      state.profile.layouts[name] = { sections: [{ type: 'rows', rows: [[{ ref: 'rime.a' }]] }] };
      state.layoutName = name;
    });
  });
  $('layout-dup').addEventListener('click', function () {
    var src = state.layoutName;
    if (!src) return;
    var name = prompt('复制 “' + src + '” 为新布局名称：');
    if (!name) return;
    name = name.trim();
    if (!name || state.profile.layouts[name]) { if (name) alert('布局已存在'); return; }
    mutate(function () {
      state.profile.layouts[name] = deepClone(state.profile.layouts[src]);
      state.layoutName = name;
    });
  });
  $('layout-rename').addEventListener('click', function () {
    var old = state.layoutName;
    if (!old) return;
    var name = prompt('重命名布局 “' + old + '” 为：', old);
    if (!name || name === old) return;
    name = name.trim();
    if (state.profile.layouts[name]) { alert('布局已存在'); return; }
    mutate(function () {
      var layouts = state.profile.layouts;
      var entries = Object.keys(layouts).map(function (k) { return [k === old ? name : k, layouts[k]]; });
      state.profile.layouts = {};
      entries.forEach(function (e) { state.profile.layouts[e[0]] = e[1]; });
      /* 更新布局变体引用与 switch_layout 动作 */
      Object.keys(state.profile.layouts).forEach(function (ln) {
        var L = state.profile.layouts[ln];
        (Array.isArray(L.variants) ? L.variants : []).forEach(function (v) { if (v && v.layout === old) v.layout = name; });
      });
      walkAllActions(function (a) { if (a && a.type === 'switch_layout' && a.layout === old) a.layout = name; });
      state.layoutName = name;
    });
  });
  $('layout-del').addEventListener('click', function () {
    var name = state.layoutName;
    if (!name) return;
    if (!confirm('删除布局 “' + name + '”？此操作不可逆（可用撤销恢复）。')) return;
    mutate(function () {
      delete state.profile.layouts[name];
      var names = Object.keys(state.profile.layouts);
      state.layoutName = state.profile.layouts['default'] ? 'default' : (names[0] || null);
    });
  });

  /* ---------------- 文件操作 ----------------
   * 单一入口「导入 JSON」：既吃单个布局文件，也吃整个布局包。
   * 布局包是 Foxy 运行时的常态 —— 共享定义在 frontend/definitions.json，布局文件里
   * 只写自己特有的键，其余全靠引用共享定义。因此：
   *   · 一次选中多个文件（含 definitions.json + layouts/ + popups/）→ 当作整包合并；
   *   · 只选中 definitions.json → 自动接一步「选同文件夹」，把关联文件全部认出来；
   *   · 单文件布局导入后若仍有 ref 无法解析 → 就地提示补全。
   * 浏览器只把「用户选中的文件」交给网页、不提供其所在目录信息，所以补全必须再取
   * 一次文件夹授权，无法仅凭文件名反推同目录。 */
  function filesToEntries(files) {
    return Promise.all(files.map(function (f) {
      return readFileText(f).then(function (text) {
        return text == null ? null : {
          name: f.name,
          path: f.webkitRelativePath || f.name,
          text: text
        };
      });
    })).then(function (list) { return list.filter(Boolean); });
  }

  /* 提示行：只改 state.folderHint，实际显隐由 renderFolderOps() 派生渲染。
   * 这样加载示例 / JSON 页应用 / 整包导入时提示会随新状态自动消失，不会残留。 */
  function showFolderHint(msg) {
    state.folderHint = msg || null;
    if (FE.renderFolderOps) renderFolderOps();
  }
  function hideFolderHint() {
    state.folderHint = null;
    if (FE.renderFolderOps) renderFolderOps();
  }

  /* 尽力自动接一步「选文件夹」。但必须清楚：**这不可靠** ——
   * 浏览器把「用户激活」消耗在第一次文件选择上了，紧接着程序化 click() 打开文件对话框
   * 常被静默拦掉（Chrome 的 user-activation 限制），所以外部表现就是「点了没反应」。
   * 因此它只是 best-effort：真正兜底的是提示行里那个高亮的「选择文件夹…」按钮。
   * 不要在提示文案里承诺「正在自动读取」—— 拦掉时就成了假承诺。 */
  function requestFolderPick() {
    var dirInput = $('op-import-dir-file');
    if (!dirInput) return;
    try { dirInput.click(); } catch (e) { /* 被拦掉则依赖提示行按钮 */ }
  }

  /* 用一整包文件装入编辑器；pickName 指定优先载入哪个布局 */
  function importPackage(entries, pickName) {
    var plan = FE.planFolderImport(entries);
    if (!plan.layouts.length) {
      setOpStatus('没有找到布局文件（foxy.keyboard-layout）：' + plan.errors.join('；'), 'error');
      return false;
    }
    var pick = null;
    if (pickName) {
      pick = plan.layouts.filter(function (it) { return it.name === pickName; })[0] || null;
    }
    if (!pick) pick = plan.layouts.filter(function (it) { return /^default\.json$/i.test(it.name); })[0];
    if (!pick) pick = plan.layouts[0];
    if (!loadFromFolderPlan(plan, pick.path)) return false;
    hideFolderHint();
    var rep = FE.inspectJsonText(pick.text);
    var note = rep.total ? '（该文件已自动修复 ' + rep.total + ' 处语法问题）' : '';
    setOpStatus('已识别布局包：载入 ' + pick.path + note + ' —— ' + FE.describePlan(plan), 'ok');
    setJsonStatus('✓ 已导入 ' + pick.name + '（已合并 definitions.json 共享定义）', 'ok');
    return true;
  }

  /* 读文件夹并把整包认出来（自动接续与按钮兜底共用） */
  function importFromDirectoryInput(input) {
    var files = input.files ? Array.prototype.slice.call(input.files) : [];
    input.value = '';
    var jsons = files.filter(function (f) { return /\.json$/i.test(f.name || ''); });
    if (!jsons.length) {
      setOpStatus('所选文件夹里没有 JSON 文件', 'error');
      return;
    }
    setOpStatus('正在识别同文件夹的 ' + jsons.length + ' 个 JSON 文件…', '');
    filesToEntries(jsons).then(function (entries) {
      importPackage(entries);
    }).catch(function (e) {
      setOpStatus('读取文件夹失败: ' + (e && e.message ? e.message : e), 'error');
    });
  }

  $('op-import').addEventListener('click', function () { $('op-import-file').click(); });
  $('op-import-file').addEventListener('change', function () {
    var files = this.files ? Array.prototype.slice.call(this.files) : [];
    this.value = '';
    if (!files.length) return;

    /* 多选：当作一个小型布局包处理 */
    if (files.length > 1) {
      filesToEntries(files).then(function (entries) { importPackage(entries); });
      return;
    }

    var file = files[0];
    readFileText(file).then(function (text) {
      if (text == null) { setOpStatus('读取 ' + file.name + ' 失败', 'error'); return; }
      var cls = FE.classifyFoxyFile(text, file.name);

      /* 选中的是 definitions.json：它自己不是布局，必须补同文件夹的布局与弹出菜单 */
      if (cls.kind === 'definitions') {
        var n = 0;
        ['keys', 'actions', 'macros'].forEach(function (s) {
          if (cls.data && isPlainObject(cls.data[s])) n += Object.keys(cls.data[s]).length;
        });
        setOpStatus('已识别 ' + file.name + '（' + n + ' 项共享定义）。'
          + '还需选择一次布局包所在的文件夹，才能读取同目录的布局与弹出菜单。', 'warn');
        showFolderHint('还需选择一次布局包所在的文件夹 ——「' + file.name + '」本身只是共享定义，'
          + '不是键盘布局，且浏览器不会透露所选文件所在目录，无法自动读取同目录的其他文件。'
          + '请点右侧「选择文件夹…」，选中它所在的文件夹，编辑器会自动识别其中的 layouts / popups 并完成合并。');
        requestFolderPick();
        return;
      }

      /* 选中的是弹出菜单文件：路由到弹出菜单页 */
      if (cls.kind === 'popup') {
        if (FE.loadPopupProfileText && FE.loadPopupProfileText(text, file.name)) {
          setOpStatus('已导入弹出菜单 ' + file.name, 'ok');
        }
        return;
      }

      var rep = FE.inspectJsonText(text);
      if (applyProfileText(text)) {
        state.fileName = file.name;
        if (rep.total) {
          /* 文件有问题但可自动修复：明确告知修了什么 */
          setOpStatus('已导入 ' + file.name + '：检测到并自动修复 ' + rep.total + ' 处问题 —— ' + formatIssueList(rep.issues), 'warn');
          setJsonStatus('导入 ' + file.name + ' 时自动修复 ' + rep.total + ' 处问题：' + formatIssueList(rep.issues), 'warn');
        } else {
          setOpStatus('已导入 ' + file.name, 'ok');
          setJsonStatus('✓ 已导入 ' + file.name + '，JSON 语法检查通过', 'ok');
        }
        /* 单文件常见于分包布局：引用解析不了是因为定义在同文件夹的 definitions.json */
        var unresolved = state.validation.issues.filter(function (it) {
          return it.code === 'unresolved-ref';
        });
        if (unresolved.length) {
          showFolderHint('这个文件有 ' + unresolved.length + ' 处引用无法解析（如 “'
            + unresolved[0].message.replace(/^.*?无法解析[:：]?\s*/, '').slice(0, 24)
            + '”）。若它的共享定义在 definitions.json 里，请点右侧「选择文件夹…」'
            + '选中该布局包所在的文件夹，即可自动合并共享定义。');
        } else {
          hideFolderHint();
        }
      } else {
        /* 无法解析：把原文放进布局 JSON 卡片（现位于布局编辑页底部），并展示问题 + 一键修复入口 */
        var ta = $('json-editor');
        if (ta) { ta.value = text; state.jsonDirty = true; }
        checkJsonText();
        var extra = rep.total ? '（检测到 ' + rep.total + ' 处可修复问题，可点击「一键修复并应用」）' : '';
        setOpStatus('无法直接读取 ' + file.name + '：' + (state.lastParseError || 'JSON 语法错误') + extra + ' 已把原文载入布局 JSON 卡片', 'error');
        setJsonStatus('✗ ' + file.name + ' 无法解析: ' + (state.lastParseError || '') + extra, 'error');
      }
    });
  });

  /* 文件夹补全（提示行按钮的手动兜底；自动触发走的也是这个 input） */
  $('op-import-dir-file').addEventListener('change', function () {
    importFromDirectoryInput(this);
  });
  $('op-folder-complete').addEventListener('click', function () {
    $('op-import-dir-file').click();
  });
  $('op-folder-load').addEventListener('click', function () {
    var sel = $('op-folder-layout');
    if (!sel || !sel.value) return;
    if (!loadFromFolderPlan(state.folderPlan, sel.value)) return;
    setOpStatus('已切换到包内布局 ' + sel.value, 'ok');
  });
  $('op-export').addEventListener('click', function () {
    var res = exportLayoutText();
    downloadJson(res.text, state.fileName || 'foxy-layout.json');
    setOpStatus(res.note, 'ok');
  });
  $('op-export-defs').addEventListener('click', function () {
    if (!state.folderDefs) { setOpStatus('当前不是文件夹导入，没有可导出的 definitions.json', 'warn'); return; }
    var text = FE.serializeDefinitions(state.folderDefs);
    downloadJson(text, 'definitions.json');
    setOpStatus('已导出 definitions.json（原样保留识别时的共享定义）', 'ok');
  });

  /* 示例（已打包进 js/examples-bundle.js，file:// 直开无需服务器）。
   * 列表由 EXAMPLE_META 动态生成，弹出菜单类文件只在弹出菜单页出现 */
  var ex = $('op-example');
  ex.appendChild(h('option', { value: '__builtin__' }, '内置默认布局（layout-variant）'));
  if (FE.EXAMPLE_META) {
    Object.keys(FE.EXAMPLE_META).sort().forEach(function (n) {
      if (FE.EXAMPLE_META[n].kind === 'popup') return;
      ex.appendChild(h('option', { value: n }, n));
    });
  }
  $('op-load-example').addEventListener('click', function () {
    var v = ex.value;
    if (!v) return;
    var text;
    if (v === '__builtin__') text = FE.DEFAULT_PROFILE_TEXT;
    else text = FE.EXAMPLE_FILES ? FE.EXAMPLE_FILES[v] : null;
    if (text == null) { setOpStatus('示例未找到: ' + v, 'error'); return; }
    /* 弹出菜单文件误入布局下拉时自动路由 */
    if (v !== '__builtin__' && FE.EXAMPLE_META && FE.EXAMPLE_META[v] && FE.EXAMPLE_META[v].kind === 'popup') {
      if (FE.loadPopupProfileText && FE.loadPopupProfileText(text, v)) return;
    }
    if (applyProfileText(text)) {
      state.fileName = (v === '__builtin__') ? 'layout-variant.json' : v;
      setOpStatus('已加载示例 ' + state.fileName, 'ok');
    }
  });

  $('op-undo').addEventListener('click', undo);
  $('op-redo').addEventListener('click', redo);
  var topUndo = $('top-undo'), topRedo = $('top-redo');
  if (topUndo) topUndo.addEventListener('click', undo);
  if (topRedo) topRedo.addEventListener('click', redo);

  /* author / type */
  var authorInp = $('op-author');
  authorInp.addEventListener('change', function () {
    mutate(function () {
      if (authorInp.value.trim() === '') delete state.profile.author;
      else state.profile.author = authorInp.value.trim();
    });
  });
  var typeChk = $('op-type');
  typeChk.addEventListener('change', function () {
    state.includeType = typeChk.checked;
    autosave();
    renderJsonTab();
    renderOps();
  });

  /* JSON tab */
  $('json-apply').addEventListener('click', function () {
    var ta = $('json-editor');
    var rep = FE.inspectJsonText(ta.value);
    if (applyProfileText(ta.value)) {
      setOpStatus('JSON 已应用', 'ok');
      if (rep.total) {
        setJsonStatus('✓ 已应用（自动修复 ' + rep.total + ' 处问题：' + formatIssueList(rep.issues) + '）', 'warn');
        renderJsonIssues(FE.inspectJsonText(ta.value), '已修复 ' + rep.total + ' 处问题并应用：' + formatIssueList(rep.issues));
      } else {
        setJsonStatus('✓ 已应用；校验结果见预览下方状态栏', 'ok');
      }
    } else {
      setJsonStatus('✗ 未应用（原文保留）。错误: ' + (state.lastParseError || '未知'), 'error');
      renderJsonIssues(rep); /* 展示问题列表与「一键修复」入口 */
    }
  });
  $('json-check').addEventListener('click', function () {
    var rep = checkJsonText();
    if (!rep) return;
    if (rep.issues.length) setJsonStatus('检测到 ' + rep.total + ' 处可修复问题，见上方提示（可一键修复）', 'warn');
    else if (rep.parseOk) setJsonStatus('✓ JSON 语法检查通过', 'ok');
    else setJsonStatus('✗ JSON 无法解析: ' + (rep.parseError || ''), 'error');
  });
  $('json-format').addEventListener('click', function () {
    var ta = $('json-editor');
    var rep = FE.inspectJsonText(ta.value);
    if (!rep.parseOk) {
      setJsonStatus('JSON 无效: ' + (rep.parseError || '') +
        (rep.total ? '（检测到 ' + rep.total + ' 处可修复问题，可先「一键修复」）' : ''), 'error');
      renderJsonIssues(rep);
      return;
    }
    ta.value = JSON.stringify(JSON.parse(rep.fixedText), null, 2);
    state.jsonDirty = true;
    if (rep.total) {
      setJsonStatus('已格式化并修复 ' + rep.total + ' 处问题（尚未应用）', 'ok');
      renderJsonIssues(FE.inspectJsonText(ta.value), '已修复 ' + rep.total + ' 处问题：' + formatIssueList(rep.issues) + '（尚未应用）');
    } else {
      setJsonStatus('已格式化（尚未应用）', 'ok');
      renderJsonIssues(FE.inspectJsonText(ta.value));
    }
  });
  $('json-copy').addEventListener('click', function () {
    var ta = $('json-editor');
    ta.select();
    try {
      document.execCommand('copy');
      setJsonStatus('已复制到剪贴板', 'ok');
    } catch (e) {
      setJsonStatus('复制失败，请手动选择复制', 'error');
    }
  });
  /* 编辑时自动检查（防抖），发现问题即时提醒 */
  var jsonTa = $('json-editor');
  jsonTa.addEventListener('input', function () {
    state.jsonDirty = true;
    scheduleJsonCheck();
  });

  /* 高度覆盖（一次性绑定，值由 renderLayoutSettings 同步） */
  var hp = $('ls-height-p'), hl = $('ls-height-landscape');
  function bindHeightInput(inp, field) {
    inp.addEventListener('change', function () {
      mutate(function () {
        var l = curLayout();
        if (!l) return;
        var txt = inp.value.trim();
        if (txt === '') {
          if (isPlainObject(l.override)) { delete l.override[field]; if (!Object.keys(l.override).length) delete l.override; }
          return;
        }
        var pct = parseFloat(txt);
        if (!isFinite(pct)) return;
        pct = clamp(pct, 10, 90);
        if (!isPlainObject(l.override)) l.override = {};
        l.override[field] = Math.round(pct) / 100;
      });
    });
  }
  if (hp) bindHeightInput(hp, 'keyboardHeightPercent');
  if (hl) bindHeightInput(hl, 'keyboardHeightPercentLandscape');

  /* 按键定义过滤 */
  $('keys-filter').addEventListener('input', renderKeysTab);
  $('keys-add').addEventListener('click', function () {
    var name = prompt('新按键定义名称（如 my.tab）：');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    if (state.profile.keys[name]) { alert('按键定义已存在'); return; }
    mutate(function () {
      state.profile.keys[name] = { ref: 'rime.Tab' };
    });
    if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'definition', name: name });
  });

  /* 预览控件 */
  $('pt-shift').addEventListener('change', function () { state.status.shift = this.checked; renderPreview(); });
  $('pt-composing').addEventListener('change', function () { state.status.composing = this.checked; renderPreview(); });
  $('pt-ascii').addEventListener('change', function () { state.status.ascii_mode = this.checked; renderPreview(); });
  $('pt-disabled') && $('pt-disabled').addEventListener('change', function () { state.status.disabled = this.checked; renderPreview(); });
  $('pt-theme').addEventListener('change', function () { state.theme = this.value; renderPreview(); });
  $('pt-status-text').addEventListener('input', function () { state.statusSample = this.value; renderPreview(); });
  $('pt-split') && $('pt-split').addEventListener('change', function () {
    state.splitMode = this.checked;
    state.sel = null;
    // 分体↔竖屏切换时类名立即生效（.kb 无宽度动画），但浏览器 layout 未必
    // 同步完成；等一帧再按最终宽度渲染，否则切回竖屏那一帧会量到收缩中的
    // 宽值，portraitW 被污染后字和行高一起变大且回不来。
    renderPreview();
    renderLayoutTab();
    requestAnimationFrame(function () { renderPreview(); });
  });

  /* 预览 details 展开时重新测量 */
  var pd = document.querySelector('.preview-panel');
  if (pd) pd.addEventListener('toggle', function () { if (pd.open) renderPreview(); });

  /* 快捷键 */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
  });

  /* 窗口尺寸变化 → 重渲染预览 */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPreview, 150);
  });
}

function walkAllActions(cb) {
  var profile = state.profile;
  function walkAction(a) {
    if (isPlainObject(a)) cb(a);
  }
  function walkGesture(g) {
    if (!isPlainObject(g)) return;
    if (g.type != null) walkAction(g);
    if (isPlainObject(g.action)) walkAction(g.action);
    else if (Array.isArray(g.action)) g.action.forEach(walkAction);
    if (Array.isArray(g.actions)) g.actions.forEach(walkAction);
    walkAction(g.start);
    walkAction(g.end);
  }
  function walkKeyContainer(c) {
    if (!isPlainObject(c)) return;
    ['tap', 'doubleTap', 'longPress', 'hold'].forEach(function (f) { walkGesture(c[f]); });
    if (isPlainObject(c.swipe)) FE.SWIPE_DIRS.forEach(function (d) { walkGesture(c.swipe[d]); });
    (Array.isArray(c.variants) ? c.variants : []).forEach(walkKeyContainer);
    if (isPlainObject(c.override)) walkKeyContainer(c.override);
  }
  function walkSections(sections) {
    (Array.isArray(sections) ? sections : []).forEach(function (s) {
      if (!isPlainObject(s)) return;
      if (s.type === 'rows') FE.rowsOfSection(s).forEach(function (row) { row.keys.forEach(walkKeyContainer); });
      else if (s.type === 'grid' && Array.isArray(s.keys)) s.keys.forEach(walkKeyContainer);
    });
  }
  Object.keys(profile.actions || {}).forEach(function (n) { walkAction(profile.actions[n]); });
  Object.keys(profile.macros || {}).forEach(function (n) {
    (Array.isArray(profile.macros[n]) ? profile.macros[n] : []).forEach(function (step) {
      if (isPlainObject(step) && isPlainObject(step.action)) walkAction(step.action);
      else if (isPlainObject(step) && step.type != null) walkAction(step);
    });
  });
  Object.keys(profile.keys || {}).forEach(function (n) { walkKeyContainer(profile.keys[n]); });
  Object.keys(profile.layouts || {}).forEach(function (ln) {
    var L = profile.layouts[ln];
    if (!isPlainObject(L)) return;
    walkSections(L.sections);
    if (isPlainObject(L.split)) walkSections(L.split.sections);
  });
}

/* ================================================================
 * 启动
 * ================================================================ */
/* 导出供对话框模块（key-dialog.js）使用 */
FE.h = h;
FE.clearEl = clearEl;
FE.$ = $;
FE.curSections = curSections;
FE.getRowKeys = function (section, ri) { return getRowKeys(section, ri); };

function placementContainer(loc) {
  /* 只读解析：不做数组行 → 对象行的转换，避免打开对话框时改动结构 */
  var section = curSections()[loc.s];
  if (!isPlainObject(section)) return null;
  if (loc.r == null) return Array.isArray(section.keys) ? section.keys : null;
  if (!Array.isArray(section.rows)) return null;
  var row = section.rows[loc.r];
  if (Array.isArray(row)) return row;
  if (isPlainObject(row)) {
    if (!Array.isArray(row.keys)) row.keys = [];
    return row.keys;
  }
  return null;
}
FE.placementContainer = placementContainer;

function movePlacement(loc, dr, dk) {
  var section = curSections()[loc.s];
  if (!isPlainObject(section) || loc.r == null) return null;
  var keys = getRowKeys(section, loc.r);
  if (dk !== 0) {
    var nk = loc.k + dk;
    if (nk < 0 || nk >= keys.length) return null;
    var tmp = keys[loc.k]; keys[loc.k] = keys[nk]; keys[nk] = tmp;
    return { s: loc.s, r: loc.r, k: nk };
  }
  if (dr !== 0) {
    var nr = loc.r + dr;
    if (nr < 0 || nr >= section.rows.length) return null;
    var item = keys.splice(loc.k, 1)[0];
    var dst = getRowKeys(section, nr);
    dst.push(item);
    return { s: loc.s, r: nr, k: dst.length - 1 };
  }
  return null;
}
FE.movePlacement = movePlacement;
/* 供测试：指针拖动的落点数据变更（目标解析依赖 elementFromPoint，另在浏览器内验证） */
FE.performChipDrop = performChipDrop;
FE.performGridDrop = performGridDrop;

function boot() {
  initTabs();
  initToolbar();
  var loaded = false;
  try {
    var draft = localStorage.getItem(LS_KEY);
    if (draft) {
      var d = JSON.parse(draft);
      if (d && isPlainObject(d.profile)) {
        state.profile = FE.normalizeProfile(d.profile);
        state.fileName = d.fileName || 'foxy-layout.json';
        state.layoutName = (d.layoutName && d.profile.layouts[d.layoutName]) ? d.layoutName
          : (d.profile.layouts['default'] ? 'default' : Object.keys(d.profile.layouts)[0] || null);
        loaded = true;
      }
    }
  } catch (e) { /* 草稿损坏则回退 */ }
  if (!loaded) {
    var p = JSON.parse(FE.DEFAULT_PROFILE_TEXT);
    FE.normalizeProfile(p);
    state.profile = p;
    state.layoutName = 'default';
  }
  /* 弹出菜单草稿与分体模式（popup-editor.js 随后加载时会再归一化） */
  try {
    var draft2 = localStorage.getItem(LS_KEY);
    if (draft2) {
      var d2 = JSON.parse(draft2);
      if (d2 && d2.popupProfile) {
        state.popupProfile = d2.popupProfile;
        state.popupFileName = d2.popupFileName || 'popups.json';
      }
      if (d2 && d2.splitMode) state.splitMode = !!d2.splitMode;
      if (d2 && d2.includeType === false) state.includeType = false;
    }
  } catch (e2) { /* 忽略 */ }
  state.validation = FE.validateProfile(state.profile);
  renderAll();
  setOpStatus('就绪。修改会实时渲染并自动保存到浏览器。', 'ok');
}

boot();
})();
