'use strict';
const fs=require('fs'),path=require('path');
let checks=0;
function ok(value,name){if(!value)throw Error(name);checks++;console.log('✓ '+name);}
require('./browser-harness').run(async({send,ev,ready,sleep,root,errors})=>{
  const out=path.join(root,'..','audit','workspace-smoke');fs.mkdirSync(out,{recursive:true});
  async function helpers(){await ev(`window.ui={
    click:(s)=>document.querySelector(s).click(),
    set:(s,v)=>{let e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},
    button:(text,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent.trim()===text),
    key:()=>FE.state.profile.layouts.default.sections[0].rows[0][0]
  };`);}
  async function reload(){await send('Page.reload');await sleep(350);await ready();await helpers();}
  async function shot(name){const result=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(result.data,'base64'));}
  await helpers();
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await ev('FE.renderPreviewOnly()');
  ok(await ev("document.querySelector('#op-import').closest('#tab-layout')!==null && !document.querySelector('.topbar #op-import')"),'文件入口保留在布局页');
  ok(await ev("document.querySelector('#draft-save-status').closest('.topbar-subline')!==null"),'保存提示与副标题同一行');
  ok(await ev("document.getElementById('draft-save-status').textContent==='草稿已保存到浏览器'"),'启动完成后保存成功状态可见');
  await shot('desktop-initial');
  await ev("ui.click('#preview-kb .kb-key')");
  ok(await ev("!document.getElementById('key-inspector').hidden && !document.querySelector('dialog[open]')"),'点键打开侧栏');
  const before=await ev('JSON.stringify(ui.key())');
  await ev("ui.set('#key-inspector [aria-label=按键标签]','缓存测试')");
  ok(await ev('JSON.stringify(ui.key())')===before,'输入只改草稿');
  await sleep(160);
  ok(await ev("document.querySelector('#preview-kb .kb-key').textContent.includes('缓存测试')"),'预览显示草稿');
  await shot('desktop-inspector');
  await reload();
  ok(await ev("document.querySelector('#key-inspector [aria-label=按键标签]').value==='缓存测试'"),'刷新自动恢复未应用标签');
  ok(await ev('JSON.stringify(ui.key())')===before,'刷新不自动提交草稿');
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click();ui.button('放弃并继续',document.querySelector('dialog[open]')).click()");
  ok(await ev('JSON.stringify(ui.key())')===before,'取消不改文档');
  await sleep(60);await reload();
  ok(await ev('!FE.state.editSession'),'取消后异步回调不会重新保存已放弃草稿');
  await ev("ui.click('#preview-kb .kb-key');ui.click('[data-slot=\"swipe.up\"]');ui.set('.inline-gesture-body select','direct');ui.set('.inline-gesture-body .action-editor select','key');ui.set('.inline-gesture-body .action-fields select','DIGIT_1')");
  ok(await ev('document.querySelectorAll("dialog[open]").length===0'),'常用手势在同一面板编辑');
  await reload();
  ok(await ev("document.querySelector('.inline-gesture-body .action-fields select').value==='DIGIT_1'"),'刷新恢复手势动作和正在编辑的方向');
  let history=await ev('FE.state.history.length');
  await ev("ui.button('应用',document.querySelector('#key-inspector')).click()");
  ok(await ev("ui.key().swipe.up.type==='key' && ui.key().swipe.up.key==='DIGIT_1'"),'一次应用写回上滑按键事件');
  ok(await ev('FE.state.history.length')===history+1,'一次应用只有一个撤销点');
  await ev("ui.click('#top-undo')");
  ok(await ev('JSON.stringify(ui.key())')===before,'一次撤销恢复整次修改');
  await ev("ui.click('#top-redo')");
  ok(await ev("ui.key().swipe.up.key==='DIGIT_1'"),'重做恢复修改');
  await ev("ui.click('#preview-kb .kb-key');ui.click('[data-slot=\"swipe.down\"]');ui.button('应用',document.querySelector('#key-inspector')).click();");
  ok(await ev("!Object.prototype.hasOwnProperty.call(ui.key().swipe,'down')"),'只查看继承手势不会写入新覆盖');
  await ev("ui.click('#preview-kb .kb-key');ui.set('#key-inspector [aria-label=按键标签]','待切换');ui.set('#layout-select','numpad')");
  ok(await ev("FE.state.layoutName==='default' && !!document.querySelector('dialog[open]')"),'切换布局先处理草稿');
  await ev("ui.button('继续编辑',document.querySelector('dialog[open]')).click()");
  await sleep(60); // native dialog close dispatches its close event asynchronously
  ok(await ev("document.querySelector('#key-inspector [aria-label=按键标签]').value==='待切换'"),'继续编辑保留字段和目标');
  await ev("document.querySelectorAll('#preview-kb .kb-key')[1].click();ui.button('放弃并继续',document.querySelector('dialog[open]')).click()");
  ok(await ev('FE.state.editSession.target.location.k===1'),'切换按键后目标坐标准确');
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click();ui.click('#preview-kb .kb-key');document.querySelectorAll('#key-inspector details').forEach(e=>e.open=true);ui.set('#key-inspector textarea','{ unfinished key')");
  await reload();
  ok(await ev("document.querySelector('#key-inspector textarea').value==='{ unfinished key'"),'高级按键 JSON 未完成文本自动恢复');
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click();ui.button('放弃并继续',document.querySelector('dialog[open]')).click()");
  await ev("ui.click('#preview-kb .kb-key');ui.button('+ 添加变体',document.querySelector('#key-inspector')).click();ui.set('dialog[open] input[placeholder=标签]','变体草稿')");
  await reload();
  ok(await ev("document.querySelector('dialog[open] input[placeholder=标签]').value==='变体草稿'"),'状态变体窗口未应用输入自动恢复');
  await ev("ui.button('取消',document.querySelector('dialog[open]')).click();ui.button('放弃改动',Array.from(document.querySelectorAll('dialog[open]')).pop()).click()");
  await sleep(60);
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click()");
  await ev("ui.click('#preview-kb .kb-key');ui.click('[data-slot=\"swipe.up\"]');ui.set('.inline-gesture-body select','direct');ui.set('.inline-gesture-body .action-editor select','text')");
  await reload();
  ok(await ev("document.querySelector('.inline-gesture-body .action-editor select').value==='text'"),'尚未填完的动作类型也能恢复');
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click();ui.button('放弃并继续',document.querySelector('dialog[open]')).click()");
  // Raw invalid JSON is cached as text, never parsed into the committed document.
  await ev("document.getElementById('layout-json-card').open=true;ui.set('#json-editor','{ unfinished draft');");
  await reload();
  ok(await ev("document.getElementById('json-editor').value==='{ unfinished draft'&&FE.state.jsonDirty"),'未完成 JSON 刷新不丢失');
  await ev("ui.set('#json-editor',FE.serializeProfile(FE.state.profile,true));ui.click('#json-apply')");
  for(const [tab,id] of [['tab-popup','popup-json'],['tab-theme','th-json'],['tab-symbols','sym-json']]){
    await ev(`FE.activateTab('${tab}');ui.set('#${id}','{ ${id} unfinished');`);await reload();
    ok(await ev(`FE.state.activeTab==='${tab}'&&document.getElementById('${id}').value==='{ ${id} unfinished'`),tab+' 未应用 JSON 和页签恢复');
  }
  const popupText=JSON.stringify({type:'foxy.popup-profile',schemas:{default:{q:{normal:['q','Q']}}}});
  await ev(`FE.activateTab('tab-popup');ui.set('#popup-json',${JSON.stringify(popupText)});ui.click('#popup-json-apply');FE.state.openPopupKeys={q:true};FE.renderPopupTab();document.querySelector('#popup-keys .popup-cand').click();ui.set('dialog[open] input','候选草稿');`);
  await reload();
  ok(await ev("document.querySelector('dialog[open] input').value==='候选草稿'"),'popup 候选未应用输入自动恢复');
  ok(await ev("FE.state.popupProfile.schemas.default.q.normal[0]==='q'"),'候选恢复不自动提交');
  await ev("ui.button('取消',document.querySelector('dialog[open]')).click();ui.button('放弃改动',Array.from(document.querySelectorAll('dialog[open]')).pop()).click()");
  await sleep(60);
  await ev("FE.activateTab('tab-layout');document.getElementById('layout-json-card').open=false;");
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
  await ev('window.scrollTo(0,0);FE.renderPreviewOnly()');await sleep(180);
  const mobile=await ev(`({top:document.getElementById('preview-kb').getBoundingClientRect().top+scrollY,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})`);
  console.log('Mobile metrics:',JSON.stringify(mobile));await shot('mobile-initial');
  ok(mobile.overflow===0,'393px 无横向溢出');ok(mobile.top<300,'手机预览前移到首屏');
  await shot('mobile-initial');
  await ev("ui.click('#preview-kb .kb-key');ui.click('[data-slot=\"swipe.up\"]')");await sleep(150);
  await shot('mobile-inspector');
  ok(await ev("document.querySelector('.inspector-actions').getBoundingClientRect().bottom<=innerHeight+1"),'手机应用按钮保持可见');
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click()");
  for(const width of [320,360,414]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:true});await ev('FE.renderPreviewOnly()');
    if(await ev('document.documentElement.scrollWidth>document.documentElement.clientWidth')){console.log('Overflow',await ev('Array.from(document.body.querySelectorAll("*")).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right})).slice(0,12)'));await shot('overflow-'+width);}
    ok(await ev('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),width+'px 页面无横向溢出');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await ev("document.querySelector('#layout-sections .chip').scrollIntoView({block:'center'});window.beforeTouch=JSON.stringify(FE.state.profile)");
  await sleep(100);
  const pt=await ev("(()=>{let r=document.querySelector('#layout-sections .chip').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  const scrollBefore=await ev('scrollY');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt.x,y:pt.y}]});
  for(let i=1;i<=8;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt.x,y:pt.y-i*18}]});await sleep(20);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(200);
  ok(await ev('JSON.stringify(FE.state.profile)===window.beforeTouch'),'从键内容滑动不误改布局');
  ok(await ev('scrollY')>scrollBefore,'从普通键内容开始可以纵向滚动');
  await sleep(160);
  await ev("document.querySelector('#layout-sections .chip').scrollIntoView({block:'center'});window.dragBefore=JSON.stringify(FE.state.profile);");
  const points=await ev(`(()=>{let chips=document.querySelectorAll('#layout-sections .chip:not(.chip-add)'),a=chips[0].querySelector('.drag-handle').getBoundingClientRect(),b=chips[2].getBoundingClientRect();return {a:{x:a.left+a.width/2,y:a.top+a.height/2},b:{x:b.left+b.width/2,y:b.top+b.height/2},visible:a.width>0}})()`);
  ok(points.visible,'触屏显示明确拖动手柄');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points.a]});
  for(let i=1;i<=8;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:points.a.x+(points.b.x-points.a.x)*i/8,y:points.a.y+(points.b.y-points.a.y)*i/8}]});await sleep(20);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(260);
  ok(await ev('JSON.stringify(FE.state.profile)!==window.dragBefore'),'手柄拖动可以移动按键');
  await ev("ui.click('#top-undo')");
  ok(await ev('JSON.stringify(FE.state.profile)===window.dragBefore'),'拖动撤销恢复原布局');
  // A viewport reduced by the onscreen keyboard must still retain its action bar.
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:480,deviceScaleFactor:1,mobile:true});
  await ev("ui.click('#preview-kb .kb-key')");await sleep(100);
  ok(await ev("document.querySelector('.inspector-actions').getBoundingClientRect().bottom<=innerHeight+1"),'缩小可视高度后操作栏可见');
  await ev("ui.button('取消',document.querySelector('#key-inspector')).click()");
  // Storage failure must not continue to report successful persistence.
  await ev("window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota')};FE.autosaveDraft();");
  ok(await ev("document.getElementById('draft-save-status').classList.contains('error')"),'存储失败明确显示');
  await ev('Storage.prototype.setItem=window.originalSet;FE.autosaveDraft();');
  ok(await ev('FE.state.saveStatus==="saved"'),'存储恢复后提示恢复正常');
  if(errors.length)console.error('Browser errors:',JSON.stringify(errors,null,2));
  ok(errors.length===0,'浏览器无运行时异常');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,mobile},null,2));
}).then(()=>console.log(checks+' checks passed')).catch(e=>{console.error(e.stack);process.exitCode=1;});
