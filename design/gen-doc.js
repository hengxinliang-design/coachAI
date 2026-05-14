const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  ExternalHyperlink, TableOfContents,
} = require("docx");
const fs = require("fs");

// ── helpers ──────────────────────────────────────────────────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const PAGE_W = 11906; // A4
const MARGIN = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2; // 9026

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, font: "Arial", size: 32, bold: true, color: "1A1E23" })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 26, bold: true, color: "252B32" })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 22, bold: true, color: "39424F" })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: opts.color || "333333", bold: opts.bold || false, italics: opts.italic || false })],
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: "333333" })],
  });
}
function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    children: [new TextRun({ text: `◎  ${text}`, font: "Arial", size: 20, color: "666666", italics: true })],
  });
}
function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "DDDDDD" } },
    children: [],
  });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// simple two-column table helper
function twoCol(rows, colW = [2400, 6600]) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colW,
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: BORDERS,
            width: { size: colW[0], type: WidthType.DXA },
            shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: label, font: "Arial", size: 20, bold: true, color: "444444" })] })],
          }),
          new TableCell({
            borders: BORDERS,
            width: { size: colW[1], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: value, font: "Arial", size: 20, color: "333333" })] })],
          }),
        ],
      })
    ),
  });
}

// header row + data rows table
function dataTable(headers, rows) {
  const colW = Math.floor(CONTENT_W / headers.length);
  const colWs = headers.map(() => colW);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWs,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(h =>
          new TableCell({
            borders: BORDERS,
            width: { size: colW, type: WidthType.DXA },
            shading: { fill: "1A1E23", type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, font: "Arial", size: 20, bold: true, color: "FFFFFF" })] })],
          })
        ),
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: row.map(cell =>
            new TableCell({
              borders: BORDERS,
              width: { size: colW, type: WidthType.DXA },
              shading: { fill: ri % 2 === 0 ? "FFFFFF" : "F9F9F9", type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Arial", size: 20, color: "333333" })] })],
            })
          ),
        })
      ),
    ],
  });
}

