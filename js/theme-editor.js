/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * theme-editor.js — 主题文件（foxy.keyboard-theme）编辑标签页 + 键盘预览实时联动
 *
 * 格式依据（不要照样本子集写）：
 *   主题 JSON 顶层 = type / name / light / dark；
 *   每个槽位（light、dark）= **26 个颜色字段** + `keyTypes`（3 类 × 10 字段）。
 *
 * ⚠️ 两处必须记住的口径：
 *   1) `light` / `dark` 是**两套独立配色槽位**，与预览右上角的深浅开关
 *      （`state.theme`，CSS 硬编码）**不是一回事** —— 样本 `春.json` 的 `dark`
 *      看上去是浅色系，正是因为槽位没有"深色外观"的语义绑定。
 *   2) 预览着色优先级（与直觉相反，**布局每键覆盖高于主题 keyTypes**）：
 *      ① 布局 colors.states.* > ② 布局每键 colors > ③ 主题 keyTypes[键类型]
 *      > ④ 主题 26 色全局默认。本文件只提供 ③④ 的取值；①② 仍由 app.js
 *      的 applyKeyColors 负责，它会把主题值当**兜底**垫在下面。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

/* ================================================================
 * 一、纯逻辑部分（Node 测试可直接使用）
 * ================================================================ */

/* 26 个颜色字段（顺序即导出顺序，取自 App 反编译核对结果，勿改序） */
FE.THEME_COLOR_FIELDS = [
  'keyboardColor', 'altKeyboardColor', 'candidateBarColor', 'keyTextColor',
  'keyHintTextColor', 'keyHintTextTopColor', 'keyHintTextBottomColor',
  'keyHintTextLeftColor', 'keyHintTextRightColor', 'keyBackgroundColor',
  'keyPressedColor', 'keyBorderColor', 'keyShadowColor', 'candidateTextColor',
  'candidateCommentColor', 'candidateBackgroundColor', 'candidatePressedColor',
  'candidateHighlightColor', 'toolTextColor', 'preeditTextColor',
  'preeditBackgroundColor', 'popupTextColor', 'popupBackgroundColor',
  'popupBorderColor', 'voiceWaveColor', 'accentColor'
];

/* keyTypes 的键名全集（大小写必须与枚举完全一致）。LETTER 常被漏掉，但它是
 * 字母键最常用的槽位，缺了它字母键就只能回落全局字段。 */
FE.THEME_KEY_TYPE_NAMES = ['LETTER', 'FUNCTION', 'ACTION'];

/* 每个 keyType 的 10 个字段（样本只写了 4 个，表单若也只做 4 个，
 * 用户编辑 border/shadow/hintXxx 时会被**静默丢弃**） */
FE.THEME_KEYTYPE_FIELDS = [
  'text', 'background', 'pressed', 'border', 'shadow',
  'hint', 'hintUp', 'hintDown', 'hintLeft', 'hintRight'
];

/* 颜色值解析宽容：接受 #RGB / #ARGB / #RRGGBB / #AARRGGBB（App 端同样宽容），
 * 其他长度视为无效。导出统一 #AARRGGBB。
 * ⚠️ **前导 `#` 是可选的** —— App 端 `uk.java:267` 是
 * `lu0.N(lu0.X(str), "#")`，即"去首尾空白后**无条件剥掉前导 #**"，
 * 所以 `"FFFFFF"` 与 `"#FFFFFF"` 在手机上都合法。
 * 编辑器早先强制要求 `#`，会把 App 能吃的值误报成非法。 */
FE.THEME_COLOR_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/* 颜色 → 规范 #AARRGGBB（非法返回 null）。#RGB 补成 #FFRRGGBB，
 * #ARGB 的 alpha 与各通道按位复制（与 CSS 简写展开规则一致）。
 * 省略 # 的写法同样接受（见上方 THEME_COLOR_RE 注释）。 */
FE.normalizeThemeColor = function (v) {
  if (typeof v !== 'string') return null;
  var m = v.trim().match(FE.THEME_COLOR_RE);
  if (!m) return null;
  var h = m[1].toUpperCase();
  function dup(s) { return s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); }
  if (h.length === 3) return '#FF' + dup(h);
  if (h.length === 4) return '#' + h.charAt(0) + h.charAt(0) + dup(h.slice(1));
  if (h.length === 6) return '#FF' + h;
  return '#' + h;
};

/* 该字段是否是「4 个方向提示色」之一（缺省时回落 keyHintTextColor） */
FE.themeIsHintDirField = function (name) {
  return ['keyHintTextTopColor', 'keyHintTextBottomColor', 'keyHintTextLeftColor', 'keyHintTextRightColor']
    .indexOf(name) >= 0;
};

/* 一、内置默认主题色（App 内置，用作「新建主题」初值）
 * 槽为空时 App 回退内置默认主题，把内置默认当模板，编辑器预览才与手机一致。
 * ⚠️ 四个方向提示色在内置默认里是 **null**（继承 keyHintTextColor），
 * 新建时同样**留空**，不要填死值。 */
var BUILTIN_DARK = {
  keyboardColor: '#FF2D2D2D', altKeyboardColor: '#FF333333', candidateBarColor: '#FF373737',
  keyTextColor: '#FFFAFAFA', keyHintTextColor: '#FFB8B8B8',
  keyBackgroundColor: '#FF464646', keyPressedColor: '#33FFFFFF', keyBorderColor: '#1FFFFFFF',
  keyShadowColor: '#FF252525', candidateTextColor: '#FFFAFAFA', candidateCommentColor: '#FFACACAC',
  candidateBackgroundColor: '#FF373737', candidatePressedColor: '#33FFFFFF',
  candidateHighlightColor: '#FF3D4A6B', toolTextColor: '#FFFAFAFA', preeditTextColor: '#FFFAFAFA',
  preeditBackgroundColor: '#CC2D2D2D', popupTextColor: '#FFFAFAFA', popupBackgroundColor: '#FF373737',
  popupBorderColor: '#FF505050', voiceWaveColor: '#FF5E97F6', accentColor: '#FF5E97F6'
};
var BUILTIN_LIGHT = {
  keyboardColor: '#FFFAFAFA', altKeyboardColor: '#FFEEEEEE', candidateBarColor: '#FFEEEEEE',
  keyTextColor: '#FF212121', keyHintTextColor: '#FF808080',
  keyBackgroundColor: '#FFFFFFFF', keyPressedColor: '#1F000000', keyBorderColor: '#1F000000',
  keyShadowColor: '#FFC2C2C2', candidateTextColor: '#FF212121', candidateCommentColor: '#FF6E6E6E',
  candidateBackgroundColor: '#FFEEEEEE', candidatePressedColor: '#1F000000',
  candidateHighlightColor: '#FFD2E3FC', toolTextColor: '#FF212121', preeditTextColor: '#FF212121',
  preeditBackgroundColor: '#CCFFFFFF', popupTextColor: '#FF212121', popupBackgroundColor: '#FFEEEEEE',
  popupBorderColor: '#FFD0D0D0', voiceWaveColor: '#FF4285F4', accentColor: '#FF4285F4'
};
/* 内置默认的 keyTypes 只给 FUNCTION / ACTION（LETTER 走回落链到全局字段）。
 *
 * ⚠️ 取值**必须是 App 内置默认的真实值**，不能凭观感补全 —— 它们是「新建主题」的初值，
 * 也是「未导入主题」时预览 keyTypes 级的兜底，写错就直接表现为预览与手机不一致。
 *
 * 来源：`xw0.java:159`（dark）/ `xw0.java:190`（light）里 `u40` 的构造参数直接解码
 * （`u40` 合成构造器 `u40.java:17-19` 的位掩码给的是**字段下标**：
 *  bit0→a(text) / bit1→b(background) / bit2→c(pressed) / bit5→f(hint)，
 *  置位即该字段为 null = **继承**该槽位的全局色）。
 * 即 App 内置只显式给了下表这些字段，**其余一律 null（继承）** ——
 * 所以这里也**不能**自行填 text/border/shadow：虽然当前取值恰好与继承值相同，
 * 但一旦内置默认色调整，多写的值就会与手机分叉。 */
