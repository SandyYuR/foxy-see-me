/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * folder-import.js — 文件夹批量导入：识别共享定义、布局、弹出菜单、工具栏与主题资源
 *
 * 背景（见 skills/SKILL.md 的 Related Foxy JSON Files / Shared Definitions）：
 *   Foxy 运行时的布局包是**跨文件**的，一个包里可能同时有
 *     <外部存储>/foxy/frontend/definitions/<profile>.json  共享 keys/actions/macros/icons
 *     <外部存储>/foxy/frontend/layouts/<profile>.json       布局文件（可只定义少量键）
 *     <外部存储>/foxy/frontend/popups/<profile>.json        弹出菜单文件
 *     <外部存储>/foxy/frontend/toolbars/<profile>.json      工具栏按钮表（foxy.toolbar）
 *     <外部存储>/foxy/frontend/themes/<profile>.json        主题配色（foxy.keyboard-theme）
 *   布局文件里引用的名字大量来自共享定义，单文件导入必然满屏 “ref 无法解析”。
 *   本模块把整个文件夹读进来，按运行时规则合并成自包含 profile，并把工具栏、主题、
 *   符号/表情与字体图片等资源一并识别出来交给上层。
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

/* 显式 type → 内部种类名。App 侧用同一套字符串判定文件类型
 * （foxy_re 的 defpackage/t90.java：layout / popup / theme / definitions / toolbar / symbols / emoji / kaomoji）。 */
var TYPE_KINDS = {
  'foxy.keyboard-layout': 'layout',
  'foxy.popup-profile': 'popup',
  'foxy.definitions': 'definitions',
  'foxy.toolbar': 'toolbar',
  'foxy.keyboard-theme': 'theme',
  'foxy.symbols': 'symbols',
  'foxy.emoji': 'emoji',
  'foxy.kaomoji': 'kaomoji'
};

