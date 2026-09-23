# AGENT.md — foxy-editor 修改指南（给后续代理）

本文件是 `foxy-editor/`（小狐狸 see me 编辑器）的**改动前必读**。目标：让下一个代理
在不熟悉上下文的情况下也能安全改代码，避免踩已知的坑。

先读这一行的结论：**改任何东西后必须跑 `node test/test-core.js` 与 `node test/test-ui.js`，
两个都 0 失败才算改完。** 当前基线：core 461 / UI 829 / 真实文件体检 20 个示例 0 错误。

### ⚠️ 本文件有两份，必须保持一致

同一个 `AGENT.md` 放在两处：

- `<工作区根>/AGENT.md`            ← 仓库外层，供在整个工作区里工作时先读到
- `<工作区根>/foxy-editor/AGENT.md` ← 仓库内，随项目一起分发

**两份要求逐字节相同**：只改其中一份 = 另一份立刻过期，后续代理会照着旧约定改代码。

```bash
# 改完 AGENT.md 后：一条命令同步 + 校验（两处都跑同样的命令）
node tools/check-agent-sync.js --write   # 以 foxy-editor/AGENT.md 为准，覆盖根目录副本
node tools/check-agent-sync.js           # 只校验，不一致则退出码 1
```

- **权威副本是仓库内的 `foxy-editor/AGENT.md`**：改内容改这一份，然后 `--write` 同步出去。
- 根目录不是 git 仓库，所以外层那份**不会被提交**——它纯粹是本工作区的便捷副本。
- 忘了同步也不致命：校验脚本会报出来（退出码 1），照上面重跑即可。

---

## 0. 缘起与既定决断（先读；这些是刻意为之，不是疏忽）

### 0.1 原始任务

> 利用工作区内现有键盘布局示例文件、skill 以及文档，仿照
> <https://github.com/SandyYuR/f5a-see-me> 写一个适用于小狐狸 Foxy 的键盘布局编辑器
> GUI，实现可视化编辑键盘布局，实时显示每次修改后的键盘渲染布局，**主题部分的编辑
> 可以去除**，主要完善可视化键盘布局编辑功能。

首版提交（`897a9ad`）立下的目标至今未变：
**「仿 f5a-see-me 的交互方式，为小狐狸 Foxy 输入法打造的纯前端布局编辑器」**，
含实时键盘渲染预览、可视化编辑、与 Foxy 解析器一致的校验器、宽松 JSON 导入。

### 0.2 决策清单（**动这些之前先读完理由**）

#### D1 · 仿 f5a-see-me 的是**交互**，不是实现

