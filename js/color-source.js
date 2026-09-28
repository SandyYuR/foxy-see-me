/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * color-source.js — 颜色「全链路解析 + 来源标注」纯逻辑模块
 *
 * 存在理由：Foxy 的布局 JSON **不支持**「颜色引用主题字段」的语法
 *   （skills/foxy-keyboard-layout.schema.json:115 里 colors 就是自由对象；
 *    SKILL.md:892-893 明确值只能是 #RRGGBB / #AARRGGBB 字面量）。
 *   所以「全链路与主题对应」只能在**编辑器层面**实现：
 *   值仍写字面量，但解析出「当前生效色 + 它来自哪一级」，供预览与三处颜色编辑面共用。
 *
 * 解析链严格对照 App 端 `m00.c()` / `m00.i()` / `m00.k()`：
 *   ① 布局 colors.states[状态][角色]         (m00.k → m30.k)
 *   ② 布局 colors[角色]                      (m30)
 *   ③ 主题 keyTypes[键类型][角色]             (u40)
 *   ④ 主题 26 色全局默认                       (m00 字段)
 *   方向提示色另有 keyTypes.hint / 全局 hint 的**逐层**回落（见 resolveRole）。
 *
 * ⚠️ 未导入主题时 `resolveKeyColors` 返回的角色值为 null 或仅来自布局
 *   （与预览「零内联色」的回归保证一致，靠 includeBuiltin 控制是否给出内置默认）。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});
if (FE.resolveKeyColors) return;

/* ---------------- 角色与字段映射 ---------------- */

/* 10 个颜色角色（布局 JSON / 预览使用的规范名） */
FE.COLOR_ROLES = ['text', 'background', 'pressed', 'border', 'shadow',
  'hint', 'hintTop', 'hintBottom', 'hintLeft', 'hintRight'];

/* 角色 → 主题 26 色里的全局默认字段（④） */
FE.THEME_ROLE_FIELD = {
  text: 'keyTextColor',
  background: 'keyBackgroundColor',
  pressed: 'keyPressedColor',
  border: 'keyBorderColor',
  shadow: 'keyShadowColor',
  hint: 'keyHintTextColor',
  hintTop: 'keyHintTextTopColor',
  hintBottom: 'keyHintTextBottomColor',
  hintLeft: 'keyHintTextLeftColor',
  hintRight: 'keyHintTextRightColor'
};

/* 角色 → 主题 keyTypes 里的字段名（③）
 * 注意命名差：布局叫 hintTop/hintBottom，keyTypes 叫 hintUp/hintDown
 * （App 内部枚举 fv0 是 UP/DOWN，见 fv0.java:16-23）。 */
FE.KEYTYPE_ROLE_FIELD = {
  text: 'text',
  background: 'background',
  pressed: 'pressed',
  border: 'border',
  shadow: 'shadow',
  hint: 'hint',
  hintTop: 'hintUp',
  hintBottom: 'hintDown',
  hintLeft: 'hintLeft',
  hintRight: 'hintRight'
};

/* 方向角色是否有「基础提示色」这一层回落；值 = 基础角色名 */
FE.HINT_BASE_OF = {
  hintTop: 'hint', hintBottom: 'hint', hintLeft: 'hint', hintRight: 'hint'
};

/* 主题槽位里 keyTypes 的固定三类（t40.java:14-24） */
FE.KEYTYPE_NAMES = ['LETTER', 'FUNCTION', 'ACTION'];

/* ---------------- 来源枚举（供 UI 文案与测试断言） ---------------- */

/* 来源按「越具体越优先」排列，与解析链同序。 */
FE.COLOR_SOURCES = {
  LAYOUT_STATE: 'layout.state',     /* ① 布局按键状态色 */
  LAYOUT_KEY: 'layout.key',         /* ② 布局按键 colors */
  THEME_KEYTYPE: 'theme.keyType',   /* ③ 主题 keyTypes[键类型] */
  THEME_KEYTYPE_HINT: 'theme.keyTypeHint', /* ③b 主题 keyTypes[键类型].hint（方向专用） */
  THEME_GLOBAL: 'theme.global',     /* ④ 主题 26 色全局 */
  THEME_GLOBAL_HINT: 'theme.globalHint', /* ④b 主题全局 keyHintTextColor（方向专用） */
  BUILTIN: 'builtin'                /* 未导入主题时的 App 内置默认 */
};

