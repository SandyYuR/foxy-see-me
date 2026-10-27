'use strict';
// Batch plans must preserve Foxy inheritance and commit atomically.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {documentStub,localStorageStub,buildSkeleton,JscolorStub,makeEvent}=require('./dom-stub');
buildSkeleton();global.window=global;global.document=documentStub;global.localStorage=localStorageStub;global.jscolor=JscolorStub;
global.addEventListener=()=>{};global.removeEventListener=()=>{};
global.requestAnimationFrame=fn=>{fn();return 0;};global.cancelAnimationFrame=()=>{};
global.Event=function(type,options){return Object.assign(makeEvent(type,null),options||{});};
for(const name of ['data','default-profile','examples-bundle','app','folder-import','key-dialog','edit-session','gesture-editor','key-editor','macro-editor','popup-editor','theme-editor','color-source','symbol-editor','symbol-preview','font-preview','toolbar-preview','batch-editor','workspace','workspace-reset']){
  vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js',name+'.js'),'utf8'),{filename:name+'.js'});
}
const FE=global.FE;let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
function fixture(){
  FE.state.editorController=null;FE.state.editSession=null;FE.state.status={composing:false,ascii_mode:false};
  FE.state.layoutName='default';FE.state.splitMode=false;FE.state.landscapeMode=false;
  FE.applyProfileText(JSON.stringify({type:'foxy.keyboard-layout',keys:{
    source:{ref:'rime.a',textSize:20,hintTextSize:{up:11},colors:{text:'#FF123456'},
      swipe:{up:{action:{type:'text',text:'上'}}},drag:{ref:'dragBase',end:{ref:'rime.Return'}},longPress:{popupKey:'menu'}},
    dragBase:{ref:'rime.z',drag:{down:{ref:'rime.Down'},end:{ref:'rime.Return'}}},
    target:{ref:'rime.b',textSize:13,hintTextSize:{down:6},colors:{background:'#FFFFFFFF',states:{pressed:{text:'#FF999999'}}},
      swipe:{down:{ref:'rime.Down'}},drag:{right:{ref:'rime.Right'},feedback:'key'},doubleTap:{ref:'rime.Return'}}
  },layouts:{default:{sections:[
    {type:'rows',rows:[[{ref:'source'},{ref:'target',label:'B',weight:2,
      override:{tap:{type:'text',text:'click'},colors:{border:'#FF777777'}},variants:[{when:{rime:{ascii_mode:true}},label:'ASCII'}]}],
      {height:1.3,width:0.9,totalWeight:4,custom:'keep',keys:[{ref:'target',label:'C'}]}]},
    {type:'grid',columns:3,rows:2,keys:[{column:0,row:0,columnSpan:2,rowSpan:2,ref:'target'}]}
  ],split:{sections:[{type:'rows',rows:[{height:2,keys:[{ref:'target'}]}]}]}}}}));
}
function target(s,r,k,split){return {layoutName:'default',split:!!split,location:{s,r,k}};}
function key(t,profile=FE.state.profile){return FE.sessionContainer(profile,t)[t.location.k];}
function effective(t,profile=FE.state.profile){return FE.compileSections([{type:'rows',rows:[[key(t,profile)]]}],FE.state.status,FE.scopeFrom(profile)).sections[0].rows[0].keys[0].eff;}
const source=target(0,0,0),one=target(0,0,1),two=target(0,1,0),grid=target(1,null,0),split=target(0,0,0,true);
fixture();
check(FE.validateProfile(FE.state.profile).errors.length===0,'fixture is valid Foxy JSON');
const before=JSON.stringify(FE.state.profile),history=FE.state.history.length;
check(FE.copyKeyParts(source),'copy resolves the source inheritance chain');
let clipboard=FE.state.keyClipboard;
check(clipboard.parts.appearance.textSize===20&&clipboard.parts.gestures.swipe.up.action.text==='上','clipboard includes inherited styles and gestures');
check(JSON.stringify(FE.state.profile)===before&&FE.state.history.length===history,'copy does not modify document or history');
let plan=FE.planKeyPaste([one,two,grid,split,one],clipboard,'appearance');
check(plan.ok&&plan.count===4&&plan.changed===4,'appearance plan covers rows, grid and split and deduplicates targets');
check(JSON.stringify(FE.state.profile)===before,'paste preview leaves the original untouched');
check(effective(one,plan.profile).textSize===20&&effective(one,plan.profile).colors.text==='#FF123456','appearance preview uses copied values');
check(!effective(one,plan.profile).colors.background&&!effective(one,plan.profile).colors.states,'appearance clears old inherited color roles and states');
check(!effective(one,plan.profile).hintTextSize.down,'appearance clears old inherited directional hint sizes');
check(key(one,plan.profile).label==='B'&&key(one,plan.profile).weight===2&&effective(one,plan.profile).tap.text==='click','appearance preserves label, geometry and click behavior');
check(effective(one,plan.profile).swipe.down.ref==='rime.Down','appearance preserves gestures');
check(JSON.stringify(plan.profile.keys)===JSON.stringify(FE.state.profile.keys),'batch paste never changes shared definitions');
check(key(grid,plan.profile).columnSpan===2&&key(grid,plan.profile).rowSpan===2,'grid geometry remains unchanged');
check(JSON.stringify(key(one,plan.profile).variants)===JSON.stringify(key(one).variants),'target variants remain intact');
check(FE.commitBatchPlan(plan).ok&&FE.state.history.length===history+1,'whole batch creates one undo entry');
document.getElementById('top-undo').click();
check(JSON.stringify(FE.state.profile)===before,'single undo restores the whole batch exactly');
document.getElementById('top-redo').click();
check(effective(split).textSize===20,'redo restores split and ordinary targets together');
plan=FE.planKeyPaste([one,two,grid,split],clipboard,'appearance');
const noOpHistory=FE.state.history.length;
check(plan.changed===0&&FE.commitBatchPlan(plan).ok&&FE.state.history.length===noOpHistory,'repeating identical paste has no extra undo entry');
fixture();FE.copyKeyParts(source);clipboard=FE.state.keyClipboard;
plan=FE.planKeyPaste([one],clipboard,'gestures');
check(plan.ok,'gesture plan validates');
const eff=effective(one,plan.profile);
check(eff.swipe.up.action.text==='上'&&!eff.swipe.down,'gesture paste replaces inherited directions');
check(!eff.doubleTap&&eff.longPress.popupKey==='menu','gesture paste clears absent gestures and preserves popup reference');
check(eff.drag.ref==='dragBase'&&!eff.drag.right&&!eff.drag.feedback,'drag reference has no inherited target residue');
const drag=FE.dragInfo(eff.drag,FE.state.status,0,FE.scopeFrom(plan.profile));
check(!!drag.directions.down&&!!drag.end,'drag reference retains its own inherited direction and release action');
check(eff.textSize===13&&eff.tap.text==='click'&&key(one,plan.profile).label==='B','gesture paste preserves appearance, click and label');
check(FE.commitBatchPlan(plan).ok,'gesture batch applies');
FE.commitBatchPlan(FE.planKeyPaste([one],clipboard,'appearance'));
const beforeReopen=effective(one);
FE.openKeyInspector({mode:'placement',location:one.location});
check(JSON.stringify(effective(one,FE.state.editSession.profile()).swipe)===JSON.stringify(beforeReopen.swipe),'reopening pasted key preserves the swipe reset boundary');
const label=document.getElementById('key-inspector').querySelectorAll('input').find(e=>e.getAttribute('aria-label')==='按键标签');
label.value='renamed label';label._fire('input');
check(FE.state.editorController.apply(),'pasted key can still be edited in the inspector');
FE.state.editorController=null;FE.state.editSession=null;
check(!effective(one).swipe.down&&!effective(one).colors.background&&!effective(one).drag.right,'later label edit does not resurrect cleared gestures or colors');
const savedAfterReopen=JSON.stringify(FE.state.profile);
FE.applyProfileText(FE.serializeProfile(FE.state.profile,true));
check(JSON.stringify(FE.state.profile)===savedAfterReopen&&FE.validateProfile(FE.state.profile).errors.length===0,'gesture export/import roundtrip remains valid');
check(!FE.state.keyClipboard,'loading JSON clears the file-scoped clipboard');
fixture();FE.copyKeyParts(source);clipboard=FE.state.keyClipboard;
plan=FE.planKeyPaste([one],clipboard,'appearance');
FE.mutate(()=>{FE.state.profile.author='changed';});
check(!FE.commitBatchPlan(plan).ok&&key(one).textSize===undefined,'stale preview cannot overwrite another edit');
clipboard.parts.gestures.swipe.up={type:'unsupported'};
plan=FE.planKeyPaste([one,two],clipboard,'gestures');
const invalidBefore=JSON.stringify(FE.state.profile),invalidHistory=FE.state.history.length;
check(!plan.ok&&!FE.commitBatchPlan(plan).ok,'one invalid batch is rejected as a whole');
check(JSON.stringify(FE.state.profile)===invalidBefore&&FE.state.history.length===invalidHistory,'invalid batch has no partial writes or history');
check(!FE.planKeyPaste([target(0,99,0)],clipboard,'gestures').ok,'missing target is rejected');
fixture();FE.state.status.ascii_mode=true;
FE.state.profile.keys.source.variants=[{when:{rime:{ascii_mode:true}},textSize:23}];
FE.copyKeyParts(source);FE.state.status.ascii_mode=false;
check(FE.state.keyClipboard.parts.appearance.textSize===23,'copy freezes the source preview state');
fixture();
let rowBefore=JSON.stringify(FE.state.profile),rowHistory=FE.state.history.length;
plan=FE.planRowDuplicate('default',false,0,1);
check(plan.ok&&plan.profile.layouts.default.sections[0].rows.length===3,'copy row inserts immediately below original');
check(JSON.stringify(plan.profile.layouts.default.sections[0].rows[1])===JSON.stringify(plan.profile.layouts.default.sections[0].rows[2]),'object row retains metadata, size and weights');
plan.profile.layouts.default.sections[0].rows[2].keys[0].label='independent';
check(plan.profile.layouts.default.sections[0].rows[1].keys[0].label==='C','row copy is a deep independent placement copy');
check(FE.commitBatchPlan(plan).ok&&FE.state.history.length===rowHistory+1,'row copy is one transaction');
document.getElementById('top-undo').click();
check(JSON.stringify(FE.state.profile)===rowBefore,'row undo restores exact source representation');
plan=FE.planRowDuplicate('default',false,0,0);
check(plan.ok&&Array.isArray(plan.profile.layouts.default.sections[0].rows[1]),'array row stays an array');
plan=FE.planRowDuplicate('default',true,0,0);
check(plan.ok&&plan.profile.layouts.default.split.sections[0].rows.length===2&&plan.profile.layouts.default.sections[0].rows.length===2,'split row copy only changes split');
check(!FE.planRowDuplicate('default',false,1,0).ok,'grid is not duplicated as a row');
fixture();FE.state.profile.layouts.default.sections[0].rowHeights=[1,2];
plan=FE.planRowDuplicate('default',false,0,0);
check(JSON.stringify(plan.profile.layouts.default.sections[0].rowHeights)==='[1,1,2]','existing aligned rowHeights stays aligned');
fixture();FE.state.profile.layouts.text_editor={sections:[{type:'rows',rows:[[{ref:'rime.a'}]]}]};
check(!FE.planRowDuplicate('text_editor',false,0,0).ok,'text_editor one-row contract blocks invalid row duplication');
fixture();
FE.handleBatchKeyClick(one,{ctrlKey:true});FE.handleBatchKeyClick(two,{});
check(FE.state.batchKeys.length===2,'Ctrl click enters multi-select; next click adds a target');
FE.handleBatchKeyClick(one,{});
check(FE.state.batchKeys.length===1,'clicking selected key toggles it off');
FE.mutate(()=>{FE.state.profile.layouts.default.sections[0].rows[1].keys.unshift({ref:'rime.c'});});
check(FE.state.batchKeys.length===0,'structural mutation clears stale selection coordinates');
FE.handleBatchKeyClick(one,{});FE.setSplitMode(true);FE.renderPreviewOnly();
check(!FE.state.batchMode&&!FE.state.batchKeys.length,'changing preview fragment exits selection safely');
console.log(checks+' batch checks passed');
