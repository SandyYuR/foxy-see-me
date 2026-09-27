/* 小狐狸 see me — 颜色全链路解析模块测试（js/color-source.js）
 * 用法: node test/test-color-source.js
 *
 * 独立成文件的原因：这套断言的**唯一依据是 App 端反编译源码**
 * （见 foxy/foxy-render-spec.md 与 foxy-app-format-baseline.md），
 * 需要逐条对照行号验证；与 test-core.js 的其余主题断言分开更好定位。
 *
 * 对照的 App 方法：
 *   m00.c(键, pressed, modifierActive, modifierLocked)  ← 整键 10 角色瀑布（m00.java:205-345）
 *   m00.i(键, 方向, ...)                                ← 方向提示色回落（m00.java:781-832）
 *   m00.k(键, ...)                                      ← 运行时状态优先级（m00.java:128-148）
 *   v40.e()                                             ← 修饰激活用 accentColor（v40.java:346-371）
 *   m00.f()/e()                                         ← 容器底色（m00.java:733-750）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 与 test-core.js 相同的浏览器垫片：app.js 的 UI 段因缺 #preview-kb 自动跳过 */
global.window = global;
function load(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInThisContext(code, { filename: file });
}
load('data.js');
load('default-profile.js');
load('app.js');
load('theme-editor.js');
load('color-source.js');

const FE = global.FE;
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, msg + ' — 期望 ' + jb + ' 实际 ' + ja);
}

/* 一份最小主题：全局 26 色 + FUNCTION 的 keyTypes（含方向与 hint） */
function makeTheme(over) {
  const light = {
    keyTextColor: '#FF111111',
    keyBackgroundColor: '#FF222222',
    keyPressedColor: '#FF333333',
    keyBorderColor: '#FF444444',
    keyShadowColor: '#FF555555',
    keyHintTextColor: '#FF666666',
    keyHintTextTopColor: '#FF700000',
    altKeyboardColor: '#FF888888',
    keyboardColor: '#FF999999',
    candidateBarColor: '#FFAAAAAA',
    accentColor: '#FFFF00FF',
    keyTypes: {
      /* ⚠️ 主题 keyTypes 里的方向字段名是 hintUp/hintDown（uk.java:121），
       * 而**布局** colors 里叫 hintTop/hintBottom（SKILL.md:914-915）。两套命名不同，
       * 这里刻意用对的那套，防止把布局命名误当成主题命名。 */
      FUNCTION: { background: '#FFBBBBBB', text: '#FFCCCCCC', hint: '#FFDDDDDD' },
      ACTION: { hintUp: '#FFEE0000' }
    }
  };
  if (over && over.light) Object.assign(light, over.light);
  const p = { type: 'foxy.keyboard-theme', name: 'test', light: light, dark: {} };
  return FE.normalizeThemeProfile(p);
}

const savedProfile = FE.state.themeProfile;
const savedSlot = FE.state.themeSlot;
function withTheme(p, slot, fn) {
  try {
    FE.state.themeProfile = p;
    FE.state.themeSlot = slot || 'light';
    fn();
  } finally {
    FE.state.themeProfile = savedProfile;
    FE.state.themeSlot = savedSlot;
  }
}

/* ---------------- 模块存在性 ---------------- */
console.log('== 模块导出 ==');
ok(typeof FE.resolveRole === 'function', 'FE.resolveRole 存在');
ok(typeof FE.resolveKeyColors === 'function', 'FE.resolveKeyColors 存在');
ok(typeof FE.resolveThemeField === 'function', 'FE.resolveThemeField 存在');
ok(typeof FE.resolveKeyboardColor === 'function', 'FE.resolveKeyboardColor 存在');
ok(typeof FE.resolveCandidateBarColor === 'function', 'FE.resolveCandidateBarColor 存在');
ok(typeof FE.colorEffectText === 'function', 'FE.colorEffectText 存在');
eq(FE.COLOR_ROLES.length, 10, '10 个颜色角色');

