'use strict';
// Isolated local browser for repeatable UI regression checks. No runtime dependencies.
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async function(test){
  const executable=[process.env.MACRO_SMOKE_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(p=>fs.existsSync(p));
  if(!executable)throw Error('Edge/Chrome not found');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'foxy-workspace-smoke-'));
  const proc=spawn(executable,['--headless=new','--remote-debugging-port=0','--user-data-dir='+dir,'--no-first-run','--no-default-browser-check','--disable-gpu',path.join(root,'index.html')],{stdio:'ignore',windowsHide:true});
  let ws;
  try{
    const portPath=path.join(dir,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portPath);i++)await sleep(100);
    const port=fs.readFileSync(portPath,'utf8').split('\n')[0];
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve);ws.addEventListener('error',reject);});
    let id=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',event=>{
      const m=JSON.parse(event.data);
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
      if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
    const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    const ready=async()=>{for(let i=0;i<100;i++){if(await ev('!!(window.FE && FE.openKeyInspector && (document.querySelector(".kb-key") || FE.state.activeTab==="tab-symbols"))'))return;await sleep(100);}throw Error('Page failed to initialize');};
    await send('Runtime.enable');await send('Page.enable');await ready();
    await test({send,ev,ready,sleep,root,errors});
  }finally{
    if(ws)ws.close();proc.kill();
    // Only remove the uniquely allocated test profile after the browser exits.
    await Promise.race([new Promise(resolve=>proc.once('exit',resolve)),sleep(1500)]);
    if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('foxy-workspace-smoke-')){
      try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch(_){}
    }
  }
};