var BUILTIN_KEYTYPES = {
  dark: {
    FUNCTION: { background: '#FF373737', pressed: '#33FFFFFF', hint: '#FFB8B8B8' },
    ACTION: { text: '#FFFFFFFF', background: '#FF5E97F6', pressed: '#FF4A85E4', hint: '#B3FFFFFF' }
  },
  light: {
    FUNCTION: { background: '#FFE1E1E1', pressed: '#1F000000', hint: '#FF808080' },
    ACTION: { text: '#FFFFFFFF', background: '#FF4285F4', pressed: '#FF3B78E7', hint: '#B3FFFFFF' }
  }
};

/* 内置默认的某个槽位（深拷贝，避免调用方改到常量） */
FE.themeBuiltinSlot = function (slot) {
  var base = slot === 'dark' ? BUILTIN_DARK : BUILTIN_LIGHT;
  var out = {};
  FE.THEME_COLOR_FIELDS.forEach(function (f) {
    /* 方向提示色显式留空（null）——内置默认就是 null，表示继承 keyHintTextColor */
    if (FE.themeIsHintDirField(f)) out[f] = null;
    else if (base[f] != null) out[f] = base[f];
    else out[f] = null;
  });
  var kt = BUILTIN_KEYTYPES[slot === 'dark' ? 'dark' : 'light'];
  if (kt) {
    out.keyTypes = {};
    Object.keys(kt).forEach(function (g) {
      var g2 = {};
      FE.THEME_KEYTYPE_FIELDS.forEach(function (f) {
        if (kt[g][f] != null) g2[f] = kt[g][f];
        else if (f === 'hint') g2[f] = out.keyHintTextColor;
      });
      out.keyTypes[g] = g2;
    });
  }
  return out;
};

/* 新建主题的初值：内置默认色 + 空 name（由用户填） */
FE.themeNewProfile = function () {
  return {
    type: 'foxy.keyboard-theme',
    name: '',
    light: FE.themeBuiltinSlot('light'),
    dark: FE.themeBuiltinSlot('dark')
  };
};

/* 主题名 → 文件名（基线 §1.1.1，App 端 `uk.java:230-252` 的逐字对应实现）。
 *
 * 规则：
 *   1. 先对 name 去首尾空白（`lu0.X`）；
 *   2. 结果**全为空白** → 文件名兜底 `theme`（`lu0.I` 全空白判定）；
 *   3. 逐字符转义——`%` `\` `/` `:` `*` `?` `"` `<` `>` `|` 与所有
 *      **码位 < 0x20 的控制字符** → `%` + **4 位十六进制**（左侧补 0）；
 *   4. 追加 `.json`。
 *
 * ⚠️ 十六进制是**小写**：App 端是 `Integer.toString(charAt, 16)`
 * （`uk.smali` 的 `h()` 内 `invoke-static {v2, v3}, Ljava/lang/Integer;->toString(II)`，
 * v3=0x10）+ `lu0.L(4, …)` 只负责左补 '0'（`lu0.java:186-212`），
 * 全程**没有** `toUpperCase`（该方法的 smali 里 grep 不到）。
 * Java 的 `Integer.toString(n, 16)` 产出小写，故 `name="a/b"` → `a%002fb.json`。
 * （基线 §1.1.1 写作"大写"、例子给 `%002F`，与反编译源码不符；此处以源码为准。）
 *
 * ⚠️ 为什么必须照这条实现、不能自己另发明一套（如把 `/` 换成 `_`）：
 * 文件名与主题名**不同源**的话，用户把文件放进 `frontend/themes/` 后，
 * App 按 `name` 反推文件名去扫描，就会找不到这份主题 —— 表现为"设置了却不生效"。
 * 例：`name = "a/b"` → 文件名 `a%002Fb.json`。
 *
 * 注意：编辑器**不阻止**用户在 name 里用这些字符（App 也不阻止），
 * 只是导出时按同一条规则算出文件名，并在界面上把结果告诉用户。 */
FE.themeFileNameFor = function (name) {
  var s = (name == null ? '' : String(name));
  /* 与 App `lu0.X` 同口径：去首尾空白。用 trim 覆盖 Unicode 空白即可
   * （App 的 oy0.G 判 Character.isWhitespace，二者对本场景等价）。 */
  var t = s.trim();
  /* 全为空白（含空串）→ 兜底 "theme" */
  if (t === '') t = 'theme';
  var out = '';
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i);
    var code = t.charCodeAt(i);
    if (ch === '%' || ch === '\\' || ch === '/' || ch === ':' || ch === '*' ||
      ch === '?' || ch === '"' || ch === '<' || ch === '>' || ch === '|' || code < 0x20) {
      out += '%' + code.toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out + '.json';
};

/* ---------------- 归一化 ----------------
 * 容错但不"补造"：
 *   · 槽位 / keyTypes 不是对象时补成 {}（否则后续读取会抛）；
 *   · 合法颜色值规范成 #AARRGGBB；**非法值原样保留**，交给校验器如实报出
 *     （归一化若静默丢掉非法值，用户就再也看不到自己哪写错了）；
 *   · 未知字段一律保留（App 会忽略，但那是用户的数据）；
 *   · **不补 type**：缺失必须能被校验器看见，补上就等于掩盖了"App 不会扫描"这个硬问题。 */
FE.normalizeThemeProfile = function (p) {
  if (!FE.isPlainObject(p)) p = {};
  if (p.name != null && typeof p.name !== 'string') p.name = String(p.name);
  ['light', 'dark'].forEach(function (slot) {
    if (p[slot] == null) return;
    if (!FE.isPlainObject(p[slot])) { p[slot] = {}; return; }
    normalizeColorMap(p[slot], FE.THEME_COLOR_FIELDS);
    if (FE.isPlainObject(p[slot].keyTypes)) {
      Object.keys(p[slot].keyTypes).forEach(function (kt) {
        if (!FE.isPlainObject(p[slot].keyTypes[kt])) p[slot].keyTypes[kt] = {};
        else normalizeColorMap(p[slot].keyTypes[kt], FE.THEME_KEYTYPE_FIELDS);
      });
    } else if (p[slot].keyTypes != null) {
      p[slot].keyTypes = {};
    }
  });
  /* 顶层 keyTypes 也接受（样本把 keyTypes 放在槽位里，但宽容读入更稳） */
  if (FE.isPlainObject(p.keyTypes)) {
    Object.keys(p.keyTypes).forEach(function (kt) {
      if (!FE.isPlainObject(p.keyTypes[kt])) p.keyTypes[kt] = {};
      else normalizeColorMap(p.keyTypes[kt], FE.THEME_KEYTYPE_FIELDS);
    });
  } else if (p.keyTypes != null) {
    p.keyTypes = {};
  }
  return p;
};

function normalizeColorMap(map, known) {
  if (!FE.isPlainObject(map)) return;
  known.forEach(function (f) {
    if (map[f] == null) return;
    var n = FE.normalizeThemeColor(map[f]);
    if (n) map[f] = n;   /* 非法值原样留着，让校验器报 */
  });
}

/* ---------------- 校验 ----------------
 * **只断能确证的事**（宁可少报，不要乱报），判 err 的唯一标准是
 * 「App 端会不会因此整份主题不生效」（`uk.a` 里解析失败的主题会被静默跳过）：
 *   err —— type 不对（`uk.c:93` 直接返回 null）、**name 全空白**（`uk.e:159-162`
 *          判无效）、**槽位缺失**（`uk.c:100/104` 的 getJSONObject 抛异常）、
 *          槽位/keyTypes 不是对象、颜色值非法；
 *   warn —— 槽位没给任何颜色字段（这层才回落内置默认）、keyTypes 缺分组 /
 *          缺字段 / 含未识别键名。
 * 拿不准的一律 warn，别急着 err —— 一个 err 会让整份主题被判为不可用。 */
