/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * data.js — 内置按键注册表（rime.* / foxy.*）、KeyCode 名称表、App 命令表
 * 依据 skills/SKILL.md（Foxy 布局格式规范）整理。
 */
(function () {
'use strict';
var FE = (window.FE = window.FE || {});

/* ------------------------------------------------------------------ *
 * 内置按键注册表
 * 每项: { label, shiftedLabel?, keyType?, icon?, modifier?, spacer?,
 *         tap: 动作对象或 {__builtin:'rime.x'}（内部动作，不对外展开）,
 *         _cat: 分组标签（选择器 UI 用） }
 * ------------------------------------------------------------------ */
var B = {};
var i, ch, up, name;

function def(name, obj, cat) { obj._cat = cat; B[name] = obj; }

/* ---- 字母 rime.a ... rime.z / rime.A ... rime.Z ---- */
var LOWER = 'abcdefghijklmnopqrstuvwxyz';
for (i = 0; i < 26; i++) {
  ch = LOWER.charAt(i); up = ch.toUpperCase();
  def('rime.' + ch, { label: ch, shiftedLabel: up, keyType: 'LETTER', tap: { type: 'key', key: up } }, '字母');
  def('rime.' + up, { label: up, keyType: 'LETTER', tap: { type: 'key', key: up, meta: ['SHIFT'] } }, '字母');
}

/* ---- 数字 rime.0 ... rime.9 ---- */
for (i = 0; i <= 9; i++) {
  def('rime.' + i, { label: String(i), keyType: 'LETTER', tap: { type: 'key', key: 'DIGIT_' + i } }, '数字');
}

/* ---- Shift 后标点（rime.exclam 等） ---- */
var SHIFTED_PUNCT = {
  exclam: '!', at: '@', numbersign: '#', dollar: '$', percent: '%', asciicircum: '^',
  ampersand: '&', asterisk: '*', parenleft: '(', parenright: ')', quotedbl: '"',
  underscore: '_', plus: '+', less: '<', greater: '>', braceleft: '{', braceright: '}',
  bar: '|', asciitilde: '~', colon: ':', question: '?',
  ApostropheShift: '"', Question: '?'
};
for (name in SHIFTED_PUNCT) {
  def('rime.' + name, { label: SHIFTED_PUNCT[name], keyType: 'LETTER', tap: { __builtin: 'rime.' + name } }, '标点');
}

/* ---- 直接标点 ---- */
var DIRECT_PUNCT = {
  space: [' ', 'SPACE'], semicolon: [';', 'SEMICOLON'], comma: [',', 'COMMA'],
  period: ['.', 'PERIOD'], minus: ['-', 'MINUS'], equal: ['=', 'EQUAL'],
  grave: ['`', 'GRAVE'], quoteleft: ['‘', null], slash: ['/', 'SLASH'],
  apostrophe: ["'", 'APOSTROPHE'], quoteright: ['’', null], backslash: ['\\', 'BACKSLASH'],
  bracketleft: ['[', 'LEFT_BRACKET'], bracketright: [']', 'RIGHT_BRACKET']
};
for (name in DIRECT_PUNCT) {
  var pl = DIRECT_PUNCT[name][0], code = DIRECT_PUNCT[name][1];
  def('rime.' + name, {
    label: pl, keyType: 'LETTER',
    tap: code ? { type: 'key', key: code } : { __builtin: 'rime.' + name }
  }, '标点');
}

/* ---- 导航 / 编辑 / 功能 / 修饰键（具备公开 KeyCode 名称） ---- */
var NAMED = {
  BackSpace: ['⌫', 'BACKSPACE'], Return: ['⏎', 'ENTER'], Tab: ['Tab', 'TAB'],
  Escape: ['Esc', 'ESCAPE'], Linefeed: ['LF', 'LINEFEED'], Clear: ['Clear', 'CLEAR'],
  Pause: ['Pause', 'PAUSE'], Scroll_Lock: ['ScrLk', 'SCROLL_LOCK'], Sys_Req: ['SysRq', 'SYS_REQ'],
  Home: ['Home', 'HOME'], End: ['End', 'END'], Page_Up: ['PgUp', 'PAGE_UP'], Prior: ['PgUp', 'PAGE_UP'],
  Page_Down: ['PgDn', 'PAGE_DOWN'], Next: ['PgDn', 'PAGE_DOWN'], Begin: ['Begin', 'BEGIN'],
  Insert: ['Ins', 'INSERT'], Delete: ['Del', 'DELETE'],
  Up: ['↑', 'UP'], Down: ['↓', 'DOWN'], Left: ['←', 'LEFT'], Right: ['→', 'RIGHT'],
  Select: ['Sel', 'SELECT'], Print: ['Print', 'PRINT'], Execute: ['Exec', 'EXECUTE'],
  Undo: ['Undo', 'UNDO'], Redo: ['Redo', 'REDO'], Menu: ['Menu', 'MENU'], Find: ['Find', 'FIND'],
  Cancel: ['Cancel', 'CANCEL'], Help: ['Help', 'HELP'], Break: ['Break', 'BREAK'],
  Num_Lock: ['NumLk', 'NUM_LOCK'],
  Shift_L: ['Shift', 'SHIFT_LEFT'], Shift_R: ['Shift', 'SHIFT_RIGHT'],
  Control_L: ['Ctrl', 'CONTROL_LEFT'], Control_R: ['Ctrl', 'CONTROL_RIGHT'],
  Alt_L: ['Alt', 'ALT_LEFT'], Alt_R: ['Alt', 'ALT_RIGHT'],
  Meta_L: ['Meta', 'META_LEFT'], Meta_R: ['Meta', 'META_RIGHT'],
  Caps_Lock: ['Caps', 'CAPS_LOCK']
};
for (name in NAMED) {
  def('rime.' + name, { label: NAMED[name][0], keyType: 'FUNCTION', tap: { type: 'key', key: NAMED[name][1] } }, '编辑与导航');
}

/* ---- F1 ... F12（无公开 KeyCode 名称，标记为内置动作） ---- */
for (i = 1; i <= 12; i++) {
  def('rime.F' + i, { label: 'F' + i, keyType: 'FUNCTION', tap: { __builtin: 'rime.F' + i } }, '功能键');
}

/* ---- 小键盘 ---- */
var KP_DIGIT = { KP_0: '0', KP_1: '1', KP_2: '2', KP_3: '3', KP_4: '4', KP_5: '5', KP_6: '6', KP_7: '7', KP_8: '8', KP_9: '9' };
for (name in KP_DIGIT) {
  def('rime.' + name, { label: KP_DIGIT[name], keyType: 'LETTER', tap: { type: 'key', key: name } }, '小键盘');
}
var KP_MISC = {
  KP_Decimal: ['.', 'KP_DECIMAL'], KP_Add: ['+', 'KP_ADD'], KP_Subtract: ['-', 'KP_SUBTRACT'],
  KP_Multiply: ['*', 'KP_MULTIPLY'], KP_Divide: ['/', 'KP_DIVIDE'], KP_Equal: ['=', 'KP_EQUAL'],
  KP_Enter: ['Enter', 'KP_ENTER'], KP_Space: [' ', 'KP_SPACE'], KP_Tab: ['Tab', 'KP_TAB'],
  KP_Separator: [',', 'KP_SEPARATOR'],
  KP_F1: ['KF1', 'KP_F1'], KP_F2: ['KF2', 'KP_F2'], KP_F3: ['KF3', 'KP_F3'], KP_F4: ['KF4', 'KP_F4'],
  KP_Home: ['Home', 'KP_HOME'], KP_Left: ['←', 'KP_LEFT'], KP_Up: ['↑', 'KP_UP'],
  KP_Right: ['→', 'KP_RIGHT'], KP_Down: ['↓', 'KP_DOWN'],
  KP_Page_Up: ['PgUp', 'KP_PAGE_UP'], KP_Prior: ['PgUp', 'KP_PAGE_UP'],
  KP_Page_Down: ['PgDn', 'KP_PAGE_DOWN'], KP_Next: ['PgDn', 'KP_PAGE_DOWN'],
  KP_End: ['End', 'KP_END'], KP_Begin: ['Begin', 'KP_BEGIN'],
  KP_Insert: ['Ins', 'KP_INSERT'], KP_Delete: ['Del', 'KP_DELETE']
};
for (name in KP_MISC) {
  def('rime.' + name, { label: KP_MISC[name][0], keyType: 'FUNCTION', tap: { type: 'key', key: KP_MISC[name][1] } }, '小键盘');
}

/* ---- foxy.* 内置能力键 ---- */
def('foxy.Shift', {
  label: '⇧', keyType: 'FUNCTION', icon: 'shift', modifier: 'SHIFT',
  tap: { type: 'modifier', modifier: 'SHIFT', state: 'ONESHOT' }
}, 'Foxy 功能');
def('foxy.LayoutNumpad', {
  label: '123', keyType: 'FUNCTION',
  tap: { type: 'switch_layout', layout: 'numpad' }
}, 'Foxy 功能');
def('foxy.LayoutDefault', {
  label: 'ABC', keyType: 'FUNCTION',
  tap: { type: 'switch_layout', layout: 'default' }
}, 'Foxy 功能');
def('foxy.SelectAll', { label: 'Sel', keyType: 'FUNCTION', tap: { type: 'key', key: 'A', meta: ['CTRL'] } }, 'Foxy 功能');
def('foxy.Undo', { label: 'Undo', keyType: 'FUNCTION', tap: { type: 'app', command: 'undo' } }, 'Foxy 功能');
def('foxy.Redo', { label: 'Redo', keyType: 'FUNCTION', tap: { type: 'app', command: 'redo' } }, 'Foxy 功能');
def('foxy.Cut', { label: 'Cut', keyType: 'LETTER', tap: { type: 'key', key: 'X', meta: ['CTRL'] } }, 'Foxy 功能');
def('foxy.Copy', { label: 'Copy', keyType: 'LETTER', tap: { type: 'key', key: 'C', meta: ['CTRL'] } }, 'Foxy 功能');
def('foxy.Paste', { label: 'Paste', keyType: 'LETTER', tap: { type: 'key', key: 'V', meta: ['CTRL'] } }, 'Foxy 功能');
def('foxy.KP_Enter', { label: 'Enter', keyType: 'ACTION', icon: 'enter', tap: { type: 'key', key: 'KP_ENTER' } }, 'Foxy 功能');
def('foxy.Spacer', { label: '', keyType: 'LETTER', spacer: true, tap: { __builtin: 'foxy.Spacer' } }, 'Foxy 功能');

FE.BUILTIN_KEYS = B;

/* ------------------------------------------------------------------ *
 * 符号 KeyCode 名称表（直接动作 {type:'key'} 的 key 字段取值）
 * ------------------------------------------------------------------ */
var KEYCODE_GROUPS = [];
(function () {
  var g1 = { label: '字母', names: [] };
  for (i = 0; i < 26; i++) g1.names.push(LOWER.charAt(i).toUpperCase());
  KEYCODE_GROUPS.push(g1);
  var gd = { label: '数字', names: [] };
  for (i = 0; i <= 9; i++) gd.names.push('DIGIT_' + i);
  for (i = 0; i <= 9; i++) gd.names.push('KP_' + i);
  KEYCODE_GROUPS.push(gd);
  KEYCODE_GROUPS.push({
    label: '标点',
    names: ['SPACE', 'COMMA', 'PERIOD', 'SLASH', 'SEMICOLON', 'APOSTROPHE', 'GRAVE', 'MINUS', 'EQUAL',
      'LEFT_BRACKET', 'RIGHT_BRACKET', 'BACKSLASH', 'NUMBERSIGN', 'ASTERISK', 'PLUS', 'AT']
  });
  KEYCODE_GROUPS.push({
    label: '编辑与导航',
    names: ['ENTER', 'BACKSPACE', 'TAB', 'ESCAPE', 'LINEFEED', 'CLEAR', 'INSERT', 'DELETE', 'HOME', 'END',
      'PAGE_UP', 'PAGE_DOWN', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'BEGIN', 'SELECT', 'PRINT', 'EXECUTE',
      'UNDO', 'REDO', 'MENU', 'FIND', 'CANCEL', 'HELP', 'BREAK', 'PAUSE', 'SCROLL_LOCK', 'SYS_REQ', 'NUM_LOCK']
  });
  KEYCODE_GROUPS.push({
    label: '功能键',
    names: (function () { var a = []; for (var fi = 1; fi <= 12; fi++) a.push('F' + fi); return a; })()
  });
  KEYCODE_GROUPS.push({
    label: '修饰键',
    names: ['SHIFT_LEFT', 'SHIFT_RIGHT', 'CONTROL_LEFT', 'CONTROL_RIGHT', 'ALT_LEFT', 'ALT_RIGHT',
      'META_LEFT', 'META_RIGHT', 'CAPS_LOCK', 'EISU_TOGGLE', 'KANA_LOCK', 'HIRAGANA_KATAKANA', 'ZENKAKU_HANKAKU']
  });
  KEYCODE_GROUPS.push({
    label: '小键盘',
    names: ['KP_DIVIDE', 'KP_MULTIPLY', 'KP_SUBTRACT', 'KP_ADD', 'KP_DECIMAL', 'KP_SEPARATOR', 'KP_EQUAL',
      'KP_ENTER', 'KP_SPACE', 'KP_TAB', 'KP_F1', 'KP_F2', 'KP_F3', 'KP_F4', 'KP_HOME', 'KP_LEFT', 'KP_UP',
      'KP_RIGHT', 'KP_DOWN', 'KP_PAGE_UP', 'KP_PAGE_DOWN', 'KP_END', 'KP_BEGIN', 'KP_INSERT', 'KP_DELETE']
  });
})();
FE.KEYCODE_GROUPS = KEYCODE_GROUPS;
FE.ALL_KEYCODES = {};
KEYCODE_GROUPS.forEach(function (g) { g.names.forEach(function (n) { FE.ALL_KEYCODES[n] = true; }); });

/* ------------------------------------------------------------------ *
 * 低层 KeyCode 的显示名（仿 f5a-see-me：英文键名后加括号备注）
 * 仅用于下拉框显示，**不影响写出的 JSON**——落盘永远是 code 本身。
 * 未列出的码走 keycodeDisplayName 的通用规则（数字 / F 键 / 字母）。
 * ------------------------------------------------------------------ */
var KEYCODE_LABELS = {
  SPACE: '空格', COMMA: '逗号 ,', PERIOD: '句号 .', SLASH: '斜杠 /',
  SEMICOLON: '分号 ;', APOSTROPHE: "撇号 '", GRAVE: '反引号 `', MINUS: '减号 -',
  EQUAL: '等号 =', LEFT_BRACKET: '左方括号 [', RIGHT_BRACKET: '右方括号 ]',
  BACKSLASH: '反斜杠 \\', NUMBERSIGN: '井号 #', ASTERISK: '星号 *',
  PLUS: '加号 +', AT: 'at 符号 @',
  ENTER: '回车', BACKSPACE: '退格', TAB: '制表 Tab', ESCAPE: 'Esc 退出',
  LINEFEED: '换行', CLEAR: '清除', INSERT: '插入', DELETE: '删除',
  HOME: '行首', END: '行尾', PAGE_UP: '上翻页', PAGE_DOWN: '下翻页',
  UP: '方向键上 ↑', DOWN: '方向键下 ↓', LEFT: '方向键左 ←', RIGHT: '方向键右 →',
  BEGIN: '起始', SELECT: '全选', PRINT: '打印', EXECUTE: '执行',
  UNDO: '撤销', REDO: '重做', MENU: '菜单', FIND: '查找',
  CANCEL: '取消', HELP: '帮助', BREAK: '中断', PAUSE: '暂停',
  SCROLL_LOCK: '滚动锁定', SYS_REQ: '系统请求', NUM_LOCK: '数字小键盘锁定',
  SHIFT_LEFT: '左 Shift', SHIFT_RIGHT: '右 Shift',
  CONTROL_LEFT: '左 Ctrl', CONTROL_RIGHT: '右 Ctrl',
  ALT_LEFT: '左 Alt', ALT_RIGHT: '右 Alt',
  META_LEFT: '左 Meta（Win 键）', META_RIGHT: '右 Meta（Win 键）',
  CAPS_LOCK: '大写锁定', EISU_TOGGLE: '英数切换', KANA_LOCK: '假名锁定',
  HIRAGANA_KATAKANA: '平假名／片假名', ZENKAKU_HANKAKU: '全角／半角',
  KP_DIVIDE: '小键盘 /', KP_MULTIPLY: '小键盘 *', KP_SUBTRACT: '小键盘 -',
  KP_ADD: '小键盘 +', KP_DECIMAL: '小键盘 .', KP_SEPARATOR: '小键盘分隔符',
  KP_EQUAL: '小键盘 =', KP_ENTER: '小键盘回车', KP_SPACE: '小键盘空格',
  KP_TAB: '小键盘 Tab', KP_HOME: '小键盘行首', KP_LEFT: '小键盘 ←',
  KP_UP: '小键盘 ↑', KP_RIGHT: '小键盘 →', KP_DOWN: '小键盘 ↓',
  KP_PAGE_UP: '小键盘上翻页', KP_PAGE_DOWN: '小键盘下翻页',
  KP_END: '小键盘行尾', KP_BEGIN: '小键盘起始', KP_INSERT: '小键盘插入',
  KP_DELETE: '小键盘删除'
};
FE.KEYCODE_LABELS = KEYCODE_LABELS;

/* code → 下拉显示文本。字母保持原样（组标题已标明是字母），其余附中文备注。 */
FE.keycodeDisplayName = function (code) {
  var c = String(code == null ? '' : code);
  if (!c) return '';
  if (KEYCODE_LABELS[c]) return c + '（' + KEYCODE_LABELS[c] + '）';
  var m = c.match(/^DIGIT_(\d)$/);
  if (m) return c + '（数字 ' + m[1] + '）';
  m = c.match(/^KP_(\d)$/);
  if (m) return c + '（小键盘 ' + m[1] + '）';
  m = c.match(/^KP_F(\d+)$/);
  if (m) return c + '（小键盘功能键 F' + m[1] + '）';
  m = c.match(/^F(\d+)$/);
  if (m) return c + '（功能键 F' + m[1] + '）';
  return c;
};

/* ------------------------------------------------------------------ *
 * App 命令表（动作 {type:'app'} 的 command 字段取值）
 * ------------------------------------------------------------------ */
FE.APP_COMMANDS = [
  ['symbols', '符号面板'], ['switch_symbols', '符号面板（别名）'],
  ['numpad', '数字键盘'], ['switch_numpad', '数字键盘（别名）'],
  ['emoji', 'Emoji 面板'], ['kaomoji', '颜文字面板'],
  ['settings', '设置'], ['schema_list', '方案列表'],
  ['data_directory_list', '数据目录选择'], ['data_dir_list', '数据目录选择（别名）'],
  ['deploy', '重新部署'], ['deploy_rime', '重新部署（别名）'],
  ['sync', '同步 Rime 用户数据'], ['sync_rime', '同步 Rime 用户数据（别名）'],
  ['clipboard', '剪贴板'], ['theme', '主题'], ['theme_list', '主题列表'],
  ['voice', '语音'], ['voice_toggle', '语音切换'], ['voice_engine', '语音引擎'], ['voice_engine_list', '语音引擎列表'],
  ['ime_picker', '系统输入法选择'],
  ['floating_keyboard', '浮动键盘'], ['floating', '浮动键盘（别名）'],
  ['one_handed', '单手键盘'], ['one_handed_keyboard', '单手键盘（别名）'],
  ['split', '分体键盘布局'], ['split_keyboard', '分体键盘布局（别名）'],
  ['keyboard_adjust_start', '开始键盘高度调整'], ['keyboard_adjust_end', '结束键盘高度调整'],
  ['split_adjust_start', '分体键盘调整'], ['candidate_previous', '候选上一页'], ['candidate_next', '候选下一页'],
  ['select_schema', '选择方案（需参数）'], ['select_switch_option', '选择开关项（需参数）'],
  ['undo', '撤销'], ['redo', '重做'],
  ['hide_keyboard', '收起键盘'],
  ['text_editor', '文本编辑布局（专用命名布局）'],
  ['collapse_toolbar', '折叠工具栏'], ['expand_toolbar', '展开工具栏'],
  ['toggle_toolbar_container', '工具栏容器开关'],
  ['toggle_switch', '开关面板'], ['expand_switches', '展开开关'],
  ['voice_start', '开始语音'], ['voice_stop', '结束语音'],
  ['commit_text', '上屏文本（需参数）'],
  /* 宿主编辑器选区操作（新增）：drag 连续拖动手势的每步动作与松手动作。
   * editor_select_step 用 argument 指定方向 left/right/up/down。 */
  ['editor_select_step', '移动编辑器选区一步（需参数）'],
  ['delete_selection', '删除编辑器选区']
];

/* 支持的 keyType / 图标 / 修饰键取值 */
FE.KEY_TYPES = ['LETTER', 'FUNCTION', 'ACTION'];
/* **内置**图标名（带内置 SVG 渲染）。icon 取值不限于此：
 *   - 内置名：backspace / shift / enter / return（本数组）
 *   - 自定义名：来自顶层 icons 映射（profile 与 foxy.definitions.json 合并）
 *   - 内联载荷：直接写 svg:<svg …></svg> 或 xml:<svg …></svg>
 * 未知名字按 Foxy 规则「不渲染图标」，编辑器的预览同样跳过图标回落到文本。 */
FE.ICONS = ['backspace', 'shift', 'enter', 'return'];
/* 自定义图标名的新增/重命名校验用：不能是内置名、不能为空 */
FE.isBuiltinIcon = function (name) {
  return FE.ICONS.indexOf(String(name == null ? '' : name)) >= 0;
};
/* icons 映射里的自定义图标名（按名字排序，供下拉/列表稳定输出） */
FE.iconNames = function (scope) {
  var map = scope && scope.profile && FE.isPlainObject(scope.profile.icons) ? scope.profile.icons : null;
  return map ? Object.keys(map).sort() : [];
};
/* 内联 SVG/XML 图标载荷前缀（与工具栏按钮 icon 同形式） */
FE.INLINE_ICON_PREFIXES = ['svg:', 'xml:'];
FE.isInlineIcon = function (value) {
  var s = String(value == null ? '' : value).trim().toLowerCase();
  for (var i = 0; i < FE.INLINE_ICON_PREFIXES.length; i++) {
    if (s.indexOf(FE.INLINE_ICON_PREFIXES[i]) === 0) return true;
  }
  return false;
};
/* 修饰键枚举（SKILL.md「modifier actions」）：SHIFT / CTRL / ALT / META，运行时大小写不敏感。
 * 它同时是 key/override/variants 的 modifier 字段与 modifier 动作的唯一取值来源。 */
FE.MODIFIERS = ['SHIFT', 'CTRL', 'ALT', 'META'];
/* Foxy App 的 key.meta 解析同时接受 "ctrl" 与 "control"；编辑器
 * 需要在校验和表单回显时使用同一套别名口径，但导出仍保留用户原文，
 * 只有通过图形化编辑器重新保存时才写出规范的 CTRL。 */
FE.canonicalMetaName = function (value) {
  var name = String(value == null ? '' : value).trim().toUpperCase();
  return name === 'CONTROL' ? 'CTRL' : name;
};
/* modifier 字段在 Foxy 中是 SHIFT / CTRL / ALT / META 枚举，运行时按大小写不敏感解析。 */
FE.canonicalModifierName = function (value) {
  return String(value == null ? '' : value).trim().toUpperCase();
};
/* 是否为合法 modifier 名（null/空串表示「无修饰键」由调用方先行排除） */
FE.isModifierName = function (value) {
  return FE.MODIFIERS.indexOf(FE.canonicalModifierName(value)) >= 0;
};
/* 预览里「该修饰键当前是否开启」。
 * status.modifiers 是编辑器的修饰键模拟表（{SHIFT,CTRL,ALT,META} 四值）；
 * status.shift 是历史字段（Shift 决定 shiftedLabel / 弹出候选等语义），
 * 这里把它当作 SHIFT 的兼容镜像，老调用方（只传 {shift:true}）照旧成立。 */
FE.statusModifierOn = function (status, name) {
  var n = FE.canonicalModifierName(name);
  if (!n) return false;
  var mods = status && status.modifiers;
  if (mods && typeof mods === 'object' && Object.prototype.hasOwnProperty.call(mods, n)) return !!mods[n];
  if (n === 'SHIFT') return !!(status && status.shift);
  return false;
};
/* 修饰键状态：TOGGLE_LOCKED 是命令而非持久状态（未锁定→锁定，已锁定→关闭） */
FE.MODIFIER_STATES = ['OFF', 'ONESHOT', 'LOCKED', 'TOGGLE_LOCKED'];
FE.GESTURE_FIELDS = ['tap', 'doubleTap', 'swipe', 'longPress', 'hold', 'drag'];
/* 单槽手势（swipe / drag 是四方向映射，单独处理）—— 引用收集、重命名、编译都按这份清单走，
 * 免得每处各抄一遍数组、新加手势时漏改其中一处。 */
FE.GESTURE_SLOTS = ['tap', 'doubleTap', 'longPress', 'hold', 'drag'];
FE.SWIPE_DIRS = ['up', 'down', 'left', 'right'];
/* drag 的四个方向与「松手动作」槽位（end / endAction / endActions 三者等价，归一到 end） */
FE.DRAG_DIRS = ['up', 'down', 'left', 'right'];
FE.DRAG_END_SLOTS = ['end', 'endAction', 'endActions'];
/* drag 步进反馈（缺省 vibrate） */
FE.DRAG_FEEDBACKS = ['none', 'vibrate', 'key'];
/* 状态条件叶子键（都是布尔）+ 组合键（都是条件数组） */
FE.STATUS_CONDS = ['composing', 'ascii_mode', 'disabled'];
FE.STATUS_OPTION_KEYS = ['option', 'value', 'options'];
FE.STATUS_GROUPS = ['all_of', 'any_of', 'none_of'];
/* 常开选项名：不必由活动 schema 的 switches 声明也始终可用 */
FE.ALWAYS_ON_OPTIONS = ['full_shape', 'simplification', 'traditional', 'ascii_punct'];

/* 键字段清单（放置/定义均可使用的补丁字段） */
FE.KEY_FIELD_NAMES = ['label', 'shiftedLabel', 'weight', 'height', 'modifier', 'keyType', 'id',
  'statusLabel', 'textSize', 'hintTextSize', 'icon', 'colors',
  'tap', 'doubleTap', 'swipe', 'longPress', 'hold', 'drag', 'variants'];
})();
