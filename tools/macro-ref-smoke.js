#!/usr/bin/env node
/* 宏调用「显示即已选」冒烟 —— 真实浏览器里走两条入口路径
 *
 * 用法（foxy-editor/ 目录下）：
 *   node tools/macro-ref-smoke.js
 *
 * 为什么单独有这个脚本：手势对话框的宏下拉是「一渲染就显示首项」的控件，
 * DOM 桩能测逻辑，但证明不了真实 select 在切来源后到底把哪个值交给了保存。
 * 这里用本机 Edge 的 headless 模式 + CDP（Runtime.evaluate 驱动真实点击与
 * change 事件），零 npm 依赖（Node 22+ 自带全局 WebSocket）。
 *
 * 覆盖：
 *   A 新建宏 → 按键对话框 → 手势 → 切到「宏调用」→ 不碰下拉 → 保存
 *   B 新建宏 → 同上但先选「直接动作」再切「宏调用」→ 不碰下拉 → 保存
 *   C 切到「宏调用」后显式换成第二个宏 → 保存
 *   D 动作编辑器里把类型改成 switch_layout_once 并填目标布局 → 保存（写回必须
 *     保留 once 类型，不能被降级成 switch_layout）
 * 每条路径都检查：不弹提示框、手势摘要回显、profile 里落的是期望的对象、
 * 关掉重开同一个键仍回显同一个值。
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BROWSERS = [
  process.env.MACRO_SMOKE_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const browserPath = BROWSERS.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!browserPath) {
  console.error('找不到 Edge / Chrome。可用 MACRO_SMOKE_BROWSER 指定可执行文件路径。');
  process.exit(1);
}

const PORT = Number(process.env.MACRO_SMOKE_PORT || 9336);
const pageUrl = path.join(__dirname, '..', 'index.html');
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxy-macro-smoke-'));

const proc = spawn(browserPath, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + userDir,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  pageUrl
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 端口 ' + PORT + ' 未就绪');
}

let msgId = 0;
function makeSend(ws) {
  const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (!m.id || !pending.has(m.id)) return;
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(JSON.stringify(m.error)));
    else p.resolve(m.result);
  });
  return (method, params) => {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  };
}

let failed = 0;
function ok(cond, label, actual) {
  if (cond) console.log('  ✓ ' + label);
  else { failed++; console.log('  ✗ ' + label + (actual === undefined ? '' : ' —— 实际 ' + JSON.stringify(actual))); }
}

(async () => {
  const ws = new WebSocket(await findTarget());
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = makeSend(ws);
  await send('Runtime.enable');

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  };

  for (let i = 0; i < 60; i++) {
    if (await ev('!!(window.FE && FE.state && FE.state.profile && document.querySelector(".kb-key"))')) break;
    await sleep(200);
  }

  /* 页面内助手：只做 DOM 查询与点击，不改编辑器内部状态 */
  await ev([
    '(function(){',
    'window.__smoke = {',
    '  dlg: function(){ var d = Array.prototype.slice.call(document.querySelectorAll("dialog[open]")); return d.length ? d[d.length-1] : null; },',
    '  n: function(){ return document.querySelectorAll("dialog[open]").length; },',
    '  btn: function(root, txt){ return Array.prototype.slice.call(root.querySelectorAll("button")).filter(function(e){ return (e.textContent||"").trim() === txt; })[0]; },',
    '  prim: function(root){ return root.querySelectorAll(".dialog-toolbar .primary")[0]; },',
    '  alertText: function(){ var d = document.querySelectorAll("dialog[open]"); for (var i=0;i<d.length;i++){ if (d[i].querySelector(".ui-dialog-ok")) return (d[i].textContent||"").trim(); } return null; },',
    '  row: function(label){ var rows = document.querySelectorAll(".gesture-row"); for (var i=0;i<rows.length;i++){ if ((rows[i].querySelector(".gesture-name")||{}).textContent === label) return (rows[i].querySelector(".gesture-sum")||{}).textContent; } return null; },',
    '  setMode: function(v){ var s = window.__smoke.dlg().querySelectorAll("select")[0]; s.value = v; s.dispatchEvent(new Event("change",{bubbles:true})); },',
    '  macroSel: function(){ var s = window.__smoke.dlg().querySelectorAll("select"); return s.length > 1 ? s[1] : null; },',
    '  pickMacro: function(name){ var s = window.__smoke.macroSel(); s.value = name; s.dispatchEvent(new Event("change",{bubbles:true})); },',
    '  macroRefs: function(){ var hits=[]; function w(v,p){ if(!v||typeof v!=="object")return; if(v.macro){ hits.push(p+"="+v.macro); return; } for(var k in v){ if(Object.prototype.hasOwnProperty.call(v,k)) w(v[k],p+"."+k); } } w(FE.state.profile,"profile"); return hits; },',
    '  actSel: function(){ var d=window.__smoke.dlg(); return d ? d.querySelector(".action-editor select.mini-select") : null; },',
    '  setActType: function(v){ var s=window.__smoke.actSel(); s.value=v; s.dispatchEvent(new Event("change",{bubbles:true})); },',
    '  actHint: function(){ var d=window.__smoke.dlg(); var e=d && d.querySelector(".action-editor .dialog-hint"); return e ? (e.textContent||"").trim() : null; },',
    '  setLayout: function(v){ var d=window.__smoke.dlg(); var i=d.querySelector(".action-editor input.mini-input"); i.value=v; i.dispatchEvent(new Event("change",{bubbles:true})); },',
    '  layoutVal: function(){ var d=window.__smoke.dlg(); var i=d && d.querySelector(".action-editor input.mini-input"); return i ? i.value : null; },',
    '  typeVal: function(){ var s=window.__smoke.actSel(); return s ? s.value : null; },',
    '  typeRefs: function(t){ var hits=[]; function w(v,p){ if(!v||typeof v!=="object")return; if(v.type===t){ hits.push(p+"|"+v.layout); return; } for(var k in v){ if(Object.prototype.hasOwnProperty.call(v,k)) w(v[k],p+"."+k); } } w(FE.state.profile,"profile"); return hits; }',
    '};',
    'return true; })()'
  ].join('\n'));

  function newMacro(name) {
    return ev('(function(){ var i=document.getElementById("macros-new"); i.value=' + JSON.stringify(name) +
      '; i.dispatchEvent(new Event("input",{bubbles:true})); document.getElementById("macros-add").click(); return true; })()');
  }
  async function openKeyTap(idx) {
    await ev('document.querySelectorAll(".kb-key")[' + idx + '].click()');
    await sleep(200);
    await ev('window.__smoke.btn(window.__smoke.dlg(), "编辑…").click()');
    await sleep(200);
  }
  async function saveGesture() {
    await ev('window.__smoke.prim(window.__smoke.dlg()).click()');
    await sleep(250);
  }
  async function saveKey() {
    await ev('window.__smoke.prim(window.__smoke.dlg()).click()');
    await sleep(300);
  }
  /* 每段用例开始前把上层对话框全部收起：某一段失败时不要让它把后面的用例带塌 */
  async function resetDialogs() {
    for (let i = 0; i < 8; i++) {
      const n = await ev('window.__smoke.n()');
      if (!n) return;
      await ev('(function(){ var d=window.__smoke.dlg(); var b=Array.prototype.slice.call(d.querySelectorAll("button")).filter(function(x){ return /取消|关闭|好/.test(x.textContent); })[0]; if(b)b.click(); return true; })()');
      await sleep(120);
    }
  }
  async function closeKeyDialog() {
    await ev('(function(){ var d=window.__smoke.dlg(); var b=Array.prototype.slice.call(d.querySelectorAll("button")).filter(function(x){ return /取消|关闭/.test(x.textContent); })[0]; if(b)b.click(); return true; })()');
    await sleep(150);
  }

  console.log('浏览器: ' + browserPath);
  console.log('页面:   ' + pageUrl);

  await newMacro('smoke_a');
  await newMacro('smoke_b');
  ok(await ev('!!(FE.state.profile.macros.smoke_a && FE.state.profile.macros.smoke_b)'), '通过「+ 新建宏」建出两个宏');

  console.log('\n== A 切到「宏调用」后不碰下拉就保存 ==');
  await resetDialogs();
  await openKeyTap(0);
  await ev('window.__smoke.setMode("macro")');
  await sleep(150);
  ok(await ev('window.__smoke.macroSel() && window.__smoke.macroSel().value') === 'smoke_a',
    '宏下拉显示首项 smoke_a', await ev('window.__smoke.macroSel() && window.__smoke.macroSel().value'));
  await saveGesture();
  ok(await ev('window.__smoke.alertText()') === null, '保存手势不弹提示框', await ev('window.__smoke.alertText()'));
  ok(await ev('window.__smoke.n()') === 1, '手势对话框已保存并关闭', await ev('window.__smoke.n()'));
  ok((await ev('window.__smoke.row("点击 tap")') || '').indexOf('smoke_a') >= 0,
    'tap 行摘要回显 smoke_a', await ev('window.__smoke.row("点击 tap")'));
  await saveKey();
  ok(await ev('window.__smoke.alertText()') === null, '保存按键不弹提示框', await ev('window.__smoke.alertText()'));
  ok(await ev('window.__smoke.n()') === 0, '按键对话框已保存并关闭', await ev('window.__smoke.n()'));
  let refs = await ev('window.__smoke.macroRefs()');
  ok(refs.length === 1 && refs[0].indexOf('=smoke_a') > 0, 'profile 里落的是 {macro:"smoke_a"}', refs);

  await ev('document.querySelectorAll(".kb-key")[0].click()');
  await sleep(250);
  ok((await ev('window.__smoke.row("点击 tap")') || '').indexOf('smoke_a') >= 0,
    '重开该键仍回显 smoke_a', await ev('window.__smoke.row("点击 tap")'));
  await closeKeyDialog();

  console.log('\n== B 先「直接动作」再切「宏调用」，不碰下拉就保存 ==');
  await resetDialogs();
  await openKeyTap(1);
  await ev('window.__smoke.setMode("direct")');
  await sleep(120);
  await ev('window.__smoke.setMode("macro")');
  await sleep(150);
  ok(await ev('window.__smoke.macroSel() && window.__smoke.macroSel().value') === 'smoke_a',
    '宏下拉仍显示首项 smoke_a', await ev('window.__smoke.macroSel() && window.__smoke.macroSel().value'));
  await saveGesture();
  ok(await ev('window.__smoke.alertText()') === null, '保存手势不弹提示框', await ev('window.__smoke.alertText()'));
  await saveKey();
  refs = await ev('window.__smoke.macroRefs()');
  ok(refs.length === 2, '两条路径各自落盘一份引用', refs);
  await ev('document.querySelectorAll(".kb-key")[1].click()');
  await sleep(250);
  ok((await ev('window.__smoke.row("点击 tap")') || '').indexOf('smoke_a') >= 0,
    '重开第二个键回显 smoke_a', await ev('window.__smoke.row("点击 tap")'));
  await closeKeyDialog();

  console.log('\n== C 切到「宏调用」后显式换第二个宏 ==');
  await resetDialogs();
  await openKeyTap(2);
  await ev('window.__smoke.setMode("macro")');
  await sleep(150);
  await ev('window.__smoke.pickMacro("smoke_b")');
  await sleep(120);
  await saveGesture();
  ok(await ev('window.__smoke.alertText()') === null, '保存手势不弹提示框', await ev('window.__smoke.alertText()'));
  ok((await ev('window.__smoke.row("点击 tap")') || '').indexOf('smoke_b') >= 0,
    'tap 行摘要回显 smoke_b', await ev('window.__smoke.row("点击 tap")'));
  await saveKey();
  refs = await ev('window.__smoke.macroRefs()');
  const bRef = refs.filter(r => r.indexOf('=smoke_b') > 0);
  ok(bRef.length === 1, 'profile 里落的是 {macro:"smoke_b"}', refs);
  await ev('document.querySelectorAll(".kb-key")[2].click()');
  await sleep(250);
  ok((await ev('window.__smoke.row("点击 tap")') || '').indexOf('smoke_b') >= 0,
    '重开第三个键回显 smoke_b', await ev('window.__smoke.row("点击 tap")'));


  console.log('\n== D 动作编辑器写 switch_layout_once 必须保留 once 类型 ==');
  const targetLayout = await ev('Object.keys(FE.state.profile.layouts||{})[0]');
  ok(!!targetLayout, 'profile 里至少有一个布局可作为目标', targetLayout);
  /* 默认 profile 本身就带 switch_layout（numpad / symbols / emoji / kaomoji），
   * 所以「没被降级」只能比数量变化，不能断言绝对为 0。 */
  const basePlain = (await ev('window.__smoke.typeRefs("switch_layout")')).length;
  await resetDialogs();
  await openKeyTap(3);
  await ev('window.__smoke.setMode("direct")');
  await sleep(150);
  await ev('window.__smoke.setActType("switch_layout_once")');
  await sleep(150);
  ok(await ev('window.__smoke.typeVal()') === 'switch_layout_once', '类型下拉停在 switch_layout_once', await ev('window.__smoke.typeVal()'));
  ok(((await ev('window.__smoke.actHint()')) || '').indexOf('临时层') >= 0, '字段区显示临时层提示', await ev('window.__smoke.actHint()'));
  await ev('window.__smoke.setLayout(' + JSON.stringify(String(targetLayout)) + ')');
  await sleep(120);
  await saveGesture();
  ok(await ev('window.__smoke.alertText()') === null, '合法临时层不被校验拦下', await ev('window.__smoke.alertText()'));
  ok(await ev('window.__smoke.n()') === 1, '手势对话框已保存并关闭', await ev('window.__smoke.n()'));
  ok((await ev('window.__smoke.row("点击 tap")') || '').indexOf('临时切换布局') >= 0,
    'tap 行摘要显示「临时切换布局」', await ev('window.__smoke.row("点击 tap")'));
  await saveKey();
  ok(await ev('window.__smoke.alertText()') === null, '保存按键不弹提示框', await ev('window.__smoke.alertText()'));
  let onceRefs = await ev('window.__smoke.typeRefs("switch_layout_once")');
  ok(onceRefs.length === 1 && onceRefs[0].indexOf('|' + targetLayout) > 0,
    'profile 里落的是 {type:"switch_layout_once"} 且没有被降级', onceRefs);
  const nowPlain = (await ev('window.__smoke.typeRefs("switch_layout")')).length;
  ok(nowPlain === basePlain, '没有多写出一份 switch_layout', { before: basePlain, after: nowPlain });
  await ev('document.querySelectorAll(".kb-key")[3].click()');
  await sleep(250);
  await ev('window.__smoke.btn(window.__smoke.dlg(), "编辑…").click()');
  await sleep(200);
  ok(await ev('window.__smoke.typeVal()') === 'switch_layout_once', '重开后类型仍是 switch_layout_once', await ev('window.__smoke.typeVal()'));
  ok(await ev('window.__smoke.layoutVal()') === targetLayout, '重开后布局名回显', await ev('window.__smoke.layoutVal()'));
  ws.close();
  try { proc.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  console.log('\n结果: ' + (failed ? failed + ' 项失败' : '全部通过'));
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('冒烟脚本失败: ' + e.message);
  try { proc.kill(); } catch (_) {}
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
