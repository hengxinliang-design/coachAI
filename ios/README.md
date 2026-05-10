# Coach.AI iOS 混合开发集成指南

## 项目结构

```
CoachAI-iOS/
├── CoachAI/
│   ├── AppDelegate.swift        # App 入口
│   ├── ViewController.swift     # WKWebView 容器 + JS Bridge
│   ├── HealthKitManager.swift   # HealthKit 数据读取
│   ├── Info.plist               # 权限声明（合并进项目）
│   └── bridge-adapter.js        # H5 侧 Bridge 适配器
└── README.md
```

---

## 第一步：Xcode 项目配置

### 1.1 新建项目
- 选择 **App** 模板
- Language: **Swift**
- Interface: **Storyboard**（无需 SwiftUI）
- 最低部署版本：**iOS 16.0**

### 1.2 开启 HealthKit 能力
在 Xcode 中：
1. 选择 Target → **Signing & Capabilities**
2. 点击 **+ Capability**
3. 搜索并添加 **HealthKit**

### 1.3 配置 Info.plist
将 `Info.plist` 文件中的 key 合并进项目的 `Info.plist`。
关键项：
- `NSHealthShareUsageDescription`（必填，否则审核拒绝）
- `UIRequiredDeviceCapabilities` 包含 `healthkit`

---

## 第二步：复制 Swift 文件

将以下文件拖入 Xcode 项目：
- `AppDelegate.swift`（替换现有）
- `ViewController.swift`（替换现有）
- `HealthKitManager.swift`（新增）

---

## 第三步：打包 H5 资源

### 方式一：本地 Bundle（推荐，离线可用）

```bash
# 在 coach-ai 项目目录执行
npm run build

# 将 dist/ 文件夹重命名为 www/
# 拖入 Xcode 项目根目录
# 确保 "Copy items if needed" 已勾选
```

`ViewController.swift` 会优先加载 `www/index.html`。

### 方式二：远程 URL（开发调试用）

修改 `ViewController.swift` 中：
```swift
if let url = URL(string: "https://your-coach-ai.com") {
```

---

## 第四步：H5 代码适配

在 `coach-ai.jsx` 的 `doSync` 函数中，用 `CoachSync` 替换现有逻辑：

```javascript
// 在 App 组件顶部引入 bridge-adapter.js（或内联代码）

const doSync = () => {
  if (syncing || syncPhase === 1) return;
  setSyncing(true); setSyncPhase(1); setSyncItems([]);

  window.CoachSync.sync(
    // 成功回调
    (data) => {
      const parsed = parseHealthJSON(
        typeof data === 'string' ? data : JSON.stringify(data)
      );
      if (parsed) {
        setLiveData(parsed);
        setSyncItems([
          { icon: "ti-activity",          label: "HRV",    value: `${Math.round(parsed.hrv)} ms` },
          { icon: "ti-heart-rate-monitor",label: "静息心率",value: `${parsed.rhr} bpm` },
          { icon: "ti-moon-stars",        label: "睡眠",   value: `${parsed.sleep.toFixed(1)} h` },
          { icon: "ti-barbell",           label: "训练记录",value: `${parsed.workout?.duration_min ?? 0} min` },
        ]);
        setSyncPhase(2);
        setTimeout(() => { setSyncPhase(0); setSyncing(false); setSyncItems([]); }, 2400);
      }
    },
    // 错误回调
    (err) => {
      console.error('同步失败:', err);
      setSyncPhase(0); setSyncing(false); setSyncItems([]);
    }
  );
};
```

---

## 数据流说明

```
用户点击「同步」按钮
    ↓
H5: window.CoachSync.sync() 
    ↓ 检测 isNative
    ↓
[原生模式]                          [浏览器模式]
window.CoachBridge.sync()           window.sendPrompt(...)
    ↓                                    ↓
Swift: HealthKitManager              Claude 读取 HealthKit
    ↓                                    ↓
HKStatisticsQuery ×4                 回复 JSON 到对话
    ↓                                    ↓
JSON 序列化                          postMessage 注入
    ↓                                    ↓
webView.evaluateJavaScript            window.dispatchEvent
    ↓                                    ↓
window.__receiveHealthData(data)     message 事件监听
    ↓
CoachBridge.onDataReceived(data)
    ↓
setLiveData(parsed) → 界面更新
```

---

## 读取的健康数据类型

| 数据 | HealthKit 标识符 | 说明 |
|------|----------------|------|
| HRV | `heartRateVariabilitySDNN` | 今日平均值 |
| 静息心率 | `restingHeartRate` | 今日平均值 |
| 睡眠 | `sleepAnalysis` | 昨晚 20:00 → 今日 14:00 |
| 本周 HRV | `heartRateVariabilitySDNN` | 7日每日均值 |
| 训练记录 | `HKWorkoutType` | 今日最新一条 |

---

## App Store 发布注意事项

1. **HealthKit 审核说明**：在 App Store Connect 的 App 信息里，需要勾选"使用 HealthKit"并填写使用说明
2. **隐私标签**：需要声明读取"健康与健身"类数据，用途为"App 功能"
3. **测试设备**：HealthKit 模拟器数据有限，建议真机测试
4. **最低版本**：HealthKit sleepAnalysis 的 `.asleepDeep`/`.asleepREM` 需要 iOS 16+

---

## 常见问题

**Q: 模拟器上没有数据怎么办？**  
A: 在模拟器的「健康」App 里手动添加测试数据，或在真机上测试。

**Q: 权限弹窗只出现一次？**  
A: iOS 权限只请求一次，用户拒绝后需要去「设置 → 隐私与安全性 → 健康」手动开启。

**Q: WKWebView 加载本地 HTML 白屏？**  
A: 确保 `www/index.html` 的路径正确，且在 Xcode 中 Target Membership 已勾选。