/* 来源 → 中文标签（供「当前生效 ← 来源」显示） */
FE.colorSourceLabel = function (source, detail) {
  var m = {
    'layout.state': '布局按键状态色',
    'layout.key': '布局按键 colors',
    'theme.keyType': '主题 keyTypes',
    'theme.keyTypeHint': '主题 keyTypes 的 hint（方向回落）',
    'theme.global': '主题全局颜色',
    'theme.globalHint': '主题全局 keyHintTextColor（方向回落）',
    'builtin': 'App 内置默认主题'
  };
  var base = m[source] || '（未定义）';
  return detail ? base + ' · ' + detail : base;
};

/* ---------------- 颜色值容错 ---------------- */

/* 复用主题页的归一化（#RGB/#ARGB/#RRGGBB/#AARRGGBB → #AARRGGBB）；
 * 该函数在 theme-editor.js 里定义，若尚未加载则用等价本地实现兜底。 */
function normColor(v) {
  if (typeof FE.normalizeThemeColor === 'function') return FE.normalizeThemeColor(v);
  if (typeof v !== 'string') return null;
  var t = v.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return null;
  var h = t.slice(1).toUpperCase();
  function dup(s) { return s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); }
  if (h.length === 3) return '#FF' + dup(h);
  if (h.length === 4) return '#' + h.charAt(0) + h.charAt(0) + dup(h.slice(1));
  if (h.length === 6) return '#FF' + h;
  return '#' + h;
}
FE.colorNorm = normColor;

/* ---------------- 主题槽位访问 ---------------- */

/* 普通对象判定（不依赖 FE.isPlainObject 是否已导出） */
function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

/* 取当前主题的某个槽位对象（light/dark）。未导入主题返回 null。 */
function themeSlot(slot) {
  var p = (FE.state || {}).themeProfile;
  if (!isObj(p)) return null;
  slot = slot || (FE.state && FE.state.themeSlot) || 'light';
  if (slot !== 'dark') slot = 'light';
  var s = p[slot];
  return isObj(s) ? s : null;
}
FE.colorThemeSlot = themeSlot;

/* 主题 keyTypes 分组。
 *
 * ⚠️ **只读槽位内的 keyTypes** —— App 端 `uk.d` 是在**槽位对象**上
 * `optJSONObject("keyTypes")`（`uk.java:112`，其入参 jSONObject2/jSONObject3 来自
 * `uk.c:100/104` 的 `getJSONObject("light")` / `getJSONObject("dark")`），
 * **顶层 keyTypes 根本不会被读取**。
 * 早先这里还回落顶层 `p.keyTypes`，会造成"编辑器预览用了它、手机却忽略它"的
 * 假象（用户按预览配色调完，上机完全不是那个色）。所以去掉这条回落；
 * 顶层 keyTypes 仍会被**原样保留**在文件里（是用户数据，不删），由校验器提示它无效。 */
function themeKeyTypeGroup(keyType, slot) {
  var s = themeSlot(slot);
  var name = String(keyType || 'LETTER');
  if (s && s.keyTypes && typeof s.keyTypes === 'object' && s.keyTypes[name]) return s.keyTypes[name];
  return null;
}
FE.colorKeyTypeGroup = themeKeyTypeGroup;

/* App 内置默认主题的某个槽位（未导入主题时的真实回落，xw0.java:158-160 / 189-191）。
 * 由 theme-editor.js 提供 FE.themeBuiltinSlot；缺失则返回 null。
 *
 * ⚠️ 必须**自己归一化槽位**，不能把 `opts.slot` 原样传下去：
 * 调用点（预览的 themeCss 等）通常不传 slot，此时 `opts.slot` 是 undefined，
 * 而 FE.themeBuiltinSlot(undefined) 会按 light 处理 —— 于是用户在 dark 槽下
 * 拿到的是浅色内置默认色（踩过：未导入主题 + dark 槽时面板底亮成 #EEEEEE）。
 * 与 themeSlot() 同一口径：缺省取 state.themeSlot，非 'dark' 一律归 light。 */
