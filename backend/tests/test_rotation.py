"""test_rotation.py — 部位轮换追踪器测试（spec §4.2）"""
from app.engine.rotation import suggest_split


class TestSuggestSplit:
    def test_empty_history_starts_with_push(self):
        r = suggest_split([])
        assert r["suggested"] == "push"

    def test_suggests_never_trained_part_first(self):
        # 只练过 push/pull → 建议 legs
        assert suggest_split(["push", "pull"])["suggested"] == "legs"

    def test_rotates_to_least_recent(self):
        # 完整一轮后，最久未练的是最早那个
        r = suggest_split(["legs", "push", "pull"])
        assert r["suggested"] == "legs"

    def test_cardio_does_not_break_rotation(self):
        # 中间插入 cardio 不影响力量部位轮换判断
        r = suggest_split(["push", "cardio", "pull"])
        assert r["suggested"] == "legs"

    def test_consecutive_same_part_pushed_down(self):
        # 连续练 push，下一个不应再是 push
        r = suggest_split(["pull", "legs", "push"])
        assert r["suggested"] != "push"

    def test_reason_is_present(self):
        assert suggest_split(["push", "pull", "legs"])["reason"]

    def test_only_cardio_history_suggests_push(self):
        # 近期只有有氧，力量部位均未练 → 建议从 push 起轮
        r = suggest_split(["cardio", "cardio"])
        assert r["suggested"] == "push"
        assert "尚未训练" in r["reason"]
