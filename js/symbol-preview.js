/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * symbol-preview.js — 符号面板预览（对照 App 端 `ly` 视图）
 *
 * 存在理由：符号 / emoji / 颜文字 三类 catalog 在 App 里**不是弹层**，
 * 而是一块**整屏替换键盘**的横排面板。编辑符号时看不到它长什么样，
 * 很难判断格子密度、分组名长度、multiLine 是否合适 —— 所以切到「符号面板」
 * 页签时，把预览区从键盘换成这个面板：
 *
 *   切换由 app.js 的 renderPreview() 决定（见 FE.symbolPreviewOn）；
 *   本模块只负责「把面板画进给定容器」。
 *
 * ⚠️ 全部规格来自 App 反编译逐行核对，权威依据见
 *   `foxy/foxy-render-spec.md` §8（`ly.java` / `cu.java` / `cv.java`）。
 *   改这里的几何或配色**必须先看那份规范**，别凭感觉调。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});
if (FE.renderSymbolPreview) return;

var h = function () { return FE.h.apply(null, arguments); };
var clearEl = function (el) { FE.clearEl(el); };

/* ================================================================
 * 一、几何换算
 * ================================================================ */

/* App 的 dp → 预览 px。
 *
 * 键盘预览里 `unit = portraitW / 10`，即"10 个键宽单位铺满屏宽"，
 * 相当于真实手机的 360dp 宽屏（10 × 36dp）。所以：
 *     1dp ≈ portraitW / 360 px = unit / 36
 * 用这个比例把规范 §8 表里的 dp 值换成预览像素，面板才会与键盘同一尺度。
 * （别用固定 px：预览宽度随窗口变，写死会让面板与键盘比例失调。） */
FE.symbolPreviewDp = function (dp, unit) {
  var u = (typeof unit === 'number' && unit > 0) ? unit : 36;
  return Math.round(dp * (u / 36) * 100) / 100;
};

/* 规范 §8 的固定规格（dp）——集中一处，便于对照规范核对 */
FE.SYMBOL_PREVIEW_SPEC = {
  panelLeftColDp: 84,        /* ly.java:148 b(84) */
  groupItemHeightDp: 40,     /* ly.java:207 this.g */
  groupItemFontSp: 13,       /* ly.java:285 */
  groupItemPadX: 4, groupItemPadY: 2,   /* ly.java:288 b(4),b(2),b(4),b(2) */
  groupItemMarginDp: 2,      /* ly.java:141/145 b(2) */
  cellHeightDp: 40,          /* ly.java:207/46 this.g */
  cellFontSp: 22,            /* ly.java:204 */
  cellMarginDp: 2,           /* ly.java:216-217 */
  cellRowGapDp: 4,           /* ly.java:198 bottomMargin b(4) */
  cellCornerDp: 6,           /* ly.java:335 this.i=6 */
  cellStrokeDp: 1,           /* ly.java:333 b(1) */
  columnsPerRow: 6,          /* ly.java:45 this.f=6 */
  columnsPerRowMultiLine: 1, /* ly.java:423 z ? 1 : 6 */
  hotkeyFontSp: 20,          /* ly.java:162 */
  leftColPadLeftDp: 2, leftColPadRightDp: 4,  /* ly.java:65 */
  cellsLeftMarginDp: 4       /* ly.java:152 */
};

/* ================================================================
 * 二、配色（全部走 color-source.js，与键盘预览同一套解析入口）
 * ================================================================ */

/* 解析一个主题字段 → CSS 色串；取不到 → null（调用方跳过写样式，走 CSS 兜底）。
 * ⭐ 传 includeBuiltin:true —— **未导入主题时按 App 内置默认主题取色**（用户要求：
 * 预览默认用 App 内置默认主题的深浅色，而不是编辑器自己那套预置色）。
 * App 端符号面板的取色本就来自当前主题（缺省即内置默认，xw0.java:158-160/189-191）。 */
function themeCss(field) {
  if (!FE.resolveThemeField) return null;
  var r = FE.resolveThemeField(field, { includeBuiltin: true });
  return (r && r.value) ? FE.colorToCss(r.value) : null;
}

