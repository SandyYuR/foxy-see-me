/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * folder-import.js — 文件夹批量导入：识别 definitions.json 与被引用的其他文件
 *
 * 背景（见 skills/SKILL.md 的 Related Foxy JSON Files / Shared Definitions）：
 *   Foxy 运行时的布局包是**跨文件**的，一个包里可能同时有
 *     <外部存储>/foxy/frontend/definitions.json          共享 keys/actions/macros
 *     <外部存储>/foxy/frontend/layouts/<profile>.json     布局文件（可只定义少量键）
 *     <外部存储>/foxy/frontend/popups/<profile>.json      弹出菜单文件
 *   布局文件里引用的名字大量来自共享 definitions.json，单文件导入必然满屏
 *   “ref 无法解析”。本模块把整个文件夹读进来，按运行时规则合并成自包含 profile。
 *
 * 纯逻辑，无 DOM 依赖：Node 测试可直接加载（test-core.js / test-ui.js）。
 * 加载顺序要求：在 app.js 之后（复用 FE.sanitizeJsonText）。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

function isPlainObject(o) { return Object.prototype.toString.call(o) === '[object Object]'; }
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

/* 路径归一化：统一分隔符、去掉前导 "./"、转小写便于匹配目录名 */
function normPath(p) {
  var s = String(p == null ? '' : p).replace(/\\/g, '/');
  s = s.replace(/^\.\//, '');
  while (s.indexOf('/') === 0) s = s.slice(1);
  return s;
}
function baseName(p) {
  var s = normPath(p);
  var i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}
/* 目录名是否出现（如 layouts / popups），用于按 Foxy 约定目录判定类型 */
function inDir(path, dir) {
  var s = '/' + normPath(path).toLowerCase() + '/';
  return s.indexOf('/' + dir + '/') >= 0;
}

/* ================================================================
 * 一、单文件分类
 * ================================================================ */

/* 判定一份 JSON 文本属于哪种 Foxy 格式。
 * 依据优先级：显式 type > 目录约定 > 结构特征。
 * 返回 { kind, data, error }；kind ∈ layout / popup / definitions / unknown */
FE.classifyFoxyFile = function (text, path) {
  var parsed;
  try {
    var fixed = FE.sanitizeJsonText ? FE.sanitizeJsonText(text) : String(text);
    parsed = JSON.parse(fixed);
  } catch (e) {
    return { kind: 'unknown', data: null, error: e.message };
  }
  if (!isPlainObject(parsed)) {
    return { kind: 'unknown', data: null, error: '根节点必须是 JSON 对象' };
  }
  var t = parsed.type;
  var kind;
  if (t === 'foxy.keyboard-layout') kind = 'layout';
  else if (t === 'foxy.popup-profile') kind = 'popup';
  else if (t === 'foxy.definitions') kind = 'definitions';
  else if (t != null) {
    /* 有 type 但不认识：交给结构判断，避免误吞 */
    kind = null;
  } else {
    kind = null;
  }
  if (kind == null) {
    /* 无 type（向后兼容文件）或未知 type：靠目录 + 结构判别 */
    var hasLayouts = isPlainObject(parsed.layouts) && Object.keys(parsed.layouts).length > 0;
    var hasSchemas = isPlainObject(parsed.schemas);
    if (baseName(path).toLowerCase() === 'definitions.json') kind = 'definitions';
    else if (inDir(path, 'layouts')) kind = hasLayouts ? 'layout' : 'unknown';
    else if (inDir(path, 'popups')) kind = 'popup';
    else if (hasLayouts && !hasSchemas) kind = 'layout';
    else if (hasSchemas && !hasLayouts) kind = 'popup';
    else if (!hasLayouts && !hasSchemas &&
      (isPlainObject(parsed.keys) || isPlainObject(parsed.actions) || isPlainObject(parsed.macros))) {
      kind = 'definitions';
    } else kind = 'unknown';
  }
  if (kind === 'unknown') {
    return { kind: kind, data: parsed, error: '无法判断文件类型（缺 type，且不符合 layouts/schemas/definitions 特征）' };
  }
  return { kind: kind, data: parsed, error: null };
};

/* ================================================================
 * 二、合并共享定义（对齐 Foxy 运行时语义）
 * ================================================================ */

/* 布局/弹出菜单自身的定义**覆盖**共享 definitions 中的同名项：
 * 文档原文 “Layout and popup profiles merge their own definitions over the shared names.”
 * 返回 { profile, report }；profile 为合并后的新对象（不改动入参）。 */
FE.mergeDefinitions = function (profile, definitions) {
  var out = deepClone(profile || {});
  var report = { keys: [], actions: [], macros: [], overridden: [], skipped: [] };
  if (!isPlainObject(definitions)) return { profile: out, report: report };

  ['keys', 'actions', 'macros'].forEach(function (section) {
    var shared = isPlainObject(definitions[section]) ? definitions[section] : {};
    var own = isPlainObject(out[section]) ? out[section] : {};
    var merged = {};
    var k;
    for (k in shared) if (hasOwn(shared, k)) { merged[k] = deepClone(shared[k]); report[section].push(k); }
    for (k in own) if (hasOwn(own, k)) {
      /* 布局自己定义了同名项：以布局为准，并记录一次覆盖 */
      if (hasOwn(merged, k)) report.overridden.push(section + '.' + k);
      merged[k] = own[k];
    }
    if (Object.keys(merged).length) out[section] = merged;
  });
  return { profile: out, report: report };
};

/* ================================================================
 * 三、递归收集 popupKey（用于自动关联弹出菜单文件）
 * ================================================================ */

/* 布局文件里 popupKey 可能出现在 keys 定义或任意布局的放置点上，故整树扫描 */
FE.collectPopupKeys = function (profile) {
  var found = {};
  (function walk(node) {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (var k in node) {
      if (!hasOwn(node, k)) continue;
      var v = node[k];
      if (k === 'popupKey' && typeof v === 'string' && v) found[v] = true;
      else walk(v);
    }
  })(profile);
  return Object.keys(found);
};

/* 弹出菜单文件里已定义的 popupKey 集合（跨全部 schema） */
FE.collectPopupSchemaKeys = function (popupProfile) {
  var out = {};
  var schemas = isPlainObject(popupProfile) && isPlainObject(popupProfile.schemas) ? popupProfile.schemas : {};
  for (var s in schemas) {
    if (!hasOwn(schemas, s)) continue;
    var grp = schemas[s];
    if (!isPlainObject(grp)) continue;
    for (var k in grp) if (hasOwn(grp, k)) out[k] = true;
  }
  return Object.keys(out);
};

/* 在多个弹出菜单文件中，挑出覆盖当前布局 popupKey 最多的那个。
 * 覆盖数并列时优先同名词的文件（simple.json ↔ simple.json），其次是路径序靠前的。
 * 覆盖数为 0 时返回 null（该布局并未使用弹出菜单）。 */
FE.matchPopupFile = function (layoutProfile, popupEntries, layoutName) {
  var used = FE.collectPopupKeys(layoutProfile);
  if (!used.length) return null;
  var want = baseName(layoutName || '').toLowerCase();
  var best = null;
  for (var i = 0; i < popupEntries.length; i++) {
    var e = popupEntries[i];
    var have = {};
    FE.collectPopupSchemaKeys(e.data).forEach(function (k) { have[k] = true; });
    var hit = 0, missing = [];
    used.forEach(function (k) { if (have[k]) hit++; else missing.push(k); });
    if (hit === 0) continue;
    var sameName = (want && baseName(e.name).toLowerCase() === want) ? 1 : 0;
    var cand = { entry: e, covered: hit, total: used.length, missing: missing, _same: sameName };
    if (!best || cand.covered > best.covered ||
      (cand.covered === best.covered && cand._same > best._same)) best = cand;
  }
  if (best) delete best._same;
  return best;
};

/* ================================================================
 * 四、文件夹导入计划
 * ================================================================ */

/* 把一批文件条目整理成导入计划。
 * entries: [{ name, path, text }]（来自 <input webkitdirectory> 的 File 列表）
 * 返回 {
 *   definitions, layouts, popups, unknown, errors, warnings, summary
 * }
 * 纯函数：不触碰 DOM，便于测试。 */
FE.planFolderImport = function (entries) {
  var plan = { definitions: null, layouts: [], popups: [], unknown: [], errors: [], warnings: [] };
  var list = Array.isArray(entries) ? entries : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    var path = e.path || e.name || '';
    var bn = baseName(path);
    if (!/\.json$/i.test(bn)) continue;   /* 只看 JSON */
    var res = FE.classifyFoxyFile(e.text, path);
    var item = { path: normPath(path), name: bn, data: res.data, text: e.text };
    if (res.error && res.kind === 'unknown') {
      plan.unknown.push({ path: item.path, name: bn, error: res.error });
      plan.errors.push(bn + '：' + res.error);
      continue;
    }
    if (res.kind === 'layout') plan.layouts.push(item);
    else if (res.kind === 'popup') plan.popups.push(item);
    else if (res.kind === 'definitions') {
      /* 多个 definitions 时以最浅路径（最接近 frontend/ 根）者为准，与运行时读取位置一致 */
      if (!plan.definitions || item.path.split('/').length < plan.definitions.path.split('/').length) {
        if (plan.definitions) {
          plan.warnings.push('发现多个 definitions 文件，已采用 ' + item.name +
            '（按路径层级判定），忽略 ' + plan.definitions.name);
        }
        plan.definitions = item;
      } else {
        plan.warnings.push('发现多个 definitions 文件，忽略 ' + item.name);
      }
    }
  }
  plan.layouts.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
  plan.popups.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
  if (!plan.layouts.length) plan.errors.push('文件夹内没有找到布局文件（foxy.keyboard-layout）');
  plan.summary = {
    layouts: plan.layouts.length,
    popups: plan.popups.length,
    definitions: plan.definitions ? 1 : 0,
    unknown: plan.unknown.length
  };
  return plan;
};

