"""
test_annotations.py — 观察指标前后对比测试（spec §5 泛化）

含镁甘氨酸真实数据回归（5/20 开始服用）：
  · 最长觉醒：服用前 ~54min → 服用后 2-7min（越低越好 → 改善）
  · 次晨 HRV：服用前 ~40ms → 服用后 57-73ms（越高越好 → 改善）
"""
from datetime import date

from app.engine.annotations import compare_before_after


def _pt(d, v):
    return {"date": date(2026, 5, d), "value": v}


class TestMagnesiumRegression:
    def test_max_awake_lower_is_better_improves(self):
        series = [
            _pt(16, 54), _pt(17, 48), _pt(18, 60), _pt(19, 52),   # 服用前
            _pt(21, 5), _pt(22, 3), _pt(23, 7), _pt(24, 2), _pt(25, 4),  # 服用后
            _pt(26, 3), _pt(27, 6), _pt(28, 2),
        ]
        r = compare_before_after(series, date(2026, 5, 20), "max_awake_min", label="镁甘氨酸")
        assert r["before"]["mean"] > 50
        assert r["after"]["mean"] < 10
        assert r["direction"] == "improved"        # 越低越好

    def test_hrv_higher_is_better_improves(self):
        series = [
            _pt(16, 40), _pt(17, 38), _pt(18, 42), _pt(19, 41),   # 服用前 ~40
            _pt(21, 57), _pt(22, 65), _pt(23, 73), _pt(24, 60),   # 服用后 57-73
            _pt(25, 66), _pt(26, 62), _pt(27, 68), _pt(28, 64),
        ]
        r = compare_before_after(series, date(2026, 5, 20), "hrv_ms", label="镁甘氨酸")
        assert r["direction"] == "improved"
        assert r["delta"] > 0


class TestDirectionLogic:
    def test_rhr_increase_is_worsening(self):
        series = [_pt(16, 52), _pt(17, 53), _pt(21, 58), _pt(22, 59)]
        r = compare_before_after(series, date(2026, 5, 20), "rhr_bpm", label="项目压力")
        assert r["direction"] == "worsened"        # RHR 升高 = 退步

    def test_explicit_higher_is_better_override(self):
        series = [_pt(16, 10), _pt(21, 20)]
        r = compare_before_after(series, date(2026, 5, 20), "custom_metric",
                                 higher_is_better=True)
        assert r["direction"] == "improved"

    def test_unknown_metric_no_direction(self):
        series = [_pt(16, 10), _pt(21, 20)]
        r = compare_before_after(series, date(2026, 5, 20), "unknown_xyz")
        assert r["direction"] == "changed"         # 无方向信息


class TestEdgeCases:
    def test_no_before_data(self):
        series = [_pt(21, 5), _pt(22, 6)]
        r = compare_before_after(series, date(2026, 5, 20), "max_awake_min")
        assert r["direction"] == "insufficient_data"

    def test_short_after_window_warns(self):
        # 服用后样本 < 7 天 → 提示需积累
        series = [_pt(16, 54), _pt(17, 50), _pt(21, 5), _pt(22, 4)]
        r = compare_before_after(series, date(2026, 5, 20), "max_awake_min", label="镁甘氨酸")
        assert "排除自然恢复期" in r["note"]

    def test_ignores_null_values(self):
        series = [_pt(16, 54), _pt(17, None), _pt(21, 5), _pt(22, None)]
        r = compare_before_after(series, date(2026, 5, 20), "max_awake_min")
        assert r["before"]["n"] == 1
        assert r["after"]["n"] == 1
