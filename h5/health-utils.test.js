import { describe, expect, it } from "vitest";
import {
  averageHrvWeek,
  calcDietScore,
  calcMacroRatios,
  calcWeeklyOverall,
  classifyHrvColor,
  getLevel,
  getNutritionTargets,
  normalizeHrvWeek,
  parseHealthJSON,
  sumMealTotals,
  toFiniteNumber,
  validHrvWeek,
} from "./health-utils.js";

// ─── toFiniteNumber ──────────────────────────────────────────────────────────
describe("toFiniteNumber", () => {
  it("converts valid numeric strings", () => {
    expect(toFiniteNumber("3.14")).toBe(3.14);
    expect(toFiniteNumber("0")).toBe(0);
  });
  it("returns fallback for non-numeric values", () => {
    expect(toFiniteNumber("abc")).toBe(0);
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber("")).toBe(0);
    expect(toFiniteNumber(NaN)).toBe(0);
  });
  it("respects a custom fallback", () => {
    expect(toFiniteNumber(null, 99)).toBe(99);
    expect(toFiniteNumber("bad", -1)).toBe(-1);
  });
});

// ─── parseHealthJSON ─────────────────────────────────────────────────────────
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

  it("accepts legacy field names (hrv / rhr / sleep)", () => {
    const parsed = parseHealthJSON(
      '{"hrv":60,"rhr":54,"sleep":8,"hrv_week":[],"workout":{}}',
      fixedNow,
    );
    expect(parsed).not.toBeNull();
    expect(parsed.hrv).toBe(60);
    expect(parsed.rhr).toBe(54);
  });

  it("falls back to defaults for missing optional fields", () => {
    const parsed = parseHealthJSON('{"hrv_today":55}', fixedNow);
    expect(parsed.deep_pct).toBe(18);
    expect(parsed.rem_pct).toBe(22);
    expect(parsed.workout.type).toBe("未记录");
  });

  it("rejects malformed payloads and missing / zero HRV", () => {
    expect(parseHealthJSON("not json", fixedNow)).toBeNull();
    expect(parseHealthJSON('{"rhr_today":55}', fixedNow)).toBeNull();
    expect(parseHealthJSON('{"hrv_today":"abc"}', fixedNow)).toBeNull();
    expect(parseHealthJSON('{"hrv_today":0}', fixedNow)).toBeNull();
  });

  it("truncates awake count to integer", () => {
    const parsed = parseHealthJSON('{"hrv_today":60,"sleep_awake_count":"2.9"}', fixedNow);
    expect(parsed.awake).toBe(2);
  });
});

// ─── HRV week helpers ────────────────────────────────────────────────────────
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

  it("returns 0 for an all-null or empty week", () => {
    expect(averageHrvWeek([{ day: "A", val: null }])).toBe(0);
    expect(averageHrvWeek([])).toBe(0);
  });

  it("handles non-array input gracefully", () => {
    expect(normalizeHrvWeek(null)).toEqual([]);
    expect(validHrvWeek(null)).toEqual([]);
  });
});

// ─── getLevel ────────────────────────────────────────────────────────────────
describe("getLevel", () => {
  it("classifies green, yellow, and red by primary metrics", () => {
    expect(getLevel({ hrv: 60, rhr: 55, sleep: 8,   awake: 0 })).toBe("green");
    expect(getLevel({ hrv: 52, rhr: 55, sleep: 8,   awake: 0 })).toBe("yellow");
    expect(getLevel({ hrv: 47, rhr: 55, sleep: 8,   awake: 0 })).toBe("red");
  });

  it("escalates to red when three yellow flags accumulate", () => {
    // hrv yellow + rhr yellow + sleep yellow → 3 yellows → red
    expect(getLevel({ hrv: 52, rhr: 57, sleep: 7,   awake: 0 })).toBe("red");
  });

  it("treats awake >= 4 as an additional yellow flag", () => {
    // hrv yellow + awake yellow → 2 yellows → still yellow (not red)
    expect(getLevel({ hrv: 52, rhr: 55, sleep: 8,   awake: 4 })).toBe("yellow");
    // hrv yellow + rhr yellow + awake yellow → 3 yellows → red
    expect(getLevel({ hrv: 52, rhr: 57, sleep: 8,   awake: 4 })).toBe("red");
  });

  it("red HRV alone triggers red regardless of other metrics", () => {
    expect(getLevel({ hrv: 47, rhr: 55, sleep: 8,   awake: 0 })).toBe("red");
  });

  it("high RHR alone is yellow, not red", () => {
    expect(getLevel({ hrv: 60, rhr: 57, sleep: 8,   awake: 0 })).toBe("yellow");
  });

  it("very high RHR alone triggers red", () => {
    expect(getLevel({ hrv: 60, rhr: 60, sleep: 8,   awake: 0 })).toBe("red");
  });
});

