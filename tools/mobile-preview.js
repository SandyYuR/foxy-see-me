#!/usr/bin/env node
/* 手机竖屏预览 / 冒烟检查 —— 在电脑上模拟手机看这个编辑器
 *
 * 用法：
 *   node tools/mobile-preview.js                    # 默认布局，跑几个典型竖屏
 *   node tools/mobile-preview.js cc_grid_4.json     # 指定加载某个内置示例
 *   node tools/mobile-preview.js --all              # 所有内置示例都跑一遍
 *
 * 依赖（只需装一次，用本机已装的 Edge/Chrome，不额外下载浏览器）：
 *   npm i -D playwright-core
 *
 * 想指定浏览器：
 *   MOBILE_PREVIEW_BROWSER="C:\路径\msedge.exe" node tools/mobile-preview.js
 *
 * 这个脚本模拟的是「真移动端」：isMobile + hasTouch + 真实触摸事件（走 CDP
 * Input.dispatchTouchEvent，不是鼠标模拟）。为什么要这么较真 —— 见文件末尾注释。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (e) {
  console.error(
    '缺少 playwright-core。请在 foxy-editor/ 目录下先执行：\n' +
    '  npm i -D playwright-core\n' +
    '若它装在别处，可设 NODE_PATH 指向那个 node_modules 目录。'
  );
  process.exit(1);
}

/* ---------------- 浏览器探测 ---------------- */
const BROWSERS = [
  process.env.MOBILE_PREVIEW_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findBrowser() {
  for (const p of BROWSERS) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* 忽略 */ }
  }
  return null;
}

/* ---------------- 待测视口（改这里就行） ---------------- */
const VIEWPORTS = [
  { name: '小屏 320', w: 320, h: 568, dpr: 2 },
  { name: 'Android 360', w: 360, h: 800, dpr: 3 },
  { name: 'Pixel 393', w: 393, h: 851, dpr: 3 },
  { name: '大屏 414', w: 414, h: 896, dpr: 3 },
  { name: '横屏对照 844', w: 844, h: 390, dpr: 3 },
];

const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOT_DIR = path.join(ROOT, '.mobile-preview');

/* 阈值：浮动工具在滚过这么多像素后才出现（与 app.js 的 FLOAT_SHOW_AT 一致） */
const FLOAT_SHOW_AT = 120;

/* ---------------- 页面内取数 ---------------- */
function audit() {
  const de = document.documentElement;
  const se = document.scrollingElement || de;
  const group = document.getElementById('float-undo-group');
  const toTop = document.getElementById('float-top');
  const wrap = document.querySelector('.gedit-wrap');
  const gr = group ? group.getBoundingClientRect() : null;

  return {
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    vvW: window.visualViewport ? Math.round(window.visualViewport.width) : null,
    horizOverflow: de.scrollWidth - de.clientWidth,
    maxScroll: se.scrollHeight - se.clientHeight,
    scrollTop: Math.round(se.scrollTop),
    floatHidden: group ? group.hidden : null,
    floatVisible: !!(gr && gr.width > 0 && gr.height > 0),
    toTopHidden: toTop ? toTop.hidden : null,
    grid: wrap ? {
      clientW: wrap.clientWidth,
      scrollW: wrap.scrollWidth,
      maxHScroll: wrap.scrollWidth - wrap.clientWidth,
    } : null,
  };
}

/* 真实手指上滑（CDP 触摸事件），不是 mouse wheel */
async function swipeUp(ctx, page, x, fromY, toY, steps = 12) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const y = Math.round(fromY + (toY - fromY) * (i / steps));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(22);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(380);
}

