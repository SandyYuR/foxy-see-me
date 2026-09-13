/* 小狐狸 see me — Foxy 键盘布局可视化编辑器
 * data.js — 内置按键注册表（rime.* / foxy.*）、KeyCode 名称表、App 命令表
 * 依据 DEFAULT_LAYOUT_V0.0.1.md（Foxy Layout File v0.0.1）整理。
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
 * App 命令表（动作 {type:'app'} 的 command 字段取值）
 * ------------------------------------------------------------------ */
FE.APP_COMMANDS = [
  ['symbols', '符号面板'], ['switch_symbols', '符号面板（别名）'],
  ['numpad', '数字键盘'], ['switch_numpad', '数字键盘（别名）'],
  ['emoji', 'Emoji 面板'], ['kaomoji', '颜文字面板'],
  ['settings', '设置'], ['schema_list', '方案列表'],
  ['data_directory_list', '数据目录选择'], ['data_dir_list', '数据目录选择（别名）'],
  ['deploy', '重新部署'], ['deploy_rime', '重新部署（别名）'],
  ['clipboard', '剪贴板'], ['theme', '主题'], ['theme_list', '主题列表'],
  ['voice', '语音'], ['voice_toggle', '语音切换'], ['voice_engine', '语音引擎'], ['voice_engine_list', '语音引擎列表'],
  ['ime_picker', '系统输入法选择'],
  ['floating_keyboard', '浮动键盘'], ['floating', '浮动键盘（别名）'],
  ['one_handed', '单手键盘'], ['one_handed_keyboard', '单手键盘（别名）'],
  ['keyboard_adjust_start', '开始键盘高度调整'], ['keyboard_adjust_end', '结束键盘高度调整'],
  ['undo', '撤销'], ['redo', '重做'],
  ['hide_keyboard', '收起键盘'],
  ['collapse_toolbar', '折叠工具栏'], ['expand_toolbar', '展开工具栏'],
  ['toggle_toolbar_container', '工具栏容器开关'],
  ['toggle_switch', '开关面板'], ['expand_switches', '展开开关'],
  ['voice_start', '开始语音'], ['voice_stop', '结束语音'],
  ['commit_text', '上屏文本（需参数）']
];

/* 支持的 keyType / 图标 / 修饰键取值 */
FE.KEY_TYPES = ['LETTER', 'FUNCTION', 'ACTION'];
FE.ICONS = ['backspace', 'shift', 'enter', 'return'];
FE.MODIFIERS = ['SHIFT', 'CTRL'];
FE.GESTURE_FIELDS = ['tap', 'doubleTap', 'swipe', 'longPress', 'hold'];
FE.SWIPE_DIRS = ['up', 'down', 'left', 'right'];
FE.STATUS_CONDS = ['composing', 'ascii_mode', 'disabled'];

/* 键字段清单（放置/定义均可使用的补丁字段） */
FE.KEY_FIELD_NAMES = ['label', 'shiftedLabel', 'weight', 'height', 'modifier', 'keyType', 'id',
  'statusLabel', 'textSize', 'hintTextSize', 'icon', 'colors',
  'tap', 'doubleTap', 'swipe', 'longPress', 'hold', 'variants'];
})();
