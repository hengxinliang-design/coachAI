"""
environment.py — 环境上下文引擎（产品方向 B：上下文标注层，不改核心评分）

把自动采集的环境信号（气压/海拔/天气/空气质量/血氧/位置变化）转成**解释性标注**，
用来解释恢复/睡眠为何异常，而不是作为评分权重——与 spec 处理 HRV 异常值的哲学一致：
不让弱噪声信号污染已验证的核心评分。

输出的每个 factor 形如标注（category="environment"），可直接并入 sleep/recovery 的
观察指标叠加层。全部纯函数，可独立测试。所有输入皆可选（None 即跳过该因子）。
"""
from __future__ import annotations

# ── 阈值（基于运动生理学的合理经验值） ──────────────────────────────────────
PRESSURE_DROP_MODERATE = 6.0    # 日环比气压下降 ≥6 hPa：偏头痛/睡眠变差/HRV 下降
PRESSURE_DROP_HIGH = 10.0       # ≥10 hPa：影响显著
ALTITUDE_MODERATE = 1500        # 海拔 (m)：>1500 低氧分压开始影响 HRV/睡眠
ALTITUDE_HIGH = 2500
HEAT_TEMP_C = 28                # 高温阈值
HUMIDITY_HIGH = 70              # 高湿阈值（与高温叠加才显著）
COLD_TEMP_C = 5
AQI_MODERATE = 100              # 空气质量指数：>100 敏感人群不适
AQI_HIGH = 150
SPO2_LOW = 95                   # 血氧 (%)
SPO2_VERY_LOW = 90

_SEVERITY_RANK = {"info": 0, "moderate": 1, "high": 2}


def _factor(factor: str, label: str, severity: str, affects: list[str], note: str) -> dict:
    return {"factor": factor, "label": label, "category": "environment",
            "severity": severity, "affects": affects, "note": note}


def analyze_environment(
    pressure_hpa: float | None = None,
    pressure_hpa_prev: float | None = None,
    altitude_m: float | None = None,
    temp_c: float | None = None,
    humidity_pct: float | None = None,
    aqi: int | None = None,
    spo2_pct: float | None = None,
    location_changed: bool = False,
    timezone_shift_hours: int = 0,
) -> dict:
    """
    分析当日环境信号，产出解释性标注。

    返回 {factors, auto_annotations, summary}：
      factors          —— 详细因子列表（含 severity / affects / note）
      auto_annotations —— 可自动写入标注系统的 label 列表
      summary          —— 一句话环境概述（无显著因子时给"平稳"）
    """
    factors: list[dict] = []

    # 气压骤降（需提供昨日气压做环比）
    if pressure_hpa is not None and pressure_hpa_prev is not None:
        drop = pressure_hpa_prev - pressure_hpa
        if drop >= PRESSURE_DROP_HIGH:
            factors.append(_factor("barometric_drop", "气压骤降", "high", ["hrv", "sleep"],
                f"气压较昨日下降 {drop:.0f} hPa（显著），易引发头痛、睡眠变浅并压低 HRV，今日恢复指标偏低可部分归因于此。"))
        elif drop >= PRESSURE_DROP_MODERATE:
            factors.append(_factor("barometric_drop", "气压下降", "moderate", ["hrv", "sleep"],
                f"气压较昨日下降 {drop:.0f} hPa，可能轻度影响睡眠与 HRV。"))

    # 海拔 / 低氧
    if altitude_m is not None:
        if altitude_m >= ALTITUDE_HIGH:
            factors.append(_factor("altitude", "高海拔低氧", "high", ["hrv", "rhr", "sleep"],
                f"当前海拔约 {altitude_m:.0f} m，氧分压明显偏低，会抬高静息心率、压低 HRV 并干扰深睡，今日宜降低训练强度。"))
        elif altitude_m >= ALTITUDE_MODERATE:
            factors.append(_factor("altitude", "中海拔", "moderate", ["hrv", "sleep"],
                f"当前海拔约 {altitude_m:.0f} m，低氧环境可能轻度影响 HRV 与睡眠，身体仍在适应中。"))

    # 高温高湿（叠加才显著）
    if temp_c is not None and temp_c >= HEAT_TEMP_C:
        if humidity_pct is not None and humidity_pct >= HUMIDITY_HIGH:
            factors.append(_factor("heat_humidity", "高温高湿", "high", ["sleep", "strain"],
                f"气温 {temp_c:.0f}°C、湿度 {humidity_pct:.0f}%，散热困难会增加训练负荷、扰乱夜间睡眠。"))
        else:
            factors.append(_factor("heat", "高温", "moderate", ["sleep", "strain"],
                f"气温 {temp_c:.0f}°C 偏高，注意补水与睡眠环境降温。"))
    elif temp_c is not None and temp_c <= COLD_TEMP_C:
        factors.append(_factor("cold", "低温", "info", ["sleep"],
            f"气温 {temp_c:.0f}°C 偏低，注意保暖以保证睡眠质量。"))

    # 空气质量
    if aqi is not None:
        if aqi > AQI_HIGH:
            factors.append(_factor("air_quality", "空气质量差", "high", ["strain"],
                f"空气质量指数 {aqi}（差），户外有氧会增加呼吸负荷，建议改为室内训练。"))
        elif aqi > AQI_MODERATE:
            factors.append(_factor("air_quality", "空气质量中等", "moderate", ["strain"],
                f"空气质量指数 {aqi}，敏感人群户外运动需留意。"))

    # 血氧（有则用，无则跳过；可能来自高海拔、疾病或睡眠呼吸问题）
    if spo2_pct is not None:
        if spo2_pct < SPO2_VERY_LOW:
            factors.append(_factor("low_spo2", "血氧偏低", "high", ["hrv", "sleep"],
                f"血氧 {spo2_pct:.0f}% 明显偏低，可能由高海拔、疾病或睡眠呼吸问题导致，建议关注并必要时复测。"))
        elif spo2_pct < SPO2_LOW:
            factors.append(_factor("low_spo2", "血氧略低", "moderate", ["sleep"],
                f"血氧 {spo2_pct:.0f}% 略低于 95%，结合海拔/睡眠综合判断。"))

    # 旅行 / 跨时区（定位自动判定）
    if location_changed or abs(timezone_shift_hours) >= 1:
        tz = f"跨 {abs(timezone_shift_hours)} 个时区，" if abs(timezone_shift_hours) >= 1 else ""
        factors.append(_factor("travel", "旅行/换床", "moderate", ["sleep", "hrv"],
            f"检测到位置变化（{tz}换床环境），昼夜节律与睡眠可能受扰，今日数据需结合此背景理解。"))

    factors.sort(key=lambda f: _SEVERITY_RANK[f["severity"]], reverse=True)

    if factors:
        labels = "、".join(f["label"] for f in factors)
        summary = f"今日环境因素：{labels}，可能共同影响恢复与睡眠，建议结合此背景解读指标。"
    else:
        summary = "环境条件平稳，无显著干扰因素。"

    return {
        "factors": factors,
        "auto_annotations": [f["label"] for f in factors],
        "summary": summary,
    }