// ── document ─────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1A1E23" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "252B32" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "39424F" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }, {
        level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
      }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: 16838 },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          tabStops: [{ type: "right", position: 8000 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "DDDDDD", space: 6 } },
          children: [
            new TextRun({ text: "Coach.AI  产品说明文档  v1.0", font: "Arial", size: 18, color: "888888" }),
            new TextRun({ text: "\t机密 · 内部使用", font: "Arial", size: 18, color: "AAAAAA" }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          tabStops: [{ type: "right", position: 8000 }],
          border: { top: { style: BorderStyle.SINGLE, size: 3, color: "DDDDDD", space: 6 } },
          children: [
            new TextRun({ text: "© 2025 Coach.AI  ·  保密文件，请勿外传", font: "Arial", size: 17, color: "AAAAAA" }),
            new TextRun({ text: "\t第 ", font: "Arial", size: 17, color: "AAAAAA" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 17, color: "AAAAAA" }),
            new TextRun({ text: " 页", font: "Arial", size: 17, color: "AAAAAA" }),
          ],
        })],
      }),
    },
    children: [

      // ── 封面 ─────────────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 1200, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Coach.AI", font: "Arial", size: 72, bold: true, color: "1A1E23" })] }),
      new Paragraph({ spacing: { before: 0, after: 120 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "产品说明文档", font: "Arial", size: 40, color: "39424F" })] }),
      new Paragraph({ spacing: { before: 0, after: 80 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "v1.0  ·  2025年5月", font: "Arial", size: 26, color: "888888" })] }),
      new Paragraph({ spacing: { before: 80, after: 600 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Body State OS  —  细胞智能健康操作系统", font: "Arial", size: 24, italics: true, color: "666666" })] }),

      divider(),

      // ── 目录 ─────────────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 400, after: 200 }, children: [new TextRun({ text: "目  录", font: "Arial", size: 28, bold: true, color: "1A1E23" })] }),
      new TableOfContents("目录", { hyperlink: true, headingStyleRange: "1-2" }),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 01 产品定位
      // ══════════════════════════════════════════════════════════════════════
      h1("01  产品定位与核心理念"),
      divider(),

      h2("1.1  产品定义"),
      p("Coach.AI（教练.AI）是一款基于 AI 的个人身体状态操作系统（Body State OS），运行于 iOS WKWebView 内嵌 H5 页面，核心功能包括："),
      bullet("通过 Apple Watch 读取每日健康数据（HRV、静息心率、睡眠、训练）"),
      bullet("基于 Claude AI 进行个性化解读、对话教练与饮食营养分析"),
      bullet("计算细胞健康评分（CHI），综合呈现身体整体状态"),
      bullet("指导用户在正确的时机做正确的事情——训练、休息、补充营养"),
      p(""),

      h2("1.2  产品灵魂"),
      p("Coach.AI 不是数据仪表盘，而是一位懂你身体的教练。它遵循「反仪表盘」哲学——不把所有数据平铺展示，而是用三层渐进式揭示模型引导用户："),
      p(""),
      dataTable(
        ["层级", "名称", "用户体验", "对应界面"],
        [
          ["第一层", "感受层", "今天身体感觉怎么样？", "状态主环 + 异常警告条"],
          ["第二层", "理解层", "为什么是这个状态？", "点击解读弹窗（各指标详解）"],
          ["第三层", "行动层", "今天我该怎么做？", "训练建议卡 + 营养卡 + AI 对话"],
        ]
      ),
      p(""),

      h2("1.3  核心关注领域"),
      p("产品聚焦于细胞水平的健康管理，帮助用户逐步改善顽固性健康问题："),
      bullet("体重管理与代谢改善"),
      bullet("睡眠质量优化（深睡比例、REM 占比、觉醒次数）"),
      bullet("慢性炎症与疼痛（通过营养指导抗炎）"),
      bullet("心血管健康（HRV 趋势、静息心率基线）"),
      bullet("激素与生殖健康（长期 HRV 均值趋势）"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 02 技术架构
      // ══════════════════════════════════════════════════════════════════════
      h1("02  技术架构"),
      divider(),

      h2("2.1  整体架构"),
      dataTable(
        ["层级", "技术", "说明"],
        [
          ["前端 H5", "React 18 + Vite + JSX", "单文件组件，内联样式，无 CSS 文件依赖"],
          ["iOS 壳", "Swift + WKWebView", "原生容器加载 H5，提供 Apple Health 数据访问"],
          ["AI 服务", "Anthropic Claude API", "claude-sonnet-4-20250514，用于对话教练和食物识别"],
          ["数据计算", "health-utils.js（纯函数）", "全部计算逻辑独立模块，100% 单元测试覆盖"],
          ["图标", "内联 SVG（SVG_ICONS）", "不依赖字体文件，离线可用，WebView 兼容"],
          ["字体", "DM Sans（Google Fonts）", "优雅运动感，fallback 为系统 sans-serif"],
        ]
      ),
      p(""),

      h2("2.2  数据流向"),
      p("Apple Watch 采集数据后，通过以下路径流入应用："),
      p(""),
      p("Apple Watch → Apple Health → iOS Swift 读取 → sendPrompt() → Claude AI 解析 → window.postMessage → React 状态更新 → UI 渲染", { color: "555555", italic: true }),
      p(""),
      p("数据传输采用 JSON 格式，通过 window.postMessage 在 iOS WKWebView 与 H5 之间通信。parseHealthJSON() 函数负责解析和校验数据有效性。"),
      p(""),

      h2("2.3  状态管理"),
      p("应用使用 React 内置 useState / useCallback / useMemo 管理状态，无额外状态管理库："),
      p(""),
      dataTable(
        ["状态变量", "类型", "用途"],
        [
          ["liveData", "object (HealthData)", "当前健康数据，默认为 DEFAULT_DATA（演示数据）"],
          ["mealLog", "array (Meal[])", "今日饮食记录列表，由用户拍照累积"],
          ["tab", "string", "当前激活的导航标签"],
          ["modal", "object | null", "当前弹窗内容（null = 关闭）"],
          ["syncPhase", "0 | 1 | 2", "同步动画阶段：0 空闲 / 1 同步中 / 2 完成"],
          ["syncItems", "array", "同步完成后展示的数据项列表"],
        ]
      ),
      p(""),

      h2("2.4  iOS ↔ H5 通信协议"),
      p("同步按钮触发 sendPrompt()，携带标准提示词指令；iOS 端收到 Claude 回复后通过 postMessage 推回 H5。"),
      p(""),
      p("触发指令格式（sendPrompt 调用内容）："),
      note("COACH_AI_SYNC:请立即读取我的 Apple Watch 健康数据，今日 YYYY-MM-DD，本周 YYYY-MM-DD 到 YYYY-MM-DD。只回复纯 JSON 不含其他任何文字：{\"hrv_today\":数值,\"rhr_today\":数值,\"sleep_hours\":数值,\"sleep_awake_count\":数值,\"deep_sleep_pct\":数值,\"rem_sleep_pct\":数值,\"hrv_week\":[{\"day\":\"M/D\",\"val\":数值}],\"workout_today\":{\"type\":\"类型\",\"duration_min\":数值,\"calories\":数值},\"sync_time\":\"HH:MM\"}"),
      p(""),
      p("H5 端监听 message 事件，检测 JSON 中是否包含 hrv_today 或 \"hrv\" 字段，有效时调用 parseHealthJSON() 解析并更新 liveData。超时保护：30 秒后若未收到数据，自动关闭同步动画。"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 03 数据结构
      // ══════════════════════════════════════════════════════════════════════
      h1("03  数据结构定义"),
      divider(),

      h2("3.1  HealthData 健康数据对象"),
      dataTable(
        ["字段", "类型", "说明", "示例值"],
        [
          ["hrv", "number", "今日 HRV（ms）", "54.2"],
          ["rhr", "number", "静息心率（bpm）", "56"],
          ["sleep", "number", "睡眠时长（小时）", "7.17"],
          ["awake", "number (int)", "夜间觉醒次数", "0"],
          ["deep_pct", "number", "深睡比例（%）", "18"],
          ["rem_pct", "number", "REM 比例（%）", "22"],
          ["hrv_week", "HRVDay[]", "7天 HRV 数组", "见下方"],
          ["workout", "Workout", "今日训练记录", "见下方"],
          ["sync_time", "string", "同步时间 HH:MM", "19:41"],
          ["sync_date", "string", "同步日期 M月D日", "5月9日"],
          ["is_stale", "boolean", "是否为旧/演示数据", "false"],
        ]
      ),
      p(""),

      h2("3.2  HRVDay 单日 HRV 记录"),
      dataTable(
        ["字段", "类型", "说明"],
        [
          ["day", "string", "日期标签，格式 M/D，如 5/8"],
          ["val", "number | null", "HRV 值（ms）；null 表示当日无数据"],
        ]
      ),
      p(""),

      h2("3.3  Workout 训练记录"),
      dataTable(
        ["字段", "类型", "说明"],
        [
          ["type", "string", "训练类型，如「力量训练」「跑步」"],
          ["duration", "number", "训练时长（分钟）"],
          ["calories", "number", "消耗热量（kcal）"],
        ]
      ),
      p(""),

      h2("3.4  Meal 饮食记录（用户打卡）"),
      dataTable(
        ["字段", "类型", "说明"],
        [
          ["id", "number", "唯一 ID，使用 Date.now()"],
          ["time", "string", "记录时间 HH:MM"],
          ["photoUrl", "string (DataURL)", "拍照 base64 图片 URL"],
          ["foods", "Food[]", "识别到的食物列表"],
          ["totals", "MacroTotals", "本餐宏量营养素合计"],
          ["note", "string", "AI 生成的一句话点评"],
        ]
      ),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 04 健康状态计算逻辑
      // ══════════════════════════════════════════════════════════════════════
      h1("04  健康状态计算逻辑"),
      divider(),

      h2("4.1  综合恢复等级 getLevel()"),
      p("根据 HRV、静息心率、睡眠时长、觉醒次数综合判定当日状态，返回 green / yellow / red。"),
      p(""),
      dataTable(
        ["指标", "红灯条件", "黄灯条件", "绿灯"],
        [
          ["HRV", "< 48 ms → +1红", "48–54 ms → +1黄", "≥ 55 ms"],
          ["静息心率", "> 59 bpm → +1红", "57–59 bpm → +1黄", "≤ 56 bpm"],
          ["睡眠时长", "< 6.5 h → +1红", "6.5–7.4 h → +1黄", "≥ 7.5 h"],
          ["夜间觉醒", "—", "≥ 4次 → +1黄", "< 4次"],
        ]
      ),
      p(""),
      p("判断规则：红灯数 ≥ 1 或 黄灯数 ≥ 3 → 综合红灯；黄灯数 ≥ 1 → 综合黄灯；其余为绿灯。"),
      p(""),

      h2("4.2  HRV 颜色分类 classifyHrvColor()"),
      dataTable(
        ["HRV 值", "颜色名称", "十六进制", "含义"],
        [
          ["≥ 55 ms", "Recovery Aqua", "#59C3C3", "绿灯，恢复良好"],
          ["48–54 ms", "Warm Coral", "#F27D72", "黄灯，恢复尚可"],
          ["< 48 ms", "Warm Alert Red", "#E85D52", "红灯，恢复不足"],
          ["无数据 (null)", "Midnight Fog", "#39424F", "无数据"],
        ]
      ),
      p(""),

      h2("4.3  细胞健康评分 calcCHI()"),
      p("CHI（Cellular Health Index）是 0–100 分的综合细胞健康状态评分，由四个支柱加权计算："),
      p(""),
      p("CHI = 0.35 × P1（恢复状态）+ 0.25 × P2（细胞修复）+ 0.25 × P3（营养支持）+ 0.15 × P4（生活方式）"),
      p(""),

      h3("P1 — 恢复状态（权重 35%）"),
      dataTable(
        ["HRV 区间", "基础分 (hrvNorm)", "说明"],
        [
          ["≥ 65 ms", "100", "优秀"],
          ["55–64 ms", "82", "良好（绿灯上沿）"],
          ["48–54 ms", "60", "尚可（黄灯）"],
          ["42–47 ms", "38", "偏低（红灯）"],
          ["< 42 ms", "18", "极低"],
        ]
      ),
      p(""),
      p("静息心率调整（rhrAdj）：≤ 56 bpm → 0；57–59 bpm → -8；60–62 bpm → -18；> 62 bpm → -28"),
      p("趋势调整（trendAdj）：今日 HRV ≥ 周均值 +3 → +8；≤ 周均值 -5 → -8；其余 → 0"),
      p("P1 = max(0, min(100, hrvNorm + rhrAdj + trendAdj))"),
      p(""),

      h3("P2 — 细胞修复质量（权重 25%）"),
      p("由深睡评分、REM 评分、睡眠时长评分三项均值 + 觉醒调整计算："),
      p(""),
      dataTable(
        ["深睡比例", "deepS", "REM 比例", "remS", "睡眠时长", "sleepS"],
        [
          ["≥ 20%", "95", "≥ 22%", "95", "≥ 7.5h", "95"],
          ["16–19%", "78", "18–21%", "78", "7–7.4h", "82"],
          ["12–15%", "55", "14–17%", "55", "6.5–6.9h", "62"],
          ["< 12%", "28", "< 14%", "28", "6–6.4h", "38"],
          ["—", "—", "—", "—", "< 6h", "18"],
        ]
      ),
      p(""),
      p("觉醒调整（awakeAdj）：0–1次 → 0；2次 → -5；3次 → -12；≥ 4次 → -20"),
      p("P2 = max(0, min(100, (deepS + remS + sleepS) / 3 + awakeAdj))"),
      p(""),

      h3("P3 — 营养支持（权重 25%）"),
      p("若当日无饮食打卡记录，P3 默认取中性值 50 分。"),
      p("有记录时：先按当日恢复等级确定营养目标（见 4.5 节），计算饮食评分 calcDietScore()，P3 = round(score / 4 × 100)。"),
      p(""),

      h3("P4 — 生活方式一致性（权重 15%）"),
      p("基础分（consistencyS）：本周有效 HRV 天数 ≥ 5天 → 85；≥ 3天 → 65；否则 45"),
      p("训练加成（workoutBonus）：今日训练 ≥ 30分钟 → +15；> 0分钟 → +8；否则 0"),
      p("P4 = max(0, min(100, consistencyS + workoutBonus))"),
      p(""),

      h3("CHI 状态等级"),
      dataTable(
        ["CHI 分值", "状态名称（中文）", "颜色", "含义"],
        [
          ["≥ 75", "细胞活跃", "#59C3C3 Recovery Aqua", "细胞处于良好工作环境"],
          ["55–74", "细胞维稳", "#7DA7D9 Aerobic Blue", "整体平稳，有改善空间"],
          ["40–54", "细胞应激", "#F27D72 Warm Coral", "消耗 > 补充，需要支持"],
          ["< 40", "细胞耗竭", "#E85D52 Warm Alert Red", "身体需要被关注和补充"],
        ]
      ),
      p(""),

      h2("4.4  本周整体 HRV 评级 calcWeeklyOverall()"),
      p("统计绿灯（≥ 55 ms）、黄灯（48–54 ms）、红灯（< 48 ms）天数："),
      p("绿灯天数 ≥ 4 → 良好（#59C3C3）；≥ 2 → 中等（#F27D72）；否则 → 需关注（#E85D52）"),
      p(""),

      h2("4.5  营养目标 getNutritionTargets()"),
      dataTable(
        ["恢复等级", "热量目标", "蛋白质目标", "碳水目标", "脂肪目标"],
        [
          ["green（训练日）", "2000 kcal", "140 g", "200 g", "60 g"],
          ["yellow（恢复日）", "2000 kcal", "130 g", "200 g", "60 g"],
          ["red（休息日）", "2000 kcal", "120 g", "200 g", "60 g"],
        ]
      ),
      p(""),

      h2("4.6  饮食评分 calcDietScore()"),
      p("对照当日目标评估四项指标，每项达标得 1 分，总分 0–4："),
      bullet("proOk：蛋白质 ≥ 目标 × 70%"),
      bullet("carbOk：碳水 ≤ 目标"),
      bullet("fatOk：脂肪 ≤ 目标"),
      bullet("calOk：热量在目标 50%–110% 区间内"),
      p(""),
      p("评级：3–4分 → 均衡（#59C3C3）；2分 → 基本合理（#F27D72）；0–1分 → 需调整（#E85D52）"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 05 界面结构与导航
      // ══════════════════════════════════════════════════════════════════════
      h1("05  界面结构与导航"),
      divider(),

      h2("5.1  导航栏"),
      p("底部固定导航栏，4个标签页，激活态使用 Warm Coral（#F27D72）高亮："),
      p(""),
      dataTable(
        ["标签 ID", "中文名", "图标", "页面内容"],
        [
          ["dashboard", "今日", "ti-activity（HRV 波形）", "主页：当日身体状态全览"],
          ["checkin", "补给", "ti-camera（相机）", "饮食打卡：拍照 + AI 识别 + 营养记录"],
          ["coach", "AI", "ti-message-circle", "AI 教练对话页"],
          ["history", "节律", "ti-chart-line", "历史 HRV 趋势 + 本周解读"],
        ]
      ),
      p(""),

      h2("5.2  今日主页（dashboard）布局"),
      p("从上至下的卡片式纵向布局，全部卡片可点击展开解读弹窗："),
      p(""),
      dataTable(
        ["区块", "组件名", "交互", "弹窗 key"],
        [
          ["异常警告条", "AnomalyStrip", "仅展示（非绿灯时显示）", "—"],
          ["状态主环", "StatusRing", "点击 → 综合状态解读", "status"],
          ["四格指标卡", "MetricRow（2×2）", "每格点击 → 对应解读", "rhr / sleep / workout / chi"],
          ["睡眠卡", "SleepCard", "点击 → 睡眠分析解读", "sleep"],
          ["HRV 周趋势", "HRVChart", "点击 → 恢复节律解读", "hrv_chart"],
          ["明日训练建议", "RecCard", "点击 → 训练方案详解", "rec"],
          ["今日补给", "NutritionCard", "点击 → 补给方案解读", "nutrition"],
        ]
      ),
      p(""),

      h2("5.3  四格指标卡（MetricRow）详解"),
      p("采用 2×2 网格布局，每张卡片结构相同：图标 + 迷你图（或支柱点）/ 大数字 + 单位 / 状态描述。"),
      p(""),
      dataTable(
        ["格子", "数据源", "迷你可视化", "颜色逻辑"],
        [
          ["静息心率（RHR）", "d.rhr", "折线迷你图（近6天）", "≤ 56 绿 / 57–59 黄 / > 59 红"],
          ["睡眠", "d.sleep", "折线迷你图（近6天）", "≥ 7.5h 绿 / 6.5h+ 黄 / < 6.5h 红"],
          ["训练消耗", "d.workout.calories", "折线迷你图（近6天）", "固定 Warm Coral（训练归属）"],
          ["CHI 评分", "calcCHI(d, mealLog)", "四支柱彩色圆点", "随 CHI 分值动态变色"],
        ]
      ),
      p(""),
      note("CHI 卡片使用 DNA 图标（ti-dna），四个彩色圆点代表四项支柱评分，颜色同 CHI 状态等级色阶。"),
      p(""),

      h2("5.4  弹窗系统（Modal）"),
      p("全屏半透明遮罩 + 底部上滑面板，组件为 Modal。面板最大高度 76%，内容超出时自动滚动。"),
      p(""),
      p("弹窗结构：把手条 → 头部（图标 + 标题 + 关闭按钮）→ 彩色分割线 → 内容块列表 → 底部提示。"),
      p("内容块格式：标签（大写字母，左侧彩条标识）+ 正文文本。"),
      p("关闭方式：点击遮罩 / 点击关闭按钮 / 按 Escape 键（PC 调试时可用）。"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 06 各页面详细说明
      // ══════════════════════════════════════════════════════════════════════
      h1("06  各页面详细说明"),
      divider(),

      h2("6.1  状态主环（StatusRing）"),
      p("主页最核心的视觉组件，展示今日综合恢复状态。由恢复等级（green / yellow / red）驱动所有视觉变量："),
      p(""),
      dataTable(
        ["等级", "标签", "英文标识", "情绪光晕颜色", "提示语"],
        [
          ["green", "稳定", "RHYTHM", "Recovery Aqua", "今天的身体节律稳定，可以温和推进训练计划。"],
          ["yellow", "照顾", "CARE", "Warm Coral", "身体正在提醒你降低强度，把恢复放在训练之前。"],
          ["red", "保护", "PROTECT", "Warm Alert Red", "今天的任务不是突破，而是保护恢复节律。"],
        ]
      ),
      p(""),
      p("主环使用 SVG 弧形进度环，显示今日 HRV 值（0–80 ms 刻度）；右侧展示静息心率、睡眠、恢复节律、今日消耗四项子指标；底部显示7日 HRV 折线迷你图。"),
      p(""),

      h2("6.2  睡眠卡（SleepCard）"),
      p("横向颜色条展示三阶段睡眠比例，条宽度正比于分钟数："),
      bullet("浅睡（Core）— Dust Rose #D9A5B3"),
      bullet("REM — Aerobic Blue #7DA7D9"),
      bullet("深睡 — Recovery Aqua #59C3C3"),
      p(""),
      p("顶部右侧显示觉醒次数，0次时显示绿色勾号标识。"),
      p(""),

      h2("6.3  HRV 周趋势卡（HRVChart）"),
      p("7天横向进度条图，每行 = 1天。颜色按 classifyHrvColor() 映射：绿 / 黄 / 红 / 灰（无数据）。最新一天文字加粗。底部显示三色图例（≥ 55 / 48–54 / < 48）。"),
      p(""),

      h2("6.4  训练建议卡（RecCard）"),
      p("根据综合恢复等级展示明日推荐训练方案："),
      p(""),
      dataTable(
        ["等级", "方案名", "图标", "弧形环时长", "区间条", "训练细节"],
        [
          ["green", "正常训练", "ti-barbell", "50分钟", "Z3 高亮", "推 · 拉 · 核心"],
          ["yellow", "轻量有氧", "ti-run", "35分钟", "Z2 高亮", "Z2 · 低于 140 bpm"],
          ["red", "休息", "ti-zzz", "20分钟", "Z1 高亮", "仅拉伸"],
        ]
      ),
      p(""),

      h2("6.5  今日补给卡（NutritionCard）"),
      p("未打卡状态：显示估算数据，提示前往补给页记录。已打卡状态：显示真实数据，显示已记录餐数。"),
      p("内容：热量大字 + 进度条 / 蛋白质 · 碳水 · 脂肪三行进度条（均对照当日目标计算百分比）。"),
      p(""),

      h2("6.6  补给页（FoodCheckinPage）"),
      p("饮食打卡主流程："),
      bullet("点击「拍照记录这一餐」→ 触发 input[type=file,capture=environment] 打开相机"),
      bullet("选择照片后调用 analyzeFood()，发送 base64 图片给 Claude Vision API"),
      bullet("PhotoAnalysisSheet 展示分析进度（旋转动画）→ 识别结果（食物列表 + 营养数值）"),
      bullet("点击「记录这一餐」→ onAddMeal() 写入 mealLog，关闭弹层"),
      bullet("MealCard 展示历史记录，支持展开查看食物明细，支持删除"),
      bullet("DailyNutritionBanner 实时汇总全天摄入（4个弧形环：蛋白质 / 碳水 / 脂肪 / 热量）"),
      bullet("DietInsight 区块（有记录时显示）：宏量结构可视化 + 营养叙述文本 + 与恢复状态联动建议"),
      p(""),

      h2("6.7  AI 教练页（CoachPage）"),
      p("对话界面，底部输入框 + 发送按钮，顶部快捷问题芯片组。"),
      p(""),
      p("系统 Prompt 包含：今日 HRV / 心率 / 睡眠 / 训练数据 + 饮食记录摘要（有打卡时）。Claude 模型角色设定为温暖克制的长期健康教练，中文回复，≤ 150字。"),
      p(""),
      p("快捷芯片（有饮食记录时）：今日饮食分析 / 蛋白质够了吗 / 训练后怎么吃 / 明日建议 / 恢复评级"),
      p("快捷芯片（无饮食记录时）：今日训练分析 / 明日建议 / 本周总结 / 补剂方案 / 恢复评级"),
      p(""),

      h2("6.8  节律历史页（HistoryPage）"),
      p("展示本周 HRV 趋势条形图 + 3格汇总数字（HRV 均值 / 心率均值 / 本周训练次数）。"),
      p("WeeklyInsight 区块包含："),
      bullet("总评卡：七日圆点日历（颜色随 HRV 分级）+ 绿/黄/红灯天数统计"),
      bullet("HRV 趋势叙述：自动生成峰值/低谷分析文本，趋势方向判断（↑ / → / ↓）"),
      bullet("本周亮点与注意：基于实际数据生成的图标 + 文字洞察"),
      bullet("下周行动建议：3条个性化建议（HRV 目标 / 休息日安排 / 睡前补剂）"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 07 同步动画流程
      // ══════════════════════════════════════════════════════════════════════
      h1("07  数据同步动画流程"),
      divider(),

      h2("7.1  同步状态机"),
      dataTable(
        ["阶段（syncPhase）", "视觉状态", "触发条件", "持续时间"],
        [
          ["0（空闲）", "顶部显示「等待同步」或上次同步时间", "初始 / 超时 / 完成后", "—"],
          ["1（同步中）", "覆盖层显示旋转橙色环 + 骨架屏占位", "点击同步按钮", "直到数据到达（最长30秒）"],
          ["2（完成）", "覆盖层显示绿色勾 + 4项数据值列表", "postMessage 收到有效数据", "2.4秒后自动关闭"],
        ]
      ),
      p(""),

      h2("7.2  SyncOverlay 组件动效"),
      bullet("同步中：橙色脉冲环动画（ringPulse @keyframes）+ 旋转进度环 + 骨架屏（shimmer @keyframes）"),
      bullet("完成：颜色从 Warm Coral → Recovery Aqua（400ms transition）+ 勾号弹出动画（popIn）"),
      bullet("数据项卡片：itemSlide 逐个进入动画"),
      p(""),
      p("降级处理（sendPrompt 不可用时）：模拟动画演示，数据项以 480ms 间隔依次呈现，总时长约 3.5 秒。"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 08 AI 食物识别流程
      // ══════════════════════════════════════════════════════════════════════
      h1("08  AI 食物识别流程"),
      divider(),

      h2("8.1  识别调用"),
      p("analyzeFood(base64, mimeType) 向 Claude claude-sonnet-4-20250514 发送图片（Vision 模式），要求返回纯 JSON："),
      note("{\"foods\":[{\"name\":\"食物名\",\"emoji\":\"🍗\",\"amount\":\"约100g\",\"calories\":200,\"protein\":25,\"carbs\":5,\"fat\":8}],\"totals\":{\"calories\":X,\"protein\":X,\"carbs\":X,\"fat\":X},\"note\":\"一句话简评，包含营养建议\"}"),
      p(""),
      p("解析结果时通过正则提取 JSON 对象（text.match(/\\{[\\s\\S]*\\}/)），容错 API 返回多余文字的情况。"),
      p(""),

      h2("8.2  降级处理"),
      p("API 请求失败或返回非法 JSON 时，使用内置 MOCK 数据（米饭 + 清蒸鱼 + 炒青菜示例）保证用户流程不中断。"),
      p("识别失败时（result.error）确认按钮置灰，提示「识别暂未成功，请手动添加或重新拍照」。"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 09 VI 设计系统
      // ══════════════════════════════════════════════════════════════════════
      h1("09  VI 设计系统"),
      divider(),

      h2("9.1  设计主题"),
      p("「Luxury Athletic OS」——情感化健身系统。兼具高端运动品牌的克制质感与 AI 科技感。设计哲学：情绪即材料（Emotion as Material），颜色传达身体状态，而非装饰。"),
      p(""),

      h2("9.2  基础色彩系统"),
      dataTable(
        ["变量名", "颜色名称", "十六进制", "用途"],
        [
          ["ink", "Mineral Graphite", "#1F2328", "主背景色，非纯黑，高级矿物感"],
          ["ink2", "Soft Carbon", "#2B3138", "卡片底色，磨砂树脂质感"],
          ["ink3", "Midnight Fog", "#39424F", "边框 / 分割线 / 无数据填充"],
          ["ink4", "Deep Indigo", "#4E5D94", "次要元素背景 / AI 消息气泡"],
          ["fog", "Warm Fog（隐色）", "#6B6560", "极暗的辅助文字"],
          ["mid", "中性暖灰", "#A09A94", "次要文字"],
          ["lit", "浅暖灰", "#C4BDB7", "正文文字"],
          ["white", "Warm Fog White", "#D8D1C7", "标题 / 最亮文字（非纯白）"],
        ]
      ),
      p(""),

      h2("9.3  语义色（情绪能量色）"),
      dataTable(
        ["颜色名称", "十六进制", "含义", "使用场景"],
        [
          ["Recovery Aqua", "#59C3C3", "恢复良好 / 绿灯", "HRV ≥ 55 / CHI ≥ 75 / 完成状态"],
          ["Warm Coral", "#F27D72", "注意 / 降低强度 / 激活", "HRV 黄灯 / 导航激活 / 训练高亮"],
          ["Warm Alert Red", "#E85D52", "警告 / 强制休息", "HRV 红灯 / CHI < 40 / 严重异常"],
          ["Aerobic Blue", "#7DA7D9", "Zone 2 有氧 / CHI 维稳 / AI", "AI 对话 / CHI 55–74 / 历史图表"],
          ["Dust Rose", "#D9A5B3", "睡眠 / 恢复 / 冥想", "睡眠卡浅睡色 / 静息感"],
          ["Butter Energy", "#F4D35E", "成就 / 连续打卡", "（预留：成就系统）"],
          ["Deep Indigo", "#4E5D94", "AI / 技术感", "AI 对话背景 / 营养 banner"],
        ]
      ),
      p(""),

      h2("9.4  字体与对比度规范"),
      p("主字体：DM Sans（Google Fonts），300 / 400 / 500 / 600 / 700 字重。"),
      p(""),
      p("对比度锚定（v1.1 Contrast Anchored）："),
      bullet("核心数字：#FFFFFF 纯白（对比度 13:1 on #1F2328）— 26px / fontWeight 300"),
      bullet("标题：#D8D1C7 Warm Fog（11.2:1）— 专属 C.white 变量"),
      bullet("正文：#C4BDB7（9.1:1）— C.lit 变量"),
      bullet("次要文字：#A09A94（6.7:1）— C.mid 变量"),
      p(""),

      h2("9.5  动效系统"),
      dataTable(
        ["动效名", "@keyframes", "时长", "用途"],
        [
          ["breathe", "scale(.7)→scale(1.4)", "2s infinite", "状态圆点呼吸感（RHYTHM 脉冲）"],
          ["ringPulse", "scale(1)→scale(1.14)", "1.6s infinite", "同步动画外环脉冲"],
          ["slideUp", "translateY(56px)→0", "0.32s", "弹窗从底部滑出"],
          ["spin", "rotate(360deg)", "1.2s linear", "同步旋转环 / AI 识别转圈"],
          ["bop", "translateY(0)→-4px→0", "1.2s infinite", "AI 对话等待三点动画"],
          ["shimmer", "translateX(-100%)→100%", "1.4s infinite", "骨架屏流光效果"],
          ["itemSlide", "translateX(-10px)→0", "0.38s", "同步数据项滑入"],
          ["popIn", "scale(.5)→1", "0.3s", "完成勾号弹出"],
        ]
      ),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 10 工作流程
      // ══════════════════════════════════════════════════════════════════════
      h1("10  典型用户工作流程"),
      divider(),

      h2("10.1  每日核心流程"),
      p(""),
      dataTable(
        ["步骤", "用户行为", "系统响应", "涉及组件"],
        [
          ["1", "早晨打开应用", "展示昨日同步数据（is_stale=true 时显示「等待同步」）", "App / 顶部状态栏"],
          ["2", "点击「同步」按钮", "触发 sendPrompt，显示同步动画覆盖层", "SyncOverlay / doSync()"],
          ["3", "收到 Apple Health 数据", "2.4秒动画后，UI 更新为今日真实数据", "parseHealthJSON / postMessage"],
          ["4", "查看状态主环", "了解今日综合恢复等级（绿/黄/红）及身体提示语", "StatusRing"],
          ["5", "点击主环查看详解", "弹窗展示：综合评级依据 / 当前状态含义 / 建议行动", "Modal / INTERP.status"],
          ["6", "查看四格指标卡", "浏览 RHR / 睡眠 / 训练消耗 / CHI 评分", "MetricRow"],
          ["7", "点击 CHI 卡", "弹窗展示：CHI 说明 / 今日状态解读 / 四项支柱 / 今日关注", "Modal / INTERP.chi"],
          ["8", "查看明日训练建议", "根据恢复等级显示推荐方案", "RecCard"],
          ["9", "午餐/晚餐后拍照打卡", "AI 识别食物营养，累积到 mealLog", "FoodCheckinPage / analyzeFood"],
          ["10", "查询 AI 教练", "基于今日全部数据进行对话", "CoachPage / Claude API"],
        ]
      ),
      p(""),

      h2("10.2  数据驱动联动关系"),
      p("各模块数据依赖关系如下："),
      p(""),
      bullet("liveData（健康数据）→ 驱动所有今日页展示，包括主环颜色、指标卡数值、弹窗内容"),
      bullet("mealLog（饮食记录）→ 影响 NutritionCard、DailyNutritionBanner、DietInsight、CHI 中的 P3 营养支持分、AI 对话系统 Prompt"),
      bullet("level（恢复等级）→ 影响 AnomalyStrip、StatusRing、RecCard、NutritionCard 模式标签、DietInsight 建议文本"),
      bullet("calcCHI(d, mealLog) → 每次渲染时实时计算，为 MetricRow CHI 卡和 INTERP.chi 弹窗提供数据"),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 11 解读内容库
      // ══════════════════════════════════════════════════════════════════════
      h1("11  解读内容库（INTERP）"),
      divider(),

      p("所有弹窗内容由 INTERP 对象统一管理，每个 key 对应一个函数，接收当前健康数据返回弹窗数据对象。"),
      p(""),
      dataTable(
        ["Key", "函数签名", "弹窗主题", "包含章节"],
        [
          ["status", "INTERP.status(d, level)", "综合状态评级", "综合评级依据 / 当前状态含义 / 建议行动"],
          ["hrv", "INTERP.hrv(d)", "心率变异性（HRV）", "当前读数 / HRV 是什么 / 你的参考基准 / 阈值速查"],
          ["rhr", "INTERP.rhr(d)", "静息心率（RHR）", "当前读数 / 你的个人基准 / 近期趋势"],
          ["sleep", "INTERP.sleep(d)", "睡眠分析", "今晚概况 / 各阶段意义 / 对今日训练的影响"],
          ["workout", "INTERP.workout(d)", "今日训练记录", "训练概览 / 负荷评估 / 对明日的影响"],
          ["rec", "INTERP.rec(level)", "明日训练建议", "推荐方案 / 心率区间说明 / 特别提示"],
          ["nutrition", "INTERP.nutrition(d, level)", "补给方案解读", "今日模式 / 蛋白质策略 / 补充时机 / 抗炎食物"],
          ["hrv_chart", "INTERP.hrv_chart(d)", "恢复节律趋势", "本周走势 / 为何会波动 / 长期改善目标"],
          ["chi", "INTERP.chi(chiData)", "细胞健康评分", "什么是CHI / 今日状态 / 四项支柱评分 / 今日关注"],
        ]
      ),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 12 健康工具函数
      // ══════════════════════════════════════════════════════════════════════
      h1("12  工具函数模块（health-utils.js）"),
      divider(),

      p("所有业务计算逻辑集中在 health-utils.js，纯函数设计，100% 单元测试覆盖（Vitest，38个测试用例）。"),
      p(""),
      dataTable(
        ["函数名", "输入", "输出", "说明"],
        [
          ["toFiniteNumber(value, fallback)", "any, number", "number", "安全数字转换，非有限数返回 fallback"],
          ["parseOptionalNumber(value)", "any", "number | null", "可选数字，无效返回 null"],
          ["normalizeWorkout(workout)", "object", "Workout", "兼容 duration_min / duration 字段"],
          ["normalizeHrvWeek(week)", "array", "HRVDay[]", "规范化7天 HRV 数组"],
          ["validHrvWeek(week)", "HRVDay[]", "HRVDay[]", "过滤 null，仅保留有效天"],
          ["averageHrvWeek(week)", "HRVDay[]", "number", "有效天的 HRV 均值"],
          ["parseHealthJSON(raw, now)", "string|object", "HealthData | null", "解析 Claude 回传的健康 JSON"],
          ["getLevel(d)", "HealthData", "\"green\"|\"yellow\"|\"red\"", "综合恢复等级"],
          ["classifyHrvColor(val)", "number | null", "string (hex)", "HRV 值 → VI 调色板颜色"],
          ["calcCHI(d, mealLog)", "HealthData, Meal[]", "CHIResult", "四维度 CHI 综合评分"],
          ["calcWeeklyOverall(validWeek)", "HRVDay[]", "WeeklyOverall", "本周整体 HRV 评级"],
          ["sumMealTotals(mealLog)", "Meal[]", "MacroTotals", "累加全天营养素"],
          ["getNutritionTargets(level)", "string", "MacroTargets", "按恢复等级获取营养目标"],
          ["calcDietScore(totals, targets)", "MacroTotals, MacroTargets", "DietScore", "饮食评分 0–4"],
          ["calcMacroRatios(totals)", "MacroTotals", "MacroRatios", "宏量热量百分比（pPct+cPct+fPct=100）"],
        ]
      ),
      p(""),

      pageBreak(),

      // ══════════════════════════════════════════════════════════════════════
      // 13 版本记录
      // ══════════════════════════════════════════════════════════════════════
      h1("13  版本记录"),
      divider(),

      dataTable(
        ["版本", "日期", "主要变更"],
        [
          ["v0.1", "2025年4月", "iOS Swift 壳 + H5 基础骨架，Apple Health 数据读取原型"],
          ["v0.5", "2025年5月初", "今日主页完整实现：状态主环、四格指标卡、睡眠卡、HRV 趋势、训练建议"],
          ["v0.7", "2025年5月中", "饮食打卡页（拍照 + Claude Vision 识别）+ AI 对话教练页"],
          ["v0.8", "2025年5月中", "历史节律页 + 本周解读模块 + WeeklyInsight"],
          ["v0.9", "2025年5月下", "VI 设计系统全面升级（Luxury Athletic OS）+ 对比度锚定 v1.1"],
          ["v1.0", "2025年5月", "细胞健康评分（CHI）集成 + CHI 弹窗解读 + VI 设计规范文档 + 产品说明文档"],
        ]
      ),
      p(""),
      h2("1.0 版本待办（后续迭代）"),
      bullet("本地数据持久化（mealLog 跨会话保存，IndexedDB 或 iOS UserDefaults）"),
      bullet("历史多周数据对比与长期 HRV 趋势图（当前仅支持本周）"),
      bullet("成就系统与连续打卡 streak（Butter Energy 颜色体系）"),
      bullet("个人基准设定页面（静息心率基准、体重、目标等）"),
      bullet("苹果健康数据自动后台同步（无需手动点击同步按钮）"),
      bullet("睡眠阶段详细分析（按小时展示，而非仅比例）"),
      bullet("通知提醒（训练窗口提示、补餐提醒）"),
      p(""),

      divider(),

      new Paragraph({
        spacing: { before: 200, after: 80 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "文档终止  ·  Coach.AI v1.0 产品说明文档", font: "Arial", size: 18, color: "AAAAAA", italics: true })],
      }),
      new Paragraph({
        spacing: { before: 40, after: 40 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "本文档随产品迭代持续更新，最新版本以 git 仓库 design/ 目录为准", font: "Arial", size: 17, color: "BBBBBB", italics: true })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/Users/hengxinliang/project/coachAI/design/coach-ai-product-spec-v1.0.docx", buf);
  console.log("✓ coach-ai-product-spec-v1.0.docx generated");
});
