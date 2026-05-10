import { describe, expect, it } from "vitest";
import {
  averageHrvWeek,
  getLevel,
  getNutritionTargets,
  normalizeHrvWeek,
  parseHealthJSON,
  sumMealTotals,
  validHrvWeek,
} from "./health-utils.js";

describe("parseHealthJSON", () => {
  const fixedNow = new Date("2026-05-10T09:08:00");

  it("extracts health JSON embedded in surrounding text", () => {
    const parsed = parseHealthJSON(
      `ok {"hrv_today":"58.4","rhr_today":"55","sleep_hours":"7.8","sleep_awake_count":"1","deep_sleep_pct":"21","rem_sleep_pct":"24","hrv_week":[{"day":"5/9","val":"54.2"},{"day":"5/10","val":null}],"workout_today":{"type":"跑步","duration_min":"35","calories":"320"}} done`,
      fixedNow,
    );

    expect(parsed).toMatchObject({
      hrv: 58.4,
      rhr: 55,
      sleep: 7.8,
      awake: 1,
      deep_pct: 21,
      rem_pct: 24,
      workout: { type: "跑步", duration: 35, calories: 320 },
      sync_time: "09:08",
      sync_date: "5月10日",
      is_stale: false,
    });
    expect(parsed.hrv_week).toEqual([
      { day: "5/9", val: 54.2 },
      { day: "5/10", val: null },
    ]);
  });

  it("rejects malformed payloads and missing HRV", () => {
    expect(parseHealthJSON("not json", fixedNow)).toBeNull();
    expect(parseHealthJSON('{"rhr_today":55}', fixedNow)).toBeNull();
    expect(parseHealthJSON('{"hrv_today":"abc"}', fixedNow)).toBeNull();
  });
});

describe("HRV week helpers", () => {
  it("keeps placeholders as null and excludes invalid values from averages", () => {
    const week = normalizeHrvWeek([
      { day: "A", val: "50" },
      { day: "B", val: null },
      { day: "C", val: "bad" },
      { day: "D", val: 70 },
    ]);

    expect(week).toEqual([
      { day: "A", val: 50 },
      { day: "B", val: null },
      { day: "C", val: null },
      { day: "D", val: 70 },
    ]);
    expect(validHrvWeek(week)).toEqual([
      { day: "A", val: 50 },
      { day: "D", val: 70 },
    ]);
    expect(averageHrvWeek(week)).toBe(60);
  });
});

describe("getLevel", () => {
  it("classifies green, yellow, and red recovery states", () => {
    expect(getLevel({ hrv: 60, rhr: 55, sleep: 8, awake: 0 })).toBe("green");
    expect(getLevel({ hrv: 52, rhr: 55, sleep: 8, awake: 0 })).toBe("yellow");
    expect(getLevel({ hrv: 47, rhr: 55, sleep: 8, awake: 0 })).toBe("red");
  });

  it("escalates to red when three yellow flags accumulate", () => {
    expect(getLevel({ hrv: 52, rhr: 57, sleep: 7, awake: 0 })).toBe("red");
  });
});

describe("nutrition helpers", () => {
  it("sums partial meal totals defensively", () => {
    expect(
      sumMealTotals([
        { totals: { calories: 500, protein: 35, carbs: 40, fat: 12 } },
        { totals: { calories: "250", protein: "20" } },
        {},
      ]),
    ).toEqual({ calories: 750, protein: 55, carbs: 40, fat: 12 });
  });

  it("adjusts protein targets by recovery level", () => {
    expect(getNutritionTargets("green").protein).toBe(140);
    expect(getNutritionTargets("yellow").protein).toBe(130);
    expect(getNutritionTargets("red").protein).toBe(120);
  });
});
