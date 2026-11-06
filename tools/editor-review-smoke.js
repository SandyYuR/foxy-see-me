'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
let checks = 0;
function ok(value, message) {
  assert.ok(value, message); checks++; console.log('✓ ' + message);
}
function eq(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message); checks++; console.log('✓ ' + message);
}
require('./browser-harness').run(async ({ send, ev, ready, sleep, root, errors }) => {
  const out = path.join(root, '..', 'audit', 'editor-review');
  fs.mkdirSync(out, { recursive: true });
  const page = (fn, ...args) => ev('(' + fn.toString() + ')(' + args.map(v => JSON.stringify(v)).join(',') + ')');
  const settle = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function reload() { await send('Page.reload'); await sleep(200); await ready(); await settle(); }
  const chooseKind = kind => page(kind => {
    const select = document.getElementById('sym-kind');
    select.focus(); select.value = kind; select.dispatchEvent(new Event('change', { bubbles: true }));
  }, kind);
  const editJson = text => page(text => {
    const ta = document.getElementById('sym-json');
    ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  const readSymbols = () => page(() => ({ profiles: FE.state.symbolProfiles, files: FE.state.symbolFileNames, legacy: FE.state.symbolLegacy }));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page(() => {
    FE.activateTab('tab-symbols');
    for (const kind of ['symbols', 'emoji', 'kaomoji']) {
      FE.loadSymbolProfileText(JSON.stringify({ type: 'foxy.' + kind, multiLine: kind === 'kaomoji',
        groups: [{ names: { zh: kind }, symbols: [kind + ' 原始内容'] }] }), kind, kind + '-review.json');
    }
    FE.mutate(() => FE.state.symbolProfile.groups[0].symbols.push('图形修改'));
  });
  const beforeApply = await readSymbols(), history = await page(() => FE.state.history.length);
  const changed = JSON.parse(JSON.stringify(beforeApply.profiles.kaomoji));
  changed.groups[0].symbols.push('JSON 修改');
  await editJson(JSON.stringify(changed));
  await page(() => document.getElementById('sym-json-apply').click());
  eq(await page(() => FE.state.history.length), history + 1, '应用符号 JSON 只增加一个撤销点');
  eq(await page(() => FE.state.symbolProfile), changed, 'JSON 修改已写入正式文档');
  await page(() => document.getElementById('top-undo').click());
  eq(await readSymbols(), beforeApply, '撤销 JSON 应用完整恢复文档、文件名与旧格式标记');
  await page(() => document.getElementById('top-redo').click());
  eq(await page(() => FE.state.symbolProfile), changed, '重做重新应用符号 JSON');
  const beforeInvalid = await readSymbols(), invalidHistory = await page(() => FE.state.history.length);
  await editJson('{ "type":');
  await page(() => document.getElementById('sym-json-apply').click());
  eq(await readSymbols(), beforeInvalid, '无效 JSON 不修改任何符号文档');
  eq(await page(() => FE.state.history.length), invalidHistory, '失败的 JSON 应用不污染撤销栈');
  ok(await page(() => document.getElementById('sym-json-status').textContent.includes('JSON 解析失败')),
    'JSON 应用失败显示具体原因');

  const drafts = { symbols: '{ "type": "foxy.symbols", "未完成":',
    emoji: '{ "type": "foxy.emoji", "草稿": [ ', kaomoji: '{ "type": "foxy.kaomoji", "保留":\n  ' };
  const committed = await readSymbols(), draftHistory = await page(() => FE.state.history.length);
  for (const kind of Object.keys(drafts)) {
    await chooseKind(kind);
    eq(await page(() => document.querySelector('.sym-pv-cell').textContent), kind + ' 原始内容',
      kind + ' 下拉切换后预览立即更新');
    await editJson(drafts[kind]);
  }
  for (const kind of Object.keys(drafts)) {
    await chooseKind(kind);
    eq(await page(() => document.getElementById('sym-json').value), drafts[kind], kind + ' 独立保留未应用 JSON');
  }
  eq(await readSymbols(), committed, '切类别与保存草稿不会自动应用 JSON');
  ok(await page(() => ['symbols', 'emoji', 'kaomoji'].every(kind =>
    document.getElementById(kind + '-file-status').textContent.includes('有未应用 JSON 草稿'))),
    '文件状态分别提示三类尚未应用的草稿');
  eq(await page(() => FE.state.history.length), draftHistory, '类别导航与未应用草稿不增加撤销点');
  await page(() => FE.autosaveDraft()); await reload();
  eq(await page(() => FE.readSymbolJsonDrafts()), drafts, '刷新恢复三类 JSON 草稿');
  eq(await readSymbols(), committed, '刷新只恢复草稿，不改变已应用文件');
  for (const kind of Object.keys(drafts)) {
    await chooseKind(kind);
    eq(await page(() => document.getElementById('sym-json').value), drafts[kind], kind + ' 刷新后仍显示对应原文');
  }
  // Older caches stored just one auxiliaryJson.symbol string.
  const legacyDraft = '{ "旧缓存": "仍未完成';
  await page(text => {
    FE.autosaveDraft();
    const cached = JSON.parse(localStorage.getItem(FE.DRAFT_STORAGE_KEY));
    delete cached.workspace.auxiliaryJson.symbols;
    cached.workspace.auxiliaryJson.symbol = text;
    cached.workspace.symbolKind = 'kaomoji'; cached.symbolKind = 'kaomoji';
    FE.state.cacheRestoring = true;
    localStorage.setItem(FE.DRAFT_STORAGE_KEY, JSON.stringify(cached));
  }, legacyDraft);
  await reload();
  eq(await page(() => FE.readSymbolJsonDraft()), legacyDraft, '兼容旧缓存的单份符号草稿');

  // Finish a slow legacy-file read after the user has already changed category.
  await chooseKind('kaomoji');
  const beforeImport = await readSymbols(), importHistory = await page(() => FE.state.history.length);
  await page(() => {
    window.originalReviewReader = FileReader;
    window.FileReader = class { readAsText() { window.pendingReviewReader = this; } };
    const input = document.getElementById('sym-import-file'), transfer = new DataTransfer();
    transfer.items.add(new File(['[]'], 'legacy-kaomoji.json', { type: 'application/json' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await chooseKind('emoji');
  await page(() => {
    window.FileReader = originalReviewReader;
    pendingReviewReader.result = JSON.stringify([{ names: { zh: '旧格式' }, symbols: ['(づ￣ ³￣)づ'] }]);
    pendingReviewReader.onload();
  });
  ok(await page(() => FE.state.symbolKind === 'kaomoji' && FE.state.symbolLegacy.kaomoji &&
    FE.state.symbolFileNames.kaomoji === 'legacy-kaomoji.json'), '异步导入使用选文件时的类别');
  eq(await page(() => FE.state.symbolProfiles.emoji), beforeImport.profiles.emoji, '读取期间切类别不会覆盖另一个文件');
  eq(await page(() => FE.state.history.length), importHistory + 1, '符号文件导入是一条独立事务');
  await page(() => document.getElementById('top-undo').click());
  eq(await readSymbols(), beforeImport, '撤销导入恢复文件和元数据');
  await page(() => document.getElementById('top-redo').click());
  const beforeExample = await readSymbols();
  await page(() => {
    document.getElementById('sym-example').value = 'kaomoji';
    document.getElementById('sym-load-example').click();
  });
  ok(await page(() => !FE.state.symbolLegacy.kaomoji), '载入现代示例清除旧格式提示');
  await page(() => document.getElementById('top-undo').click());
  eq(await readSymbols(), beforeExample, '载入示例也可完整撤销');

  await editJson(JSON.stringify({ type: 'foxy.emoji', groups: [{ names: { zh: '改类型' }, symbols: ['🙂'] }] }));
  await page(() => document.getElementById('sym-json-apply').click()); await settle();
  eq(await page(() => FE.state.symbolKind), 'emoji', 'JSON 应用也根据显式类型切换类别');
  ok(await page(() => {
    const cached = JSON.parse(localStorage.getItem(FE.DRAFT_STORAGE_KEY));
    return !Object.prototype.hasOwnProperty.call(FE.readSymbolJsonDrafts(), 'kaomoji') &&
      !Object.prototype.hasOwnProperty.call(cached.workspace.auxiliaryJson.symbols, 'kaomoji');
  }), '跨类别应用后，原类别不会残留已应用草稿或旧缓存');

  for (const spec of [
    { type: 'text', text: '  第一行\n第二行\t ' },
    { type: 'commit', text: '\t 第一行\r\n第二行  ' },
    { type: 'app', command: 'commit_text', argument: '  第一行\r\n第二行\t ' }
  ]) {
    const result = await page(spec => {
      const editor = FE.buildActionEditor(spec);
      document.body.appendChild(editor.el);
      const value = editor.getValue(), input = editor.el.querySelector('textarea');
      input.value = ' \n\t '; input.dispatchEvent(new Event('change', { bubbles: true }));
      const edited = editor.getValue(); editor.el.remove();
      return { value, edited, usesTextarea: !!input };
    }, spec);
    eq(result.value, spec, spec.command || spec.type + ' 未修改文本按原文往返');
    ok(result.usesTextarea, (spec.command || spec.type) + ' 使用可输入换行的文本框');
    eq(result.edited[spec.type === 'app' ? 'argument' : 'text'], ' \n\t ', '纯空白文字也可以作为输入内容保存');
  }
  for (const spec of [{ type: 'text', text: '初始内容' }, { type: 'app', command: 'commit_text', argument: '初始内容' }]) {
    const restored = await page(spec => {
      const editor = FE.buildActionEditor(spec); document.body.appendChild(editor.el);
      const saved = FE.readEditorFields(editor.el);
      const text = saved.find(field => field.tag === 'TEXTAREA');
      text.tag = 'INPUT'; text.type = 'text'; text.value = '未应用的旧草稿';
      FE.restoreEditorFields(editor.el, saved);
      const value = editor.getValue(); editor.el.remove(); return value;
    }, spec);
    eq(restored[spec.type === 'app' ? 'argument' : 'text'], '未应用的旧草稿', '旧单行文字控件的草稿可以迁移恢复');
  }
  ok(await page(() => {
    const root = document.createElement('div'), textarea = document.createElement('textarea');
    textarea.value = '保留'; root.appendChild(textarea); document.body.appendChild(root);
    FE.restoreEditorFields(root, [{ tag: 'INPUT', type: 'text', value: '不应覆盖', checked: false }]);
    const unchanged = textarea.value === '保留'; root.remove(); return unchanged;
  }), '迁移只针对动作文字控件，不放松其它表单的类型检查');
  const switched = await page(() => {
    let changes = 0;
    const editor = FE.buildActionEditor({ type: 'app', command: 'commit_text', argument: '  两行\n文字  ' },
      { onChange: () => changes++ });
    document.body.appendChild(editor.el);
    const command = editor.el.querySelector('.action-fields select');
    for (const value of ['select_schema', 'commit_text']) {
      command.value = value; command.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const value = editor.getValue();
    editor.el.querySelector('textarea').value = '修改\n内容';
    editor.el.querySelector('textarea').dispatchEvent(new Event('change', { bubbles: true }));
    editor.el.remove(); return { value, changes };
  });
  eq(switched.value.argument, '  两行\n文字  ', '切换命令控件保留尚未修改的多行参数');
  eq(switched.changes, 3, '动态参数控件每次修改只通知一次');

  await page(() => {
    FE.activateTab('tab-theme');
    FE.loadThemeProfileText(JSON.stringify({ type: 'foxy.keyboard-theme', name: '连续编辑',
      light: { wholeKeyboardImageTransform: { scale: 1 } }, dark: {} }));
    document.querySelector('[data-theme-field="wholeKeyboardImageTransform.scale"]').focus();
  });
  const fieldHistory = await page(() => FE.state.history.length);
  for (let i = 0; i < 2; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  }
  eq(await page(() => FE.state.themeProfile.light.wholeKeyboardImageTransform.scale), 1.2, '方向键可连续调整背景参数');
  eq(await page(() => document.activeElement.getAttribute('data-theme-field')), 'wholeKeyboardImageTransform.scale',
    '连续调整后焦点仍在当前输入框');
  eq(await page(() => FE.state.history.length), fieldHistory + 2, '每次参数调整只有一个撤销点');
  await page(() => {
    const input = document.querySelector('[data-theme-field="wholeKeyboardImage"]');
    input.focus();
  });
  await send('Input.insertText', { text: 'backgrounds/review.png' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  eq(await page(() => FE.state.themeProfile.light.wholeKeyboardImage), 'backgrounds/review.png', 'Tab 离开图片路径时正常提交');
  eq(await page(() => document.activeElement.getAttribute('data-theme-field')), 'wholeKeyboardImageTransform.scale',
    '提交后 Tab 自然进入下一个控件');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await page(() => document.getElementById('th-backgrounds').scrollIntoView({ block: 'start' })); await settle();
  ok(await page(() => document.documentElement.scrollWidth <= innerWidth), '手机背景表单没有横向溢出');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'mobile-backgrounds.png'), Buffer.from(screenshot.data, 'base64'));

  const beforeTextDraft = await page(() => FE.state.profile);
  const mobileText = '  手机上输入第一行\n第二行保留空白  ';
  await page(() => {
    FE.activateTab('tab-layout'); document.querySelector('#preview-kb .kb-key').click();
    document.querySelector('[data-slot="swipe.up"]').click();
    const source = document.querySelector('.inline-gesture-body select');
    source.value = 'direct'; source.dispatchEvent(new Event('change', { bubbles: true }));
    const type = document.querySelector('.inline-gesture-body .action-editor select');
    type.value = 'text'; type.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.inline-gesture-body textarea[aria-label="文本内容"]').focus();
  });
  await send('Input.insertText', { text: mobileText });
  await page(() => FE.autosaveDraft()); await reload();
  eq(await page(() => document.querySelector('.inline-gesture-body textarea[aria-label="文本内容"]').value),
    mobileText, '手机属性面板中的多行文字草稿刷新后完整恢复');
  eq(await page(() => FE.state.profile), beforeTextDraft, '恢复文字草稿不会自动写入布局');
  ok(await page(() => {
    const input = document.querySelector('.inline-gesture-body textarea[aria-label="文本内容"]');
    input.scrollIntoView({ block: 'center' });
    const box = input.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
  }), '手机多行文字控件完整显示在属性面板内');
  const textScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'mobile-text-action.png'), Buffer.from(textScreenshot.data, 'base64'));
  ok(errors.length === 0, '审阅回归没有浏览器异常');
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, status: 'passed' }, null, 2));
}).then(() => console.log(checks + ' editor review checks passed')).catch(error => {
  console.error(error.stack); process.exitCode = 1;
});