FE.validateThemeProfile = function (p) {
  var errors = [], warnings = [];
  function err(m) { errors.push(m); }
  function warn(m) { warnings.push(m); }
  if (!FE.isPlainObject(p)) { err('主题不是 JSON 对象'); return { errors: errors, warnings: warnings }; }

  if (p.type == null) {
    err('type 缺失，必须为 "foxy.keyboard-theme"（App 只扫描 type 相符的 .json）');
  } else if (p.type !== 'foxy.keyboard-theme') {
    err('type 必须为 "foxy.keyboard-theme"，当前为 ' + JSON.stringify(p.type));
  }
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    /* ⚠️ 是 **err** 不是 warn：App 端 `uk.java:97-99` 取 name 去空白后，
     * `uk.e()` 在 :159-162 用 `lu0.I(名字)` 判"是否全为空白"，全空白（含空串）
     * 直接返回 **null** = 整份主题**无效**；再叠加扫描条件要求 name 非空
     * （`uk.java:25-39`），空 name 的主题在手机上根本不生效。
     * 基线 §1.1.1 也明确"编辑器应把空 name 判为错误"。 */
    err('name 缺失或为空 —— App 的扫描条件要求 name 去空白后非空（空 name 的主题不会被加载），' +
      '且文件名 = name 转义 + .json');
  }

  ['light', 'dark'].forEach(function (slot) {
    var s = p[slot];
    if (s == null) {
      /* ⚠️ 是 **err** 不是 warn：App 用 `getJSONObject("light"/"dark")`
       * （`uk.java:100` / `:104`）—— **键缺失会抛异常**，被 `uk.e()` 的 catch
       * 吞掉后返回 null = 整份主题**失效**。它**不会**回退内置默认主题
       * （回退内置只发生在"字段缺"和"槽位对象为空"这两层，见 `uk.d`）。 */
      err(slot + ' 槽位缺失 —— App 用 getJSONObject 读取，缺键会抛异常导致整份主题失效（不会回退内置默认）');
      return;
    }
    if (!FE.isPlainObject(s)) { err(slot + ' 必须是对象'); return; }
    /* 槽位对象**存在但没给任何颜色字段** → 这一层才是真正回落内置默认
     * （`uk.d` 以 `xw0.i()/e()` 为基逐字段合并，见 themeSlotColors）。*/
    var filled = FE.THEME_COLOR_FIELDS.filter(function (f) { return s[f] != null; });
    if (!filled.length) {
      warn(slot + ' 槽位没有给出任何颜色字段 —— 该槽位的 26 色会全部采用 App 内置默认主题的取值');
    }
    checkColorMap(s, slot, err, warn, false);
    checkKeyTypes(s.keyTypes, slot + '.keyTypes', err, warn);
  });
  if (p.keyTypes != null) {
    /* ⚠️ 顶层 keyTypes **App 完全不读** —— `uk.d` 只在**槽位对象**上取 keyTypes
     * （`uk.java:112`，入参来自 `uk.c:100/104` 的 getJSONObject("light"/"dark")）。
     * 所以放在顶层等于白写：手机上不生效。编辑器把它保留在文件里（是用户数据），
     * 但要明确提示它无效，别让用户以为配上了。 */
    warn('顶层 keyTypes **不会被 App 读取**（App 只在 light / dark 槽位内读 keyTypes）' +
      '—— 该配置在手机上不生效，请移到对应槽位里');
    checkKeyTypes(p.keyTypes, 'keyTypes', err, warn);
  }
  return { errors: errors, warnings: warnings };
};

function checkColorMap(map, where, err, warn, isKeyType) {
  if (!FE.isPlainObject(map)) return;
  var known = isKeyType ? FE.THEME_KEYTYPE_FIELDS : FE.THEME_COLOR_FIELDS;
  Object.keys(map).forEach(function (k) {
    if (k === 'keyTypes') return;
    if (known.indexOf(k) < 0) {
      warn(where + ' 含未识别字段 “' + k + '”（App 会忽略）');
      return;
    }
    var v = map[k];
    if (v == null) return;    /* 空 = 继承 / 回落，合法 */
    if (typeof v !== 'string' || !FE.THEME_COLOR_RE.test(v.trim())) {
      err(where + '.' + k + ' 颜色值非法：' + JSON.stringify(v) +
        '（应为 #RGB / #ARGB / #RRGGBB / #AARRGGBB）');
    }
  });
}

function checkKeyTypes(kt, where, err, warn) {
  if (kt == null) return;
  if (!FE.isPlainObject(kt)) { err(where + ' 必须是对象'); return; }
  Object.keys(kt).forEach(function (g) {
    if (FE.THEME_KEY_TYPE_NAMES.indexOf(g) < 0) {
      warn(where + ' 含未识别的键类型 “' + g + '”（仅 LETTER / FUNCTION / ACTION 有效，App 会忽略）');
    }
    var grp = kt[g];
    if (!FE.isPlainObject(grp)) { err(where + '.' + g + ' 必须是对象'); return; }
    checkColorMap(grp, where + '.' + g, err, warn, true);
    var missing = FE.THEME_KEYTYPE_FIELDS.filter(function (f) { return grp[f] == null; });
    if (missing.length) {
      warn(where + '.' + g + ' 缺 ' + missing.length + ' 个字段（' + missing.join('、') +
        '）—— 缺省时回落该槽位的全局颜色字段');
    }
  });
  FE.THEME_KEY_TYPE_NAMES.forEach(function (g) {
    if (kt[g] == null) {
      /* ⚠️ 措辞必须准确：分组**整体缺失**时，App 保留的是**内置默认的同名分组**，
       * 而**不是**回落全局 26 色 —— `uk.java:133-137` 把用户给的分组 putAll 到
       * "内置默认 keyTypes"的副本上，没写的分组仍是内置分组。
       * 只有**分组存在但其字段为 null** 时，该字段才回落全局 26 色（`uk.java:121`）。 */
      warn(where + ' 缺 ' + g + ' 分组 —— 该类按键将采用 App 内置默认主题的 ' + g + ' 配色');
    }
  });
}

/* ---------------- 序列化 ----------------
 * 固定顺序（type 在前），颜色按 26 字段的权威顺序输出，keyTypes 按
 * LETTER/FUNCTION/ACTION 输出，槽位内的 keyTypes 排在 26 色之后。
 * 未知字段一律保留在末尾 —— 那是用户的数据，编辑器不该吃掉。 */
FE.serializeThemeProfile = function (p) {
  var src = FE.isPlainObject(p) ? p : {};
  var out = {};
  out.type = src.type != null ? src.type : 'foxy.keyboard-theme';
  if (src.name != null) out.name = src.name;
  if (src.author != null) out.author = src.author;
  ['light', 'dark'].forEach(function (slot) {
    if (src[slot] == null) return;
    var s = src[slot];
    var o = {};
    FE.THEME_COLOR_FIELDS.forEach(function (f) {
      if (s[f] !== undefined) o[f] = s[f];
    });
    if (s.keyTypes != null) o.keyTypes = orderKeyTypes(s.keyTypes);
    /* 槽位内 26 色与 keyTypes 之外的字段（含未知字段）原样附后 */
    Object.keys(s).forEach(function (k) {
      if (k === 'keyTypes' || FE.THEME_COLOR_FIELDS.indexOf(k) >= 0) return;
      o[k] = s[k];
    });
    out[slot] = o;
  });
  if (src.keyTypes != null) out.keyTypes = orderKeyTypes(src.keyTypes);
  Object.keys(src).forEach(function (k) {
    if (k === 'type' || k === 'name' || k === 'author' || k === 'light' || k === 'dark' || k === 'keyTypes') return;
    if (out[k] === undefined) out[k] = src[k];
  });
  return JSON.stringify(out, null, 2);
};

function orderKeyTypes(kt) {
  if (!FE.isPlainObject(kt)) return kt;
  var o = {};
  FE.THEME_KEY_TYPE_NAMES.forEach(function (g) { if (kt[g] !== undefined) o[g] = kt[g]; });
  Object.keys(kt).forEach(function (g) {
    if (FE.THEME_KEY_TYPE_NAMES.indexOf(g) < 0) o[g] = kt[g];
  });
  return o;
}

