# Foxy 布局一致性语料（conformance v1）

这是 Foxy 布局解析的**可执行契约**，面向第三方布局编辑器（例如 `foxy-see-me`）和维护者。

`skills/SKILL.md` 是给人和 AI 读的散文规范，适合"生成布局"；本目录是确定性的
`输入 JSON → Foxy 编译结果`，适合"验证实现是否与 Foxy 一致"。两者分工不同，不能互相替代。

## 目录

```text
conformance/
  manifest.json                  # version、case 列表、golden 列表
  cases/<name>/input.json        # 原始布局 profile
  cases/<name>/case.json         # layoutId、splitRequested、Rime 状态
  cases/<name>/expected.json     # 每个状态下的规范编译结果（null = 解析失败）
  inputs/synthetic.json          # 复杂 ref/override/null 样例
  inputs/kitchen.json            # 手势/动作/外观全量样例
  golden/*.txt                   # 旧版稳定文本 golden（内置键表等）
  consumer/run-conformance.js    # 零依赖 Node 比对工具
  consumer/adapter.example.js    # 适配器模板
```

`expected.json` 的形状：

```json
{
  "profile": true,
  "statuses": {
    "idle": { "totalUnits": 5.0, "sections": [ ... ] },
    "ascii": { ... }
  }
}
```

`null` 表示 Foxy 在该状态下无法解析出布局（整个 profile 可能被拒绝）。
`profile` 表示 Foxy 是否接受该 profile 的所有命名布局。

## 用例

- `rows`：基础行布局与默认行高。
- `weighted`：`weight` / `weight:"auto"` / `totalWeight` 的宽度分配。
- `grid`：Grid 区段与 `columnSpan` / `rowSpan` / `rowHeights`。
- `variants`：按键变体与布局级变体（含 `ascii_mode` 切换）。
- `split`：`split` 片段与 `splitRequested`。
- `gestures`：宏、`doubleTap`、`hold`、`swipe` 与 `actions` 引用。
- `longpress-drag`：长按（`repeat`/`popupKey`）与拖拽（四方向、`step`、`feedback`、`end`）。
- `composing-conditional`：`variants[].when.rime.composing` 条件动作（`conditional`）。
- `actions-args`：参数化 app action（选择方案/工具栏容器/开关展开）与 `modifier`。
- `appearance`：`keyType`/`modifier`/`id`/`statusLabel`/`textSize`/`hintTextSize`/图标/颜色状态。
- `null-resets`：`weight`/`height`/`tap`/`swipe`/`hintTextSize`/`shiftedLabel`/`colors` 的 `null` 行为。
- `section-defaults`：Grid 的 `columnSpan`/`rowSpan`、行对象 `height` 与默认行高。
- `override-vs-direct`：直接字段优先于 `override` 里的 `null`。
- `null-clear-placement`：放置处 `override` 的 `null` 清空继承值。
- `invalid-auto-no-total`：使用 `weight:"auto"` 但缺少 `totalWeight`。
- `invalid-auto-total-too-small`：`totalWeight` 不足以分配 `auto` 权重。
- `invalid-grid-overlap`：Grid 单元格重叠。
- `invalid-grid-bounds`：Grid 单元格越界。
- `invalid-variant-cycle`：布局变体互相引用成环，Foxy 回退到未展开的变体。
- `invalid-section-type`：未知区段类型。
- `invalid`：JSON 语法错误。

## 数值与排序约定

- 数字按 JSON number 比较，`1` 与 `1.0` 等价；不要对浮点做四舍五入。
- 所有映射按键名排序：`icons`、`hintTextSizes`、`colors.states`、`drag.directions`、`options`。
- 未设置的字段为 `null`；空映射为 `{}`；空数组为 `[]`。
- 数组顺序有语义（rows、cells、gestures、actions），必须保持一致。

## `null` 与优先级

`null` 是有效值，会清除继承项，但受优先级约束：

```text
引用基础 < override < 直接字段
```

- `override-vs-direct`：同一个定义里既有 `label: "K"` 又有 `override.label: null`，
  直接字段 `"K"` 胜出，所以 null **不会**清空它。
