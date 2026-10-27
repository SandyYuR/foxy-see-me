/* Editing transactions and grid proposals. No DOM and no second document store. */
(function () {
'use strict';
var FE = window.FE, state = FE.state;
function same(a, b) { return FE.stableJson(a) === FE.stableJson(b); }
function container(profile, target) {
  var layout = profile.layouts && profile.layouts[target.layoutName];
  var fragment = target.split ? layout && layout.split : layout;
  var section = fragment && fragment.sections && fragment.sections[target.location.s];
  if (!section) return null;
  if (target.location.r == null) return section.keys;
  var row = section.rows && section.rows[target.location.r];
  return Array.isArray(row) ? row : row && row.keys;
}
FE.sessionContainer = container;
// Move only inside an explicit draft profile; keep array/object row forms intact.
function moveInProfile(profile, target, location, dr, dk) {
  if (!location || location.r == null) return null;
  var keys = container(profile, Object.assign({}, target, {location: location}));
  if (!keys || !keys[location.k]) return null;
  var next = Object.assign({}, location);
  if (dk) {
    next.k += dk;
    if (next.k < 0 || next.k >= keys.length) return null;
    var item = keys[location.k]; keys[location.k] = keys[next.k]; keys[next.k] = item;
  } else if (dr) {
    next.r += dr;
    var dest = container(profile, Object.assign({}, target, {location: next}));
    if (!dest) return null;
    next.k = dest.length;
    dest.push(keys.splice(location.k, 1)[0]);
  } else return null;
  return next;
}
FE.readEditorFields = function(root) {
  return Array.prototype.map.call(root.querySelectorAll('input,select,textarea'),function(e){
    return {tag:e.tagName,type:e.type||'',value:e.value,checked:!!e.checked};
  });
};
FE.restoreEditorFields = function(root,fields) {
  (fields||[]).forEach(function(saved,index){
    var e=root.querySelectorAll('input,select,textarea')[index];
    if(!e||e.tagName!==saved.tag||(e.type||'')!==saved.type||e.type==='file')return;
    if(e.value===saved.value&&!!e.checked===saved.checked)return;
    e.value=saved.value;if(e.type==='checkbox'||e.type==='radio')e.checked=saved.checked;
    e.dispatchEvent(new Event('input',{bubbles:true}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
  });
};
FE.createKeySession = function (opts, draft) {
  var target = { mode: opts.mode, name: opts.name || null, layoutName: opts.layoutName || state.layoutName,
    split: opts.split == null ? state.splitMode : !!opts.split, location: FE.deepClone(opts.location || null), grid: !!opts.grid };
  var source = target.mode === 'definition' ? state.profile.keys[target.name]
    : (container(state.profile, target) || [])[target.location.k];
  var session = { target: target, original: FE.deepClone(source), baseline: FE.deepClone(draft),
    draft: draft, name: target.name, revision: state.documentRevision, fileName: state.fileName,
    moves: [], location: FE.deepClone(target.location), remove: false, saveAs: null };
  session.dirty = function () { return !!session.pendingText || session.moves.length > 0 || session.remove || !!session.saveAs || !same(session.draft, session.baseline) || session.name !== target.name; };
  session.profile = function () {
    var p = FE.deepClone(state.profile);
    if (target.mode === 'definition') {
      p.keys[target.name] = FE.deepClone(session.draft);
      if (session.name !== target.name) FE.renameKeyDef(target.name, session.name, p);
    }
    else {
      var c = container(p, target);
      if (c && c[target.location.k] != null) {
        c[target.location.k] = FE.deepClone(session.draft);
        var location = FE.deepClone(target.location);
        session.moves.forEach(function(move) {
          location = moveInProfile(p, target, location, move.dr, move.dk) || location;
        });
        c = container(p, Object.assign({}, target, {location: location}));
        if (session.remove) c.splice(location.k, 1);
        else if (session.saveAs) {
          var definition = FE.deepClone(session.draft), replacement = {ref: session.saveAs};
          ['column', 'row', 'columnSpan', 'rowSpan'].forEach(function(field) {
            if (definition[field] != null) replacement[field] = definition[field];
            delete definition[field];
          });
          p.keys[session.saveAs] = definition;
          c[location.k] = replacement;
        }
      }
    }
    return p;
  };
  session.move = function(dr, dk) {
    var next = moveInProfile(session.profile(), target, session.location, dr, dk);
    if (!next) return false;
    session.moves.push({dr: dr, dk: dk}); session.location = next;
    return true;
  };
  session.validate = function () {
    if (session.revision !== state.documentRevision || session.fileName !== state.fileName)
      return ['文档已在其他位置改变，请重新选择此键，避免覆盖新的内容。'];
    if (!session.dirty()) return [];
    if (target.mode === 'definition') {
      if (!session.name || !session.name.trim()) return ['名称不能为空'];
      if (session.name !== target.name && state.profile.keys[session.name]) return ['按键定义已存在: ' + session.name];
    }
    if (session.saveAs && state.profile.keys[session.saveAs]) return ['按键定义已存在: ' + session.saveAs];
    // Only new errors block an edit: unrelated pre-existing errors remain repairable.
    var before = FE.validateProfile(state.profile).errors.slice();
    return FE.validateProfile(session.profile()).errors.filter(function (e) {
      var i = before.indexOf(e); if (i < 0) return true; before.splice(i, 1); return false;
    });
  };
  session.apply = function () {
    var errors = session.validate();
    if (errors.length) return { ok: false, errors: errors };
    if (!session.dirty()) return { ok: true, changed: false };
    var profile = session.profile();
    FE.mutate(function () { state.profile = profile; });
    return { ok: true, changed: true };
  };
  return session;
};
FE.editPreviewProfile = function () {
  var s = state.editSession;
  return s && s.dirty() && s.revision === state.documentRevision ? s.profile() : state.profile;
};
FE.serializeEditSession = function () {
  var s = state.editSession;
  return s ? { version: 1, target: s.target, draft: s.draft,
    original: s.original, name: s.name, fileName: s.fileName,
    ui: state.editorController && state.editorController.editor.snapshot ? state.editorController.editor.snapshot() : null } : state.recoveredEdit;
};

// A grid drop is proposed first; only the moved rectangles are checked against
// the other rectangles, so existing errors elsewhere do not block a repair.
FE.planGridDrop = function (section, index, target) {
  var bad = function (reason, rectangles) { return { ok: false, reason: reason, rectangles: rectangles || [] }; };
  if (!section || section.type !== 'grid' || !Array.isArray(section.keys) || !target || !section.keys[index]) return bad('');
  var draft = FE.deepClone(section), key = draft.keys[index], moving = [index];
  function col(k) { return k.column == null ? k.col : k.column; }
  function set(k, x, y) { if (k.column == null && k.col != null) k.col = x; else k.column = x; k.row = y; }
  if (target.kind === 'move') set(key, target.x, target.y);
  else if (target.kind === 'swap') {
    var other = draft.keys[target.gi];
    if (!other || target.gi === index) return { ok: true, changed: false, rectangles: [] };
    var x = col(key), y = key.row;
    set(key, col(other), other.row); set(other, x, y); moving.push(target.gi);
  } else return bad('');
  var compiled = FE.compileSections([draft], FE.NEUTRAL_STATUS, FE.scopeFrom(state.profile)).sections[0];
  if (!compiled || compiled.type !== 'grid') return bad('无效网格');
  var rectangles = moving.map(function (i) { return compiled.keys[i]; });
  for (var n = 0; n < moving.length; n++) {
    var r = rectangles[n];
    if (!r || ![r.column,r.row,r.columnSpan,r.rowSpan].every(Number.isInteger) || r.columnSpan < 1 || r.rowSpan < 1 ||
        r.column < 0 || r.row < 0 || r.column+r.columnSpan > compiled.columns || r.row+r.rowSpan > compiled.rows)
      return bad('无法放置：按键占位超出网格边界。', rectangles);
    for (var j = 0; j < compiled.keys.length; j++) {
      var o = compiled.keys[j];
      if (!o || j === moving[n]) continue;
      if (r.column < o.column+o.columnSpan && r.column+r.columnSpan > o.column &&
          r.row < o.row+o.rowSpan && r.row+r.rowSpan > o.row)
        return bad('无法放置：按键占位与其他按键重叠。', rectangles);
    }
  }
  return { ok: true, changed: !same(draft.keys, section.keys), rectangles: rectangles };
};
})();
