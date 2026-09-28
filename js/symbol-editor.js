/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * symbol-editor.js — 符号 / Emoji / 颜文字面板编辑标签页
 *
 * 数据是三类独立 JSON（<外部存储>/foxy/frontend/{symbols,emoji,kaomoji}/<名>.json），
 * 格式与 layout/popup **不同**：顶层只有两个键，**没有 type 字段**：
 *   { "multiLine": false, "groups": [ { "names": {"zh":…,"zh-Hant":…,"en":…},
 *                                       "symbols": ["…","…"] } ] }
 * 证据见 foxy/foxy-app-format-baseline.md §2.2（App 反编译核对）。几个必须照抄的点：
 *   · §2.3 组名语言回退链（symbolGroupLabel）；
 *   · §2.3 空 names / 空 symbols 的组会被 App **整组静默丢弃** → 校验器报警；
 *   · §2.5 multiLine 语义：true → 每行 1 格、行高 WRAP_CONTENT（自适应）；
 *                          false → 每行 6 格、**固定 40dp 高**（长条目被等比缩小到很小）；
 *   · §2.5 旧格式兼容：顶层直接是数组时按 {multiLine:false, groups:[…]} 处理；
 *   · §2.1 目录里的文件**不会被自动读取**：必须在「设置 → 符号布局」里选中该 catalog
 *     才生效（内置走 APK assets，放同名文件不会覆盖内置）。
 *
 * ⚠️ 符号三文件**不能**入库 examples/（AGENT.md D8/§4.8）：顶层 {multiLine,groups}
 * 会让 build-examples.js 抛「无法判断示例类型」。所以本页的「示例」下拉用的是
 * 文件内自带的极小内置样例（FE.SYMBOL_SAMPLES），与 examples-bundle 无关。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

/* ================================================================
 * 一、纯逻辑部分（Node 测试可直接使用）
 * ================================================================ */

/* 三类面板的元数据。dir/file 按基线 §2.1 的目录与文件名规则；
 * multiLine 是该类的**默认**取值 —— 只用于「新建空文档」，导入时一律以文件里的
 * 值为准（缺省 false，见 §2.5），颜文字这类多字符条目才默认 true。 */
FE.SYMBOL_KINDS = [
  {
    id: 'symbols', label: '符号', dir: 'symbols', file: 'symbols.json', multiLine: false,
    desc: '单字符符号（每行 6 格）'
  },
  {
    id: 'emoji', label: 'Emoji', dir: 'emoji', file: 'emoji.json', multiLine: false,
    desc: 'Emoji 表情（每行 6 格）'
  },
  {
    id: 'kaomoji', label: '颜文字', dir: 'kaomoji', file: 'kaomoji.json', multiLine: true,
    desc: '多字符颜文字（每行 1 格，默认 multiLine）'
  }
];

/* 取某个 kind 的元数据；未知 kind 回退到第一个（而不是抛错 —— 状态可能来自旧草稿）。 */
FE.symbolKindMeta = function (kind) {
  var list = FE.SYMBOL_KINDS;
  for (var i = 0; i < list.length; i++) if (list[i].id === kind) return list[i];
  for (var j = 0; j < list.length; j++) if (kind && String(kind).toLowerCase() === list[j].id) return list[j];
  return list[0];
};

/* 字符宽度（字形簇数）：用于 multiLine=false 的裁切判断。
 * 为什么不用 String.length：`❤️` 是 2 个码元、`🏴󠁧󠁢󠁷󠁬󠁳󠁿` 是 7 个码元，
 * 但它们在 App 里都只占一格 —— 拿 length 判断会把内置 emoji/symbols 全判成
 * 「多字符条目」而刷屏误报。优先用 Intl.Segmenter（按字形簇切），
 * 不可用时走下面的近似实现。 */
var symSegmenter = null;
FE.symbolGraphemeCount = function (s) {
  s = String(s == null ? '' : s);
  if (!s) return 0;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      if (!symSegmenter) symSegmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
      var n = 0;
      var it = symSegmenter.segment(s)[Symbol.iterator]();
      for (var r = it.next(); !r.done; r = it.next()) n++;
      return n;
    } catch (e) { /* 走近似实现 */ }
  }
  return symGraphemesLite(s);
};

function symIsMark(cp) {
  try { return /\p{M}/u.test(String.fromCodePoint(cp)); }
  catch (e) { return cp >= 0x0300 && cp <= 0x036F; }
}
function symGraphemesLite(s) {
  var cps = Array.from(s);
  var n = 0, i = 0;
  function cpAt(k) { return k < cps.length ? cps[k].codePointAt(0) : -1; }
  while (i < cps.length) {
    var cp = cpAt(i);
    /* 区域指示符（国旗）成对算一格 */
    if (cp >= 0x1F1E6 && cp <= 0x1F1FF) {
      var nx = cpAt(i + 1);
      i += (nx >= 0x1F1E6 && nx <= 0x1F1FF) ? 2 : 1;
      n++;
      continue;
    }
    n++; i++;
    /* 吸收后续的 ZWJ 序列 / 变体选择符 / 肤色修饰符 / tag 字符 / 组合记号 */
    for (;;) {
      var c2 = cpAt(i);
      if (c2 < 0) break;
      if (c2 === 0x200D) { i++; if (i < cps.length) i++; continue; }
      if ((c2 >= 0xFE00 && c2 <= 0xFE0F) || (c2 >= 0xE0100 && c2 <= 0xE01EF) ||
          (c2 >= 0x1F3FB && c2 <= 0x1F3FF) || c2 === 0x20E3 ||
          (c2 >= 0xE0020 && c2 <= 0xE007F) || symIsMark(c2)) { i++; continue; }
      break;
    }
  }
  return n;
}

/* 容错归一化。接受：
 *   · 标准对象 { multiLine, groups }
 *   · 旧格式：顶层直接是数组（§2.5，multiLine 强制 false）
 *   · null / undefined → 空文档（multiLine 取该 kind 的默认值：颜文字 true）
 * 只保留 names / symbols 两个已知键（多余的键不会写回文件）；
 * names 值与 symbols 条目统一成字符串；无法识别的分组条目直接丢弃。 */
