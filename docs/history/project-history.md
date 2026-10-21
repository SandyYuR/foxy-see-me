# foxy-editor 项目历史与决策记录

> 本文档把原先散落在 `README.md` 与 `AGENT.md` 中的历史沿革、取舍理由、旧行为、修复记录和验证证据集中保存。它是给用户、维护者和新代理阅读的项目记录，不替代当前格式规范：格式以 `skills/SKILL.md` 与 `skills/*.schema.json` 为准，当前改动流程以 `AGENT.md` 为准。
>
> 记录口径：原文明确给出的提交号、日期、路径、命令和测试数字照录；无法从现有材料确定的时间不臆造。文中“历史基线”表示当时的数字，不表示当前状态。

## 目录

- [1. 项目起点与总体路线](#1-项目起点与总体路线)
- [2. 长期有效的决策记录](#2-长期有效的决策记录)
- [3. 核心数据、解析、校验与预览演进](#3-核心数据解析校验与预览演进)
- [4. 几何与响应式预览](#4-几何与响应式预览)
- [5. 编辑器界面与主题功能演进](#5-编辑器界面与主题功能演进)
- [6. 文件流与高级编辑功能](#6-文件流与高级编辑功能)
- [7. 验证基线与文档维护记录](#7-验证基线与文档维护记录)
- [8. 维护者速查：改动影响面](#8-维护者速查改动影响面)

## 1. 项目起点与总体路线

### 1.1 原始任务

项目最初的目标，是利用工作区中已有的 Foxy 键盘布局示例、技能文档和格式资料，仿照 [f5a-see-me](https://github.com/SandyYuR/f5a-see-me) 的交互方式，为小狐狸 Foxy 输入法制作一个纯前端键盘布局编辑器。原始任务强调的是：

- 在浏览器里可视化编辑键盘布局；
- 每次修改后立即显示渲染结果；
- 导出 Foxy 可以直接读取的 JSON；
- 主题编辑原本可以不做，把重点放在可视化布局编辑；
- 工具应尽量可以直接打开，不依赖复杂构建环境。

首版提交记录为 `897a9ad`。首版就确定了几个后来一直没有改变的方向：编辑器不是 Foxy App 的替代品，不负责运行时输入法设置；它只负责布局、相关文件的可视化编辑、校验和导出；格式解释必须贴近 Foxy 自身，而不是另造一种“看起来更干净”的编辑器格式。

### 1.2 产品边界逐步明确

当前编辑器的文件范围已经从单一键盘布局扩展成一组互相关联但职责不同的 Foxy 文件：

- `foxy.keyboard-layout`：键盘布局主文件；
- `foxy.popup-profile`：弹出菜单文件；
- `definitions.json`：可被布局和弹出菜单引用的共享定义；
- `foxy.keyboard-theme`：独立主题文件；
- 符号、emoji、颜文字面板文件。

编辑器仍不做 Foxy App 的全局主题设置，例如系统跟随、主题列表选择和 App SharedPreferences。编辑器可以编辑主题文件，也可以在预览工具栏里调整只影响预览的外观开关，但这些不能被误写成主题 JSON 的字段。

### 1.3 主要阶段

下表按现有文档中可核对的记录归纳，不是完整 Git 提交日志：

| 阶段 | 可核对的记录 | 主要结果 |
| --- | --- | --- |
| 首版 | `897a9ad` | 建立纯前端编辑器、实时预览、Foxy 格式校验和基本导出路线；历史测试基线为 157 项。 |
| 导入修复阶段 | `f99203a` | 增加宽松 JSON 检查与一键修复；历史基线升到 275 项。 |
| 编辑器模块化阶段 | 原 AGENT 记录为 core 215 + UI 355 的阶段 | 逐步拆出对话框、弹出菜单、动作宏、引用索引、列表工具条等 UI 模块，并以自制 DOM 桩测试。 |
| 示例与多文件阶段 | `tools/build-examples.js`、`folder-import.js` | 把工作区样本打包为可离线运行的示例，支持 `definitions.json`、布局、popup 的整包导入和分包导出。 |
| 主题与符号阶段 | 记录为 2026-09 修订 | 加入 `foxy.keyboard-theme` 编辑、主题预览、符号/emoji/颜文字面板；仍不做 App 全局主题设置。 |
| 网格与设备验证阶段 | 记录为 2026-09-29 的 `16键.json` 实测 | 修正 numpad 网格轨道、文字溢出、rowHeights 和真实移动端触摸/滚动方面的问题。 |
| 对齐新版 skill 阶段 | 2026-10-20 实测 | 补上自定义图标（顶层 `icons`）、`drag` 连续拖动手势、`variants` 三态条件（`option` / `value` / `options` / `all_of` / `any_of` / `none_of`）与两个新 app 命令；core 715、UI 1461。 |
| 四修饰键阶段 | 2026-10-21 实测 | `modifier` 从 SHIFT / CTRL 扩到 SHIFT / CTRL / ALT / META，补齐键/override/变体的 `modifier` 字段校验，预览加 Ctrl / Alt / Meta 修饰键模拟；core 739、UI 1472。 |
| 当前阶段 | 本次文档重组前后实测 | core 739、UI 1472、颜色解析 96、真实文件体检 46 个示例且 0 错误。 |

## 2. 长期有效的决策记录

这些决策原先写在 AGENT 的“缘起与既定决断”中。它们的背景现在集中记录在这里；改代码时只需把其中已落地的硬约束看作当前规则，具体执行入口见 `AGENT.md`。

### D1：仿照的是交互，不是实现或格式

**背景：** 原始任务提到 f5a-see-me，因此最容易出现的误解是复制对方的数据结构或把本项目改造成对方的实现。

**决策：** 只借鉴可视化编辑、即时反馈、工具栏和预览交互；数据模型、校验、导入导出和文件目录必须遵循 Foxy 的实际格式。Foxy 文件不是 f5a-see-me 文件的别名，编辑器也不能为了 UI 方便而改变 Foxy 的语义。

**影响：** 格式问题先查 `skills/SKILL.md` 和三个 Schema；预览层可以使用编译中间层，但导出仍要回到 Foxy 能读取的 JSON。

### D2：加入主题文件和符号面板，但不加入全局主题设置

**原始状态：** 原始任务明确说主题部分可以去除，因为主题是 Foxy 的全局设置，不属于布局文件。

**修订：** 2026-09 用户明确要求支持独立的 `foxy.keyboard-theme` 文件编辑，并要求符号、emoji、颜文字面板可编辑。决策因此修订为：

- 编辑器支持主题文件的字段编辑、颜色读取、导出和预览；
- 编辑器支持符号/emoji/颜文字数据的编辑和预览；
- Foxy App 的全局主题列表、跟随系统等设置仍不在本项目范围；
- 预览工具栏的边框、描边和滑动提示开关只是 App SharedPreferences 的模拟，不写入主题 JSON。

**影响：** 主题编辑器按 App 格式的完整字段面实现，而不是只实现样本里偶然出现的颜色；符号数据必须使用 `state.symbolProfiles[kind]` 的复数槽位保存，不能只保存当前镜像。

### D3：纯前端、零构建、零依赖、可直接打开是硬约束

项目不是必须先启动开发服务器才能工作的 SPA。`index.html` 可以直接通过 `file://` 打开；示例通过 `js/examples-bundle.js` 打包进页面，不能依赖页面运行时用 `fetch` 读取本地目录。

**因此保留的做法：**

- 使用普通 HTML/CSS/JavaScript 和 `<script>` 顺序加载；
- 不引入 npm 运行时依赖来替代现有逻辑；
- 文件夹导入使用浏览器的文件选择能力，而不是假设浏览器能知道用户选择的目录；
- 可选的真实浏览器预览脚本可以使用本机已有 Edge/CDP 或用户另行安装的 `playwright-core`，但这些不进运行时仓库。

早期 README 曾写过“通过 HTTP 打开时使用 `examples/` 目录”。后来所有示例都打进 bundle，当前文档不再把 `examples/` 作为运行时网络目录。

### D4：使用自制 DOM 桩，不替换成 jsdom

`test/dom-stub.js` 是项目测试环境的一部分。它的目标不是模拟完整浏览器，而是以零依赖方式提供项目实际使用的 DOM API。

保留自制桩的原因：

- 测试可以直接用 `node test/test-core.js` 和 `node test/test-ui.js` 运行；
- jscolor 的 ARGB 字节序、事件注册、滚动回调等项目约定可以被明确写进桩；
- 换成 jsdom 会引入依赖和另一套未必相同的行为，尤其是颜色控件和简化布局计算。

代价也被记录下来：桩不提供真实布局、真实 CSS 选择器能力和真实触摸滚动，因此涉及 `clientWidth`、scrollTop 恢复、pointerType 或视口溢出的改动必须额外用真实浏览器验证。

### D5：宽松 JSON 导入是刻意保留的能力

编辑器用户经常拿到手工维护的 Foxy JSON，其中可能有注释、尾逗号、BOM 或轻微格式问题。`cc lite.json` 曾记录过 48 处尾逗号；如果编辑器只接受严格 JSON，用户无法开始编辑。

因此导入和导出的策略分开：

- 导入先由 `FE.inspectJsonText` 检查并给出问题；
- `FE.sanitizeJsonText` / `fixJsonText` 只做有证据的自动修复；
- 修复成功后把变更结果和提示展示给用户；
- 修复后仍不能解析时如实报错，不能显示虚假的“已修复”；
- 导出保持严格、稳定、适合 Foxy 直接读取。

这个决策在 `f99203a` 记录的修复阶段落地。任何把导入重新改成“一遇非标准字符就拒绝”的改动，都必须先重新审视这个用户场景和现有测试。

### D6：保存时扁平化 `override`

Foxy 的字段来源顺序是：

```text
定义链 < override < 直接字段
```

保存时把 `override` 中有效字段扁平化为直接字段，目的是保持解析结果和用户看到的编辑结果一致；如果保留多层临时结构，导出的文件在 App 端可能出现不同的优先级解释。

这条规则与 `null` 语义配套：`null` 可以清空标签、恢复默认权重或清除颜色；`tap: null` 是例外，它表示保留继承的点击动作。不要把所有 `null` 统一删掉或统一当成“无值”。

### D7：校验对齐 Foxy 解析器，不自行发明规则

首版目标就是“与 Foxy 解析器一致的校验器”。对于格式未明确要求的内容，宁可不报一个没有依据的错误，也不要用编辑器自己的理想化规则阻止合法文件。

当前校验接口 `FE.validateProfile` 保持两层结果：

- `errors` / `warnings` 仍是字符串数组，很多旧断言和调用依赖这个历史 API；
- `issues` 是等长的结构化信息，带 `level`、`message`、`path`，并可附带定位所需的坐标与 `code`；
- UI 通过结构化 issue 点击定位到布局、定义、动作或宏中的具体位置；
- 合并新 issue 时必须保留已有坐标，不能用浅层合并把定位数据整块丢掉。

### D8：示例既是用户入口，也是测试语料

`examples/` 不是随手放的演示截图，而是运行时下拉示例、真实文件体检和 UI/core 测试共同使用的输入语料。删除、重命名或改变一个示例，往往需要同步更新：

- `tools/build-examples.js` 的映射和打包结果；
- `test/test-core.js` 的示例分组断言；
- `test/check-real-files.js` 的真实文件检查；
- UI 中的示例选择项和预置分组数量。

因此示例变动后必须重打包并跑对应全套测试，不能只看页面下拉框是否还能打开。

### D9：格式或文档对齐必须配套测试

当格式规范、解析路径、示例打包或可见功能变化时，测试必须同时更新。测试数字的增加不是目的，但它能记录项目从“能显示”逐步变成“能导入、能编辑、能定位、能在手机上验证”的过程。

## 3. 核心数据、解析、校验与预览演进

### 3.1 从直接读取 JSON 到编译中间层

早期各个渲染器会自行解释布局节点，导致同一个字段在布局预览、网格编辑器和校验路径得到不同结果。后来形成了共享的纯数据编译层：

- `FE.compileSections(sections, status, scope)`：把指定状态和解析作用域下的 sections 编译为可消费的节点；
- `FE.compileLayout(profile, layoutName, opts)`：根据布局和模式编译完整预览数据；
- 布局预览、网格编辑器和相关检查只消费编译产物，不再在各处自行 `evalPlacement`。

`app.js` 仍分为纯逻辑段和 DOM/UI 段。纯逻辑函数通过 `FE.xxx` 导出，测试和跨模块调用才能稳定访问；新增渲染器要在 `renderAll` 接入，并用 `if (FE.xxx)` 保护可选模块的加载顺序。

### 3.2 显式解析作用域

解析共享定义、布局和 popup 时，当前对象不应临时写入全局 `state.profile`。历史上曾用“写入全局、执行、finally 恢复”的方式，离线体检或并行校验时容易读到错误的表。

现在解析类函数显式接收并向下传递 `scope`。这样同一个状态树可以在不污染当前编辑对象的情况下检查另一个文件或一个导入计划。新增解析函数如果忘记传 `scope`，会让校验路径和实际编辑路径得到不一致结果。

### 3.3 引用优先级和 null

引用解析必须按 Foxy 的实际顺序处理定义链、`override` 和直接字段。`null` 不是普通 JavaScript 缺省值：它在标签、权重、颜色、点击动作等字段上的含义不同。

这也是为什么编辑器保存时要扁平化 `override`，同时不能粗暴地把 `null` 清理掉。该规则影响：

- 按键属性编辑器；
- 动作和宏编辑器；
- `definitions.json` 合并；
- JSON 文本编辑器；
- 导出回 Foxy 的布局文件。

### 3.4 校验结果和点击定位

`FE.validateProfile` 的字符串数组 API 不能删除，因为已有四十多个位置依赖它。结构化 `issues` 让新功能可以知道错误属于哪个文件、哪个定义、哪个动作和哪个坐标。

新增校验规则时应同时提供：

1. 人类可读的 `message`；
2. 稳定的 `code`；
3. 与数据路径对应的 `path`；
4. 可供 `locateIssue` 使用的定位坐标。

如果只追加字符串，用户能看到错误但无法在编辑器中跳到发生位置。

## 4. 几何与响应式预览

### 4.1 网格护栏按节点数，不按面积

网格预览使用 `FE.MAX_GRID_CELLS = 4000`。护栏按实际需要创建的 DOM 节点数计算，而不是用 `rows * cols` 或网格面积推断。原先逐格判断 `ry * cols + cx >= 400` 会在大网格上错误截断，后来改为按实际节点总数保护页面。

### 4.2 网格尺寸、间距和文字

网格预览的间距与字号必须随可用格子尺寸缩放，不能固定写成 `5px` 或 `18px`。轨道必须使用 `minmax(0, …fr)`，键标签保持单行，否则长文本的最小内容尺寸会撑破轨道。

这不是纯 CSS 偏好，而是来自真实问题：在 414px 宽的五行 numpad 预览中，错误实现产生过 88.2px 高的文字块，而键框只有 54.1px，高出约 17.0px 并相互压叠。修复后文字根据格子尺寸缩放，网格轨道可以收缩，标签不会把邻键挤开。

### 4.3 `rowHeights` 与 Foxy 的整块丢弃

`rowHeights` 的长度必须等于 `rows`。如果长度不匹配，Foxy App 可能直接丢弃整个布局；这与“网页预览看起来还能显示”不是同一个层级的问题。编辑器在校验和生成示例时必须把它当成结构性错误处理。

`row.heightUnits` 由 `FE.rowsOfSection` 归一化。行可能是对象行或数组行，读写应使用 `getRowKeys(section, ri)`，不能假定 `section.rows[i]` 一定是数组。`placementContainer(loc)` 是只读查询，不负责把数组行改成对象行。

### 4.4 分体和横屏

分体模式和横屏模式不是同一个开关：

- `splitMode` 编译 split 布局；
- `landscapeMode` 只是在正常 sections 的基础上加宽；
- 两者互斥。

分体预览使用 `portraitW` 和 `unit = portraitW / 10`。横屏的宽度由 CSS 和容器尺寸调整，不能在 JavaScript 中把尺寸再乘一次。切换布局后需要在下一帧重新测量；不能给 `.kb` 的宽度加 transition，否则测量会落在过渡中间。

### 4.5 移动端实测

仅缩小桌面窗口不足以证明移动端可用。`tools/mobile-preview.js` 的真实检查包含：

- `isMobile`、`hasTouch` 和 CDP `Input.dispatchTouchEvent`；
- 六个页签逐一检查溢出；
- 真实上滑后检查三个浮动按钮是否出现；
- 截图和控制台错误记录到 `.mobile-preview/`，该目录不必入库。

真机仍需补充验证的项目包括软键盘造成的 `visualViewport` 收缩、地址栏对 `100vh` 的影响、真实触摸惯性和系统长按菜单。

## 5. 编辑器界面与主题功能演进

### 5.1 对话框关闭语义

对话框曾出现过一个严重的用户数据丢失问题：遮罩点击直接调用 `close()`，没有询问用户，导致已编辑内容静默丢弃。现在三种动作必须分开：

| API | 用途 | 有未保存改动时 |
| --- | --- | --- |
| `close()` | 已获许可后的内部关闭 | 不负责询问 |
| `requestClose()` | 遮罩、Esc、取消按钮等用户主动关闭 | 先确认 |
| `leaveThen(fn)` | 需要先确认再跳转或切页 | 确认后关闭并调用 `fn` |

`key-dialog.js` 顶部的 draft 快照和 `FE.snapshotGuard` 负责判断是否有改动。无改动时 `onBeforeClose` 必须同步返回 `true`，不能返回一个会让跳转异步化的 Promise。只改 DOM 的 `.value` 而不触发事件时 draft 不变，守卫看不到改动是正确结果。

新编辑类弹框必须接入同一套守卫，不能重新调用浏览器原生 `alert`、`confirm` 或 `prompt`。项目统一使用 `FE.uiAlert`、`FE.uiConfirm` 和 `FE.uiPrompt`。

### 5.2 动作编辑器和颜色控件

`FE.buildActionEditor(spec, opts)` 是按键、popup、动作和宏共用的动作编辑器。控件是每次 `buildFields()` 新建的，`onChange()` 只能操作当前控件或通过重新构建表单反映结构变化。

jscolor 的颜色值和 CSS/JSON 顺序不同。项目保留它的字节序约定：输入可能是 `#RGB`、`#ARGB`、`#RRGGBB`、`#AARRGGBB`，导出统一为八位格式；写入 CSS 前使用 `foxyColorToCss` 把 Foxy 的 `#AARRGGBB` 转为 CSS 的 `#RRGGBBAA`。每个颜色控件都必须挂到所属对话框，并在表单重建时重新安装 pending picker。

`beginGesture()` / `endGesture()` 用来把一次连续拖动合并成一条历史。`colorRow.apply` 必须幂等；否则 jscolor 和普通输入各注册一次时，一次手输会压入两条历史。

### 5.3 主题文件和预览优先级

主题编辑器按 App 的完整字段面实现：全局颜色加上 `keyTypes` 中 LETTER、FUNCTION、ACTION 三类各十个字段。`light` 和 `dark` 是槽位，不代表槽位里的颜色一定具有“深色外观”；样本中 `春.json` 的 `dark` 看起来较浅并不构成格式错误。

预览颜色优先级从高到低为：

1. 布局状态色；
2. 布局每键 `colors`；
3. 主题 `keyTypes[键类型]`；
4. 主题全局颜色。

`color-source.js` 用 `themeSlot()` 返回 `null` 区分“没有导入主题”和“导入主题但颜色值为空”。没有主题时预览回退到 App 内置默认值。主题与布局颜色不能互相覆盖错误，尤其不能让低优先级主题颜色盖住布局每键颜色。

### 5.4 预览外观开关

边框、描边、滑动提示总开关以及 side/up/down 方向开关只作用于预览，不写进主题文件。边框和描边必须同时打开才显示描边；总滑动提示关闭时不创建方向元素；left/right 共用 side。

曾经出现过“边框关了但键上仍有向下偏移的实色块”，原因是只改了行内背景，忘记同步 CSS vars/阴影链。现在两条渲染链必须同时处理，关闭阴影时显式写 `none`，不能让 `var()` 的默认值重新显示阴影。普通非 ACTION 键在边框关闭时使用 `keyboardColor`，ACTION 键保持 `keyTypes` 底色。

### 5.5 符号、emoji 和颜文字

符号数据的事实来源是 `state.symbolProfiles[kind]`。`state.symbolProfile` 只是当前类别的镜像，不能作为唯一持久化字段；snapshot、restore、autosave 和 boot 都要覆盖复数槽位。

预览规则：

- `multiLine=true` 时一格一行并自适应；
- `multiLine=false` 时固定六格一行、40dp 目标尺寸；
- 长条目按比例缩小而不是裁切；计数按字形簇而非 UTF-16 code unit；
- `symbols`、`emoji`、`kaomoji` 作为 `switch_layout` 目标时识别为符号面板，不能当自定义布局名；
- 外部符号文件必须在 Foxy 设置中显式选中，同名文件不会自动覆盖 APK 内置数据；
- 符号面板不显示“使用数”按钮。

符号预览替换同一个 `#preview-kb` 容器，而不是在键盘预览上叠一层。左右列各自滚动并设置 `min-height: 0`；类别切换后要恢复左列 scrollTop，恢复动作必须发生在内容填充和节点挂载之后。早设 scrollTop 的实现曾在自制 DOM 桩里通过、在真实浏览器里失效。

### 5.6 工具栏预览、符号字体与图标选择器

这三项来自同一个用户诉求：网页编辑器要和实机显示对得上，作者才能判断一套主题到底好不好看。

**键盘上方工具栏**（`js/toolbar-preview.js`）画在 `#preview-toolbar`，而 `#preview-toolbar` **嵌在 `#preview-kb` 内部**、是键盘面板最上面那一行——最初把它做成 `#preview-kb` 的兄弟节点，立刻显出两个假差异：条比键盘窄、底色对不上（`os.java` 里工具栏容器和键面是同一块 `setBackgroundColor(a.e())`）。所以它不自带宽度、圆角和底条，`renderPreview` 在 `clearEl(host)` 之后要把它挂回首个子节点（工具栏节点用一个模块级引用 `toolbarHostRef` 兜住）。**符号面板页也要挂回**：早期符号分支渲染完就 `return`、不重挂，工具栏在符号页消失，与实机不符（实机打开符号面板时工具栏照样在）。现在符号分支在 `FE.renderSymbolPreview` 之后 `host.insertBefore(toolbarHost, host.firstChild)` 再调一次 `FE.renderPreviewToolbar(toolbarHost, state.portraitW/10)`；符号面板高度按 `units × unit × HK` 与布局预览同口径，所以两页签的键盘面板**高度一致、切换不跳变**。尺寸常量照 `os.java` / `w20.java` / `mf.java` 还原：容器行高 40dp、chip 最小 40dp 见方、圆角 12dp、chip 间距 3dp、字号 18sp、内边距水平 10dp / 垂直 2dp。dp 换算一律走 `FE.kbDp(dp, unit)`，和键盘共用同一个 `unit = portraitW / 10`，所以工具栏与键盘同宽（614px，分体/横屏 1228px）。

配色按 `c30.java` 的字段映射还原：容器底 = `keyBorderEnabled ? altKeyboardColor : candidateBarColor`，chip 默认底 `candidateBackgroundColor`、按下 `candidatePressedColor`，未选中图标/文字 `toolTextColor`，选中（展开容器打开）`accentColor`，返回 chip 文字 `candidateTextColor`。

主工具栏（`main`）和展开工具栏（`expanded`）是**两种状态**，切换时整行重排，不能把两份同时渲染。展开入口是**主态第一行末尾的一个 chip**（`__more__`），不再另起一行写「展开/收起」文字提示。行 `flex-wrap: nowrap`：7 个 40dp 按钮在竖屏 360dp 里放得下，预览里一换行就会让人误判「实机也折成两行」。

后来用户要求「展开键搞小一点、换成向右的箭头、展开后同一个位置变成向左的收起键、展开态不要变成两行、工具栏高度不变」，于是控制键独立成 `.kbt-ctrl`：**28dp 方、圆角 12dp、图标 16dp、`position:absolute` 钉在行尾**（`right:0; top:50%; translateY(-50%)`），行用 `padding-right = ctrlDp + gapDp` 给它让位。两种状态挂的都是同一位置的同一枚按钮，只有 `CTRL_SVG` 的箭头方向反过来（`__more__` 朝右、`__back__` 朝左），所以切换时位置一像素不动，也就不需要 `.kbt-back-row` 那种第二行结构了。早期按 `w20.java:335-357` 做成「返回键浮在 chip 行上方一行」是照实机结构还原，但它与用户「保持工具栏预览高度不变」的诉求冲突，以用户口径为准。

（历史）曾按 `w20.java:335-357` 把展开态的 `__back__` 做成**独占 chip 行上方一行**：`removeAllViews` 之后先把 chip 滚动区以 `topMargin = c(b.a + 8)`（40dp + 8dp = 48dp）加进 FrameLayout，再把「<」以 `LayoutParams(40dp, 40dp, top|start)` + `topMargin 4dp` + `marginStart 4dp` 叠上去 —— 返回键浮在左上角。这是照实机结构还原，但会撑出第二行、工具栏变高，与用户「展开态不要变成两行、工具栏预览高度不变」冲突，现已被行尾控制键方案取代（见下一段）。

主题包的工具栏 svg 靠**显式文件名映射表**（`FE.toolbarIconMatch`）配对，不许按中文名模糊匹配：水彩包里有「分体 / 分体激活」「单手 / 单手激活」这类成对文件，两态颜色完全相同，只有路径细节不同。文件名以「激活」结尾的进 `activeIcon`。匹配不到内置按钮的图标（水彩包里的「删除/数字/星球/月亮/编辑」）如实报告「实机工具栏不会出现」，不静默丢弃也不算错误。

`keyboard_tools` 曾经回落成纯文字 chip，结论是错的：`r71.java` 的 `f0()` 给它 `R.drawable.ic_tool_theme`（复用主题图标）、显示名取 `R.string.tool_theme`＝「主题」。现在 `BUILTIN.keyboard_tools = BUILTIN.theme`，chip 的 `title` 点明「实机显示名是主题」。

图标要不要被主题色染色照 `hk0.w` 的等价实现 `FE.iconTintable` 判定：所有 `fill` / `stroke` 都是 `currentColor` / `none` / 关键字才染色，出现任何具名色或 hex/rgb 就原样渲染。水彩包的 19 个 svg 全自带实色，所以它们保持原色；内置矢量（纯黑/纯白灰阶）走染色。chip 的 `title` 会标注「主题自带实色」还是「内置矢量」，让作者看清来源。

**激活态 ≠ 展开态**。chip 用不用 `activeIcon` 只看 id 在不在激活集合里（`w20.java:279` 的 `z2 = os.k.contains(str)`）。`os.k` 全反编译只有三处写入：`ox.java:882-884` 与 `w20.java:363-365` 的 `teVar.n("size", oxVar.n0.n)` / `n("one_hand", oxVar.o0.j)` / `n("split_keyboard", oxVar.x)` —— 即**只有尺寸菜单打开、单手开、分体开这三种会激活**，`schema` / `deploy` / `settings` / `clipboard` / `keyboard_tools` / `rime_switches` / `hide_keyboard` / `theme` / `voice` 永不激活。早期实现把 `expanded` 直接当 active 传给每个 chip，展开了就全取 `activeIcon`；而主题作者把「*激活.svg」画成「图标 + 一道粗斜杠」（水彩包 尺寸激活 / 单手激活 / 分体激活 就是），于是展开态看起来像 3 个禁用占位。现在由 `FE.toolbarActiveSet()` 按预览真实状态给：只有 `state.splitMode` 会点亮 `split_keyboard`（尺寸菜单 / 单手在预览里没建模，恒 false）。

**符号字体**（`js/font-preview.js`）只影响预览，不写入任何 Foxy 文件。字体通过 `--kb-preview-font` 挂到 `.kb-label`、`.kb-hint`、`.kb-badge-lp` 三处：App 端主标签走 `rv.KEY_MAIN`、提示走 `rv.KEY_ALT`，是两个独立字体槽；编辑器只有一个导入入口，所以两个槽一起挂。这一条是实测出来的：水彩布局 46 个键里 33 个带 icon（实机走 ImageView 不出字），唯一的键面文字是空格键的「朙月拼音」，而它的汉字全在滑动提示位——只挂 `.kb-label` 时导入字体肉眼几乎无变化，正是用户说的「预览与实机有出入」。

覆盖度按当前布局**实际用到的字符**比对（跳过带 icon 的键，收 `label` / `shiftedLabel` / 四个方向的 `hints[d].text`；注意提示挂在 `hints[d]` 而不是 `hints.dir[d]`，且只能取 `text` 不能取 `display`——`display` 是动作名不是画在键上的字）。缺字如实列出并说明实机会回退系统字体，解析失败也不能阻断渲染。CSS 里 `--kb-preview-font` 只写一个 family 名，**不能追加 `, inherit`**：`inherit` 是整体关键字，混进列表会让整条 `font-family` 失效。

**图标选择器**（`FE.buildIconPicker`）取代了原来的原生 `<select>`：内联 `svg:` 载荷作为 option 文本会把下拉撑成横向巨块。现在是紧凑触发器（缩略图 + 名称 + 来源）+ 内联 `.picker-list` 弹层，每项左侧有 22px 真实图标预览。弹层是普通 div 不是 dialog——对话框内再套 dialog 在移动端会失焦。内联载荷的完整代码收在触发器下方的可折叠详情里，不必靠猜。

## 6. 文件流与高级编辑功能

### 6.1 示例打包

`tools/build-examples.js` 根据内容和路径识别示例类型：

- `foxy.popup-profile` → popup；
- `foxy.keyboard-layout` → layout；
- `foxy.keyboard-theme` → theme；
- 没有 `layouts/schemas` 且顶层具有 `{multiLine, groups}` 形状 → symbol。

输出包含 `FE.EXAMPLE_FILES`、`FE.EXAMPLE_META`，以及按类别使用的 `FE.SYMBOL_EXAMPLE_FILES` 和 `FE.THEME_EXAMPLE_FILES`。布局下拉只接受 kind=layout；符号类别通过文件名和类别 id 处理，主题描述优先使用 name。

示例源目录是工作区中的三个目录镜像：

- `布局/`；
- `符号表情定义文件/`；
- `主题配色/`。

特殊映射必须保持：

- `思无邪@foxy/layouts【编辑大字】` 与 `【编辑小字】` 追加 `·大字` / `·小字` 消歧；
- `思无邪@foxy/popups` 追加 `-popup`；
- 主题和符号同名可以保留，因为它们属于不同类别。

原 README 记录的 46 个可体检示例按类别统计为 21 个布局、4 个弹出菜单、3 个符号文件和 18 个主题文件。这个分类是打包结果的记录，不应被写成永远不变的数量；新增或移除示例时要以 `FE.EXAMPLE_META` 和真实文件体检结果为准。

字符串中的 `//` 不能靠正则全部删除，否则颜文字等合法内容会被误伤。示例源中的 `简易/` 分包包含 definitions、layouts、popups；其中单薄布局单独体检会报 16211 个 unresolved ref，但和 definitions 合并后为 0，因此它保留为多文件导入语料，不应拆成互相不完整的示例。

主题配色 17 份与 `思无邪@foxy/themes/春.json` 后来已入库；这不是格式问题，而是打包器最初没有 theme 分支。符号、emoji、颜文字后续加入后，预置分组数量变化，测试必须按类别和实际列表更新，不能写死旧数量。`examples/split.json` 已由 `布局/split2.json` 取代；split2 是超集，布局示例数量随之变化。

### 6.2 多文件布局包导入

多文件导入解决的是 Foxy 的分包布局：布局文件可能只包含少量键，却引用 `definitions.json` 中的 185 个键和 34 个宏。单独检查 `布局/简易/layouts/simple.json` 会得到 16211 个未解析引用，合并 definitions 后为 0。

导入路径保持一个入口“导入 JSON”：

- 一次选择多个文件时直接建立合并计划；
- 选中 definitions 或薄布局时提示“还需选择一次布局包所在的文件夹”，并解释浏览器不会向页面透露目录；
- 隐藏的 `#op-import-dir-file` 只用于代码触发文件选择；
- 纯前端不能承诺使用 `fetch` 自动读取同目录其他文件。

相关纯逻辑接口及职责：

- `FE.classifyFoxyFile(text, path)`：显式 type 优先，其次目录约定，最后结构特征；
- `FE.mergeDefinitions(profile, definitions)`：共享定义同名时本地覆盖共享，不修改入参；
- `FE.collectPopupKeys(profile)`；
- `FE.collectPopupSchemaKeys(popup)`；
- `FE.matchPopupFile(layoutProfile, popupEntries, layoutName)`：覆盖数并列时优先同名，找不到返回 `null`；
- `FE.planFolderImport(entries)`；
- `FE.buildProfileFromPlan(plan, layoutPath)`；
- `FE.splitProfileForExport()`：把未改动共享项放回 definitions，改动项留在布局文件。

导入单文件、示例或 JSON 文本后，必须清空 `state.folderPlan`、`state.folderDefs`、`state.folderLayoutPath`、`state.folderHint`。文件夹上下文不写 localStorage；刷新后当前自包含布局可以继续显示，但要重新导入整包才能再次按分包形式导出。导出再导入后的真实体检结果曾验证为 0 错。

### 6.3 动作与宏的图形化编辑

动作和宏从单纯 JSON 文本框逐步变成图形化编辑器。宏每一步就是一个 `actionExpression`，不另造一个与 Foxy 不兼容的“步骤类型”。`FE.macroStepToDraft` / `FE.macroValueToStep` 等转换必须保持裸字符串、wrapped 和 inline 形态往返。

无法安全覆盖的宏结构、actions 数组或非对象值保持只读，并提供原始 JSON 入口，禁止静默重写。

控件改动使用 `opts.commit`，进入 `app.js` 的 `commitActionEdits()`：

- 静默写回当前 `state.profile`；
- 压历史、重校验、刷新 JSON 文本；
- 不调用 `afterChange()` / `renderAll()`，避免焦点和控件被重建；
- 增删或切换结构才使用 `mutate()`；
- commit 时实时读取 `state.profile`，不能闭包捕获旧对象。

动作/宏卡片默认折叠，首次展开时才构建编辑器。历史测量从约 47.5K DOM 节点、18,741 个 option、53ms 初始时间，降到约 2.2K 节点、24 个 option、7ms；测试锁定折叠状态下不能提前生成编辑器节点。

### 6.4 引用索引、使用数和定位高亮

`FE.buildRefIndex(profile, popupProfile)` 用单遍扫描建立 `{key, action, macro}` 三类索引。每条记录的 loc 可以定位到布局、弹出菜单或定义列表；定义内部引用必须带 `{defKind, defName}`，否则动作和宏页虽然显示引用，却无法点击跳转。

`FE.usageOf`、`FE.outgoingRefsOf` 和 `FE.showUsageDialog` 负责被引用与反向引用。动作本身不展示无意义的 outgoing；悬空引用仍要显示，方便用户修复。

布局 → 宏 → 动作链通过不动点传播计算使用数，最多 8 轮、每个名称最多 200 条结果。缓存不能假定对象换了引用；`mutate` 可能就地修改对象，因此必须显式调用 `invalidateRefIndex()`。静默控件提交只调用 `refreshUsageLabels()`，不重建整个列表。

高亮经历过多次统一：当前使用 `FE.holdFlash` 和 pointerdown/keydown 捕获释放，蓝色用于新建或定义跳转，红色用于校验错误，黄色用于使用数跳转。红色选择器必须覆盖自带的黄色 outline。DOM 桩需要有 `removeEventListener`，否则释放阶段的行为无法测试。

### 6.5 搜索、新建和浮动工具

搜索/新建工具条统一接入 keys、actions、macros、popup 和 symbol 分组列表。`FE.wireSearch` 支持即时输入、按钮和回车；清空搜索时要同步 `FE.syncSearchClear`。新建项追加到末尾，不重排键序，自动滚到新项并短暂蓝色高亮；旧的“新建后立即弹出编辑框”会被遮罩或滚动遮挡，因此已移除。

浮动撤销/重做/回顶按钮贴在中央内容列外缘，而不是固定在视口的任意位置。布局通过 `--content-max`、`--content-pad-x` 和 `.float-layer > .float-rail` 计算；宽屏使用 `left: calc(100% - var(--content-pad-x) + 8px)`，较窄窗口退回 `right: 12px`；滚动超过 `FLOAT_SHOW_AT = 120` 才显示。

列表重建必须保持滚动位置。`afterChange` 中的 `captureScroll` / `restoreScroll` 需要处理两个异步因素：被删除的焦点元素会让浏览器回到顶部，清空列表期间文档变矮会临时夹住 scrollTop。补帧恢复要用 `scrollRestoreSeq`，任何有意滚动到错误位置前先调用 `FE.cancelScrollRestore()`。

### 6.6 对齐新版 skill：自定义图标、drag 与三态条件

2026-10-20 的 `skills/SKILL.md` 与 `foxy-keyboard-layout.schema.json` 更新带来四类格式变化，编辑器按下面的口径补齐；文本类的命令描述修正（`foxy.SelectAll` / `foxy.Cut` / `foxy.Copy` / `foxy.Paste` 改成 native 动作）不影响编辑器行为，未单独改代码。

**自定义图标**。内置名只有 backspace / shift / enter / return；其它 `icon` 值先查 profile 顶层 `icons`（`definitions.json` 的 `icons` 也合并进同一个映射），再看是否 `svg:` / `xml:` 内联载荷。解析链是 `FE.iconSvgOf(icon, scope)` → `iconMapOf(scope)` → `iconMarkupFromPayload(payload)`；清洗会剥掉 `<script>`、`on*` 属性和 `javascript:`，没有 `class` 时补 `class="kb-icon"`。未知名字按文档不画图标、回落文本标签，不报错。这套函数必须放在 app.js 的 UI 守卫之前——早期把它们写在守卫之后，Node 侧根本执行不到，`FE.iconSvgOf` 在 core 测试里是 undefined。

**drag 连续拖动**。`drag` 是对象型手势，独立于 `tap` / `swipe` 家族：`step`（dp，缺省取光标步长设置）、`feedback`（none / vibrate / key，缺省 vibrate）、四个方向各自的每步动作、`end` / `endAction` / `endActions` 松手动作。`FE.dragInfo` 负责解析（支持 `ref` 继承）、`FE.checkDrag` 负责校验 step 与 feedback；`FE.GESTURE_SLOTS` 加了 drag 之后，引用索引、重命名和手势区渲染都自动覆盖。手势对话框里 drag 只有 inherit / ref / direct 三种来源（drag 没有“动作名称 / 宏调用”形态），方向槽位复用嵌套手势对话框，空值与 `null` 分别显示“（继承）”和“（已清除）”。

**三态条件**。变体条件从“三个布尔”扩成布尔 + `option` / `value` / `options` + `all_of` / `any_of` / `none_of` 组合。求值必须保留中性：`FE.condResult` 返回真 / 假 / 中性三态，未在活动 schema 声明的选项名是中性而不是假，未知条件关键字才是不匹配。编辑器拿不到活动 schema 的 `switches` 声明，因此选项名不自动推断，而是把“条件里出现过的名字 + 常开选项”做成预览工具栏开关（`renderPreviewOptionToggles`）；组合条件在图形化编辑器里只读保留、提示改 JSON，避免把它压平成不存在的语义。

`condResult` 的三态容易被写成布尔，早期测试就踩过 `any_of` 的断言：`{any_of:[{option:'not.declared'},{composing:true}]}` 在 `NEUTRAL_STATUS` 下两项都不为真，结果是中性，不是 true。

### 6.7 四修饰键：ALT / META、键级 modifier 校验与长按隐式锁定

2026-10-21 的 `skills/SKILL.md` 与 `foxy-keyboard-layout.schema.json` 把修饰键从 SHIFT / CTRL 扩到 SHIFT / CTRL / ALT / META，并补了一条长按语义。编辑器按下面口径对齐。

**枚举扩为四值**。`FE.MODIFIERS` 是唯一取值来源，从两值改为四值后自动覆盖四处引用：键动作的修饰复选、动作编辑器的 modifier 下拉、键级「修饰键」下拉、以及校验。`FE.canonicalModifierName` 做 trim + 转大写，所以 `alt`、`Meta`、` CTRL ` 都归一；额外导出 `FE.isModifierName` 供校验复用，避免再抄一份数组。

**键级 modifier 从前完全没有校验**。本轮新增 `checkKeyModifier(obj, where, err, code)`：缺字段跳过、`null` 合法（表示「改回普通键」，SKILL.md 要求 `foxy.Shift` 的变体改成普通键时必须显式 `"modifier": null`）、非字符串报错、不在枚举报错，issue code 为 `bad-modifier`。接入点是四处：按键定义、按键定义变体、`checkPlacement` 主体与其变体、以及 `k.override` 与其变体。

**长按隐式锁定**。新增语义是：声明了 `modifier` 的键长按会隐式锁定该修饰键，即使没写 `longPress`；写了显式 `hold` 手势则关闭这个回退；没有 `modifier` 的原始键（如 `rime.Alt_L`）长按只发本键、不参与锁定。编辑器不建模按压时长，因此不新增校验规则（`hold` 与 `longPress` 的互斥检查保持不变），只在键对话框「修饰键」下拉下方给一行说明，避免用户以为必须手写 `longPress` 才能锁修饰键。

**预览的修饰键模拟**。原来只有 `#pt-shift` 一个开关，且 `FE.keyStateOpts` 写死 `eff.modifier === 'SHIFT'`，导致 ALT / META 键永远进不了 `modifierActive`。现在 `state.status.modifiers` 是四值布尔表，`status.shift` 退为历史字段（仍决定 `shiftedLabel` 与弹出候选，并作为 SHIFT 的镜像）。`FE.statusModifierOn(status, name)` 先查表、查不到时仅对 SHIFT 回落 `status.shift`；`FE.keyStateOpts` 与 app.js 的 fallback 都改走它。Shift 图标的实心/描边判定也改成 `FE.canonicalModifierName(eff.modifier) === 'SHIFT'` 且读表，开 Ctrl / Alt / Meta 不再误点亮 Shift 图标。

**踩坑**。`color-source.js` 在 `index.html` 里排在 `app.js` **之后**加载，所以 app.js 用到 `FE.keyStateOpts` 的地方必须保留内联 fallback，否则首次渲染时函数还不存在；两处逻辑必须同步改，否则会出现「预览开关点了但颜色只对部分键生效」。新增预览开关还要同步 `test/dom-stub.js` 的状态组桩，否则 UI 测试里 `$('#pt-alt')` 是 null。

## 7. 验证基线与文档维护记录

### 7.1 当前验证命令

在 `D:\GitHub\foxy\foxy-editor` 运行：

```bash
node test/test-core.js
node test/test-ui.js
```

当前 AGENT 开头记录的基线是：

- core：799 通过，0 失败；
- UI：1590 通过，0 失败；
- 颜色解析：`node test/test-color-source.js`，111 通过；
- 真实文件：`node test/check-real-files.js`，46 个示例，0 个错误。

如果改过 `examples/`，先运行：

```bash
node tools/build-examples.js
```

如果改过颜色解析，再运行：

```bash
node test/test-color-source.js
```

如果改过示例、Schema 对齐、解析或导出，再运行：

```bash
node test/check-real-files.js
```

如果改过 `AGENT.md`，在项目目录运行：

```bash
node tools/check-agent-sync.js --write
node tools/check-agent-sync.js
```

最后还要在真实浏览器里确认拖动、取色、对话框关闭、滚动恢复和移动端触摸等自制 DOM 桩无法证明的交互。

### 7.2 测试基线的历史变化

原文记录的基线演进为：

```text
157（首版）
→ 275（JSON 宽松修复）
→ 215 core + 355 UI（模块化 UI 阶段）
→ 626 core + 1363 UI（此前入口文档记录的阶段）
→ 629 core + 1394 UI（文档重组时的实测）
→ 715 core + 1461 UI（对齐新版 skill 后的基线）
→ 739 core + 1472 UI（2026-10-21 四修饰键后的基线）
→ 798 core + 1577 UI（2026-10-22 工具栏预览、符号字体预览、图标选择器与符号面板选中色）
→ 799 core + 1590 UI（2026-10-22 工具栏并入键盘面板、展开态返回行、keyboard_tools 图标）
```

另有一段旧的 AGENT 末尾仍写着：core 531、UI 1062、示例 20（16 布局 + 4 popup）。它是文档未同步时留下的历史基线，不能覆盖文件顶部和标准工作流中的当前数字。重组文档时保留这条说明，是为了让以后看到旧提交或旧截图的人知道数字差异来自文档漂移，而不是测试随机变化。

### 7.3 文件与同步规则

仓库远程记录为 `git@github.com:SandyYuR/foxy-see-me.git`。根目录 `D:\GitHub\foxy\AGENT.md` 是工作区便捷副本，项目内 `D:\GitHub\foxy\foxy-editor\AGENT.md` 是随项目分发的权威副本。两份必须逐字节相同；根目录不是仓库的一部分，因此同步脚本只负责把项目副本复制到根目录，不会把根副本提交进去。

项目约定不自动 `git push`。完成改动后只做本地检查和本地提交所需的准备，推送由用户决定。

### 7.4 本次文档重组

本次重组将职责拆成三层：

1. `foxy-editor/README.md`：当前产品简介、快速上手、当前功能、格式入口和文档导航；
2. `foxy-editor/AGENT.md` 与根目录副本：代理改动前的硬约束、架构不变量、测试命令、同步规则；
3. `foxy-editor/docs/history/project-history.md`：本文件，承载原 README/AGENT 中的历史沿革、决策理由、修复背景、实测数字和旧基线说明。

这样做的原因不是删除历史，而是让三类读者各自能从正确入口获得信息：普通用户先看到“现在能做什么”，代理先看到“现在必须怎么改”，维护者需要追溯时再进入完整历史。

## 8. 维护者速查：改动影响面

| 改动对象 | 必须连带检查 |
| --- | --- |
| `js/*.js` 模块或脚本顺序 | `index.html`、`test/test-core.js`、`test/test-ui.js` 的加载顺序与可选模块保护 |
| DOM 结构、tab、工具条 | `test/dom-stub.js` 的 skeleton、UI 计数断言、真实浏览器布局 |
| JSON 解析、校验、Schema | `skills/SKILL.md`、相关 Schema、`test-core.js`、真实文件体检 |
| `examples/` 或示例映射 | `node tools/build-examples.js`、示例分组断言、`check-real-files.js` |
| 颜色、主题、jscolor | `test/test-color-source.js`、ARGB/CSS 顺序、主题与布局优先级、真实取色操作 |
| `mutate()`、撤销、autosave | layout/popup/symbol 复数状态、快照恢复、引用索引缓存和 JSON 文本 |
| 列表重建、弹框、滚动 | `requestClose()` / `leaveThen()`、`captureScroll` / `restoreScroll`、真实浏览器补验 |
| `AGENT.md` | 只编辑项目内副本，然后运行 `node tools/check-agent-sync.js --write` 和无参数校验 |

这张表是维护入口，不是新的功能需求；每一项的背景和曾经出现过的故障都在上面的对应章节中。
