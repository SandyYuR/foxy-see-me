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

当前基线是 core 629、UI 1425，两个套件都必须 0 失败。按改动范围追加：

```bash
node test/test-color-source.js   # 改过 color-source.js 或颜色链路
node test/check-real-files.js    # 改过示例、解析、导出或格式对齐
node tools/build-examples.js     # 改过 examples/ 或示例打包映射
```

颜色测试当前基线为 96；真实文件体检当前覆盖 46 个文件且必须 0 错。涉及拖动、取色、对话框关闭、滚动恢复、真实触摸或视口溢出时，测试桩通过不够，还要在真实浏览器中补验。

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

## 8. 文件、引用和示例

- 布局、popup、definitions、theme、symbol 数据要区分文件类型；不要把 `symbols`、`emoji`、`kaomoji` 当布局名。
- 多文件导入通过 `FE.planFolderImport(entries)` / `FE.buildProfileFromPlan(plan, layoutPath)` 规划，definitions 合并不修改输入对象。
- 单文件、示例或 JSON 导入后清空 `state.folderPlan`、`state.folderDefs`、`state.folderLayoutPath`、`state.folderHint`。
- 导出分包使用 `FE.splitProfileForExport()`；未改共享项回到 definitions，改动项留在布局文件。
- `FE.buildRefIndex(profile, popupProfile)` 必须覆盖 key、action、macro；对象就地修改后显式 `invalidateRefIndex()`。
- 示例既是用户入口也是测试语料。修改 `examples/` 后先跑 `node tools/build-examples.js`，再跑 core、UI 和真实文件体检。
- `tools/build-examples.js` 要保留 layout、popup、theme、symbol 的分类映射；不要用会误伤颜文字的正则删除字符串内 `//`。

## 9. 主题、符号和响应式界面

- 主题颜色优先级为：布局状态色 > 布局每键 `colors` > 主题 `keyTypes` > 主题全局色。
- 预览工具栏的边框、描边、滑动提示开关只影响预览，不写入主题 JSON；关闭阴影时显式写 `none`。
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
# 按改动范围运行 build-examples.js、test-color-source.js、check-real-files.js
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