/* ---------------- 四级瀑布（非方向角色） ---------------- */
console.log('\n== 四级瀑布：text / background ==');
withTheme(makeTheme(), 'light', () => {
  /* 全空 → 落到主题全局（④） */
  const bare = { keyType: 'LETTER' };
  let r = FE.resolveRole('text', bare, {});
  eq(r.value, '#FF111111', '无布局 colors 时 text 取主题全局 keyTextColor（④）');
  eq(r.source, FE.COLOR_SOURCES.THEME_GLOBAL, '来源标注为主题全局');
  eq(r.detail, 'keyTextColor', '来源细节是字段名');

  /* ② 布局每键覆盖胜过 ③ 主题 keyTypes */
  const withKey = { keyType: 'FUNCTION', colors: { text: '#FF0A0B0C' } };
  r = FE.resolveRole('text', withKey, {});
  eq(r.value, '#FF0A0B0C', '布局每键 colors 胜过主题 keyTypes（② > ③）');
  eq(r.source, FE.COLOR_SOURCES.LAYOUT_KEY, '来源标注为布局按键 colors');

  /* ③ 主题 keyTypes 胜过 ④ 全局 */
  const ktOnly = { keyType: 'FUNCTION' };
  r = FE.resolveRole('background', ktOnly, {});
  eq(r.value, '#FFBBBBBB', 'keyTypes.background 胜过全局 keyBackgroundColor（③ > ④）');
  eq(r.source, FE.COLOR_SOURCES.THEME_KEYTYPE, '来源标注为主题 keyTypes');

  /* ③ 未定义的键类型 → 回落 ④ */
  const actionKey = { keyType: 'ACTION' };
  r = FE.resolveRole('background', actionKey, {});
  eq(r.value, '#FF222222', 'ACTION 未给 background → 回落全局（④）');

  /* ① 状态色胜过 ② */
  const withState = {
    keyType: 'FUNCTION',
    colors: { text: '#FF0A0B0C', states: { pressed: { text: '#FF0D0E0F' } } }
  };
  r = FE.resolveRole('text', withState, { pressed: true });
  eq(r.value, '#FF0D0E0F', 'states.pressed.text 胜过每键 colors（① > ②）');
  eq(r.source, FE.COLOR_SOURCES.LAYOUT_STATE, '来源标注为布局状态色');
  /* 未按下时不应用该状态 */
  r = FE.resolveRole('text', withState, { pressed: false });
  eq(r.value, '#FF0A0B0C', '未按下时不应用 states.pressed');
});

/* ---------------- 运行时状态优先级 ---------------- */
console.log('\n== 状态优先级：pressed > modifierLocked > modifierActive ==');
eq(FE.currentKeyState({ pressed: true, modifierActive: true, modifierLocked: true }), 'pressed',
  'pressed 优先级最高（m00.k）');
eq(FE.currentKeyState({ modifierActive: true, modifierLocked: true }), 'modifierLocked',
  'locked 高于 active');
eq(FE.currentKeyState({ modifierActive: true }), 'modifierActive', '仅 active');
eq(FE.currentKeyState({}), null, '无状态返回 null');

/* ---------------- 方向提示色的逐层回落（最易做错） ---------------- */
console.log('\n== 方向提示色回落链 ==');
withTheme(makeTheme(), 'light', () => {
  /* 完整链：keyTypes[方向] > keyTypes.hint > 槽位[方向] > 槽位.hint */
  const t = makeTheme();
  FE.state.themeProfile = t;

  /* FUNCTION 有 hint（#FFDDDDDD）但没有 hintUp；槽位有 keyHintTextTopColor（#FF700000）
   * → 按 App 端 m00.java:265-272，keyTypes.hint **优先于** 槽位方向色 */
  let r = FE.resolveRole('hintTop', { keyType: 'FUNCTION' }, {});
  eq(r.value, '#FFDDDDDD', 'keyTypes.hint 优先于槽位方向色（反直觉，易做错）');
  eq(r.source, FE.COLOR_SOURCES.THEME_KEYTYPE_HINT, '来源标注为 keyTypes 的 hint');

  /* ACTION 有 hintTop（#FFEE0000）→ 方向色最优先 */
  r = FE.resolveRole('hintTop', { keyType: 'ACTION' }, {});
  eq(r.value, '#FFEE0000', 'keyTypes 方向色最优先（③）');

  /* LETTER 无 keyTypes 分组 → 落到槽位方向色 */
  r = FE.resolveRole('hintTop', { keyType: 'LETTER' }, {});
  eq(r.value, '#FF700000', '无 keyTypes 时用槽位方向色（④）');
  eq(r.source, FE.COLOR_SOURCES.THEME_GLOBAL, '来源为主题全局');

  /* ACTION 的 hintBottom 未给、无 hint、槽位也无 keyHintTextBottomColor → 槽位 hint */
  r = FE.resolveRole('hintBottom', { keyType: 'ACTION' }, {});
  eq(r.value, '#FF666666', '逐层回落最终到槽位 keyHintTextColor');

  /* ① 状态的方向色最优先 */
  const st = {
    keyType: 'ACTION',
    colors: { states: { pressed: { hintTop: '#FF010203' } } }
  };
  r = FE.resolveRole('hintTop', st, { pressed: true });
  eq(r.value, '#FF010203', '状态方向色最优先（①）');

  /* ② 布局每键方向色胜过 ③ */
  const lk = { keyType: 'ACTION', colors: { hintTop: '#FF040506' } };
  r = FE.resolveRole('hintTop', lk, {});
  eq(r.value, '#FF040506', '布局每键方向色胜过 keyTypes（② > ③）');
});

