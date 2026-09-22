# AGENT.md — foxy-editor 修改指南（给后续代理）

本文件是 `foxy-editor/`（小狐狸 see me 编辑器）的**改动前必读**。目标：让下一个代理
在不熟悉上下文的情况下也能安全改代码，避免踩已知的坑。

先读这一行的结论：**改任何东西后必须跑 `node test/test-core.js` 与 `node test/test-ui.js`，
两个都 0 失败才算改完。** 当前基线：core 304 / UI 437 / 真实文件体检 18 个示例 0 错误。

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

#### D9 · 每次对齐文档更新，都补测试

测试基线演进：157（首版）→ 275（JSON 修复）→ 215 core + 355 UI → … → 现在 **304 core + 437 UI**。
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
  - `skills/DEFAULT_LAYOUT_V0.0.1.md` — 完整规范（Foxy Layout File v0.0.1）
  - `skills/SKILL.md` — 面向 AI 的编辑技能说明（文件位置、结构、验证要点）
  - `skills/FOXY_JSON_CONFIGS.md` — 三种 Foxy JSON 的 `type` 判别与共享 definitions

  **怀疑格式语义时先查这里，不要凭直觉改校验/解析。**
  > 注意：这三份是**从工作区 skill 目录同步过来的副本**。上游（Foxy 项目自身）
  > 更新后需重新同步，不要在副本上直接改规范内容。

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
│   ├── popup-editor.js 弹出菜单编辑（纯逻辑 + 该标签页 UI）
│   └── jscolor/jscolor.js  vendor 取色器（GPLv3，**不要改**）
├── examples/          示例源文件（18 个：15 布局 + 3 弹出菜单）
├── skills/            格式规范（随仓库分发的 skill 文档副本，**只读参考，别改**）
│   ├── DEFAULT_LAYOUT_V0.0.1.md  Foxy Layout File v0.0.1 完整规范
│   ├── SKILL.md                  面向 AI 的编辑技能说明
│   └── FOXY_JSON_CONFIGS.md      三种 Foxy JSON 的 type 判别与共享 definitions
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
上方的注释与 `DEFAULT_LAYOUT_V0.0.1.md` 对应章节。

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

### 4.5 对话框（key-dialog.js）

- `openModal({title, wide})` → `{el, body, toolbar, close}`；`FE.openModal` 已导出。
- `FE.openKeyDialog({mode:'placement'|'definition', placement?, name?, location?, grid?})`
  主对话框，内部 `buildForm()` 重建整个表单（任何局部改动想立即反映 → 调 `buildForm()`）。
  折叠 section 顺序（**7 个**，改顺序要同步这里）：
  **基本信息 → 手势 → 状态变体 → 按键颜色覆盖 → 高级颜色 → 高级 → 弹出菜单**
  - 「按键颜色覆盖」是 4 个常用角色；「高级颜色」（`color-adv-card`）含 `shadow` / `pressed` /
    `hint` 四边，以及 `pressed` / `modifierLocked` / `modifierActive` 三个 `states` 子卡。
  - 最后一个「弹出菜单」是内嵌的 `FE.buildPopupKeyEditor`（见 §4.6）。
- `FE.openGestureDialog` / `FE.openVariantDialog` / `FE.openKeyPicker` / `FE.buildActionEditor`。
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
- 提交前 `git status` 应干净；远程是 SSH（`git@github.com:SandyYuR/foxy-see-me.git`），
  推送走 Pages 自动发布，无需额外步骤。

---

## 6. 标准工作流

```bash
cd foxy-editor

# 1) 改代码（优先改纯逻辑段，UI 段只做展示）
# 2) 如果动了 examples/：
node tools/build-examples.js

# 3) 必跑（两个都要 0 失败）
node test/test-core.js       # 期望：304 通过, 0 失败
node test/test-ui.js         # 期望：437 通过, 0 失败

# 4) 用真实文件体检（新增/修改示例后尤其要跑）
node test/check-real-files.js   # 期望：共 18 个文件，0 个存在错误

# 5) 改过本文件（AGENT.md）就同步两处副本（见开头「本文件有两份」）
node tools/check-agent-sync.js --write

# 6) 浏览器里手动确认一次交互（拖动、取色、对话框这几类桩覆盖不到）
```

### 改动前的自查清单

- [ ] 改的是**格式语义**吗？→ 先查 `skills/DEFAULT_LAYOUT_V0.0.1.md`，别猜。
- [ ] 加/删了 DOM 元素？→ 同步 `test/dom-stub.js`。
- [ ] 加了折叠卡片或改了顺序？→ 同步 `test-ui.js` 的顺序断言。
- [ ] 数据变更走 `mutate()` 了吗？跨文件调用加了 `FE.xxx` 存在性判断吗？
- [ ] 动了 `examples/`？→ 跑 `build-examples.js`。
- [ ] 改过 `AGENT.md`？→ 跑 `node tools/check-agent-sync.js --write` 同步两处副本。
- [ ] 两个测试套件都 0 失败了吗？

### 版本信息（改动可能影响这些对外说法）

- 测试基线：core **304** / UI **437** / 示例 **18**（15 布局 + 3 弹出菜单）
- 仓库 `README.md` 里的功能描述与 `index.html` 的图例，与实现同步维护；
  新增用户可见功能时一并更新，避免文档漂移。