/* ================================================================
 * 二、预览取值（供 app.js 的 applyKeyColors / renderPreview 兜底调用）
 *
 * 返回的都是**原始 ARGB 字符串**（不转 CSS）—— 因为 foxyColorToCss 定义在
 * app.js 的 UI 段，纯逻辑段拿不到；转换一律由调用方做。
 * ================================================================ */

/* 当前生效的配色槽位对象。**未导入主题时回退 App 内置默认主题** ——
 * 这是「预览默认用 App 内置主题的深浅色，而不是编辑器自己那套预置色」的落点
 * （用户明确要求；App 端行为本就如此：槽位为空即用内置默认，xw0.java:158-160/189-191）。
 *
 * 为什么在这里回退、而不是在各调用点分别兜底：本函数是**预览侧**的槽位唯一入口
 * （只被 themeKeyColors / themeKeyboardColor 使用），回退一次，键面/提示/容器/
 * keyTypes/阴影/边框就全部自动拿到内置默认色，不必在每个分支重复判断。
 *
 * ⚠️ 与 color-source.js 的 `themeSlot()` 分工不同：那个返回 null 表示"**没有主题**"
 * （供「未导入主题」的 UI 提示、校验等语义判断用），**不要**给它也加内置回退 ——
 * 否则界面再也说不清"当前到底有没有导入主题"。 */
FE.themeSlotColors = function (slot) {
  var st = FE.state || {};
  var p = st.themeProfile;
  slot = slot || st.themeSlot || 'light';
  if (slot !== 'dark') slot = 'light';
  var builtin = FE.themeBuiltinSlot(slot);
  if (!FE.isPlainObject(p) || !FE.isPlainObject(p[slot])) return builtin;
  var s = p[slot];
  /* ⭐ **逐字段**与内置默认合并（`uk.java:142-149`）——不是"有主题就整块用主题"。
   *
   * App 的解析是：以内置默认主题为基（`xw0.i()` / `xw0.e()`），对 26 个字段逐个
   * 判断"JSON 里有没有这个键且非 null"，有就用它、**没有就保留内置默认值**
   * （非法值解析失败也保留内置默认，`uk.java:145-148`）。
   *
   * 为什么必须照做：用户写一份只给了几个字段的主题（如只改键盘底色），
   * 手机上其余字段仍是**内置默认色**，而编辑器若直接返回用户那份稀疏对象，
   * 缺失字段就落到编辑器自己的 CSS 兜底色 —— 预览与手机明显不同，
   * 用户会以为"漏了字段就变透明/变默认灰"。 */
  var out = {};
  FE.THEME_COLOR_FIELDS.forEach(function (f) {
    var n = FE.normalizeThemeColor(s[f]);
    out[f] = (s[f] != null && n) ? n : builtin[f];
  });
  /* keyTypes：**分组级替换**再由内置补缺（`uk.java:121-137`）。
   *
   * App 对每个键类型分组都是**整组重建**一个 `u40`（`uk.java:121` 一次 new u40），
   * 再 `putAll` 到"内置默认 keyTypes"的副本上（`:133-137`）——所以：
   *   · 某分组**整体缺失**（如只写了 FUNCTION）→ 该分组仍是**内置分组**
   *     （ACTION 键在手机上显示内置蓝，不是全局 26 色的背景）；
   *   · 分组**存在但字段缺**（如 FUNCTION 只给 background）→ 该字段为 null，
   *     走 §1.4 的回落链到**全局 26 色**，而**不是**继承内置同组的值。
   * 这两种情形必须分开处理 —— 早先一律回落全局 26 色，ACTION 键的预览色就是错的。 */
  var kt = {};
  var bkt = FE.isPlainObject(builtin.keyTypes) ? builtin.keyTypes : {};
  Object.keys(bkt).forEach(function (g) { kt[g] = bkt[g]; });
  if (FE.isPlainObject(s.keyTypes)) {
    Object.keys(s.keyTypes).forEach(function (g) {
      if (!FE.isPlainObject(s.keyTypes[g])) return;
      var g2 = {};
      FE.THEME_KEYTYPE_FIELDS.forEach(function (f) {
        if (s.keyTypes[g][f] != null) g2[f] = s.keyTypes[g][f];
      });
      kt[g] = g2;
    });
  }
  out.keyTypes = kt;
  return out;
};

/* 键类型 → 该按键的**主题兜底基色**（映射见基线 §1.4）。
 * 返回 { text, background, pressed, border, shadow, hint, hintUp, hintDown,
 *        hintLeft, hintRight }，值均为归一化后的 #AARRGGBB 或 null（未给出）。
 * 解析顺序：全局 26 色 → 该槽位的 keyTypes[键类型] 覆盖（keyTypes 更高）。
 * `keyType` 为 null（未指定）时按 LETTER 处理。 */
FE.themeKeyColors = function (keyType) {
  var slotObj = FE.themeSlotColors();
  if (!slotObj) return null;
  var g = function (f) {
    var v = slotObj[f];
    return FE.normalizeThemeColor(v);   /* 非法 → null，调用方跳过写样式 */
  };
  var out = {
    text: g('keyTextColor'),
    background: g('keyBackgroundColor'),
    pressed: g('keyPressedColor'),
    border: g('keyBorderColor'),
    shadow: g('keyShadowColor'),
    hint: g('keyHintTextColor'),
    hintUp: g('keyHintTextTopColor'),
    hintDown: g('keyHintTextBottomColor'),
    hintLeft: g('keyHintTextLeftColor'),
    hintRight: g('keyHintTextRightColor')
  };
  var slotHint = out.hint;
  var slotDir = {
    hintUp: g('keyHintTextTopColor'), hintDown: g('keyHintTextBottomColor'),
    hintLeft: g('keyHintTextLeftColor'), hintRight: g('keyHintTextRightColor')
  };
  /* ⚠️ keyTypes **只取槽位内的** —— App `uk.d:112` 是在槽位对象上 `optJSONObject("keyTypes")`，
   * 顶层 keyTypes 根本读不到（color-source.js 的 themeKeyTypeGroup 已同步去掉那条回落）。
   * 早先这里还回落 `themeProfile.keyTypes`，会让预览显示手机上不会出现的颜色。 */
  var kt = FE.isPlainObject(slotObj.keyTypes) ? slotObj.keyTypes : null;
  var grp = (kt && FE.isPlainObject(kt[String(keyType || 'LETTER')])) ? kt[String(keyType || 'LETTER')] : null;
  if (grp) {
    FE.THEME_KEYTYPE_FIELDS.forEach(function (f) {
      var n = FE.normalizeThemeColor(grp[f]);
      if (n) out[f] = n;
    });
  }
  /* 方向提示色的回落链（对齐 App 端 `m00.java:265-291`，**逐层**）：
   *   keyTypes[方向] → keyTypes.hint → 槽位[方向] → 槽位.hint
   * ⚠️ 注意 `keyTypes.hint` **优先于**「槽位自己的方向色」—— 这条最反直觉，
   * 也正是「只做单层回落」会做错的地方（曾经的实现把槽位方向色排在 keyTypes.hint 之前）。 */
  var ktHint = grp ? FE.normalizeThemeColor(grp.hint) : null;
  ['hintUp', 'hintDown', 'hintLeft', 'hintRight'].forEach(function (d) {
    var ktDir = grp ? FE.normalizeThemeColor(grp[d]) : null;
    out[d] = ktDir || ktHint || slotDir[d] || slotHint;
  });
  return out;
};

/* 键盘容器底色：`key_border_enabled` 为真用 altKeyboardColor，否则回落
 * keyboardColor（基线 §1.4）。返回原始 ARGB 或 null。 */
