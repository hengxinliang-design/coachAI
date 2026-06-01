"""
test_recovery.py — 恢复评分引擎测试

覆盖 spec §2.2 / §2.3 的全部关键规则，并用三周实战中的真实数据点做回归校验：
  · 5/13 HRV 105ms、5/31 HRV 154ms → 异常值剔除
  · 5/25 HRV 69ms + RHR 59bpm   → 保守取「中等」
  · 6/1  HRV 32ms                → 较差
"""
from app import config
from app.engine.recovery import (
    _hrv_subscore,
    compute_recovery,
    is_hrv_outlier,
    rolling_hrv_baseline,
)


# ── HRV 异常值识别 ───────────────────────────────────────────────────────────
class TestOutlierDetection:
    def test_above_threshold_is_outlier(self):
        assert is_hrv_outlier(105.0) is True   # 5/13
        assert is_hrv_outlier(154.0) is True   # 5/31
        assert is_hrv_outlier(100.1) is True

    def test_at_or_below_threshold_not_outlier(self):
        assert is_hrv_outlier(100.0) is False
        assert is_hrv_outlier(66.0) is False
        assert is_hrv_outlier(32.0) is False

    def test_none_is_not_outlier(self):
        assert is_hrv_outlier(None) is False


# ── 7日滚动基线 ──────────────────────────────────────────────────────────────
class TestRollingBaseline:
    def test_excludes_outliers_from_baseline(self):
        # 含 5/13 的 105ms 异常值，应被剔除
        week = [62.0, 68.0, 105.0, 71.0, 65.0, 66.0, 60.0]
        valid = [62.0, 68.0, 71.0, 65.0, 66.0, 60.0]
        assert rolling_hrv_baseline(week) == sum(valid) / len(valid)

    def test_excludes_none_values(self):
        assert rolling_hrv_baseline([60.0, None, 66.0, None]) == 63.0

    def test_falls_back_to_personal_baseline_when_no_valid_data(self):
        assert rolling_hrv_baseline([]) == config.HRV_BASELINE
        assert rolling_hrv_baseline([None, 154.0]) == config.HRV_BASELINE

    def test_uses_only_last_7_days(self):
        # 第一个值 10.0 在窗口外，不应拉低基线
        data = [10.0] + [66.0] * 7
        assert rolling_hrv_baseline(data) == 66.0


# ── 评级决策矩阵 ─────────────────────────────────────────────────────────────
class TestGradingMatrix:
    def test_green_when_both_optimal(self):
        r = compute_recovery(hrv_ms=68.0, rhr_bpm=52, wrist_temp_dev=0.0)
        assert r.grade == "green"
        assert r.grade_label == "优秀"

    def test_red_when_hrv_low(self):
        # 6/1 真实数据：HRV 32ms
        r = compute_recovery(hrv_ms=32.0, rhr_bpm=58, wrist_temp_dev=0.2)
        assert r.grade == "red"
        assert r.grade_label == "较差"

    def test_yellow_when_mid_range(self):
        r = compute_recovery(hrv_ms=50.0, rhr_bpm=57, wrist_temp_dev=0.1)
        assert r.grade == "yellow"

    def test_conservative_when_hrv_green_but_rhr_yellow(self):
        # 5/25 旅行回归日：HRV 69ms(优秀) 但 RHR 59bpm(中等) → 取中等
        r = compute_recovery(hrv_ms=69.0, rhr_bpm=59, wrist_temp_dev=0.1)
        assert r.grade == "yellow"
        assert any("保守" in n for n in r.notes)

    def test_conservative_when_rhr_red_dominates(self):
        # HRV 中等但 RHR > 60 → 取较差
        r = compute_recovery(hrv_ms=50.0, rhr_bpm=63, wrist_temp_dev=0.1)
        assert r.grade == "red"


# ── 异常值时的降级评分路径 ───────────────────────────────────────────────────
class TestOutlierScoringPath:
    def test_531_outlier_excluded_and_graded_by_rhr(self):
        # 5/31：HRV 154ms 异常值，按 RHR 评级
        r = compute_recovery(
            hrv_ms=154.0, rhr_bpm=58, wrist_temp_dev=0.3,
            recent_hrv=[62.0, 65.0, 60.0, 66.0, 154.0],
        )
        assert r.hrv_is_outlier is True
        assert r.hrv_subscore is None
        assert r.grade == "yellow"          # RHR 58 → 中等
        assert any("异常阈值" in n for n in r.notes)
        # 154ms 不得污染基线
        assert r.hrv_baseline == round(sum([62.0, 65.0, 60.0, 66.0]) / 4, 1)

    def test_outlier_score_uses_renormalized_weights(self):
        # 无 HRV 时 RHR 权重应升到 0.70
        r = compute_recovery(hrv_ms=120.0, rhr_bpm=54, wrist_temp_dev=0.0)
        # RHR 满分、腕温满分 → 100*0.7 + 100*0.3 = 100
        assert r.score == 100

    def test_missing_hrv_prompts_recheck(self):
        r = compute_recovery(hrv_ms=None, rhr_bpm=53, wrist_temp_dev=0.0)
        assert r.hrv_subscore is None
        assert any("重查" in n for n in r.notes)


# ── 分项评分边界 ─────────────────────────────────────────────────────────────
class TestSubscores:
    def test_score_in_range(self):
        for hrv in [30.0, 50.0, 66.0, 90.0]:
            for rhr in [50, 55, 62]:
                r = compute_recovery(hrv_ms=hrv, rhr_bpm=rhr)
                assert 0 <= r.score <= 100

    def test_hrv_at_baseline_is_full_subscore(self):
        r = compute_recovery(hrv_ms=66.0, rhr_bpm=52, recent_hrv=[66.0] * 7)
        assert r.hrv_subscore == 100

    def test_temp_penalty_increases_with_deviation(self):
        low = compute_recovery(hrv_ms=66.0, rhr_bpm=52, wrist_temp_dev=0.2)
        high = compute_recovery(hrv_ms=66.0, rhr_bpm=52, wrist_temp_dev=0.5)
        assert high.score < low.score

    def test_hrv_subscore_zero_baseline_guard(self):
        # 防御性保护：基线为 0 时不应除零，返回 0
        assert _hrv_subscore(66.0, 0) == 0.0
