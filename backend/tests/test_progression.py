"""test_progression.py — 双重渐进超负荷追踪测试（spec §3.1②）"""
from app.engine.progression import check_progression


class TestProgression:
    def test_all_sets_hit_top_triggers_progression(self):
        r = check_progression([10, 10, 10], target_rep_high=10, current_weight_kg=40.0)
        assert r["progress"] is True
        assert r["next_weight_kg"] == 42.5   # compound +2.5kg

    def test_isolation_uses_smaller_increment(self):
        r = check_progression([15, 15, 15], target_rep_high=15,
                              movement_type="isolation", current_weight_kg=12.0)
        assert r["progress"] is True
        assert r["next_weight_kg"] == 13.25  # isolation +1.25kg

    def test_one_set_short_holds_weight(self):
        r = check_progression([10, 10, 8], target_rep_high=10, current_weight_kg=40.0)
        assert r["progress"] is False
        assert r["next_weight_kg"] == 40.0
        assert "最低 8 次" in r["suggestion"]

    def test_exceeding_top_also_progresses(self):
        r = check_progression([12, 11, 10], target_rep_high=10, current_weight_kg=40.0)
        assert r["progress"] is True

    def test_no_weight_given_still_advises(self):
        r = check_progression([10, 10], target_rep_high=10)
        assert r["progress"] is True
        assert r["next_weight_kg"] is None

    def test_empty_reps_holds(self):
        r = check_progression([], target_rep_high=10, current_weight_kg=40.0)
        assert r["progress"] is False