/* 面板底：`m00.f()` = key_border_enabled ? altKeyboardColor : keyboardColor（ly.java:62）。
 * 与键盘容器底同一条规则 —— 复用 FE.resolveKeyboardColor 而不是自己判。 */
function panelBgCss() {
  if (FE.resolveKeyboardColor) {
    var r = FE.resolveKeyboardColor(FE.state && FE.state.keyBorderEnabled, { includeBuiltin: true });
    return (r && r.value) ? FE.colorToCss(r.value) : null;
  }
  return themeCss('keyboardColor');
}

/* 键边框开关：规范 §2.4 —— B 为真且 C 为真才画描边（ly.java:332-334）。
 * 编辑器没有 C(描边) 的 UI，取 App 默认值 false（xw0.java:56），
 * 所以**默认不画描边**；B 为假时同样不画。 */
function cellStrokeEnabled() {
  var st = FE.state || {};
  return st.keyStrokeEnabled === true;
}

/* ================================================================
 * 三、数据准备
 * ================================================================ */

/* 当前类别的 catalog：`{multiLine, groups}`。
 * 事实来源是 symbol-editor.js 的 `symbolProfiles[kind]`（复数槽）；
 * 它还没初始化时回退到空的 categories 结构，绝不抛。 */
FE.symbolPreviewData = function () {
  var st = FE.state || {};
  var kind = st.symbolKind || 'symbols';
  var profs = st.symbolProfiles;
  var p = (profs && FE.isPlainObject(profs[kind])) ? profs[kind] : null;
  if (!p && FE.isPlainObject(st.symbolProfile)) p = st.symbolProfile;
  var groups = (p && Array.isArray(p.groups)) ? p.groups : [];
  return { kind: kind, multiLine: !!(p && p.multiLine === true), groups: groups };
};

/* 面板要显示的分组列表。
 *
 * ⚠️ App 端会在最前面插一个「最近」组（ly.java:228-257，数据来自
 * SharedPreferences `recent_<ns>`）。**编辑器不显示它** —— 编辑器没有
 * "最近使用"运行时状态，凭空造一个只会误导用户以为文件里有这组。
 * 这里刻意不加，并在界面上说明。 */
FE.symbolPreviewGroups = function (data) {
  var lang = null;   /* null = 用 App 的默认回退链（FE.symbolGroupLabel 内部处理） */
  return (data.groups || []).map(function (g, i) {
    var name = FE.symbolGroupLabel ? (FE.symbolGroupLabel(g, lang) || '') : '';
    return {
      index: i,
      name: name,
      count: (g && Array.isArray(g.symbols)) ? g.symbols.length : 0,
      symbols: (g && Array.isArray(g.symbols)) ? g.symbols : []
    };
  });
};

/* ================================================================
 * 四、渲染
 * ================================================================ */

/* 面板要占的盒子尺寸（**与布局预览严格相同**，这是用户明确要求的）。
 *
 * 布局预览的 .kb 是 `max-width: 614px` + `padding: 8px`，高度 = 布局单位数 × unit × HK。
 * 符号面板必须落在**同一个盒子**里，否则两边一切切换预览就"跳大小"，
 * 而用户看符号面板时正是想判断"它在真机上会不会挤"。
 *
 * ⚠️ `opts.units` 缺失或为 0（如 profile 里没有布局、或布局没有区段）时**不能**
 * 让高度退化成 `100%` —— `.kb` 自身没有高度，`height:100%` 会解析成 auto，
 * 面板于是塌成"内容高度"：分组一多就被撑得老高、分组一少就扁成一条，
 * 与"尺寸固定 = 布局预览尺寸"的要求正好相反（踩过）。这里回落到**默认布局高度
 * 5 单位**（与 `FE.gridMetrics` 的默认 totalUnits 同口径），保证盒子始终确定。 */
