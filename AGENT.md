# AGENT.md：foxy-editor 代理前置规则

本文件是 `foxy-editor/` 的改动前前置注入词。它只保留代理立即需要执行的当前规则；历史背景、旧实现和取舍证据见 [`docs/history/project-history.md`](docs/history/project-history.md)。

## 1. 开始前必须知道

- 这是 Foxy 的纯前端、零构建、零运行时依赖编辑器；`index.html` 必须可以直接用 `file://` 打开。
- 格式规则以 `skills/SKILL.md` 和 `skills/*.schema.json` 为准，不要凭 UI 直觉修改 Foxy 语义。
- 不要把本工具扩展成 Foxy App 的全局设置页。主题文件可以编辑，但全局主题选择、跟随系统等设置不在范围内。
- 不要用 f5a-see-me 的数据格式替换 Foxy 格式；只借鉴交互方式。
- 宽松 JSON 导入是当前能力：检查、修复并提示；导出保持严格 JSON。
- 项目历史中的旧数字和旧实现只用于追溯，不能覆盖当前源码、测试和本文件的现行规则。

## 2. 两份文件必须同步

同一份 `AGENT.md` 存在于：

- `<工作区根>/AGENT.md`：整个工作区的便捷副本；
- `<工作区根>/foxy-editor/AGENT.md`：仓库内权威副本。

两份必须逐字节相同。只编辑仓库内副本，然后在 `foxy-editor/` 目录运行：

```bash
node tools/check-agent-sync.js --write
node tools/check-agent-sync.js
```

根目录副本不属于 `foxy-editor` 仓库，不能单独编辑后当作项目改动。

## 3. 当前验证门槛

改任何代码、示例、解析逻辑或 UI 后，至少运行：

```bash
node test/test-core.js
node test/test-ui.js
```

当前基线是 core 814、UI 1651，两个套件都必须 0 失败。Foxy 数据契约门禁：

```bash
node test/conformance-adapter.js   # conformance v1 共 46 项检查，必须全过
```

`conformance/` 是 Foxy 作者提供的可执行数据契约（`conformance/README.md`）：给定输入 JSON，Foxy 端的编译结果必须与 `cases/<case>/expected.json` 逐字段一致。它是 Foxy 语义的权威判据，`skills/SKILL.md` 与它冲突时以契约为准。改过解析、变体、手势、网格或校验逻辑后必须重跑。

涉及对话框控件、下拉选中态或保存写回时，DOM 桩之外还要跑真实浏览器冒烟（本机 Edge / Chrome headless + CDP，零依赖）：

```bash
node tools/macro-ref-smoke.js   # 宏调用 / 动作名「显示即已选」：两条入口路径都写对 {macro: 名称}
```

按改动范围追加：

```bash
node test/test-color-source.js   # 改过 color-source.js 或颜色链路
node test/check-real-files.js    # 改过示例、解析、导出或格式对齐
node tools/build-examples.js     # 改过 examples/ 或示例打包映射
```

颜色测试当前基线为 111；真实文件体检当前覆盖 46 个文件且必须 0 错。涉及拖动、取色、对话框关闭、滚动恢复、真实触摸或视口溢出时，测试桩通过不够，还要在真实浏览器中补验。

## 4. 数据与架构不变量

- 唯一状态源是 `FE.state`；新增状态字段要放在统一 state 定义中并说明用途。
- 数据变更必须走 `mutate(fn)`，由它负责快照、执行、`afterChange()`、重校验和刷新。
- layout 与 popup 的撤销快照要一起恢复；不要为 popup 或符号面板另建互相独立的历史栈。
- 纯逻辑函数通过 `FE.xxx` 导出；跨文件调用用 `if (FE.xxx)` 保护加载顺序。
- 渲染和编辑器消费 `FE.compileSections(sections, status, scope)` / `FE.compileLayout(profile, layoutName, opts)` 的编译产物，不要在新渲染处自行解析或调用 `evalPlacement`。
- 解析类函数显式接收并向下传递 `scope`，不要临时覆盖全局 `state.profile`。
- DOM 使用项目已有的 `h`、`clearEl` 和模块模式；新增节点同时更新 `test/dom-stub.js` 的 `buildSkeleton()`。
- 新增脚本模块时同步 `index.html` 的 `<script>` 顺序、`test/test-core.js` 和 `test/test-ui.js` 的 `load()` 列表。

