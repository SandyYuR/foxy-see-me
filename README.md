# 小狐狸 see me — Foxy 键盘布局可视化编辑器

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
  **右上橙色 = 按住提示**（`hold.label`，如语音）、四角灰色小字 = 滑动提示、
  红色虚线框 = 引用无法解析、黄色框 = 选中。
- 状态模拟：**Shift**、**组字（composing）**、**ASCII**、**停用** 四个开关实时应用
  按键状态变体（`variants`）与布局级变体（如仓颉 ASCII 时切回 default）。
- 深色 / 浅色键盘预览。**点击预览中的按键直接打开编辑对话框**。
- 预览下方状态栏显示高度单位、按键数与校验结果（错误/警告可展开查看）。

### 布局编辑
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
  `textSize`、`id`、`statusLabel`、`modifier`，均支持"留空继承 / 显式清除(null)"语义。
- 手势编辑：`tap` / `doubleTap` / 四向 `swipe` / `longPress`（repeat、`popupKey` 弹出菜单）/ 
  `hold`（start/end）。手势来源支持：引用按键、直接动作、动作名、宏调用。
- 直接动作编辑器覆盖全部动作类型：`key`（KeyCode 分组选择 + SHIFT/CTRL/ALT/META 修饰）、
  `modifier`（SHIFT/CTRL × OFF/ONESHOT/LOCKED）、`text`/`commit`、`switch_layout`、
  `app`（全部 Foxy 命令 + 参数）。
- 状态变体编辑：`composing` / `ascii_mode` / `disabled` 三态条件（真/假/忽略）、
  变体级 `ref` 替换、`label` / `shiftedLabel` / `tap` 与其他字段 JSON。
- 按键颜色：`text` / `background` / `border` / `hint` 四个常用角色。
- 高级：编辑原始 JSON；放置可"另存为按键定义"（keys 中复用）；位置移动（←→↑↓）。

### 按键定义 / 动作与宏
- 按键定义（`keys`）列表：搜索、编辑、改名（自动更新所有引用）、查找使用处、删除。
- 动作（`actions`）与宏（`macros`）的 JSON 编辑与增删。

### 文件与数据
- 导入 / 导出 JSON；`type: foxy.keyboard-layout` 与 `author` 控制。
- 示例加载：内置默认布局 + `examples/` 目录中的工作区示例（HTTP 方式打开时可用；
  `file://` 打开时请使用"导入 JSON"）。
- 撤销 / 重做（Ctrl+Z / Ctrl+Y），自动保存草稿到浏览器 localStorage。

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

### 宽松导入

"导入 JSON"、"加载示例"、JSON 页"应用/格式化"都会先做宽松清理再解析：
自动去除 UTF-8 BOM 与 `}` / `]` 前的多余尾逗号（手工编辑的布局文件常见）。
字符串内部的内容不受影响。清理后仍无法解析时才报错——JSON 标签页内会直接
显示错误信息（原文保留，不会被覆盖）。

新增或修改 `examples/` 下的示例后，运行 `node tools/build-examples.js`
重新生成打包文件。

## 校验

编辑器实时执行与 Foxy 解析器一致的校验（显示在预览下方状态栏）：

- `ref` 引用链解析（含循环检测、变体引用、手势引用、动作/宏名引用）；
- 每个按键解析后必须有 `tap` 点击动作；
- `hold` 与 `longPress` 不可同时定义；
- `weight: "auto"` 行必须提供足够大的 `totalWeight`；
- 网格按键不越界、不重叠；
- 布局变体目标存在且无循环；各布局总高度单位兼容性（警告）。

## 结构

```
foxy-editor/
├── index.html            页面骨架（预览面板 + 四个标签页）
├── style.css             界面与键盘预览样式
├── js/
│   ├── data.js           内置按键注册表（rime.* / foxy.*）、KeyCode 表、App 命令表
│   ├── default-profile.js 内置默认布局示例（由 layout-variant.json 生成）
│   ├── examples-bundle.js 示例布局打包（由 tools/build-examples.js 生成）
│   ├── app.js            状态、解析引擎、变体合并、校验器、预览与编辑器 UI
│   └── key-dialog.js     按键/手势/动作/变体/选择器对话框
├── examples/             示例布局源文件（含 cc lite.json 全键盘注音布局）
├── tools/
│   └── build-examples.js 重新生成 js/examples-bundle.js
└── test/
    ├── test-core.js      核心逻辑测试（node test/test-core.js）
    ├── test-ui.js        UI 冒烟测试（node test/test-ui.js，内置 DOM 桩）
    └── dom-stub.js       极简 DOM 桩
```

## 实现说明

- 放置（placement）编辑保存时会将其 `override` 字段扁平化为直接字段
  （两者在格式中优先级为 直接字段 < override，扁平化不改变语义，导出 JSON 更整洁）。
- 编辑器内置的 `rime.*` 标签表用于无显式 `label` 时的预览回退；个别无公开
  KeyCode 名称的内置动作（如 `rime.exclam`、`rime.F1`）以"内置动作"形式展示，
  不影响引用与校验。
- 主题（theme）编辑不在本工具范围内；每键 `colors` 覆盖属于布局数据，已支持。

## 测试

```
node test/test-core.js    # 68 项：解析引擎 / 变体 / 行权重 / 网格 / 校验器 / 宽松导入
node test/test-ui.js      # 89 项：boot / 渲染 / 布局与状态切换 / 对话框保存 / 撤销重做 / 示例加载
```