FE.themeKeyboardColor = function (borderEnabled) {
  var slotObj = FE.themeSlotColors();
  if (!slotObj) return null;
  var v = borderEnabled === false ? slotObj.keyboardColor : (slotObj.altKeyboardColor || slotObj.keyboardColor);
  return FE.normalizeThemeColor(v);
};

/* ================================================================
 * 三、UI 部分
 * ================================================================ */
if (typeof document === 'undefined' || typeof window === 'undefined' ||
    !document.getElementById('th-colors')) {
  return;
}
var state = FE.state;
var h = FE.h, clearEl = FE.clearEl, $ = FE.$;

/* 字段名的中文注释（只为可读性；字段名本身以基线为准，不做本地化改名） */
var FIELD_DOC = {
  keyboardColor: '键盘总背景',
  altKeyboardColor: '启用键边框时的替代底色（key_border_enabled=true 用它）',
  candidateBarColor: '候选栏 / 工具栏容器底色',
  keyTextColor: '按键主文字（默认）',
  keyHintTextColor: '按键提示文字（默认）',
  keyHintTextTopColor: '上滑提示色（空 = 继承 keyHintTextColor）',
  keyHintTextBottomColor: '下滑提示色（空 = 继承）',
  keyHintTextLeftColor: '左滑提示色（空 = 继承）',
  keyHintTextRightColor: '右滑提示色（空 = 继承）',
  keyBackgroundColor: '按键背景（默认）',
  keyPressedColor: '按键按下色（默认）',
  keyBorderColor: '按键边框色（默认）',
  keyShadowColor: '按键阴影色（默认）',
  candidateTextColor: '候选字文字',
  candidateCommentColor: '候选注释文字',
  candidateBackgroundColor: '候选背景',
  candidatePressedColor: '候选按下',
  candidateHighlightColor: '候选高亮',
  toolTextColor: '工具栏图标与文字（未选中）',
  preeditTextColor: '预编辑文字',
  preeditBackgroundColor: '预编辑背景',
  popupTextColor: '按键弹出浮层文字',
  popupBackgroundColor: '按键弹出浮层背景',
  popupBorderColor: '弹出浮层边框（App 端未见消费点）',
  voiceWaveColor: '语音波形色',
  accentColor: '强调色（工具栏选中态）'
};
var KEYTYPE_FIELD_DOC = {
  text: '文字', background: '背景', pressed: '按下', border: '边框', shadow: '阴影',
  hint: '提示文字', hintUp: '上滑提示', hintDown: '下滑提示',
  hintLeft: '左滑提示', hintRight: '右滑提示'
};

/* ---------------- 编辑手势的历史分组 ----------------
 * 取色面板拖动会连发几十次 onInput：每次都 FE.mutate 会塞满撤销栈（且拖动中
 * 重建表单会把正在拖的面板拆掉）。所以：
 *   · 手势开始（首次改动）记一次快照；
 *   · 手势中只改 state + 重画预览（不重建表单、不写历史）；
 *   · 手势结束（面板关闭 / 输入提交）才把快照压进撤销栈并自动存草稿。 */
var gestureSnapshot = null;
function beginGesture() {
  if (gestureSnapshot == null && FE.snapshotState) gestureSnapshot = FE.snapshotState();
}
function endGesture() {
  if (gestureSnapshot == null) return;
  var snap = gestureSnapshot;
  gestureSnapshot = null;
  if (FE.pushHistorySnapshot) FE.pushHistorySnapshot(snap);
  if (FE.afterChange) FE.afterChange();
}
/* 只重画预览（不重建表单）：拖动取色时用，避免拆掉正在用的 jscolor 面板 */
function refreshPreviewOnly() {
  if (FE.renderPreviewOnly) FE.renderPreviewOnly();
  renderThemeJson();
}

/* ---------------- 主题访问与变更 ---------------- */
function tp() { return state.themeProfile; }

/* 把 state.themeProfile 换成一个可写的归一化对象（未导入时按内置默认新建）。
 * 仅用于「用户明确开始编辑」的入口，避免只是渲染就把 null 变成对象。 */
function ensureTheme() {
  if (!FE.isPlainObject(state.themeProfile)) {
    state.themeProfile = FE.normalizeThemeProfile(FE.themeNewProfile());
  }
  return state.themeProfile;
}
function slotObj(slot) {
  var p = ensureTheme();
  slot = slot || state.themeSlot || 'light';
  if (!FE.isPlainObject(p[slot])) p[slot] = {};
  return p[slot];
}

