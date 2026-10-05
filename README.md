# 小狐狸 see me：Foxy 键盘布局可视化编辑器

> 在线使用：<https://sandyyur.github.io/foxy-see-me/>
>
> 也可以直接双击本目录的 `index.html` 离线使用，无需安装、无需联网。

这是一个给小狐狸 Foxy 输入法使用的纯前端可视化编辑器。你可以在浏览器中加载布局或相关 Foxy 文件，实时预览按键、手势、颜色和弹出菜单，完成编辑后导出 Foxy 可以直接读取的 JSON。交互方式参考 [f5a-see-me](https://github.com/SandyYuR/f5a-see-me)，数据格式以 Foxy 的规范为准。

## 快速上手

1. 打开 `index.html`，或访问上面的在线地址。
2. 在顶部选择「加载示例」，或者通过「导入 JSON」打开自己的文件。
3. 在预览、定义列表、动作与宏、弹出菜单、主题或符号面板中编辑。
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

页面会实时预览改动，并将编辑状态保存到浏览器本地存储；关闭页面后再次打开仍可继续当前编辑。

## 当前功能

- 布局实时预览：支持 Shift、组字、ASCII、停用、分体和横屏状态。
- 键盘编辑：调整按键、手势、颜色、圆角、水平/垂直间距和引用关系。
- 网格与分体预览：按实际键节点渲染，适配窄屏与长文本。
- 弹出菜单编辑：布局与 popup 分别导入、编辑和导出。
- 动作与宏编辑：使用图形化动作控件，保留不能安全转换的原始 JSON。
- 引用索引与使用数：查看定义被哪些键、动作和宏引用，并点击定位。
- 多文件布局包：合并布局、`definitions.json` 和 popup，导出时恢复未改动的共享定义。
- 主题文件编辑：支持 `foxy.keyboard-theme` 文件与预览颜色优先级。
- 符号面板编辑：支持符号、emoji、颜文字数据及多行预览。
- 宽松 JSON 导入：检查并修复注释、尾逗号等可识别问题，导出仍保持严格 JSON。
- 响应式界面：提供手机竖屏布局、触摸拖动、浮动撤销/重做/回顶按钮。

## 文档导航

- [文档索引](docs/README.md)：按用户、代理和维护者列出全部入口。
- [项目历史与决策记录](docs/history/project-history.md)：原始任务、长期决策、功能演进、修复背景、实测数据和测试基线。
- [代理修改指南](AGENT.md)：代理改代码前必须遵守的硬约束和验证流程。
- [格式规范与 Schema](skills/)：`SKILL.md` 以及布局、popup、definitions 的 JSON Schema。

## 格式与范围

- 布局保存时会按 Foxy 的优先级处理定义链、`override` 和直接字段；`null` 的语义也按 Foxy 解析器处理。
- 布局颜色、主题 `keyTypes` 颜色和主题全局颜色按明确的优先级合并，布局每键颜色高于主题颜色。
- 主题编辑只处理独立主题文件；Foxy App 的全局主题选择、跟随系统等设置不属于本工具。
- 符号、emoji、颜文字外部文件需要在 Foxy 设置的符号布局中显式选中，同名文件不会自动覆盖内置数据。
- `symbols`、`emoji`、`kaomoji` 作为 `switch_layout` 目标时会被识别为符号面板，因此不要把这三个名字用作自定义布局名。

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