/* 选中某个布局文件，合并共享定义，产出可直接装入编辑器的 profile。
 * 返回 { profile, report, popupMatch } */
FE.buildProfileFromPlan = function (plan, layoutPath) {
  var target = null;
  for (var i = 0; i < plan.layouts.length; i++) {
    if (plan.layouts[i].path === layoutPath) { target = plan.layouts[i]; break; }
  }
  if (!target) target = plan.layouts[0];
  if (!target) return null;
  var merged = FE.mergeDefinitions(target.data, plan.definitions ? plan.definitions.data : null);
  merged.profile = FE.normalizeProfile ? FE.normalizeProfile(merged.profile) : merged.profile;
  return {
    entry: target,
    profile: merged.profile,
    report: merged.report,
    popupMatch: FE.matchPopupFile(target.data, plan.popups, target.name)
  };
};

/* 生成一句人类可读的识别结果摘要（状态栏用） */
FE.describePlan = function (plan) {
  var s = plan.summary;
  var parts = ['识别到 ' + s.layouts + ' 个布局文件'];
  if (s.definitions) parts.push('definitions.json');
  if (s.popups) parts.push(s.popups + ' 个弹出菜单文件');
  if (s.unknown) parts.push(s.unknown + ' 个无法识别');
  return parts.join(' · ');
};