FE.SYMBOL_PREVIEW_FALLBACK_UNITS = 5;
FE.symbolPreviewBox = function (unit, opts) {
  opts = opts || {};
  var u = (typeof unit === 'number' && unit > 0) ? unit : 36;
  var HK = (typeof opts.heightK === 'number' && opts.heightK > 0) ? opts.heightK : 1;
  var W = (typeof opts.width === 'number' && opts.width > 0) ? opts.width : null;
  var units = (typeof opts.units === 'number' && opts.units > 0)
    ? opts.units : FE.SYMBOL_PREVIEW_FALLBACK_UNITS;
  return { width: W, height: Math.max(24, units * u * HK) };
};

/* 把符号面板画进 host。
 * opts.unit 由 app.js 传入（= portraitW/10），保证与键盘同尺度。
 * opts.width / opts.units / opts.heightK 由 app.js 传入，用于把面板钉成
 * **与布局预览完全相同的尺寸**（见 FE.symbolPreviewBox）。
 *
 * 返回 { groups, selected, cells, multiLine, columns, notes }；
 *   · notes 是**说明文字的数组** —— 刻意**不**画进 host：
 *     用户要求这些说明移出键盘预览区（那里只该有"手机的样貌"），
 *     所以交回给 app.js 放进状态行。
 * 画不出时返回 null。 */
