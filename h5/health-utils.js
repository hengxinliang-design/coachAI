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