/* ================================================================
 * 五、导出还原（把共享定义剥回 definitions.json）
 * ================================================================ */

/* 合并导入后编辑器持有的是自包含 profile。导出时把**未改动**的共享定义剥离，
 * 还原成运行时那套「薄布局 + definitions.json」结构；被用户改动过的项则保留在
 * 布局文件里（否则引用会断）。
 * 返回 { layoutText, definitionsText, split: {kept, stripped} }；无共享定义时
 * definitionsText 为 null。 */
FE.splitProfileForExport = function (profile, definitions) {
  if (!isPlainObject(definitions)) {
    return { layout: deepClone(profile), definitions: null, split: { kept: [], stripped: [] } };
  }
  var out = deepClone(profile);
  var kept = [], stripped = [];
  ['keys', 'actions', 'macros'].forEach(function (section) {
    var shared = isPlainObject(definitions[section]) ? definitions[section] : {};
    var own = isPlainObject(out[section]) ? out[section] : {};
    for (var k in own) {
      if (!hasOwn(own, k)) continue;
      if (!hasOwn(shared, k)) { kept.push(section + '.' + k); continue; }
      /* 与共享定义逐字节一致 → 来自 definitions，剥离；否则视为本地改动，保留 */
      if (JSON.stringify(own[k]) === JSON.stringify(shared[k])) {
        delete own[k];
        stripped.push(section + '.' + k);
      } else kept.push(section + '.' + k);
    }
    if (isPlainObject(out[section]) && Object.keys(out[section]).length === 0) delete out[section];
  });
  return { layout: out, definitions: deepClone(definitions), split: { kept: kept, stripped: stripped } };
};

/* 导出时恢复 definitions 文件的规范结构（保留原始 author 等字段） */
FE.serializeDefinitions = function (definitions) {
  var out = deepClone(definitions || {});
  if (out.type == null) out.type = 'foxy.definitions';
  var ordered = {};
  if (out.type != null) ordered.type = out.type;
  if (out.author != null) ordered.author = out.author;
  ['keys', 'actions', 'macros'].forEach(function (s) { if (out[s] != null) ordered[s] = out[s]; });
  for (var k in out) {
    if (hasOwn(out, k) && !hasOwn(ordered, k)) ordered[k] = out[k];
  }
  return JSON.stringify(ordered, null, 2);
};

})();
