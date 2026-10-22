/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * toolbar-preview.js — 键盘上方工具栏预览（键面上方那一行 chip）
 *
 * 目标：主题作者导入一套工具栏图标（19 个 svg 那种）后，能在网页里看到：
 *   - 工具栏**长什么样**（尺寸/圆角/间距/底色/文字色，全部按 App 的 os/w20/mf 常量）；
 *   - 图标**成对状态**（未激活用 icon，激活用 activeIcon + accentColor）；
 *   - 哪些图标自带实色（原样渲染）、哪些是单色可染色（跟随 toolTextColor/accentColor）。
 *
 * ⚠️ 按钮列表（用户口径）：**main + expanded 合成一条完整列表，全部一次画出来**，
 *    不再有「展开态 / 收起态」两种状态、也不再有行尾那枚展开按钮。内容比键盘宽时
 *    由 .kbt-track 横向滚动（拖动 / 滚轮 / 触摸）去看后面的图标。
 *
 * 权威依据（foxy_re 反编译）：
 *   - 容器底色 os.java:76 setBackgroundColor(a.e())；e() = key_border_enabled ? altKeyboardColor : candidateBarColor
 *   - chip 默认底 a.p = candidateBackgroundColor、按下 a.q = candidatePressedColor（os.java:e()）
 *   - 未激活色 a.w = toolTextColor、激活色 a.D = accentColor、返回 chip 字色 a.n = candidateTextColor
 *   - 尺寸常量 mf.java：行高 40dp、字号 18sp、内边距 10dp×2dp、chip 间距 3dp、圆角 12dp
 *   - 上色规则 hk0.w(String)：图标里出现任意具名色/hex/rgb() 就不染色（自带实色），否则套 colorFilter
 *   - 按钮表 at0.X(boolean)：schema/deploy/settings/clipboard/voice/hide_keyboard/keyboard_tools/
 *     rime_switches/theme/size/one_hand/split_keyboard；中文名见 values-zh-rCN/strings.xml:508-518
 *   - 默认两态列表 vj0.k：main 7 项 / expanded 4 项
 *
 * ⚠️ 本模块只影响**预览**：不改主题 JSON、不改布局 JSON（与「按键边框/描边」开关同一策略）。
 * ⚠️ 图标匹配**必须按文件名精确查表**：主题包里「分体 / 分体激活」两个文件颜色完全一样、
 *    只差路径细节，任何模糊匹配都会把两态混成一个。
 */
