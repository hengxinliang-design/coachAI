"""
test_sleep_analysis.py — 睡眠恢复报告测试（spec §4.4 / Module D）

含个人睡眠模式回归：凌晨 2–3 点长觉醒（皮质醇过早分泌）、
以及镁甘氨酸 + 多观察指标叠加对睡眠的影响呈现。
"""
from datetime import date

from app.engine.sleep_analysis import (
    build_sleep_report,
    continuity_index,
    detect_cortisol_awakening,
    fragmentation,
    training_sleep_link,
)


class TestStageQuality:
    def test_deep_and_rem_meet_target(self):
        r = build_sleep_report({"total_min": 450, "deep_min": 95, "rem_min": 92,
                                "awake_count": 1, "max_awake_min": 5})
        assert r["deep_sleep"]["target_met"] is True
        assert r["rem"]["target_met"] is True

    def test_deep_insufficient(self):
        r = build_sleep_report({"total_min": 400, "deep_min": 40, "rem_min": 90,
                                "awake_count": 2, "max_awake_min": 8})
        assert r["deep_sleep"]["grade"] == "poor"


class TestContinuity:
    def test_excellent(self):
        r = continuity_index(awake_count=2, max_awake_min=8)
        assert r["label"] == "优秀"

    def test_poor_when_many_awakenings(self):
        r = continuity_index(awake_count=6, max_awake_min=31)
        assert r["label"] == "较差"


class TestFragmentation:
    def test_abnormal_above_15pct(self):
        r = fragmentation(total_awake_min=80, total_sleep_min=400)  # 20%
        assert r["abnormal"] is True

    def test_normal(self):
        r = fragmentation(total_awake_min=20, total_sleep_min=420)  # ~4.8%
        assert r["abnormal"] is False

    def test_none_when_no_data(self):
        assert fragmentation(None, 400) is None


class TestCortisolAwakening:
    def test_detects_2_3am_long_awakening(self):
        # 个人模式：凌晨 3 点 62 分钟长觉醒
        r = detect_cortisol_awakening([{"hour": 3, "duration_min": 62}])
        assert r["cortisol_flag"] is True
        assert r["longest_min"] == 62
        assert "皮质醇" in r["note"]

    def test_short_awakening_not_flagged(self):
        # 镁甘氨酸干预后：凌晨觉醒降到 2 分钟
        r = detect_cortisol_awakening([{"hour": 3, "duration_min": 2}])
        assert r["cortisol_flag"] is False

    def test_awakening_outside_window_not_flagged(self):
        r = detect_cortisol_awakening([{"hour": 6, "duration_min": 30}])
        assert r["cortisol_flag"] is False


class TestTrainingLink:
    def test_high_load_note(self):
        r = training_sleep_link("high")
        assert "高负荷" in r["note"]

    def test_none_when_no_data(self):
        assert training_sleep_link(None) is None


class TestAnnotationOverlay:
    def test_single_annotation_with_impact(self):
        # 镁甘氨酸：最长觉醒 54 → 4（改善）
        series = [
            {"date": date(2026, 5, 16), "value": 54}, {"date": date(2026, 5, 18), "value": 52},
            {"date": date(2026, 5, 21), "value": 5}, {"date": date(2026, 5, 23), "value": 3},
            {"date": date(2026, 5, 25), "value": 4}, {"date": date(2026, 5, 27), "value": 6},
            {"date": date(2026, 5, 28), "value": 2},
        ]
        r = build_sleep_report(
            {"total_min": 450, "deep_min": 95, "rem_min": 90, "awake_count": 2, "max_awake_min": 4},
            annotations=[{"label": "镁甘氨酸", "category": "supplement"}],
            metric_comparisons=[{
                "label": "镁甘氨酸", "metric": "max_awake_min",
                "boundary_date": date(2026, 5, 20), "series": series,
            }],
        )
        assert r["annotations"]["active"] == ["镁甘氨酸"]
        assert r["annotations"]["impacts"][0]["direction"] == "improved"

    def test_multiple_annotations_warns_confounding(self):
        r = build_sleep_report(
            {"total_min": 420, "deep_min": 70, "rem_min": 80, "awake_count": 3, "max_awake_min": 15},
            annotations=[
                {"label": "镁甘氨酸", "category": "supplement"},
                {"label": "旅行", "category": "environment"},
                {"label": "项目压力高", "category": "lifestyle"},
            ],
        )
        assert len(r["annotations"]["active"]) == 3
        assert "无法单独归因" in r["annotations"]["note"]

    def test_no_annotations_empty_note(self):
        r = build_sleep_report({"total_min": 450, "deep_min": 95, "rem_min": 90,
                                "awake_count": 1, "max_awake_min": 5})
        assert r["annotations"]["active"] == []
        assert r["annotations"]["note"] == ""


class TestFullReportFragmentationFromEvents:
    def test_fragmentation_computed_from_awake_events(self):
        r = build_sleep_report({
            "total_min": 400, "deep_min": 90, "rem_min": 90,
            "awake_count": 3, "max_awake_min": 62,
            "awake_events": [{"hour": 3, "duration_min": 62}, {"hour": 5, "duration_min": 10}],
        })
        # 总觉醒 72 / 400 = 18% → 异常
        assert r["fragmentation"]["abnormal"] is True
        assert r["awakening_pattern"]["cortisol_flag"] is True