// ─── nutrition helpers ───────────────────────────────────────────────────────
describe("sumMealTotals", () => {
  it("sums partial meal totals defensively", () => {
    expect(
      sumMealTotals([
        { totals: { calories: 500, protein: 35, carbs: 40, fat: 12 } },
        { totals: { calories: "250", protein: "20" } },
        {},
      ]),
    ).toEqual({ calories: 750, protein: 55, carbs: 40, fat: 12 });
  });

  it("returns zeros for an empty log", () => {
    expect(sumMealTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("returns zeros when called with no argument", () => {
    expect(sumMealTotals()).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe("getNutritionTargets", () => {
  it("adjusts protein targets by recovery level", () => {
    expect(getNutritionTargets("green").protein).toBe(140);
    expect(getNutritionTargets("yellow").protein).toBe(130);
    expect(getNutritionTargets("red").protein).toBe(120);
  });

  it("keeps calories, carbs and fat constant across levels", () => {
    for (const lv of ["green", "yellow", "red"]) {
      const t = getNutritionTargets(lv);
      expect(t.calories).toBe(2000);
      expect(t.carbs).toBe(200);
      expect(t.fat).toBe(60);
    }
  });
});

// ─── classifyHrvColor ────────────────────────────────────────────────────────
describe("classifyHrvColor", () => {
  // VI palette: Recovery Aqua / Warm Coral / Warm Alert Red / Midnight Fog
  it("maps green / yellow / red by threshold (VI colours)", () => {
    expect(classifyHrvColor(55)).toBe("#59C3C3");   // Recovery Aqua
    expect(classifyHrvColor(70)).toBe("#59C3C3");
    expect(classifyHrvColor(54.9)).toBe("#F27D72"); // Warm Coral
    expect(classifyHrvColor(48)).toBe("#F27D72");
    expect(classifyHrvColor(47.9)).toBe("#E85D52"); // Warm Alert Red
    expect(classifyHrvColor(0)).toBe("#E85D52");
  });

  it("returns Midnight Fog for null / NaN / undefined", () => {
    expect(classifyHrvColor(null)).toBe("#39424F");
    expect(classifyHrvColor(NaN)).toBe("#39424F");
    expect(classifyHrvColor(undefined)).toBe("#39424F");
  });
});

// ─── calcMacroRatios ─────────────────────────────────────────────────────────
describe("calcMacroRatios", () => {
  it("percentages always sum to 100", () => {
    const { pPct, cPct, fPct } = calcMacroRatios({ protein: 50, carbs: 100, fat: 30 });
    expect(pPct + cPct + fPct).toBe(100);
  });

  it("computes correct values for typical macros", () => {
    // protein=50 → 200 kcal, carbs=100 → 400 kcal, fat=30 → 270 kcal; total=870
    const { pPct, cPct, fPct } = calcMacroRatios({ protein: 50, carbs: 100, fat: 30 });
    expect(pPct).toBe(Math.round(200 / 870 * 100));  // 23
    expect(cPct).toBe(Math.round(400 / 870 * 100));  // 46
    expect(fPct).toBe(100 - pPct - cPct);
  });

  it("handles all-zero input without dividing by zero", () => {
    const { pPct, cPct, fPct } = calcMacroRatios({ protein: 0, carbs: 0, fat: 0 });
    expect(pPct + cPct + fPct).toBe(100);
  });
});

// ─── calcDietScore ───────────────────────────────────────────────────────────
describe("calcDietScore", () => {
  const targets = { calories: 2000, protein: 130, carbs: 200, fat: 60 };

  it("scores 4 and labels 均衡 when all targets are met", () => {
    const r = calcDietScore(
      { calories: 1900, protein: 100, carbs: 180, fat: 55 },
      targets,
    );
    expect(r.score).toBe(4);
    expect(r.label).toBe("均衡");
    expect(r.color).toBe("#59C3C3"); // Recovery Aqua
    expect(r.proOk).toBe(true);
    expect(r.carbOk).toBe(true);
    expect(r.fatOk).toBe(true);
    expect(r.calOk).toBe(true);
  });

  it("scores 2 and labels 基本合理 for a middling diet", () => {
    // carbOk + fatOk pass; protein too low, calories over cap
    const r = calcDietScore(
      { calories: 2300, protein: 50, carbs: 180, fat: 55 },
      targets,
    );
    expect(r.score).toBe(2);
    expect(r.label).toBe("基本合理");
  });

  it("scores 0 and labels 需调整 when nothing is on target", () => {
    // protein too low, carbs over, fat over, calories too low
    const r = calcDietScore(
      { calories: 800, protein: 40, carbs: 250, fat: 80 },
      targets,
    );
    expect(r.score).toBe(0);
    expect(r.label).toBe("需调整");
    expect(r.color).toBe("#E85D52"); // Warm Alert Red
  });

  it("proOk triggers exactly at 70% of target", () => {
    // 70% of 130 = 91
    expect(
      calcDietScore({ calories: 1200, protein: 91, carbs: 180, fat: 55 }, targets).proOk,
    ).toBe(true);
    expect(
      calcDietScore({ calories: 1200, protein: 90, carbs: 180, fat: 55 }, targets).proOk,
    ).toBe(false);
  });

  it("calOk is false below 50% of calorie target", () => {
    const r = calcDietScore({ calories: 999, protein: 100, carbs: 180, fat: 55 }, targets);
    expect(r.calOk).toBe(false);
  });

  it("calOk is false above 110% of calorie target", () => {
    const r = calcDietScore({ calories: 2201, protein: 100, carbs: 180, fat: 55 }, targets);
    expect(r.calOk).toBe(false);
  });
});

// ─── calcWeeklyOverall ───────────────────────────────────────────────────────
describe("calcWeeklyOverall", () => {
  const make = (vals) => vals.map((val, i) => ({ day: `5/${i + 4}`, val }));

  it("returns 良好 when 4 or more green days", () => {
    const { score, color, greenDays } = calcWeeklyOverall(make([55, 60, 56, 58, 52, 47, 50]));
    expect(greenDays).toBe(4);
    expect(score).toBe("良好");
    expect(color).toBe("#59C3C3"); // Recovery Aqua
  });

  it("returns 中等 when 2–3 green days", () => {
    const { score } = calcWeeklyOverall(make([55, 60, 47, 48, 52, 47, 48]));
    expect(score).toBe("中等");
  });

  it("returns 需关注 when fewer than 2 green days", () => {
    const { score, color } = calcWeeklyOverall(make([47, 48, 50, 52, 53, 52, 47]));
    expect(score).toBe("需关注");
    expect(color).toBe("#E85D52"); // Warm Alert Red
  });

  it("counts red, yellow and green days correctly", () => {
    // 45→red, 47→red, 55→green, 60→green, 50→yellow, 48→yellow, 42→red
    const { greenDays, yellowDays, redDays } = calcWeeklyOverall(
      make([45, 47, 55, 60, 50, 48, 42]),
    );
    expect(greenDays).toBe(2);
    expect(yellowDays).toBe(2);
    expect(redDays).toBe(3);
  });

  it("handles an all-green week", () => {
    const { score, greenDays, redDays } = calcWeeklyOverall(make([55, 56, 57, 58, 59, 60, 61]));
    expect(score).toBe("良好");
    expect(greenDays).toBe(7);
    expect(redDays).toBe(0);
  });
});