FE.renderSymbolPreview = function (host, opts) {
  if (!host) return null;
  opts = opts || {};
  var unit = (typeof opts.unit === 'number' && opts.unit > 0) ? opts.unit : null;
  if (!unit) {
    var rawW = host.clientWidth;
    /* DOM 桩 clientWidth 恒 0 → 回退 380（与 renderPreview 同口径），
     * 保证测试里几何可算、不断言到 NaN。 */
    unit = (rawW || 380) / 10;
  }
  clearEl(host);

  var data = FE.symbolPreviewData();
  if (!data.groups.length) {
    host.appendChild(h('div', { class: 'kb-empty' },
      '当前类别「' + (FE.symbolKindMeta ? FE.symbolKindMeta(data.kind).label : data.kind) +
      '」还没有分组。',
      h('div', { class: 'status' },
        '在下方「符号面板」页新建分组，或点「载入示例」用内置符号文件后回来查看预览。')));
    return null;
  }

  var groups = FE.symbolPreviewGroups(data);
  var multi = data.multiLine;
  var spec = FE.SYMBOL_PREVIEW_SPEC;
  var notes = [];

  /* 选中分组：沿用 symbol-editor 的选中态（点预览里的分组也能切） */
  var sel = parseInt(FE.state && FE.state.symbolPreviewGroup, 10);
  if (!(sel >= 0 && sel < groups.length)) sel = 0;

  /* ---- 配色（未导入主题 → 全 null，走 CSS 兜底） ---- */
  var bgPanel = panelBgCss();
  var bgCell = themeCss('keyBackgroundColor');
  var fgCell = themeCss('candidateTextColor');
  var bgCellSel = themeCss('candidateHighlightColor');
  var fgGroup = themeCss('keyHintTextColor');
  var fgGroupSel = themeCss('toolTextColor');
  var strokeCss = cellStrokeEnabled() ? themeCss('keyBorderColor') : null;

  /* ---- 盒子：与布局预览同尺寸（用户要求） ---- */
  var box = FE.symbolPreviewBox(unit, opts);

  /* ---- 面板容器：横排（ly.java:61 setOrientation(0)） ---- */
  var panel = h('div', { class: 'sym-pv' });
  panel.style.display = 'flex';
  panel.style.flexDirection = 'row';
  panel.style.width = box.width ? (box.width + 'px') : '100%';
  panel.style.height = box.height ? (box.height + 'px') : '100%';
  panel.style.boxSizing = 'border-box';
  panel.style.borderRadius = FE.symbolPreviewDp(6, unit) + 'px';
  /* ⚠️ overflow hidden 是关键：面板高度被**钉死**，内部两列各自滚动，
   * 绝不因为分组/条目多而把键盘预览撑高（用户明确要求，也对齐 App 的
   * 两个 ScrollView 行为 —— ly.java:66-71 与 149-153）。 */
  panel.style.overflow = 'hidden';
  if (bgPanel) panel.style.background = bgPanel;

  /* ---- 左列：分组列表 + 底部两个热键（宽 84dp） ---- */
  var leftCol = h('div', { class: 'sym-pv-left' });
  leftCol.style.width = FE.symbolPreviewDp(spec.panelLeftColDp, unit) + 'px';
  leftCol.style.flex = '0 0 auto';
  leftCol.style.display = 'flex';
  leftCol.style.flexDirection = 'column';
  leftCol.style.paddingLeft = FE.symbolPreviewDp(spec.leftColPadLeftDp, unit) + 'px';
  leftCol.style.paddingRight = FE.symbolPreviewDp(spec.leftColPadRightDp, unit) + 'px';
  leftCol.style.boxSizing = 'border-box';

  var listBox = h('div', { class: 'sym-pv-groups' });
  listBox.style.flex = '1 1 auto';
  listBox.style.overflowY = 'auto';
  listBox.style.marginTop = FE.symbolPreviewDp(4, unit) + 'px';
  var gH = FE.symbolPreviewDp(spec.groupItemHeightDp, unit);
  var gGap = FE.symbolPreviewDp(spec.groupItemMarginDp, unit);
  var groupEls = [];
  groups.forEach(function (g) {
    var on = g.index === sel;
    var el = h('div', {
      class: 'sym-pv-group' + (on ? ' sym-pv-group-sel' : ''),
      title: g.name + '（' + g.count + ' 条）',
      'data-group-index': String(g.index)
    }, g.name || '（未命名）');
    el.style.height = gH + 'px';
    el.style.lineHeight = gH + 'px';
    el.style.fontSize = FE.symbolPreviewDp(spec.groupItemFontSp, unit) + 'px';
    el.style.padding = FE.symbolPreviewDp(spec.groupItemPadY, unit) + 'px ' +
      FE.symbolPreviewDp(spec.groupItemPadX, unit) + 'px';
    el.style.marginBottom = gGap + 'px';
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'hidden';
    el.style.whiteSpace = 'nowrap';
    el.style.textOverflow = 'ellipsis';
    el.style.textAlign = 'center';
    el.style.cursor = 'pointer';
    /* 未选中：字 keyHintTextColor、底**透明**（ly.java:320-321）
     * 已选中：字 toolTextColor、底 candidateHighlightColor */
    if (on && fgGroupSel) el.style.color = fgGroupSel;
    else if (!on && fgGroup) el.style.color = fgGroup;
    if (on && bgCellSel) el.style.background = bgCellSel;
    el.addEventListener('click', function () {
      if (FE.state) FE.state.symbolPreviewGroup = g.index;
      if (FE.renderPreviewOnly) FE.renderPreviewOnly();
      else FE.renderAll && FE.renderAll();
    });
    groupEls.push(el);
    listBox.appendChild(el);
  });
  leftCol.appendChild(listBox);

  /* 底部「⌨」「⌫」：高 40dp、各占 1/2 宽、字号 20sp（ly.java:139-147,159-171）。
   * App 里 ⌨ = 返回键盘、⌫ = 删除；预览里只画出来（编辑器不执行上屏）。
   *
   * ⭐ **底色/圆角/描边与右侧符号格子完全同款** —— 这是必须还原的：
   * 创建它们的 `a()`（ly.java:159-171，`f(z9Var)` 在 :167）与创建格子那段
   * （ly.java:202-218，`f(z9Var)` 在 :209）调的是**同一个 `f()`**
   * （ly.java:326-341）：
   *     gradientDrawable.setColor(this.a.j)          // 底 = keyBackgroundColor
   *     if (B && C) setStroke(b(1), this.a.l)        // 描边仅当两个开关同时开
   *     setCornerRadius(clamp(6dp, 0, min(w,h)/2))   // 圆角 6dp 且夹到短边一半
   * 字色也同一个：`this.a.n`（candidateTextColor，:166 与 :208）。
   * 早先这里**只给了字色、漏了底色**，于是两个热键看起来像浮在面板上的纯文字，
   * 而手机上它们是和右边一样的圆角色块（用户指出的正是这一点）。 */
  var hotkeys = h('div', { class: 'sym-pv-hotkeys' });
  hotkeys.style.display = 'flex';
  hotkeys.style.flex = '0 0 auto';
  hotkeys.style.marginBottom = gGap + 'px';
  /* 与格子同源：高 40dp、圆角 6dp（clamp 到短边一半）、描边条件一致 */
  var hkH = FE.symbolPreviewDp(spec.cellHeightDp, unit);
  var hkRadius = Math.min(FE.symbolPreviewDp(spec.cellCornerDp, unit), hkH / 2);
  var hkStroke = FE.symbolPreviewDp(spec.cellStrokeDp, unit);
  ['⌨', '⌫'].forEach(function (glyph, gi) {
    var b = h('div', {
      class: 'sym-pv-hotkey', title: gi === 0 ? '返回键盘（App 端）' : '删除（App 端）'
    }, glyph);
    b.style.flex = '1 1 0';
    b.style.height = hkH + 'px';
    b.style.lineHeight = hkH + 'px';
    b.style.textAlign = 'center';
    b.style.fontSize = FE.symbolPreviewDp(spec.hotkeyFontSp, unit) + 'px';
    b.style.marginLeft = gi === 0 ? '0' : gGap + 'px';
    b.style.boxSizing = 'border-box';
    b.style.borderRadius = hkRadius + 'px';
    /* 底色：keyBackgroundColor（与格子同一个 bgCell，不再只给字色） */
    if (bgCell) b.style.background = bgCell;
    /* 字色：candidateTextColor（与格子同一个 fgCell） */
    if (fgCell) b.style.color = fgCell;
    /* 描边：与格子同条件 —— B(键边框) 与 C(描边) 同时开启才画（ly.java:332-334） */
    if (strokeCss) b.style.border = hkStroke + 'px solid ' + strokeCss;
    hotkeys.appendChild(b);
  });
  leftCol.appendChild(hotkeys);
  panel.appendChild(leftCol);

  /* ---- 左列的滚动容器尺寸约束 ----
   * 左列是 flex 纵向布局：分组列表 flex:1 滚动、底部热键固定。
   * 必须给列表 minHeight:0，否则 flex 子项的 min-height:auto 会让它按内容撑高、
   * 把整个面板顶出盒子（滚动失效）。这是 CSS flex 滚动的经典坑。 */
  listBox.style.minHeight = '0';

  /* ---- 右列：符号格子区（ScrollView，左边距 4dp） ----
   * ⚠️ 右列**自己滚动**（`overflow-y: auto`），高度受左列/面板约束 ——
   * 不再用固定 maxHeight 180dp、更不靠"把面板拉高"来显示全部条目：
   * App 端符号区就是一个 ScrollView（ly.java:149-153），条目多时滚动而不是撑高。
   * 这是用户明确要求的（"不要强制拉长预览高度，分组和符号区分别可滚动"）。 */
  var rightCol = h('div', { class: 'sym-pv-cells-wrap' });
  rightCol.style.flex = '1 1 auto';
  rightCol.style.minWidth = '0';
  rightCol.style.minHeight = '0';     /* flex 子项默认 min-height:auto 会撑着不滚 */
  rightCol.style.marginLeft = FE.symbolPreviewDp(spec.cellsLeftMarginDp, unit) + 'px';
  rightCol.style.overflowY = 'auto';
  rightCol.style.overflowX = 'hidden';

  var grid = h('div', { class: 'sym-pv-cells' + (multi ? ' sym-pv-multiline' : '') });
  grid.style.display = 'grid';
  /* 每行 6 格 / multiLine 时每行 1 格（cu.java:85、ly.java:423） */
  var cols = multi ? spec.columnsPerRowMultiLine : spec.columnsPerRow;
  grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
  grid.style.gap = FE.symbolPreviewDp(spec.cellRowGapDp, unit) + 'px';

  var cH = FE.symbolPreviewDp(spec.cellHeightDp, unit);
  var cGap = FE.symbolPreviewDp(spec.cellMarginDp, unit);
  var cRadius = FE.symbolPreviewDp(spec.cellCornerDp, unit);
  var cur = groups[sel];
  var cellEls = [];
  (cur.symbols || []).forEach(function (sym) {
    var cell = h('div', {
      class: 'sym-pv-cell',
      title: multi ? sym : (sym + '（格高固定 40dp，超出会被裁切）')
    }, sym === '' ? '（空）' : sym);
    /* multiLine=true → 行高自适应（WRAP_CONTENT）；false → 固定 40dp 且会裁切 */
    if (multi) {
      cell.style.minHeight = cH + 'px';
      cell.style.whiteSpace = 'pre-wrap';
      cell.style.wordBreak = 'break-all';
      cell.style.padding = cGap + 'px';
      cell.style.lineHeight = '1.3';
    } else {
      cell.style.height = cH + 'px';
      cell.style.lineHeight = cH + 'px';
      cell.style.padding = '0 ' + cGap + 'px';
      cell.style.whiteSpace = 'nowrap';
      cell.style.overflow = 'hidden';
      cell.style.textOverflow = 'ellipsis';
    }
    cell.style.boxSizing = 'border-box';
    cell.style.marginLeft = cGap + 'px';
    cell.style.marginRight = cGap + 'px';
    cell.style.fontSize = FE.symbolPreviewDp(spec.cellFontSp, unit) + 'px';
    cell.style.textAlign = 'center';
    /* 圆角 6dp 且 clamp 到「短边一半」（ly.java:335-340）。
     * 预览不预先知道实际尺寸，用行高/字号估一个下界近似即可 —— 规范里
     * clamp 的意义是"小格别圆成胶囊"，这里按固定高度算一半已达成同样效果。 */
    cell.style.borderRadius = Math.min(cRadius, cH / 2) + 'px';
    if (bgCell) cell.style.background = bgCell;
    if (fgCell) cell.style.color = fgCell;
    /* 描边：仅当 B(键边框) 与 C(描边) 同时开启（ly.java:332-334） */
    if (strokeCss) {
      cell.style.border = FE.symbolPreviewDp(spec.cellStrokeDp, unit) + 'px solid ' + strokeCss;
    }
    cellEls.push(cell);
    grid.appendChild(cell);
  });
  rightCol.appendChild(grid);
  panel.appendChild(rightCol);

  /* ---- 挂上去 ---- */
  host.appendChild(panel);

  /* ---- 说明文字**不画进 host** ----
   * host 就是键盘预览区（#preview-kb），那里只该有"手机的样貌"：
   * 一堆说明文字挤在面板里，既挡住了用户想看的观感，也让"面板尺寸 = 布局预览尺寸"
   * 这件事失效（文字会把盒子撑高）。所以这里只**组装**文字并随返回值交出去，
   * 由 app.js 放进预览面板的**状态行**（键盘区外面）。 */
  notes.push(h('div', null, '符号面板预览 · ',
    h('code', null, FE.symbolKindMeta ? FE.symbolKindMeta(data.kind).label : data.kind),
    ' · 分组 ' + groups.length + ' 个 · 当前「' + (cur.name || '（未命名）') + '」' +
    cur.count + ' 条 · 每行 ' + cols + ' 格（' +
    (multi ? 'multiLine=true → 1 格/行、高自适应' : 'multiLine=false → 6 格/行、格高固定 40dp') + '）'));
  notes.push(h('div', null,
    '左列 ' + spec.panelLeftColDp + 'dp 为分组列表与 ⌨/⌫；格子字号 ' + spec.cellFontSp +
    'sp、圆角 ' + spec.cellCornerDp + 'dp；面板底与键盘底同色（key_border_enabled 联动）。' +
    '面板尺寸与布局预览一致，分组区与符号区各自滚动（对齐 App 的两个 ScrollView）。' +
    '⚠️ App 会在最前面插入运行时生成的「最近」分组，编辑器没有该状态，故预览不显示。'));

  return {
    groups: groups, selected: sel, cells: cellEls,
    multiLine: multi, columns: cols,
    kind: data.kind, notes: notes
  };
};

})();
