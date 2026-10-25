/* Shared desktop inspector / mobile sheet. File operations remain in their tabs. */
(function () {
'use strict';
var FE=window.FE, state=FE.state, h=FE.h, clearEl=FE.clearEl;
if (typeof document === 'undefined' || !document.getElementById('preview-kb')) return;
function $(id) { return document.getElementById(id); }
function refreshPreview() { if(FE.renderPreviewOnly) FE.renderPreviewOnly(); }
// Persist each static page section by its stable content anchor. Inspector,
// recovery-record and per-definition details have their own state and must not
// shift the positions of sections belonging to the six document tabs.
var pageSections={};
function registerPageSection(key,anchor){
  var node=anchor;
  while(node&&node.tagName!=='DETAILS')node=node.parentNode;
  if(node){pageSections[key]=node;node.setAttribute('data-workspace-section',key);}
}
['preview-panel-title','pt-state-group','pt-theme','op-import','layout-select','json-editor',
 'keys-list','icons-list','actions-list','macros-list','popup-import','popup-preview','popup-keys','popup-json',
 'th-import','th-validation','th-colors','th-keytypes','th-json','sym-import','sym-validation','sym-list','sym-json'
].forEach(function(id){registerPageSection(id,$(id));});
registerPageSection('preview-legend',document.querySelector('.preview-legend'));
// A few sections contain only static text or a collection of import controls.
Array.prototype.forEach.call(document.querySelectorAll('.tabpanel details.card'),function(section){
  if(section.getAttribute('data-workspace-section'))return;
  var parent=section.parentNode,insideDetails=false;
  while(parent&&!parent.classList.contains('tabpanel')){if(parent.tagName==='DETAILS')insideDetails=true;parent=parent.parentNode;}
  if(!parent||insideDetails)return;
  var anchor=section.querySelector('[id]');
  if(anchor)registerPageSection(parent.id+':'+anchor.id,anchor);
});
function capturePageSections(){
  var result={};Object.keys(pageSections).forEach(function(key){result[key]=pageSections[key].open;});return result;
}
var measurePending=false;
function measureInspector(){
  measurePending=false;
  var preview=document.querySelector('.preview-panel'), workspace=$('editing-workspace');
  if(!preview||!workspace)return;
  var height=preview.getBoundingClientRect().height;
  if(height>0)workspace.style.setProperty('--inspector-height',height+'px');
}
FE.scheduleInspectorMeasure=function(){
  if(measurePending)return;measurePending=true;
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(measureInspector);else measureInspector();
};
function inspectorHeading(host){
  var heading=h('h3',{id:'key-inspector-title',tabindex:'-1'},'按键属性');
  host.appendChild(h('div',{class:'inspector-heading'},heading,h('button',{type:'button','aria-label':'关闭按键属性',onclick:function(){
    FE.leaveKeyEditor(function(){state.inspectorOpen=false;showEmptyInspector();FE.autosaveDraft();});
  }},'×')));
  return heading;
}
function showEmptyInspector(){
  var host=$('key-inspector'), workspace=$('editing-workspace');
  if(!host)return;
  clearEl(host);host.hidden=state.inspectorOpen===false;
  host.classList.add('is-empty');
  if(workspace)workspace.classList.toggle('has-inspector',!host.hidden);
  document.body.classList.remove('inspector-open');
  if(host.hidden)return;
  inspectorHeading(host);
  var count=(state.suspendedEdits||[]).length;
  host.appendChild(h('div',{class:'inspector-context',role:'status'},'未选择按键，请点击预览键盘上的按键。'+(count?' 已保留 '+count+' 份未应用草稿，重新选择原按键即可继续。':'')));
  var body=h('div',{class:'inspector-body'});
  ['基本信息','手势','状态变体','按键颜色覆盖','高级','弹出菜单'].forEach(function(title){
    var section=h('details',{class:'inspector-empty-section'});
    var summary=h('summary',{'aria-disabled':'true',tabindex:'-1'},h('button',{type:'button',disabled:true},title));
    summary.addEventListener('click',function(e){e.preventDefault();});
    summary.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')e.preventDefault();});
    section.addEventListener('toggle',function(){if(section.open)section.open=false;});
    section.appendChild(summary);body.appendChild(section);
  });
  host.appendChild(body);FE.scheduleInspectorMeasure();
}
function draftIdentity(saved){return FE.stableJson({file:saved.fileName,target:saved.target});}
function saveSuspended(controller){
  var valid=controller.editor.flush(),s=controller.editor.session;
  if(!s.dirty()&&valid)return;
  var saved=FE.serializeEditSession();if(!saved)return;
  var key=draftIdentity(saved);
  state.suspendedEdits=(state.suspendedEdits||[]).filter(function(d){return draftIdentity(d)!==key;});
  state.suspendedEdits.push(FE.deepClone(saved));
}
function closeEditor(options) {
  options=options||{};
  var controller=state.editorController;
  if(options.preserve&&controller)saveSuspended(controller);
  if(FE.closeActiveColorPicker)FE.closeActiveColorPicker();
  state.editorController=null; state.editSession=null;
  state.sel=null;
  showEmptyInspector();
  if(options.refresh!==false)refreshPreview();
  FE.autosaveDraft();
  if(controller && controller.returnFocus) {
    var target=document.querySelector(controller.returnFocus);
    if(target && target.focus) target.focus({preventScroll:true});
  }
}
FE.suspendKeyEditor=function(){closeEditor({preserve:true,refresh:false});};
FE.clearKeySelection=function(){closeEditor({preserve:true});};
FE.reconcileInspectorSelection=function(){
  var c=state.editorController;if(!c||c.committing||state.cacheRestoring)return;
  var t=c.editor.session.target;
  if(t.mode==='definition')return;
  var sel=state.sel;
  var compiled=FE.compileLayout(state.profile,state.layoutName,{status:state.status,split:state.splitMode});
  if(!sel||sel.s!==t.location.s||sel.r!==t.location.r||sel.k!==t.location.k||state.splitMode!==t.split||compiled.resolvedName!==t.layoutName)
    FE.suspendKeyEditor();
};
FE.leaveKeyEditor=function(next) {
  var c=state.editorController;
  if(!c || c.committing) { next(); return true; }
  c.hasInvalidGesture=!c.editor.flush();
  if(!c.editor.session.dirty() && !c.hasInvalidGesture) { closeEditor(); next(); return true; }
  if(c.confirming) return false;
  c.confirming=true;
  var modal=FE.openModal({title:'处理未应用的修改',onClose:function(){c.confirming=false;}});
  modal.body.appendChild(h('p',null,'当前按键有未应用的修改。请选择如何继续。'));
  modal.toolbar.appendChild(h('button',{type:'button',onclick:function(){modal.close();}},'继续编辑'));
  modal.toolbar.appendChild(h('button',{type:'button',onclick:function(){modal.close();closeEditor();next();}},'放弃并继续'));
  modal.toolbar.appendChild(h('button',{type:'button',class:'primary',onclick:function(){
    if(c.apply()) {modal.close();closeEditor();next();}
  }},'应用并继续'));
  return false;
};
function labelForTarget(t) {
  if(t.mode==='definition') return '共享定义 › '+t.name;
  return t.layoutName+' › '+(t.split?'分体':'常规')+' › 第 '+(t.location.s+1)+' 段 › '+
    (t.location.r==null?'网格键 '+(t.location.k+1):'第 '+(t.location.r+1)+' 行 · 第 '+(t.location.k+1)+' 键');
}
FE.openKeyInspector=function(opts) {
  var host=$('key-inspector');
  if(!host) return FE.openKeyDialog(opts);
  FE.leaveKeyEditor(function(){ mount(opts); });
};
FE.openStructureKeyDialog=function(opts){
  FE.leaveKeyEditor(function(){
    var target=Object.assign({layoutName:state.layoutName,split:state.splitMode},opts);
    var keys=FE.sessionContainer(state.profile,target);
    if(keys&&keys[target.location.k]){
      state.sel=FE.deepClone(target.location);refreshPreview();
      FE.openKeyDialog(Object.assign({},target,{placement:keys[target.location.k]}));
    }
  });
};
function mount(opts) {
  var host=$('key-inspector'), workspace=$('editing-workspace');
  clearEl(host); host.hidden=false;host.classList.remove('is-empty');state.inspectorOpen=true;
  if(workspace) workspace.classList.add('has-inspector');
  document.body.classList.add('inspector-open');
  opts=Object.assign({},opts);
  if(opts.layoutName) state.layoutName=opts.layoutName;
  if(opts.split!=null) state.splitMode=opts.split;
  if(opts.location) state.sel=FE.deepClone(opts.location);
  // Always read the committed placement after a pending editor has applied.
  var target={mode:opts.mode,layoutName:opts.layoutName||state.layoutName,split:opts.split==null?state.splitMode:opts.split,location:opts.location};
  if(opts.mode==='placement') {
    var container=FE.sessionContainer(state.profile,target);
    if(!container || !container[opts.location.k]) {closeEditor();return;}
    opts.placement=container[opts.location.k]; opts.grid=opts.location.r==null;
  }
  if(!opts.pendingDraft){
    var identity=draftIdentity({fileName:state.fileName,target:{mode:opts.mode,name:opts.name||null,layoutName:target.layoutName,split:target.split,location:FE.deepClone(opts.location||null),grid:!!opts.grid}});
    var index=(state.suspendedEdits||[]).findIndex(function(d){return draftIdentity(d)===identity;});
    if(index>=0){
      var saved=state.suspendedEdits[index],current=opts.mode==='definition'?(state.profile.keys||{})[opts.name]:opts.placement;
      if(FE.stableJson(current)===FE.stableJson(saved.original)){
        opts.pendingDraft=saved.draft;opts.pendingName=saved.name;opts.pendingUi=saved.ui;state.suspendedEdits.splice(index,1);
      }
    }
  }
  var heading=inspectorHeading(host);
  var context=h('div',{class:'inspector-context'}), status=h('div',{class:'inspector-draft-status',role:'status','aria-live':'polite'});
  var body=h('div',{class:'inspector-body'}), toolbar=h('div',{class:'inspector-actions'});
  var errors=h('div',{class:'inspector-errors status error',role:'alert'});
  host.append(context,status,body,errors,toolbar);
  var c={committing:false,confirming:false,returnFocus:'.kb-key-sel',hasInvalidGesture:false};
  var previewTimer=null;
  function changed(session) {
    if(state.editorController!==c)return;
    state.editSession=session;
    status.textContent=session.dirty()?'未应用 · 预览显示当前草稿':'修改此键后，点应用生效';
    if(state.editorController===c)FE.autosaveDraft();
    if(previewTimer) clearTimeout(previewTimer);
    previewTimer=setTimeout(function(){previewTimer=null;if(state.editorController===c){refreshPreview();FE.autosaveDraft();}},100);
  }
  c.editor=FE.buildKeyEditor(Object.assign({},opts,{
    surface:{body:body,toolbar:toolbar,close:closeEditor,requestClose:function(){FE.leaveKeyEditor(function(){});},leaveThen:FE.leaveKeyEditor},
    onDraftChange:changed
  }));
  if(!c.editor) {closeEditor();return;}
  state.editorController=c; state.editSession=c.editor.session;
  if(opts.pendingUi)c.editor.restore(opts.pendingUi);
  c.apply=function(){
    c.committing=true;
    var result;
    try {result=c.editor.apply();} finally {c.committing=false;}
    c.hasInvalidGesture=!result.ok;
    errors.textContent=result.ok?'':result.errors.join('；');
    return result.ok;
  };
  context.appendChild(h('div',null,labelForTarget(c.editor.session.target)));
  var defName=opts.mode==='definition'?opts.name:opts.placement&&opts.placement.ref;
  if(opts.mode==='definition') {
    var usage=FE.countKeyUsage(opts.name);
    context.appendChild(h('div',{class:'scope-notice'},'编辑共享定义 · 当前工程引用 '+usage.count+' 处（局部覆盖可能遮住修改）'));
    context.appendChild(h('button',{type:'button',class:'mini-button',onclick:function(){
      FE.showUsageDialog('共享定义 '+opts.name,usage);
    }},'查看引用位置'));
  } else {
    context.appendChild(h('div',{class:'scope-notice'},'仅修改此处 · 其他位置继续使用原定义'));
    if(defName && state.profile.keys && state.profile.keys[defName]) {
      var count=FE.countKeyUsage(defName).count;
      context.appendChild(h('button',{type:'button',class:'mini-button',onclick:function(){FE.openKeyInspector({mode:'definition',name:defName});}},'编辑共享定义 '+defName+' · '+count+' 处引用'));
    }
  }
  if(opts.mode==='placement') {
    var nav=h('div',{class:'inspector-key-nav'});
    [-1,1].forEach(function(delta){nav.appendChild(h('button',{type:'button',class:'mini-button',onclick:function(){
      var t=c.editor.session.target, compiled=FE.compileLayout(state.profile,t.layoutName,{split:t.split,noVariants:true,status:state.status});
      var items=[];FE.eachCompiledKey(compiled,function(item){if(item)items.push(item);});
      var current=items.findIndex(function(item){return item.s===t.location.s&&item.r===t.location.r&&item.k===t.location.k;});
      var item=items[current+delta];
      if(item)FE.openKeyInspector({mode:'placement',layoutName:t.layoutName,split:t.split,location:{s:item.s,r:item.r,k:item.k}});
    }},delta<0?'← 前一个键':'后一个键 →'));});
    context.appendChild(nav);
    context.appendChild(h('button',{type:'button',class:'mini-button',onclick:function(){
      var t=c.editor.session.target;
      FE.leaveKeyEditor(function(){
        var keys=FE.sessionContainer(state.profile,t);
        if(keys&&keys[t.location.k])FE.openKeyDialog(Object.assign({},t,{placement:keys[t.location.k]}));
      });
    }},'更多操作：移动、删除、另存为定义'));
  }
  toolbar.appendChild(h('button',{type:'button',onclick:function(){FE.leaveKeyEditor(function(){});}},'取消'));
  toolbar.appendChild(h('button',{type:'button',class:'primary',onclick:function(){if(c.apply())closeEditor();}},'应用'));
  changed(c.editor.session);refreshPreview();
  FE.scheduleInspectorMeasure();
  if(heading.focus)heading.focus({preventScroll:true});
}

function fileData() {
  var data=[['layout',state.fileName,FE.serializeProfile(state.profile,state.includeType),'layout-file-status']];
  if(state.popupProfile)data.push(['popup',state.popupFileName,JSON.stringify(state.popupProfile),'popup-file-status']);
  if(state.themeProfile)data.push(['theme',state.themeFileName,JSON.stringify(state.themeProfile),'theme-file-status']);
  Object.keys(state.symbolProfiles||{}).forEach(function(kind){data.push([kind,(state.symbolFileNames||{})[kind]||kind+'.json',JSON.stringify(state.symbolProfiles[kind]),kind+'-file-status']);});
  return data;
}
FE.renderSaveStatus=function(){
  var banner=$('draft-save-status');
  if(banner){banner.textContent=state.saveStatus==='error'?'浏览器草稿保存失败，请在对应文件页导出备份。':state.saveStatus==='saved'?'草稿已保存到浏览器':'';
    banner.classList.toggle('error',state.saveStatus==='error');}
  fileData().forEach(function(item){
    var element=$(item[3]);
    if(!element){
      var parent=$(item[0]==='popup'?'popup-status':item[0]==='theme'?'th-status':'sym-status');
      if(parent&&parent.parentNode){element=h('div',{id:item[3],class:'file-save-status'});parent.parentNode.insertBefore(element,parent);}
    }
    if(element)element.textContent=item[1]+' · '+(state.exportBaselines[item[0]]===item[2]?'与最近生成的下载一致':'修改尚未导出');
  });
};
FE.noteFileExport=function(kind){
  fileData().forEach(function(item){if(item[0]===kind)state.exportBaselines[kind]=item[2];});
  FE.autosaveDraft();
};
FE.guardLayoutExport=function(next){
  FE.leaveKeyEditor(function(){
    if(!state.jsonDirty){next();return;}
    var m=FE.openModal({title:'JSON 文本尚未应用'});
    m.body.appendChild(h('p',null,'导出使用已应用的布局。请先应用 JSON，或明确选择导出当前已应用内容。'));
    m.toolbar.appendChild(h('button',{type:'button',onclick:function(){m.close();var card=$('layout-json-card');if(card)card.open=true;$('json-editor').focus();}},'返回 JSON'));
    m.toolbar.appendChild(h('button',{type:'button',onclick:function(){m.close();next();}},'导出已应用内容'));
    m.toolbar.appendChild(h('button',{type:'button',class:'primary',onclick:function(){
      if(FE.applyProfileText($('json-editor').value)){m.close();next();}
    }},'应用 JSON 并导出'));
  });
};
FE.previewGridDrop=function(si,gi,target){
  Array.prototype.forEach.call(document.querySelectorAll('.grid-drop-preview'),function(e){e.remove();});
  if(!target||!target.el)return;
  var plan=FE.planGridDrop(FE.curSections()[si],gi,target),grid=target.el.parentNode;
  var dimensions=FE.gridDims(FE.curSections()[si]);
  (plan.rectangles||[]).forEach(function(r){if(!r)return;
    var mark=h('div',{class:'grid-drop-preview'+(plan.ok?'':' invalid'),'aria-hidden':'true'});
    mark.style.gridColumn=(r.column+1)+' / span '+Math.max(1,Math.min(r.columnSpan,dimensions.columns-r.column));
    mark.style.gridRow=(r.row+1)+' / span '+Math.max(1,Math.min(r.rowSpan,dimensions.rows-r.row));
    grid.appendChild(mark);
  });
};
// Guard controls before their existing handlers mutate context or open a file.
document.addEventListener('click',function(e){
  if(!state.editorController)return;
  var target=e.target;
  while(target&&target!==document.body){
    if(target.id==='key-inspector'||target.tagName==='DIALOG')return;
    var id=target.id||'';
    if(/^(op-import|op-load-example|op-folder-load|op-folder-complete|popup-import|popup-load-example|th-import|th-load-example|sym-import|sym-load-example|json-apply)$/.test(id)){
      e.preventDefault();e.stopImmediatePropagation();
      FE.leaveKeyEditor(function(){target.click();});return;
    }
    target=target.parentNode;
  }
},true);
// Changing preview modes clears selection, never the open panel shell.
// DOM focus moving into an input or a checkbox is not a selection change.
document.addEventListener('click',function(e){
  if(!state.editorController)return;
  var node=e.target;
  if(node&&(node.id==='preview-kb'||node.classList&&node.classList.contains('preview-stage')))FE.clearKeySelection();
});
// Escape closes only the active editor, never stealing Escape from a child dialog.
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&state.editorController&&!document.querySelector('dialog[open]')){e.preventDefault();FE.leaveKeyEditor(function(){});}
});
// Cache UI context independently from exported Foxy documents. Versioned and
// keyed by this origin/file URL's localStorage; no network storage is involved.
FE.captureWorkspace=function(){
  return {version:2,activeTab:state.activeTab,status:state.status,statusSample:state.statusSample,
    inspectorOpen:state.inspectorOpen,suspendedEdits:state.suspendedEdits,
    popupSchema:state.popupSchema,popupSelKey:state.popupSelKey,symbolKind:state.symbolKind,
    forms:state.recoveredForms,
    dialogs:Array.prototype.filter.call(document.querySelectorAll('dialog[open]'),function(d){return d.querySelector('input,textarea,select');}).map(function(d){
      var snap=d.__draftSnapshot?d.__draftSnapshot():{kind:'form',fields:FE.readEditorFields(d)};
      snap.title=(d.querySelector('h3')||{}).textContent||'编辑窗口';return snap;
    }),
    auxiliaryJson:{popup:FE.readPopupJsonDraft?FE.readPopupJsonDraft():null,
      theme:FE.readThemeJsonDraft?FE.readThemeJsonDraft():null,symbol:FE.readSymbolJsonDraft?FE.readSymbolJsonDraft():null},
    sectionOpen:capturePageSections(),
    scrollY:typeof window.scrollY==='number'?window.scrollY:0};
};
function persist(){if(!state.cacheRestoring)FE.autosaveDraft();}
document.addEventListener('input',persist);
document.addEventListener('change',persist);
document.addEventListener('toggle',persist,true);
document.addEventListener('click',function(){setTimeout(persist,0);});
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')persist();});
function showRecoveredForms(){
  var host=$('draft-recovery');if(!host||!state.recoveredForms.length)return;
  host.hidden=false;clearEl(host);
  host.appendChild(h('p',null,'已保留上次高级窗口的输入。以下内容尚未应用，可复制回对应编辑器。'));
  state.recoveredForms.forEach(function(form){
    var box=h('details',{},h('summary',null,form.title||'编辑窗口'));
    var text=(form.fields||[]).map(function(f){return f.type==='checkbox'?String(f.checked):f.value;}).filter(function(v){return v!=null&&v!=='';}).join('\n');
    box.appendChild(h('textarea',{class:'json-editor small',rows:4,value:text,'aria-label':form.title||'恢复的输入',readonly:true}));host.appendChild(box);
  });
  host.appendChild(h('button',{type:'button',onclick:function(){state.recoveredForms=[];clearEl(host);host.hidden=true;persist();}},'已处理这些恢复记录'));
}
// Persist immediately on pagehide: input text is captured even before change/blur.
function recovery(){
  var saved=state.recoveredEdit,w=state.recoveredWorkspace;
  state.cacheRestoring=true;
  try {
    if(w&&(w.version===1||w.version===2)){
      state.inspectorOpen=w.inspectorOpen!==false;
      state.suspendedEdits=Array.isArray(w.suspendedEdits)?w.suspendedEdits:[];
      if(w.status)state.status=w.status;
      if(w.statusSample)state.statusSample=w.statusSample;
      [['pt-shift','shift'],['pt-composing','composing'],['pt-ascii','ascii_mode'],['pt-disabled','disabled']].forEach(function(pair){if($(pair[0]))$(pair[0]).checked=!!state.status[pair[1]];});
      ['CTRL','ALT','META'].forEach(function(modifier){var el=$('pt-'+modifier.toLowerCase());if(el)el.checked=!!(state.status.modifiers&&state.status.modifiers[modifier]);});
      if($('pt-status-text'))$('pt-status-text').value=state.statusSample;
      if(w.popupSchema)state.popupSchema=w.popupSchema;
      if(w.popupSelKey)state.popupSelKey=w.popupSelKey;
      if(w.symbolKind)state.symbolKind=w.symbolKind;
      state.recoveredForms=Array.isArray(w.forms)?w.forms:[];
      if(w.activeTab&&$(w.activeTab))FE.activateTab(w.activeTab);
      FE.renderAll();
      var aux=w.auxiliaryJson||{};
      if(FE.restorePopupJsonDraft)FE.restorePopupJsonDraft(aux.popup);
      if(FE.restoreThemeJsonDraft)FE.restoreThemeJsonDraft(aux.theme);
      if(FE.restoreSymbolJsonDraft)FE.restoreSymbolJsonDraft(aux.symbol);
    }
    if(state.recoveredJson!=null){$('json-editor').value=state.recoveredJson;state.jsonDirty=true;state.recoveredJson=null;}
    if(saved){
      var t=saved.target,original=t&&t.mode==='definition'?(state.profile.keys||{})[t.name]:t?(FE.sessionContainer(state.profile,t)||[])[t.location.k]:null;
      if(saved.version===1&&saved.fileName===state.fileName&&FE.stableJson(original)===FE.stableJson(saved.original)){
        state.recoveredEdit=null;
        mount(Object.assign({},t,{pendingDraft:saved.draft,pendingName:saved.name,pendingUi:saved.ui}));
      }else{
        var host=$('draft-recovery');if(host){host.hidden=false;host.textContent='已保留旧按键草稿，但原位置已改变，未自动覆盖。';}
      }
    }
    // Version 1 stored one positional array across the entire page. The changing
    // inspector made that array ambiguous; retain the documents/drafts but let
    // page sections use their HTML defaults when migrating that old cache.
    if(w&&w.version===2&&FE.isPlainObject(w.sectionOpen))Object.keys(pageSections).forEach(function(key){
      if(typeof w.sectionOpen[key]==='boolean')pageSections[key].open=w.sectionOpen[key];
    });
    if(w&&Array.isArray(w.dialogs))w.dialogs.forEach(function(saved){
      var restored=false;
      if(saved.kind==='key-variant'&&state.editorController)restored=state.editorController.editor.restoreVariant(saved);
      if(saved.kind==='popup-candidate'&&FE.restorePopupCandidate)restored=FE.restorePopupCandidate(saved);
      if(!restored)state.recoveredForms.push(saved);
    });
    showRecoveredForms();
    if(!state.editorController)showEmptyInspector();
    if(w&&w.scrollY&&typeof window.scrollTo==='function')requestAnimationFrame(function(){window.scrollTo(0,w.scrollY);});
  }catch(e){var host=$('draft-recovery');if(host){host.hidden=false;host.textContent='部分编辑状态无法恢复，原草稿仍保留在浏览器缓存中。';}return;}
  finally{state.cacheRestoring=false;}
  state.recoveredWorkspace=null;
  persist();
}
FE.restoreWorkspace=recovery;
if(typeof ResizeObserver==='function'){
  var observer=new ResizeObserver(FE.scheduleInspectorMeasure);
  var preview=document.querySelector('.preview-panel');if(preview)observer.observe(preview);
}
window.addEventListener('resize',FE.scheduleInspectorMeasure);
recovery();
})();
