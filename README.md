# 小狐狸 see me：Foxy 键盘布局可视化编辑器

> 在线使用：<https://sandyyur.github.io/foxy-see-me/>
>
> 也可以直接双击本目录的 `index.html` 离线使用，无需安装、无需联网。

这是一个给小狐狸 Foxy 输入法使用的纯前端可视化编辑器。你可以在浏览器中加载布局或相关 Foxy 文件，实时预览按键、手势、颜色和弹出菜单，完成编辑后导出 Foxy 可以直接读取的 JSON。交互方式参考 [f5a-see-me](https://github.com/SandyYuR/f5a-see-me)，数据格式以 Foxy 的规范为准。

## 快速上手

1. 打开 `index.html`，或访问上面的在线地址。
2. 在对应功能页原有的文件操作区选择「加载示例」或「导入 JSON」。布局、弹出菜单、主题和符号的文件入口保持平级。
3. 点击预览按键，在右侧属性面板修改；手机选键后展开底部面板。在下方行区段或网格中点击按键，则打开原有大弹窗。面板内的修改最后点「应用」，取消会丢弃本次草稿。
4. 点击「导出 JSON」，把文件放到 Foxy 对应的目录。

布局文件通常放在：

```text
<外部存储>/foxy/frontend/layouts/<文件名>.json
```

Android 的精确路径是：

```text
Android/data/com.fxliang.foxy/files/foxy/frontend/layouts/
```

弹出菜单、共享定义、主题和符号文件分别使用 Foxy 的 `frontend/popups/`、`frontend/definitions.json`、`frontend/themes/`、`frontend/symbols/`、`frontend/emoji/`、`frontend/kaomoji/`。把布局放入对应目录后，在 Foxy 设置中选择它。

标题说明右侧的绿色「草稿已保存到浏览器」表示本地缓存写入成功。刷新后会恢复文件、当前页签、按键与手势草稿，以及各文件页未应用的 JSON 文本；恢复草稿不会自动应用到导出文件。存储失败会改为错误提示。缓存属于当前浏览器和当前站点，清理浏览器数据会删除它，重要修改仍应导出。

右侧属性窗默认显示，未选键时分栏收起且不可编辑；手动关闭后，点击预览按键可重新打开。切换横屏／分体会清空选择并暂存草稿，不关闭窗口。下方六个功能页的主分栏仍默认展开，各自记忆手动开合状态。

保存提示后的「还原默认」可一键回到网页初次打开的状态；「撤回还原」能恢复上一次还原前的文件与草稿。

更多说明见[编辑工作区与草稿恢复](docs/workspace-editing.md)。

## 当前功能

- 布局实时预览：支持 Shift / Ctrl / Alt / Meta 修饰键模拟、组字、ASCII、停用、选项开关、组合条件和变体切换，以及分体和横屏状态。
- 键盘编辑：调整按键、手势（含 `drag` 连续拖动）、自定义图标、颜色、圆角、水平/垂直间距和引用关系。
- 分层属性面板：常用字段与四向手势优先显示，明确当前放置或共享定义的修改范围；原始 JSON、颜色与变体按需展开。
- 草稿预览与统一应用：切换按键、布局或功能页前处理未应用修改；一次应用对应一次撤销，取消不更改独立 popup 文件。
- 网格与分体预览：按实际键节点渲染，适配窄屏与长文本。
- 弹出菜单编辑：布局与 popup 分别导入、编辑和导出。
- 动作与宏编辑：使用图形化动作控件（含 `switch_layout_once` 临时层），保留不能安全转换的原始 JSON。
- 引用索引与使用数：查看定义被哪些键、动作和宏引用，并点击定位。
- 多文件布局包：合并布局、`definitions.json` 和 popup，导出时恢复未改动的共享定义。
- 主题文件编辑：支持 `foxy.keyboard-theme` 文件与预览颜色优先级；新增 `symbolTabHighlightTextColor` / `symbolTabHighlightColor`（未设置时分别回退 `toolTextColor` / `candidateHighlightColor`）。
- 键盘上方工具栏预览：按 `os.java` / `w20.java` / `mf.java` 还原主/展开两种组合、chip 尺寸与配色；可导入主题自带的工具栏 svg（按文件名显式配对成对图标），自带实色的图标原样渲染、单色图标跟随 `toolTextColor` / `accentColor`。
- 符号字体预览：导入 `.otf` / `.ttf` 后挂到键面和手势提示上，并按字体 cmap 报告当前布局的缺字（实机会回退系统字体）；字体与工具栏图标**只影响预览，不写入任何 Foxy 文件**。
- 符号面板编辑：支持符号、emoji、颜文字数据及多行预览。
- 宽松 JSON 导入：检查并修复注释、尾逗号等可识别问题，导出仍保持严格 JSON。
- 响应式界面：提供手机竖屏布局、触摸拖动、浮动撤销/重做/回顶按钮。
- 触屏拖动手柄：普通键块可以用来滚动页面，手柄负责排列；网格移动与交换在写入前检查完整占位。

## 文档导航

- [文档索引](docs/README.md)：按用户、代理和维护者列出全部入口。
- [项目历史与决策记录](docs/history/project-history.md)：原始任务、长期决策、功能演进、修复背景、实测数据和测试基线。
- [代理修改指南](AGENT.md)：代理改代码前必须遵守的硬约束和验证流程。
- [格式规范与 Schema](skills/)：`SKILL.md`、布局 / popup / definitions 的 JSON Schema，以及 [Foxy JavaScript 插件指南](skills/Foxy%20JavaScript%20Plugin%20Guide.md) 与示例插件 `qwen-asr.js`。

## 格式与范围

- 布局保存时会按 Foxy 的优先级处理定义链、`override` 和直接字段；`null` 的语义也按 Foxy 解析器处理。
- 布局颜色、主题 `keyTypes` 颜色和主题全局颜色按明确的优先级合并，布局每键颜色高于主题颜色。
- 主题编辑只处理独立主题文件；Foxy App 的全局主题选择、跟随系统等设置不属于本工具。
- `modifier` 取值为 SHIFT / CTRL / ALT / META（大小写不敏感），可以在键、`override` 和变体上用 `"modifier": null` 显式改回普通键；声明了 `modifier` 的键长按会隐式锁定该修饰键，写了 `hold` 手势则关闭这个回退，没有 `modifier` 的原始键长按只发本键。
- 键的 `icon` 除内置的 backspace / shift / enter / return 外，还可以引用顶层 `icons` 映射里的名字，或直接写 `svg:` / `xml:` 内联载荷。
- 变体条件支持 `option` / `value` / `options` 与 `all_of` / `any_of` / `none_of` 组合；编辑器不知道活动 schema 声明了哪些开关，只能把条件里出现过的选项名做成预览开关；条件里一个选项名都没有时（默认 profile 就是这种）整组隐藏，因为那时的勾选不影响任何渲染。
- 符号、emoji、颜文字外部文件需要在 Foxy 设置的符号布局中显式选中，同名文件不会自动覆盖内置数据。
- `symbols`、`emoji`、`kaomoji` 作为 `switch_layout` / `switch_layout_once` 目标时会被识别为符号面板，因此不要把这三个名字用作自定义布局名。
- `switch_layout_once` 是临时层：切到目标布局后，下一次有效输入（按键、宏、选词或上屏文本）完成即自动回到切换前的布局；再次切换会替换返回目标，唤起键盘或回到基础布局则取消这次返回。它的字段与 `switch_layout` 相同，编辑器只负责写对类型，不模拟返回时机。

## 开发与测试

项目不需要构建步骤。修改后在 `foxy-editor/` 目录运行：

```bash
node test/test-core.js
node test/test-ui.js
```

如果改过示例：

```bash
node tools/build-examples.js
```

如果改过颜色解析：

```bash
node test/test-color-source.js
```

新增或修改示例、解析规则或导出逻辑后，还应运行：

```bash
node test/check-real-files.js
```

所有代理约束、当前测试基线、DOM 桩边界和同步命令见 [`AGENT.md`](AGENT.md)。项目历史中的取舍和旧问题见 [`docs/history/project-history.md`](docs/history/project-history.md)。
