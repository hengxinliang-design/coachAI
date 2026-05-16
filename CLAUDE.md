# Coach.AI — Claude Code 行为准则

> 来源：[Karpathy-Inspired Guidelines](https://github.com/multica-ai/andrej-karpathy-skills)，结合本项目定制。
> 每次开启新任务时自动遵循，无需用户重复提醒。

---

## 核心哲学

> "Models make wrong assumptions on your behalf and just run along with them."  
> — Andrej Karpathy

**权衡原则：** 这套准则偏向"谨慎"而非"速度"，对于非常简单的改动可酌情判断；对于有一定复杂度的任务，严格执行。

---

## 原则 1 — 先想，再写

**不做假设。不隐藏困惑。主动暴露权衡。**

开始实现之前：
- 明确说出你的假设。不确定时先问，不要猜。
- 如果同一个请求有多种理解，列出来让用户选，不要自己悄悄选一个。
- 如果存在更简单的方案，主动说出来，必要时推回用户的方向。
- 如果某个需求描述模糊，停下来，具体指出哪里不清楚，然后问。

**在本项目中尤其注意：**
- 涉及 health-utils.js 的计算逻辑修改时，先说明会影响哪些指标（CHI/getLevel/etc.）
- 涉及 iOS WKWebView 数据交互时，先确认 `parseHealthJSON` 字段映射是否正确
- 涉及 UI 改动时，先确认是否符合 Luxury Athletic OS VI（色彩 token、Inter 字体、动画规范）

---

## 原则 2 — 简单优先

**最少代码解决问题。不写任何投机性功能。**

- 不加"以后可能用到"的抽象、开关、配置项。
- 单用途代码不需要封装成"可扩展框架"。
- 不加没被要求的错误处理（除非是已知的真实风险）。
- 写完后问自己：**"一位资深工程师会说这里过度设计了吗？"** 如果会，精简它。

**判断标准：**
```
200 行能缩到 50 行？→ 重写
新增抽象层但只有一处用到？→ 删掉
加了参数但调用方永远传默认值？→ 不加
```

---

## 原则 3 — 外科手术式修改

**只动必须动的地方。只清理自己制造的垃圾。**

修改已有代码时：
- 不"顺手改进"相邻代码、注释、格式。
- 不重构没问题的东西。
- 保持现有风格，即使你有不同偏好。
- 发现无关的问题，提出来但不主动删改。

当你的改动产生"孤儿"时：
- 删除**你的改动**导致不再被用到的 import / 变量 / 函数。
- 不动改动之前就已经存在的死代码（除非被明确要求）。

**检验标准：diff 中每一行改动都能直接追溯到用户的请求。**

---

## 原则 4 — 目标驱动执行

**定义可验证的成功标准，循环直到达成。**

把任务转化为可验证的目标：

| 模糊任务 | 可验证目标 |
|---|---|
| "修复这个 bug" | "写出能复现 bug 的测试 → 让测试通过" |
| "优化性能" | "Lighthouse 评分从 X 提升到 Y" |
| "加个功能" | "功能测试通过 + 构建无报错 + 52 条已有测试全绿" |

多步骤任务先给出简短计划：
```
1. [步骤] → 验证：[检查方式]
2. [步骤] → 验证：[检查方式]
3. [步骤] → 验证：[检查方式]
```

**在本项目中，每次代码改动后必须验证：**
```bash
cd h5 && npx vitest run          # 52 条测试全绿
npx vite build                   # 构建无报错，bundle < 300 kB
```

---

## 项目上下文速查

### 技术栈
- **前端**：React 18 H5，Vite 打包，运行在 iOS WKWebView
- **样式**：纯内联 style，无 CSS 框架，Inter 字体
- **VI 系统**：Luxury Athletic OS（色彩 token 在 `coach-ai.jsx` 顶部 `const C={...}`）
- **测试**：Vitest，`health-utils.test.js`，52 条测试
- **工具函数**：`h5/health-utils.js`（纯函数，100% 覆盖）

### 关键约定
- Tab 路由 ID：`status` / `diet` / `coach` / `history`（不用 `dashboard` / `checkin`）
- 颜色必须用 `C.xxx` token，不硬编码十六进制
- `duration_min` 优先于 `duration`（iOS API 字段名）
- `Sparkline` 在响应式容器内使用 `fluid` prop
- 梯度 ID 格式：`spk_${color}_${width}`（避免跨 SVG 冲突）

### 文件结构
```
coachAI/
├── h5/
│   ├── coach-ai.jsx          # 主应用（2200+ 行）
│   ├── health-utils.js       # 纯函数工具
│   ├── health-utils.test.js  # 52 条 Vitest 测试
│   └── test-data/
│       ├── mock-data.js      # 10 个测试场景
│       └── CoachAI_SourceData_v1.2.xlsx
└── design/
    └── product-spec-v1.2.md  # 产品规范文档
```

---

## 反模式速查表

| 反模式 | 正确做法 |
|---|---|
| 悄悄假设字段含义 | 说出假设，确认后再写 |
| 为单次使用写"可扩展框架" | 直接写最简函数 |
| 修 bug 时顺手加 type hint | 只改 bug 那几行 |
| "我会检查并改进代码" | "我会写复现测试 → 让测试通过 → 验证无回归" |
| 跨 SVG 复用同一 gradient ID | `spk_${color}_${width}` 唯一 ID |
| 硬编码颜色值 | 使用 `C.aqua` / `C.coral` 等 token |

---

*这套准则有效的标志：diff 里没有多余的改动，实现前会先问问题，问题在实现之前出现而不是出错之后。*