function builtinSlot(slot) {
  if (typeof FE.themeBuiltinSlot !== 'function') return null;
  var s = slot || (FE.state && FE.state.themeSlot) || 'light';
  if (s !== 'dark') s = 'light';
  try { return FE.themeBuiltinSlot(s); } catch (e) { return null; }
}

/* ---------------- 运行时状态判定 ---------------- */

/* 当前命中的运行时状态名；优先级 pressed > modifierLocked > modifierActive
 * （m00.k，l30.java:14-19）。无则返回 null。 */
FE.currentKeyState = function (opts) {
  opts = opts || {};
  if (opts.pressed) return 'pressed';
  if (opts.modifierLocked) return 'modifierLocked';
  if (opts.modifierActive) return 'modifierActive';
  return null;
};

/* 由布局 status 与按键本身的 modifier 推导三个状态位（供调用方少写样板）。
 * 与 applyKeyColors 原口径一致：modifierActive 仅在 Shift + status.shift 时成立。 */
FE.keyStateOpts = function (eff, status, pressed) {
  status = status || (FE.state && FE.state.status) || {};
  var modifierOn = !pressed && eff && eff.modifier === 'SHIFT' && !!status.shift;
  return { pressed: !!pressed, modifierActive: modifierOn, modifierLocked: false };
};

/* ---------------- 单角色解析（核心） ---------------- */

/* 解析一个颜色角色，返回 { value, source, detail }：
 *   value  归一化后的 #AARRGGBB，或 null（无定义）
 *   source FE.COLOR_SOURCES 之一，或 null
 *   detail 来源细节（状态名 / 键类型 / 字段名）
 *
 * 顺序（对照 m00.c:233-291 与 m00.i:781-832）：
 *   非方向角色： ① → ② → ③ → ④
 *   方向角色：   ① → ② → ③(该方向) → ③b(keyTypes.hint) → ④(该方向) → ④b(全局 hint)
 *              —— 注意 ③b **优先于** ④，即 keyTypes.hint 赢过"槽位自己的方向色"。
 */
