'use strict';
const fs=require('fs'),path=require('path');let checks=0;
function ok(value,text){if(!value)throw Error(text);checks++;console.log('✓ '+text);}
require('./browser-harness').run(async({ev,send,sleep,root,errors})=>{
  const out=path.join(root,'..','audit','interface-copy');fs.mkdirSync(out,{recursive:true});
  const implementationTerms=/SharedPreferences|TextView|WRAP_CONTENT|includeBuiltin|\.java\b|基线 §|建模边界|未找到消费点/;
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const tab of ['tab-layout','tab-keys','tab-actions','tab-popup','tab-theme','tab-symbols']){
    await ev(`FE.activateTab('${tab}')`);
    const text=await ev(`document.getElementById('${tab}').innerText`);
    ok(!implementationTerms.test(text),tab+' 可见文案不含源码实现说明');
    const collapsed=await ev(`Array.from(document.getElementById('${tab}').querySelectorAll('[data-workspace-section]')).filter(d=>!d.open).length`);
    ok(collapsed===0,tab+' 主分栏仍默认展开');
  }
  await ev("FE.activateTab('tab-theme');document.getElementById('th-import').closest('details').scrollIntoView({block:'start'});");
  const notes=await ev("Array.from(document.getElementById('th-import').closest('details').querySelectorAll('.status.dim')).map(e=>e.textContent.trim()).filter(Boolean)");
  ok(notes.length===3&&notes.slice(1).join('').length<160,'主题文件仅保留文件名提示和两句使用说明');
  ok(notes.join('').includes('同步切换')&&notes.join('').includes('Foxy 中选择'),'主题说明明确配色联动和使用方法');
  await sleep(80);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'theme-page.png'),Buffer.from(shot.data,'base64'));
  await ev("FE.loadThemeProfileText(FE.serializeThemeProfile(FE.themeNewProfile()));");
  ok(!implementationTerms.test(await ev("document.getElementById('tab-theme').innerText")),'导入主题后的配色提示也面向用户');
  await ev("FE.activateTab('tab-layout');document.querySelector('#preview-kb .kb-key').click();document.querySelectorAll('#key-inspector details').forEach(d=>d.open=true);");
  ok(!implementationTerms.test(await ev("document.getElementById('key-inspector').innerText")),'按键颜色和弹出菜单说明不含内部实现术语');
  ok(errors.length===0,'文案调整未引入浏览器异常');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,themeNotes:notes},null,2));
}).then(()=>console.log(checks+' copy checks passed')).catch(error=>{console.error(error.stack);process.exitCode=1;});