## 5. Foxy 语义与校验

- 字段优先级固定为：定义链 < `override` < 直接字段。
- 保存时按现有约定扁平化 `override`，不要改变解析结果。
- `null` 按 Foxy 语义处理：它可能清空标签、恢复默认权重或清除颜色；`tap: null` 保留继承的点击动作。
- `drag: null` 删除整条拖动手势；`swipe` 与 `drag` 的方向置 `null` 只删该方向，其余方向保留。
- 变体条件按三态求值（真 / 假 / 中性），不要退化成布尔：未在活动 schema 声明的选项名是中性，未知条件关键字才是不匹配。求值入口是 `FE.condResult`，摘要入口是 `FE.condSummaryText`。
- `modifier` 是 SHIFT / CTRL / ALT / META 四值枚举（大小写不敏感），既是 `key.action` 里 `type: "modifier"` 的 `modifier`，也是键/override/变体上的 `modifier` 字段；后者显式 `null` 表示「这个位置不是修饰键」。取值来源只有 `FE.MODIFIERS` + `FE.canonicalModifierName`（另有 `FE.isModifierName`），不要另抄一份数组。
- 声明了 `modifier` 的键长按会隐式锁定该修饰键，不写 `longPress` 也成立；写了显式 `hold` 手势则关闭该回退。没有 `modifier` 的原始键（如 `rime.Alt_L`）长按只发本键、不参与锁定。编辑器不建模按压时长，因此这条语义不产生校验规则（`hold` 与 `longPress` 仍互斥报错），只在键对话框给提示。
- 预览的修饰键模拟表是 `state.status.modifiers`（四值布尔）；`status.shift` 是历史字段，决定 `shiftedLabel` / 弹出候选，并作为 SHIFT 的镜像。判定某键是否进入 `modifierActive` 一律走 `FE.keyStateOpts` + `FE.statusModifierOn`，不要在任何渲染处写死 `'SHIFT'`。
- 键的 `icon` 只有 backspace / shift / enter / return 是内置名；其余名字先查 profile 顶层 `icons`，再看是否 `svg:` / `xml:` 内联载荷；查不到就不画图标（回落文本），不要报错。
- `FE.validateProfile` 的 `errors` / `warnings` 字符串数组是兼容 API，不能删除或改类型。
- `issues` 是与旧数组等长的结构化结果，保留 `level`、`message`、`path`、`code` 和点击定位坐标。
- 新校验规则必须同时提供稳定 code 和定位信息；合并 issue 时不能丢坐标。
- 导入使用 `FE.inspectJsonText`、`FE.sanitizeJsonText`、`fixJsonText` 的既有路径；修复失败要如实报告。

## 6. 预览与网格护栏

- `FE.MAX_GRID_CELLS = 4000` 按实际要创建的 DOM 节点数保护，不按网格面积或旧阈值截断。
- 网格轨道使用 `minmax(0, …fr)`，键标签单行；间距和字号随格子尺寸缩放，不写死固定值。
- `rowHeights.length` 必须等于 `rows.length`，否则 Foxy 可能丢弃整个布局。
- 行读取使用 `FE.rowsOfSection`、`getRowKeys(section, ri)` 和归一化结果；不要假设每行都是数组。
- 分体和横屏是不同模式：`splitMode` 编译 split，`landscapeMode` 只加宽正常 sections，两者互斥。
- 分体尺寸使用 `portraitW` 与 `unit = portraitW / 10`；不要在 JS 与 CSS 两边重复乘宽度。
- 不给 `.kb` 宽度加 transition；切换模式后按现有 rAF/重新测量流程取尺寸。