FE.normalizeSymbolProfile = function (kind, p) {
  var meta = FE.symbolKindMeta(kind);
  var out = { multiLine: false, groups: [] };
  var rawGroups = null;
  if (Array.isArray(p)) {
    rawGroups = p;                       /* 旧格式：顶层数组 */
  } else if (FE.isPlainObject(p)) {
    out.multiLine = (p.multiLine === true || p.multiLine === 'true');
    rawGroups = Array.isArray(p.groups) ? p.groups : [];
  } else {
    /* 空文档：用该类别的默认 multiLine（颜文字 true），仅是新建时的便利默认 */
    out.multiLine = meta.multiLine === true;
    return out;
  }
  function takeSymbols(arr, dst) {
    (Array.isArray(arr) ? arr : []).forEach(function (s) {
      if (s == null) return;
      dst.push(typeof s === 'string' ? s : String(s));
    });
  }
  rawGroups.forEach(function (g) {
    var names = {}, symbols = [];
    if (FE.isPlainObject(g)) {
      if (FE.isPlainObject(g.names)) {
        Object.keys(g.names).forEach(function (k) {
          var v = g.names[k];
          if (v == null) return;
          names[k] = typeof v === 'string' ? v : String(v);
        });
      }
      takeSymbols(g.symbols, symbols);
    } else if (Array.isArray(g)) {
      takeSymbols(g, symbols);
    } else if (typeof g === 'string') {
      symbols.push(g);
    } else {
      return;                            /* 无法识别：丢弃 */
    }
    out.groups.push({ names: names, symbols: symbols });
  });
  return out;
};

/* 序列化：顶层键序固定为 multiLine → groups（App 只认这两个键，无 type）。 */
FE.serializeSymbolProfile = function (p) {
  var n = FE.normalizeSymbolProfile(null, p);
  var ordered = { multiLine: n.multiLine === true, groups: [] };
  n.groups.forEach(function (g) {
    ordered.groups.push({ names: g.names, symbols: g.symbols });
  });
  return JSON.stringify(ordered, null, 2);
};

/* 组名按语言回退链取值（基线 §2.3，与 App 的 lv0.java:142-149 对齐）：
 *   1. names[完整标签] 精确命中（如 zh-Hant / zh-TW / en）；
 *   2. 未命中 → 取第一个 "-" 之前的主标签 V；
 *      · V === 'zh' 且标签 ∈ {zh-TW, zh-HK, zh-MO} 且存在 zh-Hant → zh-Hant；
 *      · 否则 names[V]；
 *   3. V === 'zh' 仍未命中 → 再试 names['zh-Hant']；
 *   4. 兜底：names 里的第一个值（依赖解析保序）。 */
FE.symbolGroupLabel = function (group, lang) {
  var names = (group && FE.isPlainObject(group.names)) ? group.names : {};
  var keys = Object.keys(names);
  function get(k) {
    var v = k == null ? null : names[k];
    return (typeof v === 'string' && v !== '') ? v : null;
  }
  function first() {
    for (var i = 0; i < keys.length; i++) {
      var v = names[keys[i]];
      if (typeof v === 'string' && v !== '') return v;
    }
    return '';
  }
  var tag = (lang == null || lang === '') ? '' : String(lang);
  if (tag) {
    var exact = get(tag);
    if (exact) return exact;
    var v = tag.split('-')[0];
    if (v) {
      if (v === 'zh' && ['zh-TW', 'zh-HK', 'zh-MO'].indexOf(tag) >= 0) {
        var hant = get('zh-Hant');
        if (hant) return hant;
      }
      var main = get(v);
      if (main) return main;
      if (v === 'zh') {
        var hant2 = get('zh-Hant');
        if (hant2) return hant2;
      }
    }
  }
  return first();
};

/* 校验。宁可少报不要乱报（一个 err 会让 App 端整份文件不可用）：
 *   err  —— 结构根本不合法（groups 不是非空数组、分组不是对象、names/symbols 类型错）；
 *   warn —— App 会**静默丢弃**或行为可疑的（空 names / 空 symbols 的组、缺 zh 组名、
 *           非字符串条目、以及 multiLine=false 时多字符条目的可读性风险）。 */
FE.validateSymbolProfile = function (kind, p) {
  var errors = [], warnings = [];
  if (Array.isArray(p)) {
    warnings.push('顶层是数组（旧格式）：App 端会把 multiLine 强制当作 false 处理');
  } else if (!FE.isPlainObject(p)) {
    errors.push('符号数据必须是 JSON 对象（旧格式也接受顶层数组）');
    return { errors: errors, warnings: warnings };
  }
  var groups = Array.isArray(p) ? p : p.groups;
  if (!Array.isArray(groups)) {
    errors.push('groups 必须是数组');
    return { errors: errors, warnings: warnings };
  }
  if (!groups.length) {
    errors.push('groups 必须是非空数组（空文件在 App 端会抛 empty catalog）');
    return { errors: errors, warnings: warnings };
  }
  var multiLine = Array.isArray(p) ? false : (p.multiLine === true || p.multiLine === 'true');

  var dropped = [], missingZh = [], badNames = [], badSymbols = [], nonString = 0;
  var multi = 0, multiSample = '';
  groups.forEach(function (g, i) {
    var where = '第 ' + (i + 1) + ' 组';
    if (!FE.isPlainObject(g)) { errors.push(where + ' 不是对象'); return; }
    if (g.names != null && !FE.isPlainObject(g.names)) { badNames.push(where); }
    if (g.symbols != null && !Array.isArray(g.symbols)) { badSymbols.push(where); }
    var names = FE.isPlainObject(g.names) ? g.names : {};
    var symbols = Array.isArray(g.symbols) ? g.symbols : [];
    /* 空 names / 空 symbols：App 整组静默丢弃（§2.3 / lv0.java:151） */
    if (!Object.keys(names).length || !symbols.length) { dropped.push(where); return; }
    if (!names.zh) missingZh.push(where);
    symbols.forEach(function (s) {
      if (typeof s !== 'string') nonString++;
      if (multiLine) return;
      if (FE.symbolGraphemeCount(s) > 1) {
        multi++;
        if (!multiSample) multiSample = String(s);
      }
    });
  });

  if (badNames.length) errors.push(badNames.join('、') + ' 的 names 不是对象（应为 {"zh":"…"}）');
  if (badSymbols.length) errors.push(badSymbols.join('、') + ' 的 symbols 不是数组');
  if (dropped.length) {
    warnings.push(dropped.join('、') + ' 的 names 或 symbols 为空 —— App 端会**整组静默丢弃**');
  }
  if (missingZh.length) {
    warnings.push(missingZh.join('、') + ' 缺少 zh 组名（App 会走语言回退链取第一个可用的名字）');
  }
  if (nonString) warnings.push(nonString + ' 个条目不是字符串（已按字符串处理）');
  if (multi) {
    /* ⚠️ 后果是「等比缩小」而非「裁切」：格子设了 `setScaleMode(y9.a)` = Proportional
     *（ly.java:206、y9.java:19），z9 会把文字整体缩放到 `min(1, 宽比, 高比)`
     *（z9.java:102-105、259）—— 条目仍完整可见，只是小到难认。
     * 基线 §2.5 的"裁切"表述与 z9 实现不符，此处按实机行为描述。 */
    warnings.push('multiLine 为 false 但有 ' + multi + ' 个多字符条目（如「' +
      symEllipsis(multiSample, 12) + '」）：App 端格子固定 40dp 高，这类条目会被**等比缩小**' +
      '到很小（不是裁掉，只是可读性差），建议开启 multiLine（每行 1 格、高度自适应）');
  }
  return { errors: errors, warnings: warnings };
};