FE.resolveRole = function (role, eff, opts) {
  opts = opts || {};
  var colors = (eff && typeof eff === 'object' && eff.colors && typeof eff.colors === 'object')
    ? eff.colors : null;
  var stateName = FE.currentKeyState(opts);
  var stateObj = (colors && stateName && colors.states &&
    colors.states[stateName] && typeof colors.states[stateName] === 'object')
    ? colors.states[stateName] : null;
  var ktName = String((eff && eff.keyType) || 'LETTER');
  var ktGroup = themeKeyTypeGroup(ktName, opts.slot);
  var slot = themeSlot(opts.slot);
  var useBuiltin = !!opts.includeBuiltin;
  var bSlot = useBuiltin ? builtinSlot(opts.slot) : null;
  var bKt = null;
  if (useBuiltin && bSlot && bSlot.keyTypes && bSlot.keyTypes[ktName]) bKt = bSlot.keyTypes[ktName];

  var themeField = FE.THEME_ROLE_FIELD[role];
  var ktField = FE.KEYTYPE_ROLE_FIELD[role];
  var baseRole = FE.HINT_BASE_OF[role] || null;

  /* 「取第一个有值者」，带来源标注。
   * 调用约定：pick(来源1, 细节1, 值1, 来源2, 细节2, 值2, …) —— **三个一组**。
   * ⚠️ 步长必须是 3：写成 2 会把「细节」当「来源」、错位读取（曾踩过）。 */
  function pick() {
    for (var i = 0; i + 2 < arguments.length; i += 3) {
      var v = normColor(arguments[i + 2]);
      if (v != null) {
        return { value: v, source: arguments[i], detail: arguments[i + 1] };
      }
    }
    return null;
  }

  /* ① 布局状态色 */
  var a = stateObj ? stateObj[role] : null;
  var A = a != null ? normColor(a) : null;
  /* ② 布局每键 colors */
  var b = colors ? colors[role] : null;
  var B = b != null ? normColor(b) : null;
  /* ③ 主题 keyTypes[该角色] */
  var C = ktGroup ? normColor(ktGroup[ktField]) : null;
  /* ③b 主题 keyTypes.hint（仅方向角色） */
  var D = (baseRole && ktGroup) ? normColor(ktGroup[baseRole]) : null;
  /* ④ 主题全局默认 */
  var E = slot ? normColor(slot[themeField]) : null;
  /* ④b 主题全局 hint（仅方向角色） */
  var F = (baseRole && slot) ? normColor(slot[FE.THEME_ROLE_FIELD[baseRole]]) : null;
  /* 内置默认兜底（可选） */
  var G = bSlot ? normColor(bSlot[themeField]) : null;
  var H = (baseRole && bSlot) ? normColor(bSlot[FE.THEME_ROLE_FIELD[baseRole]]) : null;

  var stateDetail = stateName || null;

  if (!baseRole) {
    return pick(
      FE.COLOR_SOURCES.LAYOUT_STATE, stateDetail, A,
      FE.COLOR_SOURCES.LAYOUT_KEY, 'colors.' + role, B,
      FE.COLOR_SOURCES.THEME_KEYTYPE, 'keyTypes.' + ktName + '.' + ktField, C,
      FE.COLOR_SOURCES.THEME_GLOBAL, themeField, E,
      FE.COLOR_SOURCES.BUILTIN, themeField, G
    ) || { value: null, source: null, detail: null };
  }

  /* 方向角色：完整六级（App 端 m00.i 的行为）
   * k30.dir = ① → ② → ③ → ③b → ④(该方向)
   * 若 k30.dir 为空 → k30.hint = ①(hint) → ②(hint) → ③b → ④b
   * 再 → ④(该方向) → ④b */
  var aH = stateObj ? stateObj[baseRole] : null;
  var AH = aH != null ? normColor(aH) : null;
  var bH = colors ? colors[baseRole] : null;
  var BH = bH != null ? normColor(bH) : null;

  return pick(
    FE.COLOR_SOURCES.LAYOUT_STATE, stateDetail, A,
    FE.COLOR_SOURCES.LAYOUT_KEY, 'colors.' + role, B,
    FE.COLOR_SOURCES.THEME_KEYTYPE, 'keyTypes.' + ktName + '.' + ktField, C,
    FE.COLOR_SOURCES.THEME_KEYTYPE_HINT, 'keyTypes.' + ktName + '.hint', D,
    FE.COLOR_SOURCES.THEME_GLOBAL, themeField, E,
    /* ---- 以下对应 k30.hint 与 theme 兜底，等价于 App 的实际顺序 ---- */
    FE.COLOR_SOURCES.LAYOUT_STATE, stateDetail, AH,
    FE.COLOR_SOURCES.LAYOUT_KEY, 'colors.' + baseRole, BH,
    FE.COLOR_SOURCES.THEME_KEYTYPE_HINT, 'keyTypes.' + ktName + '.hint', D,
    FE.COLOR_SOURCES.THEME_GLOBAL_HINT, FE.THEME_ROLE_FIELD[baseRole], F,
    FE.COLOR_SOURCES.BUILTIN, themeField, G,
    FE.COLOR_SOURCES.BUILTIN, FE.THEME_ROLE_FIELD[baseRole], H
  ) || { value: null, source: null, detail: null };
};

/* ---------------- 整键解析（预览与编辑面共用） ---------------- */

/* 解析一个按键的全部 10 个角色。
 * 返回 { roles: { 角色: {value, source, detail} }, state, textFromAccent }。
 *
 * textFromAccent：对照 v40.e()（v40.java:346-371）——修饰键激活/锁定时
 * 主文字色改用主题 accentColor（不是 keyTextColor）。预览必须建模这条。 */