## 7. 对话框、控件和历史

- `close()` 只做已获许可后的内部关闭；用户主动关闭必须用 `requestClose()`；跳转类动作使用 `leaveThen(fn)`。
- 新编辑类对话框接入 `FE.snapshotGuard` 和 draft 改动检测；无改动时 `onBeforeClose` 同步返回 `true`。
- 使用 `FE.uiAlert`、`FE.uiConfirm`、`FE.uiPrompt`，不要调用浏览器原生提示框。
- `FE.buildActionEditor(spec, opts)` 是按键、popup、动作和宏共用的动作编辑器，不重复造步骤控件。
- 控件局部修改走 `opts.commit` / `commitActionEdits()`，只静默写回、压历史、重校验和刷新 JSON；结构变化才走 `mutate()`。
- `beginGesture()` / `endGesture()` 将连续取色合并为一次历史；颜色行的 apply 必须幂等。
- jscolor 的 Foxy `#AARRGGBB` 写 CSS 前转为 CSS `#RRGGBBAA`；颜色控件重建后重新安装 picker。
- 「界面上看起来已选中的」必须等于「保存出去的值」：下拉一渲染就必然显示某项，所以重建字段区的函数要在渲染时把首项回写进内部状态（`if (!macroName && names.length) macroName = names[0];`），保存时以 DOM 显示值为准（`area._macroSel.value`）。只在 `change` 里更新内部变量会造成「显示已选、状态为空」，用户撞上「请选择宏」却无从下手；宏调用与动作名两条来源都要按此写，`js/popup-editor.js` 的 `sel.value = draft.actionName || acts[0] || ''; draft.actionName = sel.value;` 是同一范式。
- 手势对话框重建字段区前先作废旧控件引用（`area._actSel = null; area._macroSel = null;`）；`FE.snapshotGuard` 快照要按当前来源过滤（`modeSel.value === 'macro' ? macroName : null`），否则切过去再切回来会被判成有未保存改动。


## 8. 文件、引用和示例

- 布局、popup、definitions、theme、symbol 数据要区分文件类型；不要把 `symbols`、`emoji`、`kaomoji` 当布局名。
- 多文件导入通过 `FE.planFolderImport(entries)` / `FE.buildProfileFromPlan(plan, layoutPath)` 规划，definitions 合并不修改输入对象。
- 单文件、示例或 JSON 导入后清空 `state.folderPlan`、`state.folderDefs`、`state.folderLayoutPath`、`state.folderHint`。
- 导出分包使用 `FE.splitProfileForExport()`；未改共享项回到 definitions，改动项留在布局文件。
- `FE.buildRefIndex(profile, popupProfile)` 必须覆盖 key、action、macro、icons 四类；对象就地修改后显式 `invalidateRefIndex()`。
- 顶层 `icons` 与 `definitions.json` 的 `icons` 一起走 `FE.mergeDefinitions` / `FE.splitProfileForExport`，不要另开一条合并路径。
- 示例既是用户入口也是测试语料。修改 `examples/` 后先跑 `node tools/build-examples.js`，再跑 core、UI 和真实文件体检。
- `tools/build-examples.js` 要保留 layout、popup、theme、symbol 的分类映射；不要用会误伤颜文字的正则删除字符串内 `//`。

## 9. 主题、符号和响应式界面

