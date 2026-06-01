"""test_cbum.py — CBum 训练引擎测试（spec §3 / §4.2）"""
from app.engine.cbum import generate_plan


class TestStrengthScaling:
    def test_green_has_drop_sets_and_more_volume(self):
        plan = generate_plan("green", "push", "full")
        assert plan["split"] == "push"
        # 🟢：3 复合 + 4 孤立 = 7 个动作
        assert len(plan["exercises"]) == 7
        assert any(e["has_drop_set"] for e in plan["exercises"])
        assert plan["intensity_notes"]            # 优秀日有递减组提示
        assert "70-80" in plan["duration"]

    def test_yellow_no_intensity_techniques(self):
        plan = generate_plan("yellow", "push", "full")
        # 🟡：2 复合 + 3 孤立 = 5 个动作
        assert len(plan["exercises"]) == 5
        assert all(not e["has_drop_set"] for e in plan["exercises"])
        assert plan["intensity_notes"] == []
        assert "75-80%" in plan["coach_note"]

    def test_red_is_active_recovery_only(self):
        plan = generate_plan("red", "push", "full")
        assert plan["split"] == "cardio"
        assert "Z1" in plan["zone_target"]
        assert len(plan["exercises"]) == 1
        assert plan["intensity_notes"] == []


class TestEquipmentFilter:
    def test_outdoor_red_returns_walkable_cardio(self):
        plan = generate_plan("red", "push", "outdoor")
        assert plan["exercises"][0]["name"] == "慢走恢复"

    def test_home_filters_to_home_equipment(self):
        plan = generate_plan("green", "push", "home")
        for e in plan["exercises"]:
            assert "home" in e["equipment"]


class TestSplits:
    def test_auto_defaults_to_push(self):
        assert generate_plan("green", "auto", "full")["split"] == "push"

    def test_each_split_has_valid_structure(self):
        for split in ["push", "pull", "legs"]:
            plan = generate_plan("green", split, "full")
            assert plan["warmup"] and plan["cooldown"]
            assert all("reps_display" in e and "sets_display" in e for e in plan["exercises"])
