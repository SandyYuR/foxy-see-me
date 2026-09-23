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

/* jscolor 测试桩：模拟 f5a-see-me 所用 jscolor 实例的关键行为。
 * - 构造后挂到 input.jscolor；重复安装抛错（与真实 jscolor 一致）；
 * - 内部保存 RGBA 通道，并按 **本仓库 vendor 版的 hexaColor 约定** 输出：
 *     不透明 → BBGGRR（6 位，RGB 反序）；带透明度 → AABBGGRR（alpha 在前）
 *   这点与标准 CSS 的 RRGGBBAA 不同，是"取色串色"类 bug 的根源，
 *   桩必须照抄，测试才能真正验证字节序；
 * - show() 会把 .jscolor-wrap 挂进 opts.container（未指定则 document.body），
 *   与真实 jscolor 的 `THIS.container.appendChild(p.wrap)` 行为一致 —— 用来
 *   锁住"面板必须挂进 <dialog> 才看得见"这一修复点；
 * - 记录构造时的 options，供断言 format/alphaChannel/valueElement/container。 */
let _lastJscolorOptions = null;
function _hx(n) { return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2).toUpperCase(); }
class JscolorStub {
  constructor(input, opts) {
    this.input = input;
    this.opts = opts || {};
    if (input.jscolor) throw new Error('Color picker already installed on this element');
    _lastJscolorOptions = this.opts;
    /* 输入框里是 ARGB(#AARRGGBB) 或 #RRGGBB，取出通道 */
    const m = String(input.value || '').trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    let r = 255, g = 255, b = 255, a = 1;
    if (m) {
      const hex = m[1].toUpperCase();
      if (hex.length === 6) { r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16); }
      else { a = parseInt(hex.slice(0, 2), 16) / 255; r = parseInt(hex.slice(2, 4), 16); g = parseInt(hex.slice(4, 6), 16); b = parseInt(hex.slice(6, 8), 16); }
    }
    this.channels = { r, g, b, a };
    this.wrap = null;
    input.jscolor = this;
    (JscolorStub.instances = JscolorStub.instances || []).push(this);
  }
  /* 按 vendor 版 parseColorString：6 位 = BBGGRR，8 位 = AABBGGRR */
  fromString(s) {
    const m = String(s || '').trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (!m) return false;
    const hex = m[1].toUpperCase();
    if (hex.length === 6) {
      this.channels = { b: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), r: parseInt(hex.slice(4, 6), 16), a: 1 };
    } else {
      this.channels = {
        a: parseInt(hex.slice(0, 2), 16) / 255,
        b: parseInt(hex.slice(2, 4), 16),
        g: parseInt(hex.slice(4, 6), 16),
        r: parseInt(hex.slice(6, 8), 16)
      };
    }
    return true;
  }
  /* 按 vendor 版 hexaColor：a==1 → BBGGRR，否则 AABBGGRR */
  toHEXAString() {
    const c = this.channels;
    if (c.a === 1) return _hx(c.b) + _hx(c.g) + _hx(c.r);
    return _hx(c.a * 255) + _hx(c.b) + _hx(c.g) + _hx(c.r);
  }
  /* 按 hexColor：正常 RRGGBB */
  toHEXString() { const c = this.channels; return _hx(c.r) + _hx(c.g) + _hx(c.b); }
  show() {
    JscolorStub.shown = (JscolorStub.shown || 0) + 1;
    JscolorStub.lastShown = this;
    if (!this.wrap) {
      this.wrap = new DOMNode('div');
      this.wrap.className = 'jscolor-wrap';
    }
    /* 真实 jscolor：wrap 会被移入当前 owner 的 container */
    const container = this.opts.container || documentStub.body;
    if (container) container.appendChild(this.wrap);
  }
  hide() { JscolorStub.hidden = (JscolorStub.hidden || 0) + 1; }
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
    this._open = false;
    this.hidden = false;
    this._html = null;
    /* scrollLeft / scrollTop：真实浏览器里**每个元素**都有这两个属性，
     * 没滚过时是 0（不是 undefined）。桩早先只给 documentElement 定义了它们，
     * 于是「读一个没滚过的元素」会拿到 undefined，与真实语义不符 ——
     * 网格画布横向位置保持的断言（期望 0 实际 undefined）就是这么红的。
     * 补上默认值，两个方向都照抄真实行为。 */
    this.scrollLeft = 0;
    this.scrollTop = 0;
  }
  /* --- title：真实 DOM 里 title 是**双向反射**的 ---
   * `el.title = 'x'` 与 `setAttribute('title','x')` 等价，`getAttribute('title')` 也读得到。
   * 桩早期只做了 setAttribute → .title 单向，导致「代码用 .title 写、测试用
   * getAttribute 读」会拿到 null（真实浏览器不会）。这里统一走 _attrs，两个方向都对。 */
  get title() { return this._attrs.title != null ? this._attrs.title : ''; }
  set title(v) { this._attrs.title = String(v); }
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
  /* --- details/open --- */
  /* 真实浏览器里 open 是反射访问器，且变更会派发 toggle（异步；桩同步派发，
   * 便于测试直接断言）。懒建正文依赖 toggle，所以这里必须照抄。 */
  get open() { return this._open; }
  set open(v) {
    const next = !!v;
    if (next === this._open) return;
    this._open = next;
    if (this.tagName === 'DETAILS') this._fire('toggle');
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
    /* title / open / hidden 都已在上面或下面定义为反射访问器，这里不必再赋值 */
    /* open 同理：<details open> 的布尔属性会反射到 el.open。
     * h() 会跳过 null/false，所以这里出现即表示属性存在。 */
    if (k === 'open') this.open = true;
    /* hidden 也是反射属性：setAttribute('hidden') → el.hidden === true。
     * 代码（如 updateFloatTools）读 .hidden，两处都按真实语义来才一致。
     * 传 'false' 在真实 DOM 里**依然算存在**（布尔属性只看有无），照抄。 */
    if (k === 'hidden') this.hidden = true;
    if (k.slice(0, 5) === 'data-') {
      const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(v);
    }
  }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  /* --- tree --- */
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
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
    /* 照抄真实浏览器的一个关键副作用：**被移除的元素若正持有焦点**，
     * 焦点会交回 body，浏览器随之把页面滚回顶部。
     * 这正是「加/删一条动作或宏就被扔回分栏顶部」的成因，桩必须复现，
     * 否则「重建列表时保持滚动位置」的修复无法被断言验证。
     *
     * 注意要检查**整棵被摘掉的子树**：clearEl 删的是列表的直接子元素，
     * 而持有焦点的按钮往往是深层后代，只看 n 本身会漏掉。 */
    if (documentStub.activeElement && containsNode(n, documentStub.activeElement)) {
      documentStub.activeElement = null;
      if (documentElement) { documentElement.scrollTop = 0; documentElement.scrollLeft = 0; }
    }
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
  /* 测试桩用 __stubWidth 模拟可变宽度（默认 0 → 走 ||380 回退） */
  get clientWidth() { return (this.__stubWidth != null ? this.__stubWidth : 0); }
  set clientWidth(v) { this.__stubWidth = v; }
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
  focus() { documentStub.activeElement = this; }
  blur() { if (documentStub.activeElement === this) documentStub.activeElement = null; }
  select() {}
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  click() { this._fire('click'); }  showModal() { this.open = true; documentStub._openDialogs.push(this); }
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
  // 支持: .class / .class.class…（多 class）/ tag / tag.class / #id
  let m;
  if ((m = sel.match(/^#([\w-]+)$/))) return el.getAttribute && el.getAttribute('id') === m[1];
  if (sel.charAt(0) === '.' || /^\w[\w-]*\./.test(sel)) {
    /* class 复合选择器：tag.cls1.cls2… */
    const dot = sel.indexOf('.');
    if (dot >= 0) {
      const tag = sel.slice(0, dot);
      if (tag && el.tagName !== tag.toUpperCase()) return false;
      const classes = sel.slice(dot + 1).split('.');
      return classes.every(c => c && classListOf(el).has(c));
    }
  }
  if ((m = sel.match(/^([\w-]+)$/))) return el.tagName === m[1].toUpperCase();
  return false;
}
function queryAll(root, sel) {
  /* 支持以空格分隔的后代选择器，如 "#layout-sections .chip"。
   * 祖先链从父节点开始匹配（不含元素自身），与浏览器语义一致。 */
  const parts = String(sel).trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (c.nodeType !== 1) continue;
      if (matchesImpl(c, last) && matchesAncestors(c, parts.slice(0, -1))) out.push(c);
      walk(c);
    }
  };
  function matchesAncestors(el, chain) {
    if (!chain.length) return true;
    /* 从内向外逐段匹配：chain 末段是离元素最近的祖先 */
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
/* node 是否等于 root 或位于其子树内（用于判断「被摘掉的节点里是否含焦点元素」） */
function containsNode(root, node) {
  if (!root || !node) return false;
  if (root === node) return true;
  for (const c of root.children || []) {
    if (c === node) return true;
    if (c.nodeType === 1 && containsNode(c, node)) return true;
  }
  return false;
}

/* 页面滚动容器：app.js 的 pageScroller() 依次找
 * document.scrollingElement / documentElement / body。
 * 桩里给 documentElement 一份，并让 scrollingElement 指向它，
 * 这样「保持滚动位置」的代码路径在测试里能真正跑到。 */
const documentElement = {
  nodeType: 1,
  tagName: 'HTML',
  scrollTop: 0,
  scrollLeft: 0
};

const documentStub = {
  nodeType: 9,
  children: [],
  get body() { return this._body; },
  _body: null,
  activeElement: null,
  readyState: 'complete',
  documentElement,
  get scrollingElement() { return documentElement; },
  _openDialogs: [],
  createElement(tag) { return new DOMNode(tag); },
  createTextNode(t) { return new TextNode(t); },
  getElementById(id) { return findById(this._body, id) || findById(this, id); },
  querySelector(sel) { return queryAll(this._body, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(this._body, sel); },
  addEventListener(type, fn) { (this._listeners = this._listeners || {}); (this._listeners[type] = this._listeners[type] || []).push(fn); },
  /* 与 DOMNode 一样必须成对提供：真实 document 有 removeEventListener，
   * 桩缺了它，任何「挂监听后解绑」的代码在测试里会 TypeError
   * （跳转后的持续高亮就是第一例：它按用户操作解绑监听）。 */
  removeEventListener(type, fn) {
    const l = this._listeners && this._listeners[type];
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  },
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
  /* 与真实 DOM 一致：body 的父节点是 document（nodeType 9）。
   * 编辑器用它判断"元素是否已挂载到文档"（决定 jscolor 何时安装）。 */
  body.parentNode = documentStub;

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
      el('label', null, el('input', { type: 'checkbox', id: 'pt-split' })),
      el('input', { type: 'text', id: 'pt-status-text' }),
      el('select', { id: 'pt-theme' }))
  );
  const pStage = el('div', { class: 'preview-stage' }, el('div', { id: 'preview-kb', class: 'kb kb-dark' }));
  const pLegend = el('div', { class: 'preview-legend' },
    '角标说明：右上蓝色 = 长按提示 · 右上橙色 = 按住提示 · 底中 ⌄ = 长按弹出菜单 · 红色虚线框 = 引用无法解析 · 黄色框 = 选中按键');
  previewPanel.append(pToolbar, pStage, pLegend, el('div', { id: 'preview-meta', class: 'status' }));

  /* 标签栏：4 个按钮（布局编辑 / 按键定义 / 动作与宏 / 弹出菜单）。
   * 布局 JSON 卡片在「布局编辑」页内，不是独立标签页——见 AGENT.md §5.4。 */
  const tabs = el('div', { class: 'tabs' });
  [['tab-layout', true], ['tab-keys', false], ['tab-actions', false], ['tab-popup', false]].forEach(([t, active]) => {
    tabs.appendChild(el('button', { class: 'tab' + (t === 'tab-popup' ? ' tab-popup' : ''), 'data-tab': t }));
  });

  /* 布局编辑面板：与 index.html 相同的卡片顺序与标题 */
  const tabLayout = el('section', { class: 'tabpanel' + ' active', id: 'tab-layout' });
  const layoutCard = el('details', { class: 'card', open: 'open' },
    el('summary', null, '布局编辑'));
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
  const layoutJsonCard = el('details', { class: 'card', open: 'open' },
    el('summary', null, '布局 JSON（实时同步；可直接编辑后“应用”）'),
    el('div', { class: 'toolbar' },
      el('button', { id: 'json-check' }),
      el('button', { id: 'json-apply' }),
      el('button', { id: 'json-format' }),
      el('button', { id: 'json-copy' })),
    el('div', { id: 'json-issues', class: 'json-issues' }),
    el('textarea', { id: 'json-editor', class: 'json-editor' }),
    el('div', { id: 'json-status', class: 'status' }));
  const opCard = el('details', { class: 'card', open: 'open' },
    el('summary', null, '布局与文件操作'));
  opCard.append(
    el('div', { class: 'toolbar' },
      el('button', { id: 'op-import' }),
      el('input', { id: 'op-import-file', type: 'file' }),
      el('button', { id: 'op-export' }),
      el('button', { id: 'op-export-defs' }),
      el('select', { id: 'op-example' }),
      el('button', { id: 'op-load-example' }),
      el('button', { id: 'op-undo' }),
      el('button', { id: 'op-redo' })),
    el('input', { id: 'op-author', type: 'text' }),
    el('input', { id: 'op-type', type: 'checkbox' }),
    el('div', { id: 'op-folder' },
      el('select', { id: 'op-folder-layout' }),
      el('button', { id: 'op-folder-load' })),
    el('div', { id: 'op-folder-hint', class: 'form-row form-inline folder-hint' },
      el('span', { id: 'op-folder-hint-text', class: 'folder-hint-text' }),
      el('button', { id: 'op-folder-complete', class: 'mini-button attention' }, '选择文件夹…'),
      el('input', { id: 'op-import-dir-file', type: 'file' })),
    el('div', { id: 'op-folder-report' }),
    el('div', { id: 'op-status', class: 'status' })
  );
  const wb = el('div', { class: 'workbench' }, el('div', { class: 'col-main' }, opCard, layoutCard, layoutJsonCard));
  tabLayout.appendChild(wb);

  /* 按键定义面板（工具条与 index.html 保持同步：搜索组 + 新建组） */
  const tabKeys = el('section', { class: 'tabpanel', id: 'tab-keys' });
  tabKeys.appendChild(el('details', { class: 'card', open: 'open' },
    el('div', { class: 'def-toolbar' },
      el('div', { class: 'def-tool-group' },
        el('input', { id: 'keys-filter', type: 'text', placeholder: '搜索：名称 / 引用' }),
        el('button', { id: 'keys-search' }, '搜索')),
      el('div', { class: 'def-tool-group' },
        el('input', { id: 'keys-new', type: 'text', placeholder: '新按键定义名称，如 my.tab' }),
        el('button', { id: 'keys-add' }, '+ 新建按键定义'))),
    el('div', { id: 'keys-list' })));

  /* 动作与宏面板（与按键定义页同构：各自一组搜索、一组新建） */
  const tabActions = el('section', { class: 'tabpanel', id: 'tab-actions' });
  tabActions.append(
    el('details', { class: 'card', open: 'open' },
      el('div', { class: 'def-toolbar' },
        el('div', { class: 'def-tool-group' },
          el('input', { id: 'actions-filter', type: 'text', placeholder: '搜索：名称 / 动作内容' }),
          el('button', { id: 'actions-search' }, '搜索')),
        el('div', { class: 'def-tool-group' },
          el('input', { id: 'actions-new', type: 'text', placeholder: '新动作名称，如 editor.select_all' }),
          el('button', { id: 'actions-add' }, '+ 新建动作'))),
      el('div', { id: 'actions-list' })),
    el('details', { class: 'card', open: 'open' },
      el('div', { class: 'def-toolbar' },
        el('div', { class: 'def-tool-group' },
          el('input', { id: 'macros-filter', type: 'text', placeholder: '搜索：名称 / 步骤内容' }),
          el('button', { id: 'macros-search' }, '搜索')),
        el('div', { class: 'def-tool-group' },
          el('input', { id: 'macros-new', type: 'text', placeholder: '新宏名称，如 delete_to_line_start' }),
          el('button', { id: 'macros-add' }, '+ 新建宏'))),
      el('div', { id: 'macros-list' })));

  /* 弹出菜单面板（与 index.html 同样的卡片顺序与标题）：
   * 弹出菜单文件（最上）→ 弹出效果预览 → 弹出菜单键定义 → 弹出菜单 JSON（最下） */
  const tabPopup = el('section', { class: 'tabpanel', id: 'tab-popup' });
  tabPopup.append(
    el('details', { class: 'card', open: 'open' },
      el('summary', null, '弹出菜单文件'),
      el('div', { class: 'toolbar' },
        el('button', { id: 'popup-import' }),
        el('input', { id: 'popup-import-file', type: 'file' }),
        el('button', { id: 'popup-export' }),
        el('select', { id: 'popup-example' }),
        el('button', { id: 'popup-load-example' })),
      el('input', { id: 'popup-author', type: 'text' }),
      el('div', { id: 'popup-status', class: 'status' })),
    el('details', { class: 'card', open: 'open' },
      el('summary', null, '弹出效果预览'), el('div', { id: 'popup-preview' })),
    el('details', { class: 'card', open: 'open' },
      el('summary', null, '弹出菜单键定义（schemas）'),
      el('select', { id: 'popup-schema' }),
      el('button', { id: 'popup-schema-add' }),
      el('button', { id: 'popup-schema-del' }),
      el('div', { id: 'popup-validation', class: 'status' }),
      el('div', { id: 'popup-keys' })),
    el('details', { class: 'card', open: 'open' },
      el('summary', null, '弹出菜单 JSON（实时同步；可直接编辑后“应用”）'),
      el('div', { class: 'toolbar' },
        el('button', { id: 'popup-json-apply' }),
        el('button', { id: 'popup-json-format' })),
      el('textarea', { id: 'popup-json', class: 'json-editor' }),
      el('div', { id: 'popup-json-status', class: 'status' })));

  main.append(previewPanel, tabs, tabLayout, tabKeys, tabActions, tabPopup);
  /* 顶栏：标题（本身是仓库链接）+ 右侧仓库链接与常驻撤销/重做按钮（与 index.html 保持同步） */
  const header = el('header', { class: 'topbar' });
  header.appendChild(el('div', { class: 'topbar-main' },
    el('div', { class: 'topbar-title' },
      el('h1', null, el('a', {
        class: 'brand-link', id: 'repo-title-link',
        href: 'https://github.com/SandyYuR/foxy-see-me',
        target: '_blank', rel: 'noopener noreferrer'
      }, '🦊 小狐狸 see me')),
      el('h2', null, 'Foxy 键盘布局可视化编辑器')),
    el('div', { class: 'topbar-actions' },
      el('a', {
        class: 'repo-link', id: 'repo-link',
        href: 'https://github.com/SandyYuR/foxy-see-me',
        target: '_blank', rel: 'noopener noreferrer'
      }, 'GitHub'),
      el('span', { class: 'topbar-sep' }),
      el('button', { id: 'top-undo', class: 'mini-button', disabled: 'disabled' }),
      el('button', { id: 'top-redo', class: 'mini-button', disabled: 'disabled' }))));
  body.appendChild(header);
  body.appendChild(main);
  /* 浮动工具（与 index.html 保持同步）：右上撤销/重做、右下回到顶部。
   * 结构是 .float-layer > .float-rail > 按钮 —— 这层让按钮贴着**中央操作区外缘**
   * （与内容列同宽、同内边距、同居中），而不是钉在视口边缘。
   * 初始 hidden —— 显隐由 app.js 的 updateFloatTools() 按滚动位置控制。 */
  body.appendChild(el('div', { class: 'float-layer' },
    el('div', { class: 'float-rail' },
      el('div', { id: 'float-undo-group', class: 'float-group float-top-right', hidden: 'hidden' },
        el('button', { id: 'float-undo', class: 'mini-button', disabled: 'disabled' }),
        el('button', { id: 'float-redo', class: 'mini-button', disabled: 'disabled' })),
      el('button', { id: 'float-top', class: 'mini-button float-bottom-right', hidden: 'hidden' }, '↑ 顶部'))));
  return body;
}

module.exports = { DOMNode, TextNode, el, documentStub, localStorageStub, buildSkeleton, makeEvent, JscolorStub,
  __getLastJscolorOptions: () => _lastJscolorOptions,
  __resetJscolorStub: () => { _lastJscolorOptions = null; JscolorStub.instances = []; JscolorStub.shown = 0; JscolorStub.hidden = 0; } };