function setThemeStatus(msg, kind) {
  var el = $('th-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}
function setThemeJsonStatus(msg, kind) {
  var el = $('th-json-status');
  if (!el) return;
  clearEl(el);
  el.className = 'status ' + (kind || '');
  el.append(msg || '');
}

/* ---------------- 单个颜色行（取色 + 清除） ----------------
 * 与按键对话框的 colorRow 同款语义，但额外接手势分组与"只重画预览"。
 *
 * ⚠️ 提交必须**幂等**：同一个值会被两条路径分别送达 ——
 *   1) FE.installJscolor 在输入框上自挂一个 change 监听，回调里依次 emitInput
 *      与 emitDone（所以值先经 onInput 到达，又经 onDone 到达一次）；
 *   2) 本函数自己也在输入框上挂 change，处理手输。
 * 若两条路径都当真提交，一次手输就会压两条历史（实测：期望 4 条实际 5 条）。
 * 因此 apply() 先比 committed，值没变就是空操作。 */
function colorRow(labelText, titleText, get, set) {
  var cur = get();
  var inp = h('input', {
    type: 'text', class: 'mini-input color-input', spellcheck: 'false',
    value: cur != null ? String(cur) : '',
    placeholder: '取色 / #RRGGBB',
    'data-jscolor': '{}'
  });
  var committed = cur != null ? String(cur) : '';
  /* 唯一的提交入口。**幂等**是这里的关键：同一个值会被两条路径送达 ——
   *   1) FE.installJscolor 在输入框上自挂 change 监听，回调里依次发 onInput 与
   *      onDone（所以值先经 onInput 到一次，再经 onDone 到一次）；
   *   2) 本函数自己也在输入框上挂 change 处理手输，jscolor 那个先注册、所以先跑。
   * 若两条都当真提交，一次手输就压两条历史（实测：期望 4 条实际 5 条）。
   * 因此先比 committed：值没变就是空操作，调用方据此决定要不要 endGesture。 */
  function apply(nv) {
    var key = nv == null ? '' : String(nv);
    if (key === committed) return false;
    beginGesture();
    committed = key;
    set(nv);
    refreshPreviewOnly();
    return true;
  }
  if (FE.installJscolor) {
    FE.installJscolor(inp, {
      /* 面板拖动实时回调：先写 state，再只重画预览 */
      onInput: function (nv) { if (nv != null) apply(nv); },
      onDone: function (nv) {
        if (nv != null) apply(nv);
        endGesture();
      }
    });
  }
  inp.addEventListener('change', function () {
    var raw = inp.value.trim();
    if (raw === '') { if (apply(null)) endGesture(); return; }
    var n = FE.normalizeThemeColor(raw);
    if (n == null) {
      /* 非法：提示并回退到上次提交值（不写进 state） */
      if (FE.uiAlert) FE.uiAlert('颜色格式无效，应为 #RGB / #ARGB / #RRGGBB / #AARRGGBB');
      inp.value = committed;
      return;
    }
    inp.value = n;
    /* 值若已由 jscolor 的 change 提交过，apply 返回 false → 不再补一次历史 */
    if (apply(n)) endGesture();
  });
  var clearBtn = h('button', {
    type: 'button', class: 'mini-button',
    title: '清除此颜色（恢复继承 / 回落）',
    onclick: function () {
      inp.value = '';
      try { if (inp.jscolor && typeof inp.jscolor.hide === 'function') inp.jscolor.hide(); } catch (e) { /* 忽略 */ }
      if (apply(null)) endGesture();
    }
  }, '清除');
  /* 中文提示**可见地**显示在行里（英文名 + 中文提示并列），而不是只塞进 title
   * 当 tooltip —— 界面只看得见英文名时，26 个字段名根本没法认。
   *   · 英文（code）是**写进 JSON 的字段名**，必须保留、不能本地化改名；
   *   · 中文（span）是给人看的说明；原 FIELD_DOC 文案里的括号补充留在 title，
   *     行内只取括号前的主干，避免把 .th-color-grid 的 240px 列撑破；
   *   · 覆盖 .mini-label 的 nowrap 并允许换行：窄屏（≤640px）单列时中文换到
   *     下一行，不会溢出网格。 */
  var docShort = titleText ? String(titleText).split('（')[0] : '';
  var label = h('label', {
    class: 'mini-label th-field-label',
    style: { 'white-space': 'normal', 'flex-wrap': 'wrap', 'overflow-wrap': 'anywhere' },
    title: (labelText + (titleText ? ' — ' + titleText : '')),
  }, h('code', null, labelText), docShort ? h('span', {
    class: 'th-field-doc',
    style: { 'font-size': '11px', color: 'var(--text-dim)', opacity: '.8' }
  }, docShort) : null);
  return h('div', { class: 'form-row form-inline' }, label, inp, clearBtn);
}

/* 取某槽位某字段的读写器；null 表示"该字段留空（继承/回落）" */
function slotGetSet(field) {
  return [
    function () { return slotObj()[field]; },
    function (nv) {
      var s = slotObj();
      if (nv == null) delete s[field];
      else s[field] = nv;
    }
  ];
}
function keyTypeGetSet(group, field) {
  return [
    function () {
      var s = slotObj();
      if (!FE.isPlainObject(s.keyTypes) || !FE.isPlainObject(s.keyTypes[group])) return null;
      return s.keyTypes[group][field];
    },
    function (nv) {
      var s = slotObj();
      if (!FE.isPlainObject(s.keyTypes)) s.keyTypes = {};
      if (!FE.isPlainObject(s.keyTypes[group])) s.keyTypes[group] = {};
      if (nv == null) delete s.keyTypes[group][field];
      else s.keyTypes[group][field] = nv;
    }
  ];
}

/* ---------------- 渲染：槽位全局配色 ---------------- */
function renderThemeColors() {
  var host = $('th-colors');
  if (!host) return;
  clearEl(host);
  if (!FE.isPlainObject(tp())) {
    host.appendChild(h('div', { class: 'th-slot-hint' },
      '尚未导入主题。预览按编辑器原有配色显示（未导入主题时预览行为与从前完全一致）。'));
    host.appendChild(h('button', {
      type: 'button', class: 'mini-button primary',
      onclick: function () {
        FE.loadThemeProfileText(FE.serializeThemeProfile(FE.themeNewProfile()));
        setThemeStatus('已新建主题（以内置默认色为初值，四个方向提示色留空以继承 keyHintTextColor）', 'ok');
      }
    }, '以内置默认色新建主题'));
    return;
  }
  host.appendChild(h('div', { class: 'th-slot-hint' },
    '正在编辑槽位 ', h('code', null, state.themeSlot || 'light'),
    '（', h('code', null, (state.themeSlot || 'light') === 'light' ? 'light' : 'dark'),
    ' 与“深色外观”无绑定语义，两套槽位相互独立）。留空的字段表示“回落 / 继承”。'));
  var grid = h('div', { class: 'th-color-grid' });
  FE.THEME_COLOR_FIELDS.forEach(function (f) {
    var gs = slotGetSet(f);
    grid.appendChild(colorRow(f, FIELD_DOC[f], gs[0], gs[1]));
  });
  host.appendChild(grid);
}

/* ---------------- 渲染：keyTypes ---------------- */
function renderThemeKeyTypes() {
  var host = $('th-keytypes');
  if (!host) return;
  clearEl(host);
  if (!FE.isPlainObject(tp())) {
    host.appendChild(h('div', { class: 'th-slot-hint' }, '尚未导入主题。'));
    return;
  }
  var s = slotObj();
  var open = FE.ensureOpenSet('openThemeGroups');
  host.appendChild(h('div', { class: 'th-slot-hint' },
    '键类型配色优先于该槽位的 26 色全局默认，但**低于**布局里每个按键自己的 colors（基线 §1.5）。'));
  FE.THEME_KEY_TYPE_NAMES.forEach(function (group) {
    var grp = FE.isPlainObject(s.keyTypes) ? s.keyTypes[group] : null;
    var block = h('div', { class: 'th-keytype-block' });
    var det = h('details', { class: 'inner-card', open: open[group] ? true : null });
    var summary = h('summary', { class: 'th-keytype-head' },
      h('code', null, group),
      h('span', { class: 'th-keytype-missing' },
        grp ? ('已定义 ' + FE.THEME_KEYTYPE_FIELDS.filter(function (f) { return grp[f] != null; }).length + ' / 10 个字段')
          : '未定义 —— 该类按键回落全局 26 色'));
    det.appendChild(summary);
    det.addEventListener('toggle', function () { open[group] = !!det.open; });
    if (!grp) {
      det.appendChild(h('div', { class: 'inner-card-body' },
        h('button', {
          type: 'button', class: 'mini-button',
          onclick: function () {
            beginGesture();
            if (!FE.isPlainObject(slotObj().keyTypes)) slotObj().keyTypes = {};
            slotObj().keyTypes[group] = {};
            open[group] = true;
            endGesture();
          }
        }, '在此槽位创建 ' + group + ' 分组')));
    } else {
      var body = h('div', { class: 'inner-card-body' });
      var grid = h('div', { class: 'th-color-grid' });
      FE.THEME_KEYTYPE_FIELDS.forEach(function (f) {
        var gs = keyTypeGetSet(group, f);
        grid.appendChild(colorRow(group + '.' + f, KEYTYPE_FIELD_DOC[f], gs[0], gs[1]));
      });
      body.appendChild(grid);
      det.appendChild(body);
    }
    block.appendChild(det);
    host.appendChild(block);
  });
}

/* ---------------- 渲染：校验 ---------------- */
function renderThemeValidation() {
  var host = $('th-validation');
  if (!host) return;
  clearEl(host);
  if (!FE.isPlainObject(tp())) {
    host.appendChild(h('span', { class: 'st-ok' }, '尚未导入主题（未导入不影响预览与其它编辑功能）'));
    return;
  }
  var v = FE.validateThemeProfile(tp());
  var parts = [];
  if (v.errors.length) parts.push(h('span', { class: 'st-error' }, '✗ ' + v.errors.length + ' 个错误'));
  if (v.warnings.length) parts.push(h('span', { class: 'st-warn' }, '⚠ ' + v.warnings.length + ' 个提示'));
  if (!v.errors.length && !v.warnings.length) parts.push(h('span', { class: 'st-ok' }, '✓ 主题校验通过'));
  var slots = ['light', 'dark'].filter(function (sl) { return FE.isPlainObject(tp()[sl]); });
  parts.push(' · 槽位 ' + (slots.join(' / ') || '（无）'));
  parts.push(' · 字段 ' + FE.THEME_COLOR_FIELDS.filter(function (f) {
    var s = tp()[state.themeSlot || 'light'];
    return FE.isPlainObject(s) && s[f] != null;
  }).length + ' / 26');
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

/* ---------------- 渲染：JSON 卡片 ---------------- */
var themeJsonDirty = false;
function renderThemeJson() {
  var ta = $('th-json');
  if (!ta) return;
  if (document.activeElement === ta) return;
  if (themeJsonDirty) return;
  ta.value = FE.isPlainObject(tp()) ? FE.serializeThemeProfile(tp()) : '';
}

/* ---------------- 渲染：整页 ---------------- */
function renderThemeToolbar() {
  var slotSel = $('th-slot');
  if (slotSel) slotSel.value = state.themeSlot || 'light';
  /* NOTE: 这里原有一个 `#th-bordermode`（键边框）下拉的回填。它已随需求**移到
   * 预览键盘的滑杆行**（`#pt-border` / `#pt-stroke`）—— 因为 `key_border_enabled`
   * / `key_stroke_enabled` 是 App 的**全局设置**（SharedPreferences `foxy_theme`），
   * 不属于主题文件内容，摆在「主题文件」卡片里会让人误以为要写进主题 JSON。 */
  var nm = $('th-name');
  if (nm && document.activeElement !== nm) nm.value = FE.isPlainObject(tp()) && tp().name != null ? String(tp().name) : '';
  var au = $('th-author');
  if (au && document.activeElement !== au) au.value = FE.isPlainObject(tp()) && tp().author != null ? String(tp().author) : '';
}

/* 渲染后把 jscolor 实例装到本页的颜色输入框上 —— **这一步不能省**。
 *
 * ⭐ 这就是「取色框有时不显示已选颜色预览」的**真正成因**：jscolor 的"已选颜色预览"
 * 是它画在**输入框自身** background-image 上的色块（vendor `jscolor.js:2336`
 * 的 setPreviewElementBg，由构造期的 processValueInput → exposeColor 调用）。
 * **没有实例就没有色块**。而 colorRow 里那句 FE.installJscolor 是在输入框
 * 还没进入 DOM 时执行的，走的是"挂起、等挂载后补装"的分支
 * （key-dialog.js 的 installPendingColorPickers）—— 按键对话框在 buildForm
 * 末尾补了这一下，**主题页漏了**。
 * 后果：主题页 46 个色框（26 全局 + 20 keyTypes）在刚渲染完时**一个实例都没有**；
 * 只有用户点过的那个框才会建实例、才有色块预览 —— 于是"有时显示、有时不显示"；
 * 而选完色会触发 afterChange → renderAll 重建表单，实例随旧元素一起丢弃，
 * 预览又消失。补上这一步后，每次渲染都保证实例齐备。
 *
 * ⚠️ 只对**已挂载**的输入框补装（installPendingColorPickers 内部会判 isAttached），
 * 所以必须在元素 append 进 DOM **之后**调用，即本函数末尾。
 * ⚠️ 拖动取色走的是 refreshPreviewOnly()（不重建表单），因此不会拆掉正在用的面板。 */
function installThemePickers() {
  if (!FE.installPendingColorPickers) return;
  ['th-colors', 'th-keytypes'].forEach(function (id) {
    var host = $(id);
    if (host) FE.installPendingColorPickers(host);
  });
}

function renderThemeTab() {
  renderThemeToolbar();
  renderThemeColors();
  renderThemeKeyTypes();
  /* 元素已进 DOM，补装取色器（须在 colors/keytypes 渲染之后，见上方注释） */
  installThemePickers();
  renderThemeValidation();
  renderThemeJson();
}
FE.renderThemeTab = renderThemeTab;
FE.installThemePickers = installThemePickers;

/* 把 state.themeSlot 同步到主题页 UI —— 供 app.js 在预览工具栏的「键盘」下拉
 * 变更后回调（联动是双向的：主题页切槽位 → 预览下拉跟着变；预览下拉切 →
 * 主题页表单跟着切）。
 *
 * ⚠️ 三条约束：
 *   1) **存在性安全**：th-slot 可能不存在（DOM 桩 / 主题页未加载）→ 静默跳过，不许抛。
 *   2) **不重压历史 / 不 mutate**：切槽位不是编辑，压栈会污染撤销栈。
 *   3) 值非法或已一致时尽量少做事，避免无谓重建表单（正在拖取色面板时重建会拆掉它）。 */
FE.syncThemeSlotUI = function () {
  try {
    var slot = (state.themeSlot === 'dark') ? 'dark' : 'light';
    /* 预览工具栏的「键盘」下拉也要跟着显示同一槽位（反向联动的可见部分）。
     * 这里只改显示值、不触发它的 change（否则会回调回来造成循环）。 */
    var ptSel = $('pt-theme');
    if (ptSel && ptSel.value !== slot) ptSel.value = slot;
    var slotSel = $('th-slot');
    if (!slotSel) return false;               /* 主题页不在：静默跳过 */
    if (slotSel.value !== slot) slotSel.value = slot;
    /* 回填整张表单（含 keyTypes：两套槽位的分组可能完全不同）。
     * 只在主题页确实渲染过时才重建；各 render 内部本就有 host 判空。 */
    if ($('th-colors')) renderThemeTab();
    return true;
  } catch (e) {
    /* 联动失败绝不能影响预览下拉本身的切换 */
    return false;
  }
};

/* ---------------- 载入 / 导出 ---------------- */
FE.loadThemeProfileText = function (text, fileName) {
  var p;
  try { p = JSON.parse(FE.sanitizeJsonText(text)); } catch (e) {
    state.lastParseError = e.message;
    setThemeStatus('主题 JSON 解析失败: ' + e.message, 'error');
    return false;
  }
  if (!FE.isPlainObject(p)) {
    state.lastParseError = '主题根节点必须是 JSON 对象';
    setThemeStatus(state.lastParseError, 'error');
    return false;
  }
  if (p.type != null && p.type !== 'foxy.keyboard-theme') {
    var tm = 'type 应为 foxy.keyboard-theme，当前为 ' + JSON.stringify(p.type);
    state.lastParseError = tm;
    setThemeStatus('这不是主题文件（' + tm + '）', 'error');
    return false;
  }
  var normalized = FE.normalizeThemeProfile(p);
  themeJsonDirty = false;
  if (FE.mutate) {
    FE.mutate(function () {
      state.themeProfile = normalized;
      if (fileName) state.themeFileName = fileName;
    });
  } else {
    state.themeProfile = normalized;
    if (fileName) state.themeFileName = fileName;
    if (FE.afterChange) FE.afterChange();
  }
  return true;
};
function exportTheme() {
  if (!FE.isPlainObject(tp())) { setThemeStatus('尚未导入主题，无法导出', 'error'); return; }
  var text = FE.serializeThemeProfile(tp());
  /* ⭐ 导出文件名**按当前 name 现算**（基线 §1.1.1）—— 不能只用 themeFileName。
   *
   * 原因：App 是按主题 JSON 里的 `name` 反推文件名去扫描 `frontend/themes/` 的
   * （`uk.java:230-252`）。若用户导入了一份 `foo.json`、然后把 name 改成 `bar`
   * 再导出，文件名必须跟着变成 `bar.json`（含转义）；否则 App 找 `bar.json`
   * 找不到，表现为"主题放进去了却不生效"。
   * `themeFileName` 只在拿不到 name 时兜底（如未填 name 的新建主题）。 */
  var p = tp();
  var outName = (typeof p.name === 'string' && p.name.trim() !== '')
    ? FE.themeFileNameFor(p.name)
    : (state.themeFileName || 'theme.json');
  state.themeFileName = outName;
  if (FE.downloadJson) {
    FE.downloadJson(text, outName);
  } else {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  setThemeStatus('已导出 ' + outName, 'ok');
}

/* ---------------- 初始化 ---------------- */
function initThemeTab() {
  /* 主题名（= 文件名）输入行。基线里 name 是扫描条件与文件名的双重来源，
   * 但要求给的容器 id 里没有 th-name，所以在 author 行之前动态插一行。 */
  var authorInp = $('th-author');
  if (authorInp && !$('th-name') && authorInp.parentNode && authorInp.parentNode.parentNode) {
    var nameRow = h('div', { class: 'form-row form-inline' },
      h('label', { class: 'mini-label' }, '主题名 name'),
      h('input', {
        id: 'th-name', type: 'text', class: 'mini-input',
        placeholder: '即文件名（非法字符会百分号转义）'
      }));
    authorInp.parentNode.parentNode.insertBefore(nameRow, authorInp.parentNode);
  }

  $('th-import').addEventListener('click', function () { $('th-import-file').click(); });
  $('th-import-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (FE.loadThemeProfileText(String(reader.result), file.name)) {
        setThemeStatus('已导入 ' + file.name, 'ok');
      }
    };
    reader.readAsText(file, 'utf-8');
  });
  $('th-export').addEventListener('click', exportTheme);

  /* 示例 / 模板：内置默认主题（「新建」初值）+ examples/ 里的真实主题文件
   * （`主题配色/` 那 18 份已入库，与符号文件同一套做法 —— 打包器认 type 里的
   * `foxy.keyboard-theme`，故 kind 为 theme）。
   *
   * ⚠️ 显示名优先用主题内部的 `name` 字段（`FE.EXAMPLE_META[n].desc`）而不是文件名：
   * 文件名是给人看的标签，`name` 才是 App 用来定位文件的那个字段，
   * 两者不一致时（如 isGboard-WeChatDark.json 的 name 是 "isGboard-WeChatDark copy"）
   * 让用户看到真实 name 更有用。文件名仍作为 value（它才是 EXAMPLE_FILES 的键）。 */
  var ex = $('th-example');
  if (ex) {
    clearEl(ex);
    ex.appendChild(h('option', { value: '' }, '选择主题模板…'));
    ex.appendChild(h('option', { value: '__builtin__' }, '内置默认主题色（App 内置）'));
    if (FE.THEME_EXAMPLE_FILES) {
      /* 按显示名排序：用户是按"哪个主题好看"挑的，不是按文件名找 */
      var themeNames = Object.keys(FE.THEME_EXAMPLE_FILES);
      var metaOf = function (n) {
        return (FE.EXAMPLE_META && FE.EXAMPLE_META[n]) || {};
      };
      themeNames.sort(function (a, b) {
        var da = metaOf(a).desc || a, db = metaOf(b).desc || b;
        return da.localeCompare(db, 'zh');
      });
      themeNames.forEach(function (n) {
        var d = metaOf(n).desc;
        var base = n.replace(/\.json$/i, '');
        /* name 与文件名相同时只显示一个（中文主题基本都是这种情况，
         * 写成「爱马仕橙（爱马仕橙.json）」纯属噪音）；不同时才并列，
         * 让用户看得出"文件叫这个、主题自称那个"。 */
        ex.appendChild(h('option', { value: n },
          (d && d !== base) ? (d + '（' + n + '）') : n));
      });
    }
    $('th-load-example').addEventListener('click', function () {
      var v = ex.value;
      if (!v) { FE.uiAlert('请选择主题模板'); return; }
      var text = null;
      if (v === '__builtin__') text = FE.serializeThemeProfile(FE.themeNewProfile());
      else text = FE.EXAMPLE_FILES ? FE.EXAMPLE_FILES[v] : null;
      if (text == null) { setThemeStatus('模板未找到: ' + v, 'error'); return; }
      /* 文件名用主题自己的 name（App 端就是按 name 定位文件的），取不到才退回原文件名 */
      var outName = v;
      if (v !== '__builtin__') {
        try {
          var nm = FE.normalizeThemeProfile(JSON.parse(text));
          if (nm && typeof nm.name === 'string' && nm.name.trim() !== '') outName = nm.name.trim() + '.json';
        } catch (e) { /* 保持原文件名 */ }
      }
      if (FE.loadThemeProfileText(text, v === '__builtin__' ? 'theme.json' : outName)) {
        setThemeStatus(v === '__builtin__'
          ? '已以内置默认主题色新建（方向提示色留空，导出前请填写 name）'
          : '已加载 ' + v + '（导出文件名：' + outName + '）', 'ok');
      }
    });
  }

  var nameInp = $('th-name');
  if (nameInp) {
    /* 派生文件名回显：App 是按 name 反推文件名去扫描的（uk.java:230-252），
     * 所以名字里含 / : * 等字符时文件名与主题名**不再字面相同**。
     * 这里实时把"实际会导出成什么文件名"显示出来，用户才不用猜转义结果。 */
    var nameHint = h('span', { class: 'status dim', id: 'th-name-file' });
    nameInp.parentNode.appendChild(nameHint);
    var refreshNameHint = function () {
      var v = FE.isPlainObject(tp()) && typeof tp().name === 'string' ? tp().name : '';
      if (v.trim() === '') {
        nameHint.textContent = '（name 为空 —— App 不会扫描该主题；文件名将兜底为 theme.json）';
        return;
      }
      var fn = FE.themeFileNameFor(v);
      nameHint.textContent = '导出文件名：' + fn +
        (fn === v.trim() + '.json' ? '' : '（name 含需转义字符，文件名已按 App 规则转义）');
    };
    refreshNameHint();
    FE.refreshThemeNameHint = refreshNameHint;
    nameInp.addEventListener('change', function () {
      FE.mutate(function () {
        var p = ensureTheme();
        if (nameInp.value.trim() === '') delete p.name;
        else p.name = nameInp.value.trim();
      });
      refreshNameHint();
      setThemeStatus('主题名已更新', 'ok');
    });
  }
  var authorInp2 = $('th-author');
  authorInp2.addEventListener('change', function () {
    FE.mutate(function () {
      var p = ensureTheme();
      /* author 不是基线字段（App 会忽略），留空时直接删掉，避免写进导出文件 */
      if (authorInp2.value.trim() === '') delete p.author;
      else p.author = authorInp2.value.trim();
    });
  });

  var slotSel = $('th-slot');
  slotSel.addEventListener('change', function () {
    var slot = slotSel.value === 'dark' ? 'dark' : 'light';
    /* 槽位与预览工具栏的「键盘」下拉是**同一个状态**（用户要求联动）：
     * 走 app.js 的共享 setter，它同时写 state.theme 与 state.themeSlot。
     * setter 缺席时（未加载预览工具栏/桩环境）退回自己写 themeSlot。 */
    if (typeof FE.setPreviewSlot === 'function') FE.setPreviewSlot(slot);
    else state.themeSlot = slot;
    /* 只切槽位不动数据：不算一次编辑，不压历史，但要重画预览与表单 */
    if (FE.renderAll) FE.renderAll();
  });
  /* NOTE: 键边框/键描边的 change 监听已随控件移到 app.js 的预览滑杆行
   * （`FE.applyGlobalToggles`），这里不再接线。 */

  /* JSON 应用 / 格式化 */
  var ta = $('th-json');
  ta.addEventListener('input', function () { themeJsonDirty = true; });
  $('th-json-apply').addEventListener('click', function () {
    var rep = FE.inspectJsonText(ta.value);
    if (FE.loadThemeProfileText(ta.value)) {
      themeJsonDirty = false;
      setThemeJsonStatus(rep.total
        ? '✓ 已应用（自动修复 ' + rep.total + ' 处问题：' + formatIssueListLocal(rep.issues) + '）'
        : '✓ 已应用', rep.total ? 'warn' : 'ok');
    } else {
      setThemeJsonStatus('✗ 未应用（原文保留）。错误: ' + (state.lastParseError || ''), 'error');
    }
  });
  $('th-json-format').addEventListener('click', function () {
    var rep = FE.inspectJsonText(ta.value);
    if (!rep.parseOk) {
      setThemeJsonStatus('JSON 无效: ' + (rep.parseError || '') +
        (rep.total ? '（检测到 ' + rep.total + ' 处可修复问题）' : ''), 'error');
      return;
    }
    /* 格式化走 serialize：把颜色统一成 #AARRGGBB、字段按权威顺序排列 */
    var parsed = null;
    try { parsed = JSON.parse(rep.fixedText); } catch (e) { parsed = null; }
    ta.value = parsed != null ? FE.serializeThemeProfile(FE.normalizeThemeProfile(parsed))
      : JSON.stringify(JSON.parse(rep.fixedText), null, 2);
    themeJsonDirty = true;
    setThemeJsonStatus(rep.total ? '已格式化并修复 ' + rep.total + ' 处问题（尚未应用）' : '已格式化（尚未应用）', 'ok');
  });

  renderThemeTab();
}

function formatIssueListLocal(issues) {
  return (Array.isArray(issues) ? issues : []).map(function (it) {
    var ls = (it.lines || []).slice(0, 6).join('、');
    return it.label + ' ×' + it.count + (ls ? '（第 ' + ls + ' 行）' : '');
  }).join('；');
}

initThemeTab();
})();