function symEllipsis(s, n) {
  var cps = Array.from(String(s == null ? '' : s));
  if (cps.length <= n) return cps.join('');
  return cps.slice(0, n).join('') + '…';
}

/* 内置极小样例：仅供「载入内置样例」快速上手。
 * 刻意**不入库 examples/**（AGENT.md D8/§4.8：顶层 {multiLine,groups} 会让
 * build-examples.js 抛「无法判断示例类型」），所以写在这里。 */
FE.SYMBOL_SAMPLES = {
  symbols: {
    multiLine: false,
    groups: [
      { names: { zh: '常用标点', 'zh-Hant': '常用標點', en: 'Punctuation' },
        symbols: [',', '.', '!', '?', ';', ':', '(', ')', '"', "'", '…', '—'] },
      { names: { zh: '数学符号', 'zh-Hant': '數學符號', en: 'Math' },
        symbols: ['+', '-', '×', '÷', '=', '≈', '≠', '≤', '≥', '∞', '√', 'π'] }
    ]
  },
  emoji: {
    multiLine: false,
    groups: [
      { names: { zh: '笑脸', 'zh-Hant': '笑臉', en: 'Smileys' },
        symbols: ['😀', '😄', '😊', '🙂', '😉', '😍'] },
      { names: { zh: '常用', 'zh-Hant': '常用', en: 'Common' },
        symbols: ['👍', '🙏', '💯', '🔥', '✨', '❤️'] }
    ]
  },
  kaomoji: {
    multiLine: true,
    groups: [
      { names: { zh: '开心', 'zh-Hant': '開心', en: 'Happy' },
        symbols: ['(＾▽＾)', '(≧▽≦)', '(*^▽^*)', 'ヽ(•‿•)ノ'] },
      { names: { zh: '卖萌', 'zh-Hant': '賣萌', en: 'Cute' },
        symbols: ['(・ω・)', '(｡･ω･｡)', '(◕‿◕)', '(๑´ㅂ`๑)'] }
    ]
  }
};

/* ================================================================
 * 二、UI 部分
 * 不在加载期提前 return：纯逻辑（Node）与浏览器共用同一份文件，
 * 各入口自己做存在性判断，这样接线方无论先加哪几个容器都不会抛异常。
 * ================================================================ */
var state = FE.state;
var h = FE.h, clearEl = FE.clearEl, $ = FE.$;

var DEFAULT_FILES = { symbols: 'symbols.json', emoji: 'emoji.json', kaomoji: 'kaomoji.json' };
var symJsonDirty = false;
var symInited = false;
var pathHintEl = null;

/* 懒建我自己的状态槽（不依赖 app.js 预置）：
 *   symbolKind            当前类别（symbols / emoji / kaomoji）
 *   symbolProfile         当前类别的 profile（与 symbolProfiles[kind] 同一对象）
 *   symbolProfiles        { kind: profile }
 *   symbolFileNames       { kind: 导出文件名 }
 *   symbolLegacy          { kind: 是否来自旧格式（顶层数组）}
 *   openSymbolGroups      分组卡片展开态（走 FE.ensureOpenSet，与其它三张列表同构）
 *   symbolShowAll         条目网格「显示全部」标记
 *   symbolSelEntry        选中条目 { group, index }（网格里点选） */
function ensureSymbolState() {
  var S = FE.state;
  if (!FE.isPlainObject(S.symbolProfiles)) S.symbolProfiles = {};
  if (!FE.isPlainObject(S.symbolFileNames)) S.symbolFileNames = {};
  if (!FE.isPlainObject(S.symbolLegacy)) S.symbolLegacy = {};
  if (!FE.isPlainObject(S.symbolSelEntry)) S.symbolSelEntry = null;
  if (S.symbolKind == null || typeof S.symbolKind !== 'string') S.symbolKind = FE.SYMBOL_KINDS[0].id;
  S.symbolKind = FE.symbolKindMeta(S.symbolKind).id;
  if (FE.ensureOpenSet && !FE.isPlainObject(S.openSymbolGroups)) FE.ensureOpenSet('openSymbolGroups');
  if (FE.ensureOpenSet && !FE.isPlainObject(S.symbolShowAll)) FE.ensureOpenSet('symbolShowAll');
}

/* 当前类别的 profile（事实来源） */
function sp() {
  ensureSymbolState();
  var kind = state.symbolKind;
  if (!FE.isPlainObject(state.symbolProfiles[kind])) {
    state.symbolProfiles[kind] = FE.normalizeSymbolProfile(kind, null);
  }
  state.symbolProfile = state.symbolProfiles[kind];
  return state.symbolProfiles[kind];
}

