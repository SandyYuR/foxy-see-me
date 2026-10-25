/* One-click reset of this editor only; keep one recoverable pre-reset snapshot. */
(function(){
'use strict';
var FE=window.FE;
if(typeof document==='undefined'||!document.getElementById('workspace-reset'))return;
var backupKey='foxy-layout-editor-reset-backup-v1';
function readCurrent(){return {version:1,createdAt:Date.now(),draft:localStorage.getItem(FE.DRAFT_STORAGE_KEY),siteTheme:localStorage.getItem(FE.SITE_THEME_STORAGE_KEY)};}
function writeCurrent(snapshot){
  if(snapshot.draft==null)localStorage.removeItem(FE.DRAFT_STORAGE_KEY);else localStorage.setItem(FE.DRAFT_STORAGE_KEY,snapshot.draft);
  if(snapshot.siteTheme==null)localStorage.removeItem(FE.SITE_THEME_STORAGE_KEY);else localStorage.setItem(FE.SITE_THEME_STORAGE_KEY,snapshot.siteTheme);
}
function reload(){if(typeof location!=='undefined'&&typeof location.reload==='function')location.reload();}
function failure(){FE.uiAlert('浏览器无法保存还原前的备份，本次未还原。请先导出重要内容后重试。');}
FE.resetWorkspaceToDefaults=function(){
  FE.autosaveDraft();
  if(FE.state.saveStatus==='error'){failure();return false;}
  var previous;
  try{
    previous=readCurrent();
    localStorage.setItem(backupKey,JSON.stringify(previous));
    writeCurrent({draft:null,siteTheme:null});
  }catch(error){
    if(previous){try{writeCurrent(previous);}catch(_){} }
    failure();return false;
  }
  // Stop queued input/toggle/pagehide writers from recreating the removed draft.
  FE.state.cacheRestoring=true;reload();return true;
};
FE.undoWorkspaceReset=function(){
  FE.autosaveDraft();if(FE.state.saveStatus==='error'){failure();return false;}
  var current,backup;
  try{
    backup=JSON.parse(localStorage.getItem(backupKey));
    if(!backup||backup.version!==1||typeof backup.draft!=='string')return false;
    current=readCurrent();
    // Swap instead of destroying any work made after the reset.
    localStorage.setItem(backupKey,JSON.stringify(current));
    writeCurrent(backup);
  }catch(error){
    if(current){try{writeCurrent(current);if(backup)localStorage.setItem(backupKey,JSON.stringify(backup));}catch(_){} }
    failure();return false;
  }
  FE.state.cacheRestoring=true;reload();return true;
};
document.getElementById('workspace-reset').addEventListener('click',FE.resetWorkspaceToDefaults);
var undo=document.getElementById('workspace-reset-undo');
if(undo){
  try{undo.hidden=!localStorage.getItem(backupKey);}catch(_) {undo.hidden=true;}
  undo.addEventListener('click',FE.undoWorkspaceReset);
}
})();