/* ---------------- 主流程 ---------------- */
(async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const layoutArg = args.find(a => !a.startsWith('--'));

  const exe = findBrowser();
  if (!exe) {
    console.error('没找到 Edge/Chrome。可用 MOBILE_PREVIEW_BROWSER 环境变量指定可执行文件路径。');
    process.exit(1);
  }
  console.log('浏览器: ' + exe);
  console.log('页面  : ' + PAGE_URL + '\n');

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });

  let problems = 0;
  const rows = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.dpr,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.goto(PAGE_URL, { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // 决定要跑哪些布局
    let layouts;
    if (layoutArg) layouts = [layoutArg];
    else if (runAll) layouts = await page.$$eval('#op-example option', os => os.map(o => o.value).filter(v => v.endsWith('.json')));
    else layouts = [null];   // null = 用编辑器自带默认布局

    const label = layouts.length === 1 && layouts[0] ? layouts[0] : (runAll ? '全部内置示例' : '内置默认布局');

    for (const lay of layouts) {
      if (lay) {
        await page.evaluate((val) => {
          const sel = document.getElementById('op-example');
          if (!sel) return;
          sel.value = val;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('op-load-example').click();
        }, lay);
        await page.waitForTimeout(lay.includes('grid') ? 1700 : 800);
      }
      await page.evaluate(() => { document.scrollingElement.scrollTop = 0; window.dispatchEvent(new Event('scroll')); });
      await page.waitForTimeout(200);

      const atTop = await page.evaluate(audit);

      // 逐标签页查水平溢出（这是最容易出问题的地方）
      const tabCount = await page.locator('.tab').count();
      let tabOverflowMax = 0, tabWorst = '';
      for (let i = 0; i < tabCount; i++) {
        const t = (await page.locator('.tab').nth(i).innerText()).trim();
        await page.locator('.tab').nth(i).click();
        await page.waitForTimeout(150);
        const of = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (of > tabOverflowMax) { tabOverflowMax = of; tabWorst = t; }
      }
      await page.locator('.tab').first().click();
      await page.waitForTimeout(200);

      // 滚下去看浮动按钮是否出现
      let after = null;
      if (atTop.maxScroll > FLOAT_SHOW_AT) {
        const okTouch = vp.w < 700;
        if (okTouch) await swipeUp(ctx, page, Math.round(vp.w / 2), Math.round(vp.h * 0.8), Math.round(vp.h * 0.2));
        else await page.evaluate(() => { document.scrollingElement.scrollTop = 800; window.dispatchEvent(new Event('scroll')); });
        await page.waitForTimeout(300);
        after = await page.evaluate(audit);
      }

      // 宽网格：末格能否通过横向滚动看到
      let lastCellOk = null;
      if (atTop.grid && atTop.grid.maxHScroll > 0) {
        lastCellOk = await page.evaluate(() => {
          const wrap = document.querySelector('.gedit-wrap');
          const cells = wrap.querySelectorAll('.gedit-cell');
          if (!cells.length) return null;
          const last = cells[cells.length - 1];
          const keep = wrap.scrollLeft;
          wrap.scrollLeft = wrap.scrollWidth;
          const lr = last.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
          const ok = lr.left >= wr.left - 1 && lr.right <= wr.right + 1;
          wrap.scrollLeft = keep;
          return ok;
        });
      }

      const bad = [];
      if (atTop.horizOverflow > 1) bad.push('水平溢出 ' + atTop.horizOverflow + 'px');
      if (tabOverflowMax > 1) bad.push('标签页「' + tabWorst + '」溢出 ' + tabOverflowMax + 'px');
      if (after && (after.scrollTop <= FLOAT_SHOW_AT || after.floatHidden)) bad.push('浮动按钮滚后未出现');
      if (lastCellOk === false) bad.push('网格末格横向不可达');
      if (errs.length) bad.push('JS 错误 ' + errs.length + ' 条');
      if (bad.length) problems++;

      rows.push({
        vp: vp.name, lay: lay || '默认', of: atTop.horizOverflow, innerW: atTop.innerW,
        maxScroll: atTop.maxScroll, scrolled: after ? after.scrollTop : '-',
        floatOk: after ? !after.floatHidden : '(页面太短)',
        grid: atTop.grid ? atTop.grid.clientW + '/' + atTop.grid.scrollW : '-',
        status: bad.length ? '✗ ' + bad.join('；') : '✓',
      });

      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.w}x${vp.h}-${(lay || 'default').replace(/[^\w.-]/g, '_')}.png`) });
    }

    if (label && layouts.length > 1) { /* 汇总模式不逐个打印 */ }
    await ctx.close();
  }

  await browser.close();

  // 输出表格
  const pad = (s, n) => String(s).padEnd(n);
  const padS = (s, n) => String(s).padStart(n);
  console.log(pad('视口', 14) + pad('布局', 22) + padS('水平溢出', 9) + padS('innerW', 8) + padS('maxScroll', 10) + padS('滚到', 7) + '  ' + pad('浮动按钮', 12) + pad('网格(可视/内容)', 17) + '结果');
  console.log('-'.repeat(140));
  for (const r of rows) {
    console.log(
      pad(r.vp, 14) + pad(r.lay, 22) + padS(r.of, 9) + padS(r.innerW, 8) + padS(r.maxScroll, 10) +
      padS(r.scrolled, 7) + '  ' + pad(r.floatOk, 12) + pad(r.grid, 17) + r.status
    );
  }

  console.log('\n截图已存到: ' + SHOT_DIR);
  console.log(problems ? `\n发现 ${problems} 处问题。` : '\n没发现问题。');
  process.exit(problems ? 1 : 0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});

/* ------------------------------------------------------------------
 * 为什么必须模拟真移动端，而不是「把窗口缩窄」就完事
 *
 * 缩窗口只能抓到纯 CSS 布局问题（换行、溢出、遮挡）。但有两类问题只在
 * 「移动端 + 触屏」语义下才露出来：
 *
 *   1) iOS/Android 的 pointer 事件语义
 *      attachPointerDrag 里判断 e.pointerType === 'mouse' && e.button !== 0。
 *      不开触屏模拟时 pointerType 恒为 'mouse'，拖动分支的走向与真机不同。
 *
 *   2) isMobile 会改变 window.innerWidth 的语义
 *      —— 这条真抓到过 bug。
 *      实测（加载 cc_grid_4.json 的 48 列大网格，414px 宽）：
 *        桌面模式: innerWidth=414,  水平溢出=0,    浮动按钮正常
 *        移动模式: innerWidth=1656, 水平溢出=1507, 浮动按钮不出现
 *      同一个宽度、同一份 CSS，只因 isMobile 不同，结果完全相反。原因是
 *      移动模式下页面被横向撑开后会触发视口缩放，纵向反而滚不动，
 *      updateFloatTools() 永远读到 scrollTop=0。
 *      所以那个 bug 用「缩窗口」是抓不到的，必须开移动端模拟。
 *
 * DevTools 设备模式也测不到的（要真机）：
 *   · 软键盘弹起导致的 visualViewport 收缩
 *   · 地址栏收放对 100vh 的影响
 *   · 真实触摸的延迟、惯性滚动、长按菜单
 * ------------------------------------------------------------------ */
