'use strict';
const fs=require('fs'),path=require('path');
let checks=0;
function ok(value,message){if(!value)throw Error(message);checks++;console.log('✓ '+message);}
require('./browser-harness').run(async({send,ev,sleep,root,errors})=>{
  const out=path.join(root,'..','audit','editor-consistency');fs.mkdirSync(out,{recursive:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await ev(`window.checkUi={
    button:(name,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent.trim()===name),
    set:(element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},
    field:(label,root=document.querySelector('dialog[open]'))=>Array.from(root.querySelectorAll('.form-row')).find(row=>row.querySelector('label')?.textContent.trim()===label)?.querySelector('input[type=number]'),
    open:()=>document.querySelector('#layout-sections .chip:not(.chip-add)').click(),
    key:()=>FE.state.profile.layouts.default.sections[0].rows[0][0]
  };window.downloads=[];HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push({name:this.download,url:this.href});};`);
  const original=await ev('JSON.stringify(FE.state.profile)');
  await ev(`document.querySelector('#preview-kb .kb-key').click();checkUi.set(document.querySelector('[aria-label="宽度权重"]'),'-1');checkUi.button('应用',document.getElementById('key-inspector')).click();`);
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'侧栏拦截非法权重');
  await ev(`checkUi.button('取消',document.getElementById('key-inspector')).click();checkUi.button('放弃并继续',document.querySelector('dialog[open]')).click();`);await sleep(60);
  await ev(`checkUi.open();checkUi.set(checkUi.field('权重'),'-1');checkUi.button('保存',document.querySelector('dialog[open]')).click();`);
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'大弹窗同样拦截非法权重');
  ok(await ev(`document.querySelector('.key-commit-errors').textContent.includes('weight')&&!!document.querySelector('dialog[open]')`),'非法输入保留在弹窗中并显示错误');
  await ev(`checkUi.button('取消',document.querySelector('dialog[open]')).click();checkUi.button('放弃改动',Array.from(document.querySelectorAll('dialog[open]')).pop()).click();`);await sleep(60);
  const history=await ev('FE.state.history.length');
  await ev(`checkUi.open();checkUi.button('→ 右移',document.querySelector('dialog[open]')).click();`);
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'大弹窗移动仅改变草稿');
  await ev(`checkUi.button('取消',document.querySelector('dialog[open]')).click();checkUi.button('放弃改动',Array.from(document.querySelectorAll('dialog[open]')).pop()).click();`);await sleep(60);
  ok(await ev('JSON.stringify(FE.state.profile)')===original&&await ev('FE.state.history.length')===history,'取消移动保持文档及历史不变');
  await ev(`checkUi.open();checkUi.set(document.querySelector('dialog[open] input[placeholder^="本地覆盖"]'),'移动后');checkUi.button('→ 右移',document.querySelector('dialog[open]')).click();checkUi.button('保存',document.querySelector('dialog[open]')).click();`);await sleep(60);
  ok(await ev(`FE.state.profile.layouts.default.sections[0].rows[0][1].label==='移动后'`),'保存把内容写到移动后的正确位置');
  ok(await ev('FE.state.history.length')===history+1,'移动和改标签只产生一个撤销点');
  await ev(`document.getElementById('top-undo').click()`);
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'撤销同时恢复位置和内容');

  // Opening from a scrolled list must reveal the inspector, then return to that list.
  await ev(`FE.activateTab('tab-keys');document.querySelector('#keys-list .def-row-click').scrollIntoView({block:'center'});`);await sleep(100);
  const listScroll=await ev('scrollY');
  await ev(`document.querySelector('#keys-list .def-row-click').click()`);await sleep(150);
  ok(await ev(`(()=>{let r=document.getElementById('key-inspector-title').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`),'从定义列表打开后标题可见');
  await ev(`checkUi.button('取消',document.getElementById('key-inspector')).click()`);await sleep(150);
  ok(Math.abs(await ev('scrollY')-listScroll)<2,'取消后返回原列表滚动位置');
  ok(await ev(`document.activeElement.classList.contains('def-row-click')`),'返回后焦点落在原定义行');

  // Each file type protects pending raw text, including invalid JSON.
  await ev(`FE.loadThemeProfileText(FE.serializeThemeProfile(FE.themeNewProfile()));`);
  const files=[
    ['layout','tab-layout','json-editor','op-export','layout-file-status'],
    ['popup','tab-popup','popup-json','popup-export','popup-file-status'],
    ['theme','tab-theme','th-json','th-export','theme-file-status'],
    ['symbols','tab-symbols','sym-json','sym-export','symbols-file-status'],
    ['emoji','tab-symbols','sym-json','sym-export','emoji-file-status'],
    ['kaomoji','tab-symbols','sym-json','sym-export','kaomoji-file-status']
  ];
  for(const [kind,tab,id,exportId,statusId] of files){
    if(['symbols','emoji','kaomoji'].includes(kind))await ev(`FE.loadSymbolProfileText('[]','${kind}')`);
    await ev(`FE.activateTab('${tab}');window.exportText=document.getElementById('${id}').value;checkUi.set(document.getElementById('${id}'),'{ unfinished');`);
    const count=await ev('downloads.length');
    await ev(`document.getElementById('${exportId}').click();checkUi.button('应用 JSON 并导出',document.querySelector('dialog[open]')).click()`);
    ok(await ev('downloads.length')===count,kind+' 无效草稿不会触发下载');
    await ev(`checkUi.button('导出已应用内容',document.querySelector('dialog[open]')).click()`);await sleep(60);
    ok(await ev('downloads.length')===count+1,kind+' 可显式导出已应用内容');
    ok(await ev(`document.getElementById('${statusId}').textContent.includes('有未应用 JSON 草稿')&&document.getElementById('${id}').value==='{ unfinished'`),kind+' 导出旧内容后仍保留并标明草稿');
    await ev(`(()=>{let value=JSON.parse(window.exportText);if(['symbols','emoji','kaomoji'].includes('${kind}'))value={multiLine:true,groups:[{label:{zh:'导出验证'},symbols:['EXPORT-CHECK']}]};else value.author='EXPORT-CHECK';checkUi.set(document.getElementById('${id}'),JSON.stringify(value));document.getElementById('${exportId}').click();checkUi.button('应用 JSON 并导出',document.querySelector('dialog[open]')).click();})()`);
    ok(await ev(`(async()=>{let text=await(await fetch(downloads[downloads.length-1].url)).text();return text.includes('EXPORT-CHECK')})()`),kind+' 下载文件包含本次应用的新内容');
    await sleep(60);
    ok(await ev('downloads.length')===count+2&&!await ev(`!!document.querySelector('dialog[open]')`),kind+' 合法草稿应用后生成下载');
    ok(!await ev(`document.getElementById('${statusId}').textContent.includes('有未应用 JSON 草稿')`),kind+' 应用后清除未应用提示');
  }
  await ev(`FE.activateTab('tab-layout');FE.applyProfileText(FE.DEFAULT_PROFILE_TEXT);window.scrollTo(0,0)`);
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});await sleep(200);
  await ev('FE.cancelScrollRestore();window.scrollTo(0,0)');
  ok(await ev(`document.getElementById('key-inspector').getBoundingClientRect().height<130`),'手机空属性窗压缩为简短提示');
  ok(await ev(`document.querySelector('.tabs').getBoundingClientRect().bottom<document.querySelector('.preview-panel').getBoundingClientRect().top`),'手机模块切换位于预览之前');
  const mobile=await ev(`({keyboard:document.getElementById('preview-kb').getBoundingClientRect().top+scrollY,import:document.getElementById('op-import').getBoundingClientRect().top+scrollY})`);
  console.log('Mobile metrics:',JSON.stringify(mobile));
  await ev(`document.querySelector('#preview-kb .kb-key').click();checkUi.set(document.querySelector('[aria-label="按键标签"]'),'新键');`);await sleep(180);
  ok(await ev(`document.querySelector('.inspector-sample .kb-label').textContent==='新键'`),'手机固定小预览跟随草稿');
  await ev(`document.querySelector('.inspector-body').scrollTop=600`);
  ok(await ev(`(()=>{let r=document.querySelector('.inspector-sample').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight})()`),'滚动表单后当前键预览仍可见');
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'mobile-sample.png'),Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:480,deviceScaleFactor:1,mobile:true});await sleep(200);
  ok(await ev(`document.querySelector('.inspector-body').clientHeight>=80&&document.querySelector('.inspector-actions').getBoundingClientRect().bottom<=innerHeight+1`),'缩小可视高度后仍可编辑并应用');
  ok(errors.length===0,'交互回归无浏览器运行异常');
}).then(()=>console.log(checks+' consistency checks passed')).catch(error=>{console.error(error.stack);process.exitCode=1;});