(function () {
  'use strict';
  var FE = (window.FE = window.FE || {});
  if (FE.renderPreviewToolbar) return;

  /* ---------------- 按钮表（App 内置 11 个 + 只有文字的几个） ---------------- */
  FE.TOOLBAR_BUTTONS = {
    schema: { label: '方案' },
    deploy: { label: '部署' },
    settings: { label: '设置' },
    clipboard: { label: '剪贴板' },
    voice: { label: '语音' },
    hide_keyboard: { label: '收起键盘' },
    keyboard_tools: { label: '键盘工具' },
    rime_switches: { label: '输入法开关' },
    theme: { label: '主题' },
    size: { label: '尺寸' },
    one_hand: { label: '单手' },
    split_keyboard: { label: '分体键盘' }
  };

  /* 默认两态列表（vj0.java:300-301 的 k(Context)）。
   * 注意 main 里没有「收起」（expanded 只有 4 项是 App 默认）。
   * 这里在 expanded 末尾追加 voice：App 的默认展开组不含它，但用户在 vj0 的
   * toolbar.json 里可以自行添加；网页预览按用户口径把「语音」也放进展开组，
   * 这样才能看到主题包里的「语音/语音激活2」这对图标。 */
  FE.TOOLBAR_DEFAULT = {
    main: ['schema', 'deploy', 'settings', 'clipboard', 'keyboard_tools', 'rime_switches', 'hide_keyboard'],
    expanded: ['theme', 'size', 'one_hand', 'split_keyboard', 'voice']
  };

  /* 文件名（去掉扩展名）→ 按钮 id。**精确表，不做模糊匹配**。
   * 这是主题作者给 svg 起的中文名（水彩包 19 个 / 蓝狐狸包 15 个的并集）。 */
  FE.TOOLBAR_ICON_NAMES = {
    '方案': 'schema',
    '部署': 'deploy',
    '设置': 'settings',
    '剪切板': 'clipboard',
    '剪贴板': 'clipboard',
    '语音': 'voice',
    '语音激活2': 'voice',
    '收起': 'hide_keyboard',
    '键盘工具': 'keyboard_tools',
    '开关': 'rime_switches',
    '主题': 'theme',
    '主题2': 'theme',
    '尺寸': 'size',
    '单手': 'one_hand',
    '分体': 'split_keyboard'
  };

  /* 主题图标别名回落：主题包只给了「主题2.svg」（映射成 theme），没给「键盘工具」。
   * 而 App 里 keyboard_tools 复用的就是 ic_tool_theme（r71.java:645-648）、
   * 显示名取 R.string.tool_theme —— 两者实机是同一枚图标。
   * 所以主题包没给 keyboard_tools 自己的图标时，借 theme 那份，
   * 否则收起态露内置矢量、展开态露主题图标，同一枚按钮两副面孔。 */
  FE.TOOLBAR_ICON_ALIAS = { keyboard_tools: 'theme' };

  /* 文件名 → { id, active }。规则：
   *   1. 去掉扩展名、去首尾空白；
   *   2. 以「激活」结尾（或等于「语音激活2」这类）→ active = true，剩下的名字再查表；
   *   3. 查不到的返回 null（调用方据此提示「不会出现在内置工具栏上」）。 */
  FE.toolbarIconMatch = function (fileName) {
    var s = String(fileName == null ? '' : fileName).trim();
    if (!s) return null;
    s = s.replace(/\.[^./\\]+$/, '').trim();
    var active = false;
    if (/激活2?$/.test(s)) {
      active = true;
      s = s.replace(/激活2?$/, '').trim();
      if (!s) s = '语音';   /* 「语音激活2」剥完是「语音」；只剩「激活」时也无从判断，交给查表失败 */
    }
    if (!Object.prototype.hasOwnProperty.call(FE.TOOLBAR_ICON_NAMES, s)) return null;
    return { id: FE.TOOLBAR_ICON_NAMES[s], active: active };
  };

  /* ---------------- hk0.w 等价：图标是否可被染色 ---------------- */
  var COLOR_KEYWORDS = {
    none: 1, transparent: 1, currentcolor: 1, inherit: 1, unset: 1, initial: 1,
    'context-fill': 1, 'context-stroke': 1
  };
  var NAMED_COLORS = {
    aqua: 1, azure: 1, beige: 1, blue: 1, brown: 1, chartreuse: 1, coral: 1, crimson: 1,
    cyan: 1, fuchsia: 1, gold: 1, green: 1, indigo: 1, khaki: 1, lime: 1, magenta: 1,
    maroon: 1, navy: 1, olive: 1, orange: 1, orchid: 1, pink: 1, plum: 1, purple: 1,
    red: 1, salmon: 1, tan: 1, teal: 1, tomato: 1, turquoise: 1, violet: 1, yellow: 1,
    black: 1, white: 1, gray: 1, grey: 1, silver: 1, dimgray: 1, dimgrey: 1
  };

  /* true = 单色图标（App 会套 setColorFilter，预览就用 toolTextColor / accentColor）；
   * false = 自带实色（原样渲染）。
   * 与 hk0.w 一致：非 svg 载荷、空值、解析不了的一律当「可染色」（App 那边也返回 true）。 */
  FE.iconTintable = function (payload) {
    var s = String(payload == null ? '' : payload).trim();
    var low = s.toLowerCase();
    if (low.indexOf('svg:') === 0) s = s.slice(4).trim();
    else if (low.indexOf('xml:') === 0) s = s.slice(4).trim();
    if (!s) return true;
    s = s.replace(/^\uFEFF+/, '');
    /* 去掉开头的 xml 声明 / DOCTYPE / 注释，再取根标签名 */
    var guard = 0;
    while (guard++ < 20) {
      var t = s.replace(/^\s+/, '');
      if (/^<\?/.test(t)) { s = t.replace(/^<\?[^>]*>/, ''); continue; }
      if (/^<!doctype/i.test(t)) { s = t.replace(/^<![^>]*>/i, ''); continue; }
      if (/^<!--/.test(t)) { s = t.replace(/^<!--[\s\S]*?-->/, ''); continue; }
      s = t;
      break;
    }
    if (s.charAt(0) !== '<') return true;
    var root = (s.match(/^<\s*([A-Za-z0-9:_-]+)/) || [])[1] || '';
    if (root.toLowerCase() !== 'svg') return true;
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    var tagRe = /<([^<>]*)>/g, m;
    while ((m = tagRe.exec(s))) {
      var body = m[1];
      if (!body || /^[\/!?]/.test(body.replace(/^\s+/, ''))) continue;
      var attrRe = /([A-Za-z0-9:_-]+)\s*=\s*("[^"]*"|'[^']*')/g, am;
      while ((am = attrRe.exec(body))) {
        var name = am[1].toLowerCase();
        if (name.indexOf(':') >= 0) name = name.split(':').pop();
        if (name !== 'fill' && name !== 'stroke') continue;
        var val = am[2].replace(/^["']|["']$/g, '').trim().toLowerCase();
        if (!val) continue;
        if (COLOR_KEYWORDS[val]) continue;
        if (val.indexOf('url(') === 0) continue;
        if (val.charAt(0) === '#') {
          var hex = val.slice(1);
          if (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8) {
            if (/^[0-9a-f]+$/.test(hex)) return false;
          }
          continue;
        }
        if (/^rgba?\(/.test(val)) return false;
        if (NAMED_COLORS[val]) return false;
      }
    }
    return true;
  };

  /* ---------------- 内置矢量（App 的 ic_tool_*.xml，24dp / viewport 24） ----------------
   * 源文件全是纯黑/纯白灰阶（hk0.w 判「可染色」），这里统一换成 currentColor，
   * 于是跟随 toolTextColor / accentColor，与实机一致。 */
  function V(inner) { return '<svg viewBox="0 0 24 24" class="kb-icon">' + inner + '</svg>'; }
  var BUILTIN = {
    schema: V('<path fill="currentColor" d="M11.99,2C6.47,2 2,6.48 2,12s4.47,10 9.99,10C17.52,22 22,17.52 22,12S17.52,2 11.99,2zM18.92,8h-2.95c-0.32,-1.25 -0.78,-2.45 -1.38,-3.56 1.84,0.63 3.37,1.91 4.33,3.56zM12,4.04c0.83,1.2 1.48,2.53 1.91,3.96h-3.82c0.43,-1.43 1.08,-2.76 1.91,-3.96zM4.26,14C4.1,13.36 4,12.69 4,12s0.1,-1.36 0.26,-2h3.38c-0.08,0.66 -0.14,1.32 -0.14,2 0,0.68 0.06,1.34 0.14,2L4.26,14zM5.08,16h2.95c0.32,1.25 0.78,2.45 1.38,3.56 -1.84,-0.63 -3.37,-1.9 -4.33,-3.56zM8.03,8L5.08,8c0.96,-1.66 2.49,-2.93 4.33,-3.56C8.81,5.55 8.35,6.75 8.03,8zM12,19.96c-0.83,-1.2 -1.48,-2.53 -1.91,-3.96h3.82c-0.43,1.43 -1.08,2.76 -1.91,3.96zM14.34,14L9.66,14c-0.09,-0.66 -0.16,-1.32 -0.16,-2 0,-0.68 0.07,-1.35 0.16,-2h4.68c0.09,0.65 0.16,1.32 0.16,2 0,0.68 -0.07,1.34 -0.16,2zM14.59,19.56c0.6,-1.11 1.06,-2.31 1.38,-3.56h2.95c-0.96,1.65 -2.49,2.93 -4.33,3.56zM16.36,14c0.08,-0.66 0.14,-1.32 0.14,-2 0,-0.68 -0.06,-1.34 -0.14,-2h3.38c0.16,0.64 0.26,1.31 0.26,2s-0.1,1.36 -0.26,2h-3.38z"/>'),
    deploy: V('<path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4c-4.42,0 -7.99,3.58 -7.99,8s3.57,8 7.99,8c3.73,0 6.84,-2.55 7.73,-6h-2.08c-0.82,2.33 -3.04,4 -5.65,4 -3.31,0 -6,-2.69 -6,-6s2.69,-6 6,-6c1.66,0 3.14,0.69 4.22,1.78L13,11h7V4l-2.35,2.35z"/>'),
    settings: V('<path fill="currentColor" d="M19.14,12.94c0.04,-0.3 0.06,-0.61 0.06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c0.18,-0.14 0.23,-0.41 0.12,-0.61l-1.92,-3.32c-0.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,0.96c-0.5,-0.38 -1.03,-0.7 -1.62,-0.94L14.4,2.81c-0.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-0.24,0 -0.43,0.17 -0.47,0.41L9.25,5.35C8.66,5.59 8.12,5.92 7.63,6.29L5.24,5.33c-0.22,-0.08 -0.47,0 -0.59,0.22L2.74,8.87C2.62,9.08 2.66,9.34 2.86,9.48l2.03,1.58C4.84,11.36 4.8,11.69 4.8,12s0.02,0.64 0.07,0.94l-2.03,1.58c-0.18,0.14 -0.23,0.41 -0.12,0.61l1.92,3.32c0.12,0.22 0.37,0.29 0.59,0.22l2.39,-0.96c0.5,0.38 1.03,0.7 1.62,0.94l0.36,2.54c0.05,0.24 0.24,0.41 0.48,0.41h3.84c0.24,0 0.44,-0.17 0.47,-0.41l0.36,-2.54c0.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,0.96c0.22,0.08 0.47,0 0.59,-0.22l1.92,-3.32c0.12,-0.22 0.07,-0.47 -0.12,-0.61L19.14,12.94zM12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6S13.98,15.6 12,15.6z"/>'),
    clipboard: V('<g transform="translate(12 12) scale(0.95) translate(-12 -12)"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M11,14H16.5M7,14H7.5M7,10.5H7.5M7,17.5H7.5M11,10.5H16.5M11,17.5H16.5"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8,3.5C8,2.672 8.672,2 9.5,2H14.5C15.328,2 16,2.672 16,3.5V4.5C16,5.328 15.328,6 14.5,6H9.5C8.672,6 8,5.328 8,4.5ZM21,16C21,18.829 21,20.243 20.121,21.122C19.243,22 17.828,22 15,22H9C6.172,22 4.757,22 3.879,21.122C3,20.243 3,18.829 3,16V13M16,4C18.175,4.014 19.353,4.111 20.121,4.879C21,5.758 21,7.172 21,10V12M8,4C5.825,4.014 4.647,4.111 3.879,4.879C3.11,5.647 3.014,6.825 3,9"/></g>'),
    voice: V('<path fill="currentColor" d="M12,14c1.66,0 2.99,-1.34 2.99,-3L15,5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6c0,1.66 1.34,3 3,3zM17.3,11c0,3 -2.54,5.1 -5.3,5.1S6.7,14 6.7,11L5,11c0,3.41 2.72,6.23 6,6.72L11,21h2v-3.28c3.28,-0.48 6,-3.3 6,-6.72h-1.7z"/>'),
    hide_keyboard: V('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4,3h16a2,2 0,0 1,2 2v7a2,2 0,0 1,-2 2H4a2,2 0,0 1,-2 -2V5a2,2 0,0 1,2 -2zM5,6.5h2M9,6.5h2M13,6.5h2M17,6.5h2M5,10.5h2M9,10.5h2M13,10.5h2M17,10.5h2"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M8,18l4,4 4,-4"/>'),
    theme: V('<path fill="currentColor" d="M12,2C6.49,2 2,6.49 2,12s4.49,10 10,10c1.38,0 2.5,-1.12 2.5,-2.5 0,-0.61 -0.23,-1.2 -0.64,-1.67 -0.08,-0.1 -0.13,-0.21 -0.13,-0.33 0,-0.28 0.22,-0.5 0.5,-0.5H16c3.31,0 6,-2.69 6,-6C22,5.92 17.51,2 12,2zM6.5,13c-0.83,0 -1.5,-0.67 -1.5,-1.5S5.67,10 6.5,10s1.5,0.67 1.5,1.5S7.33,13 6.5,13zM9.5,9C8.67,9 8,8.33 8,7.5S8.67,6 9.5,6s1.5,0.67 1.5,1.5S10.33,9 9.5,9zM14.5,9c-0.83,0 -1.5,-0.67 -1.5,-1.5S13.67,6 14.5,6s1.5,0.67 1.5,1.5S15.33,9 14.5,9zM17.5,13c-0.83,0 -1.5,-0.67 -1.5,-1.5s0.67,-1.5 1.5,-1.5 1.5,0.67 1.5,1.5S18.33,13 17.5,13z"/>'),
    size: V('<path fill="currentColor" d="M20,3L4,3c-1.1,0 -1.99,0.9 -1.99,2L2,15c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2L22,5c0,-1.1 -0.9,-2 -2,-2zM11,6h2v2h-2L11,6zM11,9h2v2h-2v-2zM8,6h2v2L8,8L8,6zM8,9h2v2L8,11v-2zM7,11L5,11v-2h2v2zM7,8L5,8L5,6h2v2zM16,15L8,15v-2h8v2zM16,11h-2v-2h2v2zM16,8h-2L14,6h2v2zM19,11h-2v-2h2v2zM19,8h-2L17,6h2v2z"/><path fill="currentColor" d="M4,20h16v2H4z"/>'),
    one_hand: V('<path fill="currentColor" fill-rule="evenodd" d="M3,3.5h18c1.52,0 2.75,1.23 2.75,2.75v11.5c0,1.52 -1.23,2.75 -2.75,2.75h-18c-1.52,0 -2.75,-1.23 -2.75,-2.75v-11.5c0,-1.52 1.23,-2.75 2.75,-2.75zM3.5,5.25h17c0.69,0 1.25,0.56 1.25,1.25v11c0,0.69 -0.56,1.25 -1.25,1.25h-17c-0.69,0 -1.25,-0.56 -1.25,-1.25v-11c0,-0.69 0.56,-1.25 1.25,-1.25z"/><path fill="currentColor" d="M12,7h2.25v2.75H12zM15.25,7h2.25v2.75h-2.25zM18.5,7h2.25v2.75H18.5zM12,10.75h2.25v2.75H12zM15.25,10.75h2.25v2.75h-2.25zM18.5,10.75h2.25v2.75H18.5zM12,14.5h8.75v2.25H12z"/><path fill="currentColor" d="M5.39,7.8L9.59,12 5.39,16.2 4.4,15.21 7.61,12 4.4,8.79z"/>'),
    split_keyboard: V('<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M2,5.5h8v13H2zM14,5.5h8v13h-8z"/><path fill="currentColor" d="M3.5,7.5h1.5v1.5h-1.5zM6.5,7.5h1.5v1.5h-1.5zM3.5,10.5h1.5v1.5h-1.5zM6.5,10.5h1.5v1.5h-1.5zM3.5,13.5h5v1.5h-5zM15.5,7.5h1.5v1.5h-1.5zM18.5,7.5h1.5v1.5h-1.5zM15.5,10.5h1.5v1.5h-1.5zM18.5,10.5h1.5v1.5h-1.5zM15.5,13.5h5v1.5h-5z"/><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" d="M12,6.5v2M12,11v2M12,15.5v2"/>'),
    rime_switches: V('<path fill="currentColor" d="M3,17v2h6v-2H3zM3,5v2h10V5H3zM13,19h8v-2h-8v2zM7,9v2H3v2h4v2h2V9H7zM21,13v-2h-8v2h8zM17,9h2V7h2V5h-2V3h-2v2h-2v2h2v2z"/>')
  };
  /* keyboard_tools **有**内置图标：r71.java:645-648 f0() 的 iconRes 是 R.drawable.ic_tool_theme，
   * 显示名取的也是 R.string.tool_theme（「主题」）—— 即它复用主题图标，不是纯文字 chip。
   * （旧版这里写「无图标」，与反编译不符，导致预览里它掉进 TextView 分支只剩文字。） */
  BUILTIN.keyboard_tools = BUILTIN.theme;
  FE.TOOLBAR_BUILTIN_SVG = BUILTIN;

  /* ---------------- 预览渲染 ---------------- */
  var SPEC = {
    rowHeightDp: 40, iconDp: 22, gapDp: 3, cornerDp: 12,
    fontSp: 18, padXDp: 10, padYDp: 2,
    /* 边缘渐隐层宽度（只做视觉提示，不占布局）。 */
    fadeDp: 14
  };
  FE.TOOLBAR_SPEC = SPEC;

  function st() { return FE.state || {}; }
  function dp(v, unit) { return FE.kbDp(v, unit); }
  function css(field) {
    var r = FE.resolveThemeField(field, { includeBuiltin: true });
    return r && r.value != null ? FE.colorToCss(r.value) : null;
  }
  function barBg() {
    if (typeof FE.resolveCandidateBarColor !== 'function') return null;
    var r = FE.resolveCandidateBarColor(st().keyBorderEnabled !== false, { includeBuiltin: true });
    return r && r.value != null ? FE.colorToCss(r.value) : null;
  }

  /* 当前预览要用的图标定义：state.toolbarIcons[id] = { icon, activeIcon } */
  function iconOf(id, active) {
    var bag = (st().toolbarIcons || {})[id];
    var alias = FE.TOOLBAR_ICON_ALIAS[id];
    if (!bag && alias) bag = (st().toolbarIcons || {})[alias];
    if (bag) {
      if (active && bag.activeIcon) return { markup: bag.activeIcon, from: 'theme' };
      if (bag.icon) return { markup: bag.icon, from: 'theme' };
      if (bag.activeIcon) return { markup: bag.activeIcon, from: 'theme' };
    }
    if (BUILTIN[id]) return { markup: BUILTIN[id], from: 'builtin' };
    return null;
  }
  FE.toolbarIconOf = iconOf;

  /* 一个 chip 的外壳：尺寸/圆角/底色与 App 的 w20.java 一致（40dp 方、圆角 12dp、
   * 底 candidateBackgroundColor）。图标 chip 与文字 chip 共用它，只在内层分叉。 */
  function chipShell(id, unit) {
    var el = FE.h('div', { class: 'kbt-chip', 'data-toolbar-btn': id });
    el.style.height = dp(SPEC.rowHeightDp, unit) + 'px';
    el.style.width = dp(SPEC.rowHeightDp, unit) + 'px';
    el.style.borderRadius = dp(SPEC.cornerDp, unit) + 'px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    var bg = css('candidateBackgroundColor');
    if (bg) el.style.background = bg;
    return el;
  }

  /* 往 chip 里放图标：22dp 方缩略框，图标颜色跟着 chip 的 color（currentColor）走。 */
  function putIcon(el, markup, unit) {
    var box = FE.h('span', { class: 'kb-icon-wrap kbt-icon' });
    box.style.width = dp(SPEC.iconDp, unit) + 'px';
    box.style.height = dp(SPEC.iconDp, unit) + 'px';
    box.innerHTML = markup;
    el.appendChild(box);
  }

  /* 输入法开关（rime_switches）在实机上不是一个图标 chip，而是**文字 chip**：
   * at0.java:1533-1573 —— schema switches 非空时 q20 的 iconRes 传 0（走 TextView 分支），
   * label 取「该 switch 的 states 首项」（qj.K0(q.b)），statusLabel = "switch:<name>"；
   * 之后 te.java:812-820 用 t70.a 按「当前索引」重算同一个 TextView 的文字。
   * 本项目 schema（pinyin_simp / stroke）里 ascii_mode 是 reset: 0 / states: [ 中文, 西文 ]
   * （assets/rime-data/*.schema.yaml）。
   *
   * ⚠️ 文案以 **App 源码为准**（用户口径）：本项目 schema 里 ascii_mode 就是
   *    reset: 0 / states: [ 中文, 西文 ]（assets/rime-data/pinyin_simp.schema.yaml、
   *    stroke.schema.yaml），所以预览写**源码原字**「中文 / 西文」——不缩写、不取首字。
   *    早期版本按实机截图取过首字「中 / 西」，那只是观测口径；用户已明确要求以源码为准，
   *    故不再为迁就截图而改写文案（ha.java 里负责取字的 ha.a(int,int) 反编译缺失，
   *    截图为何只显一处字形从源码上无法解释，也不应反过来改写 schema 文案）。
   *
   * 预览直接读 state.status.ascii_mode（与 #pt-ascii 复选框同一份状态），
   * 于是勾选复选框时工具栏文字与键面文字在同一帧里一起变。 */
  var RIME_STATES = ['中文', '西文'];   // states: [ 中文, 西文 ]（源码原文）
  function rimeSwitchLabel() {
    return st().status && st().status.ascii_mode ? RIME_STATES[1] : RIME_STATES[0];
  }

  function chip(id, active, unit) {
    var def = FE.TOOLBAR_BUTTONS[id] || { label: id };
    var isSwitch = (id === 'rime_switches');
    var pick = isSwitch ? null : iconOf(id, active);
    var fg = active ? css('accentColor') : css('toolTextColor');
    var el = chipShell(id, unit);
    if (pick) {
      var tintable = FE.iconTintable(pick.markup);
      if (tintable && fg) el.style.color = fg;
      /* 实机显示名与编辑器标签不一致的按钮，title 里点明（作者看提示就知道对应关系）。 */
      var realLabel = (id === 'keyboard_tools') ? '主题' : def.label;
      el.title = realLabel + '（' +
        (pick.from === 'theme'
          ? (tintable ? '主题图标 · 单色，跟随主题文字色' : '主题图标 · 自带实色，原样渲染')
          : '内置矢量 · 跟随主题文字色') + '）';
      putIcon(el, pick.markup, unit);
    } else {
      /* 无图标 → 纯文字 chip（w20.java 的 TextView 分支：18sp、内边距 10dp×2dp）。
       * 宽度改由 flex 撑开（App 端是 wrap_content），所以撤掉 shell 的定宽。 */
      el.style.width = 'auto';
      el.style.padding = dp(SPEC.padYDp, unit) + 'px ' + dp(SPEC.padXDp, unit) + 'px';
      el.style.fontSize = dp(SPEC.fontSp, unit) + 'px';
      el.style.lineHeight = '1.2';
      /* 文字 chip 不能被 flex 压缩：宽度不够时让它保持整字（实机是 wrap_content），
       * 让左边的图标 chip 去收窄 —— 否则单字会被压扁/裁切。 */
      el.style.flex = '0 0 auto';
      el.style.whiteSpace = 'nowrap';
      if (fg) el.style.color = fg;
      if (isSwitch) {
        var lab = rimeSwitchLabel();
        el.title = '输入法开关（switch:ascii_mode）· 当前「' + lab +
          '」· 与预览工具栏的 ascii_mode 复选框联动' +
          '（文案取 schema states 原文：中文 / 西文）';
        el.appendChild(FE.h('span', { class: 'kbt-label' }, lab));
      } else {
        el.title = def.label + '（无图标，实机显示文字）';
        el.appendChild(FE.h('span', { class: 'kbt-label' }, def.label));
      }
    }
    return el;
  }

  /* 按钮是否处于「激活」态 —— w20.java:279 的 `z2 = os.k.contains(id)`。
   *
   * ⚠️ os.k（激活集合）在整个反编译里只有三处写入：
   *     ox.java:882-884 与 w20.java:363-365 → n("size", …n)、n("one_hand", …j)、n("split_keyboard", …x)
   *   也就是**只有**尺寸菜单打开 / 单手模式开 / 分体模式开这三个按钮会进集合；
   *   schema / deploy / settings / clipboard / keyboard_tools / rime_switches /
   *   hide_keyboard / theme / voice 永远不会激活，永远用未激活图标。
   *
   * ⇒ 「展开态 ⇒ 所有按钮都用激活图标」是错的：主题作者把「*激活.svg」画成
   *   「图标 + 一道斜杠」（水彩包 尺寸激活/单手激活/分体激活 即如此），
   *   只有当对应模式真打开时才该出现那道斜杠；否则看起来就像「禁用占位」。
   *   这里按预览真实状态给：预览只有「分体」有开关，尺寸菜单/单手没建模 → 恒 false。 */
  function activeSet() {
    var s = st();
    var set = {};
    if (s.splitMode) set.split_keyboard = true;
    return set;
  }
  FE.toolbarActiveSet = activeSet;

  /* App 里 `keyboard_tools` 与 `theme` 是**同一个按钮**的两处入口（用户问「为什么有两个主题按钮」）：
   *   at0.java:1440 → keyboard_tools = r71.f0()：label = getString(R.string.tool_theme)（「主题」）、
   *     icon = R.drawable.ic_tool_theme、点击绑定 wc(xc.a, r5.a)；
   *   at0.java:1447-1450 → theme：同一 label、同一 icon、同一 r5.a 点击。
   * 主组与展开组在实机**互斥显示**（w20.java:335 removeAllViews 后一次只装一组、os.java 只有一个行容器），
   * 所以屏幕上永远只有一个「主题」。预览把两组拼成一行时必须按按钮去重，
   * 否则就是用户看到的「两个一模一样的主题按钮」。
   * 先出现者保留（默认配置主组在前 → 保留 keyboard_tools 那一枚，与实机主行第 5 格位置一致）。 */
  FE.TOOLBAR_SAME_BUTTON = { theme: 'keyboard_tools' };
  function buttonKey(id) { return FE.TOOLBAR_SAME_BUTTON[id] || id; }

  /* 一条完整列表 = 配置里的 main 组 + expanded 组，**按按钮去重后照原顺序拼起来**。
   * 用户口径：预览不模拟「展开/收起」，一次把全部按钮画在同一行里；
   * 装不下就横向滚动。顺序保持 main 在前、expanded 追加在后，稳定可预期。
   * 去重是必要的：作者常把同一按钮同时放进两组，或放同义入口（theme / keyboard_tools）。 */
  FE.toolbarAllIds = function (cfg) {
    var c = cfg || FE.TOOLBAR_DEFAULT;
    var out = [];
    (c.main || []).concat(c.expanded || []).forEach(function (id) {
      if (!id) return;
      var key = buttonKey(id);
      for (var i = 0; i < out.length; i++) if (buttonKey(out[i]) === key) return;
      out.push(id);
    });
    return out;
  };

  /* ---------------- 横向滚动轨道（用户口径：工具栏没有固定宽度） ----------------
   * App 里工具栏与候选栏是同一层级的横向布局（ox.java:646-649 两个 -1×0 weight 80 的兄弟），
   * 内容多了就横向滑动，不存在「工具栏宽度」这个概念。网页预览照此改成：
   *   .kbt（host，宽度=键盘面板宽） > .kbt-track（overflow-x:auto，真正的滚动视口）
   *     > .kbt-row（width:max-content、min-width:100%、不换行、不收缩）
   * 内容比视口短时 min-width:100% 让 row 铺满，space_around 与实机一致；
   * 内容比视口长时 row 自然延伸出去，超出部分裁在轨道外，可拖动/滚轮/触摸左右滑。 */
  /* 只有一条工具栏（不再分 main/expanded 两组），滚动位置记一个数就够。 */
  var scrollMemo = 0;
  var dragState = null;
  var suppressClick = false;

  function canScrollX(track) {
    var max = (track.scrollWidth || 0) - (track.clientWidth || 0);
    return max > 1;
  }

  /* 边缘渐隐：让「后面还有内容 / 前面还漏了内容」变成看得见的提示，
   * 也把被轨道边缘裁掉半块的 chip 柔和收掉。 */
  function updateFades(track, fadeL, fadeR) {
    if (!track || !fadeL || !fadeR) return;
    var left = track.scrollLeft || 0;
    var max = (track.scrollWidth || 0) - (track.clientWidth || 0);
    var hasLeft = left > 1;
    var hasRight = max - left > 1;
    fadeL.classList.toggle('on', hasLeft);
    fadeR.classList.toggle('on', hasRight);
  }

  function bindTrack(track, host, fadeL, fadeR) {
    if (!track || typeof track.addEventListener !== 'function') return;
    /* --- 拖动（鼠标 / 触控笔；触摸由浏览器原生横向滚动接管） --- */
    track.addEventListener('pointerdown', function (ev) {
      if (!ev || ev.button === 2) return;
      dragState = {
        track: track,
        startX: typeof ev.clientX === 'number' ? ev.clientX : 0,
        startLeft: track.scrollLeft || 0,
        moved: false
      };
      if (typeof track.setPointerCapture === 'function' && ev.pointerId != null) {
        try { track.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      }
      track.classList.add('is-dragging');
    });
    track.addEventListener('pointermove', function (ev) {
      if (!dragState || dragState.track !== track) return;
      var x = typeof ev.clientX === 'number' ? ev.clientX : dragState.startX;
      var dx = x - dragState.startX;
      if (Math.abs(dx) > 2) dragState.moved = true;
      track.scrollLeft = dragState.startLeft - dx;
    });
    function endDrag() {
      if (!dragState || dragState.track !== track) return;
      var moved = dragState.moved;
      dragState = null;
      track.classList.remove('is-dragging');
      if (moved) {
        /* 拖完松手时浏览器还会补一个 click，会把「拖动」误判成「点了按钮」 —— 吞掉那一下。 */
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
      }
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', endDrag);
    track.addEventListener('click', function (ev) {
      if (!suppressClick) return;
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    }, true);
    /* --- 滚轮：竖向滚轮也转成横向滑动（工具栏只有一行，没有纵向内容） --- */
    track.addEventListener('wheel', function (ev) {
      if (!ev || ev.ctrlKey) return;
      var dx = typeof ev.deltaX === 'number' ? ev.deltaX : 0;
      var dy = typeof ev.deltaY === 'number' ? ev.deltaY : 0;
      if (dx !== 0 && Math.abs(dx) >= Math.abs(dy)) return; /* 横向手势交给浏览器 */
      var max = (track.scrollWidth || 0) - (track.clientWidth || 0);
      if (max <= 1) return; /* 内容装得下 → 不抢页面的纵向滚动 */
      var next = (track.scrollLeft || 0) + dy;
      /* 到边界就停下（不冒泡去滚页面，避免「拖到尽头整页跳走」）。 */
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      track.scrollLeft = Math.max(0, Math.min(max, next));
      scrollMemo = track.scrollLeft;
      updateFades(track, fadeL, fadeR);
    }, { passive: false });
    track.addEventListener('scroll', function () {
      scrollMemo = track.scrollLeft || 0;
      updateFades(track, fadeL, fadeR);
    });
    /* 切换页签、改主题、勾选状态都会重画整条工具栏；
     * 轨道位置记住，重画时不要被扔回最左端。 */
    var maxLeft = (track.scrollWidth || 0) - (track.clientWidth || 0);
    var want = Math.min(scrollMemo || 0, Math.max(0, maxLeft));
    if (want > 0) track.scrollLeft = want;
    updateFades(track, fadeL, fadeR);
  }

  /* 渲染入口：host = #preview-toolbar —— **#preview-kb 的子节点**（键盘面板最上面一行）。 */
  FE.renderPreviewToolbar = function (host, unit) {
    if (!host) return null;
    var s = st();
    FE.clearEl(host);
    /* 符号面板页也显示工具栏（用户口径：实机打开符号面板时工具栏不会消失）。
     * 只由「预览选项」里的开关决定显隐，与页签无关 —— 否则切换页签时
     * 工具栏忽隐忽现，键盘面板高度跟着跳。 */
    var show = s.previewToolbar !== false;
    host.hidden = !show;
    if (!show) return null;
    var u = (typeof unit === 'number' && unit > 0) ? unit : ((s.portraitW || 380) / 10);
    /* host 直接铺在键盘面板底色上（os.java:76 setBackgroundColor(a.e()) 是**容器**底色，
     * 与键盘容器同一套配色解析），所以这里不再自带宽高与圆角，
     * 也不写底色 —— 否则会多出一条「比键盘窄/底色不同」的假差异。 */
    host.className = 'kbt';
    host.style.background = 'transparent';
    /* 两端的渐隐层是 host 的绝对定位子节点，所以 host 要做它们的定位参照。 */
    host.style.position = 'relative';

    /* 用户口径（m08645）：**一次显示全部按钮** —— 主组 + 展开组拼成一条完整列表，
     * 不再有「展开/收起」两种状态、也没有行尾那枚展开按钮。
     * 装不下时靠 .kbt-track 横向拖动查看后面的图标。 */
    var cfg = s.toolbarConfig || FE.TOOLBAR_DEFAULT;
    var ids = FE.toolbarAllIds(cfg);

    var track = FE.h('div', { class: 'kbt-track' });

    var row = FE.h('div', { class: 'kbt-row' });
    row.style.display = 'flex';
    row.style.flexDirection = 'row';
    /* 实机是 FlexboxLayout wrap=WRAP，但工具栏只有一行 40dp 的按钮；
     * 预览里换行只会让人误判「实机也会折成两行」，所以强制单行、由轨道横向滚。 */
    row.style.flexWrap = 'nowrap';
    row.style.alignItems = 'center';
    /* 对齐：os.java:56 setJustifyContent(4)，按 attrs.xml:566-573 的枚举 4 = space_around
     * （每项两侧各分「剩余空间/项数」的一半，首尾也留半格），所以不是 space-between。
     * 内容装不下时 row 按 max-content 长出去，space_around 自然退化成行首紧凑排列。 */
    row.style.justifyContent = 'space-around';
    /* 宽度由内容决定（无限宽），但在内容较短时至少铺满视口 —— 两种情形都是实机观感。 */
    row.style.width = 'max-content';
    row.style.minWidth = '100%';
    /* 间距：实机是每个 chip 自带 chipGap 3dp 四边外边距（w20.java:314-316），相邻净距 6dp。
     * 这里用 3dp 行内 gap 作紧凑近似（相邻净距 6dp 会让一行太松散）。 */
    row.style.gap = dp(SPEC.gapDp, u) + 'px';
    /* 行内不再预留任何控制键的位置：行尾没有展开/收起 chip 了，
     * 预留内距只会在「内容刚好装下」时凭空多出可滚动量。 */
    row.style.boxSizing = 'border-box';
    var act = activeSet();
    ids.forEach(function (id) { row.appendChild(chip(id, !!act[id], u)); });
    track.appendChild(row);

    var fadeL = FE.h('div', { class: 'kbt-fade kbt-fade-l' });
    var fadeR = FE.h('div', { class: 'kbt-fade kbt-fade-r' });
    fadeL.style.width = dp(SPEC.fadeDp, u) + 'px';
    /* 右端不再被控制 chip 占位，渐隐层与左端等宽（对称提示「这边还有图标」）。 */
    fadeR.style.width = dp(SPEC.fadeDp, u) + 'px';

    host.appendChild(track);
    host.appendChild(fadeL);
    host.appendChild(fadeR);

    bindTrack(track, host, fadeL, fadeR);
    return { ids: ids.slice(), scrollable: canScrollX(track) };
  };

  /* 重渲染（只刷新预览，不动数据/撤销栈） */
  FE.applyPreviewToolbar = function () {
    if (typeof FE.renderPreviewOnly === 'function') FE.renderPreviewOnly();
    else if (typeof FE.renderAll === 'function') FE.renderAll();
    if (typeof FE.autosaveDraft === 'function') FE.autosaveDraft();
  };

  /* ---------------- 导入图标文件（纯逻辑，UI 在下方 DOM 段） ---------------- */
  /* entries = [{name, text}]（name 可带目录前缀）。返回 report：
   *   { ok: [id…], skipped: [{name, reason}], unmatched: [name…] } */
  FE.importToolbarIcons = function (entries) {
    var report = { ok: [], skipped: [], unmatched: [], unknown: [] };
    var bag = FE.state.toolbarIcons && typeof FE.state.toolbarIcons === 'object'
      ? FE.state.toolbarIcons : (FE.state.toolbarIcons = {});
    (entries || []).forEach(function (en) {
      var name = String((en && en.name) || '');
      var base = name.replace(/^.*[\\/]/, '');
      var text = en && en.text != null ? String(en.text) : '';
      var match = FE.toolbarIconMatch(base);
      if (!match) { report.unmatched.push(base); return; }
      var markup = typeof FE.iconMarkupFromPayload === 'function'
        ? FE.iconMarkupFromPayload('svg:' + text.trim()) : null;
      if (!markup) { report.skipped.push({ name: base, reason: '不是可渲染的 SVG' }); return; }
      if (!bag[match.id]) bag[match.id] = {};
      if (match.active) bag[match.id].activeIcon = markup;
      else bag[match.id].icon = markup;
      if (report.ok.indexOf(match.id) < 0) report.ok.push(match.id);
    });
    if (typeof FE.renderPreviewOnly === 'function') FE.renderPreviewOnly();
    return report;
  };

  /* 已导入张数（状态行用） */
  FE.toolbarIconCount = function () {
    var bag = FE.state.toolbarIcons || {};
    var n = 0;
    Object.keys(bag).forEach(function (id) {
      if (bag[id] && (bag[id].icon || bag[id].activeIcon)) n++;
    });
    return n;
  };
  FE.clearToolbarIcons = function () {
    FE.state.toolbarIcons = {};
    if (typeof FE.renderPreviewOnly === 'function') FE.renderPreviewOnly();
  };

  /* ================================================================
   * UI（仅浏览器）：主题页「工具栏图标与符号字体」卡片里的控件接线
   * ================================================================ */
  if (typeof document === 'undefined' || !document.getElementById('pt-toolbar-icons-file')) return;

  var h = FE.h;

  function setStatus(msg, kind) {
    var el = document.getElementById('pt-toolbar-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  FE.setPreviewToolbarStatus = setStatus;

  (function wire() {
    var iconInput = document.getElementById('pt-toolbar-icons-file');
    var fontInput = document.getElementById('pt-font-file');
    /* 按钮转发到隐藏的 file input（与主题页其它导入按钮同一手法）。 */
    var iconPick = document.getElementById('pt-toolbar-icons-pick');
    if (iconPick && iconInput) {
      iconPick.addEventListener('click', function () { iconInput.click(); });
    }
    var fontPick = document.getElementById('pt-font-pick');
    if (fontPick && fontInput) {
      fontPick.addEventListener('click', function () { fontInput.click(); });
    }
    var showBox = document.getElementById('pt-toolbar');
    var resetBtn = document.getElementById('pt-toolbar-reset');

    if (showBox) {
      showBox.checked = FE.state.previewToolbar !== false;
      showBox.addEventListener('change', function () {
        FE.state.previewToolbar = !!showBox.checked;
        FE.applyPreviewToolbar();
      });
    }
    if (iconInput) {
      iconInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(iconInput.files || []);
        iconInput.value = '';
        if (!files.length) return;
        var pending = files.map(function (f) {
          return FE.readFileText(f).then(function (text) {
            return { name: f.name || '', text: text || '' };
          });
        });
        Promise.all(pending).then(function (entries) {
          var rep = FE.importToolbarIcons(entries);
          var bits = ['已导入 ' + rep.ok.length + ' 个按钮图标'];
          if (rep.unmatched.length) bits.push('未匹配：' + rep.unmatched.join('、'));
          if (rep.skipped.length) bits.push('跳过：' + rep.skipped.map(function (x) { return x.name; }).join('、'));
          setStatus(bits.join('；') +
            (rep.unmatched.length ? '（这些名字不在内置按钮表里，实机工具栏不会出现 —— 需要 toolbar.json 自定义按钮）' : ''), 'ok');
        });
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        FE.clearToolbarIcons();
        setStatus('已清除导入的工具栏图标，回到内置矢量。', '');
      });
    }
    if (fontInput) {
      fontInput.addEventListener('change', function () {
        var file = (fontInput.files || [])[0];
        fontInput.value = '';
        if (!file) return;
        if (typeof FE.importSymbolFontFile !== 'function') {
          setStatus('字体预览模块未加载。', 'error');
          return;
        }
        FE.importSymbolFontFile(file).then(function (res) {
          var el = document.getElementById('pt-font-status');
          if (!el) return;
          el.textContent = res.message || '';
          el.className = 'status' + (res.ok ? ' ok' : ' error');
        });
      });
    }
    var fontClear = document.getElementById('pt-font-clear');
    if (fontClear) {
      fontClear.addEventListener('click', function () {
        if (typeof FE.clearSymbolFont === 'function') FE.clearSymbolFont();
        var el = document.getElementById('pt-font-status');
        if (el) { el.textContent = '已移除预览字体（回到系统字体）。'; el.className = 'status'; }
      });
    }
  })();
})();