/* ---------------- 修饰激活 → accentColor ---------------- */
console.log('\n== 修饰键激活用 accentColor（v40.e） ==');
withTheme(makeTheme(), 'light', () => {
  const eff = { keyType: 'FUNCTION', modifier: 'SHIFT' };
  let res = FE.resolveKeyColors(eff, { modifierActive: true });
  ok(res.textFromAccent, '修饰激活时标记 textFromAccent');
  eq(res.roles.text.value, '#FFFF00FF', '文字色升级为主题 accentColor');
  eq(res.roles.text.detail, 'accentColor', '来源细节标 accentColor');

  /* 未激活时不升级 */
  res = FE.resolveKeyColors(eff, {});
  ok(!res.textFromAccent, '未激活时不标记');
  eq(res.roles.text.value, '#FFCCCCCC', '未激活时用 keyTypes.text');

  /* 按下时也不走 accent（App 是 pressed 优先） */
  res = FE.resolveKeyColors(eff, { pressed: true });
  ok(!res.textFromAccent, '按下时不走 accentColor');
});

/* ---------------- 未导入主题：回归语义 ---------------- */
console.log('\n== 未导入主题 ==');
try {
  FE.state.themeProfile = null;
  const r = FE.resolveRole('text', { keyType: 'LETTER' }, {});
  eq(r.value, null, '未导入主题且无布局色 → null（预览不写内联色）');
  eq(r.source, null, '来源为 null');
  /* includeBuiltin 时才给内置默认 */
  const r2 = FE.resolveRole('text', { keyType: 'LETTER' }, { includeBuiltin: true });
  eq(r2.value, '#FF212121', 'includeBuiltin 时给出 App 内置 light 默认 keyTextColor');
  eq(r2.source, FE.COLOR_SOURCES.BUILTIN, '来源标注为内置默认');

  /* 有布局色时仍能取到（与主题无关） */
  const r3 = FE.resolveRole('text', { keyType: 'LETTER', colors: { text: '#FF0F0F0F' } }, {});
  eq(r3.value, '#FF0F0F0F', '无主题时布局色照常解析');
  eq(r3.source, FE.COLOR_SOURCES.LAYOUT_KEY, '来源标注为布局按键');
} finally {
  FE.state.themeProfile = savedProfile;
}

/* ---------------- 容器 / 非按键元素 ---------------- */
console.log('\n== 容器与其它元素 ==');
withTheme(makeTheme(), 'light', () => {
  /* 键盘底：border 开 → altKeyboardColor；关 → keyboardColor（m00.f:748-750） */
  eq(FE.resolveKeyboardColor(true).value, '#FF888888', 'border 启用用 altKeyboardColor');
  eq(FE.resolveKeyboardColor(false).value, '#FF999999', 'border 禁用回落 keyboardColor');

  /* 候选栏：border 关 → candidateBarColor；开 → 同键盘底（m00.e:733-735） */
  eq(FE.resolveCandidateBarColor(false).value, '#FFAAAAAA', 'border 关用 candidateBarColor');
  eq(FE.resolveCandidateBarColor(true).value, '#FF888888', 'border 开时候选栏改用键盘底色');

  /* 任意主题字段 */
  eq(FE.resolveThemeField('accentColor').value, '#FFFF00FF', '取 accentColor');
  eq(FE.resolveThemeField('keyboardColor').value, '#FF999999', '取 keyboardColor');
  eq(FE.resolveThemeField('popupTextColor').value, null, '本主题未给该字段 → null');
});

