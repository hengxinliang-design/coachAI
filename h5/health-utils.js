export const DEFAULT_DATA = {
  hrv: 54.2,
  rhr: 56,
  sleep: 7.17,
  awake: 0,
  deep_pct: 18,
  rem_pct: 22,
  hrv_week: [
    { day: "5/4", val: 52.0 },
    { day: "5/5", val: 53.8 },
    { day: "5/6", val: 47.5 },
    { day: "5/7", val: 69.4 },
    { day: "5/8", val: 54.2 },
    { day: "5/9", val: 54.2 },
    { day: "5/10", val: null },
  ],
  workout: { type: "力量训练", duration: 74, calories: 515 },
  sync_time: "19:41",
  sync_date: "5月9日",
  is_stale: true,
};

export function toFiniteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeWorkout(workout) {
  return {
    type: workout?.type || "未记录",
    duration: toFiniteNumber(workout?.duration_min ?? workout?.duration, 0),
    calories: toFiniteNumber(workout?.calories, 0),
  };
}

export function normalizeHrvWeek(week) {
  return Array.isArray(week)
    ? week.map((x) => ({ day: x?.day || "", val: parseOptionalNumber(x?.val) }))
    : [];
}

export function validHrvWeek(week) {
  return (Array.isArray(week) ? week : []).filter((x) => Number.isFinite(x?.val));
}

export function averageHrvWeek(week) {
  const valid = validHrvWeek(week);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, x) => sum + x.val, 0) / valid.length;
}

export function parseHealthJSON(raw, now = new Date()) {
  try {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const j = JSON.parse(match[0]);
    const hrv = toFiniteNumber(j.hrv_today ?? j.hrv, 0);
    if (hrv <= 0) return null;

    const month = now.getMonth() + 1;
    const day = now.getDate();
    return {
      hrv,
      rhr: toFiniteNumber(j.rhr_today ?? j.rhr, 0),
      sleep: toFiniteNumber(j.sleep_hours ?? j.sleep, 0),
      awake: Math.trunc(toFiniteNumber(j.sleep_awake_count ?? j.awake, 0)),
      deep_pct: toFiniteNumber(j.deep_sleep_pct ?? j.deep_pct, 18),
      rem_pct: toFiniteNumber(j.rem_sleep_pct ?? j.rem_pct, 22),
      hrv_week: normalizeHrvWeek(j.hrv_week),
      workout: normalizeWorkout(j.workout_today ?? j.workout),
      sync_time:
        j.sync_time ??
        `${now.getHours().toString().padStart(2, "0")}:${now
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
      sync_date: `${month}月${day}日`,
      is_stale: false,
    };
  } catch {
    return null;
  }
}

export function getLevel(d) {
  let yellow = 0;
  let red = 0;
  if (d.hrv < 48) red += 1;
  else if (d.hrv < 55) yellow += 1;

  if (d.rhr > 59) red += 1;
  else if (d.rhr > 56) yellow += 1;

  if (d.sleep < 6.5) red += 1;
  else if (d.sleep < 7.5) yellow += 1;

  if (d.awake >= 4) yellow += 1;
  if (red >= 1 || yellow >= 3) return "red";
  if (yellow >= 1) return "yellow";
  return "green";
}

export function sumMealTotals(mealLog = []) {
  return mealLog.reduce(
    (acc, meal) => ({
      calories: acc.calories + toFiniteNumber(meal?.totals?.calories, 0),
      protein: acc.protein + toFiniteNumber(meal?.totals?.protein, 0),
      carbs: acc.carbs + toFiniteNumber(meal?.totals?.carbs, 0),
      fat: acc.fat + toFiniteNumber(meal?.totals?.fat, 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function getNutritionTargets(level) {
  return {
    calories: 2000,
    protein: level === "red" ? 120 : level === "yellow" ? 130 : 140,
    carbs: 200,
    fat: 60,
  };
}

/**
 * Classify a single HRV value into its VI chart colour.
 * VI palette: Recovery Aqua / Warm Coral / Warm Alert Red / Midnight Fog (no data)
 * null / non-finite → Midnight Fog (#39424F)
 */
export function classifyHrvColor(val) {
  if (!Number.isFinite(val)) return "#39424F"; // Midnight Fog — no data
  if (val >= 55) return "#59C3C3";             // Recovery Aqua — green
  if (val >= 48) return "#F27D72";             // Warm Coral — yellow
  return "#E85D52";                            // Warm Alert Red
}

/**
 * Compute macronutrient calorie percentages.
 * pPct + cPct + fPct always equals exactly 100.
 */
export function calcMacroRatios(totals) {
  const pCal = totals.protein * 4;
  const cCal = totals.carbs * 4;
  const fCal = totals.fat * 9;
  const total = Math.max(pCal + cCal + fCal, 1);
  const pPct = Math.round((pCal / total) * 100);
  const cPct = Math.round((cCal / total) * 100);
  return { pPct, cPct, fPct: 100 - pPct - cPct };
}

/**
 * Score today's diet against macro targets.
 * Returns proOk/carbOk/fatOk/calOk flags, a 0–4 score,
 * and a Chinese label + hex colour for the UI badge.
 */
export function calcDietScore(totals, targets) {
  const proOk = totals.protein >= targets.protein * 0.7;
  const carbOk = totals.carbs  <= targets.carbs;
  const fatOk  = totals.fat    <= targets.fat;
  const calOk  = totals.calories >= targets.calories * 0.5
              && totals.calories <= targets.calories * 1.1;
  const score  = [proOk, carbOk, fatOk, calOk].filter(Boolean).length;
  const label  = score >= 3 ? "均衡" : score >= 2 ? "基本合理" : "需调整";
  const color  = score >= 3 ? "#59C3C3" : score >= 2 ? "#F27D72" : "#E85D52";
  return { proOk, carbOk, fatOk, calOk, score, label, color };
}

/**
 * Summarise a full week of *valid* HRV readings (no nulls) into an
 * overall label and counts.  Pass the result of validHrvWeek().
 */
export function calcWeeklyOverall(validWeek) {
  const greenDays  = validWeek.filter(w => w.val >= 55).length;
  const yellowDays = validWeek.filter(w => w.val >= 48 && w.val < 55).length;
  const redDays    = validWeek.filter(w => w.val < 48).length;
  const score  = greenDays >= 4 ? "良好" : greenDays >= 2 ? "中等" : "需关注";
  const color  = score === "良好" ? "#59C3C3" : score === "中等" ? "#F27D72" : "#E85D52";
  return { score, color, greenDays, yellowDays, redDays };
}
