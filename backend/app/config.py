"""
config.py — 个人生理基线与阈值（coach.ai dev spec v2.0 §2.1）

所有硬编码常量集中在此，便于后续多用户化时改为按用户读取。
"""

# ── 个人生理基线（spec §2.1） ────────────────────────────────────────────────
RHR_BASELINE_LOW = 52      # 静息心率基线下沿 (bpm)，7日滚动均值
RHR_BASELINE_HIGH = 54     # 静息心率基线上沿 (bpm)
HR_MAX = 178               # 最大心率 (bpm)，Apple Watch 实测
HRV_BASELINE = 66.0        # HRV SDNN 基线 (ms)
WRIST_TEMP_LOW = 35.1      # 睡眠腕温基线下沿 (°C)
WRIST_TEMP_HIGH = 35.5     # 睡眠腕温基线上沿 (°C)

# HRV 异常值阈值：单日 > 100ms 视为测量偏差，剔除出评级与基线（spec §2.2 实战教训）
HRV_OUTLIER_THRESHOLD = 100.0

# ── 恢复评分权重（spec §2.2） ────────────────────────────────────────────────
WEIGHT_HRV = 0.50
WEIGHT_RHR = 0.35
WEIGHT_TEMP = 0.15

# HRV 为异常值时，去掉 HRV 权重后在 RHR / 腕温 间重新归一化
WEIGHT_RHR_NO_HRV = WEIGHT_RHR / (WEIGHT_RHR + WEIGHT_TEMP)   # 0.70
WEIGHT_TEMP_NO_HRV = WEIGHT_TEMP / (WEIGHT_RHR + WEIGHT_TEMP)  # 0.30

# ── 评级阈值（spec §2.3 决策矩阵） ───────────────────────────────────────────
HRV_GREEN_MIN = 60.0   # HRV ≥ 60ms → 优秀
HRV_RED_MAX = 40.0     # HRV < 40ms → 较差（40–59 之间为中等）

RHR_GREEN_MAX = 54     # RHR ≤ 54bpm → 优秀
RHR_RED_MIN = 60       # RHR > 60bpm → 较差（55–60 之间为中等）

WRIST_TEMP_YELLOW_DEV = 0.3  # 腕温偏差 ≥ +0.3°C → 黄
WRIST_TEMP_RED_DEV = 0.5     # 腕温偏差 ≥ +0.5°C → 红

# 7日滚动基线计算窗口
BASELINE_WINDOW_DAYS = 7

# ── 心率分区（spec §2.1，基于 HR_MAX = 178） ─────────────────────────────────
HR_ZONES = [
    {"zone": 1, "label": "Z1", "name": "主动恢复", "min": 0,   "max": 127, "desc": "主动恢复散步"},
    {"zone": 2, "label": "Z2", "name": "有氧基础", "min": 128, "max": 140, "desc": "有氧基础 / 脂肪燃烧"},
    {"zone": 3, "label": "Z3", "name": "有氧强化", "min": 141, "max": 152, "desc": "有效有氧强化"},
    {"zone": 4, "label": "Z4", "name": "无氧阈",   "min": 153, "max": 164, "desc": "无氧阈 / 高强度间歇"},
    {"zone": 5, "label": "Z5", "name": "最大强度", "min": 165, "max": 999, "desc": "最大强度 / 冲刺"},
]
