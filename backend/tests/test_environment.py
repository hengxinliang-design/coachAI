"""
test_environment.py — 环境上下文引擎测试（方向 B）

验证各环境因子的识别、严重度分级、解释文案，以及无因子时的"平稳"输出。
"""
from app.engine.environment import analyze_environment


class TestBarometric:
    def test_high_pressure_drop(self):
        r = analyze_environment(pressure_hpa=1003, pressure_hpa_prev=1015)  # 降 12
        f = r["factors"][0]
        assert f["factor"] == "barometric_drop" and f["severity"] == "high"
        assert "hrv" in f["affects"]

    def test_moderate_pressure_drop(self):
        r = analyze_environment(pressure_hpa=1009, pressure_hpa_prev=1016)  # 降 7
        assert r["factors"][0]["severity"] == "moderate"

    def test_no_drop_no_factor(self):
        r = analyze_environment(pressure_hpa=1015, pressure_hpa_prev=1014)
        assert r["factors"] == []


class TestAltitude:
    def test_high_altitude(self):
        r = analyze_environment(altitude_m=2600)
        f = next(x for x in r["factors"] if x["factor"] == "altitude")
        assert f["severity"] == "high"
        assert set(["hrv", "rhr", "sleep"]).issubset(set(f["affects"]))

    def test_moderate_altitude(self):
        r = analyze_environment(altitude_m=1800)
        assert next(x for x in r["factors"] if x["factor"] == "altitude")["severity"] == "moderate"

    def test_sea_level_no_factor(self):
        assert analyze_environment(altitude_m=200)["factors"] == []


class TestWeather:
    def test_heat_and_humidity(self):
        r = analyze_environment(temp_c=31, humidity_pct=80)
        assert r["factors"][0]["factor"] == "heat_humidity"

    def test_heat_only(self):
        r = analyze_environment(temp_c=30, humidity_pct=40)
        assert r["factors"][0]["factor"] == "heat"

    def test_cold(self):
        r = analyze_environment(temp_c=2)
        assert r["factors"][0]["factor"] == "cold"


class TestAirQuality:
    def test_bad_aqi(self):
        assert analyze_environment(aqi=170)["factors"][0]["severity"] == "high"

    def test_moderate_aqi(self):
        assert analyze_environment(aqi=120)["factors"][0]["severity"] == "moderate"


class TestSpO2:
    def test_very_low_spo2(self):
        r = analyze_environment(spo2_pct=88)
        assert r["factors"][0]["factor"] == "low_spo2" and r["factors"][0]["severity"] == "high"

    def test_slightly_low_spo2(self):
        assert analyze_environment(spo2_pct=94)["factors"][0]["severity"] == "moderate"

    def test_normal_spo2_no_factor(self):
        assert analyze_environment(spo2_pct=98)["factors"] == []


class TestTravel:
    def test_location_changed(self):
        r = analyze_environment(location_changed=True)
        assert r["factors"][0]["factor"] == "travel"

    def test_timezone_shift(self):
        r = analyze_environment(timezone_shift_hours=3)
        assert any(f["factor"] == "travel" for f in r["factors"])


class TestAggregate:
    def test_no_signals_is_stable(self):
        r = analyze_environment()
        assert r["factors"] == []
        assert "平稳" in r["summary"]

    def test_stacked_factors_sorted_by_severity(self):
        # 高海拔(high) + 中等气压降(moderate) → high 排前
        r = analyze_environment(altitude_m=2700, pressure_hpa=1009, pressure_hpa_prev=1016)
        assert r["factors"][0]["severity"] == "high"
        assert len(r["factors"]) == 2
        assert set(r["auto_annotations"]) == {"高海拔低氧", "气压下降"}
        assert "建议结合此背景解读" in r["summary"]
