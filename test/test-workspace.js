'use strict';
// Transaction tests complement the browser refresh/interaction smoke checks.
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
  FE.state.editorController=null;FE.state.editSession=null;
  FE.state.layoutName='default';FE.state.splitMode=false;FE.state.landscapeMode=false;
  FE.applyProfileText(JSON.stringify({type:'foxy.keyboard-layout',
    keys:{a:{ref:'rime.a',label:'A',swipe:{up:{ref:'rime.1'}}}},
    layouts:{
      default:{sections:[{type:'rows',rows:[[{ref:'a'},{ref:'a'}]]}]},
      other:{sections:[{type:'rows',rows:[[{ref:'rime.b'}]]}]}
    }
  }));
}
fixture();
const location={s:0,r:0,k:0};
let session=FE.createKeySession({mode:'placement',location},{ref:'a'});
const before=JSON.stringify(FE.state.profile),history=FE.state.history.length;
check(!session.dirty(),'opening does not dirty the document');
check(session.apply().ok&&FE.state.history.length===history,'no-op apply adds no undo entry');
session.draft.label='local';FE.state.editSession=session;
check(FE.editPreviewProfile().layouts.default.sections[0].rows[0][0].label==='local','preview consumes draft');
check(JSON.stringify(FE.state.profile)===before,'preview does not mutate committed document');
check(session.apply().ok,'valid local edit applies');
check(FE.state.profile.keys.a.label==='A','local edit preserves shared definition');
check(FE.state.profile.layouts.default.sections[0].rows[0][1].label===undefined,'local edit preserves sibling placement');
check(FE.state.history.length===history+1,'one edit adds one undo entry');
FE.state.editSession=null;document.getElementById('top-undo').click();
check(JSON.stringify(FE.state.profile)===before,'undo restores transaction');
fixture();
session=FE.createKeySession({mode:'placement',location},{ref:'a'});
const moveBefore=JSON.stringify(FE.state.profile), moveHistory=FE.state.history.length;
session.draft.label='moved';
check(session.move(0,1),'stage move to next column');
check(JSON.stringify(FE.state.profile)===moveBefore&&FE.state.history.length===moveHistory,'staged move leaves document and undo history unchanged');
check(session.profile().layouts.default.sections[0].rows[0][1].label==='moved','draft profile moves the edited key');
check(session.apply().ok&&FE.state.history.length===moveHistory+1,'move and field edit commit as one transaction');
document.getElementById('top-undo').click();
check(JSON.stringify(FE.state.profile)===moveBefore,'one undo restores both position and content without changing row representation');
fixture();
session=FE.createKeySession({mode:'placement',location},{ref:'a'});session.draft.label='stale';
FE.mutate(()=>{FE.state.profile.author='changed elsewhere';});
check(!session.apply().ok,'stale document revision cannot overwrite');
fixture();
session=FE.createKeySession({mode:'definition',name:'a'},FE.deepClone(FE.state.profile.keys.a));
session.name='renamed';session.draft.label='shared';
check(session.apply().ok,'rename and shared edit apply together');
check(FE.state.profile.layouts.default.sections[0].rows[0].every(k=>k.ref==='renamed'),'rename updates both references');
fixture();
session=FE.createKeySession({mode:'placement',location},{ref:'a'});session.draft.weight=-1;
check(!session.apply().ok,'new invalid weight blocks apply');
check(FE.state.profile.layouts.default.sections[0].rows[0][0].weight===undefined,'invalid draft does not reach document');
session.draft={ref:'a',label:null,swipe:{up:null}};
check(session.apply().ok,'explicit null values are accepted according to field semantics');
check(FE.state.profile.layouts.default.sections[0].rows[0][0].swipe.up===null,'direction null remains explicit');
const grid={type:'grid',columns:4,rows:2,keys:[{column:0,row:0,columnSpan:2,ref:'rime.a'},{column:3,row:1,ref:'rime.b'}]};
const gridBefore=JSON.stringify(grid);
check(!FE.planGridDrop(grid,0,{kind:'move',x:3,y:0}).ok,'multi-column key cannot exceed bounds');
check(!FE.planGridDrop(grid,0,{kind:'swap',gi:1}).ok,'swap checks both spans');
check(FE.planGridDrop(grid,0,{kind:'move',x:1,y:0}).ok,'valid rectangular move accepted');
check(!FE.planGridDrop(grid,0,{kind:'move',x:2,y:1}).ok,'overlap rejected');
check(!FE.planGridDrop(grid,0,{kind:'move',x:0,y:0}).changed,'same position is no-op');
check(JSON.stringify(grid)===gridBefore,'proposal does not mutate source grid');
fixture();
FE.state.profile.layouts.default.sections=[grid];FE.afterChange();const count=FE.state.history.length;
FE.performGridDrop(0,0,{kind:'move',x:3,y:0});
check(JSON.stringify(FE.state.profile.layouts.default.sections[0])===gridBefore,'invalid drop preserves valid configuration');
check(FE.state.history.length===count,'invalid drop adds no history');
fixture();
FE.state.popupProfile=FE.normalizePopupProfile({type:'foxy.popup-profile',schemas:{default:{a:{normal:['a','A']}}}});
FE.state.profile.keys.a.longPress={popupKey:'a'};
const popupBefore=JSON.stringify(FE.state.popupProfile);
FE.openKeyInspector({mode:'placement',location});
check(document.getElementById('key-inspector').querySelectorAll('.popup-cand').length===0,'popup immediate writes are not embedded in cancellable editor');
FE.leaveKeyEditor(()=>{});
check(JSON.stringify(FE.state.popupProfile)===popupBefore,'closing inspector preserves popup');
let savedSet=global.localStorage.setItem;
global.localStorage.setItem=()=>{throw Error('QuotaExceededError');};FE.autosaveDraft();
check(FE.state.saveStatus==='error','quota failure is observable');
check(document.getElementById('draft-save-status').textContent.includes('失败'),'failure is visible');
global.localStorage.setItem=savedSet;FE.autosaveDraft();
check(FE.state.saveStatus==='saved','later successful save clears error');
fixture();
FE.openKeyInspector({mode:'placement',location});
const label=document.getElementById('key-inspector').querySelectorAll('input').find(e=>e.getAttribute('aria-label')==='按键标签');
label.value='suspended draft';label._fire('input');
FE.setLandscapeMode(true);
check(!FE.state.editSession&&!document.getElementById('key-inspector').hidden,'preview mode preserves panel shell while clearing selection');
check(FE.state.suspendedEdits.length===1,'preview mode retains uncommitted draft');
check(document.getElementById('key-inspector').querySelectorAll('details').every(d=>!d.open),'empty panel sections remain collapsed');
FE.openKeyInspector({mode:'placement',location});
check(document.getElementById('key-inspector').querySelectorAll('input').find(e=>e.getAttribute('aria-label')==='按键标签').value==='suspended draft','reselecting restores the correct draft');
FE.suspendKeyEditor();
const storedBeforeReset=localStorage.getItem(FE.DRAFT_STORAGE_KEY);
localStorage.setItem=function(key,value){if(key==='foxy-layout-editor-reset-backup-v1')throw Error('backup quota');return savedSet.call(this,key,value);};
check(FE.resetWorkspaceToDefaults()===false,'reset stops when backup cannot be persisted');
check(localStorage.getItem(FE.DRAFT_STORAGE_KEY)===storedBeforeReset,'failed reset does not remove active document and drafts');
localStorage.setItem=savedSet;
console.log(checks+' workspace checks passed');
