'use strict';
const fs=require('fs'),path=require('path');let checks=0;
function ok(value,message){if(!value)throw Error(message);checks++;console.log('✓ '+message);}
require('./browser-harness').run(async({send,ev,sleep,root,errors})=>{
  const out=path.join(root,'..','audit','batch-editor');fs.mkdirSync(out,{recursive:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await ev(`window.batchUi={
    button:(name,root=document)=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent.trim()===name),
    keys:()=>Array.from(document.querySelectorAll('#preview-kb button.kb-key')),
    start:()=>batchUi.button('多选 / 批量粘贴').click(),
    set:(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  };
  FE.applyProfileText(JSON.stringify({type:'foxy.keyboard-layout',keys:{
    a:{ref:'rime.a',textSize:21,colors:{text:'#FFCC3344'},swipe:{up:{action:{type:'text',text:'UP'}}}},
    b:{ref:'rime.b',swipe:{down:{ref:'rime.Down'}}}
  },layouts:{default:{sections:[{type:'rows',rows:[[{ref:'a'},{ref:'b',label:'B'},{ref:'b',label:'C'}],
    {height:1.2,width:0.9,keys:[{ref:'b'}]}]},{type:'grid',columns:2,rows:1,keys:[{column:0,row:0,ref:'b'}]}],
    split:{sections:[{type:'rows',rows:[[{ref:'a'},{ref:'b'}]]}]}},other:{sections:[{type:'rows',rows:[[{ref:'b'}]]}]}}}));`);
  const original=await ev('JSON.stringify(FE.state.profile)'),history=await ev('FE.state.history.length');
  await ev(`batchUi.start();batchUi.keys()[0].click();batchUi.button('复制外观与手势').click();`);
  ok(await ev('FE.state.batchKeys.length===0&&!!FE.state.keyClipboard'),'复制一个来源后可直接选择目标');
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'复制不修改文档');
  await ev(`batchUi.keys()[1].click();batchUi.keys()[2].click()`);
  ok(await ev('FE.state.batchKeys.length===2&&!FE.state.editorController&&!document.querySelector("dialog[open]")'),'多选不打开单键编辑器');
  ok(await ev(`document.querySelectorAll('#preview-kb .batch-selected').length===2&&document.querySelectorAll('#layout-sections .batch-selected').length===2`),'预览与结构区同步显示多选标记');
  ok(await ev(`batchUi.keys()[1].getAttribute('aria-pressed')==='true'&&document.querySelector('.batch-status').textContent.includes('已选 2 个键')`),'选择状态同时提供读屏属性与数量');
  await ev(`batchUi.button('仅粘贴外观').click()`);
  ok(await ev(`document.querySelector('dialog[open]').textContent.includes('2 个键')&&document.querySelectorAll('.batch-comparison .kb-key').length===2`),'确认窗口显示影响数量和前后预览');
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'确认前不写入文档');
  await ev(`batchUi.button('取消',document.querySelector('dialog[open]')).click()`);await sleep(60);
  ok(await ev('JSON.stringify(FE.state.profile)')===original&&await ev('FE.state.history.length')===history,'取消整批粘贴不改变历史');
  ok(await ev('FE.state.batchKeys.length===2'),'取消保留目标选择便于重试');
  await ev(`batchUi.button('仅粘贴外观').click();batchUi.button('应用到 2 个键',document.querySelector('dialog[open]')).click()`);await sleep(80);
  ok(await ev(`FE.state.profile.layouts.default.sections[0].rows[0].slice(1).every(k=>k.textSize===21&&k.colors.text==='#FFCC3344')`),'外观批量应用到两个目标');
  ok(await ev('FE.state.history.length')===history+1,'整批修改只增加一个撤销点');
  ok(await ev(`FE.state.profile.layouts.default.sections[0].rows[0][1].label==='B'&&FE.state.profile.keys.b.textSize===undefined`),'保留目标内容且不改共享定义');
  await ev(`document.getElementById('top-undo').click()`);
  ok(await ev('JSON.stringify(FE.state.profile)')===original,'一次撤销完整还原外观批次');
  await ev(`batchUi.keys()[1].click();batchUi.keys()[2].click();batchUi.button('仅粘贴手势').click();batchUi.button('应用到 2 个键',document.querySelector('dialog[open]')).click()`);await sleep(60);
  ok(await ev(`(()=>{let items=FE.compileLayout(FE.state.profile,'default',{status:FE.state.status}).sections[0].rows[0].keys;return items.slice(1).every(k=>k.eff.swipe.up.action.text==='UP'&&!k.eff.swipe.down&&k.eff.tap.ref===undefined)})()`),'手势粘贴替换旧方向');
  await ev(`document.getElementById('top-undo').click();batchUi.button('完成多选').click();batchUi.keys()[0].click();batchUi.set(document.querySelector('[aria-label="按键标签"]'),'pending');batchUi.start()`);
  ok(await ev(`!!document.querySelector('dialog[open]')&&!FE.state.batchMode`),'进入多选前先处理单键未应用草稿');
  await ev(`batchUi.button('继续编辑',document.querySelector('dialog[open]')).click()`);await sleep(60);
  ok(await ev(`!FE.state.batchMode&&!!FE.state.editorController&&document.querySelector('[aria-label="按键标签"]').value==='pending'`),'继续编辑保留草稿并取消多选入口');
  await ev(`batchUi.start();batchUi.button('放弃并继续',document.querySelector('dialog[open]')).click()`);await sleep(60);
  ok(await ev('FE.state.batchMode&&!FE.state.editorController'),'处理草稿后进入多选');
  await ev(`batchUi.button('全选当前布局').click()`);
  ok(await ev('FE.state.batchKeys.length===5'),'全选涵盖普通行和网格');
  await ev(`batchUi.button('清空选择').click();document.querySelector('#layout-sections .gedit-key').click()`);
  ok(await ev('FE.state.batchKeys.length===1&&FE.state.batchKeys[0].r===null&&!document.querySelector("dialog[open]")'),'结构网格支持同一多选模式');
  await ev(`document.querySelector('#layout-sections .gedit-key').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))`);
  ok(await ev('FE.state.batchKeys.length===0'),'结构网格可用空格键取消选择');
  await ev(`batchUi.keys()[0].click();FE.setSplitMode(true);FE.renderAll()`);
  ok(await ev('!FE.state.batchMode&&FE.state.batchKeys.length===0'),'切换分体清除旧坐标');
  await ev(`FE.setSplitMode(false);FE.renderAll();batchUi.keys()[0].dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));batchUi.keys()[1].click()`);
  ok(await ev('FE.state.batchMode&&FE.state.batchKeys.length===2'),'Ctrl 点击进入多选并继续添加目标');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  ok(await ev('!FE.state.batchMode&&!document.querySelector(".batch-selected")'),'Escape 退出多选');
  const rowBefore=await ev('JSON.stringify(FE.state.profile)'),rowHistory=await ev('FE.state.history.length');
  await ev(`Array.from(document.querySelectorAll('.row-head button')).find(b=>b.textContent==='复制整行').click()`);await sleep(80);
  ok(await ev(`FE.state.profile.layouts.default.sections[0].rows.length===3&&JSON.stringify(FE.state.profile.layouts.default.sections[0].rows[0])===JSON.stringify(FE.state.profile.layouts.default.sections[0].rows[1])`),'复制整行在原行下方插入完整副本');
  ok(await ev('FE.state.history.length')===rowHistory+1,'整行复制只产生一个撤销点');
  await ev(`document.getElementById('top-undo').click()`);
  ok(await ev('JSON.stringify(FE.state.profile)')===rowBefore,'整行复制可一次撤销');
  // Touch uses the explicit mode, with no modifier key or drag handle required.
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:851,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await sleep(220);
  async function touch(selector){
    await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await sleep(80);
    const rect=await ev(`(()=>{let r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[rect]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);
  }
  await touch('#batch-key-tools button');
  await touch('#preview-kb button.kb-key');
  ok(await ev('FE.state.batchMode&&FE.state.batchKeys.length===1&&!FE.state.editorController'),'手机真实触摸选择按键');
  await ev(`batchUi.button('复制外观与手势').click()`);
  await touch('#preview-kb .kb-row .kb-slot:nth-child(2) button.kb-key');
  await touch('#preview-kb .kb-row .kb-slot:nth-child(3) button.kb-key');
  ok(await ev('FE.state.batchKeys.length===2'),'手机可连续选择多个目标');
  await ev(`batchUi.button('仅粘贴手势').click()`);await sleep(100);
  ok(await ev(`(()=>{let d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()`),'手机确认窗口位于视口内');
  ok(await ev(`document.documentElement.scrollWidth<=innerWidth+1`),'手机页面无横向溢出');
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'mobile-batch.png'),Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:480,deviceScaleFactor:1,mobile:true});await sleep(200);
  ok(await ev(`(()=>{let b=batchUi.button('应用到 2 个键',document.querySelector('dialog[open]')).getBoundingClientRect();return b.bottom<=innerHeight+1&&b.top>=0})()`),'短视口仍可确认批量粘贴');
  await ev(`batchUi.button('应用到 2 个键',document.querySelector('dialog[open]')).click()`);await sleep(100);
  ok(await ev(`!document.querySelector('dialog[open]')&&FE.state.profile.layouts.default.sections[0].rows[0][2].swipe.up.action.text==='UP'`),'手机批量手势应用成功');
  ok(errors.length===0,'浏览器交互无运行异常');
}).then(()=>console.log(checks+' batch browser checks passed')).catch(error=>{console.error(error.stack);process.exitCode=1;});