[f5a-see-me](https://github.com/SandyYuR/f5a-see-me) 是用户指名的参照项目（另一个同类
键盘布局编辑器）。本编辑器只借它的**交互范式**：点预览里的按键直接编辑、模态对话框
分层、jscolor 就地取色面板。
**数据格式完全按 Foxy 自己的 skill 文档来**，两者格式并不相同，不要把参照项目的字段
当成 Foxy 的字段。取色面板那几个坑（必须挂进 `<dialog>`、ARGB 字节序）是对着
参照项目的做法复刻验证过的，见 §4.5。

#### D2 · 主题编辑**明确排除**，不要再加

原始任务里用户就点明"主题部分的编辑可以去除"。理由：**主题是 Foxy 的全局设置，
不属于布局文件**。布局文件里只有每键 `colors` 覆盖（`text/background/border/hint/
pressed/shadow` + `states.*`），那个已完整支持。

> 后续代理常见误判："预览有深浅配色开关，但没有主题编辑器，是不是缺功能？"
> **不是。** 预览的深浅开关只是**预览辅助**（`state.theme`），不写进布局数据。

#### D3 · 纯前端 / 零构建 / 零依赖是**硬约束**

`index.html` 直接 `<script>` 引入、双击即用、`file://` 也能跑。
由此派生两条不能破的规矩：

- **不许引入 npm 包、打包器、或任何需要 HTTP 服务器的加载路径**；
- **示例必须打包进 `js/examples-bundle.js`** —— 因为 `file://` 下 `fetch` 本地 JSON
  会被浏览器拦掉。这就是 `tools/build-examples.js` 存在的唯一理由。
  （历史状态：早期 README 写"HTTP 打开时用 examples/ 目录"，现已改为全部打包。）

#### D4 · 用**自制 DOM 桩**，不要换成 jsdom

最初尝试 `npm install jsdom` 被沙盒权限挡下（`--allow-scripts` / 缓存 / 日志目录权限），
于是写了 `test/dom-stub.js`。这条路**有意保留**：

- 桩里那些"怪癖"本身就是回归测试的一部分 —— 例如**故意照抄** vendor 版 jscolor 的
  ARGB 字节序（`#BBGGRR` / `#AABBGGRR`），不照抄就测不出"取色串色"这类 bug；
- 桩跑得极快、无依赖，符合 D3。

> 换成 jsdom 会让你失去对字节序、`<dialog>` 挂载等关键行为的断言能力，**别做**。

#### D5 · 宽松导入是**刻意保留**的，不许改回严格 ⭐

这是本项目最容易被"好心"改坏的地方，完整论证见 README「JSON 语法自动修复」与提交
`f99203a`。核心逻辑：

```
Foxy 手机端 = 布局文件的消费方（必须吃严格 JSON）
本编辑器   = 生产方 / 修复方（导出永远是规范 JSON）
⇒ 宽松导入不会污染下游，它只决定"编辑阶段能不能把手改的文件读进来"
```

改回严格**换不来任何安全性**，只会让手改文件的人每次都先撞一次报错
（真实例子：`cc lite.json` 有 48 处尾逗号，严格 `JSON.parse` 直接失败）。

"静默修复会不会掩盖问题"这一疑虑，靠**告知**而不是**拒绝**来消解：
修了几处、哪一类、第几行都会列出，还提供「仅修复文本」先看再应用；
且只在修复结果能被 `JSON.parse` 接受时才采用，否则如实报硬错误。

⚠️ `test-ui.js` 里有专门的 **「回归：宽松导入三项保证」+「真实 cc lite.json 端到端导入」**
区块锁定这个行为。**如果改完发现是这些断言红了，先怀疑自己改错了，而不是去改断言。**

#### D6 · `override` 扁平化保存

保存放置时把 `override` 里的字段摊平成直接字段。因为优先级是
`定义链 < override < 直接字段`，摊平**不改变语义**，导出的 JSON 更整洁。
（改动优先级方向时务必回看 —— 这条曾随文档更新反转过，见 §4.1。）

#### D7 · 校验对齐 Foxy 解析器，不自己发明规则

首版目标就是"与 Foxy 解析器一致的校验器"。每次 skill/文档更新都要同步
（已同步过：`TOGGLE_LOCKED`、`text_editor`、`split`、`label` 优先级反转、`null` 语义细则…）。

**宁可少报，不要乱报**：拿不准的先 `warn`，别急着 `err` —— 因为**一个 `err` 会让整个
profile 在 Foxy 端被拒绝**（Foxy 端是"任一布局不合法就整个 profile 不显示"）。
反之 `warn` 只是编辑器里的提示。

#### D8 · 示例即测试语料，别随手删

`examples/` 里的文件身兼两职：给用户的示例 + `check-real-files.js` 的体检对象
（`cc lite.json` 48 处尾逗号、`cangjie.json` 的 5 个 split、思无邪系列…）。
所以：**删/改示例要跑全量测试 + 重打包**；`test-core.js` 有直接读这些文件的断言，
删了会连带红（历史上删 `弹出菜单.json` / `split2.json` 时就得同步改断言）。

**示例的来源是工作区 `布局/` 文件夹**（20 个入库文件 = 16 布局 + 4 弹出菜单）。
按用户要求做过一次整体替换，映射关系与**不能入库的文件**见 §4.8。

> ⚠️ `布局/` 里有 3 个文件**不是键盘布局**，别当成示例丢进 `examples/`：
> `符号.json` / `表情.json` / `颜文字.json` 的顶层是 `{multiLine, groups}`（符号面板数据），
> 入库会让 `build-examples.js` 直接抛「无法判断示例类型」，体检器则报
> 「layouts 必须是非空对象」。

#### D9 · 每次对齐文档更新，都补测试

测试基线演进：157（首版）→ 275（JSON 修复）→ 215 core + 355 UI → … → 现在 **462 core + 824 UI**。
这个增长不是凑数，而是**每次 skill 文档更新同步一项行为就补一组断言**的累积。
保持这个习惯：改了行为就补测试，别只改代码。

---

## 1. 这个项目是什么

浏览器里可视化编辑 Foxy 输入法键盘布局的纯前端工具：

- **无构建、无依赖、无框架**：`index.html` 直接引 `<script>`，双击即用（`file://` 也能跑）。
- **两份独立文档**：
  - 布局 profile（`foxy.keyboard-layout`）→ 放 `<外部存储>/foxy/frontend/layouts/<name>.json`
  - 弹出菜单（`foxy.popup-profile`）→ 放 `<外部存储>/foxy/frontend/popups/<name>.json`
  - 两者各自导入导出、各自校验；编辑器只把它们放同一个撤销栈与同一份本地草稿。
- **在线站点**：<https://sandyyur.github.io/foxy-see-me/>（GitHub Pages，`main` 分支根目录）
- **格式权威**（已随仓库一起分发，见 `skills/`）：
  - `skills/SKILL.md` — 面向 AI 的**完整格式规范**（Quick Start / 文件位置 / 命名布局 /
    按键与手势 / 内建键名 / 放置覆盖 / 状态变体 / app 命令 / 校验清单 / 常见错误对照表）
  - `skills/foxy-keyboard-layout.schema.json` — 布局 profile 的 JSON Schema
  - `skills/foxy-popup-profile.schema.json` — 弹出菜单的 JSON Schema
  - `skills/foxy-definitions.schema.json` — 共享 definitions 的 JSON Schema

  **怀疑格式语义时先查这里，不要凭直觉改校验/解析。**
  > 注意：这四份是**从工作区 skill 目录（`.dsh/skills/`）同步过来的副本**。上游
  > 更新后需重新同步，不要在副本上直接改规范内容。
  >
  > ⚠️ 上游曾把 `DEFAULT_LAYOUT_V0.0.1.md` + `FOXY_JSON_CONFIGS.md` 两份文档**合并重排**
  > 成一份 `SKILL.md` 并改以 `schemas/*.schema.json` 为准（2026-09）。所以：
  > **不要再引用那两个旧文件名**，规范内容以 `SKILL.md` + schema 为准。

---

## 2. 文件地图（改动前先定位）

```
foxy-editor/
├── index.html        页面骨架：预览面板 + 4 个标签按钮 + 4 个 tabpanel 区块
├── style.css         全部样式（含 ≤640px 手机竖屏优化）
├── js/
│   ├── data.js        内置按键注册表 rime.* / foxy.*、KeyCode 分组、App 命令表
│   │                  导出：BUILTIN_KEYS / KEYCODE_GROUPS / APP_COMMANDS / KEY_TYPES
│   │                        / ICONS / MODIFIERS / MODIFIER_STATES
│   ├── default-profile.js  内置默认布局文本（FE.DEFAULT_PROFILE_TEXT）
│   ├── examples-bundle.js  示例打包产物（**生成的文件，不要手改**）
│   ├── app.js         主体（3600+ 行）：状态 / 解析引擎 / 校验器 / 编译层 / 预览 / 布局编辑 UI
│   ├── folder-import.js 文件夹批量导入：识别 definitions.json 与被引用文件（纯逻辑，无 DOM）
│   ├── key-dialog.js  对话框：按键 / 手势 / 动作 / 变体 / 按键选择器 / jscolor 取色
│   ├── macro-editor.js 「动作与宏」页的图形化编辑（纯逻辑 + UI；**依赖 key-dialog.js，须排其后**）
│   ├── popup-editor.js 弹出菜单编辑（纯逻辑 + 该标签页 UI）
│   └── jscolor/jscolor.js  vendor 取色器（GPLv3，**不要改**）
├── examples/          示例源文件（20 个：16 布局 + 4 弹出菜单；源自工作区 `布局/`）
├── skills/            格式规范（随仓库分发的 skill 文档副本，**只读参考，别改**）
│   ├── SKILL.md                       完整格式规范（面向 AI；含 Quick Start 与常见错误表）
│   ├── foxy-keyboard-layout.schema.json  布局 profile 的 JSON Schema
│   ├── foxy-popup-profile.schema.json    弹出菜单的 JSON Schema
│   └── foxy-definitions.schema.json      共享 definitions 的 JSON Schema
├── AGENT.md           本文件（改前必读；工作区根还有一份副本，见开头「本文件有两份」）
├── tools/
│   ├── build-examples.js      重新生成 examples-bundle.js
│   └── check-agent-sync.js    校验/同步两处 AGENT.md（--write 以外层副本同步）
└── test/
    ├── test-core.js   纯逻辑测试（Node，无 DOM）
    ├── test-ui.js     UI 冒烟测试（Node + 自制 DOM 桩）
    ├── dom-stub.js    极简 DOM 桩（含 jscolor 桩）
    └── check-real-files.js  用真实示例跑体检
```

### 脚本加载顺序（`index.html` 末尾，**顺序有意义**）

```
data.js → default-profile.js → examples-bundle.js → app.js
  → folder-import.js → jscolor/jscolor.js → key-dialog.js → popup-editor.js
```

- `app.js` 的 UI 段在加载时**立刻执行 `boot()`**（初始化标签、工具栏、渲染一次）。
- `folder-import.js` 复用 `FE.sanitizeJsonText` / `FE.normalizeProfile`，**必须在 app.js 之后**加载。
- `key-dialog.js` / `popup-editor.js` 是 IIFE，**加载时自行初始化**（绑事件 + 首次渲染），
  依赖 app.js 已导出的 `FE.h / FE.clearEl / FE.$ / FE.state`。
- 因此：**不要**把 key-dialog.js 或 popup-editor.js 移到 app.js 前面。

---

## 3. 架构约定（照着写就不会错）

### 3.1 app.js 的两段式结构

文件被 `if (typeof document === 'undefined' || !document.getElementById('preview-kb')) return;`
切成两半：

- **上半段 = 纯逻辑**（文件开头 → `FE.hintSizeOf` 导出为止）：无 DOM 依赖，`test-core.js` 直接加载断言。
  改解析 / 变体 / 行权重 / 校验 / JSON 修复时**尽量写在这里**，并补 core 测试。
- **下半段 = UI**：只在浏览器（或有 DOM 桩）时执行。

新增纯逻辑函数时，记得 `FE.xxx = xxx` 导出，否则测试拿不到。

> 本文档提到位置时优先给**函数名/标识符**而不是行号 —— 行号会随改动漂移，
> 用 `Select-String -Path js\app.js -Pattern 'function xxx'` 自己定位最可靠。

### 3.2 状态与渲染

- **唯一状态源**：`FE.state`（app.js 顶部 `var state = { ... }` 一处定义）。新增字段请加注释。
  - `state.profile` 布局文档、`state.popupProfile` 弹出菜单文档
  - `state.status`（composing/ascii_mode/disabled/shift）驱动预览状态变体
  - `state.splitMode` 分体模式；`state.portraitW` 竖屏基准宽度（见 §5.2）
  - `state.compiled` 预览的编译产物（`FE.compileLayout` 结果）。每次 `renderPreview` 重建，
    **是缓存不是事实来源**，随时可丢弃重算（见 §3.3）
  - `state.jsonDirty` 标记布局 JSON 卡片里用户手改未应用的文本
- **渲染入口**：`renderAll()` 依次调
  `renderPreview / renderLayoutTab / renderKeysTab / renderActionsTab / renderJsonTab
   / renderOps / updateUndoButtons / FE.renderPopupTab()`。
  新增一个渲染器就在 `renderAll` 里加一行，用 `if (FE.xxx)` 保护跨文件调用。
- **数据变更必须走 `mutate(fn)`**：它 = 压历史快照 → 执行 → `afterChange()`（重校验 +
  自动存草稿 + `renderAll()`）。直接改 `state.profile` 而不走 `mutate` 会导致撤销失效、
  预览不刷新。
- **撤销栈同时含两份文档**：`snapshot()` 存 `{layout, popup}`，
  `restoreSnapshot` 恢复两者。所以**不要**把 popup 单独塞进另一个历史栈，会互相打架。
- **跨文件调用一律用 `FE.` 前缀 + 存在性判断**：
  ```js
  if (FE.buildPopupKeyEditor) { ... }   // ✅ app.js 调 popup-editor 的写法
  FE.buildPopupKeyEditor(...)           // ❌ 未加载时会抛
  ```

### 3.3 编译中间层（渲染与编辑器共用的纯数据）

`FE.compileSections(sections, status, scope)` / `FE.compileLayout(profile, layoutName, opts)`
把 profile + 状态编译成**纯数据快照（无 DOM）**，渲染器与编辑器都消费它：

- **为什么**：让每个键的引用解析 / 手势摘要 / 提示文字**只算一次**。此前预览、行 chip、
  网格单元格、tooltip 各自 `evalPlacement` 一遍，大布局每次重渲染要重复解析数百次。
- **消费方**：`buildKeyEl(item, unit, opts)`（预览）、`keyChip(item)`（行 chip）、
  `gridEditor`（网格单元格）——它们**只读编译产物，不再自行解析**。新增渲染处请照此接入。
- **按键项字段**：`placement / eff / s,r,k / group / weight / grow / label / hints /
  summaries / isBroken / unresolved / popupKey / lpLabel / holdLabel`。
  其中 `grow` 只取**放置位**的 `weight`（定义链上的 weight 不参与行宽分配，见
  `FE.rowWeights`）；`weight` 则是解析后的有效权重，供检查器展示。
- **索引对齐**：`s` 是区段索引（对应源 `sections` 下标）；网格 `keys[i]` 与源
  `sections[i].keys[i]` **一一对应**——非法项以 `null` 占位而非跳过，否则索引错位。
  区段编辑器与「点击错误定位」都依赖这个对应关系。
- **`opts.noVariants`**：不做布局变体解析。**区段编辑器必须用它**——它编辑的是当前布局的
  `sections` 数组，若跟着变体跳到别的布局，键索引会与编辑目标错位。
- `FE.eachCompiledKey(compiled, cb)` 遍历全部按键项。

### 3.4 解析作用域（scope）——不要临时改写全局 state

解析器（`lookupDef` / `evalKeyRef` / `evalPlacement` / `tapInfo` / `gestureInfo` /
`resolveActionSpec`）都接受**可选末位参数 `scope`**：

- 省略 → 读 `state.profile`（浏览器主路径行为不变）。
- 显式传入 → 完全独立于全局状态；用 `FE.scopeFrom(profile)` 构造。

`FE.validateProfile(profile)` 全程走 `scopeFrom(profile)`，**因此可重入、可并发**，
也不会污染 `state.profile`。历史上的写法是 `state.profile = profile; try{…}finally{恢复}`，
**已移除，不要改回去**：那个 hack 让校验器不可重入，还逼得离线体检脚本自己伪造全局状态。

> 新增解析类函数时，请一并接受并向下传递 `scope`，否则会在校验 / 离线体检路径上读错表。

### 3.5 DOM 构建

统一用 `h(tag, attrs, ...children)`（app.js 的 `function h(tag, attrs)`）：

- `class` / `style`（对象）/ `dataset` / `onclick` 等事件 / `title` 都支持。
- **`null` / `undefined` / `false` 会被跳过**：这是布尔属性的正确写法
  （写 `selected: false` 仍然算"属性存在"，所以框架跳过了；要取消就传 `null`）。
- 子节点可以是字符串（自动包 TextNode）或数组。

`clearEl(el)` 清空子树；重渲染前必须 clear，否则元素会重复叠加。

---

## 4. 各功能模块的落点

### 4.1 引用解析引擎（app.js 上半段，**优先级规则最容易改错**）

| 函数 | 作用 |
|---|---|
| `lookupDef(name)` | 查用户 keys，再查 `FE.BUILTIN_KEYS` |
| `mergePatch(target, patch)` | 合并补丁，处理 `swipe` / `hintTextSize` / `colors` 的按方向合并与 `null` 语义 |
| `variantMatches(when, status)` / `applyVariants` | 状态变体匹配与应用 |
| `evalKeyRef` / `FE.evalPlacement` | 解析引用链 → 有效按键对象 `{eff, chain, unresolved, cycle}` |
| `FE.gestureInfo` | 手势 → `{label, action, popup, repeat, popupKey, start, end}` |
| `FE.rawLabelOf` / `displayLabel` | 标签取值（后者叠加 Shift） |

**优先级（文档已修订，务必按新规则）**：

```
定义链（含定义变体） < override 变体与字段 < 直接放置字段（含放置变体）
```

⚠️ 早期文档写的是「直接字段 < override」，**已反转**。改这一块前先看 `FE.evalPlacement`
上方的注释与 `skills/SKILL.md` 的 `## Placement Overrides` 一节。

**label 优先级**：`tap` 对象自带 label > 外层 key/variant label > 被引用 tap 的 label。
外层 label 显式为 `null` → 清空为空字符串，**不再回退**到被引用按键的标签。

**`null` 语义**（`mergePatch` 里逐条实现，别漏）：

- `label: null` → 空字符串；`weight/height: null` → 恢复 1
- `popup: null` → `false`；`action/actions: null` → 空列表
- **`tap: null` 是例外** → 保留继承的点击动作（不覆盖）
- `swipe: {up: null}` → 删掉该方向的继承

### 4.2 校验器（app.js 的 `FE.validateProfile`）

实时跑，结果显示在预览下方 `#preview-meta`。已覆盖：

- ref 引用链解析（含循环）、每个按键必须有 `tap`、`hold` 与 `longPress` 互斥
- `weight:"auto"` 行必须有足够 `totalWeight`
- 网格越界/重叠（空格子只警告）
- 布局变体目标存在且无循环；各布局总高度一致性（警告）
- **`split` 分体片段独立校验**（用 `validateSectionsArr(sections, ln, isSplit=true)` 复用）
  + 常规/分体高度单位一致性警告
- **`text_editor` 布局**：必须恰好 1 个 rows 区段、恰好 1 行，否则报错（Foxy 会回退内置编辑行）
- 动作类型/字段/引用（`validateAction`）、宏步骤引用、`checkGestureRefs`

#### 有意保留的偏差：`action` 允许写成数组

新版 `skills/SKILL.md` 说「单数 `action` 字段只含一个动作表达式，**不得**含数组；
空动作序列请用 `actions: []`」。但本仓库 **9 个示例布局正在用 `action: []`**
（`cangjie.json` / `cc lite.json` / `layout-variant.json` 等，都是可用的真实文件）。

因此 `checkGestureRefs` **继续接受**数组形式的 `action`（空数组与非空数组都校验内部元素）：

- 若判为 `err`：这些既有示例会立刻报错；而它们在实际 Foxy 上能用，属误报。
- 若判为 `warn`：`test-core.js` 的 `eq(ccv.warnings, [], 'cc lite.json 校验无警告')` 会红，
  且给可用文件加噪音提示，违背 D7「宁可少报，不要乱报」。

**结论：不改行为。** 想改这一条时必须同时处理那 9 个示例与上述断言，别只改校验器。

加校验时：**错误用 `err(...)`，可疑但合法用 `warn(...)`**。消息里带上布局名/区段/行号，
现有消息格式是 `布局 “xxx” 区段 1 行 2 按键 3 ...`，保持一致。

#### 结构化 issue 与「点击定位」

`FE.validateProfile` 返回 `{ errors, warnings, issues }`：

- `errors` / `warnings` 是**字符串数组**（历史 API，40+ 处旧断言依赖，**不要改**）。
- `issues` 是**等长的结构化版本**——每条带 `level / message / path`，以及可定位坐标：
  `code`（如 `unresolved-ref` / `no-tap` / `grid-overlap` / `hold-longpress`）、
  `layout`、`isSplit`、`sectionIndex`、`rowIndex`、`keyIndex`、`group`。

坐标由 `err/warn` 自动从**当前定位上下文**带上：

- `inCtx({...}, fn)` 进入区段 / 行 / 按键时设置 `ctx`（可嵌套：区段 → 行 → 按键）。
- 显式传入的 `loc` **只覆盖它写出的键**，其余沿用 `ctx`（`Object.assign({}, ctx, loc)`）。
  早期实现是 `loc || ctx`，导致在 `checkPlacement` 里写 `err(msg, {code:'no-tap'})`
  会把坐标整块丢掉——**改动时保持合并语义**。

UI 侧：`appendValidationDetails` 把可定位条目渲染成可点击项，
`FE.issueLocatable(it)` 判断能否定位，`FE.locateIssue(it)` 切布局 / 切分体 → 选中目标键 →
滚动到它（`scrollToSelection` 靠 `__chipLoc` / `__gridKey` 找节点，并展开所在卡片）。
新增校验规则时**顺手带上 `code` 与坐标**，定位能力才覆盖得到。

⚠️ **「校验详情」折叠块的展开态要存进 `state.metaDetailsOpen`**：
`renderMeta()` 每次都 `clearEl` 重建整个 meta（含这个 `<details>`），
而点条目定位走的是 `locateIssue → renderAll → renderMeta` —— 不记住展开态的话，
用户每点一条错误详情就被收起，想连着看下一条得反复展开（用户报告的缺陷）。
所以重建时按 `state.metaDetailsOpen` 回填 `open`，并挂 `toggle` 同步回 state。
同理：**任何被 `clearEl` 重建的折叠块都要这样处理**，别只在 DOM 上留着 `open`。

### 4.3 预览渲染（app.js 的 `displayLabel` → `renderMeta` 一段）

渲染**吃编译产物**（见 §3.3）：`buildKeyEl(item, unit, opts)` 渲染单个键，
`buildRowsSection(compiledSection, unit)` / `buildGridSection(compiledSection, unit)` 渲染区段，
`renderCompiledInto(host, compiled, unit)` 组装进容器。

**不要在这些函数里重新 `evalPlacement`** —— 引用解析、手势摘要、提示文字都已在编译期算好。
tooltip 由 `itemTooltip(item, shift)` 生成（读 `item.summaries` / `item.hints`），
不是从原始 placement 现算。

角标含义（`index.html` 有图例，改样式时同步改图例文字）：

- 右上蓝 `kb-badge-lp` = `longPress.label`
- 右上橙 `kb-badge-hold` = `hold.label`
- 底中绿 `kb-badge-popup` = 存在 `longPress.popupKey`（⌄）
- 四角 `kb-hint-up/down/left/right` = 滑动提示
- `kb-key-broken` = 引用无法解析；`kb-key-sel` = 选中

颜色：`applyKeyColors(el, eff, pressed, status)` 处理 `text/background/border/shadow/pressed`
与 `states.{modifierActive,modifierLocked,pressed}.{background,text,shadow}`，
优先级 `modifierActive < modifierLocked < pressed`；按下或修饰激活时默认 `box-shadow: none`，
只有该状态显式给了 `shadow` 才画。`applyHintColors` 处理 `hint` + 四边 `hintTop/Bottom/Left/Right`。
`applyKeyColors` / `displayLabel` 的 `status` 参数可省略（回落 `state.status`），
但**显式传入才能对任意状态渲染**（无头测试 / 将来的导出）。

### 4.4 拖动排序（app.js 的「指针拖动（鼠标 + 触屏统一）」一段）

**不要改回 HTML5 拖放**。原生 `draggable` 在移动端触摸不触发，这里统一用 Pointer Events：

- `attachPointerDrag(el, {dropTarget, onDrop, onStart})` 通用绑定；
  位移 < 6px 视为点击（打开编辑对话框），超过才进入拖动。
- 行内 chip：`chipDropTarget` + `performChipDrop`（命中 chip 插其前 / 命中行容器追加末尾）。
- 网格：`gridDropTarget` + `performGridDrop`。
- 拖动结束后 250ms 内屏蔽 click（`pointerDragSuppressClick`），避免松手误开对话框。

落点依赖 `document.elementFromPoint`，**在 DOM 桩里测不了**，所以
`performChipDrop` / `performGridDrop` 被单独导出供测试直接调用数据层。

#### ⭐ 网格编辑器的渲染护栏按「节点数」计，不按网格面积

`gridEditor` 的护栏常量是 **`FE.MAX_GRID_CELLS`（= 4000）**，且它统计的是
**真正会生成 DOM 的单元格数**：按键起点格 + 未被跨距键覆盖的空格。
**覆盖格（被跨距键 span 到的格子）既不加节点、也不占额度**。

历史 bug（别再改回去）：原实现是逐格判 `ry * cols + cx >= 400`，**按网格序号截断**。
对大跨距键盘这是错的 —— 键盘面积大 ≠ 渲染量大：

> 真实案例 `cc_grid_4.json`：48×15 = 720 格，但跨距键（3×3 / 4×3 / 8×3 / 24×3）
> 覆盖掉 526 格，实际只需 194 个节点。旧写法在序号 400 处斩断，**丢掉 58 个按键**
> （第 8 行起整排 `gedit` 单元格消失），用户在编辑器里根本点不到、改不了这些键。

两条推论：

- **别用 `columns * rows` 判断要不要警告**（那正是误报的来源）。只在
  `skipped > 0` 时提示，且提示文案要说清是「可编辑格」数而非网格面积。
- 提高上限**不会**带来渲染压力：跨距键越多，覆盖格越多，节点数反而越少。
  4000 已远高于任何正常布局，只拦病态输入（如 `columns: 10000`）。
  控制台改 `FE.MAX_GRID_CELLS` 后 `FE.renderAll()` 即可生效。

`test-ui.js` 有专门的 **「回归：大网格不按『网格序号』截断」** 区块锁定这个行为：
48×15 网格里放进序号 ≥400 的按键断言其必须渲染，再临时压低上限验证护栏仍能生效。
**改了这段渲染逻辑，先怀疑自己，别去改那组断言。**

#### ⭐ 网格预览的间距与字号必须随格子尺寸缩放（别写死 5px / 18px）

**这是与上一节完全独立的另一条渲染路径**：`buildGridSection`（预览）≠ `gridEditor`
（网格编辑器）。改了一个不会影响另一个 —— 排查「大网格显示异常」时先分清是哪条路径。

`FE.gridMetrics(columns, rows, unit, totalUnits)` 算网格几何，供 `buildGridSection` 使用：

- **间距不能固定 5px**。CSS 里 `.kb-grid { gap: 5px }` 对 5 列的 numpad 没问题，
  但 48 列时 47 个 5px 间隙合计 **235px，吃掉可用宽 414px 的 57%**，单元格被压到
  **3.73px** 宽；而字号由 `unit` 决定、仍有 **18px**（= 格高的 1.9 倍）→ 文字溢出
  键框、上下压叠，整块预览糊成一团。用户反馈的「大网格把预览撑爆」就是这个。
  现在让间隙总占用 ≤ 可用宽/高的 10%（上限仍是 5px，**小网格外观零变化**）。
- **字号要按每个键自己的跨距封顶**（`fontCap` 经 `opts.fontCap` 传给 `buildKeyEl`）。
  3×3 大键的可用面积是 1×1 小键的 9 倍，若统一按 1×1 封顶，大键的字会小得离谱。
- `opts.fontCap` 省略时是 `Infinity` → `capFont` 不生效，**行区段行为完全不变**；
  `tight`（提示/徽标的内缩）也只在网格预览输出行内定位，行布局不写任何定位。

> 数值参考（`cc_grid_4.json`，48×15，unit=43）：修复前 cell 3.73×9.67 / gap 5px /
> 字号 18.1px；修复后 cell 7.76×12.90 / gap 0.88×1.54px / 字号 6.2px(1×1)~18.1px(3×3)。
> 逐键核对「字号 ≤ 该键键框较短边」全部通过。

锁定断言在 `test-ui.js` 的 **「回归：大网格预览的间距与字号自适应」** 与
`test-core.js` 的 `FE.gridMetrics` 一组；其中「每个键的字号不超过自身键框」是核心不变量。
**别退回固定 gap / 固定字号。**

### 4.5 对话框（key-dialog.js）

#### ⭐ 关闭语义：`close()` vs `requestClose()`（别混用）

`openModal` 返回 `{el, body, toolbar, close, requestClose, leaveThen}`，**两种关闭语义刻意分开**：

| 方法 | 用途 | 是否问「有未保存改动」 |
|---|---|---|
| `close()` | **程序化收尾**：保存成功、删除成功、跳转前已确认 | ❌ 不问，直接关 |
| `requestClose()` | **用户主动关闭**：点遮罩 / Esc / 「取消」按钮 | ✅ 有改动先弹确认框 |
| `leaveThen(fn)` | 跳转类按钮：拿到许可再 `fn()`（内部先关框再跳） | ✅ 同上，但**无改动时同步执行** |

历史 bug（别再改回去）：点遮罩的处理器直接 `close()`，用户辛苦改的内容**静默丢弃**。
现在点遮罩与 Esc 都走 `requestClose`；Esc 必须 `preventDefault()`（`<dialog>` 默认会自己关掉）。

**改动检测**（`key-dialog.js` 顶部）：

- `FE.stableJson(v)` —— **与键序无关**的稳定序列化。重建表单会重排键序，直接用
  `JSON.stringify` 会把「没改」误判成「改了」，用户被白弹确认框。
  单独编码 `undefined`：它与 `null` 是两种语义（继承 vs 显式清除），必须能区分。
- `FE.snapshotGuard(snapFn, opts)` → `{onBeforeClose, reset, hasBaseline}`。
  `snapFn()` 返回**原始值**，`reset()` 在建好表单后记基线。

⚠️ **三个坑**（都踩过，测试能抓住）：

1. **别双重编码**：`snapFn` 里不要再 `stableJson` —— 守卫内部会做，重复序列化后
   两边永不相等，「没改」被判成「改了」（test-ui 的「跳转到弹出菜单页」断言曾因此变红）。
2. **无改动必须同步放行**：`onBeforeClose` 返回 `true`（同步）而非 `Promise`，
   否则跳转类操作被推迟一帧，用户看到「点了没反应」。
3. **`reset()` 必须容错**：它在对话框刚建好、工具栏还没接上时调用，快照函数抛错
   会把打开流程整个打断（用户看到半截对话框）。宁可少拦，不锁住用户。

已接入守卫的弹框：主按键对话框（含改名）、手势、状态变体、原始 JSON（按键/步骤/动作）、
弹出菜单候选。**新增编辑类弹框时务必接上**，否则它又会静默丢弃改动。

> 测试注意：DOM 桩**不会**像真实浏览器那样在点遮罩时让输入框失焦 → 触发 `change`，
> 所以测试要显式 `input.value = x; input._fire('change')`（见 `test-ui.js` 的 `typeInto`）。
> 只改 `.value` 不 fire，`draft` 并未更新，守卫看不到改动是**正确**行为。

- `openModal({title, wide})` → `{el, body, toolbar, close}`；`FE.openModal` 已导出。
- `FE.openKeyDialog({mode:'placement'|'definition', placement?, name?, location?, grid?})`
  主对话框，内部 `buildForm()` 重建整个表单（任何局部改动想立即反映 → 调 `buildForm()`）。
  折叠 section 顺序（**7 个**，改顺序要同步这里）：
  **基本信息 → 手势 → 状态变体 → 按键颜色覆盖 → 高级颜色 → 高级 → 弹出菜单**
  - 「按键颜色覆盖」是 4 个常用角色；「高级颜色」（`color-adv-card`）含 `shadow` / `pressed` /
    `hint` 四边，以及 `pressed` / `modifierLocked` / `modifierActive` 三个 `states` 子卡。
  - 最后一个「弹出菜单」是内嵌的 `FE.buildPopupKeyEditor`（见 §4.6）。
- `FE.openGestureDialog` / `FE.openVariantDialog` / `FE.openKeyPicker` / `FE.buildActionEditor`。

#### `FE.buildActionEditor(spec, opts)` —— 唯一的动作编辑器（三处共用）

**所有「需要一个动作」的地方都复用这一个组件**：按键手势、动作定义列表、宏的每一个步骤。
原作者的明确要求：*「每步是一个 action，你可以抽象 action 编辑器」* —— 因此**不要**在宏那边
另造「步骤类型」这一层，宏的每一步就是一个 `actionExpression`。

`spec` 接受完整的动作表达式形态：

| 传入 | 识别为 | 类型下拉选中 |
|---|---|---|
| `"word.left"`（字符串） | 引用已命名动作 | `ref` |
| `{ action: "word.left" }` | 同上（内联包装） | `ref` |
| `{ action: { type:'key',… } }` | 内联动作 | 按内层 `type` |
| `{ macro: "m" }` | 宏调用 | `macro` |
| `{ type:'key',… }` | 直接动作 | `key` |

`opts`：

- `allowRef: true` —— 提供「引用动作名」选项（宏步骤与动作定义都需要；**按键手势不需要**）。
- `exclude: ['macro']` —— 隐藏某些类型。宏步骤必须传它：文档明确说嵌套宏在转换步骤时会被丢弃。
- `onChange()` —— 任一控件改动或切换类型后回调。**控件是每次 `buildFields()` 新建的**，
  所以调用方不用自己找控件绑事件，直接用它写回即可。

`getValue()`：引用形态返回**字符串**，其余返回对象，空则 `null`（调用方据此避免写回空值）。

#### `FE.uiAlert` / `FE.uiConfirm` / `FE.uiPrompt` —— 唯一的提示/确认/输入框 ⭐

**不要用浏览器 `alert` / `confirm` / `prompt`**（用户明确要求，且它们阻塞主线程、移动端表现不一致、
测试里只能打桩成"永远点确定"等于没测）。三个入口都在 `key-dialog.js`，基于 `openModal`，**Promise 化**：

```js
await FE.uiAlert('内容');                                   // → void
var ok = await FE.uiConfirm('删除？', { danger: true });     // → boolean
var name = await FE.uiPrompt({ title, message, value, placeholder, required });  // → string | null（取消）
```

- `opts`：`{ title, message, okLabel, cancelLabel, danger }`；`uiPrompt` 另有
  `{ value, placeholder, required, validate(v)→错误文字|null }`。
- `message` 里的 `\n` 会拆成多行显示（老代码的提示常带换行）。
- `uiPrompt` 的校验失败**就地显示红色错误文字**（`.ui-dialog-error`）且不关对话框，
  比"再弹一次提示"友好。打开即聚焦输入框，回车提交。
- ⚠️ 调用方事件处理器要写成 `async function () { ... await ... }`。
  **`test/test-ui.js` 把 `global.alert/confirm/prompt` 改成了抛错**，
  任何回退到浏览器弹窗的代码都会被测试立刻抓住。
- ⚠️ 三个入口的按钮 class 是 `ui-dialog-ok` / `ui-dialog-cancel`，
  测试的 `uiOk()/uiCancel()/uiReadAlert()` 助手靠它们定位，**改名要同步测试**。
- 测试里要**像用户一样去点这些弹窗**（见 `test-ui.js` 顶部的驱动助手），不要给 global 打桩。
  因此 `test-ui.js` 的主体整体包在 `async main()` 里（文件是 CommonJS，**不允许顶层 await**）。

- **jscolor 取色（`FE.installJscolor` 一段，踩过坑，改前必读该段注释）**：面板必须挂进最近的 `<dialog>`
  并对输入框做 `position: fixed`，否则被 `dialog` 与 `::backdrop` 盖住表现为"点了没反应"；
  `new jscolor` 必须在元素进入 DOM 之后，未挂载时惰性安装
  （`FE.installPendingColorPickers(root)` 可在挂载后补装）。
  **颜色字节序**：本仓库 vendor 版 jscolor 的 hexa 约定是
  `#BBGGRR`（不透明）/ `#AABBGGRR`（带透明度），**不是** 标准 CSS 的 `#RRGGBBAA`。
  转换必须走 `FE.argbToPickerHex` / `FE.pickerHexToArgb`，自己写会串色。
  `dom-stub.js` 里的 jscolor 桩刻意照抄了这个字节序，测试才能验出来。

### 4.6 弹出菜单（popup-editor.js）

- 纯逻辑：`normalizePopupProfile` / `popupSchemaName` / `serializePopupProfile` /
  `popupCandidateLabel|Summary|Kind` / `validatePopupProfile` / `popupCandidates`。
- **状态回退链**（`FE.popupCandidates`，改前对照文档）：
  `schema[state] → schemas.default[state] → schema.normal → default.normal`；
  `null` 表示显式清除该状态。
- **候选类型**：字符串（上屏文本）/ 对象 `{label?, action}`（action 可为动作名或动作对象）
  / `{label?, macro}` / `{label?, ref}`（宏与共享键在 `definitions.json`，只提示不校验）。
- **共用渲染体 `FE.buildPopupKeyEditor(schemaName, pk, {onChanged})`**：
  返回 `{host, hasAny}`，host 里是「常规 / Shift」两行候选编辑。
  **标签页键卡片与主按键对话框的"弹出菜单" section 都用它**，保证两处同构 —— 
  改候选编辑 UI 只改这一处即可。
- 布局联动：`collectLayoutPopupKeys()` 收集布局（含 split 片段）里用到的所有 popupKey，
  支持"一键补齐"当前 schema 缺失的键。
  - ⚠️ 返回值是 `{ popupKey: [{ label, loc }] }`（**对象数组**，不是字符串数组）：
    这样才能给「使用数」弹窗提供跳转坐标 —— 布局按键给布局坐标（`locateIssue` 用），
    按键定义给 `{ defKind:'key', defName }`（`jumpToDef` 用）。
    只要标签时用 `FE.popupUsageLabels(refs)`，**别再直接 `join`**。
- ⭐ **键卡片与另三张列表同构**（用户要求）：默认**全部折叠**、带「使用 N」跳转按钮、
  支持搜索。用 `FE.collapsibleDefItem`（app.js 导出）而不是自己写 `<details class="card">`：
  - 折叠 + **懒建**是必须的：气泡示例 26+ 个键、每键两个状态行，全量建出来会白烧 CPU
    （同 §4.10 的性能陷阱）。收起时正文被销毁。
  - 展开态记在 `state.openPopupKeys`（`FE.ensureOpenSet('openPopupKeys')`）。
  - 该组件对弹出菜单要传这几个**专用 opts**（都已支持，别再各写一份 DOM）：
    - `extraClass: 'popup-key-card'` —— 测试与样式靠它挑出这类卡片；
    - `usageKind: null` —— **不挂 `data-usage-kind`**。它的「被引用」数据源是
      `collectLayoutPopupKeys`（哪些布局用了这个 popupKey），**不是**引用索引；
      挂了 `data-*` 会被 `refreshUsageLabels()` 拿引用索引覆写成错数字。
    - `onUsage` —— 自己拼 `popupUsageOf(refs)` 并调 `FE.showUsageDialog`；
    - `onDelete` —— 删除的是 `popupProfile.schemas[...]`，不是 `state.profile[section]`。
- 搜索（`#popup-filter`）：匹配文本 = popupKey + 各候选的 `popupCandidateLabel` /
  `popupCandidateSummary`，所以「搜 q」命中键名、「搜 ā」命中把它当候选的键。
  接线复用 `FE.wireSearch`（见 §4.12）。
- ⚠️ **`FE.jumpToPopupEditor(popupKey)` 必须清过滤 + 展开目标卡片**：
  键列表现在默认折叠、且可能正被搜索过滤，不清不展的话跳过来只看得到一排收起的
  摘要行（甚至目标被筛掉），用户会以为「点了没反应」。与 `jumpToDef` 同一套路，
  清过滤后同样要 `FE.syncSearchClear('popup-filter')`。
- 预览模拟按键的标签：`findMockEff` 拿布局里第一个用该 popupKey 的按键的 eff，
  **按 `state.popupShifted` 套 `shiftedLabel` / 单字母转大写**（与键盘预览同规则）；
  候选气泡用的是 `popupCandidates(..., shifted)`。两者是独立逻辑，别混。

### 4.7 JSON 宽松导入与一键修复（app.js 的 `FE.inspectJsonText` / `FE.sanitizeJsonText` / `fixJsonText`）

**这是有意为之的设计，不要"改回严格"**：

- `FE.inspectJsonText(text)`：**单遍字符串感知扫描**，产出
  `{issues:[{kind,label,count,lines,positions}], total, fixedText, parseOk, parseError}`。
- `FE.sanitizeJsonText(text)`：只取 `fixedText` 的封装。
- 能修：UTF-8 BOM、尾逗号、`//` 与 `/* */` 注释、单引号字符串、未加引号的键名、全角标点。
  **字符串内部内容一律原样保留**；ASCII `"` 开启的字符串只由 ASCII `"` 闭合
  （内部全角引号当内容），全角引号开启的字符串由全角或 ASCII 闭合。
- 修完仍解析不了 → 如实报错，**不给假绿灯**（`fixJsonText` 里重新 `parseOk` 复检）。
- 透明性靠"明确告知修了几处、在哪几行"，不靠拒绝读取。
- 改这块后**一定要跑 core 里 `inspectJsonText` 那组断言**（含引号边界、全角、注释用例）。

### 4.8 示例打包（tools/build-examples.js）

- 读 `examples/*.json`，按内容判断 `kind`：`foxy.popup-profile` → `popup`，否则 `layout`；
  生成 `FE.EXAMPLE_FILES`（文件名 → 文本）与 `FE.EXAMPLE_META`（文件名 → `{kind, desc}`）。
- 布局页与弹出菜单页的示例下拉**各自按 kind 过滤**，所以新增示例只需丢进 `examples/`
  再跑一次脚本，不用改 UI 代码。
- 改了 `examples/` 里的任何文件后**必须**跑：
  ```
  node tools/build-examples.js
  ```
  否则页面加载的还是旧内容。
- `examples-bundle.js` 是生成物，**不要手改**（会与 `examples/` 失同步）。
- 默认布局也由本脚本顺带产出：`examples/layout-variant.json` → `js/default-profile.js`。
  **换掉 `layout-variant.json` 等于换掉编辑器的内置默认布局**，别无意中动它。

#### 示例源 = 工作区 `布局/`（映射与排除项）

`examples/` 是工作区 `布局/` 的镜像（按用户要求做过整体替换）。映射规则与注意点：

| 工作区 `布局/` | → `examples/` |
|---|---|
| 顶层 `*.json` | 同名保留 |
| `思无邪@foxy/layouts/X.json` | `X.json`（如 `思无邪.json`）|
| `思无邪@foxy/popups/X.json` | `X-popup.json`（如 `气泡.json` → `气泡-popup.json`）|

**排除项（不要入库）**：

- `符号.json` / `表情.json` / `颜文字.json` —— 顶层 `{multiLine, groups}`，是符号面板数据，
  **不是** keyboard-layout（入库会让本脚本与体检器双双报错）。
- `简易/`（`definitions.json` + `layouts/*.json` + `popups/*.json`）—— **分包**，
  薄布局单独校验有 1.6 万个「ref 无法解析」，必须与 `definitions.json` 合并才有效。
  它保留在工作区里作为「多文件包导入」的实测语料（见 §4.9 / test-core 的 `布局/简易` 用例），
  **不要**拆成单文件塞进 `examples/`。

> 历史：`examples/split.json` 已被 `布局/split2.json` 取代（split2 是超集：
> 多 `cangjie5` 的 split 片段与 `text_editor` 布局，布局数 3 → 4）。
> 同步时 `test-core.js` / `test-ui.js` 里对 `split.json` 的硬引用、
> 以及「布局 pill 数 = 3」的断言都已改为 4 —— 这类计数断言会被示例替换连带打破，**要一起改**。

### 4.9 多文件布局包导入（folder-import.js）⭐ 单入口，别退回单文件假设

**为什么存在**：Foxy 运行时的布局包是**跨文件**的 —— `frontend/definitions.json` 放共享
`keys/actions/macros`，而 `frontend/layouts/<profile>.json` 往往只定义寥寥几个自己的键，
其余全引用共享定义（真实例子：工作区 `布局/简易/layouts/simple.json` 自带 8 个键、
引用外部 185 个键 + 34 个宏）。

**单文件模型必然误判**：`test/check-real-files.js` 直接跑 `simple.json` 会报
**16211 个错**（`qwerty.q` / `nav.space` 等“ref 无法解析”），但把 definitions 合并后
是 **0 错**。所以「ref 无法解析」在分包布局里**不是真实缺陷**，是缺合并。

- **入口是唯一的**：只有一个「导入 JSON」按钮（`op-import` → `#op-import-file`，
  **不要**再加第二个「导入文件夹」按钮 —— 用户明确要求单入口）。同一个入口按输入自动分流：
  1. **选中多个文件** → 当作一个小型布局包，直接走 `importPackage()` 合并；
  2. **选中 `definitions.json`** → 它自己不是布局，`requestFolderPick()` 尽力自动接一步
     选文件夹，并显示 `#op-folder-hint` 醒目提示行；
  3. **选中薄布局文件**（导入后仍有 `unresolved-ref`）→ 同样显示提示行，说明引用解析不了
     是因为共享定义在同文件夹；
  4. **选中自包含布局 / 弹出菜单文件** → 走原来的单文件 / 路由到弹出菜单页逻辑。
  ⚠️ **平台限制（决定了为什么必须由用户再选一次文件夹）**：浏览器只把用户**选中的那些
  文件**交给网页，`File` 对象**不携带所在目录信息**，所以「仅凭选中的文件反推同目录」在
  Web 上做不到。选目录只能靠 `webkitdirectory`（纯前端约束下唯一方式，`D3`：无依赖、
  `file://` 可用）。读文件走 `readFileText()`（FileReader 的 Promise 封装），**不引入 fetch**。
  ⚠️ **`requestFolderPick()` 只是 best-effort，不可依赖**：浏览器把「用户激活」消耗在第一次
  文件选择上了，紧接着程序化 `click()` 打开文件对话框**常被 Chrome 静默拦掉**，外部表现就是
  「点了没反应」。所以：
  - **提示文案绝不能承诺「正在自动读取同文件夹」** —— 被拦掉时就成了假承诺。要写清
    「还需选择一次布局包所在的文件夹」，并解释原因（浏览器不透露目录）。
  - 真正的兜底是提示行里那个高亮按钮 `#op-folder-complete`（`class="mini-button attention"`）。
  - 有 UI 断言锁定这两点：文案含「还需选择一次」「浏览器不会透露」，且**不含**「正在读取同文件夹」。
  `#op-import-dir-file` 因此是**隐藏的**，只由代码触发，不作为独立入口露出。
  > 最省事的用法是一次多选（`definitions.json` + 布局 + 弹出菜单），不依赖任何自动接续。
- **纯逻辑（可单测，core 有断言）**：
  - `FE.classifyFoxyFile(text, path)` → `layout` / `popup` / `definitions` / `unknown`。
    判定优先级：**显式 `type` > 目录约定（`layouts/`、`popups/`、文件名 `definitions.json`）
    > 结构特征（有 `layouts` 无 `schemas` 等）**。向后兼容：无 `type` 的文件靠后两级认出来。
  - `FE.mergeDefinitions(profile, definitions)` → 合并共享定义，**布局自身同名项覆盖共享项**
    （对齐文档 “merge their own definitions over the shared names”）。不动入参。
  - `FE.collectPopupKeys(profile)` → **整树递归**收集 `popupKey`（keys 定义与放置点 override
    都要收）；`FE.collectPopupSchemaKeys(popup)` 收集弹出菜单已定义的键。
  - `FE.matchPopupFile(layoutProfile, popupEntries, layoutName)` → 挑覆盖 popupKey 最多的
    弹出菜单文件；**覆盖数并列时优先同名词**（`simple.json` ↔ `simple.json`），
    覆盖数为 0 返回 `null`（该布局不用弹出菜单）。
  - `FE.planFolderImport(entries)` → 分类归集 + 多个 definitions 取路径最浅者 + 错误/警告。
  - `FE.buildProfileFromPlan(plan, layoutPath)` → 产出可直接装入编辑器的自包含 profile。
- **UI 侧**（app.js 的 `initToolbar` 文件操作段）：
  - `filesToEntries(files)` 批量读文件；`readFileText(file)` 单个 File → 文本（Promise）。
  - `importPackage(entries, pickName)` 整包装入（选 default.json 优先）；`importFromDirectoryInput(input)`
    读目录输入框并整包识别。
  - `loadFromFolderPlan(plan, layoutPath)` 装入 + 自动关联弹出菜单。
  - `renderFolderOps()` 在 `renderOps()` 里被调用（每次 `renderAll()` 都跑），渲染
    `#op-folder`（包内布局下拉，可切换）/ `#op-folder-report`（识别结果、缺失 popupKey、warning）
    / `#op-folder-hint`（补选文件夹提示行）。
  - 状态字段：`state.folderPlan` / `state.folderDefs` / `state.folderLayoutPath` / `state.folderHint`。
  - ⚠️ **提示行是派生渲染**：`showFolderHint(msg)` / `hideFolderHint()` 只写 `state.folderHint`，
    显隐交给 `renderFolderOps()`。**不要**在别处直接改 `#op-folder-hint` 的 `hidden` ——
    那样在「先导入薄布局显示提示、再加载示例」时会残留一条过期提示。
- **导出还原（关键，别漏）**：合并后编辑器持有的是自包含 profile，**不能原样存回**
  ——否则布局文件里会多出 205 个键。`exportLayoutText()` 走 `FE.splitProfileForExport()`：
  把**与共享定义逐字节相同**的项剥离回 `definitions.json`（`op-export-defs` 按钮单独导出），
  **被用户改动过的项保留在布局文件里**（否则引用会断）。导出往返后重新合并仍 0 错。
- ⚠️ **`applyProfileText` 会清空 `state.folderPlan/folderDefs/folderLayoutPath/folderHint`**：
  单文件导入 / 示例 / JSON 页应用都是「自包含单文件」语义，残留旧包上下文会让导出错拆。
  这条有 UI 断言锁定（「单文件导入清空文件夹上下文」）。
- 已知取舍：
  - 不解析 `switch_layout` 目标与 `popupKey` 的语义关系（只按名字匹配）；
    definitions 只取一个（多份时按路径层级选，其余告警）。
  - **文件夹上下文不进本地草稿**（`autosave` 只存 `state.profile` 等）。
    所以刷新页面后 `state.folderDefs` 为 `null`：布局仍是**自包含且有效**的
    （合并后的 profile 已存进草稿），只是导出时不再剥离回分包结构。
    这是刻意的——`folderPlan` 含全部文件原文，塞进 localStorage 体积过大。
    要恢复分包导出，重新用「导入 JSON」选中 `definitions.json`（或整包多选）一次即可。

### 4.10 动作与宏的图形化编辑（macro-editor.js）⭐ 每步就是一个 action

**背景**：这一页原先只是把 JSON 塞进 `<textarea>`（`app.js` 的 `jsonTextarea`），本质仍是手写
JSON，谈不上 GUI。用户明确要求仿参照项目 f5a-see-me 的做法：**鼠标、下拉框、点选**。

**核心抽象（原作者的要点）**：*「每步是一个 action，你可以抽象 action 编辑器」*。
所以**没有**「步骤类型」这一层——宏的每一步就是一个 `actionExpression`，直接复用
`FE.buildActionEditor`（见 §4.5）。宏编辑器只负责「一行一步」的外壳：序号、增删、排序、逃生口。
**不要把「引用动作名 / 直接动作」做成两个下拉二选一**，那是把抽象又拆回去了。

- **纯逻辑（core 有断言）**：
  - `FE.macroStepToDraft(step)` → `{ spec, form, raw, readonly?, reason? }`。
    `form` 记住原写法（`bare` 裸字符串 / `wrapped` `{action:名}` / `inline` 对象），
    **往返稳定**：没改过的步骤原样写回，不因「打开一次」就改写用户文件。
    控件覆盖不到的写法（`{macro:名}`、`actions` 数组、非对象）标为 `readonly` 并给 `reason`，
    只读展示 + 引导用「原始 JSON…」，**绝不静默改写**。
  - `FE.macroValueToStep(value, form)` / `FE.macroStepsToDrafts` / `FE.describeMacroStep(s)`
    / `FE.moveMacroStep(steps, from, to)`（拖动与 ▲▼ 共用的数据层）。
- **UI**：`FE.buildMacroStepEditor(steps, {commit})` → `{el, getValue, getDrafts, getValues}`；
  `FE.buildActionDefEditor(name, spec, {commit, onReplace})` → actions 列表用，同一个动作编辑器。
- ⚠️ **持久化契约**：控件改动走 `opts.commit(...)`，由 `app.js` 的 `commitActionEdits()` **静默**
  写回（只压历史 + 重校验 + 刷新 JSON 文本），**不调 `afterChange()/renderAll()`**——
  否则每选一次下拉就重建整个列表，正在操作的控件会被销毁、焦点丢失。
  只有结构性改动（增删/换形状）才走 `mutate()`。
- ⚠️ **不要闭包捕获渲染时的对象**：撤销 / 导入会整块替换 `state.profile`，
  所以 commit 回调里要**实时**取 `state.profile.actions[n]`，别用渲染那一刻的快照。
- ⚠️ **加载顺序**：本模块依赖 `key-dialog.js` 的 `FE.buildActionEditor` / `FE.buildJsonSnippetEditor`，
  必须排在它之后。而 `app.js` 的 `boot()` 在 app.js 加载时就跑过，那时本模块还没定义，
  两个列表只能给占位 —— 模块末尾有一段 `bootMacroEditors()` 补一次 `FE.renderActionsTab()`。
  **跨文件调用记得导出**：`FE.renderActionsTab` 就是为这个补渲染而导出的。
- ⚠️ **DOM 桩不冒泡**，所以动作编辑器内部控件用 `opts.onChange` 回调（不靠事件委托），
  宏步骤行内也把 `change` 逐个绑到编辑器元素上。
- **默认折叠 + 懒建**（`app.js` 的 `collapsibleDefItem`）：条目一多就翻找不到，所以两个列表都用
  `<details>` 外壳，**默认全部折叠**，点摘要行才展开。
  - 展开状态记在 `state.openActions` / `state.openMacros`（`ensureOpenSet()`），
    用 `<details>` 的 `toggle` 事件同步 —— 展开/收起是**浏览器行为、不重渲染**，
    否则会重建内部编辑器、正在填的字段全丢。
  - **新建的条默认展开**：创建后主动写 `ensureOpenSet(...)[name] = true`，建完即配置。
  - ⚠️ 删除按钮放在 `<summary>` 里，**必须 `preventDefault()`**，否则点删除会连带展开/收起。
  - ⚠️ `.def-item` 是 `display:flex`，可折叠外壳要覆盖成 `display:block`，
    否则 `<summary>` 作首子元素的折叠语义会与 flex 布局打架。
  - ⭐ **懒建（性能关键，别退回"折叠也预先建好"）**：编辑器由 `opts.build(body)` 在
    **首次展开时**才构建，收起时销毁（只留 `<summary>`）。测得的代价：
    | 场景 | 节点 | `<option>` | 一次 `renderAll` |
    |---|---|---|---|
    | 无动作无宏 | ~1.4K | 24 | — |
    | 29 动作 + 41 宏（**预建**，旧实现） | **~47.5K** | **18,741** | **53 ms** |
    | 29 动作 + 41 宏（**懒建**，现实现） | **~2.2K** | 24 | **7 ms** |
    | 展开 1 条宏 | ~3.1K | 373 | — |
    旧的「预建」实现让打开页面就白烧 CPU：每个「按键 key」内联编辑器都含 **143 项**的
    键码下拉，几十条动作/宏就是上万个 `<option>`，而 `renderAll` 每次还要重建整棵树
    （`boot()` 一次 + `macro-editor.js` 就绪后补一次 = 开局建两遍）。
    **`test-ui.js` 有断言锁定「折叠状态下不得存在编辑器节点」**，改回去会红。
- **按键显示名**（`data.js` 的 `FE.KEYCODE_LABELS` / `FE.keycodeDisplayName`）：
  低层 KeyCode 下拉仿 f5a-see-me，英文码后加中文备注，如 `ESCAPE（Esc 退出）`、
  `KP_5（小键盘 5）`。**只影响显示**：`option.value` 与 `getValue()` 始终是 code 本身，
  落盘 JSON 不受影响。**不要**把显示名写进 value，那会导出非法键名。
  这批码与 `skills/SKILL.md` 的 `## Low-Level KeyCode Names` 列表**逐一对得上**
  （143 个，含 `F1 ... F12` / `KP_0 ... KP_9` 的省略展开），改表时对照该节。

### 4.11 引用索引与「使用数」弹窗（app.js 纯逻辑段）⭐ 必须单遍扫描

**用途**：按键定义页与「动作与宏」页每个条目都有「使用 N」按钮，点开**网页内建弹窗**
列出被哪些布局使用，且**点击条目可跳到对应布局并选中该按键**（不再用 `alert`）。

- **纯逻辑**（**在 app.js 的纯逻辑段**，非 UI 段 —— Node 下 UI 段会提前 `return`，
  core 测试就取不到了。搬移时别放回去）：
  - `FE.buildRefIndex(profile, popupProfile)` → `{ key, action, macro }`，每名 → 条目数组。
    每条目 `{ label, loc, via?, indirect? }`：
    - `loc = { layout, isSplit, sectionIndex, rowIndex, keyIndex, group }` → 跳布局按键
    - `loc = { popupKey }` → 跳弹出菜单页
    - `loc = { defKind: 'key'|'action'|'macro', defName }` → 跳定义列表里的那条定义
    - `loc = null` → 只读展示（保留给确实无处可跳的来源）
  - ⭐ **定义内部的引用必须带定义坐标**（别改回 `null`）：早期
    `specRefs(profile.actions[an], …, null, 0)` / `nodeRefs(profile.keys[kn], …, null, 0)`
    把「按键定义 / 动作定义 / 宏步骤」内部产生的引用标成无坐标，弹窗对无 `loc`
    的条目**只渲染纯文本、不给跳转按钮**，于是「按键定义 k.chain」这类条目在
    **动作与宏页**点不动（用户报告的缺陷）。现在三类都传
    `{ defKind, defName }`，`showUsageDialog` 为它们渲染可点条目，
    `jumpToUsage` 分派给 `FE.jumpToDef(kind, name)`：切到对应标签页、把该名字
    写进展开集（动作/宏默认折叠）、清空该页搜索过滤（否则条目被筛掉、
    `scrollToDefItem` 静默失败 = 点了没反应）、再滚动高亮。
  - ⭐ **定位高亮是「持续」的，不是一闪而过**（用户明确要求）：
    `FE.holdFlash(el, variant)` 加 `.flash-hold` 基类，
    **一直亮到用户下一次点击或按键**才由 `FE.releaseFlashHold()` 撤掉。
    - 为什么不用加长 `animation`：CSS 动画**表达不了**「持续到用户操作」——
      时长写死就无从知道用户何时看到，1.2s 在高亮还没被扫到时就淡出了。
    - 释放靠 `document` 上的 **capture** `pointerdown` / `keydown` 一次性监听。
      用 capture 且不监听 `click`：跳转本身就是 click（或按钮上的 Enter）触发的，
      那两个事件此刻已经发生过，所以不会刚亮就被自己解除。
    - **同一时刻只保留一处高亮**：`holdFlash` 先撤上一处，否则连翻几页会亮一排。
    - **三处定位统一走持续高亮**（跳转引用 / 新建条目 / 校验条目定位），
      不再有「闪一下」的旧路径：`.def-flash` / `.issue-flash` 已删除，别再新加
       （新建的条目虽在眼前，列表长了同样会被错过，统一持续更省心）。
      ⭐ **颜色有三档，且布局按键按「来源」分**（详见 §4.12 的表）：
      `.flash-hold` 蓝（新建 / 定义列表里的引用跳转目标）；
      `.flash-hold.flash-hold-err` 红（**出错**：列表条目、以及校验详情跳到的布局按键）；
      `.flash-hold.flash-hold-sel` 黄（布局按键，但只用于**非出错**跳转，
      即从「使用数」弹窗跳过来）。
      ⚠️ **别把布局按键写死成一个颜色**：两种来源落到的是同一个 `.chip-sel`，
      只有调用方知道自己是哪一种，所以颜色必须由 `variant` 传进来。
    - ⚠️ **红必须压过按键自带的黄框**：`.chip-sel` / `.gedit-key.chip-sel` 自带
      `outline: 2px solid var(--sel)`，所以红要**改 outline 的颜色**（而不是再加一层）——
      outline 只有一份、改色即替换，不会出现两条框套在一起的重复观感。
      选择器必须 **3 个类**才压得过既有的 2 个类：

      ```css
      .chip.chip-sel.flash-hold-err,
      .gedit-key.chip-sel.flash-hold-err { outline-color: var(--err); }
      ```

      写成 2 个类会被后者按同权重、后出现顺序覆盖掉。
    - 黄则**不需要** outline 覆盖：没有两色相争，光晕叠在黄框外圈即可。
    - 两者点击后都被 `releaseFlashHold` 摘掉 → 光晕/红框消失，
      按键保持选中黄框（`state.sel` 没动）—— 与「点击后闪烁消失」的语义正好吻合。
    - 历史：布局按键曾经一度**完全不加**（理由是"与黄框重复"）→ 改成红色 →
      短暂改成黄色（"不突兀"）→ **最终定为按来源分**（校验红 / 引用黄）。
    - ⚠️ `test/dom-stub.js` 的 **`document` 桩必须提供 `removeEventListener`**：
      真实 document 有它，桩早期只做了 `DOMNode` 那份，于是任何「挂监听后解绑」
      的代码在测试里直接 `TypeError`（持续高亮就是第一例）。
  - `FE.usageOf(index, kind, name)` → `{ count, places, items }`
  - `FE.outgoingRefsOf(profile, kind, name)` → `[{ kind: 'action'|'macro', name, where }]`
    —— **反向查询**：这条定义**自己用到了**哪些动作与宏。用户要求补上，
    因为按键定义的 `tap: "my.action"` / `{ macro: "m" }` 这类引用以前在界面上
    完全看不到，只能自己翻 JSON。`where` 是出现位置（`tap` / `swipe.down` /
    `hold · start` / `步骤2` / `变体1 · tap`…），同一目标只留首次出现。
    - ⭐ **只支持 `kind` = `'key'` 与 `'macro'`；`'action'` 恒返回 `[]`，别为它加分支**。
      动作对象是**单一直接动作**（`type`/`key`/`modifier`/`text`/`switch_layout`/`app`），
      结构上就没有 `action`/`actions`/`macro` 这类"指他"字段 ——
      动作是最基础的条目，**只被引用、不会引用别人**（用户明确指出的领域规则）。
      硬给它跑一遍只会得到空数组，让弹窗对动作冒出「它没有引用任何条目」的噪音。
    - ⚠️ **基础 `ref` 不计入**：它在条目上已有 `ref: xxx` badge，且常指向
      `rime.*` / `foxy.*` 内置键（不是「动作与宏」页的条目），收进来只会重复。
    - 悬空引用**照样列出**（由调用方标「不存在」），不能因目标缺失而丢掉 ——
      否则用户看不到「这个键引用了一个已被删的动作」。
  - `FE.showUsageDialog(title, usage, outgoing)`：`outgoing` 是数组（含空数组）
    时渲染第二节「引用（它用到的动作与宏）」，**不传（`undefined`）则只显示
    「被谁引用」**，兼容旧调用。两节都在时列表加 `.usage-list-compact` 各矮一半。
    - 调用侧因此要**按 kind 区分**：只有宏（与按键定义页）传 `outgoing`，
      动作传 `undefined` —— 否则动作弹窗会多出一节「它没有引用…」的空噪音。
      动作条目的按钮 tooltip 也相应是「查看它被谁引用」。
  - `FE.currentRefIndex()` 带缓存；`FE.invalidateRefIndex()` 作废缓存
  - `FE.countKeyUsage(name)` 单次查询（旧 API，保持兼容）
- ⚠️ **必须单遍扫描**：`buildRefIndex` 一次走完配置、把所有名字的引用一起收集。
  若给每个条目各扫一遍，代价是 O(条目数 × 配置大小)——真实布局包有 200+ 按键定义，
  那样点开页面就会明显卡顿（与 §4.10 的懒建是同一类性能陷阱）。
- ⭐ **穿透解析（别删）**：布局 → 宏 → 动作 → 动作 这类多层引用很常见。
  只记「相邻一层」的话，**只被宏用到的动作会显示「被引用 0 处」，是错的**。
  所以末尾有一遍迭代到不动点的传播，把带布局坐标的使用处沿引用链传到被引用者，
  并附 `via`（经由链，如 `宏 m1`）。有引用环也安全（按 `label+loc` 去重、迭代上限 8 轮），
  单名条目上限 200 条防病态配置撑爆弹窗。
- ⚠️ **缓存失效要点**：`mutate` 多为**就地改属性**（对象引用不变），
  只按引用比对会让「使用数」停在旧值。所以 `afterChange` 与 `commitActionEdits`
  都要调 `invalidateRefIndex()`；静默写回路径另调 `FE.refreshUsageLabels()`
  就地改按钮文字（**不重建列表**——重建会打断正在操作的控件）。
- ⚠️ **读 dataset 而非 getAttribute**：按钮用 `h(..., { dataset: {...} })` 挂
  `data-usage-kind/name`，`h()` 走的是 `Object.assign(el.dataset, …)`。
  真实浏览器里它等价于写属性，但 **DOM 桩的 `dataset` 是普通对象、不反射成属性**——
  两处都读 `el.dataset.xxx` 才在浏览器与测试里行为一致。
- **整行可点**（按键定义页）：`def-row-click` + `clickedInteractive(e, root)` 排除行内按钮。
  该行**没有「编辑」按钮**（用户明确要求去掉，整行点击就是编辑入口，别再加回来）：
  - 行自带 `tabindex="0"` + `keydown`（Enter/空格）保证键盘可达；
  - **不要**加 `role="button"`：行内含按钮，`role=button` 里嵌交互元素是非法 ARIA，
    靠 `tabindex` + `keydown` 即可聚焦与触发；
  - `keydown` 里先判 `e.target !== row` 直接返回，否则焦点在子按钮上按回车会
    同时触发按钮与整行。
- **摘要行内的按钮**（动作/宏条目）：都在 `<summary>` 里，**必须 `stopEv(e)`**
  （`preventDefault` + `stopPropagation`），否则点按钮会连带展开/收起。

### 4.12 定义列表的工具条（搜索 + 新建）⭐ 四张列表必须同构

按键定义 / 动作 / 宏 / **弹出菜单键** 四张列表共用同一套工具条，
**外观与行为完全一致**（用户明确要求同步；弹出菜单键是后补的第四张列表）。

⚠️ **「列表」与「页签」不是一回事**（措辞别混，曾把「四张列表」写成「四个页签」）：
四张列表落在**三个页签**里 —— 按键定义 1 张、**动作与宏 2 张**（动作 + 宏）、
弹出菜单 1 张。而顶部共 4 个页签（多一个「布局编辑」，它不是列表页、没有搜索框）。
搜索框因此也是 **3 个页签里的 4 个**：`keys-` / `actions-` / `macros-` / `popup-filter`。

```
.def-toolbar                  ← 一行，可换行
  ├── .def-tool-group         ← 搜索组：.search-wrap（输入框 + ✕）+ 「搜索」按钮
  └── .def-tool-group         ← 新建组：输入框 + 「+ 新建…」按钮（仅前三张列表有）
```

- **结构写在 `index.html` 的静态 HTML 里**（不在 JS 里现渲染），各列表一份，
  id 规律：`<前缀>-filter` / `<前缀>-search` / `<前缀>-filter-clear`
  （+ 前三张列表另有 `<前缀>-new` / `<prefix>-add`），
  前缀分别是 `keys` / `actions` / `macros` / `popup`。
  ⚠️ 改这里必须同步 `test/dom-stub.js` 的 `buildSkeleton()`，否则 UI 测试全崩。
- **接线统一走 `FE.wireSearch()`（app.js 模块作用域）+ `initToolbar()` 的 `wireAdd()`**：
  - `wireSearch(inputId, btnId, render, clearId)`：`input` 即时过滤 **+** 按钮显式触发
    **+** 回车触发。为什么两者都要：手机输入法有时不派发 `input`，按钮是兜底；
    桌面则习惯边打边筛。
    - 它是 **`FE.*` 导出的**，因为 `popup-editor.js` 也要接（各写一份必然漂移）。
      ⚠️ 不要再在 `initToolbar()` 里定义同名内部函数 —— 会遮蔽导出那份，
      而那份不认识 ✕ 清空按钮。
  - `wireAdd`：输入框 + 按钮（不再用 `prompt`）。`opts.openKey` 传给可折叠列表，
    新建后写进 `openSet` 从而**默认展开**；按键定义不是折叠条目，不传该字段。
- ⭐ **搜索框内的 ✕ 清空按钮**（`clearId`，用户要求三页签里的四个搜索框都加）：
  - **空框时隐藏**（`hidden`）：空框上留个 ✕ 是干扰。显隐由 `syncClear()` 维护。
  - 点击后：清空 → 重渲染 → **把焦点还给输入框**。用户点 ✕ 的意图是「重新输入」，
    焦点跑掉还得再点一次输入框。
  - 结构是 `.search-wrap > .mini-input + .search-clear`（wrap 相对定位，✕ 绝对定位
    在框内右内侧，并给 input 留 `padding-right`）。
    ⚠️ **CSS 尺寸规则要同时覆盖直接子元素与 wrap 内的 input**：
    只写 `.def-tool-group > .mini-input` 的话，包起来之后那条规则失效
    （input 不再是 group 的直接子元素），输入框会缩成默认宽度。
  - ⚠️ **程序化改过滤值时必须显式 `FE.syncSearchClear(inputId)`**：
    直接写 `input.value` **不派发 `input` 事件**，✕ 的显隐会停在旧状态
    （框已空却还挂着 ✕）。已知调用点：`jumpToDef`（切页前清过滤）、
    `FE.jumpToPopupEditor`（同）。这条是实测抓出来的，不是推测。
- **过滤文本**：按键定义 = 名字 + `ref`；动作 = 名字 + `actionDisplay` 摘要；
  宏 = 名字 + `describeMacroSteps` 摘要。所以「搜 CTRL」「搜 HOME」都能命中，
  不只是按名字（`defMatch()` + `defFilterValue()`）。
- **匹配提示**：过滤生效时列表顶部渲染 `.def-match-hint`（`appendMatchHint()`），
  显示「匹配 N / 总数 项」或「没有匹配的…」。
  ⚠️ 因此测试里**数条目要用 `.def-item`，不能数 `children.length`**（提示行也算一个子节点）。
- **响应式**（`style.css`）：`.def-tool-group` 桌面 `flex: 0 1 auto`（两组并排靠左），
  手机 `max-width: 640px` 时 `flex: 1 1 100%` → **搜索一行、新建一行**，
  但**组内输入框与按钮始终同一行**（输入框 `flex: 1 1 auto`，按钮 `flex: 0 0 auto`）。
- **悬停提示**：按键定义行 `title="点击编辑这个按键定义"`；
  动作/宏摘要行由 `collapsibleDefItem` 的 `opts.summaryTitle` 或默认
  「展开并配置「名」」生成。三处都要有——缺了会出现「一页有提示、另一页没有」。
- ⭐ **新建后的落点：滚过去 + 高亮（方案 B）**。新条目总是**追加在列表末尾**
  （`Object.keys` 插入序），而工具条在卡片顶部 —— 不处理的话用户根本看不到刚建的东西。
  - `scrollToDefItem(name, hostId, opts)`：找到条目 → 展开所在卡片 → `cancelScrollRestore()`
    → `scrollIntoView({block:'center'})` → 持续高亮 `.flash-hold`（见 §4.11）。
    颜色由 `holdFlash` 的 variant 决定：`'err'`（或历史的 `true`）= 红色（校验定位）、
    其余 = 蓝色。桩不实现 `scrollIntoView`/`closest`，
    所以照 `scrollToSelection` 的写法做存在性判断。
  - ⭐ **`holdFlash(el, variant)` 的三个颜色变体**（`releaseFlashHold` 一次摘干净）：
    | variant | 类 | 用在哪 |
    | --- | --- | --- |
    | `'err'` / `true` | `.flash-hold.flash-hold-err`（红） | **出错的落点**：列表条目、以及**校验详情跳到的布局按键** |
    | `'sel'` | `.flash-hold.flash-hold-sel`（黄） | **布局按键**，但只用于**非出错**跳转（从「使用数」弹窗跳过来） |
    | 其他 / 省略 | `.flash-hold`（蓝） | 新建条目 / 定义列表里的引用跳转目标 |
    - ⭐ **同一个布局按键，颜色按「来源」分**（用户两次要求叠加的结果）：
      · 校验详情跳过来 → **红**（'err'）：它是"这里有错"，红才对；
      · 「使用数」跳过来 → **黄**（'sel'）：那只是带你到用过它的那个键，
        而按键本就被选中、自带黄框，红得突兀。
      所以 `scrollToSelection(variant)` 接收颜色、**不要在里面写死一个颜色**；
      `locateIssue(it, variant)` 默认 `'err'`（它的主要调用方是校验详情），
      `jumpToUsage` 显式传 `'sel'`。
    - ⚠️ **红必须压过自带的黄框**：`.chip-sel` / `.gedit-key.chip-sel` 自带
      `outline: 2px solid var(--sel)`，所以红要**改 outline 的颜色**（而不是再加一层）——
      outline 只有一份、改色即替换，不会出现两条框套在一起的重复观感。
      那条选择器要写 **3 个类**（`.chip.chip-sel.flash-hold-err`）才压得过既有的
      2 个类；写成 2 个类会被后者按同权重、后出现顺序覆盖掉。
    - 黄则**不需要** outline 覆盖：没有两色相争，光晕叠在黄框外圈即可。
    - 两者点击后都被 `releaseFlashHold` 摘掉 → 光晕/红框消失，
      按键保持选中黄框（`state.sel` 没动）。
    - `true` 的兼容分支别删：`scrollToDefItem` 的 `opts.error` 仍以布尔传入。
  - **刻意不改数据结构**：JSON 键顺序保持插入序。布局文件是喂给 Foxy 的，
    UI 操作不该顺手重排它的键序（这也是当初在「排到最前 vs 跳过去」之间选后者的原因）。
  - `cancelScrollRestore()` 不能漏：否则 `afterChange` 排下的那一帧位置恢复会把视口拽回去。
- ⭐ **三页新建行为统一：一律不自动弹编辑对话框**，建好即滚过去高亮，要配置时用户自己点条目
  （按键定义页整行可点；动作/宏页点摘要行展开，新建条目已默认展开）。
  > 历史：按键定义页曾「新建后直接打开定义对话框」，滚动还得推迟到 `onClose`
  > 才不被遮住 —— 用户明确要求去掉这个不一致，**别再加回来**。
  > 同理 `FE.openKeyDialog` 不需要 `onClose` 透传了。

### 4.13 浮动工具（右上撤销/重做、右下回到顶部）

编辑长列表时不该每次滑回顶部点撤销，所以有两个浮动控件（`index.html` 里紧跟 `</main>` 之后）：

| 元素 | id | 位置 |
|---|---|---|
| 撤销 + 重做（一组） | `float-undo-group` / `float-undo` / `float-redo` | 右上 `.float-top-right` |
| 回到顶部 | `float-top` | 右下 `.float-bottom-right` |

- ⭐ **贴着中央操作区的外缘**（用户明确要求），而不是钉在视口边缘 —— 钉视口的话屏幕越宽
  离内容越远，鼠标得多跑一截。做法是外面套一层 `.float-layer`（`fixed` 铺满视口、
  `pointer-events: none` 只做定位）> `.float-rail`（`max-width: var(--content-max)` +
  居中 + `padding: 0 var(--content-pad-x)`，与内容列几何一致），按钮再绝对定位到这层上。
- **内容列几何的两个单一来源**：`--content-max` / `--content-pad-x`（`:root`），
  `.topbar-main`、`main`、`.float-rail` 三处都引用它 —— 改内容宽度只改变量，
  浮动按钮自动跟着对齐。手机断点里覆写 `--content-pad-x` 也是同一原因。
- ⚠️ **按钮用 `left` 定位，不要改成 `right`**：
  `right: 0` 会把按钮**右**缘钉在内容列边上，按钮本体向左伸出去**压在卡片上**；
  而同时给 `left` 与 `right`、宽度 `auto` 会把按钮左右拉伸。
  正确写法是 `left: calc(100% - var(--content-pad-x) + 8px)`：
  从 rail 的 padding-box 右缘退回卡片右缘，再留 8px 间隙，
  于是按钮整体落在内容列外侧、间隙恒定且**不需要写死按钮宽度**。
- **窄屏兜底**：`@media (max-width: 1520px)` 退回贴视口右缘（`left: auto; right: 12px`）。
  断点是算出来的：内容列 1180px + 两侧各约 170px（按钮组宽 + 间隙 + 余量）≈ 1520px，
  低于它页边距放不下按钮，硬贴会被视口右缘裁掉。
- ⭐ **滚出顶栏后才显示**（`updateFloatTools()`，阈值 `FLOAT_SHOW_AT = 120` ≈ 顶栏高度）。
  为什么不是常驻：顶栏右侧本来就有同款撤销/重做按钮，常驻会与它们**叠在一起**；
  滚过顶栏后顶栏已滑出视口、用户够不到它了，这时浮出来才真正解决问题且无重叠。
  判定用 `>` 而非 `>=`，等于阈值时不显示。
- **撤销/重做状态是三处同步**（浮动 / 顶栏 / 「布局与文件操作」卡片内），
  统一由 `updateUndoButtons()` 写入 —— 三处任一处的 `disabled` 不一致都会被用户察觉。
  该函数顺带调 `updateFloatTools()` 对齐一次显隐（内容变化可能被动改变滚动位置）。
- `updateFloatTools()` 挂在 `window` 的 `scroll` 上，**必须 `{ passive: true }`**
  （只读 `scrollTop`、不 `preventDefault`，声明被动可让浏览器不必等回调返回即可滚动）。
  加载时也调一次（刷新时浏览器可能恢复上次滚动位置）。
- `scrollPageToTop()`：直接设 `scrollTop = 0`，**不用平滑滚动的锚点跳转**——
  不依赖 CSS `scroll-behavior`，且测试能立刻断言。它是「有意的滚动」，
  所以**先 `cancelScrollRestore()`**，否则会被 `afterChange` 排下的那一帧位置恢复拽回原处
  （与 `locateIssue` / `scrollToDefItem` 同一套路）。回顶后自己收起浮层。
- ⚠️ 桩要复现三个真实的浏览器语义，否则相关断言测不出东西（见 §5.3）：
  - `hidden` 是**反射属性**：`setAttribute('hidden')` → `el.hidden === true`；
  - `title` 是**双向反射**：`el.title = 'x'` 与 `getAttribute('title')` 必须能互相读到
    （桩早期只做了单向，导致「代码写 `.title`、测试读 `getAttribute`」拿到 `null`）；
  - `.float-layer > .float-rail` 的嵌套结构要在 `buildSkeleton()` 里还原，
    否则贴边用的那套 calc 无从对齐（几何量不到，测试锁的是**结构契约**）。
- ⚠️ 测试里比较 DOM 节点**必须用 `ok(a === b)`，不能用 `eq(a, b)`**：
  `eq()` 内部 `JSON.stringify` 两边，而 DOM 节点有循环引用
  （`parentNode` ↔ `children`）会直接抛「Converting circular structure to JSON」。

---

## 5. 已知的坑（都踩过，别重蹈）

### 5.1 修改后必须同步的东西

| 改了什么 | 必须同步 |
|---|---|
| `examples/` 下任何文件 | `node tools/build-examples.js` |
| 新增/改名 `FE.xxx` | 检查 `test-core.js` / `test-ui.js` 是否要跟着改 |
| `index.html` 加/删元素 | `test/dom-stub.js` 的 `buildSkeleton()` 也要加/删，否则 UI 测试全崩 |
| 新增 `js/*.js` 模块 | `index.html` 的 `<script>` 顺序、`test-core.js` / `test-ui.js` 的 `load()` 列表三处都要加 |
| 改折叠卡片数量/顺序/标题 | `test-ui.js` 里对应的顺序断言（布局页、弹出菜单页都有） |
| 改角标含义或样式类 | `index.html` 预览下方的图例文字 |
| 改校验规则 | `test-core.js` 的校验器断言；并对照 skill 文档 |
| 新增校验规则 | 顺手带上 `code` 与定位坐标（否则「点击定位」覆盖不到） |
| 新增解析类函数 | 接受并向下传 `scope`（见 §3.4） |
| 新增渲染处 | 消费编译产物，别自己 `evalPlacement`（见 §3.3） |

### 5.2 分体（split）预览的宽高（**曾经改错三轮**）

规则：分体是**横屏宽键盘**，只加宽、**不加高、不放大字号**。

```js
var rawW = host.clientWidth;
var W = rawW || 380;
if (!state.splitMode) {
  if (rawW > 0) state.portraitW = rawW;   // 只在真实可见的竖屏渲染里记忆基准宽
  else if (state.portraitW == null) state.portraitW = 380;
} else if (state.portraitW == null) {
  state.portraitW = W / 2;                // 只反推一次，不能每帧都算
}
var unit = state.portraitW / 10;          // 全链路单 unit：行高 / 字号 / 图标 / 提示
```

- 加宽只靠 CSS `.kb-split { max-width: 860px }` + flex 自动拉伸，**JS 里绝不乘系数**。
- ⚠️ `.kb` 的 `max-width` **不能加 transition** —— 切回竖屏那一帧量到收缩中的宽值会把
  `portraitW` 污染，之后字和行高一起变大且回不来（这正是历史 bug）。
- 分体开关与横幅切换后要 `requestAnimationFrame(() => renderPreview())` 补一帧，
  等浏览器 layout 完成再量宽度。

### 5.3 DOM 桩的能力边界（写 UI 测试时）

`test/dom-stub.js` 只实现编辑器用到的那部分：

- **不支持**：`input[type="text"]` 这类属性选择器（用
  `querySelectorAll('input').find(i => i.getAttribute('type') === 'text')` 替代）、
  逗号选择器、`:hover` 等伪类、真实布局（`clientWidth` 默认 0，可用 `__stubWidth` 模拟）。
- 支持：`.class` / `.class.class` / `tag` / `tag.class` / `#id`、空格后代选择器、
  `dataset`、`style`、`classList`、`_fire(type)` 触发事件。
- 新增 UI 元素必须同时在 `buildSkeleton()` 里建出来，否则 `$('xxx')` 为 null。
- 用 `documentStub._openDialogs` 检查/清理对话框；`global.alert` 被改成 **throw**，
  所以代码里不要依赖 alert 静默通过。
- `requestAnimationFrame` 是**同步桩**，所以补帧逻辑在测试里会立即生效。
  要验证「排了但还没执行的一帧」，就在测试里临时把 `global.requestAnimationFrame`
  换成收集回调的版本（见 test-ui.js 的滚动保持用例）。
- **桩会复现两个真实的浏览器副作用**（缺了它们，对应的修复就无法被断言验证）：
  - `removeChild` 摘掉的子树里若含 `activeElement`，会**清焦点并把页面滚回顶部**；
  - `document.documentElement` / `document.scrollingElement` 提供 `scrollTop`，
    供 `pageScroller()` 读写。

### 5.4 其他小坑

- **行高/权重**：`row.heightUnits` 由 `FE.rowsOfSection` 归一化（对象行 vs 数组行），
  别假设 `section.rows[i]` 一定是数组 —— 用 `getRowKeys(section, ri)`。
- **`placementContainer(loc)` 是只读的**：不会把数组行转成对象行（避免打开对话框就改结构）；
  要写就用 `getRowKeys`。
- **布局 JSON 卡片**（`#json-editor`）现在**在布局编辑页最下方**，不是独立标签页。
  `state.jsonDirty` 为真或焦点在其中时 `renderJsonTab` 不覆盖文本。
- **标签页只有 4 个按钮 / 4 个 tabpanel 区块**：布局编辑 / 按键定义 / 动作与宏 / 弹出菜单
  （弹出菜单带 `.tab-popup` 类做视觉分隔）。`tab-layout-json` 已被移除，**别再引用它**；
  布局 JSON 卡片现在就在 `#tab-layout` 里的最下方。`dom-stub.js` 的 `buildSkeleton()`
  同样是 4 按钮 4 区块，两边要一致。
- **手机竖屏**：`style.css` 的 `@media (max-width: 640px)` 两段（jscolor 色块尺寸段 +
  文末"竖屏手机优化"段）做单列 + 大触摸目标 + 近全屏弹窗；改布局时留意别把这两段覆盖掉。
- **列表重建必须保持滚动位置**（`afterChange` 里的 `captureScroll` / `restoreScroll`）：
  加/删动作或宏走 `mutate → afterChange → renderAll`，会 `clearEl` 清空整个列表再重建。
  两个原因会让页面跳回分栏顶部：
  1. 被点掉的按钮**往往正是焦点元素**，它一被移除，浏览器交回焦点并滚回顶部；
  2. 清空那一刻文档变矮，`scrollTop` 被夹到临时上限。
  第 1 点引发的滚动是**异步**的（推迟到本次任务之后），所以只同步恢复不够，还要补一帧。
  补帧会与「有意的滚动」打架（如 `locateIssue` 定位到某个按键），
  因此用 `scrollRestoreSeq` 作失效判断：**任何有意滚动前先调 `FE.cancelScrollRestore()`**。
  > 改这块时注意：桩的 `rAF` 是同步的，要验证「排了但还没跑的一帧」得临时替换
  > `global.requestAnimationFrame`（test-ui.js 的滚动保持用例是范例）。
- 提交前 `git status` 应干净；远程是 SSH（`git@github.com:SandyYuR/foxy-see-me.git`），
  推送走 Pages 自动发布，无需额外步骤。
  ⚠️ **不要自动 `git push`** —— 用户明确要求：改完只做本地提交，推送由用户自己决定。

---

## 6. 标准工作流

```bash
cd foxy-editor

# 1) 改代码（优先改纯逻辑段，UI 段只做展示）
# 2) 如果动了 examples/：
node tools/build-examples.js

# 3) 必跑（两个都要 0 失败）
node test/test-core.js       # 期望：462 通过, 0 失败
node test/test-ui.js         # 期望：824 通过, 0 失败

# 4) 用真实文件体检（新增/修改示例后尤其要跑）
node test/check-real-files.js   # 期望：共 20 个文件，0 个存在错误

# 5) 改过本文件（AGENT.md）就同步两处副本（见开头「本文件有两份」）
node tools/check-agent-sync.js --write

# 6) 浏览器里手动确认一次交互（拖动、取色、对话框这几类桩覆盖不到）
```

### 改动前的自查清单

- [ ] 改的是**格式语义**吗？→ 先查 `skills/SKILL.md` 与 `skills/*.schema.json`，别猜。
- [ ] 加/删了 DOM 元素？→ 同步 `test/dom-stub.js`。
- [ ] 加了折叠卡片或改了顺序？→ 同步 `test-ui.js` 的顺序断言。
- [ ] 数据变更走 `mutate()` 了吗？跨文件调用加了 `FE.xxx` 存在性判断吗？
- [ ] 动了 `examples/`？→ 跑 `build-examples.js`。
- [ ] 改过 `AGENT.md`？→ 跑 `node tools/check-agent-sync.js --write` 同步两处副本。
- [ ] 两个测试套件都 0 失败了吗？

### 版本信息（改动可能影响这些对外说法）

- 测试基线：core **461** / UI **829** / 示例 **20**（16 布局 + 4 弹出菜单）
- 仓库 `README.md` 里的功能描述与 `index.html` 的图例，与实现同步维护；
  新增用户可见功能时一并更新，避免文档漂移。