- `null-clear-placement`：把 null 放在放置处的 `override` 里，且该层不再直接写该字段，
  `label` 会清成空字符串，`icon` / `iconName` / `textSize` / `shiftedLabel` 变为 `null`。

两个例外：`label: null` 清成空字符串（不是恢复被引用定义的 label）；`tap: null` 不会
清除点击手势，因为每个键都必须可点击。

## 社区怎么用

### 1. 只读比对（推荐，不需要 Java）

把本目录复制或作为 submodule 引入编辑器仓库，然后实现一个适配器：

```js
// foxy-adapter.js
module.exports = {
  // 可选：返回编辑器是否接受该 profile（对应 expected.profile）
  validateProfile(input, meta) { /* ... */ },

  // 必须：按 meta.status 编译一个命名布局
  compile(input, meta) {
    // meta = {
    //   name, layoutId, schemaId, splitRequested, statusName,
    //   status: { schemaId, schemaName, isDisabled, isComposing, ... }
    // }
    // 返回与 expected.statuses[statusName] 相同形状的对象，或 null。
  },
};
```

运行：

```bash
node conformance/consumer/run-conformance.js \
  --root ./conformance \
  --adapter ./foxy-adapter.js
```

失败时会打印第一个字段差异，例如：

```text
✗ split/idle sections[0].rows[0][0].label: expected "S", got "D"
```

把它放进 CI 后，社区 AI 的每次改动都有客观验收标准，而不是靠再读一遍散文规范。

### 2. 用 Foxy 参考实现刷新人眼可读的 golden

需要本地有 JDK。`golden/*.txt` 是 Foxy 解析器的稳定文本输出，适合人工 review：

```bash
./gradlew :core:desktopTest --tests '*LayoutParserGoldenTest*'
```

### 3. 更新语料（Foxy 维护者）

修改 `LayoutConformanceCorpus` / 解析器后：

```bash
FOXY_CONFORMANCE_UPDATE=1 ./gradlew :core:desktopTest --tests '*ConformanceExportTest*'
./gradlew :core:desktopTest
```

提交 `conformance/` 的变更时，review 重点应是 `expected.json` 的语义变化，而不是格式变化。
普通测试运行会校验已提交文件是否与当前解析器一致，不需要环境变量。

## 覆盖范围

**v1 覆盖：**

- profile 有效性（`profile` 布尔值）
- `ref` / `override` / `null` 清空语义
- rows 权重、`auto`、行宽、网格 `columns/rows/rowHeights/cell span`
- 状态变体：`composing`、`ascii_mode`、`disabled`
- `split` 变体
- 手势：click / double / longPress / hold / swipe / drag
- 动作：key / modifier / keysym / text / app / key_ref / macro / candidate / conditional
- 内置 `rime.*` / `foxy.*` 键定义（`golden/builtins.txt`）
- 内置默认布局（`golden/default.txt`）

**不覆盖（后续版本）：**

- 视觉渲染、CSS 尺寸、字体度量
- Rime 运行时交互（候选、组字）
- 主题 `foxy.keyboard-theme`、工具栏、popup、definitions 的编解码
- 文件存储、缓存、原子写入

## 版本与兼容

- `manifest.json.version` 目前为 `1`。
- 新增可选字段或新增 case 不算破坏；删除/重命名字段、改变字段含义必须升版本，并在本文件记录迁移说明。
- 消费方应锁定 commit 或 tag，不要直接跟 `main`。

## golden 说明

| 文件 | 输入 | 说明 |
| --- | --- | --- |
| `builtins.txt` | 无 | 内置 `rime.*` / `foxy.*` 定义表 |
| `default.txt` | `app/src/main/assets/frontend/layouts/default.json` | 内置默认布局 |
| `synthetic.txt` / `synthetic-ascii.txt` | `inputs/synthetic.json` | ref/override/null/变体 |
| `kitchen-{normal,ascii,composing,disabled}.txt` | `inputs/kitchen.json` | 手势/动作/外观全量 |
| `layout_corpus.txt` | `cases/*` | 旧版紧凑签名，保留用于回归对比 |

`golden/*.txt` 是 Foxy 侧的人工可读基线；跨语言自动比对请使用 `cases/*/expected.json`。
