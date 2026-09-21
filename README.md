# 小狐狸 see me — Foxy 键盘布局可视化编辑器

> **在线使用：<https://sandyyur.github.io/foxy-see-me/>**
> 仓库描述内也记录了此网址；也可以直接双击本目录下的 `index.html` 离线使用。

仿照 [f5a-see-me](https://github.com/SandyYuR/f5a-see-me) 的交互方式，为 **小狐狸 Foxy 输入法**
（`foxy.keyboard-layout` JSON 格式，见 Foxy Layout File v0.0.1）打造的纯前端可视化布局编辑器。
无构建步骤、无外部依赖，双击 `index.html` 即可在浏览器中使用。

## 功能

### 布局预览（实时渲染）
- 按 `weight` / `height` / `width` / `totalWeight`（含 `weight: "auto"`）真实还原 rows 区段；
  grid 区段支持 `column` / `row` / `columnSpan` / `rowSpan` / `rowHeights`。
- 按键渲染：标签、`shiftedLabel`、图标（backspace / shift / enter / return）、
  四向滑动提示、长按/按住徽标、`statusLabel`（方案名示例）、`keyType` 配色、
  每键 `colors` 颜色覆盖。
  角标含义（预览下方有图例）：**右上蓝色 = 长按提示**（`longPress.label`，如 ⌫、⇪）、
  **右上橙色 = 按住提示**（`hold.label`，如语音）、**底中绿色 ⌄ = 长按弹出菜单**
  （`longPress.popupKey`，候选在「弹出菜单」页编辑）、四角灰色小字 = 滑动提示、
  红色虚线框 = 引用无法解析、黄色框 = 选中。
- 状态模拟：**Shift**、**组字（composing）**、**ASCII**、**停用**、**分体** 五个开关实时应用
  按键状态变体（`variants`）与布局级变体（如仓颉 ASCII 时切回 default）。
  **分体预览模拟横屏**：打开「分体」开关后预览容器放宽到约 2 倍宽度，按键靠
  flex 自动拉宽；行高、字号、提示尺寸固定用竖屏口径——分体时不变大，
  切回竖屏也不被"污染"。主题深浅同常规。
- 深色 / 浅色键盘预览。**点击预览中的按键直接打开编辑对话框**。
- 预览下方状态栏显示高度单位、按键数与校验结果（错误/警告可展开查看）。

### 分体键盘（split）
- 每个命名布局可包含独立的 `split` 片段（由 Foxy 的分体键盘设置选择，
  不经 `switch_layout` 切换）；预览「分体」开关或区段编辑器横幅切换常规/分体。
- 区段编辑器在分体模式下直接编辑 `split.sections`（行/网格区段、拖拽排序等与常规一致）。
- **从常规布局生成分体片段**：复制常规区段并在每行中间插入 `foxy.Spacer` 占位
  （含 `weight:"auto"` 的行除外），生成后可继续移动按键微调两侧分配。
- 支持「空白片段」创建、「重新生成」、「删除分体片段」。
- 校验：split 片段结构与引用独立校验；常规与分体高度单位不一致给出警告。

### 布局编辑（以及同页最上方「布局与文件操作」、最下方「布局 JSON」卡片）
- **卡片顺序从上到下**：「布局与文件操作」（导入/导出/示例/撤销/author）→「布局编辑」
  （命名布局管理、高度覆盖、变体、区段）→「布局 JSON」（实时同步的布局文档，
  含检查/应用/格式化/复制与问题提醒面板——原独立 JSON 标签页已并入此处）。
- 命名布局管理：新建 / 复制 / 重命名（自动更新布局变体与 `switch_layout` 引用）/ 删除。
- 布局级设置：`keyboardHeightPercent` / `keyboardHeightPercentLandscape` 高度覆盖、
  布局变体（`when.rime` 条件 → 使用其他布局）。
- 行区段：行的增删与上下移动，行属性（宽度/高度/总权重）编辑，
  按键 chip **拖拽排序**（支持跨行移动）、添加按键、行内直接编辑。
- 网格区段：列数/行数/行高编辑，**可视化网格画布**——点击空格放置按键、
  点击按键编辑（含跨距 columnSpan / rowSpan）。
- 区段增删与排序，一个布局可混合多个 rows / grid 区段。

### 按键编辑（对话框）
- 引用选择器：搜索全部用户按键定义 + 内置 `rime.*` / `foxy.*`（按字母/数字/标点/
  编辑导航/功能键/修饰键/小键盘/Foxy 功能分组，带标签预览）。
- 基本字段：`label`、`shiftedLabel`、`keyType`、`icon`、`weight`（含 auto）、`height`、
  `textSize`、`hintTextSize`（统一值或按方向 {up/down/left/right}，方向名大小写不敏感，
  支持"显式清除(null)"）、`id`、`statusLabel`（字符串或 `{ "source": "schema_name" }` 对象形式）、
  `modifier`，均支持"留空继承 / 显式清除(null)"语义。
- 手势编辑：`tap` / `doubleTap` / 四向 `swipe` / `longPress`（repeat、`popupKey` 弹出菜单）/ 
  `hold`（start/end）。手势来源支持：引用按键、直接动作、动作名、宏调用。
  手势通用补丁字段含 `label` 与 `hint`（**滑动提示文字**，与 label 并列；缺省时回退
  到 label / 被引用按键的标签；引用时缺省继承被引用手势的 `hint`）以及
  `popup`（弹出预览显示/隐藏）。
- 直接动作编辑器覆盖全部动作类型：`key`（KeyCode 分组选择 + SHIFT/CTRL/ALT/META 修饰）、
  `modifier`（SHIFT/CTRL × `OFF`/`ONESHOT`/`LOCKED`/`TOGGLE_LOCKED`，
  其中 `TOGGLE_LOCKED` 是命令：未锁定→锁定、已锁定→关闭）、
  `text`/`commit`、`switch_layout`、
  `app`（全部 Foxy 命令含 `split` / `split_keyboard` / `text_editor` /
  `split_adjust_start` / `candidate_previous` / `candidate_next` /
  `select_schema` / `select_switch_option` 等带参数命令 + 参数）。
- 状态变体编辑：`composing` / `ascii_mode` / `disabled` 三态条件（真/假/忽略）、
  变体级 `ref` 替换、`label` / `shiftedLabel` / `tap` 与其他字段 JSON。
- 按键颜色：`text` / `background` / `border` / `hint` 四个常用角色，
  外加 `shadow`、`pressed`、`hintTop` / `hintBottom` / `hintLeft` / `hintRight`
  （各方向滑动提示文字色）与 `states`（`pressed` / `modifierLocked` / `modifierActive`
  各含背景 / 文字 / 阴影）。全部用 **jscolor 取色面板点选**
  （与 [f5a-see-me](https://github.com/SandyYuR/f5a-see-me) 同款交互：
  点击输入框就地弹出 HSV 取色区 + 透明度滑杆 + ✓，支持 `#RRGGBB` / `#AARRGGBB`，
  `js/jscolor/jscolor.js` 即其同版本 vendor 文件，无需联网）；
  也可直接手输（非法格式会提示并回退），留空即恢复继承；
  states 子卡带「已配置」圆点标记，清空后自动清理空对象。

  > 两处容易踩坑、已在代码注释与测试中锁死的实现细节：
  > 1. **面板必须挂进 `<dialog>`**。jscolor 默认把面板 append 到 `document.body`，
  >    而按键对话框是原生 `<dialog>`（`showModal()` 进入顶层渲染），挂在 body 的
  >    面板会被对话框及其 `::backdrop` 盖住 —— 现象就是"点色块没反应"。
  >    因此安装时传 `container: <最近的祖先 dialog>`，并在 `show()` 后把
  >    `.jscolor-wrap` 改成 `position: fixed` 贴到输入框下方
  >    （f5a 的 `positionInlineColorPicker` 同款）。面板也因此随对话框销毁自动清理。
  > 2. **十六进制字节序**。这份 vendor 版 jscolor 用的是"ARGB 友好"约定：
  >    不透明为 `BBGGRR`（6 位、RGB 反序），带透明度为 `AABBGGRR`，
  >    **不是**标准 CSS 的 `RRGGBBAA`。编辑器用 `FE.argbToPickerHex` /
  >    `FE.pickerHexToArgb` 在 `#AARRGGBB` 与该约定间互转，
  >    并有 ARGB↔picker 往返断言 + 真实库交叉验证兜底（写错会整片串色）。
  >    另外 jscolor 构造时不会读输入框初值，安装后必须 `fromString()` 同步一次。
- 高级：编辑原始 JSON；放置可"另存为按键定义"（keys 中复用）；位置移动（←→↑↓）。
- **弹出菜单（独立折叠 section，与基本信息/手势/状态变体/颜色/高级同级，
  位于高级之后）**：点击键盘预览打开「编辑按键」框即有；展开后直接编辑此按键
  `longPress.popupKey` 对应键的整键候选（常规 / Shift，与弹出菜单页键定义卡片
  同构：调序、增删改候选），附「到弹出菜单页编辑 →」跳转。无 popupKey 时显示
  引导（先到手势 → 长按填写弹出菜单键）。

### 按键定义 / 动作与宏
- 按键定义（`keys`）列表：搜索、编辑、改名（自动更新所有引用）、查找使用处、删除。
- 动作（`actions`）与宏（`macros`）的 JSON 编辑与增删。

### 弹出菜单（popup profile）
独立的 `foxy.popup-profile` JSON（放置于 `<外部存储>/foxy/frontend/popups/<profile>.json`），
由布局按键的 `longPress.popupKey` 关联：

- **键卡片编辑**：按 popupKey 列出「常规 / Shift」两组候选，候选 chip 显示序号与
  动作徽标，支持左右调序、点击编辑、`+` 添加。
- schema 管理：多 schema（如按 Rime 方案区分）、新增 / 删除（default 不可删）。
- **候选类型**：文本（上屏该文本）、动作对象（完整动作编辑器）、动作名（本文件
  `actions` 里定义）、宏调用 / 共享键引用（`definitions.json`，标注提示无法本地校验）。
- **气泡预览**：模拟 Foxy 长按弹出的真实外观——首选候选放大居中，可切换
  Shift 状态、切换 popupKey；显示状态回退链
  （`schema[state] → default[state] → schema.normal → default.normal`）。
- **卡片顺序从上到下**：「弹出菜单文件」（导入/导出/示例/author，最上）→
  「弹出效果预览」→「弹出菜单键定义（schemas）」→「弹出菜单 JSON」（实时同步，
  最下）。与布局编辑页「文件最上、JSON 最下」的布局呼应。
- **与布局联动**：自动收集布局（含分体片段）中使用的全部 `popupKey`，列出
  「布局使用 N 处」；**一键补齐**当前 schema 缺失的键；布局预览中带 `popupKey` 的
  按键显示绿色 ⌄ 徽标；长按手势对话框可一键跳转到对应键的候选编辑。
- 校验：候选类型、动作名引用、null 候选、非法结构；导入/JSON 应用同样享受
  宽松修复（尾逗号、注释、单引号等），卡片提供「格式化并修复」按钮。
- 撤销/重做与自动保存同样覆盖弹出菜单文档（与布局文档一起快照）。

### 文件与数据
- 导入 / 导出 JSON；`type: foxy.keyboard-layout` 与 `author` 控制。
- 示例加载：内置默认布局 + `examples/` 目录中的工作区示例（已打包进页面，
  `file://` 打开也能通过"加载示例"一键载入）。
- 撤销 / 重做（Ctrl+Z / Ctrl+Y），自动保存草稿到浏览器 localStorage。
- 顶部只有 4 个标签按钮：**布局编辑 / 按键定义 / 动作与宏** 是布局文档，
  **弹出菜单**（虚线边框、与前面隔开）是另一类文档（popup profile）。

## 使用

**直接双击 `foxy-editor/index.html` 即可**，无需任何服务器或构建步骤。
所有示例布局已打包进页面（`js/examples-bundle.js`），`file://` 方式打开也能通过
"加载示例"一键载入。

编辑完成后"导出 JSON"，将文件放入手机的：

```
<外部存储>/foxy/frontend/layouts/<profile>.json
```

然后在 Foxy 设置中选择该 profile。文件名必须是 `frontend/layouts` 目录下的
直接 `.json` 文件名（不含路径分隔符）。

### JSON 语法检查与一键修复

手工编辑布局时最常见的坑是**多余尾逗号**（对象/数组最后一项后面多写一个 `,`），
严格 JSON 解析会直接拒绝，导致文件"读不进去"。编辑器现在会主动发现并修复：

- **自动提醒**：在布局 JSON 卡片编辑时（防抖 250ms）或点击「检查语法」，一旦发现问题
  就弹出提醒条，列出**问题类型、次数与行号**，例如
  `⚠ 检测到 48 处可修复问题：多余尾逗号（对象/数组最后一项之后） ×48（第 617、618…行）`。
- **一键修复**：提醒条上直接提供按钮
  - **一键修复并应用** —— 修好并立即生效；
  - **仅修复文本** —— 只整理文本、不改变当前布局，确认后再点「应用」；
  - **定位到第 N 行** —— 光标跳到第一处问题附近。
- **可修复的问题类型**：多余尾逗号、UTF-8 BOM、`//` 与 `/* */` 注释、
  单引号字符串（自动转双引号）、未加引号的键名、全角标点（`，：""''` 等）。
  所有扫描都是**字符串感知**的，字符串内部的内容（包括 `,}`、`//`、全角引号）一律原样保留。
- **修复后仍无法解析**时会明确报错（不会给"已修复"的假绿灯），并指出是硬语法错误。
- **导入文件**时：若文件只有这类可修复问题，会**自动修复并导入**，同时在状态栏
  写明"检测到并自动修复 N 处问题 —— 具体类型"；若文件存在无法自动修复的错误，
  会把**原文载入布局 JSON 卡片**（该卡片默认展开，位于布局编辑页底部），
  并展示问题清单与一键修复入口，不让用户对着空白发呆。
- 「格式化并修复」按钮 = 格式化 + 先修复再整理。
- 手改后未应用的文本会被保留（切换标签页或折叠卡片也不会被覆盖），应用成功后自动恢复同步。
- **同样的检查与一键修复也覆盖了片段编辑处**：`actions` / `macros` 的 JSON 输入框、
  按键对话框的「编辑原始 JSON…」这三处共用同一个 `FE.buildJsonSnippetEditor`
  （实时体检、一键修复、定位到行、修复后自动应用）；布局 JSON 主卡片与弹出菜单
  JSON 卡片走的是同一个 `FE.inspectJsonText` 体检引擎，各自带自己的按钮与状态行。

### 为什么保留宽松导入（而不是改回严格）

Foxy 手机端是布局文件的**消费方**，它必须吃严格 JSON；编辑器是**生产/修复方**。
编辑器导出的 JSON 永远是规范的，所以宽松导入**不会污染下游**——它只决定"编辑阶段
能不能把手改的文件读进来"。改回严格并不能换来任何安全性，只会让手改文件的人
每次都先撞一次报错（`cc lite.json` 就有 48 处尾逗号）。

至于"静默修复会不会掩盖问题"：现在修了几处、哪一类、第几行都会明确列出，还能
「仅修复文本」先看再应用，透明性由**告知**保证而不是由**拒绝**保证。修复本身也是
字符串感知的，且只在"修复结果能被 `JSON.parse` 接受"时才采用，否则如实报硬错误。

如果确实需要"绝不静默修复"的洁癖模式，可以在 JSON 卡片加一个「严格模式」开关
（勾选后导入/应用不自动修复，直接报错并给出修复按钮）——默认关闭，需要时再加。

命令行批量体检自己的布局文件：

```
node test/check-real-files.js
```

新增或修改 `examples/` 下的示例后，运行 `node tools/build-examples.js`
重新生成打包文件。

## 校验

编辑器实时执行与 Foxy 解析器一致的校验（显示在预览下方状态栏）：

- `ref` 引用链解析（含循环检测、变体引用、手势引用、动作/宏名引用）；
- 每个按键解析后必须有 `tap` 点击动作；
- `hold` 与 `longPress` 不可同时定义；
- `weight: "auto"` 行必须提供足够大的 `totalWeight`；
- 网格按键不越界、不重叠；
- 布局变体目标存在且无循环；各布局总高度单位兼容性（警告）；
- `split` 分体片段结构/引用独立校验；常规与分体高度单位一致性（警告）；
- `text_editor` 文本编辑布局的结构约束：**恰好一个 `rows` 区段、恰好一行**
  （不满足时 Foxy 会回退到内置编辑行，所以这里报错而不是警告）。

弹出菜单（popup profile）独立校验：候选类型/结构、动作名引用、null 候选、
错误 `type`；宏/共享键引用因位于 `definitions.json` 只给提示。

## 结构

```
foxy-editor/
├── index.html            页面骨架（预览面板 + 四个标签页）
├── style.css             界面与键盘预览样式
├── js/
│   ├── data.js           内置按键注册表（rime.* / foxy.*）、KeyCode 表、App 命令表
│   ├── default-profile.js 内置默认布局示例（由 layout-variant.json 生成）
│   ├── examples-bundle.js 示例打包（布局 + 弹出菜单，由 tools/build-examples.js 生成）
│   ├── app.js            状态、解析引擎、变体合并、校验器、分体支持、预览与编辑器 UI
│   ├── jscolor/jscolor.js jscolor 取色面板（与 f5a-see-me 同版本 vendor，GPLv3，
│   │                     仅浏览器端 `<script>` 引入；见 jscolor.com）
│   ├── key-dialog.js     按键/手势/动作/变体/选择器对话框（含 jscolor 颜色行封装）
│   └── popup-editor.js   弹出菜单（popup profile）编辑标签页
├── examples/             示例源文件（布局 15 个 + 弹出菜单 3 个，含 split/cangjie/
│                         思无邪系列/万象/二十六键/七列/大同 等）
├── tools/
│   └── build-examples.js 重新生成 js/examples-bundle.js（自动区分布局/弹出菜单）
└── test/
    ├── test-core.js      核心逻辑测试（node test/test-core.js）
    ├── test-ui.js        UI 冒烟测试（node test/test-ui.js，内置 DOM 桩）
    ├── dom-stub.js       极简 DOM 桩
    └── check-real-files.js 用真实文件体检 JSON 问题的辅助脚本
```

## 实现说明

- 放置（placement）编辑保存时会将其 `override` 字段扁平化为直接字段。
  **优先级（Foxy 文档）：定义链 < override 字段 < 直接放置字段**——直接字段赢；
  扁平化按此顺序合并，冲突时保留直接字段，语义不变、导出 JSON 更整洁。
- `null` 语义与 Foxy 运行时一致：`label: null` 清空为空字符串（不再回退继承标签）、
  `weight`/`height: null` 恢复解析器默认 `1`、`colors: null` 清除继承的颜色覆盖；
  手势引用里 `label`/`hint: null` 清空、`popup: null` 变 `false`、
  `action`/`actions: null` 变空列表；`tap: null` 是唯一例外——保留继承的点击手势。
- `label` 优先级：`tap` 对象自带 `label` > 外层 key/variant `label` >
  被引用 `tap` 继承来的标签；`tap` 的 `ref` 只提供动作与默认标签。
- 编辑器内置的 `rime.*` 标签表用于无显式 `label` 时的预览回退；个别无公开
  KeyCode 名称的内置动作（如 `rime.exclam`、`rime.F1`）以"内置动作"形式展示，
  不影响引用与校验。
- 主题（theme）编辑不在本工具范围内；每键 `colors` 覆盖属于布局数据，已支持。
- JSON 诊断（`FE.inspectJsonText`）单遍扫描同时完成"体检 + 生成修复文本"，
  并记录每处问题的行号与字符位置；`FE.sanitizeJsonText` 是其只取修复结果的封装。
  字符串引号规则：ASCII `"` 开启的字符串只由 ASCII `"` 闭合（内部全角引号当内容），
  全角引号开启的字符串由全角或 ASCII 引号闭合。
- 分体片段的运行时解析顺序与 Foxy 一致：先按命名布局解析（含状态变体），再取
  其 `split`；片段缺失时回退常规渲染提示。编辑器的「从常规布局生成」只是辅助
  （中间插 `foxy.Spacer`），Foxy 本身不会自动拆分行。
- 弹出菜单与布局是**两份独立文档**：编辑器把两者放进同一撤销栈与自动草稿，
  但导出/导入各走各的（布局 → `frontend/layouts/`，弹出菜单 → `frontend/popups/`）。
  弹出菜单不解析布局本地 `keys`；需要跨文件复用的行为应放进 `definitions.json`
  （编辑器对 `macro` / `ref` 类候选给出提示，不做本地校验）。

## 测试

```
node test/test-core.js    # 206 项：解析引擎 / 变体 / 行权重 / 网格 / 校验器 /
                          #         JSON 诊断与修复 / 分体片段 / 弹出菜单候选与校验 /
                          #         新增 app 命令 / text_editor 结构约束 /
                          #         hintTextSize 方向名大小写 / 手势 hint 补丁字段 /
                          #         label 优先级（tap 自带 > 外层 > tap.ref 继承）/
                          #         override 与直接字段优先级 / null 语义 /
                          #         TOGGLE_LOCKED 修饰键状态
node test/test-ui.js      # 343 项：boot / 渲染 / 布局与状态切换 / 对话框保存 / 撤销重做 /
                          #         示例加载 / 问题提醒与一键修复 / 片段编辑器 / 导入流程 /
                          #         宽松导入回归 / 按键颜色 jscolor 取色（面板挂进 dialog、
                          #         定位、惰性安装、ARGB↔picker 字节序往返、
                          #         shadow/pressed/hint四边/states GUI） /
                          #         预览颜色渲染（基础 pressed·shadow·hint 四边、
                          #         states.shadow 显隐、modifierActive<Locked<pressed 优先级） /
                          #         提示字号 hintTextSize 编辑（统一值/按方向/显式清除） /
                          #         statusLabel 对象形式与 keyType 显式清除 /
                          #         分体生成与编辑（含横竖切换行高回归） /
                          #         弹出菜单编辑与联动（含主对话框弹出菜单 section）
```
