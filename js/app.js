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
  layoutName: null,       // 当前正在编辑/预览的命名布局
  status: { composing: false, ascii_mode: false, disabled: false, shift: false },
  statusSample: '朙月拼音',
  theme: 'dark',
  sel: null,              // 选中按键 {s, r, k}
  validation: { errors: [], warnings: [] },
  history: [],
  future: []
};
FE.state = state;
FE.NEUTRAL_STATUS = NEUTRAL_STATUS;

/* ================================================================
 * 三、引用解析引擎
 * ================================================================ */
function userKeys() { return (state.profile && isPlainObject(state.profile.keys)) ? state.profile.keys : {}; }

function lookupDef(name) {
  if (Object.prototype.hasOwnProperty.call(userKeys(), name)) return userKeys()[name];
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

function applyVariants(eff, variants, status, seen) {
  if (!Array.isArray(variants) || !variants.length) return eff;
  var match = null;
  for (var i = 0; i < variants.length; i++) {
    if (variants[i] && variantMatches(variants[i].when, status)) match = variants[i];
  }
  if (!match) return eff;
  var patch = omit(match, ['when']);
  if (typeof match.ref === 'string' && match.ref) {
    var sub = evalKeyRef(match.ref, status, seen);
    var eff2 = sub.eff;
    mergePatch(eff2, omit(patch, ['ref']));
    return eff2;
  }
  mergePatch(eff, patch);
  return eff;
}
FE.applyVariants = applyVariants;

/* 解析用户按键定义引用链：name → ... → 内置/终点 */
function evalKeyRef(refName, status, seen) {
  seen = seen || {};
  var node = lookupDef(refName);
  var result = { eff: {}, chain: [], unresolved: null, cycle: null };
  if (!node) { result.unresolved = refName; return result; }
  if (seen[refName]) { result.cycle = refName; return result; }
  seen[refName] = true;
  result.chain.push(refName);
  if (node.ref != null) {
    if (typeof node.ref !== 'string') { result.unresolved = String(node.ref); return result; }
    var sub = evalKeyRef(node.ref, status, seen);
    result.eff = sub.eff;
    result.chain = sub.chain.concat(result.chain);
    if (sub.unresolved) result.unresolved = sub.unresolved;
    if (sub.cycle) result.cycle = sub.cycle;
  }
  mergePatch(result.eff, omit(node, ['ref', 'variants']));
  result.eff = applyVariants(result.eff, node.variants, status, seen);
  return result;
}
FE.evalKeyRef = evalKeyRef;

/* 解析一个放置（placement）为有效按键对象。
 * 优先级：定义链(含定义变体) < 直接放置字段(含放置变体) < override 变体与字段 */
FE.evalPlacement = function (placement, status) {
  status = status || NEUTRAL_STATUS;
  var out = { eff: {}, chain: [], unresolved: null, cycle: null, placement: placement || {} };
  if (isPlainObject(placement) && typeof placement.ref === 'string' && placement.ref) {
    var sub = evalKeyRef(placement.ref, status);
    out.eff = sub.eff;
    out.chain = sub.chain;
    out.unresolved = sub.unresolved;
    out.cycle = sub.cycle;
  }
  if (isPlainObject(placement)) {
    mergePatch(out.eff, omit(placement, ['ref', 'override', 'variants']));
    out.eff = applyVariants(out.eff, placement.variants, status);
    if (isPlainObject(placement.override)) {
      mergePatch(out.eff, omit(placement.override, ['variants']));
      out.eff = applyVariants(out.eff, placement.override.variants, status);
    }
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
 * 支持字符串(actions 名)、数组、{macro}、{action}/{actions}、直接动作对象 */
FE.resolveActionSpec = function (spec) {
  if (spec == null) return null;
  if (typeof spec === 'string') {
    var a = (state.profile && isPlainObject(state.profile.actions)) ? state.profile.actions[spec] : null;
    if (a != null) return { actions: [deepClone(a)], display: '动作 ' + spec, kind: 'action-name', name: spec };
    return { actions: [], display: '未解析动作 ' + spec, unresolved: spec, kind: 'action-name', name: spec };
  }
  if (Array.isArray(spec)) {
    return { actions: spec.map(deepClone), display: spec.length ? spec.length + ' 个动作' : '空动作列表', kind: 'list' };
  }
  if (isPlainObject(spec)) {
    if (spec.macro != null) {
      var m = (state.profile && isPlainObject(state.profile.macros)) ? state.profile.macros[spec.macro] : null;
      var disp = '宏 ' + spec.macro + (Array.isArray(m) ? '（' + m.length + ' 步）' : '');
      var r = { actions: [deepClone(spec)], display: m ? disp : '未解析宏 ' + spec.macro, kind: 'macro', name: spec.macro };
      if (!m) r.unresolved = spec.macro;
      return r;
    }
    if (spec.action != null) return FE.resolveActionSpec(spec.action);
    if (spec.actions != null) return FE.resolveActionSpec(spec.actions);
    if (spec.type != null) return { actions: [deepClone(spec)], display: FE.actionDisplay(spec), kind: 'direct' };
  }
  return null;
};

/* 有效点击手势信息：{action, label, popup} */
FE.tapInfo = function (eff, status, depth) {
  depth = depth || 0;
  if (depth > 12 || !isPlainObject(eff)) return null;
  var t = eff.tap;
  if (t == null) return null;
  if (typeof t === 'string') {
    var r = FE.resolveActionSpec(t);
    return r ? { action: r, label: null, popup: undefined } : null;
  }
  if (!isPlainObject(t)) return null;
  if (t.ref != null) {
    if (typeof t.ref !== 'string') return null;
    var sub = FE.evalPlacement({ ref: t.ref }, status);
    var nested = FE.tapInfo(sub.eff, status, depth + 1);
    var label = null;
    if (t.label != null) label = t.label;
    else if (nested && nested.label != null && nested.label !== '') label = nested.label;
    else label = rawLabelOf(sub.eff, status, depth + 1);
    return {
      action: nested ? nested.action : null,
      label: label,
      popup: t.popup != null ? t.popup : (nested ? nested.popup : undefined)
    };
  }
  var act = FE.resolveActionSpec(
    t.action != null ? t.action :
    (t.actions != null ? t.actions :
      (t.macro != null ? t : (t.type != null ? t : null)))
  );
  return { action: act, label: t.label != null ? t.label : null, popup: t.popup != null ? t.popup : undefined };
};

/* 主标签原始值（不应用 Shift 状态）：tap 标签优先，其次外层 label */
function rawLabelOf(eff, status, depth) {
  depth = depth || 0;
  if (depth > 12 || !isPlainObject(eff)) return null;
  var ti = FE.tapInfo(eff, status, depth + 1);
  if (ti && ti.label != null && String(ti.label) !== '') return String(ti.label);
  if (eff.label != null) return String(eff.label);
  return null;
}
FE.rawLabelOf = rawLabelOf;

/* 手势对象 → {label, action, popup, repeat, popupKey, start, end, raw} */
FE.gestureInfo = function (g, status, depth) {
  if (g == null) return null;
  if (typeof g === 'string') {
    return { raw: g, action: FE.resolveActionSpec(g), label: null };
  }
  if (!isPlainObject(g)) return null;
  depth = depth || 0;
  var out = { raw: g };
  if (g.ref != null && typeof g.ref === 'string') {
    var sub = FE.evalPlacement({ ref: g.ref }, status);
    var nestedTap = FE.tapInfo(sub.eff, status, depth + 1);
    out.action = nestedTap ? nestedTap.action : null;
    var inherited = (nestedTap && nestedTap.label != null && String(nestedTap.label) !== '')
      ? String(nestedTap.label) : rawLabelOf(sub.eff, status, depth + 1);
    out.label = (g.label != null) ? g.label : inherited;
    out.popup = (g.popup != null) ? g.popup : (nestedTap ? nestedTap.popup : undefined);
    if (isPlainObject(sub.eff.hold)) out.inheritedHold = sub.eff.hold;
  } else {
    out.label = g.label != null ? g.label : null;
    out.popup = g.popup != null ? g.popup : undefined;
    out.action = FE.resolveActionSpec(
      g.action != null ? g.action :
      (g.actions != null ? g.actions :
        (g.macro != null ? g : null))
    );
  }
  if (g.hint != null) out.hint = g.hint;
  if (g.repeat != null) out.repeat = g.repeat;
  if (g.popupKey != null) out.popupKey = g.popupKey;
  if (g.start != null) out.start = g.start;
  else if (out.inheritedHold && out.inheritedHold.start != null) out.start = out.inheritedHold.start;
  if (g.end != null) out.end = g.end;
  else if (g.endAction != null) out.end = g.endAction;
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
function refNameOf(placement) {
  return (isPlainObject(placement) && typeof placement.ref === 'string') ? placement.ref : '内联按键';
}

function checkGestureRefs(container, where, err) {
  ['tap', 'doubleTap', 'longPress', 'hold'].forEach(function (f) {
    var g = container[f];
    if (g == null) return;
    if (isPlainObject(g) && typeof g.ref === 'string' && !lookupDef(g.ref)) {
      err(where + ' 的 ' + f + '.ref 引用无法解析: ' + g.ref);
    }
    if (typeof g === 'string') {
      var acts = (state.profile && isPlainObject(state.profile.actions)) ? state.profile.actions : {};
      if (!acts[g]) err(where + ' 的 ' + f + ' 引用动作名不存在: ' + g);
    }
    if (isPlainObject(g) && g.macro != null) {
      var macros = (state.profile && isPlainObject(state.profile.macros)) ? state.profile.macros : {};
      if (!macros[g.macro]) err(where + ' 的 ' + f + ' 引用宏不存在: ' + g.macro);
    }
  });
  if (isPlainObject(container.swipe)) {
    FE.SWIPE_DIRS.forEach(function (d) {
      var g = container.swipe[d];
      if (g == null) return;
      if (isPlainObject(g) && typeof g.ref === 'string' && !lookupDef(g.ref)) {
        err(where + ' 的 swipe.' + d + '.ref 引用无法解析: ' + g.ref);
      }
      if (typeof g === 'string') {
        var acts2 = (state.profile && isPlainObject(state.profile.actions)) ? state.profile.actions : {};
        if (!acts2[g]) err(where + ' 的 swipe.' + d + ' 引用动作名不存在: ' + g);
      }
      if (isPlainObject(g) && g.macro != null) {
        var macros2 = (state.profile && isPlainObject(state.profile.macros)) ? state.profile.macros : {};
        if (!macros2[g.macro]) err(where + ' 的 swipe.' + d + ' 引用宏不存在: ' + g.macro);
      }
    });
  }
}

FE.validateProfile = function (profile) {
  var errors = [], warnings = [];
  function err(msg) { errors.push(msg); }
  function warn(msg) { warnings.push(msg); }

  var oldProfile = state.profile;
  state.profile = profile; // 供 lookupDef / resolveActionSpec 使用
  try {
    if (!isPlainObject(profile)) { err('配置不是 JSON 对象'); return { errors: errors, warnings: warnings }; }
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
      else if (typeof kd.ref === 'string' && !lookupDef(kd.ref)) err('按键定义 “' + kn + '” 的 ref 无法解析: ' + kd.ref);
      if (kd.ref === kn) err('按键定义 “' + kn + '” 引用了自身');
      if (kd.hold != null && kd.longPress != null) err('按键定义 “' + kn + '” 同时定义了 hold 与 longPress');
      checkGestureRefs(kd, '按键定义 “' + kn + '”', err);
      if (Array.isArray(kd.variants)) {
        kd.variants.forEach(function (v, vi) {
          if (!isPlainObject(v)) { err('按键定义 “' + kn + '” 的变体 ' + vi + ' 不是对象'); return; }
          if (typeof v.ref === 'string' && !lookupDef(v.ref)) err('按键定义 “' + kn + '” 变体 ' + vi + ' 的 ref 无法解析: ' + v.ref);
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
      if (!Array.isArray(L.sections) || !L.sections.length) { err('布局 “' + ln + '” 缺少有效的 sections'); return; }
      L.sections.forEach(function (s, si) {
        if (!isPlainObject(s)) { err('布局 “' + ln + '” 的区段 ' + si + ' 不是对象'); return; }
        if (s.type === 'rows') {
          FE.rowsOfSection(s).forEach(function (row, ri) {
            var hasAuto = false, fixedSum = 0;
            row.keys.forEach(function (k) {
              var w = isPlainObject(k) && k.weight != null ? k.weight : 1;
              if (w === 'auto') hasAuto = true; else fixedSum += (Number(w) || 0);
            });
            if (hasAuto && row.totalWeight == null) {
              err('布局 “' + ln + '” 区段 ' + si + ' 行 ' + ri + ' 使用了 weight:"auto" 但未提供 totalWeight');
            } else if (hasAuto && row.totalWeight <= fixedSum + 1e-9) {
              err('布局 “' + ln + '” 区段 ' + si + ' 行 ' + ri + ' 的 totalWeight(' + row.totalWeight + ') 不足以分配 auto 权重');
            }
            row.keys.forEach(function (k, ki) {
              checkPlacement(k, ln, si, '行 ' + ri + ' 按键 ' + ki);
            });
          });
        } else if (s.type === 'grid') {
          var cols = s.columns, rws = s.rows;
          if (!Number.isInteger(cols) || cols < 1) err('布局 “' + ln + '” 区段 ' + si + ' 的 columns 无效');
          if (!Number.isInteger(rws) || rws < 1) err('布局 “' + ln + '” 区段 ' + si + ' 的 rows 无效');
          if (s.rowHeights != null && !Array.isArray(s.rowHeights)) err('布局 “' + ln + '” 区段 ' + si + ' 的 rowHeights 必须是数组');
          var C = Number.isInteger(cols) ? cols : 1, R = Number.isInteger(rws) ? rws : 1;
          var occ = {};
          (Array.isArray(s.keys) ? s.keys : []).forEach(function (k, ki) {
            if (!isPlainObject(k)) { err('布局 “' + ln + '” 区段 ' + si + ' 网格按键 ' + ki + ' 不是对象'); return; }
            var c = k.column, r = k.row, cs = k.columnSpan != null ? k.columnSpan : 1, rs = k.rowSpan != null ? k.rowSpan : 1;
            var label = refNameOf(k);
            if (!Number.isInteger(c) || !Number.isInteger(r)) { err('布局 “' + ln + '” 网格按键 ' + label + ' 缺少整数 column/row'); }
            else {
              if (cs < 1 || rs < 1) err('布局 “' + ln + '” 网格按键 ' + label + ' 的跨距必须 ≥1');
              if (c < 0 || r < 0 || c + cs > C || r + rs > R) err('布局 “' + ln + '” 网格按键 ' + label + ' 超出网格范围');
              var limC = Math.min(c + cs, C), limR = Math.min(r + rs, R);
              for (var y = Math.max(0, r); y < limR; y++) {
                for (var x = Math.max(0, c); x < limC; x++) {
                  var id = x + ',' + y;
                  if (occ[id] != null) err('布局 “' + ln + '” 网格按键 ' + label + ' 与 ' + occ[id] + ' 在单元格 (' + id + ') 重叠');
                  else occ[id] = label;
                }
              }
            }
            checkPlacement(k, ln, si, '网格按键 ' + label);
          });
        } else {
          err('布局 “' + ln + '” 区段 ' + si + ' 的 type 必须是 rows 或 grid');
        }
      });
    });

    function checkPlacement(k, ln, si, where) {
      if (!isPlainObject(k)) { err('布局 “' + ln + '” ' + where + ' 不是对象'); return; }
      var full = '布局 “' + ln + '” ' + where;
      if (k.ref != null && typeof k.ref !== 'string') err(full + ' 的 ref 必须是字符串');
      else if (typeof k.ref === 'string' && k.ref && !lookupDef(k.ref)) err(full + ' 的 ref 无法解析: ' + k.ref);
      var ev = FE.evalPlacement(k, NEUTRAL_STATUS);
      if (ev.unresolved) err(full + ' 引用链无法解析: ' + ev.unresolved);
      if (ev.cycle) err(full + ' 引用链存在循环: ' + ev.cycle);
      if (ev.eff.tap == null) err(full + '（' + refNameOf(k) + '）解析后缺少点击动作 tap');
      if (ev.eff.hold != null && ev.eff.longPress != null) err(full + '（' + refNameOf(k) + '）同时定义了 hold 与 longPress');
      checkGestureRefs(k, full, err);
    }

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
        var target = isPlainObject(step) && typeof step.action === 'string' ? step.action : null;
        if (target && !(isPlainObject(profile.actions) && profile.actions[target])) {
          err('宏 “' + mn2 + '” 步骤 ' + i + ' 引用动作名不存在: ' + target);
        }
      });
    }
  } finally {
    state.profile = oldProfile;
  }
  return { errors: errors, warnings: warnings };
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

FE.serializeProfile = function (p) {
  var out = deepClone(p);
  if (out.type == null) out.type = 'foxy.keyboard-layout';
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

/* 宽松 JSON 文本清理：去除 UTF-8 BOM 与 } / ] 前的多余尾逗号。
 * 手工编辑的布局文件常带尾逗号，严格 JSON.parse 会拒绝；此处字符串感知地清理。 */
FE.sanitizeJsonText = function (text) {
  var s = String(text).replace(/^\uFEFF/, '');
  var out = [];
  var inStr = false, esc = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (inStr) {
      out.push(c);
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out.push(c); continue; }
    if (c === ',') {
      var j = i + 1;
      while (j < s.length && (s.charAt(j) === ' ' || s.charAt(j) === '\t' || s.charAt(j) === '\n' || s.charAt(j) === '\r')) j++;
      if (j < s.length && (s.charAt(j) === '}' || s.charAt(j) === ']')) continue; /* 丢弃尾逗号 */
    }
    out.push(c);
  }
  return out.join('');
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
function snapshot() { return FE.serializeProfile(state.profile); }
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
function undo() {
  if (!state.history.length) return;
  state.future.push(snapshot());
  var prev = state.history.pop();
  applyProfileText(prev, { keepHistory: true });
}
function redo() {
  if (!state.future.length) return;
  state.history.push(snapshot());
  var next = state.future.pop();
  applyProfileText(next, { keepHistory: true });
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
      profile: state.profile, layoutName: state.layoutName, fileName: state.fileName
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
  FE.normalizeProfile(p);
  state.profile = p;
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

/* ---------------- 当前布局访问 ---------------- */
function curLayout() {
  return (state.profile && state.layoutName && state.profile.layouts[state.layoutName]) || null;
}
function curSections() {
  var L = curLayout();
  return (L && Array.isArray(L.sections)) ? L.sections : [];
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

function displayLabel(eff) {
  if (eff.statusLabel != null) {
    return state.statusSample || '示例';
  }
  var raw = rawLabelOf(eff, state.status) || '';
  if (state.status.shift) {
    if (typeof eff.shiftedLabel === 'string') return eff.shiftedLabel;
    if (/^[a-z]$/.test(raw)) return raw.toUpperCase();
  }
  return raw;
}

function hintFontPx(eff, dir, unit) {
  var base = unit * 0.24;
  var scale = 1;
  var hts = eff.hintTextSize;
  if (typeof hts === 'number') scale = hts / 11;
  else if (isPlainObject(hts)) {
    var d = hts[dir];
    if (typeof d === 'number') scale = d / 11;
  }
  return clamp(base * scale, 6, 16);
}

function keyFontPx(eff, unit) {
  var scale = (typeof eff.textSize === 'number') ? eff.textSize / 22 : 1;
  return clamp(unit * 0.42 * scale, 8, 42);
}

function applyKeyColors(el, eff, pressed) {
  var c = eff.colors;
  if (!isPlainObject(c)) return;
  var col = {};
  if (typeof c.background === 'string') col.background = c.background;
  if (typeof c.text === 'string') col.color = c.text;
  if (typeof c.border === 'string') { col.borderColor = c.border; el.classList.add('kb-key-hasborder'); }
  if (isPlainObject(c.states)) {
    var st = null;
    if (!pressed && eff.modifier === 'SHIFT' && state.status.shift) st = c.states.modifierActive || c.states.modifierLocked;
    if (pressed) st = c.states.pressed || st;
    if (st) {
      if (typeof st.background === 'string') col.background = st.background;
      if (typeof st.text === 'string') col.color = st.text;
    }
  }
  Object.assign(el.style, col);
}

function placementTooltip(ev, placement) {
  var lines = [];
  lines.push('引用: ' + (placement && placement.ref ? placement.ref : '（内联按键）'));
  if (ev.chain && ev.chain.length) lines.push('解析链: ' + ev.chain.join(' → '));
  var ti = FE.tapInfo(ev.eff, state.status);
  lines.push('点击: ' + (ti && ti.action ? ti.action.display : '（继承）'));
  FE.SWIPE_DIRS.forEach(function (d) {
    var g = ev.eff.swipe && ev.eff.swipe[d];
    if (!g) return;
    var gi = FE.gestureInfo(g, state.status);
    if (gi) lines.push('滑动' + ({ up: '上', down: '下', left: '左', right: '右' })[d] + ': ' + (gi.action ? gi.action.display : '') + (gi.label ? ' 「' + gi.label + '」' : ''));
  });
  ['longPress', 'hold', 'doubleTap'].forEach(function (f) {
    var g = ev.eff[f];
    if (g == null) return;
    var gi = FE.gestureInfo(g, state.status);
    lines.push((f === 'longPress' ? '长按' : f === 'hold' ? '按住' : '双击') + ': ' + (gi && gi.action ? gi.action.display : '') + (gi && gi.label ? ' 「' + gi.label + '」' : ''));
  });
  if (ev.unresolved) lines.push('⚠ 引用无法解析: ' + ev.unresolved);
  return lines.join('\n');
}

function buildPreviewKey(placement, ctx) {
  var ev = FE.evalPlacement(placement, state.status);
  var eff = ev.eff;
  var el = h('div', {
    class: 'kb-key' + (eff.keyType ? ' kt-' + String(eff.keyType).toLowerCase() : '') +
      (ev.unresolved || ev.cycle ? ' kb-key-broken' : '') +
      (isSel(ctx.s, ctx.r, ctx.k) ? ' kb-key-sel' : ''),
    title: placementTooltip(ev, placement)
  });
  if (eff.spacer) el.classList.add('kb-spacer');
  el.style.flexGrow = String(ctx.weight);
  el.style.flexBasis = '0';
  if (ctx.maxKeyHeight > 0) {
    var hfrac = ((typeof eff.height === 'number' && eff.height > 0) ? eff.height : 1) / ctx.maxKeyHeight;
    if (hfrac < 0.999) {
      el.style.height = (hfrac * 100) + '%';
      el.style.alignSelf = 'center';
    }
  }
  applyKeyColors(el, eff, false);

  if (eff.icon && ICONS_SVG[eff.icon]) {
    var wrap = h('span', { class: 'kb-icon-wrap' });
    var svg = ICONS_SVG[eff.icon];
    if (eff.icon === 'shift' && eff.modifier === 'SHIFT') {
      svg = state.status.shift ? ICONS_SVG.shift : ICONS_SVG.shiftOutline;
      if (state.status.shift) wrap.classList.add('kb-icon-active');
    }
    wrap.innerHTML = svg;
    var iw = clamp(ctx.unit * 0.52, 14, 40);
    wrap.style.width = iw + 'px';
    wrap.style.height = iw + 'px';
    el.appendChild(wrap);
  } else {
    var label = displayLabel(eff);
    if (label !== '' && label != null) {
      el.appendChild(h('span', {
        class: 'kb-label',
        style: { fontSize: keyFontPx(eff, ctx.unit) + 'px' }
      }, label));
    }
  }

  /* 滑动提示 */
  if (isPlainObject(eff.swipe)) {
    FE.SWIPE_DIRS.forEach(function (d) {
      var g = eff.swipe[d];
      if (g == null) return;
      var gi = FE.gestureInfo(g, state.status);
      var txt = gi && gi.label != null ? String(gi.label) : '';
      if (!txt) return;
      el.appendChild(h('span', {
        class: 'kb-hint kb-hint-' + d,
        style: { fontSize: hintFontPx(eff, d, ctx.unit) + 'px' }
      }, txt));
    });
  }
  /* 长按徽标 */
  if (eff.longPress != null) {
    var lp = FE.gestureInfo(eff.longPress, state.status);
    if (lp && lp.label) el.appendChild(h('span', { class: 'kb-badge-lp', style: { fontSize: hintFontPx(eff, 'up', ctx.unit) + 'px' } }, lp.label));
  }
  /* 按住徽标 */
  if (eff.hold != null) {
    var hd = FE.gestureInfo(eff.hold, state.status);
    if (hd && hd.label) el.appendChild(h('span', { class: 'kb-badge-lp kb-badge-hold', style: { fontSize: hintFontPx(eff, 'up', ctx.unit) + 'px' } }, hd.label));
  }

  el.addEventListener('pointerdown', function () { el.classList.add('pressed'); applyKeyColors(el, eff, true); });
  el.addEventListener('pointerup', function () { el.classList.remove('pressed'); applyKeyColors(el, eff, false); });
  el.addEventListener('pointerleave', function () { el.classList.remove('pressed'); applyKeyColors(el, eff, false); });
  el.addEventListener('click', function (e) {
    e.stopPropagation();
    state.sel = { s: ctx.s, r: ctx.r, k: ctx.k };
    renderPreview();
    renderLayoutTab();
    if (FE.openKeyDialog) {
      FE.openKeyDialog({ mode: 'placement', placement: placement, location: { s: ctx.s, r: ctx.r, k: ctx.k } });
    }
  });
  return el;
}

function isSel(s, r, k) {
  var sel = state.sel;
  return !!sel && sel.s === s && sel.r === r && sel.k === k;
}

function buildRowsSection(section, si, unit) {
  var wrap = h('div', { class: 'kb-section' });
  FE.rowsOfSection(section).forEach(function (row, ri) {
    var rowEl = h('div', { class: 'kb-row' });
    if (row.width != null) {
      rowEl.style.width = (row.width * 100) + '%';
      rowEl.style.marginLeft = 'auto';
      rowEl.style.marginRight = 'auto';
    }
    rowEl.style.height = Math.max(18, row.heightUnits * unit) + 'px';
    var weights = FE.rowWeights(row);
    var maxKH = 1;
    row.keys.forEach(function (kk) {
      var kh = isPlainObject(kk) && typeof kk.height === 'number' && kk.height > 0 ? kk.height : 1;
      if (kh > maxKH) maxKH = kh;
    });
    row.keys.forEach(function (kk, ki) {
      rowEl.appendChild(buildPreviewKey(kk, { s: si, r: ri, k: ki, unit: unit, maxKeyHeight: maxKH, weight: weights[ki] }));
    });
    wrap.appendChild(rowEl);
  });
  return wrap;
}

function buildGridSection(section, si, unit) {
  var dims = FE.gridDims(section);
  var el = h('div', { class: 'kb-grid' });
  el.style.gridTemplateColumns = 'repeat(' + dims.columns + ', 1fr)';
  if (dims.rowHeights && dims.rowHeights.length) {
    el.style.gridTemplateRows = dims.rowHeights.map(function (x) { return (Number(x) || 1) + 'fr'; }).join(' ');
  } else {
    el.style.gridTemplateRows = 'repeat(' + dims.rows + ', 1fr)';
  }
  var totalUnits = (dims.rowHeights && dims.rowHeights.length)
    ? dims.rowHeights.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) : 5;
  el.style.height = Math.max(24, totalUnits * unit) + 'px';
  (Array.isArray(section.keys) ? section.keys : []).forEach(function (kk, gi) {
    if (!isPlainObject(kk)) return;
    var c = Number.isInteger(kk.column) ? kk.column : 0;
    var r = Number.isInteger(kk.row) ? kk.row : 0;
    var cs = kk.columnSpan != null ? kk.columnSpan : 1;
    var rs = kk.rowSpan != null ? kk.rowSpan : 1;
    var keyEl = buildPreviewKey(kk, { s: si, r: null, k: gi, unit: unit, maxKeyHeight: 1, weight: 1 });
    keyEl.style.gridColumn = (c + 1) + ' / span ' + Math.max(1, cs);
    keyEl.style.gridRow = (r + 1) + ' / span ' + Math.max(1, rs);
    keyEl.style.flexGrow = '';
    el.appendChild(keyEl);
  });
  return el;
}

function renderPreview() {
  var host = $('preview-kb');
  if (!host) return;
  clearEl(host);
  host.className = 'kb ' + (state.theme === 'light' ? 'kb-light' : 'kb-dark');
  var L = curLayout();
  if (!L) {
    host.appendChild(h('div', { class: 'kb-empty' }, '当前没有布局，请在“布局编辑”中添加。'));
    renderMeta();
    return;
  }
  var resolvedName = FE.resolvePreviewLayout(state.profile, state.layoutName, state.status);
  var RL = state.profile.layouts[resolvedName] || L;
  var W = host.clientWidth || 380;
  var unit = W / 10;
  var sections = Array.isArray(RL.sections) ? RL.sections : [];
  sections.forEach(function (s, si) {
    if (!isPlainObject(s)) return;
    if (s.type === 'rows') host.appendChild(buildRowsSection(s, si, unit));
    else if (s.type === 'grid') host.appendChild(buildGridSection(s, si, unit));
  });
  if (!sections.length) host.appendChild(h('div', { class: 'kb-empty' }, '布局没有区段。'));
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
    var units = FE.layoutHeightUnits(L);
    parts.push(' · 高度 ' + (Math.round(units * 100) / 100) + ' 单位');
    var keyCount = 0;
    (Array.isArray(L.sections) ? L.sections : []).forEach(function (s) {
      if (s.type === 'rows') FE.rowsOfSection(s).forEach(function (r) { keyCount += r.keys.length; });
      else if (s.type === 'grid' && Array.isArray(s.keys)) keyCount += s.keys.length;
    });
    parts.push(' · ' + keyCount + ' 键');
  }
  var v = state.validation;
  if (v.errors.length) parts.push(h('span', { class: 'st-error' }, ' ✗ ' + v.errors.length + ' 个错误'));
  if (v.warnings.length) parts.push(h('span', { class: 'st-warn' }, ' ⚠ ' + v.warnings.length + ' 个警告'));
  if (!v.errors.length && !v.warnings.length) parts.push(h('span', { class: 'st-ok' }, ' ✓ 校验通过'));
  meta.appendChild(h('span', null, parts));

  var det = h('details', { class: 'meta-details' });
  var sum = h('summary', null, '校验详情');
  det.appendChild(sum);
  var list = h('ul', { class: 'meta-list' });
  v.errors.forEach(function (m) { list.appendChild(h('li', { class: 'st-error' }, m)); });
  v.warnings.forEach(function (m) { list.appendChild(h('li', { class: 'st-warn' }, m)); });
  if (!v.errors.length && !v.warnings.length) list.appendChild(h('li', { class: 'st-ok' }, '没有发现问题'));
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
  var variants = Array.isArray(L.variants) ? L.variants : [];
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
  vhost.appendChild(h('button', {
    class: 'mini-button', onclick: function () {
      mutate(function () {
        var l = curLayout();
        if (!Array.isArray(l.variants)) l.variants = [];
        l.variants.push({ when: { rime: { composing: true } }, layout: Object.keys(state.profile.layouts)[0] || 'default' });
      });
    }
  }, '+ 添加布局变体'));
}

/* ---------------- 区段编辑器 ---------------- */
function renderSectionsEditor() {
  var host = $('layout-sections');
  clearEl(host);
  var sections = curSections();
  sections.forEach(function (s, si) {
    if (!isPlainObject(s)) { host.appendChild(sectionCardBroken(si)); return; }
    if (s.type === 'rows') host.appendChild(rowsSectionCard(s, si));
    else if (s.type === 'grid') host.appendChild(gridSectionCard(s, si));
    else host.appendChild(sectionCardBroken(si));
  });
  host.appendChild(h('div', { class: 'toolbar' },
    h('button', { onclick: function () { addSection('rows'); } }, '+ 行区段'),
    h('button', { onclick: function () { addSection('grid'); } }, '+ 网格区段')
  ));
}

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
    var L = curLayout();
    if (!Array.isArray(L.sections)) L.sections = [];
    if (type === 'rows') L.sections.push({ type: 'rows', rows: [[]] });
    else L.sections.push({ type: 'grid', columns: 4, rows: 3, keys: [] });
  });
}

/* ---- 行区段卡片 ---- */
function rowsSectionCard(section, si) {
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
    body.appendChild(rowEditor(section, si, ri));
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

function rowEditor(section, si, ri) {
  var rows = section.rows;
  var raw = rows[ri];
  var isObj = isPlainObject(raw);
  var keysArr = isObj ? (Array.isArray(raw.keys) ? raw.keys : []) : (Array.isArray(raw) ? raw : []);

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
  keysArr.forEach(function (k, ki) {
    chipBox.appendChild(keyChip(k, { s: si, r: ri, k: ki }));
  });
  chipBox.appendChild(h('button', {
    class: 'chip chip-add',
    onclick: function () {
      addKeyToRow(si, ri);
    }
  }, '+ 键'));
  /* 行末尾放置（拖拽） */
  chipBox.addEventListener('dragover', function (e) {
    if (state.__drag) { e.preventDefault(); chipBox.classList.add('drop-target'); }
  });
  chipBox.addEventListener('dragleave', function () { chipBox.classList.remove('drop-target'); });
  chipBox.addEventListener('drop', function (e) {
    e.preventDefault();
    chipBox.classList.remove('drop-target');
    var d = state.__drag;
    if (!d) return;
    state.__drag = null;
    if (d.s !== si) return;
    mutate(function () {
      var src = getRowKeys(section, d.r);
      var item = src.splice(d.k, 1)[0];
      if (d.r === ri) {
        var max = Math.min(d.k, src.length);
        src.splice(max, 0, item);
      } else {
        getRowKeys(section, ri).push(item);
      }
    });
  });

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

/* ---- 按键 chip ---- */
function keyChip(placement, loc) {
  var ev = FE.evalPlacement(placement, state.status);
  var eff = ev.eff;
  var label = rawLabelOf(eff, state.status) || (eff.icon ? '⚙' : '？');
  var chip = h('div', {
    class: 'chip' + (eff.keyType === 'FUNCTION' || eff.keyType === 'ACTION' ? ' chip-fn' : '') +
      (isSel(loc.s, loc.r, loc.k) ? ' chip-sel' : '') +
      (ev.unresolved || ev.cycle ? ' chip-broken' : ''),
    draggable: 'true',
    title: placementTooltip(ev, placement),
    onclick: function () {
      state.sel = loc;
      renderPreview();
      renderSectionsEditor();
      if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'placement', placement: placement, location: loc });
    }
  });
  chip.appendChild(h('span', { class: 'chip-label' }, String(label).slice(0, 6)));
  chip.appendChild(h('span', { class: 'chip-sub' }, placement && placement.ref ? placement.ref : '内联'));
  var badges = [];
  if (isPlainObject(placement) && placement.weight != null) badges.push('w:' + placement.weight);
  if (isPlainObject(placement) && isPlainObject(placement.override) && Object.keys(placement.override).length) badges.push('OV');
  if (isPlainObject(placement) && placement.height != null) badges.push('h:' + placement.height);
  if (badges.length) chip.appendChild(h('span', { class: 'chip-badges' }, badges.join(' ')));
  chip.addEventListener('dragstart', function (e) {
    state.__drag = { s: loc.s, r: loc.r, k: loc.k };
    try { e.dataTransfer.setData('text/plain', JSON.stringify(loc)); } catch (err) {}
    chip.classList.add('dragging');
  });
  chip.addEventListener('dragend', function () { chip.classList.remove('dragging'); });
  chip.addEventListener('dragover', function (e) {
    if (state.__drag && state.__drag.s === loc.s) {
      e.preventDefault();
      e.stopPropagation();
      chip.classList.add('drop-before');
    }
  });
  chip.addEventListener('dragleave', function () { chip.classList.remove('drop-before'); });
  chip.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    chip.classList.remove('drop-before');
    var d = state.__drag;
    state.__drag = null;
    if (!d || d.s !== loc.s) return;
    if (d.r === loc.r && d.k === loc.k) return;
    mutate(function () {
      var section = curSections()[loc.s];
      var src = getRowKeys(section, d.r);
      var item = src.splice(d.k, 1)[0];
      var dst = getRowKeys(section, loc.r);
      var idx = d.r === loc.r && d.k < loc.k ? loc.k - 1 : loc.k;
      dst.splice(idx, 0, item);
    });
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
function gridSectionCard(section, si) {
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
  body.appendChild(gridEditor(section, si));
  card.appendChild(body);
  return card;
}

function gridEditor(section, si) {
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
      (function (x, y) {
        var place = { gridColumn: String(x + 1), gridRow: String(y + 1) };
        var info = cellMap[x + ',' + y];
        if (info && !info.start) {
          /* 被跨距按键覆盖的格子 */
          grid.appendChild(h('div', { class: 'gedit-cell gedit-covered', style: place }));
          return;
        }
        if (info) {
          var k = keysArr[info.gi];
          var ev = FE.evalPlacement(k, state.status);
          var eff = ev.eff;
          var label = rawLabelOf(eff, state.status) || (eff.icon ? '⚙' : '？');
          var cs = k.columnSpan != null ? k.columnSpan : 1;
          var rs = k.rowSpan != null ? k.rowSpan : 1;
          if (cs > 1) place.gridColumn = (x + 1) + ' / span ' + cs;
          if (rs > 1) place.gridRow = (y + 1) + ' / span ' + rs;
          var cell = h('div', {
            class: 'gedit-cell gedit-key' + (isSel(si, null, info.gi) ? ' chip-sel' : '') + (ev.unresolved ? ' chip-broken' : ''),
            title: placementTooltip(ev, k),
            style: place,
            onclick: function () {
              state.sel = { s: si, r: null, k: info.gi };
              renderPreview();
              renderSectionsEditor();
              if (FE.openKeyDialog) FE.openKeyDialog({ mode: 'placement', placement: k, location: { s: si, r: null, k: info.gi }, grid: true });
            }
          },
            h('span', { class: 'gedit-label' }, String(label).slice(0, 4)),
            h('span', { class: 'gedit-sub' }, k.ref || '内联'),
            (cs > 1 || rs > 1) ? h('span', { class: 'gedit-span' }, cs + '×' + rs) : null
          );
          grid.appendChild(cell);
        } else {
          grid.appendChild(h('div', {
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
          }, '+'));
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
  }
  Object.keys(profile.keys || {}).forEach(function (kn) {
    var kd = profile.keys[kn];
    if (!isPlainObject(kd)) return;
    if (kd.ref === name) places.push('按键定义 ' + kn);
    checkGestures(kd, '按键定义 ' + kn);
  });
  Object.keys(profile.layouts || {}).forEach(function (ln) {
    var L = profile.layouts[ln];
    if (!isPlainObject(L) || !Array.isArray(L.sections)) return;
    L.sections.forEach(function (s, si) {
      if (!isPlainObject(s)) return;
      if (s.type === 'rows') {
        FE.rowsOfSection(s).forEach(function (row, ri) {
          row.keys.forEach(function (k, ki) {
            if (isPlainObject(k) && k.ref === name) places.push(ln + ' 区段' + si + ' 行' + ri + ' 键' + ki);
            checkGestures(k, ln + ' 区段' + si + ' 行' + ri + ' 键' + ki);
          });
        });
      } else if (s.type === 'grid' && Array.isArray(s.keys)) {
        s.keys.forEach(function (k, ki) {
          if (isPlainObject(k) && k.ref === name) places.push(ln + ' 区段' + si + ' 网格键' + ki);
          checkGestures(k, ln + ' 区段' + si + ' 网格键' + ki);
        });
      }
    });
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

function jsonTextarea(value, onApply, rows) {
  var ta = h('textarea', { class: 'json-editor small', rows: rows || 4, spellcheck: 'false' });
  ta.value = value != null ? JSON.stringify(value, null, 2) : '';
  var status = h('span', { class: 'status' });
  ta.addEventListener('blur', function () {
    if (ta.value.trim() === '') { onApply(null, status, ta); return; }
    try {
      var v = JSON.parse(ta.value);
      onApply(v, status, ta);
    } catch (e) {
      status.className = 'status error';
      status.textContent = 'JSON 无效: ' + e.message;
    }
  });
  return { el: ta, status: status };
}

function renderActionsList() {
  var host = $('actions-list');
  if (!host) return;
  clearEl(host);
  var actions = state.profile && isPlainObject(state.profile.actions) ? state.profile.actions : {};
  var names = Object.keys(actions);
  if (!names.length) {
    host.appendChild(h('div', { class: 'status' }, '尚无动作定义。动作可被按键以字符串形式引用，如 "tap": "my.action"。'));
  }
  names.forEach(function (n) {
    var editor = jsonTextarea(actions[n], function (v, status) {
      if (v === null) mutate(function () { delete state.profile.actions[n]; });
      else mutate(function () { state.profile.actions[n] = v; });
      status.className = 'status st-ok';
      status.textContent = '已应用';
    });
    host.appendChild(h('div', { class: 'def-item col' },
      h('div', { class: 'def-main' },
        h('code', { class: 'def-name' }, n),
        h('span', { class: 'def-badges' }, FE.actionDisplay(actions[n])),
        h('button', { class: 'danger mini-button', onclick: function () { mutate(function () { delete state.profile.actions[n]; }); } }, '删除')
      ),
      editor.el, editor.status
    ));
  });
  var addName = h('input', { type: 'text', placeholder: '新动作名称，如 editor.select_all', class: 'mini-input wide' });
  host.appendChild(h('div', { class: 'toolbar' },
    addName,
    h('button', {
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
    host.appendChild(h('div', { class: 'status' }, '尚无宏。宏是有序动作步骤数组，用 { "macro": "名称" } 调用。'));
  }
  names.forEach(function (n) {
    var editor = jsonTextarea(macros[n], function (v, status) {
      if (v === null) mutate(function () { delete state.profile.macros[n]; });
      else mutate(function () { state.profile.macros[n] = v; });
      status.className = 'status st-ok';
      status.textContent = '已应用';
    }, 5);
    host.appendChild(h('div', { class: 'def-item col' },
      h('div', { class: 'def-main' },
        h('code', { class: 'def-name' }, n),
        h('span', { class: 'def-badges' }, Array.isArray(macros[n]) ? macros[n].length + ' 步' : ''),
        h('button', { class: 'danger mini-button', onclick: function () { mutate(function () { delete state.profile.macros[n]; }); } }, '删除')
      ),
      editor.el, editor.status
    ));
  });
  var addName = h('input', { type: 'text', placeholder: '新宏名称，如 delete_to_line_start', class: 'mini-input wide' });
  host.appendChild(h('div', { class: 'toolbar' },
    addName,
    h('button', {
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
  ta.value = FE.serializeProfile(state.profile);
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
}

function renderOps() {
  var a = $('op-author'), t = $('op-type');
  if (a && document.activeElement !== a) a.value = state.profile && state.profile.author != null ? String(state.profile.author) : '';
  if (t) t.checked = !!(state.profile && state.profile.type === 'foxy.keyboard-layout');
}

function updateUndoButtons() {
  var u = $('op-undo'), r = $('op-redo');
  if (u) { u.disabled = !state.history.length; u.title = state.history.length ? '撤销' : '没有可撤销的操作'; }
  if (r) { r.disabled = !state.future.length; r.title = state.future.length ? '重做' : '没有可重做的操作'; }
}

/* ================================================================
 * 顶部工具栏 / 标签页 / 事件绑定
 * ================================================================ */
function initTabs() {
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tabpanel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      var panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.classList.add('active');
      if (btn.dataset.tab === 'tab-json') renderJsonTab();
      if (btn.dataset.tab === 'tab-keys') renderKeysTab();
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

  /* 文件操作 */
  $('op-import').addEventListener('click', function () { $('op-import-file').click(); });
  $('op-import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (applyProfileText(String(reader.result))) {
        state.fileName = file.name;
        setOpStatus('已导入 ' + file.name, 'ok');
      }
    };
    reader.readAsText(file, 'utf-8');
  });
  $('op-export').addEventListener('click', function () {
    var text = FE.serializeProfile(state.profile);
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = state.fileName || 'foxy-layout.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    setOpStatus('已导出 ' + a.download, 'ok');
  });

  /* 示例（已打包进 js/examples-bundle.js，file:// 直开无需服务器） */
  var ex = $('op-example');
  var EXAMPLES = [
    ['内置默认布局（layout-variant）', '__builtin__'],
    ['cc lite.json（全键盘·注音符号）', 'cc lite.json'],
    ['default-with-edit.json（含编辑布局）', 'default-with-edit.json'],
    ['layout-variant.json（仓颉变体示例）', 'layout-variant.json'],
    ['number-row.json（数字行）', 'number-row.json'],
    ['popup-ref-layout.json（长按弹出菜单）', 'popup-ref-layout.json'],
    ['datadirsel-default.json', 'datadirsel-default.json']
  ];
  EXAMPLES.forEach(function (e2) { ex.appendChild(h('option', { value: e2[1] }, e2[0])); });
  $('op-load-example').addEventListener('click', function () {
    var v = ex.value;
    if (!v) return;
    var text;
    if (v === '__builtin__') text = FE.DEFAULT_PROFILE_TEXT;
    else text = FE.EXAMPLE_FILES ? FE.EXAMPLE_FILES[v] : null;
    if (text == null) { setOpStatus('示例未找到: ' + v, 'error'); return; }
    if (applyProfileText(text)) {
      state.fileName = (v === '__builtin__') ? 'layout-variant.json' : v;
      setOpStatus('已加载示例 ' + state.fileName, 'ok');
    }
  });

  $('op-undo').addEventListener('click', undo);
  $('op-redo').addEventListener('click', redo);

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
    mutate(function () {
      if (typeChk.checked) state.profile.type = 'foxy.keyboard-layout';
      else delete state.profile.type;
    });
  });

  /* JSON tab */
  $('json-apply').addEventListener('click', function () {
    var ta = $('json-editor');
    if (applyProfileText(ta.value)) {
      setOpStatus('JSON 已应用', 'ok');
      setJsonStatus('✓ 已应用；校验结果见预览下方状态栏', 'ok');
    } else {
      setJsonStatus('✗ 未应用（原文保留）。错误: ' + (state.lastParseError || '未知'), 'error');
    }
  });
  $('json-format').addEventListener('click', function () {
    var ta = $('json-editor');
    try {
      var p = JSON.parse(FE.sanitizeJsonText(ta.value));
      ta.value = JSON.stringify(p, null, 2);
      setJsonStatus('已格式化（尚未应用；BOM 与多余尾逗号已清理）', 'ok');
    } catch (e) {
      setJsonStatus('JSON 无效: ' + e.message, 'error');
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
  function walkGesture(g) {
    if (isPlainObject(g)) {
      if (g.action) cb(g.action);
      if (Array.isArray(g.actions)) g.actions.forEach(cb);
      if (g.start) cb(g.start);
      if (g.end) cb(g.end);
    }
  }
  function walkKeyContainer(c) {
    ['tap', 'doubleTap', 'longPress', 'hold'].forEach(function (f) { if (c[f] != null) walkGesture(c[f]); });
    if (isPlainObject(c.swipe)) FE.SWIPE_DIRS.forEach(function (d) { if (c.swipe[d] != null) walkGesture(c.swipe[d]); });
  }
  Object.keys(profile.keys || {}).forEach(function (n) {
    var kd = profile.keys[n];
    if (isPlainObject(kd)) walkKeyContainer(kd);
  });
  Object.keys(profile.layouts || {}).forEach(function (ln) {
    var L = profile.layouts[ln];
    if (!isPlainObject(L) || !Array.isArray(L.sections)) return;
    L.sections.forEach(function (s) {
      if (!isPlainObject(s)) return;
      if (s.type === 'rows') {
        FE.rowsOfSection(s).forEach(function (row) { row.keys.forEach(function (k) { if (isPlainObject(k)) walkKeyContainer(k); }); });
      } else if (s.type === 'grid' && Array.isArray(s.keys)) {
        s.keys.forEach(function (k) { if (isPlainObject(k)) walkKeyContainer(k); });
      }
    });
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

function boot() {
  initTabs();
  initToolbar();
  var loaded = false;
  try {
    var draft = localStorage.getItem(LS_KEY);
    if (draft) {
      var d = JSON.parse(draft);
      if (d && d.profile) {
        FE.normalizeProfile(d.profile);
        state.profile = d.profile;
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
  state.validation = FE.validateProfile(state.profile);
  renderAll();
  setOpStatus('就绪。修改会实时渲染并自动保存到浏览器。', 'ok');
}

boot();
})();
