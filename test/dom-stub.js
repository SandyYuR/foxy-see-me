/* 极简 DOM 桩 — 供 test-ui.js 在 Node 中驱动编辑器 UI 代码。
 * 只实现编辑器用到的那部分 DOM API。
 */
'use strict';

class ClassList {
  constructor() { this._set = new Set(); }
  _replace(s) { this._set = new Set(String(s).split(/\s+/).filter(Boolean)); }
  add(...cs) { cs.forEach(c => c && this._set.add(String(c))); }
  remove(...cs) { cs.forEach(c => this._set.delete(String(c))); }
  contains(c) { return this._set.has(String(c)); }
  toggle(c, force) {
    const want = force === undefined ? !this._set.has(c) : !!force;
    if (want) this._set.add(c); else this._set.delete(c);
    return want;
  }
  get length() { return this._set.size; }
}

class StyleProxy {
  constructor() { /* 任意属性均可赋值 */ }
}

function makeEvent(type, target) {
  return {
    type, target, currentTarget: target,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this._stopped = true; },
    value: undefined, checked: undefined, key: ''
  };
}

class DOMNode {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._attrs = {};
    this._listeners = {};
    this.style = new StyleProxy();
    this.dataset = {};
    this._cls = new ClassList();
    this._className = '';
    this._value = undefined;
    this.checked = false;
    this.disabled = false;
    this.open = false;
    this.title = '';
    this.hidden = false;
    this._html = null;
  }
  /* --- value：select 派生自选中项，input 回退到 value 属性 --- */
  get value() {
    if (this.tagName === 'SELECT') {
      const opts = this.querySelectorAll('option');
      for (const o of opts) if (o.getAttribute('selected') != null) return o.getAttribute('value') || '';
      if (this._value !== undefined) return this._value;
      return opts.length ? (opts[0].getAttribute('value') || '') : '';
    }
    return this._value !== undefined ? this._value : (this.getAttribute('value') || '');
  }
  set value(v) {
    this._value = String(v);
    if (this.tagName === 'SELECT') {
      for (const o of this.querySelectorAll('option')) {
        if ((o.getAttribute('value') || '') === String(v)) o.setAttribute('selected', '');
        else delete o._attrs['selected'];
      }
    }
  }
  /* --- class --- */
  get className() { return Array.from(this._cls._set).join(' '); }
  set className(v) { this._cls._replace(v); }
  get classList() { return this._cls; }
  /* --- attrs --- */
  setAttribute(k, v) {
    this._attrs[k] = String(v);
    if (k === 'id') this.id = String(v);
    if (k === 'class') this._cls._replace(v);
    if (k.slice(0, 5) === 'data-') {
      const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(v);
    }
  }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  /* --- tree --- */
  get firstChild() { return this.children[0] || null; }
  get childNodes() { return this.children.slice(); }
  appendChild(n) {
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    this.children.push(n);
    return n;
  }
  append(...kids) {
    kids.forEach(k => {
      if (k == null || k === false) return;
      this.appendChild(typeof k === 'object' ? k : new TextNode(String(k)));
    });
  }
  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.children.indexOf(ref);
    n.parentNode = this;
    if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
    return n;
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) { this.children.splice(i, 1); n.parentNode = null; }
    return n;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  /* --- text / html --- */
  get textContent() {
    let out = '';
    const walk = (n) => {
      for (const c of n.children) {
        if (c.nodeType === 3) out += c._text;
        else if (c.nodeType === 8) continue;
        else walk(c);
      }
    };
    walk(this);
    return out;
  }
  set textContent(v) {
    this.children = [];
    if (v !== '') this.appendChild(new TextNode(String(v)));
  }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    /* 用一个原始节点占位 */
    const raw = new DOMNode('raw');
    raw.nodeType = 8;
    this.appendChild(raw);
  }
  /* --- events --- */
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const l = this._listeners[type]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    const l = (this._listeners[ev.type] || []).slice();
    for (const fn of l) fn.call(this, ev);
    return !ev.defaultPrevented;
  }
  _fire(type, extra) {
    const ev = makeEvent(type, this);
    Object.assign(ev, extra || {});
    return this.dispatchEvent(ev);
  }
  /* --- query --- */
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  matches(sel) {
    return matchesImpl(this, sel);
  }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  getElementById(id) { return findById(this, id); }
  /* --- misc --- */
  get clientWidth() { return 0; }
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
  focus() { documentStub.activeElement = this; }
  blur() { if (documentStub.activeElement === this) documentStub.activeElement = null; }
  select() {}
  click() { this._fire('click'); }
  showModal() { this.open = true; documentStub._openDialogs.push(this); }
  close() { if (this.open) { this.open = false; this._fire('close'); } }
  scrollTo() {}
  find(...a) { return null; }
}