- 主题颜色优先级为：布局状态色 > 布局每键 `colors` > 主题 `keyTypes` > 主题全局色。
- 预览工具栏的边框、描边、滑动提示开关只影响预览，不写入主题 JSON；关闭阴影时显式写 `none`。
- 预览第一行的 Shift / Ctrl / Alt / Meta 是修饰键模拟开关（`#pt-shift` / `#pt-ctrl` / `#pt-alt` / `#pt-meta`），只影响当前声明了同名 `modifier` 的键；新增开关要同步 `test/dom-stub.js` 的状态组桩。
- `candidateBarColor` 按 `key_border_enabled` 决定是「候选栏/工具栏容器底色」还是「同键盘底色」；`accentColor` 是工具栏选中态。
- 符号面板选中分组的文字/背景分别走 `symbolTabHighlightTextColor` / `symbolTabHighlightColor`，未设置时按 `FE.THEME_FIELD_FALLBACK` 回退 `toolTextColor` / `candidateHighlightColor`（不是 `THEME_ROLE_FIELD`，那是布局角色映射）。
- 键盘上方工具栏预览由 `js/toolbar-preview.js` 画在 `#preview-toolbar`，而 `#preview-toolbar` **嵌在 `#preview-kb` 内部**、是键盘面板最上面那一行（实机同底色同宽度，单独成条会假造出宽度/底色差异）。它不自带宽度、圆角和底条；`renderPreview` 里 `clearEl(host)` 之后必须把它挂回首个子节点，**符号面板页同样要挂回并重画一次**（实机打开符号面板时工具栏不会消失，`app.js` 符号分支 `host.insertBefore(toolbarHost, host.firstChild)` + 再调一次 `FE.renderPreviewToolbar`，两页签用同一个 unit → 切换不跳变）。**不再有展开/收起两态**（用户口径 m08645）：`FE.toolbarAllIds(cfg)` 把 `main` + `expanded` 去重保序拼成**一条完整列表**（按 `FE.TOOLBAR_SAME_BUTTON` 的按钮身份去重：`theme` 与 `keyboard_tools` 是实机同一个按钮，同 label「主题」、同 `ic_tool_theme`、同点击 `r5.a`，见 `at0.java:1440` / `:1447-1450`；先出现者保留，默认留下主组的 `keyboard_tools`），全部按钮一次画在同一行里，**不会出现两个一模一样的主题按钮**；行尾**没有**展开/收起箭头，也不给它留 `padding-right`（留了会凭空多出可滚动量），所以工具栏高度与行数在任何操作下都不变；装不下时由轨道横向拖动查看。`keyboard_tools` 有图标（实机 `r71.f0` 复用 `ic_tool_theme`，显示名取 `tool_theme`=「主题」），不是纯文字 chip；主题包只给了「主题2.svg」时靠 `FE.TOOLBAR_ICON_ALIAS = { keyboard_tools: 'theme' }` 借用同一枚图标 —— **不允许一边主题图标一边内置调色板**，`theme` 自己有图标时别名不覆盖它。`rime_switches` 走**文字 chip**（实机 `iconRes = 0`，`at0.java:1533-1573`），文字取该 switch 的 `states` 项，**文案以 App 源码为准**：内置 `pinyin_simp.schema.yaml` / `stroke.schema.yaml` 里 `ascii_mode` 是 `reset: 0`、`states: [ 中文, 西文 ]`，故 `RIME_STATES = ['中文', '西文']`（写原字，不缩写不取首字）并按 `state.status.ascii_mode` 取值，跟着 `#pt-ascii` 复选框联动（`change` 已走 `renderPreview()`）；文字 chip 必须 `flex:0 0 auto` + `white-space:nowrap`，否则被 flex 压扁/裁切。
- 工具栏是**横向滚动轨道**：结构 `.kbt`（= `#preview-toolbar`，宽度=键盘面板宽）> `.kbt-track`（`overflow-x:auto`，唯一滚动视口）> `.kbt-row`（`width:max-content` + `min-width:100%` + `nowrap` + `space-around`）；chip 一律 `flex:0 0 auto` **不收缩**，宽度不够就横向滚，绝不压扁。两端渐隐层挂在 `.kbt` 上（`position:absolute`，**在轨道外**），滑动带不走它。拖动/滚轮交互在 `bindTrack()`：pointerdown/move/up 改 `scrollLeft`（`setPointerCapture` 必须 `typeof … === 'function'` 守卫，DOM 桩没有），拖动后置 `suppressClick` 吞掉误触 click，滚轮只在 `scrollWidth > clientWidth` 时接管（否则不抢页面纵向滚动）；滚动位置记在标量 `scrollMemo`（只有一条工具栏）。`expanded` 组在 App 默认 4 项后追加 `voice`（用户要求），整行仍 `nowrap` 单行。尺寸常量来自 `os.java` / `w20.java` / `mf.java`，dp 换算一律走 `FE.kbDp`。
- 工具栏按钮与主题图标用**显式文件名映射表**（`FE.toolbarIconMatch`）配对，不许按中文名模糊匹配——水彩包里有「分体 / 分体激活」这类成对图标，模糊匹配会把两态混成一张。
- 工具栏 chip 用不用激活图标只看 `FE.toolbarActiveSet()`（等价 `w20.java:279` 的 `os.k.contains(id)`）：全反编译里 `os.k` 只有 `size` / `one_hand` / `split_keyboard` 三处写入，其余按钮永不激活；**「显示出来」不等于「激活」**——把 `expanded` 组当 active 传下去会让主题的「*激活.svg」（水彩包画成「图标 + 一道粗斜杠」）全变成看似的禁用占位。
- 图标要不要被主题色染色由 `FE.iconTintable` 判定（等价 `hk0.w`）：全 svg 的 `fill` / `stroke` 都是 `currentColor` / `none` 才染色，出现任何实色就原样渲染。
- 符号字体预览由 `js/font-preview.js` 接管：`--kb-preview-font` 挂在 `.kb-label` / `.kb-hint` / `.kb-badge-lp` 上（App 端 KEY_MAIN 与 KEY_ALT 是两个槽，编辑器只有一个导入入口）。覆盖度按当前布局**实际用到的字符**比对并如实报告缺失（实机回退系统字体）；解析失败不能阻断渲染。
- 工具栏图标、字体、工具栏显隐都只是预览状态（`state.previewToolbar` / `state.toolbarIcons` / `state.previewFont*`），**不写入任何 Foxy 文件**；autosave 只存图标文本与开关，不存字体二进制。
- 符号事实来源是 `state.symbolProfiles[kind]`；snapshot、restore、autosave、boot 都处理复数槽位。
- 符号预览替换同一个 `#preview-kb`，左右列滚动容器设置 `min-height: 0`；内容挂载后再恢复类别 scrollTop。
- 搜索/新建工具条覆盖 keys、actions、macros、popup、symbol；重建列表时保持滚动位置。
- 列表重建的恢复帧使用 `scrollRestoreSeq`，任何有意滚动前调用 `FE.cancelScrollRestore()`。
- 移动端布局依赖 `style.css` 的两段 `@media (max-width: 640px)` 规则；改 CSS 时不能覆盖单列、大触摸目标和近全屏弹窗。

## 10. 标准工作流

```bash
cd foxy-editor
# 修改代码或文档
node test/test-core.js
node test/test-ui.js
node test/conformance-adapter.js
# 按改动范围运行 build-examples.js、test-color-source.js、check-real-files.js、tools/macro-ref-smoke.js
# 修改 AGENT.md 后同步并校验两份副本
node tools/check-agent-sync.js --write
node tools/check-agent-sync.js
```

改动前的最小检查：

- 格式语义变更：先读 `skills/SKILL.md` 与相关 Schema；
- DOM 变更：同步 DOM 桩与 UI 断言；
- 新模块：同步脚本顺序和两套测试的加载列表；
- 示例变更：重打包并做真实文件体检；
- 解析、渲染和数据变更：确认使用 `scope`、编译产物和 `mutate()`；
- 远程操作：不要自动 `git push`，推送由用户决定。
