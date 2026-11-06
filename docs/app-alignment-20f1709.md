# Foxy 0.0.1-20f1709 对齐记录

2026-11-06 对照 `D:/GitHub/foxy/foxy_re` 的反编译源码更新。版本和 APK 身份来自该目录的 README；本次没有修改 App 源码或安装 APK。JADX 没有恢复完整的方法同时检查了 `smali/`。

## 符号与颜文字

- `ke0.java:224–264`：普通模式每行六格，`multiLine=true` 每行一格；两种模式都用 `zc` 的 `Proportional` 缩放。
- `zc.java:229–254` 和 `smali/zc.smali` 的 `a(II)`：以完整文本宽度及字体高度测量，按 `min(1, 可用宽度 / 文本宽度, 可用高度 / 字体高度)` 等比缩小。`WRAP_CONTENT` 不代表自动折行。
- 网页预览和下方条目列表共用文字测量。连续空格保留；显式换行仅在显示节点中变为空格，原始 JSON 不变。窗口调整、分组展开及字体完成加载后重新计算。预览分组名称也自动缩小。
- 预览宽度变化时重新计算字号和格高，避免从桌面缩到手机后继续沿用桌面尺寸。

`yx1.java` 定义三种类型：`foxy.symbols`、`foxy.emoji`、`foxy.kaomoji`。`by1.g` 为旧文件迁移类型，`zx1.c` 校验显式类型。网页按文件中的有效类型选择类别；无类型对象和顶层数组仍可导入，导出时补上正确类型，顶层数组仍按 `multiLine=false` 处理。错误类型不会覆盖当前文件。

`examples/新版内置符号.json`、`新版内置表情.json`、`新版内置颜文字.json` 分别原样复制自该 APK 的 `assets/symbols/`，包含 62、10、19 个分组。原有示例保留，仍覆盖无类型旧格式。示例打包优先根据 `type` 分类，文件名仅用于兼容旧文件。

## 编辑动作

`v2.java:16` 的命令表及 `a4.java:101–112` 的内置定义确认：

| 内置键 | App 命令 |
| --- | --- |
| `foxy.Copy` | `copy` |
| `foxy.Cut` | `cut` |
| `foxy.Paste` | `paste` |
| `foxy.SelectAll` | `select_all` |

动作下拉、校验和内置定义统一使用这些原生命令。用户显式写的 Ctrl 组合键保持原文。`switch_layout_once`、修饰键、手势及布局解析保持现有契约，新版内置布局合并 definitions 后校验通过。

## 主题

`mv.java:25` 的字段表增加六项：`waterRippleColor`、`candidateHighlightTextColor`、`candidateHighlightCommentColor`、`candidateLabelColor`、`candidateHighlightLabelColor`、`preeditHighlightColor`。现在有 33 个有效颜色字段；网页还保留旧版 `popupBorderColor` 的编辑与往返，因此表单共 34 项，新版 App 不绘制该边框。

默认值按 `c.E()` / `c.i()` 与 `ri0` 构造函数核对。`mv.smali` 的解析有两条特殊回退：只有缺少字段时，`preeditHighlightColor` 和 `waterRippleColor` 才继承 `accentColor`；显式 `null` 保留内置默认。`symbolTabHighlight*` 现在独立回落内置色，不再继承用户设置的工具栏／候选色。此项取代旧文档的回退规则。

`mv.c / mv.e / mv.g` 和 `kp0` 确认背景字段位于各自的 `light / dark` 槽：

| 区域 | 图片路径 | 显示方式 | 裁剪参数 |
| --- | --- | --- | --- |
| 整张键盘 | `wholeKeyboardImage` | App 固定 cover | `wholeKeyboardImageTransform` |
| 按键区 | `keyboardBackgroundImage` | `keyboardBackgroundScale` | `keyboardBackgroundTransform` |
| 候选栏／工具栏 | `candidateBarImage` | `candidateBarImageScale` | `candidateBarImageTransform` |

显示方式接受 `cover / contain / fill`，大小写不敏感，缺省 cover。裁剪对象的 `scale` 默认 1、范围 1–4；`offsetX / offsetY` 默认 0、范围 −2–2。`backgroundBlurRadius` 默认 10、范围 0–25。网页表单写入有效范围；直接导入的越界或无效参数保留原值并提示 App 的回退，不错误地判定整份主题不可用。

背景配置支持编辑、撤销／重做、缓存恢复和完整导出；当前键盘预览仍显示配色，图片文件需随主题放入 Foxy 的主题目录。表单不把图片路径或参数误判成未知颜色，也不删除未知扩展。

## 验证

`node tools/app-alignment-smoke.js` 使用真实 Edge / Chrome 检查桌面、390px、320px 与重新放大后的文字边界、单行高度、缩放、折叠重开、六格模式、撤销、实际 Blob 导出、类型分流、主题表单与刷新恢复。结果及截图写入工作区 `audit/app-alignment/`。

另运行 core、UI、颜色解析、主题颜色控件、工作区事务、conformance、真实文件体检及现有浏览器冒烟。当前测试数量见 `AGENT.md`；无需构建或新增运行时依赖，`index.html` 仍可离线打开。