class TextNode {
  constructor(text) { this.nodeType = 3; this._text = String(text); this.parentNode = null; this.children = []; }
  get textContent() { return this._text; }
}

function classListOf(el) { return el._cls ? el._cls._set : new Set(); }

function matchesImpl(el, sel) {
  // 支持: .class / tag / tag.class / #id / [attr] 简化版
  let m;
  if ((m = sel.match(/^#([\w-]+)$/))) return el.getAttribute && el.getAttribute('id') === m[1];
  if ((m = sel.match(/^([\w-]+)?\.([\w-]+)$/))) {
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    return classListOf(el).has(m[2]);
  }
  if ((m = sel.match(/^([\w-]+)$/))) return el.tagName === m[1].toUpperCase();
  return false;
}
function queryAll(root, sel) {
  /* 支持以空格分隔的后代选择器，如 "#layout-sections .chip" */
  const parts = String(sel).trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (c.nodeType !== 1) continue;
      if (matchesImpl(c, last) && hasAncestorsMatch(c, parts.slice(0, -1))) out.push(c);
      walk(c);
    }
  };
  function hasAncestorsMatch(el, chain) {
    if (!chain.length) return true;
    /* 从内向外逐段匹配 */
    let node = el.parentNode;
    let idx = chain.length - 1;
    while (node && node.nodeType === 1) {
      if (matchesImpl(node, chain[idx])) {
        idx--;
        if (idx < 0) return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  walk(root);
  return out;
}
function findById(root, id) {
  let found = null;
  const walk = (n) => {
    if (found) return;
    for (const c of n.children) {
      if (c.nodeType !== 1) continue;
      if (c.getAttribute && c.getAttribute('id') === id) { found = c; return; }
      walk(c);
    }
  };
  walk(root);
  return found;
}

const documentStub = {
  nodeType: 9,
  children: [],
  get body() { return this._body; },
  _body: null,
  activeElement: null,
  readyState: 'complete',
  _openDialogs: [],
  createElement(tag) { return new DOMNode(tag); },
  createTextNode(t) { return new TextNode(t); },
  getElementById(id) { return findById(this._body, id) || findById(this, id); },
  querySelector(sel) { return queryAll(this._body, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(this._body, sel); },
  addEventListener(type, fn) { (this._listeners = this._listeners || {}); (this._listeners[type] = this._listeners[type] || []).push(fn); },
  dispatchEvent(ev) {
    const l = (this._listeners && this._listeners[ev.type] || []).slice();
    for (const fn of l) fn.call(this, ev);
    return true;
  },
  execCommand() { return true; }
};

function el(tag, attrs, ...kids) {
  const n = new DOMNode(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'id') n.setAttribute('id', v);
      else if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, String(v));
    }
  }
  kids.flat(Infinity).forEach(k => {
    if (k == null || k === false) return;
    n.appendChild(typeof k === 'object' ? k : new TextNode(String(k)));
  });
  return n;
}

const localStorageStub = {
  _map: new Map(),
  getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
  setItem(k, v) { this._map.set(k, String(v)); },
  removeItem(k) { this._map.delete(k); }
};

/* 构造与 index.html 等价的骨架 */
function buildSkeleton() {
  const body = el('body');
  documentStub._body = body;
  documentStub.children = [body];

  const main = el('main');

  /* 预览面板 */
  const previewPanel = el('details', { class: 'panel preview-panel', open: 'open' });
  const pToolbar = el('div', { class: 'preview-toolbar' },
    el('div', { class: 'layout-tabs', id: 'layout-tabs' }),
    el('div', { class: 'preview-toggles' },
      el('label', null, el('input', { type: 'checkbox', id: 'pt-shift' })),
      el('label', null, el('input', { type: 'checkbox', id: 'pt-composing' })),
      el('label', null, el('input', { type: 'checkbox', id: 'pt-ascii' })),
      el('label', null, el('input', { type: 'checkbox', id: 'pt-disabled' })),
      el('input', { type: 'text', id: 'pt-status-text' }),
      el('select', { id: 'pt-theme' }))
  );
  const pStage = el('div', { class: 'preview-stage' }, el('div', { id: 'preview-kb', class: 'kb kb-dark' }));
  const pLegend = el('div', { class: 'preview-legend' });
  previewPanel.append(pToolbar, pStage, pLegend, el('div', { id: 'preview-meta', class: 'status' }));

  /* 标签栏 */
  const tabs = el('div', { class: 'tabs' });
  [['tab-layout', true], ['tab-keys', false], ['tab-actions', false], ['tab-json', false]].forEach(([t, active]) => {
    tabs.appendChild(el('button', { class: 'tab' + (active ? ' active' : ''), 'data-tab': t }));
  });

  /* 布局编辑面板 */
  const tabLayout = el('section', { class: 'tabpanel' + ' active', id: 'tab-layout' });
  const layoutCard = el('details', { class: 'card', open: 'open' });
  layoutCard.append(
    el('div', { class: 'toolbar' },
      el('select', { id: 'layout-select', class: 'mini-select' }),
      el('button', { id: 'layout-add' }),
      el('button', { id: 'layout-dup' }),
      el('button', { id: 'layout-rename' }),
      el('button', { id: 'layout-del' })),
    el('div', { id: 'layout-settings', class: 'settings-block' },
      el('input', { id: 'ls-height-p', type: 'number' }),
      el('input', { id: 'ls-height-landscape', type: 'number' }),
      el('div', { id: 'layout-variants' })),
    el('div', { id: 'layout-sections' })
  );
  const opCard = el('details', { class: 'card', open: 'open' });
  opCard.append(
    el('div', { class: 'toolbar' },
      el('button', { id: 'op-import' }),
      el('input', { id: 'op-import-file', type: 'file' }),
      el('button', { id: 'op-export' }),
      el('select', { id: 'op-example' }),
      el('button', { id: 'op-load-example' }),
      el('button', { id: 'op-undo' }),
      el('button', { id: 'op-redo' })),
    el('input', { id: 'op-author', type: 'text' }),
    el('input', { id: 'op-type', type: 'checkbox' }),
    el('div', { id: 'op-status', class: 'status' })
  );
  const wb = el('div', { class: 'workbench' }, el('div', { class: 'col-main' }, layoutCard, opCard));
  tabLayout.appendChild(wb);

  /* 按键定义面板 */
  const tabKeys = el('section', { class: 'tabpanel', id: 'tab-keys' });
  tabKeys.appendChild(el('details', { class: 'card', open: 'open' },
    el('div', { class: 'toolbar' },
      el('input', { id: 'keys-filter', type: 'text' }),
      el('button', { id: 'keys-add' })),
    el('div', { id: 'keys-list' })));

  /* 动作与宏面板 */
  const tabActions = el('section', { class: 'tabpanel', id: 'tab-actions' });
  tabActions.append(
    el('details', { class: 'card', open: 'open' }, el('div', { id: 'actions-list' })),
    el('details', { class: 'card', open: 'open' }, el('div', { id: 'macros-list' })));

  /* JSON 面板 */
  const tabJson = el('section', { class: 'tabpanel', id: 'tab-json' });
  tabJson.appendChild(el('details', { class: 'card', open: 'open' },
    el('div', { class: 'toolbar' },
      el('button', { id: 'json-apply' }),
      el('button', { id: 'json-format' }),
      el('button', { id: 'json-copy' })),
    el('textarea', { id: 'json-editor', class: 'json-editor' }),
    el('div', { id: 'json-status', class: 'status' })));

  main.append(previewPanel, tabs, tabLayout, tabKeys, tabActions, tabJson);
  body.appendChild(el('header', { class: 'topbar' }));
  body.appendChild(main);
  return body;
}

module.exports = { DOMNode, TextNode, el, documentStub, localStorageStub, buildSkeleton, makeEvent };