/* 判定一份 JSON 文本属于哪种 Foxy 格式。
 * 依据优先级：显式 type > 目录约定 > 结构特征。
 * 返回 { kind, data, error }；
 * kind ∈ layout / popup / definitions / toolbar / theme / symbols / emoji / kaomoji / unknown */
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
  /* 显式 type → 种类；不认识的 type 交给结构判断，避免误吞 */
  var kind = t != null && hasOwn(TYPE_KINDS, t) ? TYPE_KINDS[t] : null;
  if (kind == null) {
    /* 无 type（向后兼容文件）或未知 type：靠目录 + 结构判别 */
    var hasLayouts = isPlainObject(parsed.layouts) && Object.keys(parsed.layouts).length > 0;
    var hasSchemas = isPlainObject(parsed.schemas);
    if (baseName(path).toLowerCase() === 'definitions.json') kind = 'definitions';
    else if (inDir(path, 'definitions')) kind = 'definitions';
    else if (inDir(path, 'layouts')) kind = hasLayouts ? 'layout' : 'unknown';
    else if (inDir(path, 'popups')) kind = 'popup';
    else if (inDir(path, 'toolbars')) kind = 'toolbar';
    else if (inDir(path, 'themes')) kind = 'theme';
    else if (inDir(path, 'symbols')) kind = 'symbols';
    else if (hasLayouts && !hasSchemas) kind = 'layout';
    else if (hasSchemas && !hasLayouts) kind = 'popup';
    else if (!hasLayouts && !hasSchemas &&
      (isPlainObject(parsed.keys) || isPlainObject(parsed.actions) || isPlainObject(parsed.macros))) {
      kind = 'definitions';
    } else kind = 'unknown';
  }
  if (kind === 'unknown') {
    return { kind: kind, data: parsed, error: '无法判断文件类型（缺 type，且不符合 layouts / popups / definitions / toolbars / themes 特征）' };
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
  var report = { keys: [], actions: [], macros: [], icons: [], overridden: [], skipped: [] };
  if (!isPlainObject(definitions)) return { profile: out, report: report };

  /* icons 也参与合并：文档写明自定义图标名来自 "top-level icons map"，
   * 且 definitions 里的 icons 与布局自己的 icons 同样合并、同名以布局为准。 */
  ['keys', 'actions', 'macros', 'icons'].forEach(function (section) {
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
 * entries: [{ name, path, text, file }]（来自 <input webkitdirectory> 的 File 列表；
 *          text 只有 JSON 才读，二进制资源留 file 引用给上层处理）
 * 返回 {
 *   definitions, definitionsList, layouts, popups, toolbars, themes, symbols,
 *   assets, unknown, errors, warnings, summary
 * }
 * 纯函数：不触碰 DOM，便于测试。 */
FE.planFolderImport = function (entries) {
  var plan = {
    definitions: null, definitionsList: [], layouts: [], popups: [],
    toolbars: [], themes: [], symbols: [], assets: [],
    unknown: [], errors: [], warnings: []
  };
  var list = Array.isArray(entries) ? entries : [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    var path = e.path || e.name || '';
    var bn = baseName(path);
    if (!/\.json$/i.test(bn)) {
      /* 非 JSON：主题包里的字体、图片、预览图等资源。这里只登记，
       * 具体怎么用由上层决定（字体交给主题页的符号字体链路，图片目前只计数）。 */
      plan.assets.push({
        path: normPath(path), name: bn,
        ext: (bn.match(/\.[^.]+$/) || [''])[0].toLowerCase(),
        file: e.file || null
      });
      continue;
    }
    var res = FE.classifyFoxyFile(e.text, path);
    var item = { path: normPath(path), name: bn, data: res.data, text: e.text, file: e.file || null };
    if (res.error && res.kind === 'unknown') {
      plan.unknown.push({ path: item.path, name: bn, error: res.error });
      plan.errors.push(bn + '：' + res.error);
      continue;
    }
    if (res.kind === 'layout') plan.layouts.push(item);
    else if (res.kind === 'popup') plan.popups.push(item);
    else if (res.kind === 'definitions') plan.definitionsList.push(item);
    else if (res.kind === 'toolbar') plan.toolbars.push(item);
    else if (res.kind === 'theme') plan.themes.push(item);
    else if (res.kind === 'symbols' || res.kind === 'emoji' || res.kind === 'kaomoji') plan.symbols.push(item);
    else plan.unknown.push({ path: item.path, name: bn, error: '未知类型 ' + res.kind });
  }
  function byPath(a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; }
  ['layouts', 'popups', 'definitionsList', 'toolbars', 'themes', 'symbols', 'assets'].forEach(function (k) {
    plan[k].sort(byPath);
  });
  /* 共享定义可以有多份：frontend/definitions/*.json 各自是一个 profile（见 SKILL.md）。
   * 默认优先 default.json，其次路径最浅者（最接近 frontend/ 根，与运行时读取位置一致）；
   * 其余留给「共享定义」下拉切换。 */
  if (plan.definitionsList.length) {
    var defs = plan.definitionsList, def = null;
    for (var d = 0; d < defs.length; d++) {
      if (/^default\.json$/i.test(defs[d].name)) { def = defs[d]; break; }
    }
    if (!def) {
      def = defs[0];
      for (var d2 = 1; d2 < defs.length; d2++) {
        if (defs[d2].path.split('/').length < def.path.split('/').length) def = defs[d2];
      }
    }
    plan.definitions = def;
    if (defs.length > 1) {
      plan.warnings.push('发现 ' + defs.length + ' 份共享定义（' +
        defs.map(function (x) { return x.name; }).join('、') +
        '），默认用 ' + def.name + '，可在「共享定义」下拉里切换');
    }
  }
  if (!plan.layouts.length) plan.errors.push('文件夹内没有找到布局文件（foxy.keyboard-layout）');
  plan.summary = {
    layouts: plan.layouts.length,
    popups: plan.popups.length,
    definitions: plan.definitions ? 1 : 0,
    definitionsProfiles: plan.definitionsList.length,
    toolbars: plan.toolbars.length,
    themes: plan.themes.length,
    symbols: plan.symbols.length,
    assets: plan.assets.length,
    unknown: plan.unknown.length
  };
  return plan;
};

/* 选中某个布局文件，合并共享定义，产出可直接装入编辑器的 profile。
 * defsPath 指定用哪一份共享定义（definitions/*.json 多 profile 时由 UI 选择），
 * 省略则用计划里的默认项。
 * 返回 { entry, profile, report, definitions, popupMatch } */
FE.buildProfileFromPlan = function (plan, layoutPath, defsPath) {
  var target = null;
  for (var i = 0; i < plan.layouts.length; i++) {
    if (plan.layouts[i].path === layoutPath) { target = plan.layouts[i]; break; }
  }
  if (!target) target = plan.layouts[0];
  if (!target) return null;
  var defsEntry = plan.definitions || null;
  if (defsPath) {
    var dl = plan.definitionsList || [];
    for (var j = 0; j < dl.length; j++) {
      if (dl[j].path === defsPath) { defsEntry = dl[j]; break; }
    }
  }
  var merged = FE.mergeDefinitions(target.data, defsEntry ? defsEntry.data : null);
  merged.profile = FE.normalizeProfile ? FE.normalizeProfile(merged.profile) : merged.profile;
  return {
    entry: target,
    profile: merged.profile,
    report: merged.report,
    definitions: defsEntry,
    popupMatch: FE.matchPopupFile(target.data, plan.popups, target.name)
  };
};

/* 生成一句人类可读的识别结果摘要（状态栏用） */
FE.describePlan = function (plan) {
  var s = plan.summary;
  var parts = ['识别到 ' + s.layouts + ' 个布局文件'];
  var defName = plan.definitions ? plan.definitions.name : '';
  if (s.definitionsProfiles > 1) {
    parts.push('共享定义 ' + s.definitionsProfiles + ' 份（用 ' + defName + '）');
  } else if (s.definitions) {
    parts.push('共享定义 ' + defName);
  }
  if (s.popups) parts.push(s.popups + ' 个弹出菜单文件');
  if (s.toolbars) parts.push(s.toolbars + ' 个工具栏文件');
  if (s.themes) parts.push(s.themes + ' 个主题文件');
  if (s.symbols) parts.push(s.symbols + ' 个符号/表情文件');
  if (s.assets) parts.push(s.assets + ' 个资源文件');
  if (s.unknown) parts.push(s.unknown + ' 个无法识别');
  return parts.join(' · ');
};

/* ================================================================
 * 五、工具栏文档（foxy.toolbar）→ 预览模型
 * ================================================================ */

/* 把 foxy.toolbar 文档解析成工具栏预览能直接用的模型。
 * 结构（见 SKILL.md / foxy_re 的 f12.java）：
 *   { type:'foxy.toolbar', version, toolbars:{ main:[id…], expanded:[id…] },
 *     buttons:{ <id>: { id, label, icon, activeIcon? } }, containers:{…} }
 * icon / activeIcon 是**与图标映射同形式**的载荷（svg: / xml: 前缀或裸标记）。
 * 返回 { config, icons, labels, unknownIds, warnings }；没有可用的按钮表返回 null。 */
FE.toolbarModelFromFile = function (data) {
  if (!isPlainObject(data)) return null;
  var bars = isPlainObject(data.toolbars) ? data.toolbars : {};
  function idList(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(function (x) { return typeof x === 'string' && x; });
  }
  var main = idList(bars.main), expanded = idList(bars.expanded);
  if (!main.length && !expanded.length) return null;
  var icons = {}, labels = {}, unknownIds = [], warnings = [];
  var raw = isPlainObject(data.buttons) ? data.buttons : {};
  /* buttons 在真实文件里是**对象**（id → 定义）；数组写法也容忍 */
  var list = Array.isArray(raw) ? raw : Object.keys(raw).map(function (k) { return raw[k]; });
  list.forEach(function (b) {
    if (!isPlainObject(b)) return;
    var id = typeof b.id === 'string' && b.id ? b.id : null;
    if (!id) return;
    if (typeof b.label === 'string' && b.label) labels[id] = b.label;
    var icon = typeof b.icon === 'string' && b.icon.trim() ? b.icon.trim() : null;
    var activeIcon = typeof b.activeIcon === 'string' && b.activeIcon.trim() ? b.activeIcon.trim() : null;
    if (icon || activeIcon) icons[id] = { icon: icon, activeIcon: activeIcon };
  });
  var known = FE.TOOLBAR_BUTTONS || {};
  main.concat(expanded).forEach(function (id) {
    if (!hasOwn(known, id) && unknownIds.indexOf(id) < 0) unknownIds.push(id);
  });
  if (isPlainObject(data.containers) && Object.keys(data.containers).length) {
    warnings.push('工具栏容器（containers）暂不参与预览，只按 main / expanded 画按钮');
  }
  return {
    config: { main: main, expanded: expanded },
    icons: icons,
    labels: labels,
    unknownIds: unknownIds,
    warnings: warnings
  };
};

/* ================================================================
 * 六、导出还原（把共享定义剥回 definitions.json）
 * ================================================================ */

/* 合并导入后编辑器持有的是自包含 profile。导出时把**未改动**的共享定义剥离，
 * 还原成运行时那套「薄布局 + definitions.json」结构；被用户改动过的项则保留在
 * 布局文件里（否则引用会断）。
 * 返回 { layoutText, definitionsText, split: {kept, stripped} }；无共享定义时
 * definitionsText 为 null。 */
function semanticJson(value) {
  if (Array.isArray(value)) return '[' + value.map(semanticJson).join(',') + ']';
  if (isPlainObject(value)) return '{' + Object.keys(value).sort().map(function (k) {
    return JSON.stringify(k) + ':' + semanticJson(value[k]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
FE.splitProfileForExport = function (profile, definitions) {
  if (!isPlainObject(definitions)) {
    return { layout: deepClone(profile), definitions: null, split: { kept: [], stripped: [] } };
  }
  var out = deepClone(profile);
  var kept = [], stripped = [];
  /* icons 与 keys/actions/macros 同样处理：与共享定义逐字节一致就剥离，
   * 否则视为本地自定义图标保留在布局里。 */
  ['keys', 'actions', 'macros', 'icons'].forEach(function (section) {
    var shared = isPlainObject(definitions[section]) ? definitions[section] : {};
    var own = isPlainObject(out[section]) ? out[section] : {};
    for (var k in own) {
      if (!hasOwn(own, k)) continue;
      if (!hasOwn(shared, k)) { kept.push(section + '.' + k); continue; }
      /* 与共享定义逐字节一致 → 来自 definitions，剥离；否则视为本地改动，保留 */
      if (semanticJson(own[k]) === semanticJson(shared[k])) {
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
  ['keys', 'actions', 'macros', 'icons'].forEach(function (s) { if (out[s] != null) ordered[s] = out[s]; });
  for (var k in out) {
    if (hasOwn(out, k) && !hasOwn(ordered, k)) ordered[k] = out[k];
  }
  return JSON.stringify(ordered, null, 2);
};

})();
