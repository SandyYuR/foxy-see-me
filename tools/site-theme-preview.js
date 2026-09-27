#!/usr/bin/env node
/* 网页配色实测 —— 验证顶栏三图标按钮与整站明暗主题（桌面 Edge/Chrome）
 *
 * 用法（foxy-editor/ 目录下）：
 *   node tools/site-theme-preview.js
 *
 * 依赖复用 mobile-preview.js 的方案：playwright-core + 本机 Edge/Chrome，不下载浏览器。
 * 输出截图到 .site-theme-preview/：topbar-dark.png / topbar-light.png / page-light.png，
 * 并在控制台打印三档切换后的 <html> 类与计算样式断言结果。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (e) {
  console.error('缺少 playwright-core。先执行：npm i -D playwright-core');
  process.exit(1);
}

const BROWSERS = [
  process.env.MOBILE_PREVIEW_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findBrowser() {
  for (const p of BROWSERS) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* 忽略 */ }
  }
  return null;
}

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOT_DIR = path.join(ROOT, '.site-theme-preview');

(async function main() {
  const exe = findBrowser();
  if (!exe) { console.error('✗ 找不到本机 Edge/Chrome'); process.exit(1); }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fails = [];
  const ok = (cond, msg) => {
    console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + msg);
    if (!cond) fails.push(msg);
  };

  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  /* ---- 初始：默认 auto ---- */
  const initCls = await page.evaluate(() => document.documentElement.className);
  ok(/(^|\s)site-auto(\s|$)/.test(initCls), '默认 <html> 带 site-auto（自动跟随系统）: ' + initCls);
  const autoActive = await page.evaluate(() => document.getElementById('site-theme-auto').classList.contains('active'));
  ok(autoActive, '默认自动按钮高亮');
  const ghInH1 = await page.evaluate(() => {
    const t = document.getElementById('repo-title-link');
    const g = document.getElementById('repo-link');
    return !!t && !!g && g.parentNode === t.parentNode && g.parentNode.tagName === 'H1';
  });
  ok(ghInH1, 'GitHub 图标按钮与标题链接同处一个 h1');
  const ghText = await page.evaluate(() => (document.getElementById('repo-link').textContent || '').trim());
  ok(ghText === '', 'GitHub 图标按钮无文字');
  const btnTexts = await page.evaluate(() => ['site-theme-auto', 'site-theme-light', 'site-theme-dark']
    .map(id => (document.getElementById(id).textContent || '').trim()));
  ok(btnTexts.every(t => t === ''), '三个配色按钮都无文字: ' + JSON.stringify(btnTexts));
  await page.locator('.topbar').screenshot({ path: path.join(SHOT_DIR, 'topbar-dark.png') });

  /* ---- 切亮色 ---- */
  await page.click('#site-theme-light');
  await page.waitForTimeout(300);
  const lightCls = await page.evaluate(() => document.documentElement.className);
  ok(/(^|\s)site-light(\s|$)/.test(lightCls), '点亮色后 <html> 带 site-light: ' + lightCls);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bodyBg === 'rgb(242, 243, 245)', '亮色下 body 背景为浅色: ' + bodyBg);
  const cardBg = await page.evaluate(() => getComputedStyle(document.querySelector('details.card')).backgroundColor);
  ok(cardBg === 'rgb(255, 255, 255)', '亮色下卡片为白色: ' + cardBg);
  const stored = await page.evaluate(() => localStorage.getItem('foxy-editor-site-theme'));
  ok(stored === 'light', '亮色选择已持久化: ' + stored);
  await page.locator('.topbar').screenshot({ path: path.join(SHOT_DIR, 'topbar-light.png') });
  await page.screenshot({ path: path.join(SHOT_DIR, 'page-light.png') });

  /* ---- 刷新后保持亮色 ---- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const afterReload = await page.evaluate(() => document.documentElement.className);
  ok(/(^|\s)site-light(\s|$)/.test(afterReload), '刷新后仍是 site-light（持久化生效）: ' + afterReload);

  /* ---- 切暗色 ---- */
  await page.click('#site-theme-dark');
  await page.waitForTimeout(300);
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(darkBg === 'rgb(18, 19, 22)', '暗色下 body 背景回到深色: ' + darkBg);

  /* ---- 切回自动 ---- */
  await page.click('#site-theme-auto');
  await page.waitForTimeout(300);
  const autoCls = await page.evaluate(() => document.documentElement.className);
  ok(/(^|\s)site-auto(\s|$)/.test(autoCls), '切回自动后 <html> 带 site-auto: ' + autoCls);

  await browser.close();
  console.log(fails.length ? ('\n结果: ' + fails.length + ' 项失败') : '\n结果: 全部通过');
  console.log('截图: ' + SHOT_DIR);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('✗ 实测抛错:', (e && e.stack) || e); process.exit(1); });
