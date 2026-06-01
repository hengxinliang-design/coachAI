"""test_hr_zones.py — 心率分区分类器测试（spec §2.1）"""
from app.engine.hr_zones import classify_zone, zone_distribution


class TestClassifyZone:
    def test_zone_boundaries(self):
        assert classify_zone(120)["zone"] == 1   # Z1 < 127
        assert classify_zone(127)["zone"] == 1
        assert classify_zone(128)["zone"] == 2   # Z2 128–140
        assert classify_zone(140)["zone"] == 2
        assert classify_zone(141)["zone"] == 3   # Z3 141–152
        assert classify_zone(152)["zone"] == 3
        assert classify_zone(153)["zone"] == 4   # Z4 153–164
        assert classify_zone(164)["zone"] == 4
        assert classify_zone(165)["zone"] == 5   # Z5 165+

    def test_above_hr_max_still_z5(self):
        # spec §8：跑步实测 > 最大心率标准属正常，归 Z5 而非报错
        assert classify_zone(185)["zone"] == 5


class TestZoneDistribution:
    def test_distribution_sums_to_100(self):
        dist = zone_distribution([110, 130, 145, 155, 170, 135])
        assert abs(sum(dist.values()) - 100.0) < 0.5

    def test_empty_samples_all_zero(self):
        assert zone_distribution([]) == {
            "z1_pct": 0.0, "z2_pct": 0.0, "z3_pct": 0.0, "z4_pct": 0.0, "z5_pct": 0.0,
        }

    def test_all_in_one_zone(self):
        dist = zone_distribution([130, 132, 138, 140])
        assert dist["z2_pct"] == 100.0
