# Coach.AI

> 基于 Apple Watch 实时健康数据的 AI 私人教练，提供恢复状态分析、训练建议与饮食方案。

---

## 项目结构

```
coachAI/
├── h5/
│   └── coach-ai.jsx          # H5 主程序（React，Blue Lotus 配色）
├── ios/
│   ├── CoachAI/
│   │   ├── AppDelegate.swift       # iOS App 入口
│   │   ├── ViewController.swift    # WKWebView + JS Bridge
│   │   ├── HealthKitManager.swift  # HealthKit 数据读取层
│   │   ├── Info.plist              # 权限声明
│   │   └── bridge-adapter.js      # H5 侧 Bridge 适配器
│   └── README.md                  # iOS 集成指南
└── README.md
```

---

## 功能特性

- 📊 **实时健康数据同步** — HRV、静息心率、睡眠结构、训练记录
- 🟢🟡🔴 **三级恢复评级** — 绿灯/黄灯/红灯自动判断
- 💬 **AI 教练对话** — 基于实时数据的个性化建议（Claude API）
- 🌅 **晨检系统** — 主观状态 + 工作压力综合评分
- 📈 **历史趋势** — HRV 周趋势、训练日志
- 🎨 **Blue Lotus 配色** — #19309A / #4B69EF / #7E96FE / #B6D8F7 / #FFB967

---

## 技术架构

```
iOS 原生壳 (Swift + WKWebView)
    ↕ JS Bridge
H5 页面 (React + Blue Lotus Design)
    ↕ Anthropic API
Claude AI (claude-sonnet-4)
    ↕ HealthKit
Apple Watch 数据
```

---

## 快速开始

### H5 开发

```bash
# 安装依赖（使用 Vite + React）
npm create vite@latest coach-ai -- --template react
cd coach-ai
npm install

# 将 h5/coach-ai.jsx 替换 src/App.jsx
# 启动开发服务器
npm run dev
```

### iOS 集成

参考 `ios/README.md` 的完整集成指南。

核心步骤：
1. 新建 Xcode 项目，开启 **HealthKit Capability**
2. 复制 `ios/CoachAI/` 下的 Swift 文件
3. H5 打包后放入 `www/` 文件夹
4. 真机测试

---

## 设计语言

参考 Marc Newson 有机流体几何设计风格，结合 Blue Lotus 色彩体系：

| 色值 | 用途 |
|------|------|
| `#19309A` | 深底色、补剂图标 |
| `#4B69EF` | 中蓝、绿灯/成功状态 |
| `#7E96FE` | 浅蓝、次要文字、REM |
| `#B6D8F7` | 天蓝、浅睡、辅助信息 |
| `#FFB967` | 暖橙、主强调、导航激活 |

---

## License

MIT
