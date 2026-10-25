'use strict';
const fs=require('fs'),path=require('path');
let checks=0;
function ok(value,message){if(!value)throw Error(message);checks++;console.log('✓ '+message);}
require('./browser-harness').run(async({send,ev,ready,sleep,root,errors})=>{
  const out=path.join(root,'..','audit','inspector-feedback');fs.mkdirSync(out,{recursive:true});
  async function helpers(){await ev(`window.testUi={
    button:(name,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent.trim()===name),
    set:(selector,value)=>{let e=document.querySelector(selector);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},
    geometry:()=>{let a=document.querySelector('.preview-panel').getBoundingClientRect(),b=document.getElementById('key-inspector').getBoundingClientRect(),t=document.querySelector('.tabs').getBoundingClientRect();return {previewHeight:a.height,panelHeight:b.height,width:b.width,topGap:b.top-a.top,tabsGap:t.top-Math.max(a.bottom,b.bottom)};}
  }`);}
  async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
  async function reload(){await send('Page.reload');await sleep(200);await ready();await helpers();await sleep(100);}
  await helpers();
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await ev('FE.renderPreviewOnly()');await sleep(100);
  ok(await ev('FE.state.inspectorOpen && !FE.state.editSession && !document.getElementById("key-inspector").hidden'),'默认自动展示未选键面板');
  const geometry=await ev('testUi.geometry()');
  ok(Math.abs(geometry.width-409.5)<1,'属性面板宽度增加 5%');
  ok(await ev('parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--content-max"))===1362.9'),'中央工作区最大宽度增加 5%');
  ok(Math.abs(geometry.previewHeight-geometry.panelHeight)<2&&Math.abs(geometry.topGap)<2,'左右窗体顶边和高度对齐');
  ok(geometry.tabsGap>=16,'标签页与上方窗体保持明确间距');
  await ev('document.querySelectorAll(".inspector-empty-section summary").forEach(s=>{s.click();s.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));})');
  ok(await ev('document.querySelectorAll(".inspector-empty-section").length===6&&!document.querySelector(".inspector-empty-section[open]")'),'未选键时所有分栏收起且不能打开');
  ok(await ev('Array.from(document.querySelectorAll(".tabpanel [data-workspace-section]")).every(d=>d.open)'),'六个标签页的主分栏默认展开');
  const expansionDocument=await ev('JSON.stringify(FE.state.profile)');
  // Migrate the old positional cache without transferring inspector flags to tabs.
  await ev(`(()=>{let d=JSON.parse(localStorage.getItem(FE.DRAFT_STORAGE_KEY));d.workspace.version=1;delete d.workspace.sectionOpen;d.workspace.openDetails=Array(200).fill(false);d.pendingJson='{ pending migration';localStorage.setItem(FE.DRAFT_STORAGE_KEY,JSON.stringify(d));FE.state.cacheRestoring=true;})()`);
  await reload();
  ok(await ev('Array.from(document.querySelectorAll(".tabpanel [data-workspace-section]")).every(d=>d.open)'),'旧顺序缓存迁移不会收起下方主分栏');
  ok(await ev('JSON.stringify(FE.state.profile)')===expansionDocument,'开合状态迁移保留已应用文档');
  ok(await ev('document.getElementById("json-editor").value==="{ pending migration"'),'开合状态迁移保留未完成 JSON');
  await ev(`testUi.set('#json-editor',FE.serializeProfile(FE.state.profile,true));document.getElementById('json-apply').click();document.getElementById('op-import').closest('details').open=false;document.getElementById('th-import').closest('details').open=false;document.querySelector('#preview-kb .kb-key').click();FE.autosaveDraft();`);
  await reload();
  ok(await ev('!document.getElementById("op-import").closest("details").open&&!document.getElementById("th-import").closest("details").open'),'各模块手动折叠状态按固定标识恢复');
  ok(await ev('document.getElementById("keys-list").closest("details").open&&document.getElementById("popup-import").closest("details").open&&document.getElementById("sym-import").closest("details").open'),'右侧选键面板展开不影响其他模块分栏');
  await ev(`testUi.button('取消',document.getElementById('key-inspector')).click();FE.autosaveDraft();`);await reload();
  ok(await ev('!document.getElementById("op-import").closest("details").open&&document.getElementById("keys-list").closest("details").open'),'右侧变回空面板不改变下方开合状态');
  await ev('document.querySelectorAll(".tabpanel [data-workspace-section]").forEach(d=>d.open=true);FE.autosaveDraft();');
  await screenshot('desktop-default');
  await ev('document.querySelector("#key-inspector [aria-label=关闭按键属性]").click()');
  ok(await ev('document.getElementById("key-inspector").hidden'),'用户可以手动关闭空面板');
  await reload();
  ok(await ev('document.getElementById("key-inspector").hidden'),'刷新保留手动关闭状态');
  await ev('document.querySelector("#preview-kb .kb-key").click()');
  ok(await ev('FE.state.editSession && !document.getElementById("key-inspector").hidden'),'点击预览键重新打开面板');
  await ev('document.querySelectorAll("#key-inspector details").forEach(d=>d.open=true);document.querySelector(".inspector-body").scrollTop=210;');
  const scroll=await ev('document.querySelector(".inspector-body").scrollTop');
  await ev(`document.querySelector('[data-slot="swipe.up"]').click()`);await sleep(140);
  ok(Math.abs(await ev('document.querySelector(".inspector-body").scrollTop')-scroll)<1,'选择手势不重置面板滚动位置');
  await ev('testUi.set(".inline-gesture-body select","direct");testUi.set(".inline-gesture-body .action-editor select","key");testUi.set(".inline-gesture-body .action-fields select","DIGIT_1")');await sleep(140);
  ok(Math.abs(await ev('document.querySelector(".inspector-body").scrollTop')-scroll)<1,'修改动作字段不重置滚动位置');
  await ev('testUi.set("#key-inspector [aria-label=按键标签]","横屏前草稿");document.getElementById("pt-landscape").click();');
  ok(await ev('FE.state.landscapeMode && !document.getElementById("key-inspector").hidden && !FE.state.editSession'),'切横屏后保持外壳并清空按键选择');
  ok(await ev('FE.state.suspendedEdits.length===1&&!document.querySelector("dialog[open]")'),'模式切换暂存草稿且不弹关闭确认');
  await ev('document.querySelector("#preview-kb .kb-key").click()');
  ok(await ev('document.querySelector("#key-inspector [aria-label=按键标签]").value==="横屏前草稿"'),'重选原按键恢复暂存草稿');
  await ev('document.getElementById("pt-shift").click()');
  ok(await ev('FE.state.editSession && document.querySelector("#key-inspector [aria-label=按键标签]").value==="横屏前草稿"'),'只改变模拟状态不会关闭或清空有效编辑');
  await ev('document.getElementById("preview-kb").click()');
  ok(await ev('!FE.state.editSession&&!document.getElementById("key-inspector").hidden'),'取消按键选择时保留禁用外壳');
  await reload();
  ok(await ev('!FE.state.editSession&&FE.state.suspendedEdits.length===1'),'刷新保留取消选择后的草稿');
  await ev('document.querySelector("#preview-kb .kb-key").click()');
  ok(await ev('document.querySelector("#key-inspector [aria-label=按键标签]").value==="横屏前草稿"'),'刷新后仍可重新选择恢复原草稿');
  await ev('testUi.button("取消",document.getElementById("key-inspector")).click();testUi.button("放弃并继续",document.querySelector("dialog[open]")).click()');await sleep(60);
  // Deterministic imported fixture has independent normal/split placements.
  const fixture={type:'foxy.keyboard-layout',layouts:{default:{sections:[{type:'rows',rows:[[{ref:'rime.a'},{ref:'rime.b'}]]}],split:{sections:[{type:'rows',rows:[[{ref:'rime.c'},{ref:'rime.d'}]]}]}}}};
  await ev(`FE.applyProfileText(${JSON.stringify(JSON.stringify(fixture))});FE.setLandscapeMode(false);FE.renderAll();document.querySelector('#preview-kb .kb-key').click();testUi.set('#key-inspector [aria-label=按键标签]','常规草稿');document.getElementById('pt-split').click();`);
  ok(await ev('FE.state.splitMode&&!FE.state.editSession&&!document.getElementById("key-inspector").hidden'),'切分体不关闭面板');
  await ev('document.querySelector("#preview-kb .kb-key").click()');
  ok(await ev('FE.state.editSession.target.split&&document.querySelector("#key-inspector [aria-label=按键标签]").value!=="常规草稿"'),'新分体按键不会套用常规按键草稿');
  await ev('testUi.button("取消",document.getElementById("key-inspector")).click();document.getElementById("pt-split").click();');
  await ev('document.querySelector("#layout-sections .chip").scrollIntoView({block:"center"});document.querySelector("#layout-sections .chip").click();');
  ok(await ev('!!document.querySelector("dialog[open]")&&!FE.state.editSession'),'下方行区段点击打开大弹窗而不选中小面板');
  ok(await ev('document.querySelector("dialog[open]").getBoundingClientRect().width>600'),'行区段弹窗保留原有大尺寸');
  await screenshot('structure-dialog');
  await ev('testUi.button("取消",document.querySelector("dialog[open]")).click()');await sleep(60);
  // Restore normal fixture then exercise one-click reset with uncommitted content.
  await ev('document.querySelector("#preview-kb .kb-key").click();testUi.set("#key-inspector [aria-label=按键标签]","还原前草稿");document.getElementById("site-theme-light").click();window.resetBefore=JSON.stringify(FE.state.profile);FE.autosaveDraft();');
  const original=await ev('window.resetBefore');
  await ev('document.getElementById("workspace-reset").click()');await sleep(300);await ready();await helpers();await sleep(100);
  ok(await ev('FE.stableJson(FE.state.profile)===FE.stableJson(FE.normalizeProfile(JSON.parse(FE.DEFAULT_PROFILE_TEXT)))'),'一键还原恢复网页初始布局');
  ok(await ev('!FE.state.editSession&&FE.state.inspectorOpen&&FE.state.suspendedEdits.length===0&&!FE.state.splitMode&&!FE.state.landscapeMode'),'还原清理选择草稿和模式并显示默认空面板');
  ok(await ev('document.getElementById("site-theme-auto").getAttribute("aria-pressed")==="true"'),'还原同时恢复自动网页配色');
  ok(await ev('!document.getElementById("workspace-reset-undo").hidden'),'还原后提供撤回入口');
  await ev('document.getElementById("workspace-reset-undo").click()');await sleep(300);await ready();await helpers();await sleep(100);
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'撤回还原恢复原文件');
  ok(await ev('document.querySelector("#key-inspector [aria-label=按键标签]").value==="还原前草稿"'),'撤回还原恢复未应用按键草稿');
  await ev('testUi.button("取消",document.getElementById("key-inspector")).click();testUi.button("放弃并继续",document.querySelector("dialog[open]")).click()');await sleep(60);
  await ev('FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT);window.scrollTo(0,0);FE.renderAll();');await sleep(120);
  for(const width of [320,393,414]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:851,deviceScaleFactor:1,mobile:true});await ev('FE.renderPreviewOnly()');await sleep(120);
    ok(await ev('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),width+'px 无整页横向溢出');
    ok(await ev('getComputedStyle(document.getElementById("key-inspector")).position!=="fixed"'),'手机未选键面板随页面排列');
  }
  await screenshot('mobile-empty');
  await ev('document.querySelector("#preview-kb .kb-key").click()');await sleep(120);
  ok(await ev('getComputedStyle(document.getElementById("key-inspector")).position==="fixed"'),'手机选键后展开编辑浮层');
  ok(await ev('document.querySelector(".inspector-actions").getBoundingClientRect().bottom<=innerHeight+1'),'手机应用栏没有越出屏幕');
  await screenshot('mobile-selected');
  await ev('testUi.button("取消",document.getElementById("key-inspector")).click()');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});await ev('window.scrollTo(0,0);FE.renderPreviewOnly()');await sleep(120);
  await ev('document.querySelector("#preview-kb .kb-key").click()');await sleep(120);await screenshot('desktop-selected');
  const finalGeometry=await ev('testUi.geometry()');
  ok(Math.abs(finalGeometry.previewHeight-finalGeometry.panelHeight)<2&&finalGeometry.tabsGap>=16,'选中后仍等高且标签页不重叠');
  if(errors.length)console.error(JSON.stringify(errors,null,2));
  ok(errors.length===0,'浏览器没有运行时异常');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,geometry,finalGeometry},null,2));
}).then(()=>console.log(checks+' feedback checks passed')).catch(error=>{console.error(error.stack);process.exitCode=1;});