/* ---------------- 编辑面文案 ---------------- */
console.log('\n== 编辑面「当前生效 + 来源」文案 ==');
withTheme(makeTheme(), 'light', () => {
  let t = FE.colorEffectText('text', { keyType: 'FUNCTION' }, {});
  ok(t.value === '#FFCCCCCC', '文案给出生效值');
  ok(t.text.indexOf('#FFCCCCCC') >= 0, '文案含色值');
  ok(t.text.indexOf('主题 keyTypes') >= 0, '文案说明来源是主题 keyTypes');
  ok(t.text.indexOf('改主题即同步') >= 0, '文案提示改主题会同步');

  t = FE.colorEffectText('text', { keyType: 'FUNCTION', colors: { text: '#FF0A0B0C' } }, {});
  ok(t.text.indexOf('本键自己的设置') >= 0, '有本键值时标注为本键自己的设置');

  t = FE.colorEffectText('popupTextColor', { keyType: 'LETTER' }, {});
  ok(t.text.indexOf('未定义') >= 0, '无定义时明确说明');
});

/* ---------------- 颜色转换 ---------------- */
console.log('\n== ARGB → CSS 转换 ==');
eq(FE.colorToCss('#FF0D0E0F'), '#0D0E0FFF', '8 位 ARGB → RRGGBBAA');
eq(FE.colorToCss('#0D0E0F'), '#0D0E0F', '6 位原样');
eq(FE.colorToCss('bogus'), null, '非法值返回 null');

/* ---------------- 归一化容错 ---------------- */
console.log('\n== 颜色归一化容错 ==');
eq(FE.colorNorm('#FFF'), '#FFFFFFFF', '#RGB 展开');
eq(FE.colorNorm('#8123'), '#88112233', '#ARGB 展开');
eq(FE.colorNorm('#123456'), '#FF123456', '#RRGGBB 补 alpha');
eq(FE.colorNorm('#80123456'), '#80123456', '#AARRGGBB 原样（大写化）');
eq(FE.colorNorm('#zzz'), null, '非法值 null');

/* ---------------- 两条解析路径必须一致（预览 vs 编辑面） ---------------- */
console.log('\n== 一致性：themeKeyColors（预览）vs resolveRole（编辑面） ==');
withTheme(makeTheme(), 'light', () => {
  /* 预览走 theme-editor.js 的 FE.themeKeyColors（③④ 合成），
   * 编辑面走 color-source.js 的 FE.resolveRole。两者是**独立实现**，
   * 必须给出相同颜色 —— 否则用户会看到「预览一个色、编辑面写另一个色」，
   * 正是本次要消除的「对不上」问题。这条断言就是防止两条链各自漂移。 */
  const map = {
    text: 'text', background: 'background', pressed: 'pressed',
    border: 'border', shadow: 'shadow', hint: 'hint',
    /* ⚠️ 命名差：color-source 用布局口径 hintTop/hintBottom，
     *    themeKeyColors 用 keyTypes 口径 hintUp/hintDown。 */
    hintTop: 'hintUp', hintBottom: 'hintDown',
    hintLeft: 'hintLeft', hintRight: 'hintRight'
  };
  ['LETTER', 'FUNCTION', 'ACTION'].forEach(function (kt) {
    const tk = FE.themeKeyColors(kt);
    ok(!!tk, kt + '：themeKeyColors 有返回');
    Object.keys(map).forEach(function (role) {
      const r = FE.resolveRole(role, { keyType: kt }, {});
      eq(r.value, tk[map[role]], kt + ' 的 ' + role + '：预览与编辑面解析一致');
    });
  });
});

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