FE.resolveKeyColors = function (eff, opts) {
  opts = opts || {};
  var out = { roles: {}, state: FE.currentKeyState(opts), textFromAccent: false };
  var spacer = !!(eff && eff.spacer);
  FE.COLOR_ROLES.forEach(function (role) {
    if (spacer) { out.roles[role] = { value: null, source: null, detail: null }; return; }
    out.roles[role] = FE.resolveRole(role, eff, opts);
  });
  /* 修饰键激活/锁定：文字色升级为 accentColor */
  if (!spacer && (opts.modifierActive || opts.modifierLocked) && !opts.pressed) {
    var slot = themeSlot(opts.slot);
    var acc = slot ? normColor(slot.accentColor) : null;
    if (acc == null && opts.includeBuiltin) {
      var bs = builtinSlot(opts.slot);
      acc = bs ? normColor(bs.accentColor) : null;
    }
    if (acc != null) {
      out.roles.text = { value: acc, source: FE.COLOR_SOURCES.THEME_GLOBAL, detail: 'accentColor' };
      out.textFromAccent = true;
    }
  }
  return out;
};

/* ---------------- 容器 / 非按键元素（对照 §3） ---------------- */

/* 解析主题 26 色里的任意字段（容器、候选栏、气泡、预编辑等）。
 * 返回 { value, source, detail }。 */
FE.resolveThemeField = function (field, opts) {
  opts = opts || {};
  var slot = themeSlot(opts.slot);
  var v = slot ? normColor(slot[field]) : null;
  if (v != null) return { value: v, source: FE.COLOR_SOURCES.THEME_GLOBAL, detail: field };
  var hd = FE.THEME_ROLE_FIELD[field];
  if (hd && slot) {
    var hv = normColor(slot[hd]);
    if (hv != null) return { value: hv, source: FE.COLOR_SOURCES.THEME_GLOBAL, detail: hd };
  }
  if (opts.includeBuiltin) {
    var bs = builtinSlot(opts.slot);
    var bv = bs ? normColor(bs[field]) : null;
    if (bv != null) return { value: bv, source: FE.COLOR_SOURCES.BUILTIN, detail: field };
  }
  return { value: null, source: null, detail: field };
};

/* 键盘容器底色：key_border_enabled 为真用 altKeyboardColor，否则 keyboardColor
 * （m00.f:748-750）。返回 { value, source, detail }。 */
FE.resolveKeyboardColor = function (borderEnabled, opts) {
  opts = opts || {};
  var field = (borderEnabled === false) ? 'keyboardColor' : 'altKeyboardColor';
  var r = FE.resolveThemeField(field, opts);
  if (r.value == null && borderEnabled !== false) {
    r = FE.resolveThemeField('keyboardColor', opts);
  }
  return r;
};

/* 候选栏/工具栏容器底色：key_border_enabled 为真 → 同键盘底色(altKeyboardColor)，
 * 否则 → candidateBarColor（m00.e:733-735）。 */
FE.resolveCandidateBarColor = function (borderEnabled, opts) {
  opts = opts || {};
  if (borderEnabled !== false) return FE.resolveKeyboardColor(true, opts);
  return FE.resolveThemeField('candidateBarColor', opts);
};

/* ---------------- 与预览共用的 CSS 转换 ---------------- */

/* Foxy #AARRGGBB → CSS #RRGGBBAA。优先复用 app.js 的实现。 */
FE.colorToCss = function (v) {
  if (typeof FE.foxyColorToCss === 'function') return FE.foxyColorToCss(v);
  if (typeof v !== 'string') return null;
  var m = v.trim().match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) return null;
  var hex = m[1];
  if (hex.length === 6) return '#' + hex;
  return '#' + hex.slice(2) + hex.slice(0, 2);
};

/* ---------------- 编辑面文案（三处颜色面共用） ---------------- */

/* 一行「当前生效」文案：有值显示色值与来源，无值说明将回落/未定义。
 * opts.includeBuiltin 为真时把 App 内置默认也算进来（编辑面用）。 */
FE.colorEffectText = function (role, eff, opts) {
  var r = FE.resolveRole(role, eff, opts);
  if (r.value == null) {
    return { value: null, text: '未定义（该键无任何一级给出此颜色 → Foxy 端不绘制）', source: null };
  }
  var from = FE.colorSourceLabel(r.source, r.detail);
  var own = (r.source === FE.COLOR_SOURCES.LAYOUT_KEY || r.source === FE.COLOR_SOURCES.LAYOUT_STATE);
  return {
    value: r.value,
    source: r.source,
    text: r.value + '　← ' + from + (own ? '（本键自己的设置）' : '（来自主题，改主题即同步）')
  };
};

})();
