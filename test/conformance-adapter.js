'use strict';

/*
 * Foxy layout conformance adapter for 小狐狸 see me（foxy-editor 网页编辑器）。
 *
 * Usage（from the foxy-editor repository root）:
 *
 *   node conformance/consumer/run-conformance.js \
 *        --root conformance \
 *        --adapter test/conformance-adapter.js
 *
 * The adapter loads the editor's pure-logic files (data.js / default-profile.js
 * / app.js), compiles each fixture with FE.compileLayout, and maps the result
 * onto conformance/cases/<case>/expected.json.
 *
 * Two deliberate policy choices:
 *   · validateProfile() reports see-me's own validation result.
 *   · compile() returns null for profiles see-me rejects structurally, because
 *     run-conformance expects null when the Foxy parser rejects the layout.
 *     Variant-cycle errors are excluded from that gate: Foxy falls back to the
 *     base layout when the cycle does not apply to the current status, and the
 *     expected fixtures exercise that.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFE() {
  if (global.FE && typeof global.FE.compileLayout === 'function') return global.FE;
  global.window = global;
  const base = path.join(__dirname, '..', 'js');
  for (const file of ['data.js', 'default-profile.js', 'app.js']) {
    const full = path.join(base, file);
    if (!fs.existsSync(full)) continue;
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: file });
  }
  if (!global.FE || typeof global.FE.compileLayout !== 'function') {
    throw new Error('could not load see-me FE from ' + base);
  }
  return global.FE;
}

const FE = loadFE();

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function numOrNull(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

function toStatus(status) {
  return {
    composing: !!status.isComposing,
    ascii_mode: !!status.isAsciiMode,
    disabled: !!status.isDisabled,
    shift: false,
  };
}

function normalizeMeta(meta) {
  const names = Array.isArray(meta) ? meta : (meta == null ? [] : [meta]);
  const seen = {};
  for (const raw of names) {
    const name = FE.canonicalMetaName ? FE.canonicalMetaName(raw).toLowerCase() : String(raw).toLowerCase();
    if (name === 'control') seen.ctrl = true;
    else if (name === 'ctrl' || name === 'shift' || name === 'alt' || name === 'meta') seen[name] = true;
  }
  return ['shift', 'ctrl', 'alt', 'meta'].filter((name) => seen[name]);
}

function parseColor(value) {
  if (typeof value !== 'string') return null;
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) return null;
  const digits = value.slice(1);
  const argb = digits.length === 6 ? 'FF' + digits : digits;
  return parseInt(argb, 16) | 0;
}

function parseColors(colors) {
  if (!FE.isPlainObject(colors)) return null;
  const out = colorFields(colors);
  const states = {};
  if (FE.isPlainObject(colors.states)) {
    for (const name of Object.keys(colors.states)) {
      const canonical = {
        modifieractive: 'MODIFIER_ACTIVE',
        modifierlocked: 'MODIFIER_LOCKED',
        pressed: 'PRESSED',
      }[String(name).toLowerCase()];
      if (!canonical) continue;
      states[canonical] = colorFields(colors.states[name]);
    }
  }
  out.states = states;
  return out;
}

function colorFields(object) {
  const pick = (name) => parseColor(object[name]);
  return {
    text: pick('text'),
    background: pick('background'),
    pressed: pick('pressed'),
    border: pick('border'),
    shadow: pick('shadow'),
    hint: pick('hint'),
    hintTop: pick('hintTop'),
    hintBottom: pick('hintBottom'),
    hintLeft: pick('hintLeft'),
    hintRight: pick('hintRight'),
  };
}

function iconFields(value) {
  if (value == null) return { icon: null, iconName: null };
  const text = String(value);
  const name = text.trim().toLowerCase();
  if (name === 'backspace' || name === 'shift') return { icon: name, iconName: null };
  if (name === 'enter' || name === 'return') return { icon: 'enter', iconName: null };
  return { icon: null, iconName: text };
}

function statusLabelOf(value) {
  if (typeof value === 'string') return value;
  if (FE.isPlainObject(value) && typeof value.source === 'string') return value.source;
  return null;
}

function hintTextSizesOf(value) {
  if (typeof value === 'number') return { hintTextSize: value, hintTextSizes: {} };
  if (!FE.isPlainObject(value)) return { hintTextSize: null, hintTextSizes: {} };
  const sizes = {};
  for (const raw of Object.keys(value)) {
    const size = numOrNull(value[raw]);
    if (size == null || size <= 0) continue;
    sizes[String(raw).toUpperCase()] = size;
  }
  return { hintTextSize: null, hintTextSizes: sizes };
}

function appAction(action) {
  const command = action.command || action.action;
  if (command == null) return null;
  if (command === 'candidate_previous') return { type: 'candidate_previous_page' };
  if (command === 'candidate_next') return { type: 'candidate_next_page' };

  const aliases = {
    toggle_toolbar_container: 'toggle_container',
    select_switch_option: 'switch_option',
  };
  const out = { type: 'app', action: aliases[command] || command };
  const argument = action.argument;

  if (action.action === 'expand_toolbar' || command === 'expand_toolbar') {
    const container = action.container != null ? action.container : argument;
    if (container != null && String(container) !== '') out.container = container;
  }
  if (out.action === 'toggle_container') {
    const container = action.container != null ? action.container : argument;
    if (container != null && String(container) !== '') out.container = container;
  }
  if (out.action === 'select_schema') {
    const schema = action.schema != null ? action.schema : argument;
    if (schema != null && String(schema) !== '') out.schema = schema;
  }
  if (out.action === 'save_schema_list') {
    const schemas = action.schemas != null ? action.schemas : argument;
    if (schemas != null) out.schemas = schemas;
  }
  if (out.action === 'toggle_switch') {
    const name = action.switch != null ? action.switch : argument;
    if (name != null && String(name) !== '') out.switch = name;
  }
  if (out.action === 'switch_option') {
    if (action.switch != null && action.option != null) {
      out.switch = action.switch;
      out.option = action.option;
    } else if (typeof argument === 'string') {
      const parts = argument.split('=', 2);
      if (parts.length === 2 && parts[0] && parts[1]) {
        out.switch = parts[0];
        out.option = parts[1];
      }
    }
  }
  if (out.action === 'expand_switches') {
    const expanded = action.expanded != null ? action.expanded : argument;
    out.expanded = expanded === null || expanded === undefined
      ? true
      : (typeof expanded === 'boolean' ? expanded : String(expanded) !== 'false');
  }
  if (out.action === 'select_directory') {
    const directory = action.directory != null ? action.directory : argument;
    if (directory != null && String(directory) !== '') out.directory = directory;
  }
  if (out.action === 'switch_layout') {
    const layout = action.layout != null ? action.layout : argument;
    if (layout != null && String(layout) !== '') out.layout = layout;
  }
  if (out.action === 'editor_move') {
    if (action.key != null) out.key = action.key;
    if (action.selecting != null) out.selecting = !!action.selecting;
  }
  if (out.action === 'editor_select' && action.active != null) out.active = !!action.active;
  if (action.target != null && out.target === undefined) out.target = action.target;
  return out;
}

function canonicalAction(action, scope) {
  if (action == null) return null;
  if (!FE.isPlainObject(action)) return action;
  switch (action.type) {
    case 'key': {
      const out = { type: 'key', key: String(action.key) };
      const meta = normalizeMeta(action.meta);
      if (meta.length) out.meta = meta;
      return out;
    }
    case 'modifier':
      return {
        type: 'modifier',
        modifier: String(action.modifier || '').toUpperCase(),
        state: String(action.state || '').toUpperCase(),
      };
    case 'text':
    case 'commit':
      return { type: 'commit_text', text: String(action.text == null ? '' : action.text) };
    case 'switch_layout':
      return { type: 'app', action: 'switch_layout', layout: action.layout };
    case 'app':
      return appAction(action);
    case 'key_ref':
      return { type: 'key_ref', ref: action.ref };
    default:
      return action;
  }
}

function macroStep(spec, scope) {
  const resolved = FE.resolveActionSpec(spec, scope);
  const actions = (resolved && resolved.actions) || [];
  const steps = [];
  for (const action of actions) {
    if (FE.isPlainObject(action) && action.type === 'macro') {
      steps.push(...macroStepsOf(action, scope));
      continue;
    }
    const canonical = canonicalAction(action, scope);
    if (!canonical) continue;
    if (canonical.type === 'key' || canonical.type === 'modifier' || canonical.type === 'keysym') {
      steps.push({ input: canonical });
    } else if (String(canonical.type || '').indexOf('candidate_') === 0) {
      steps.push({ candidate: canonical });
    } else if (canonical.type === 'key_ref') {
      steps.push({ ref: canonical });
    } else {
      steps.push({ app: canonical });
    }
  }
  return steps;
}

function macroStepsOf(macroObject, scope) {
  const name = macroObject.macro;
  const macros = scope.macros || {};
  const list = Array.isArray(macros[name]) ? macros[name] : [];
  const steps = [];
  for (const step of list) steps.push(...macroStep(step, scope));
  return steps;
}

function expandActions(actions, scope) {
  const out = [];
  for (const action of actions || []) {
    if (FE.isPlainObject(action) && action.macro != null) {
      out.push({ type: 'macro', steps: macroStepsOf(action, scope) });
    } else if (FE.isPlainObject(action) && action.actions != null) {
      out.push(...expandActions(action.actions, scope));
    } else {
      const canonical = canonicalAction(action, scope);
      if (canonical) out.push(canonical);
    }
  }
  return out;
}

function resolvedActions(resolved, scope) {
  return expandActions(resolved && resolved.actions ? resolved.actions : [], scope);
}

function actionsOfSpec(spec, scope) {
  if (spec == null) return [];
  if (Array.isArray(spec)) {
    const out = [];
    for (const item of spec) out.push(...actionsOfSpec(item, scope));
    return out;
  }
  return resolvedActions(FE.resolveActionSpec(spec, scope), scope);
}

function fallbackLabel(rawLabel, clickLabel) {
  return rawLabel == null || String(rawLabel) === '' ? clickLabel : String(rawLabel);
}

function hintOf(value) {
  return value == null || String(value) === '' ? null : String(value);
}

function gestureBase(gesture, status, scope, clickLabel) {
  const info = FE.gestureInfo(gesture, status, 0, scope);
  if (!info) return null;
  return {
    kind: 'click',
    label: fallbackLabel(info.label, clickLabel),
    hint: hintOf(info.hint),
    popup: info.popup === undefined ? true : !!info.popup,
    actions: resolvedActions(info.action, scope),
    _info: info,
  };
}

function convertGestures(eff, status, scope, clickLabel) {
  const gestures = [];
  if (eff.tap != null) {
    const click = gestureBase(eff.tap, status, scope, clickLabel);
    if (click) {
      delete click._info;
      gestures.push(click);
    }
  }
  if (eff.doubleTap != null) {
    const gesture = gestureBase(eff.doubleTap, status, scope, clickLabel);
    if (gesture) {
      delete gesture._info;
      gesture.kind = 'double_click';
      gestures.push(gesture);
    }
  }
  if (eff.longPress != null) {
    const gesture = gestureBase(eff.longPress, status, scope, clickLabel);
    if (gesture) {
      const info = gesture._info;
      delete gesture._info;
      gesture.kind = 'long_press';
      gesture.repeat = !!info.repeat;
      gesture.popupKey = info.popupKey == null ? null : String(info.popupKey);
      gestures.push(gesture);
    }
  }
  if (eff.hold != null) {
    const gesture = gestureBase(eff.hold, status, scope, clickLabel);
    if (gesture) {
      const info = gesture._info;
      const start = info.start != null ? FE.resolveActionSpec(info.start, scope) : info.action;
      const end = info.end != null ? FE.resolveActionSpec(info.end, scope) : null;
      delete gesture._info;
      gesture.kind = 'hold';
      gesture.actions = resolvedActions(start, scope);
      gesture.endActions = resolvedActions(end, scope);
      gestures.push(gesture);
    }
  }
  if (FE.isPlainObject(eff.drag)) {
    const drag = eff.drag;
    const has = (name) => Object.prototype.hasOwnProperty.call(drag, name);
    const directions = {};
    for (const direction of ['up', 'down', 'left', 'right']) {
      if (!has(direction) || drag[direction] == null) continue;
      directions[direction.toUpperCase()] = actionsOfSpec(drag[direction], scope);
    }
    const endSpec = has('end') ? drag.end
      : (has('endAction') ? drag.endAction
        : (has('endActions') ? drag.endActions : null));
    const feedback = typeof drag.feedback === 'string'
      && ['NONE', 'VIBRATE', 'KEY'].indexOf(drag.feedback.toUpperCase()) >= 0
      ? drag.feedback.toUpperCase()
      : 'VIBRATE';
    gestures.push({
      kind: 'drag',
      label: has('label') ? String(drag.label == null ? '' : drag.label) : clickLabel,
      hint: has('hint') ? hintOf(drag.hint) : null,
      popup: has('popup') ? !!drag.popup : true,
      directions,
      endActions: actionsOfSpec(endSpec, scope),
      stepDp: has('step') ? numOrNull(drag.step) : null,
      feedback,
    });
  }
  if (FE.isPlainObject(eff.swipe)) {
    for (const direction of Object.keys(eff.swipe)) {
      const value = eff.swipe[direction];
      if (value == null) continue;
      const gesture = gestureBase(value, status, scope, clickLabel);
      if (!gesture) continue;
      delete gesture._info;
      gesture.kind = 'swipe';
      gesture.direction = direction.toUpperCase();
      gestures.push(gesture);
    }
  }
  return gestures;
}

function convertKey(item, status, scope, defaultHeight) {
  const eff = item.eff || {};
  const clickInfo = FE.tapInfo(eff, status, 0, scope);
  const rawLabel = FE.rawLabelOf(eff, status, 0, scope);
  const rawClickLabel = rawLabel == null ? null : String(rawLabel);
  const clickLabel = clickInfo && clickInfo.hint !== undefined && clickInfo.hint !== ''
    ? String(clickInfo.hint)
    : rawClickLabel;
  const icon = iconFields(eff.icon);
  const hintText = hintTextSizesOf(eff.hintTextSize);
  const height = typeof eff.height === 'number' && isFinite(eff.height) && eff.height > 0
    ? eff.height
    : defaultHeight;
  const weight = item.weight;
  return {
    label: clickLabel == null ? '' : String(clickLabel),
    weight: weight === 'auto' ? 1 : (numOrNull(Number(weight)) == null ? 1 : Number(weight)),
    autoWidth: weight === 'auto',
    height,
    modifier: eff.modifier == null ? null : String(eff.modifier).toUpperCase(),
    keyType: eff.keyType == null ? null : String(eff.keyType).toUpperCase(),
    id: typeof eff.id === 'string' ? eff.id : null,
    statusLabel: statusLabelOf(eff.statusLabel),
    textSize: numOrNull(eff.textSize),
    hintTextSize: hintText.hintTextSize,
    hintTextSizes: hintText.hintTextSizes,
    shiftedLabel: typeof eff.shiftedLabel === 'string' ? eff.shiftedLabel : null,
    icon: icon.icon,
    iconName: icon.iconName,
    spacer: !!item.spacer,
    colors: parseColors(eff.colors),
    gestures: convertGestures(eff, status, scope, rawClickLabel),
  };
}

function hasBuiltinVariants(fragment) {
  const text = JSON.stringify(fragment || {});
  return text.indexOf('rime.comma') >= 0 || text.indexOf('rime.period') >= 0;
}

function hasDynamicVariants(profile, fragment) {
  const definitions = FE.isPlainObject(profile.keys) ? profile.keys : {};
  for (const name of Object.keys(definitions)) {
    const value = definitions[name];
    if (FE.isPlainObject(value) && value.variants != null) return true;
  }
  return hasBuiltinVariants(fragment);
}

function layoutOverride(fragment, field, min, max) {
  if (!FE.isPlainObject(fragment) || !FE.isPlainObject(fragment.override)) return null;
  const value = fragment.override[field];
  if (typeof value !== 'number' || !isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
}

function convert(compiled, profile, status) {
  const scope = FE.scopeFrom(profile);
  const fragment = compiled.fragment;
  const icons = FE.isPlainObject(profile.icons) ? profile.icons : {};
  const sections = (compiled.sections || []).map((section) => {
    if (section.type === 'rows') {
      return {
        kind: 'rows',
        rowWidthFractions: (section.rows || []).map((row) => numOrNull(row.width)),
        rowWeightTotals: (section.rows || []).map((row) => numOrNull(row.totalWeight)),
        rows: (section.rows || []).map((row) => (row.keys || []).map((item) =>
          convertKey(item, status, scope, row.heightUnits))),
      };
    }
    if (section.type === 'grid') {
      const rowCount = section.rows > 0 ? section.rows : 1;
      const rowHeights = Array.isArray(section.rowHeights) && section.rowHeights.length === rowCount
        ? section.rowHeights
        : Array.from({ length: rowCount }, () => 5 / rowCount);
      return {
        kind: 'grid',
        columns: section.columns,
        rows: section.rows,
        rowHeights,
        cells: (section.keys || []).filter(Boolean).map((item) => ({
          column: item.column,
          row: item.row,
          columnSpan: Number(item.columnSpan),
          rowSpan: Number(item.rowSpan),
          key: convertKey(item, status, scope, 1),
        })),
      };
    }
    return null;
  }).filter(Boolean);
  let totalUnits = 0;
  for (const section of sections) {
    if (section.kind === 'rows') {
      for (const row of section.rows) {
        totalUnits += row.reduce((max, key) => Math.max(max, key.height || 0), 0);
      }
    } else if (section.kind === 'grid') {
      totalUnits += section.rowHeights.reduce((sum, value) => sum + value, 0);
    }
  }
  return {
    totalUnits,
    hasDynamicVariants: hasDynamicVariants(profile, fragment),
    keyboardHeightPercent: layoutOverride(fragment, 'keyboardHeightPercent', 0.1, 0.9),
    keyboardHeightPercentLandscape: layoutOverride(fragment, 'keyboardHeightPercentLandscape', 0.1, 0.9),
    sidePaddingDp: layoutOverride(fragment, 'sidePaddingDp', 0, 60),
    sidePaddingLandscapeDp: layoutOverride(fragment, 'sidePaddingLandscapeDp', 0, 60),
    bottomPaddingDp: layoutOverride(fragment, 'bottomPaddingDp', 0, 150),
    bottomPaddingLandscapeDp: layoutOverride(fragment, 'bottomPaddingLandscapeDp', 0, 150),
    icons: clone(icons),
    sections,
  };
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeGestureConditionals(base, alt, composing) {
  if (!Array.isArray(base) || !Array.isArray(alt)) return;
  for (const gesture of base) {
    if (!gesture || gesture.kind === 'drag' || gesture.kind === 'hold') continue;
    const other = alt.find((item) => item
      && item.kind === gesture.kind
      && (item.direction || null) === (gesture.direction || null));
    if (!other || !Array.isArray(other.actions)) continue;
    if (sameJson(gesture.actions, other.actions)) continue;
    gesture.actions = [{
      type: 'conditional',
      composing: composing ? gesture.actions : other.actions,
      default: composing ? other.actions : gesture.actions,
    }];
  }
}

function mergeConditionals(base, alt, composing) {
  const baseSections = base.sections || [];
  const altSections = alt.sections || [];
  for (let si = 0; si < baseSections.length && si < altSections.length; si++) {
    const left = baseSections[si];
    const right = altSections[si];
    if (!left || !right || left.kind !== right.kind) continue;
    if (left.kind === 'rows') {
      const leftRows = left.rows || [];
      const rightRows = right.rows || [];
      for (let ri = 0; ri < leftRows.length && ri < rightRows.length; ri++) {
        const leftKeys = leftRows[ri] || [];
        const rightKeys = rightRows[ri] || [];
        for (let ki = 0; ki < leftKeys.length && ki < rightKeys.length; ki++) {
          mergeGestureConditionals(leftKeys[ki].gestures, rightKeys[ki].gestures, composing);
        }
      }
    } else if (left.kind === 'grid') {
      const leftCells = left.cells || [];
      const rightCells = right.cells || [];
      for (let ci = 0; ci < leftCells.length && ci < rightCells.length; ci++) {
        mergeGestureConditionals(leftCells[ci].key.gestures, rightCells[ci].key.gestures, composing);
      }
    }
  }
}

function validationErrors(profile) {
  const result = FE.validateProfile(profile);
  return (result && result.errors) || [];
}

module.exports = {
  validateProfile(input) {
    return validationErrors(FE.normalizeProfile(clone(input))).length === 0;
  },

  compile(input, meta) {
    const profile = FE.normalizeProfile(clone(input));
    const errors = validationErrors(profile);
    const structural = errors.filter((error) => String(error).indexOf('循环') < 0);
    if (structural.length) return null;

    const status = toStatus(meta.status || {});
    const compiled = FE.compileLayout(profile, meta.layoutId, {
      status,
      split: !!meta.splitRequested,
    });
    if (!compiled || !compiled.ok) return null;
    const result = convert(compiled, profile, status);
    const toggled = Object.assign({}, status, { composing: !status.composing });
    const alt = FE.compileLayout(profile, meta.layoutId, {
      status: toggled,
      split: !!meta.splitRequested,
    });
    if (alt && alt.ok) {
      mergeConditionals(result, convert(alt, profile, toggled), status.composing);
    }
    return result;
  },
};

/* 直接运行本文件（node test/conformance-adapter.js）时充当验证门禁：
 * 复用 conformance 自带的 runner，对 21 个契约用例跑 46 项检查。
 * 被 require 时不执行，只导出 validateProfile / compile。
 * 不能直接 require run-conformance.js —— 它在文件末尾直接调用 main()，
 * 因此这里fork 出子进程跑 runner，保持退出码与输出一致。 */
if (require.main === module) {
  const { spawnSync } = require('child_process');
  const root = path.join(__dirname, '..', 'conformance');
  const result = spawnSync(process.execPath, [
    path.join(root, 'consumer', 'run-conformance.js'),
    '--root', root,
    '--adapter', __filename,
  ], { stdio: 'inherit' });
  process.exit(result.status == null ? 1 : result.status);
}

