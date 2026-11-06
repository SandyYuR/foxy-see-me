'use strict';
// The DOM stub cannot measure glyphs or ResizeObserver, so use the real browser.
const fs = require('fs'), path = require('path');
let checks = 0;
function ok(value, message) {
  if (!value) throw Error(message);
  checks++;
  console.log('✓ ' + message);
}
require('./browser-harness').run(async ({ send, ev, ready, sleep, root, errors }) => {
  const out = path.join(root, '..', 'audit', 'app-alignment');
  fs.mkdirSync(out, { recursive: true });
  const measurements = [];
  const page = (fn, ...args) => ev('(' + fn.toString() + ')(' + args.map(value => JSON.stringify(value)).join(',') + ')');
  const original = {
    type: 'foxy.kaomoji', multiLine: true,
    groups: [{ names: { zh: '一个很长的颜文字分组名称', en: 'Faces' }, symbols: [
      '^_^', '(づ￣ ³￣)づ', '(╯°□°）╯︵ ┻━┻   '.repeat(14),
      '保留原始\n换行与  连续空格', '超长测试'.repeat(180), ...Array(12).fill('(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧')
    ] }]
  };
  await page(fixture => {
    window.alignmentFixture = fixture;
    FE.activateTab('tab-symbols');
    FE.loadSymbolProfileText(JSON.stringify(fixture), 'symbols', '随便取名.json');
    FE.state.symbolPreviewGroup = 0;
    FE.ensureOpenSet('openSymbolGroups')[fixture.groups[0].names.zh] = true;
    FE.renderSymbolsTab(); FE.renderPreviewOnly();
  }, original);
  ok(await page(() => FE.state.symbolKind === 'kaomoji' && document.getElementById('sym-kind').value === 'kaomoji'),
    '新格式按 type 进入颜文字页，优先于当前类别与文件名');

  const settle = () => page(() => document.fonts.ready.then(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  async function measure(name) {
    await settle();
    const result = await page(() => {
      const labels = Array.from(document.querySelectorAll('#preview-kb .sym-fit-label, #sym-list .sym-fit-label'));
      const visible = labels.filter(label => label.getBoundingClientRect().width > 0);
      const overflowing = visible.filter(label => {
        const r = label.getBoundingClientRect(), c = label.parentElement.getBoundingClientRect();
        const s = getComputedStyle(label.parentElement);
        return r.left < c.left + parseFloat(s.paddingLeft) - 1 || r.right > c.right - parseFloat(s.paddingRight) + 1 ||
          r.top < c.top - 1 || r.bottom > c.bottom + 1 || /[\r\n\u2028\u2029]/.test(label.textContent);
      });
      const pv = Array.from(document.querySelectorAll('.sym-pv-cell .sym-fit-label'));
      return { count: visible.length, overflow: overflowing.map(e => e.textContent.slice(0, 20)),
        pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        portraitWidth: FE.state.portraitW, keyboardWidth: document.getElementById('preview-kb').clientWidth,
        columns: document.querySelector('.sym-pv-row').children.length,
        cellHeights: pv.map(e => e.parentElement.getBoundingClientRect().height),
        shortSize: parseFloat(getComputedStyle(pv[0]).fontSize),
        longSize: parseFloat(getComputedStyle(pv[2]).fontSize),
        longTransform: getComputedStyle(pv[2]).transform,
        parentSize: parseFloat(getComputedStyle(pv[2].parentElement).fontSize) };
    });
    measurements.push({ name, ...result });
    fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2));
    ok(result.count >= original.groups[0].symbols.length * 2, name + ' 同时检查预览与编辑列表');
    ok(result.overflow.length === 0, name + ' 所有文本完整单行容纳于格内');
    ok(result.pageWidth <= result.viewport, name + ' 页面没有横向溢出');
    ok(result.portraitWidth === result.keyboardWidth, name + ' 字号与格高按当前宽度缩放');
    ok(result.longSize < result.parentSize || result.longTransform !== 'none', name + ' 长文本确实自动缩小');
    ok(Math.max(...result.cellHeights) - Math.min(...result.cellHeights) < 1, name + ' 长文本不会撑高格子');
    return result;
  }
  for (const [name, width, mobile] of [['desktop', 1440, false], ['mobile', 390, true], ['narrow', 320, true], ['desktop-again', 1440, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile });
    await page(() => { FE.renderSymbolsTab(); FE.renderPreviewOnly(); });
    ok((await measure(name)).columns === 1, name + ' 颜文字每行一格');
    if (name === 'desktop' || name === 'mobile') {
      await page(() => document.getElementById('preview-kb').scrollIntoView({ block: 'center' }));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name + '-kaomoji.png'), Buffer.from(shot.data, 'base64'));
    }
  }
  ok(await page(() => JSON.stringify(FE.state.symbolProfile) === JSON.stringify(alignmentFixture)),
    '显示缩放不修改原始颜文字、空格或换行');
  await page(() => { document.getElementById('sym-list').querySelector('details').open = false; });
  await settle();
  await page(() => { document.getElementById('sym-list').querySelector('details').open = true; });
  await measure('reopened');
  await page(() => {
    const multiline = document.getElementById('sym-multiline');
    multiline.checked = false; multiline.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok((await measure('six-per-row')).columns === 6, '六格布局中的长文本同样缩小');
  await page(() => document.getElementById('top-undo').click());
  ok(await page(() => FE.state.symbolProfile.multiLine === true), '符号布局选项可撤销');
  await measure('undo');

  // Capture actual export Blobs without writing to the user's Downloads folder.
  await page(() => {
    window.downloadBlobs = [];
    window.originalBlobURL = URL.createObjectURL;
    URL.createObjectURL = blob => { downloadBlobs.push(blob); return originalBlobURL(blob); };
    HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('sym-export').click();
  });
  const exported = await page(() => downloadBlobs[downloadBlobs.length - 1].text().then(JSON.parse));
  ok(JSON.stringify(exported) === JSON.stringify(original), '实际符号导出保留 type 和全部原文');
  const stateBeforeBad = await page(() => JSON.stringify(FE.state.symbolProfiles));
  ok(await page(() => FE.loadSymbolProfileText('{"type":"foxy.keyboard-layout","groups":[]}', 'kaomoji', 'wrong.json')) === false,
    '误导入布局文件会被拒绝');
  ok(await page(() => JSON.stringify(FE.state.symbolProfiles)) === stateBeforeBad, '错误类型不覆盖既有符号文件');
  await page(() => FE.loadSymbolProfileText('{"type":"foxy.emoji","groups":[{"names":{"zh":"表情"},"symbols":["👨‍👩‍👧‍👦","❤️"]}]}', 'kaomoji', 'faces.json'));
  ok(await page(() => FE.state.symbolKind === 'emoji' && FE.state.symbolProfiles.kaomoji.groups[0].symbols.length === alignmentFixture.groups[0].symbols.length),
    '切到新版 Emoji 保留独立颜文字文档');

  const theme = { type: 'foxy.keyboard-theme', name: '新版主题测试',
    light: { waterRippleColor: '#80112233', candidateHighlightTextColor: '#FF234567',
      candidateHighlightCommentColor: '#FF345678', candidateLabelColor: '#FF456789',
      candidateHighlightLabelColor: '#FF56789A', preeditHighlightColor: '#FF6789AB',
      wholeKeyboardImage: 'backgrounds/整张.png', wholeKeyboardImageTransform: { scale: 1.2, offsetX: 0.2, offsetY: -0.3 },
      keyboardBackgroundImage: 'backgrounds/按键.png', keyboardBackgroundScale: 'contain',
      candidateBarImage: 'backgrounds/候选.png', candidateBarImageScale: 'fill', backgroundBlurRadius: 12,
      customExtension: { keep: true } }, dark: { keyboardColor: '#FF121212', backgroundBlurRadius: 5 } };
  await page(fixture => {
    FE.activateTab('tab-theme'); FE.loadThemeProfileText(JSON.stringify(fixture));
    window.setAlignmentField = (name, value) => {
      const el = document.querySelector('#th-backgrounds [data-theme-field="' + name + '"]');
      el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
    };
  }, theme);
  ok(await page(() => document.querySelectorAll('#th-colors .color-input').length === 34), '六个新增颜色字段都可编辑');
  ok(await page(() => Array.from(document.querySelectorAll('.th-background-path')).every(e => e.getBoundingClientRect().height <= 48)),
    '图片路径保持紧凑的单行输入框');
  ok(await page(() => document.querySelector('[data-theme-field=keyboardBackgroundScale]').value === 'contain'),
    '背景缩放下拉回显与保存值一致');
  const beforeEdit = await page(() => JSON.stringify(FE.state.themeProfile)), history = await page(() => FE.state.history.length);
  await page(() => setAlignmentField('wholeKeyboardImageTransform.scale', '2.5'));
  ok(await page(() => FE.state.history.length) === history + 1, '背景参数修改只有一个撤销点');
  ok(await page(() => FE.state.themeProfile.light.wholeKeyboardImageTransform.offsetY === -0.3 && FE.state.themeProfile.dark.backgroundBlurRadius === 5),
    '修改缩放保留其余参数及另一配色槽');
  await page(() => document.getElementById('top-undo').click());
  ok(await page(() => JSON.stringify(FE.state.themeProfile)) === beforeEdit, '背景参数完整撤销');
  await page(() => {
    document.getElementById('top-redo').click();
    setAlignmentField('wholeKeyboardImageTransform.scale', '99'); setAlignmentField('backgroundBlurRadius', '99');
  });
  ok(await page(() => FE.state.themeProfile.light.wholeKeyboardImageTransform.scale === 4 && FE.state.themeProfile.light.backgroundBlurRadius === 25),
    '图形控件按 App 范围限制缩放和模糊值');
  await page(() => {
    setAlignmentField('keyboardBackgroundScale', 'cover');
    setAlignmentField('candidateBarImage', 'backgrounds/新候选.png'); document.getElementById('th-export').click();
  });
  const themeExport = await page(() => downloadBlobs[downloadBlobs.length - 1].text().then(JSON.parse));
  ok(themeExport.light.keyboardBackgroundScale === 'cover' && themeExport.light.candidateBarImage === 'backgrounds/新候选.png',
    '主题实际导出包含编辑后的图片字段');
  ok(themeExport.light.customExtension.keep && themeExport.light.waterRippleColor === '#80112233', '导出保留新增颜色和未知扩展');
  await page(fixture => { FE.loadThemeProfileText(JSON.stringify(fixture)); FE.autosaveDraft(); }, themeExport);
  await send('Page.reload'); await sleep(250); await ready(); await settle();
  ok(await page(() => FE.state.themeProfile.light.candidateBarImage === 'backgrounds/新候选.png' &&
    document.querySelector('[data-theme-field=keyboardBackgroundScale]').value === 'cover'),
    '重新导入和刷新恢复后，背景配置不丢失');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await page(() => document.getElementById('th-backgrounds').scrollIntoView({ block: 'start' })); await settle();
  ok(await page(() => document.documentElement.scrollWidth <= innerWidth), '背景表单在手机宽度下无横向溢出');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, 'mobile-theme.png'), Buffer.from(shot.data, 'base64'));

  for (const command of ['copy', 'cut', 'paste', 'select_all']) {
    const result = await page(command => {
      const editor = FE.buildActionEditor({ type: 'app', command });
      document.body.appendChild(editor.el);
      const result = { selected: editor.el.querySelector('.action-fields select').value, value: editor.getValue() };
      editor.el.remove(); return result;
    }, command);
    ok(result.selected === command && result.value.type === 'app' && result.value.command === command, command + ' 动作回显及保存正确');
  }
  ok(errors.length === 0, '浏览器无脚本异常');
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, measurements }, null, 2));
}).then(() => console.log(checks + ' app alignment checks passed')).catch(error => { console.error(error.stack); process.exitCode = 1; });