function switchSymbolKind(kind) {
  ensureSymbolState();
  var meta = FE.symbolKindMeta(kind);
  state.symbolProfiles[state.symbolKind] = sp();       /* 先把当前类别存回 */
  state.symbolKind = meta.id;
  if (!FE.isPlainObject(state.symbolProfiles[meta.id])) {
    state.symbolProfiles[meta.id] = FE.normalizeSymbolProfile(meta.id, null);
  }
  state.symbolProfile = state.symbolProfiles[meta.id];
  state.symbolSelEntry = null;
  symJsonDirty = false;
  return state.symbolProfile;
}

function symFileName() {
  var kind = state.symbolKind;
  return state.symbolFileNames[kind] || DEFAULT_FILES[kind] || 'symbols.json';
}

/* 数据变更一律走 FE.mutate（进撤销栈），随后自渲染一次 —— app.js 的 renderAll
 * 是否认得符号页由接线方决定，兜底自渲染保证界面立刻反映改动（重复渲染无害）。 */
function smutate(fn) {
  FE.mutate(fn);
  renderSymbolsTab();
}

function setSymStatus(msg, kind) {
  var el = $('sym-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}
function setSymJsonStatus(msg, kind) {
  var el = $('sym-json-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}

/* 分组摘要行显示名：组本身**没有名字字段**（名字在 names 里），所以用
 * zh 回退链的结果作显示名；同名分组追加 #2/#3 以保证 def-name 唯一
 * （openSet 键与 scrollToDefItem 的定位都依赖它唯一）。 */
function symGroupDisplayNames(groups) {
  var used = {}, out = [];
  (groups || []).forEach(function (g) {
    var base = FE.symbolGroupLabel(g, 'zh') || '（未命名分组）';
    var n = used[base] || 0;
    used[base] = n + 1;
    out.push(n ? base + ' #' + (n + 1) : base);
  });
  return out;
}

/* ================================================================
 * 三、渲染
 * ================================================================ */
function renderSymbolsTab() {
  ensureSymbolState();
  sp();
  renderSymToolbar();
  renderSymGroupList();
  renderSymJson();
  renderSymStatus();
  renderSymPathHint();
}

function renderSymToolbar() {
  var sel = $('sym-kind');
  if (sel) {
    if (!sel.children || !sel.children.length) {
      clearEl(sel);
      FE.SYMBOL_KINDS.forEach(function (m) {
        sel.appendChild(h('option', { value: m.id }, m.label + '（' + m.dir + '/）'));
      });
    }
    sel.value = state.symbolKind;
  }
  var chk = $('sym-multiline');
  if (chk) chk.checked = sp().multiLine === true;
}

/* 路径与生效条件提示（基线 §2.1 / 行动项 5）：
 * 关键一句是「需在设置里选中才生效」—— layouts/popups 是外部优先、assets 回退，
 * 符号三目录**相反**：默认只读 APK assets，放同名文件不会自动覆盖内置。 */
function renderSymPathHint() {
  var status = $('sym-status');
  if (!status || !status.parentNode) return;
  if (!pathHintEl || !pathHintEl.parentNode) {
    pathHintEl = h('div', { class: 'status dim' });
    status.parentNode.appendChild(pathHintEl);
  }
  clearEl(pathHintEl);
  var meta = FE.symbolKindMeta(state.symbolKind);
  var box = h('div');
  box.appendChild(h('div', null,
    '文件请放置于 ',
    h('code', null, '<外部存储>/foxy/frontend/' + meta.dir + '/<名>.json'),
    '（精确路径：Android/data/com.fxliang.foxy/files/foxy/frontend/' + meta.dir + '/）'));
  box.appendChild(h('div', null,
    '⚠️ 需在「设置 → 符号布局」里**选中**该 catalog 才生效；内置符号走 APK assets，' +
    '放一份同名文件**不会**自动覆盖内置。文件名需 > 5 字符且不含路径分隔符才会被列为候选（' +
    '当前导出名：' + symFileName() + '）。'));
  pathHintEl.appendChild(box);
}

/* 搜索用匹配文本：组名（三语全部）+ 全部条目内容 */
function symGroupMatchText(g) {
  var parts = [];
  if (FE.isPlainObject(g.names)) Object.keys(g.names).forEach(function (k) { parts.push(g.names[k]); });
  (Array.isArray(g.symbols) ? g.symbols : []).forEach(function (s) { parts.push(s); });
  return parts.join(' ');
}

function renderSymGroupList() {
  var host = $('sym-list');
  if (!host) return;
  clearEl(host);
  var profile = sp();
  var groups = profile.groups || [];
  var names = symGroupDisplayNames(groups);
  var filter = FE.defFilterValue ? FE.defFilterValue('sym-filter') : '';
  var idx = groups.map(function (_, i) { return i; });
  if (FE.defMatch && filter) {
    idx = FE.defMatch(idx, filter, function (i) { return names[i] + ' ' + symGroupMatchText(groups[i]); });
  }
  if (FE.appendMatchHint) FE.appendMatchHint(host, idx.length, groups.length, filter, '分组');
  if (!groups.length) {
    host.appendChild(h('div', { class: 'status' },
      '该类别还没有分组。用上方「新建分组」添加；一个分组 = 一个名字 + 一串条目。'));
    return;
  }
  if (!idx.length) return;

  var openSet = FE.ensureOpenSet ? FE.ensureOpenSet('openSymbolGroups') : {};
  idx.forEach(function (gi) {
    host.appendChild(symGroupCard(gi, groups[gi], names[gi], openSet));
  });
}

function symGroupCard(gi, g, displayName, openSet) {
  var count = Array.isArray(g.symbols) ? g.symbols.length : 0;
  var langs = FE.isPlainObject(g.names) ? Object.keys(g.names) : [];
  var empty = !count || !langs.length;
  var badge = h('span', { class: 'def-badges' + (empty ? ' st-warn' : '') },
    (empty ? '⚠ ' : '') + count + ' 条 · 组名 ' + (langs.length ? langs.join('/') : '（空，会被丢弃）'));
  return FE.collapsibleDefItem(displayName, badge, openSet, {
    extraClass: 'sym-group-card',
    summaryTitle: '展开并编辑分组「' + displayName + '」',
    confirmDelete: '删除分组 “' + displayName + '”？',
    onDelete: async function () {
      var ok = await FE.uiConfirm('删除分组 “' + displayName + '”及其 ' + count + ' 个条目？',
        { title: '删除分组', danger: true, okLabel: '删除' });
      if (!ok) return;
      smutate(function () {
        var S = sp();
        if (S.groups[gi] === g || (S.groups[gi] && S.groups[gi].names === g.names)) S.groups.splice(gi, 1);
        else {
          var k = S.groups.indexOf(g);
          if (k >= 0) S.groups.splice(k, 1);
        }
        if (openSet[displayName]) delete openSet[displayName];
      });
    },
    build: function (body) {
      body.appendChild(buildSymGroupEditor(gi, g, displayName));
    }
  });
}

/* 展开后的正文：组名三语 + 条目网格（按 multiLine 演示真实格数）+ 条目操作 */
function buildSymGroupEditor(gi, g, displayName) {
  var host = h('div', { class: 'sym-group-editor' });
  var profile = sp();
  var multi = profile.multiLine === true;

  /* --- 组名三语 --- */
  var namesRow = h('div', { class: 'form-row form-inline' },
    h('span', { class: 'mini-label' }, '组名'));
  ['zh', 'zh-Hant', 'en'].forEach(function (lang) {
    var inp = h('input', {
      type: 'text', class: 'mini-input', 'data-lang': lang,
      value: FE.isPlainObject(g.names) && g.names[lang] != null ? String(g.names[lang]) : '',
      placeholder: lang
    });
    inp.addEventListener('change', function () {
      smutate(function () {
        var S = sp();
        var target = S.groups[gi];
        if (!FE.isPlainObject(target)) return;
        if (!FE.isPlainObject(target.names)) target.names = {};
        if (String(inp.value).trim() === '') delete target.names[lang];
        else target.names[lang] = String(inp.value);
      });
    });
    namesRow.appendChild(inp);
  });
  host.appendChild(namesRow);

  /* 语言回退链预览：把 §2.3 的规则直接摆出来，方便核对多语言组名 */
  var fb = ['zh', 'zh-Hant', 'zh-Hant-TW', 'zh-TW', 'en'].map(function (lang) {
    return lang + ' → ' + (FE.symbolGroupLabel(g, lang) || '（空）');
  }).join('　·　');
  host.appendChild(h('div', { class: 'status dim' }, 'App 端显示名（按语言回退链）：' + fb));

  /* --- 条目网格 --- */
  var all = Array.isArray(g.symbols) ? g.symbols : [];
  var showAll = FE.ensureOpenSet ? FE.ensureOpenSet('symbolShowAll') : {};
  var CAP = 200;
  var collapsed = !showAll[displayName] && all.length > CAP;
  var limit = collapsed ? CAP : all.length;

  var cells = [];
  var gridStyle = multi
    ? { display: 'grid', gridTemplateColumns: '1fr', gap: '4px', margin: '8px 0' }
    : { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '4px', margin: '8px 0' };
  var grid = h('div', { class: 'sym-cells ' + (multi ? 'sym-cells-1' : 'sym-cells-6'), style: gridStyle });
  var selEntry = state.symbolSelEntry;
  var selIdx = (selEntry && selEntry.group === displayName && selEntry.index < limit) ? selEntry.index : -1;

  function cellStyle(selected) {
    var st = multi
      ? { minHeight: '40px', padding: '4px 8px', border: '1px solid var(--border)',
          borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          fontSize: '14px', cursor: 'pointer' }
      : { height: '40px', lineHeight: '30px', padding: '2px 6px', border: '1px solid var(--border)',
          borderRadius: '6px', overflow: 'hidden', whiteSpace: 'nowrap',
          textOverflow: 'ellipsis', fontSize: '14px', cursor: 'pointer' };
    if (selected) { st.outline = '2px solid #4c8dff'; st.outlineOffset = '1px'; }
    return st;
  }
  function makeCell(text, k) {
    var cell = h('div', {
      class: 'sym-cell' + (k === selIdx ? ' sym-cell-sel' : ''),
      style: cellStyle(k === selIdx),
      title: (multi ? '' : '格高固定 40dp，过长会等比缩小：') + text
    }, text === '' ? '（空）' : text);
    cell.addEventListener('click', function () { select(k); });
    cells.push(cell);
    return cell;
  }

  /* 按钮文案刻意与摘要行的「删除」（删整个分组）区分开：
   * 两者都在同一张卡片里，都叫「删除」的话用户分不清哪个删什么。 */
  var ops = h('div', { class: 'toolbar' });
  var editBtn = h('button', { type: 'button', class: 'mini-button', title: '编辑选中的条目' }, '编辑条目…');
  var delBtn = h('button', { type: 'button', class: 'mini-button danger', title: '删除选中的条目' }, '删除条目');
  var insertBtn = h('button', { type: 'button', class: 'mini-button', title: '在选中条目之后插入一条' }, '后插一条…');
  var selInfo = h('span', { class: 'mini-label' });
  function syncOps() {
    var has = selIdx >= 0;
    editBtn.disabled = !has;
    delBtn.disabled = !has;
    insertBtn.disabled = !has;
    clearEl(selInfo);
    selInfo.appendChild(document.createTextNode(
      '共 ' + all.length + ' 条' + (has ? '　·　选中 #' + (selIdx + 1) : '　·　点格子选中后可编辑')));
  }
  function select(k) {
    selIdx = k;
    state.symbolSelEntry = { group: displayName, index: k };
    cells.forEach(function (cell, ci) {
      var on = ci === selIdx;
      cell.classList.toggle('sym-cell-sel', on);
      cell.style.outline = on ? '2px solid #4c8dff' : '';
      cell.style.outlineOffset = on ? '1px' : '';
    });
    syncOps();
  }

  all.slice(0, limit).forEach(function (s, k) { grid.appendChild(makeCell(s, k)); });
  if (collapsed) {
    var rest = all.length - limit;
    var more = h('div', {
      class: 'sym-cell sym-cell-more',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center',
               height: '40px', border: '1px dashed var(--border)', borderRadius: '6px',
               cursor: 'pointer', fontSize: '12px' },
      title: '为免一次建出上千个格子卡住浏览器，默认只画前 ' + CAP + ' 条'
    }, '+ 还有 ' + rest + ' 条（点这里全部显示）');
    more.addEventListener('click', function () {
      showAll[displayName] = true;
      renderSymbolsTab();
    });
    grid.appendChild(more);
  }
  var addCell = h('div', {
    class: 'sym-cell sym-cell-add',
    style: { display: 'flex', alignItems: 'center', justifyContent: 'center',
             height: '40px', border: '1px dashed var(--border)', borderRadius: '6px',
             cursor: 'pointer', fontSize: '16px' },
    title: '在本组末尾添加条目'
  }, '+');
  addCell.addEventListener('click', function () { addEntry(); });
  grid.appendChild(addCell);
  host.appendChild(grid);

  /* multiLine 行为提示（基线 §2.5 / 行动项 8）。
   * ⚠️ 用词是「等比缩小」不是「裁切」—— App 给格子设了 `setScaleMode(y9.a)`，
   * `y9.a` = Proportional（ly.java:206、y9.java:19），z9 取 `min(1, 宽比, 高比)`
   * 再 `canvas.scale(n, o)` 把文字**整体缩小**画进固定格子（z9.java:102-105、259）。
   * 即条目不会溢出/截断，只是**小到影响可读性**。基线 §2.5 写作"裁切"与 z9 不符，
   * 这里按实机行为表述，免得用户以为"少几个字能看到"。 */
  host.appendChild(h('div', { class: 'status dim' },
    multi
      ? 'multiLine = true：预览为每行 1 格、高度自适应（App 端行高 WRAP_CONTENT，不缩小）。'
      : 'multiLine = false：预览为每行 6 格、固定 40dp 高（App 端如此）—— 多字符条目在手机上会被**等比缩小**到很小、可读性差（不是裁掉），建议开启 multiLine。'));

  editBtn.addEventListener('click', async function () {
    if (selIdx < 0) return;
    var cur = all[selIdx];
    var v = await FE.uiPrompt({
      title: '编辑条目',
      message: '第 ' + (selIdx + 1) + ' 条（当前宽度 ' + FE.symbolGraphemeCount(cur) + ' 格）',
      value: cur, required: true
    });
    if (v == null) return;
    var k = selIdx;
    smutate(function () {
      var S = sp();
      if (S.groups[gi] && Array.isArray(S.groups[gi].symbols)) S.groups[gi].symbols[k] = String(v);
    });
  });
  delBtn.addEventListener('click', async function () {
    if (selIdx < 0) return;
    var k = selIdx;
    var ok = await FE.uiConfirm('删除第 ' + (k + 1) + ' 条「' + symEllipsis(all[k], 12) + '」？',
      { title: '删除条目', danger: true, okLabel: '删除' });
    if (!ok) return;
    state.symbolSelEntry = null;
    smutate(function () {
      var S = sp();
      if (S.groups[gi] && Array.isArray(S.groups[gi].symbols)) S.groups[gi].symbols.splice(k, 1);
    });
  });
  insertBtn.addEventListener('click', function () {
    if (selIdx < 0) return;
    var k = selIdx;
    insertEntry(k + 1, '在第 ' + (k + 1) + ' 条之后插入');
  });
  function addEntry() { insertEntry(all.length, '添加到本组末尾'); }
  async function insertEntry(at, message) {
    var v = await FE.uiPrompt({ title: '添加条目', message: message + '（可多字符；颜文字这类请让 multiLine 保持开启）',
      placeholder: '如 （＾▽＾）', required: true });
    if (v == null) return;
    state.symbolSelEntry = { group: displayName, index: at };
    smutate(function () {
      var S = sp();
      if (!S.groups[gi]) return;
      if (!Array.isArray(S.groups[gi].symbols)) S.groups[gi].symbols = [];
      var idx = Math.max(0, Math.min(at, S.groups[gi].symbols.length));
      S.groups[gi].symbols.splice(idx, 0, String(v));
    });
  }

  ops.appendChild(editBtn);
  ops.appendChild(delBtn);
  ops.appendChild(insertBtn);
  ops.appendChild(selInfo);
  host.appendChild(ops);
  syncOps();
  return host;
}

/* 校验 + 概览：组数 / 条目数 / multiLine 语义 / 可读性警告 */
function renderSymStatus() {
  var host = $('sym-status');
  if (!host) return;
  var profile = sp();
  var v = FE.validateSymbolProfile(state.symbolKind, profile);
  var groups = profile.groups || [];
  var total = 0;
  groups.forEach(function (g) { total += (g.symbols || []).length; });
  clearEl(host);
  host.className = 'status';
  var parts = [];
  if (v.errors.length) parts.push(h('span', { class: 'st-error' }, '✗ ' + v.errors.length + ' 个错误'));
  if (v.warnings.length) parts.push(h('span', { class: 'st-warn' }, (parts.length ? ' ' : '') + '⚠ ' + v.warnings.length + ' 个提示'));
  if (!v.errors.length && !v.warnings.length) parts.push(h('span', { class: 'st-ok' }, '✓ 校验通过'));
  parts.push(' · ' + FE.symbolKindMeta(state.symbolKind).label + ' · ' + groups.length + ' 组 · ' + total + ' 条');
  parts.push(' · multiLine = ' + (profile.multiLine === true ? 'true（每行 1 格 · 高度自适应）' : 'false（每行 6 格 · 固定 40dp 高）'));
  host.appendChild(h('span', null, parts));
  if (state.symbolLegacy && state.symbolLegacy[state.symbolKind]) {
    host.appendChild(h('div', { class: 'st-warn' }, '⚠ 本文件是旧格式（顶层数组），加载时已按 multiLine=false 处理'));
  }
  var det = h('details', { class: 'meta-details' });
  det.appendChild(h('summary', null, '校验详情（' + v.errors.length + ' 错误 / ' + v.warnings.length + ' 提示）'));
  var list = h('ul', { class: 'meta-list' });
  v.errors.forEach(function (m) { list.appendChild(h('li', { class: 'st-error' }, m)); });
  v.warnings.forEach(function (m) { list.appendChild(h('li', { class: 'st-warn' }, m)); });
  if (!v.errors.length && !v.warnings.length) list.appendChild(h('li', { class: 'st-ok' }, '没有发现问题'));
  det.appendChild(list);
  host.appendChild(det);
}

/* JSON 卡：与弹出菜单页同款（聚焦中或已改动时不回写，避免打字被覆盖） */
function renderSymJson() {
  var ta = $('sym-json');
  if (!ta) return;
  if (document.activeElement === ta) return;
  if (symJsonDirty) return;
  ta.value = FE.serializeSymbolProfile(sp());
}

function symFormatIssues(issues) {
  return (issues || []).map(function (it) {
    return it.label + ' ×' + it.count;
  }).join('；');
}

/* ================================================================
 * 四、导入 / 导出
 * ================================================================ */
FE.loadSymbolProfileText = function (text, kind, fileName) {
  ensureSymbolState();
  var meta = FE.symbolKindMeta(kind == null ? state.symbolKind : kind);
  var raw;
  try { raw = JSON.parse(FE.sanitizeJsonText(text)); }
  catch (e) {
    setSymStatus('JSON 解析失败: ' + e.message, 'error');
    return false;
  }
  if (!Array.isArray(raw) && !FE.isPlainObject(raw)) {
    setSymStatus('顶层必须是对象 { multiLine, groups }（旧格式也可直接是数组）', 'error');
    return false;
  }
  if (FE.isPlainObject(raw) && raw.type != null) {
    /* 布局/弹出菜单文件常被误拖到这里：给出明确提示而不是默默归一化成空文档 */
    setSymStatus('这看起来是 ' + JSON.stringify(raw.type) + ' 文件，不是符号面板数据（符号文件顶层只有 multiLine / groups，没有 type）', 'error');
    return false;
  }
  var legacy = Array.isArray(raw);
  var profile = FE.normalizeSymbolProfile(meta.id, raw);
  state.symbolProfiles[meta.id] = profile;
  state.symbolLegacy[meta.id] = legacy;
  if (fileName) state.symbolFileNames[meta.id] = String(fileName);
  switchSymbolKind(meta.id);
  symJsonDirty = false;
  if (FE.afterChange) FE.afterChange();
  renderSymbolsTab();
  return true;
};

function symExport() {
  var meta = FE.symbolKindMeta(state.symbolKind);
  var text = FE.serializeSymbolProfile(sp());
  var name = symFileName();
  if (typeof Blob !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) return;
  var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  if (document.body && document.body.appendChild) document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    try { URL.revokeObjectURL(a.href); } catch (e) { /* 忽略 */ }
    if (a.remove) a.remove();
  }, 500);
  setSymStatus('已导出 ' + name + '（' + meta.label + '）。放到 ' +
    '<外部存储>/foxy/frontend/' + meta.dir + '/ 后，需在「设置 → 符号布局」里选中才生效。', 'ok');
}

/* ================================================================
 * 五、接线（所有容器都做存在性判断：DOM 桩未必全有）
 * ================================================================ */
function on(id, type, fn) {
  var el = $(id);
  if (el && el.addEventListener) el.addEventListener(type, fn);
  return el;
}

function initSymbolsTab() {
  if (symInited) return;                                    /* 幂等：接线方重复调用无害 */
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  var host = $('sym-list');
  if (!host) return;                                        /* 骨架未提供符号页 → 不接线 */
  symInited = true;
  ensureSymbolState();
  sp();

  /* 类别切换：按 kind 存/取状态 */
  on('sym-kind', 'change', function () {
    switchSymbolKind(this.value);
    /* 样例下拉跟着切：它每一项都是「某类别的内置样例」，类别换了却停在旧选项的话，
     * 点「载入」会把旧类别的样例装进当前类别（实测抓出来的）。 */
    if (ex) ex.value = state.symbolKind;
    renderSymbolsTab();
    setSymStatus('已切换到 ' + FE.symbolKindMeta(state.symbolKind).label + '。', '');
  });

  /* multiLine 开关（§2.5）：改完立刻重渲染 —— 预览格数随之切换 */
  on('sym-multiline', 'change', function () {
    var want = this.checked;
    smutate(function () { sp().multiLine = !!want; });
  });

  /* 导入：单文件 JSON */
  on('sym-import', 'click', function () {
    var f = $('sym-import-file');
    if (f && f.click) f.click();
  });
  on('sym-import-file', 'change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (FE.loadSymbolProfileText(String(reader.result), state.symbolKind, file.name)) {
        setSymStatus('已导入 ' + file.name + '（' + FE.symbolKindMeta(state.symbolKind).label + '）', 'ok');
      }
    };
    reader.readAsText(file, 'utf-8');
  });

  /* 导出：文件名按类别默认（symbols.json / emoji.json / kaomoji.json） */
  on('sym-export', 'click', function () { symExport(); });

  /* 示例入口：**优先用 examples/ 里的真实符号文件**（由 build-examples.js 打进
   * FE.SYMBOL_EXAMPLE_FILES），没有才回退到内置极小样例。
   *
   * 历史：早先只给内置样例，因为 D8 认为符号文件不能入 examples/ ——
   * 那个判断的**真实原因**是打包器的类型判定认不出 {multiLine,groups}
   * （会抛「无法判断示例类型」），并不是格式本身不该入库。现已给打包器
   * 补上 symbol 分支，所以这三份真实文件（用户提供）能作为预置示例使用。
   * 内置样例仍保留为兜底：单文件载入失败时界面不至于没有可用的示例。
   *
   * ⚠️ option 的 value 保持**类别 id**（symbols/emoji/kaomoji），不是文件名：
   * 文件名是给人看的标签，类别才是程序的键 —— 也避免改名就断掉既有调用方
   * （测试里就是按 `symEx.value = 'symbols'` 选类别的）。 */
  var ex = $('sym-example');
  function symExampleFile(kind) {
    var map = FE.SYMBOL_EXAMPLE_FILES;
    if (!FE.isPlainObject(map)) return null;
    var bucket = map[kind];
    if (!FE.isPlainObject(bucket)) return null;
    var names = Object.keys(bucket);
    return names.length ? names[0] : null;
  }
  function symExampleOptionLabel(kind, meta) {
    var fn = symExampleFile(kind);
    if (!fn) return '内置样例：' + meta.label;
    var p = null;
    try { p = FE.normalizeSymbolProfile(kind, JSON.parse(FE.SYMBOL_EXAMPLE_FILES[kind][fn])); }
    catch (e) { p = null; }
    var n = p ? p.groups.length : 0;
    var cnt = p ? p.groups.reduce(function (a, g) { return a + g.symbols.length; }, 0) : 0;
    return '示例：' + fn + '（' + n + ' 组 · ' + cnt + ' 条）';
  }
  function renderSymExampleOptions() {
    if (!ex) return;
    clearEl(ex);
    FE.SYMBOL_KINDS.forEach(function (m) {
      ex.appendChild(h('option', { value: m.id }, symExampleOptionLabel(m.id, m)));
    });
    ex.value = state.symbolKind;
  }
  renderSymExampleOptions();
  on('sym-load-example', 'click', function () {
    var kind = ex && ex.value ? ex.value : state.symbolKind;
    var meta = FE.symbolKindMeta(kind);
    var fn = symExampleFile(meta.id);
    var prof = null;
    var srcNote = '';
    if (fn) {
      try {
        prof = FE.normalizeSymbolProfile(meta.id, JSON.parse(FE.SYMBOL_EXAMPLE_FILES[meta.id][fn]));
        srcNote = '示例文件 ' + fn;
      } catch (e) { prof = null; }
    }
    if (!prof) {
      var sample = FE.SYMBOL_SAMPLES[meta.id];
      if (!sample) { FE.uiAlert('没有该类别的示例'); return; }
      prof = FE.normalizeSymbolProfile(kind, sample);
      srcNote = '内置样例（该类别没有示例文件）';
    }
    state.symbolProfiles[meta.id] = prof;
    switchSymbolKind(kind);
    if (ex) ex.value = state.symbolKind;
    symJsonDirty = false;
    if (FE.afterChange) FE.afterChange();
    renderSymbolsTab();
    setSymStatus('已载入 ' + srcNote + '（' + meta.label + '，' + prof.groups.length + ' 组）。' +
      '导出时会写成 ' + symFileName() + '。', 'ok');
  });

  /* 搜索：与另外三张列表共用 FE.wireSearch（即时过滤 + 按钮兜底 + ✕ 清空） */
  if (FE.wireSearch) FE.wireSearch('sym-filter', 'sym-search', renderSymGroupList, 'sym-filter-clear');

  /* 新建分组：输入框 + 按钮（同 app.js 的 wireAdd 语义：回车/点击、新建后展开并滚过去） */
  var newInp = $('sym-new'), addBtn = $('sym-add');
  function doAddGroup() {
    if (!newInp) return;
    var name = String(newInp.value || '').trim();
    if (!name) { FE.uiAlert('请输入分组名（作为 zh 组名）'); if (newInp.focus) newInp.focus(); return; }
    var openSet = FE.ensureOpenSet ? FE.ensureOpenSet('openSymbolGroups') : {};
    var target = '';
    smutate(function () {
      var S = sp();
      S.groups.push({ names: { zh: name }, symbols: [] });
      target = symGroupDisplayNames(S.groups)[S.groups.length - 1];
      openSet[target] = true;      /* 新建后默认展开，方便立刻加条目 */
    });
    newInp.value = '';
    if (target && FE.scrollToDefItem) FE.scrollToDefItem(target, 'sym-list');
  }
  if (addBtn) addBtn.addEventListener('click', function (e) { if (FE.stopEv) FE.stopEv(e); doAddGroup(); });
  if (newInp) newInp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { if (FE.stopEv) FE.stopEv(e); doAddGroup(); }
  });

  /* JSON 卡：实时同步 + 应用 + 格式化并修复 */
  var ta = $('sym-json');
  if (ta) ta.addEventListener('input', function () { symJsonDirty = true; });
  on('sym-json-apply', 'click', function () {
    if (!ta) return;
    var rep = FE.inspectJsonText ? FE.inspectJsonText(ta.value) : { total: 0, issues: [] };
    if (FE.loadSymbolProfileText(ta.value, state.symbolKind)) {
      symJsonDirty = false;
      setSymJsonStatus(rep.total
        ? '✓ 已应用（自动修复 ' + rep.total + ' 处问题：' + symFormatIssues(rep.issues) + '）'
        : '✓ 已应用', rep.total ? 'warn' : 'ok');
    } else {
      setSymJsonStatus('✗ 未应用（原文保留）。错误: ' + (FE.state.lastParseError || ''), 'error');
    }
  });
  on('sym-json-format', 'click', function () {
    if (!ta) return;
    var rep = FE.inspectJsonText ? FE.inspectJsonText(ta.value) : null;
    if (!rep || !rep.parseOk) {
      setSymJsonStatus('JSON 无效: ' + ((rep && rep.parseError) || '') +
        (rep && rep.total ? '（检测到 ' + rep.total + ' 处可修复问题）' : ''), 'error');
      return;
    }
    ta.value = JSON.stringify(JSON.parse(rep.fixedText), null, 2);
    symJsonDirty = true;
    setSymJsonStatus(rep.total ? '已格式化并修复 ' + rep.total + ' 处问题（尚未应用）' : '已格式化（尚未应用）', 'ok');
  });

  renderSymbolsTab();
}
FE.initSymbolsTab = initSymbolsTab;
FE.renderSymbolsTab = renderSymbolsTab;

/* 自举：骨架齐备时自动接线（与 popup-editor.js 的 initPopupTab() 同理）。
 * 未齐备则静默跳过，接线方可稍后显式调用 FE.initSymbolsTab()。 */
initSymbolsTab();
})();
