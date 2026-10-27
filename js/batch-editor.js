/* Placement-only batch operations. Plans are explicit profiles, committed once. */
(function () {
'use strict';
var FE = window.FE, state = FE.state, h = FE.h;
var fields = {
  appearance: ['textSize', 'hintTextSize', 'colors'],
  gestures: ['doubleTap', 'longPress', 'hold', 'swipe', 'drag']
};
function clone(value) { return value == null ? null : FE.deepClone(value); }
function same(a,b) { return FE.stableJson(a) === FE.stableJson(b); }
function sameLocation(a,b) { return !!a&&!!b&&a.s===b.s&&a.r===b.r&&a.k===b.k; }
function targetFor(location) { return Object.assign({}, state.batchTarget, {location: location}); }
function keyAt(profile,target) { var c=FE.sessionContainer(profile,target); return c && c[target.location.k]; }
function compiledKey(profile,key) {
  return FE.compileSections([{type:'rows',rows:[[key]]}],state.status,FE.scopeFrom(profile)).sections[0].rows[0].keys[0];
}
function context() {
  var compiled=FE.compileLayout(state.profile,state.layoutName,{status:state.status,split:state.splitMode});
  return {revision:state.documentRevision,file:state.fileName,layout:state.layoutName,resolved:compiled.resolvedName,
    split:state.splitMode,landscape:state.landscapeMode,tab:state.activeTab};
}
FE.resetBatchEditor = function() {
  state.batchMode=false;state.batchKeys=[];state.batchTarget=null;state.batchContext=null;
  state.keyClipboard=null;state.batchMessage='';
};
FE.syncBatchContext = function() {
  var next=context(), previous=state.batchContext;
  if(previous&&!same(previous,next)) {
    state.batchKeys=[];state.batchTarget=null;
    if(previous.layout!==next.layout||previous.resolved!==next.resolved||previous.split!==next.split||
      previous.landscape!==next.landscape||previous.tab!==next.tab)state.batchMode=false;
  }
  state.batchContext=next;
};
function selected(target) {
  return state.batchMode && state.batchTarget && state.batchTarget.layoutName===target.layoutName &&
    state.batchTarget.split===target.split && state.batchKeys.some(function(loc){return sameLocation(loc,target.location);});
}
FE.markBatchKey = function(el,target) {
  el.setAttribute('data-batch-target',JSON.stringify(target));
  el.classList.toggle('batch-selected',!!selected(target));
  if(el.tagName!=='BUTTON') {
    el.setAttribute('role','button');el.setAttribute('tabindex','0');
    el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
  }
  el.setAttribute('aria-pressed',selected(target)?'true':'false');
};
function refresh() {
  // The initial structure list is rendered before optional modules load.
  Array.prototype.forEach.call(document.querySelectorAll('#layout-sections .chip, #layout-sections .gedit-key'),function(el){
    if(el.getAttribute('data-batch-target'))return;
    var loc=el.__chipLoc||(el.__gridKey&&{s:el.__gridKey.si,r:null,k:el.__gridKey.gi});
    if(loc)FE.markBatchKey(el,{layoutName:state.layoutName,split:state.splitMode,location:loc});
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-batch-target]'),function(el){
    var on=selected(JSON.parse(el.getAttribute('data-batch-target')));
    el.classList.toggle('batch-selected',!!on);el.setAttribute('aria-pressed',on?'true':'false');
  });
  document.body.classList.toggle('batch-mode',state.batchMode);
  FE.renderBatchTools();
  if(FE.scheduleInspectorMeasure)FE.scheduleInspectorMeasure();
}
FE.refreshBatchSelection=refresh;
function leave(next) { if(FE.leaveKeyEditor)FE.leaveKeyEditor(next);else next(); }
FE.handleBatchKeyClick = function(target,event) {
  if(!state.batchMode&&!(event&&(event.ctrlKey||event.metaKey)))return false;
  var old=state.sel&&clone(state.sel), revision=state.documentRevision;
  leave(function(){
    FE.syncBatchContext();
    if(!keyAt(state.profile,target))return;
    var scope={layoutName:target.layoutName,split:!!target.split};
    if(!same(state.batchTarget,scope)){state.batchTarget=scope;state.batchKeys=[];}
    if(!state.batchMode&&old&&revision===state.documentRevision&&!sameLocation(target.location,old)&&
      target.layoutName===state.layoutName&&keyAt(state.profile,Object.assign({},scope,{location:old})))state.batchKeys.push(old);
    state.batchMode=true;state.sel=null;state.batchMessage='';
    var index=state.batchKeys.findIndex(function(loc){return sameLocation(loc,target.location);});
    if(index<0)state.batchKeys.push(clone(target.location));else state.batchKeys.splice(index,1);
    refresh();
  });
  return true;
};
FE.copyKeyParts = function(target) {
  var key=keyAt(state.profile,target);
  if(!key)return false;
  var item=compiledKey(state.profile,key);
  if(item.isBroken){state.batchMessage='来源按键有无法解析的引用，请修正后再复制。';return false;}
  var copied={fileName:state.fileName,label:item.label||key.ref||'内联按键',parts:{}};
  Object.keys(fields).forEach(function(kind){
    copied.parts[kind]={};fields[kind].forEach(function(field){copied.parts[kind][field]=clone(item.eff[field]);});
  });
  state.keyClipboard=copied;
  return true;
};
function finishPlan(profile,changed,count) {
  var before=FE.validateProfile(state.profile).errors.slice();
  var errors=FE.validateProfile(profile).errors.filter(function(error){
    var index=before.indexOf(error);if(index<0)return true;before.splice(index,1);return false;
  });
  return {ok:!errors.length,errors:errors,profile:profile,changed:changed,count:count,
    revision:state.documentRevision,fileName:state.fileName};
}
FE.planKeyPaste = function(targets,clipboard,kind) {
  if(!fields[kind]||!clipboard||clipboard.fileName!==state.fileName)
    return {ok:false,errors:['请先在当前文件中复制一个来源键。']};
  var profile=clone(state.profile), changed=0, seen={}, count=0;
  for(var i=0;i<targets.length;i++) {
    var target=targets[i], identity=FE.stableJson(target);
    if(seen[identity])continue;seen[identity]=true;count++;
    var key=keyAt(profile,target);
    if(!FE.isPlainObject(key))return {ok:false,errors:['目标按键已改变，请重新选择。']};
    var original=clone(key);
    if(!FE.isPlainObject(key.override))key.override={};
    // Reset inherited maps before installing the complete source group. This
    // preserves gesture refs (including drag.ref) without tombstoning their own
    // inherited directions. Existing target variants retain their normal order.
    fields[kind].forEach(function(field){
      key.override[field]=null;key[field]=clone(clipboard.parts[kind][field]);
    });
    if(!same(key,original))changed++;
  }
  if(!count)return {ok:false,errors:['请先选择目标按键。']};
  return finishPlan(profile,changed,count);
};
FE.commitBatchPlan = function(plan) {
  if(!plan.ok)return plan;
  if(plan.revision!==state.documentRevision||plan.fileName!==state.fileName)
    return {ok:false,errors:['文档已改变，请重新选择并预览本次操作。']};
  if(state.editorController)return {ok:false,errors:['请先处理当前按键草稿。']};
  if(plan.changed)FE.mutate(function(){state.profile=plan.profile;state.sel=null;});
  return {ok:true,changed:plan.changed};
};
FE.planRowDuplicate = function(layoutName,split,si,ri) {
  var profile=clone(state.profile),layout=profile.layouts[layoutName],fragment=split?layout&&layout.split:layout;
  var section=fragment&&fragment.sections&&fragment.sections[si];
  if(!section||section.type!=='rows'||!Array.isArray(section.rows)||!section.rows[ri])
    return {ok:false,errors:['此处没有可复制的行。']};
  var length=section.rows.length;
  section.rows.splice(ri+1,0,clone(section.rows[ri]));
  if(Array.isArray(section.rowHeights)&&section.rowHeights.length===length)
    section.rowHeights.splice(ri+1,0,section.rowHeights[ri]);
  return finishPlan(profile,1,1);
};
FE.duplicateRow = function(si,ri) {
  var layoutName=state.layoutName, split=state.splitMode;
  leave(function(){
    var result=FE.commitBatchPlan(FE.planRowDuplicate(layoutName,split,si,ri));
    if(!result.ok){FE.uiAlert(result.errors.join('；'));return;}
    state.batchMessage='已在第 '+(ri+1)+' 行下方插入副本，可撤销。';refresh();
  });
};
function paste(kind) {
  var targets=state.batchKeys.map(targetFor), clipboard=state.keyClipboard;
  leave(function(){
    var plan=FE.planKeyPaste(targets,clipboard,kind),title=kind==='appearance'?'仅粘贴外观':'仅粘贴手势';
    if(!plan.ok){FE.uiAlert(plan.errors.join('；'));return;}
    var modal=FE.openModal({title:title+' · '+plan.count+' 个键'});
    modal.body.appendChild(h('p',null,'来源：'+clipboard.label+'。将修改 '+plan.changed+' 个放置位置，共享定义保持不变。'));
    modal.body.appendChild(h('p',{class:'status'},kind==='appearance'?
      '替换按键配色与字号，保留标签、图标、尺寸和点击动作。未设置的项恢复主题或默认值。':
      '替换滑动、双击、长按、按住与拖动手势；来源没有的附加手势会清除。点击动作与修饰键身份保持不变。'));
    modal.body.appendChild(h('p',{class:'status'},'按来源复制时的配置粘贴；目标已有的状态变体可能覆盖效果。'+
      (kind==='gestures'?'长按菜单沿用原候选，不复制候选文件。':'')));
    var list=h('ul',{class:'batch-target-list'});
    targets.forEach(function(target){var loc=target.location;list.appendChild(h('li',null,target.layoutName+' · 第 '+(loc.s+1)+' 段 · '+
      (loc.r==null?'网格键 '+(loc.k+1):'第 '+(loc.r+1)+' 行第 '+(loc.k+1)+' 键')));});
    modal.body.appendChild(list);
    if(FE.renderKeySample){
      var preview=h('div',{class:'batch-comparison'});
      ['应用前','应用后'].forEach(function(label,index){var cell=h('div',null,h('div',null,label)),host=h('div');
        var profile=index?plan.profile:state.profile;FE.renderKeySample(host,keyAt(profile,targets[0]),profile);cell.appendChild(host);preview.appendChild(cell);});
      modal.body.appendChild(preview);
      modal.body.appendChild(h('div',{class:'status'},'预览第一个目标键；确认后一次应用，可一次撤销。'));
    }
    var error=h('div',{class:'status error',role:'alert'});modal.body.appendChild(error);
    modal.toolbar.appendChild(h('button',{type:'button',onclick:function(){modal.requestClose();}},'取消'));
    modal.toolbar.appendChild(h('button',{type:'button',class:'primary',disabled:!plan.changed,onclick:function(){
      var result=FE.commitBatchPlan(plan);
      if(!result.ok){error.textContent=result.errors.join('；');return;}
      modal.close();state.batchMessage='已向 '+plan.changed+' 个键粘贴'+(kind==='appearance'?'外观':'手势')+'，可撤销。';refresh();
    }},'应用到 '+plan.count+' 个键'));
  });
}
FE.renderBatchTools = function() {
  if(typeof document==='undefined')return;
  var host=document.getElementById('batch-key-tools');if(!host)return;
  var focused=document.activeElement, focusLabel=null, parent=focused;
  while(parent&&parent!==host)parent=parent.parentNode;
  if(parent&&focused.tagName==='BUTTON')focusLabel=focused.textContent;
  document.body.classList.toggle('batch-mode',state.batchMode);
  host.hidden=state.activeTab==='tab-symbols';FE.clearEl(host);
  if(host.hidden)return;
  var tools=h('div',{class:'toolbar batch-buttons'});
  function button(label,run,disabled){return h('button',{type:'button',class:'mini-button',disabled:!!disabled,onclick:run},label);}
  tools.appendChild(button(state.batchMode?'完成多选':'多选 / 批量粘贴',function(){leave(function(){
    state.batchMode=!state.batchMode;state.batchKeys=[];state.batchTarget=null;state.sel=null;state.batchMessage='';refresh();
  });}));
  if(state.batchMode){
    tools.appendChild(button('全选当前布局',function(){
      var c=FE.compileLayout(state.profile,state.layoutName,{status:state.status,split:state.splitMode});
      state.batchTarget={layoutName:c.resolvedName,split:state.splitMode};state.batchKeys=[];state.batchMessage='';
      FE.eachCompiledKey(c,function(item){if(item&&!item.previewOnly)state.batchKeys.push({s:item.s,r:item.r,k:item.k});});refresh();
    }));
    tools.appendChild(button('清空选择',function(){state.batchKeys=[];state.batchMessage='';refresh();},!state.batchKeys.length));
    tools.appendChild(button('复制外观与手势',function(){
      if(FE.copyKeyParts(targetFor(state.batchKeys[0]))){state.batchKeys=[];state.batchMessage='已复制 '+state.keyClipboard.label+'，请选择目标键。';}refresh();
    },state.batchKeys.length!==1));
    tools.appendChild(button('仅粘贴外观',function(){paste('appearance');},!state.keyClipboard||!state.batchKeys.length));
    tools.appendChild(button('仅粘贴手势',function(){paste('gestures');},!state.keyClipboard||!state.batchKeys.length));
  }
  host.appendChild(tools);
  var info=state.batchMode?'已选 '+state.batchKeys.length+' 个键。点击键可选中或取消；复制来源时只选一个键。':'';
  if(state.batchMode&&state.keyClipboard)info+=' 来源：'+state.keyClipboard.label+'。';
  if(state.batchMode&&state.batchTarget)info+=' 范围：'+state.batchTarget.layoutName+(state.batchTarget.split?'（分体）':'（常规）')+'。';
  if(info||state.batchMessage)host.appendChild(h('div',{class:'status batch-status',role:'status','aria-live':'polite'},state.batchMessage||info));
  if(focusLabel){
    var buttons=Array.prototype.slice.call(tools.querySelectorAll('button'));
    var focus=buttons.find(function(b){return b.textContent===focusLabel&&!b.disabled;})||buttons[0];
    if(focus&&focus.focus)focus.focus({preventScroll:true});
  }
};
if(typeof document!=='undefined')document.addEventListener('keydown',function(e){
  if(e.key!=='Escape'||!state.batchMode||document.querySelector('dialog[open]'))return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target&&e.target.tagName||''))return;
  state.batchMode=false;state.batchKeys=[];state.batchMessage='';refresh();
});
})();
