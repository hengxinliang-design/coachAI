/**
 * CoachAI 本地测试数据 v1.2
 * 对应 Excel: CoachAI_SourceData_v1.2.xlsx
 *
 * 使用方式：
 *   import { SCENARIOS, getMockMeals, loadScenario } from "./test-data/mock-data.js";
 *
 *   // 在 health-utils.js 中切换 DEFAULT_DATA:
 *   export const DEFAULT_DATA = loadScenario("S01");  // 绿灯·最佳训练日
 *
 *   // 在 App() 中预填饮食记录:
 *   const [mealLog, setMealLog] = useState(getMockMeals("S01"));
 */

// ── 10 个完整测试场景 ────────────────────────────────────────────────────────
export const SCENARIOS = {
  /** S01 绿灯·最佳训练日  CHI 目标 ≥ 78 */
  S01: {
    hrv: 64.8, rhr: 53, sleep: 7.9, awake: 0, deep_pct: 22, rem_pct: 24,
    sleep_start: "22:45", sleep_end: "06:41",
    hrv_week: [
      { day: "5/8",  val: 58.2 }, { day: "5/9",  val: 59.1 }, { day: "5/10", val: 55.3 },
      { day: "5/11", val: 60.7 }, { day: "5/12", val: 66.0 }, { day: "5/13", val: 62.4 },
      { day: "5/14", val: 64.8 },
    ],
    workout: { type: "力量训练", duration: 75, calories: 540 },
    sync_time: "07:20", sync_date: "5月14日", is_stale: false,
  },

  /** S02 绿灯·有氧日  CHI 目标 65-75 */
  S02: {
    hrv: 58.5, rhr: 55, sleep: 7.5, awake: 1, deep_pct: 20, rem_pct: 22,
    sleep_start: "23:10", sleep_end: "06:40",
    hrv_week: [
      { day: "5/7",  val: 56.3 }, { day: "5/8",  val: 57.0 }, { day: "5/9",  val: null },
      { day: "5/10", val: 55.8 }, { day: "5/11", val: 59.2 }, { day: "5/12", val: 61.1 },
      { day: "5/13", val: 58.5 },
    ],
    workout: { type: "慢跑", duration: 52, calories: 380 },
    sync_time: "07:05", sync_date: "5月13日", is_stale: false,
  },

  /** S03 绿灯·休息日  CHI 目标 ≥ 80 */
  S03: {
    hrv: 66.2, rhr: 52, sleep: 8.2, awake: 0, deep_pct: 24, rem_pct: 26,
    sleep_start: "22:30", sleep_end: "06:42",
    hrv_week: [
      { day: "5/6",  val: 58.0 }, { day: "5/7",  val: 60.3 }, { day: "5/8",  val: 57.8 },
      { day: "5/9",  val: null  }, { day: "5/10", val: 63.5 }, { day: "5/11", val: 65.0 },
      { day: "5/12", val: 66.2 },
    ],
    workout: { type: "瑜伽拉伸", duration: 35, calories: 180 },
    sync_time: "07:00", sync_date: "5月12日", is_stale: false,
  },

  /** S04 黄灯·训练后疲劳  CHI 目标 50-62 */
  S04: {
    hrv: 51.3, rhr: 57, sleep: 7.0, awake: 1, deep_pct: 17, rem_pct: 20,
    sleep_start: "23:30", sleep_end: "06:30",
    hrv_week: [
      { day: "5/5",  val: 60.2 }, { day: "5/6",  val: 58.4 }, { day: "5/7",  val: 55.9 },
      { day: "5/8",  val: 57.1 }, { day: "5/9",  val: 54.0 }, { day: "5/10", val: 52.6 },
      { day: "5/11", val: 51.3 },
    ],
    workout: { type: "HIIT", duration: 65, calories: 620 },
    sync_time: "07:30", sync_date: "5月11日", is_stale: false,
  },

  /** S05 黄灯·睡眠偏少  CHI 目标 52-60 */
  S05: {
    hrv: 55.8, rhr: 56, sleep: 6.4, awake: 2, deep_pct: 16, rem_pct: 19,
    sleep_start: "00:20", sleep_end: "06:44",
    hrv_week: [
      { day: "5/4",  val: 54.8 }, { day: "5/5",  val: 57.2 }, { day: "5/6",  val: 58.0 },
      { day: "5/7",  val: 56.6 }, { day: "5/8",  val: 59.1 }, { day: "5/9",  val: null  },
      { day: "5/10", val: 55.8 },
    ],
    workout: { type: "力量训练", duration: 60, calories: 470 },
    sync_time: "07:15", sync_date: "5月10日", is_stale: false,
  },

  /** S06 黄灯·心率偏高  CHI 目标 48-58 */
  S06: {
    hrv: 53.2, rhr: 59, sleep: 7.3, awake: 1, deep_pct: 18, rem_pct: 21,
    sleep_start: "23:00", sleep_end: "06:18",
    hrv_week: [
      { day: "5/3",  val: 57.0 }, { day: "5/4",  val: 55.5 }, { day: "5/5",  val: 56.2 },
      { day: "5/6",  val: 54.9 }, { day: "5/7",  val: 53.8 }, { day: "5/8",  val: 52.1 },
      { day: "5/9",  val: 53.2 },
    ],
    workout: { type: "未记录", duration: 0, calories: 0 },
    sync_time: "07:45", sync_date: "5月9日", is_stale: false,
  },

  /** S07 红灯·过度训练  CHI 目标 ≤ 35 */
  S07: {
    hrv: 43.7, rhr: 62, sleep: 6.1, awake: 3, deep_pct: 13, rem_pct: 15,
    sleep_start: "01:00", sleep_end: "07:06",
    hrv_week: [
      { day: "5/2",  val: 56.1 }, { day: "5/3",  val: 54.2 }, { day: "5/4",  val: 50.8 },
      { day: "5/5",  val: 47.3 }, { day: "5/6",  val: 44.9 }, { day: "5/7",  val: 43.1 },
      { day: "5/8",  val: 43.7 },
    ],
    workout: { type: "高强度跑步", duration: 80, calories: 680 },
    sync_time: "08:00", sync_date: "5月8日", is_stale: false,
  },

  /** S08 红灯·严重睡眠不足  CHI 目标 ≤ 30 */
  S08: {
    hrv: 46.2, rhr: 60, sleep: 5.5, awake: 4, deep_pct: 12, rem_pct: 16,
    sleep_start: "02:15", sleep_end: "07:45",
    hrv_week: [
      { day: "5/1",  val: 55.5 }, { day: "5/2",  val: 52.0 }, { day: "5/3",  val: 48.8 },
      { day: "5/4",  val: 45.2 }, { day: "5/5",  val: 44.0 }, { day: "5/6",  val: 45.1 },
      { day: "5/7",  val: 46.2 },
    ],
    workout: { type: "未记录", duration: 0, calories: 0 },
    sync_time: "08:30", sync_date: "5月7日", is_stale: false,
  },

  /** S09 红灯·全维度偏低  CHI 目标 ≤ 28 */
  S09: {
    hrv: 41.0, rhr: 64, sleep: 5.9, awake: 3, deep_pct: 11, rem_pct: 14,
    sleep_start: "01:30", sleep_end: "07:24",
    hrv_week: [
      { day: "4/30", val: 50.2 }, { day: "5/1",  val: 47.6 }, { day: "5/2",  val: 44.1 },
      { day: "5/3",  val: 42.5 }, { day: "5/4",  val: 41.8 }, { day: "5/5",  val: 40.3 },
      { day: "5/6",  val: 41.0 },
    ],
    workout: { type: "力量训练", duration: 45, calories: 310 },
    sync_time: "08:10", sync_date: "5月6日", is_stale: false,
  },

  /** S10 恢复中·V型反弹  CHI 目标 48-58  (红灯 → 黄灯回升) */
  S10: {
    hrv: 54.1, rhr: 57, sleep: 7.2, awake: 1, deep_pct: 18, rem_pct: 22,
    sleep_start: "23:15", sleep_end: "06:27",
    hrv_week: [
      { day: "4/29", val: 60.5 }, { day: "4/30", val: 47.2 }, { day: "5/1",  val: 43.8 },
      { day: "5/2",  val: 44.5 }, { day: "5/3",  val: 48.0 }, { day: "5/4",  val: 51.6 },
      { day: "5/5",  val: 54.1 },
    ],
    workout: { type: "游泳", duration: 45, calories: 320 },
    sync_time: "07:25", sync_date: "5月5日", is_stale: false,
  },
};

// ── 预置饮食记录库 ───────────────────────────────────────────────────────────
const MEAL_LIBRARY = {
  // 绿灯场景饮食
  S01_breakfast: {
    id: 1001, slot: "早餐", time: "07:10",
    foods: [
      { name:"燕麦粥",   emoji:"🥣", amount:"约60g",   calories:220, protein:8,  carbs:38, fat:4 },
      { name:"水煮蛋",   emoji:"🥚", amount:"2个",     calories:140, protein:12, carbs:1,  fat:10 },
      { name:"低脂牛奶", emoji:"🥛", amount:"250ml",   calories:120, protein:8,  carbs:12, fat:3 },
    ],
    totals: { calories:480, protein:28, carbs:51, fat:17 },
    note: "高蛋白高碳水，完美训练前补给，燕麦提供持续能量。",
  },
  S01_lunch: {
    id: 1002, slot: "午餐", time: "12:30",
    foods: [
      { name:"白米饭",   emoji:"🍚", amount:"约200g", calories:260, protein:5,  carbs:56, fat:1 },
      { name:"清蒸鱼",   emoji:"🐟", amount:"约150g", calories:155, protein:30, carbs:0,  fat:4 },
      { name:"炒西兰花", emoji:"🥦", amount:"约100g", calories:75,  protein:3,  carbs:8,  fat:3 },
    ],
    totals: { calories:490, protein:38, carbs:64, fat:8 },
    note: "训练后黄金窗口补充，蛋白质充足，碳水适量帮助糖原恢复。",
  },
  S01_snack: {
    id: 1003, slot: "加餐", time: "15:45",
    foods: [
      { name:"乳清蛋白粉", emoji:"💪", amount:"30g",    calories:120, protein:24, carbs:3,  fat:2 },
      { name:"香蕉",       emoji:"🍌", amount:"1根中等", calories:100, protein:1,  carbs:26, fat:0 },
    ],
    totals: { calories:220, protein:25, carbs:29, fat:2 },
    note: "训练后 30 分钟内补充，蛋白质 + 快碳双管齐下。",
  },
  S01_dinner: {
    id: 1004, slot: "晚餐", time: "19:00",
    foods: [
      { name:"鸡胸肉",   emoji:"🍗", amount:"约150g", calories:165, protein:31, carbs:0,  fat:4 },
      { name:"杂粮饭",   emoji:"🍱", amount:"约150g", calories:195, protein:5,  carbs:42, fat:2 },
      { name:"凉拌沙拉", emoji:"🥗", amount:"约100g", calories:90,  protein:2,  carbs:8,  fat:5 },
    ],
    totals: { calories:450, protein:38, carbs:50, fat:11 },
    note: "均衡晚餐，睡前蛋白充足，帮助夜间肌肉合成。",
  },
  // 黄灯场景饮食
  S04_lunch: {
    id: 1005, slot: "午餐", time: "12:15",
    foods: [
      { name:"藜麦",   emoji:"🌾", amount:"约100g", calories:120, protein:4,  carbs:21, fat:2 },
      { name:"烤鸡腿", emoji:"🍗", amount:"约180g", calories:270, protein:30, carbs:0,  fat:15 },
      { name:"混合沙拉",emoji:"🥗", amount:"约150g", calories:90,  protein:3,  carbs:10, fat:3 },
    ],
    totals: { calories:480, protein:37, carbs:31, fat:20 },
    note: "抗炎食物为主，减少精制碳水，助力 HRV 回升。",
  },
  S04_snack: {
    id: 1006, slot: "加餐", time: "16:00",
    foods: [
      { name:"混合坚果",   emoji:"🥜", amount:"约30g",  calories:170, protein:5,  carbs:6,  fat:15 },
      { name:"希腊酸奶",   emoji:"🍦", amount:"150g",   calories:80,  protein:10, carbs:8,  fat:1 },
    ],
    totals: { calories:250, protein:15, carbs:14, fat:16 },
    note: "健康脂肪 + 益生菌，助力恢复，不刺激血糖。",
  },
  // 红灯场景饮食
  S07_lunch: {
    id: 1007, slot: "午餐", time: "13:00",
    foods: [
      { name:"鸡汤面", emoji:"🍜", amount:"一碗约300g", calories:320, protein:20, carbs:46, fat:7 },
      { name:"卤蛋",   emoji:"🥚", amount:"2个",        calories:140, protein:12, carbs:2,  fat:10 },
    ],
    totals: { calories:380, protein:32, carbs:48, fat:17 },
    note: "温和汤面，减少消化负担，过度训练日以休息为主。",
  },
  // 通用加餐
  universal_snack_protein: {
    id: 2001, slot: "加餐", time: "10:30",
    foods: [
      { name:"蛋白棒", emoji:"🍫", amount:"1根约60g", calories:220, protein:20, carbs:22, fat:6 },
    ],
    totals: { calories:220, protein:20, carbs:22, fat:6 },
    note: "便携高蛋白加餐，训练间歇或上午补充。",
  },
  universal_snack_fruit: {
    id: 2002, slot: "加餐", time: "15:00",
    foods: [
      { name:"苹果",  emoji:"🍎", amount:"1个约200g", calories:104, protein:1,  carbs:28, fat:0 },
      { name:"蓝莓",  emoji:"🫐", amount:"约50g",    calories:29,  protein:0,  carbs:7,  fat:0 },
    ],
    totals: { calories:133, protein:1, carbs:35, fat:0 },
    note: "天然抗氧化剂，黄绿灯均适用，补充维生素 C。",
  },
  universal_snack_casein: {
    id: 2003, slot: "加餐", time: "21:00",
    foods: [
      { name:"卡达基奶酪", emoji:"🧀", amount:"100g",  calories:100, protein:11, carbs:3,  fat:5 },
      { name:"核桃",       emoji:"🌰", amount:"约20g",  calories:130, protein:3,  carbs:3,  fat:13 },
    ],
    totals: { calories:230, protein:14, carbs:6, fat:18 },
    note: "睡前酪蛋白缓释，促进夜间肌肉合成，核桃提供 Omega-3。",
  },
};

// ── 场景 → 餐次映射 ──────────────────────────────────────────────────────────
const SCENARIO_MEALS = {
  S01: ["S01_breakfast", "S01_lunch", "S01_snack", "S01_dinner"],
  S02: ["S01_breakfast", "S01_lunch", "universal_snack_fruit"],
  S03: ["S01_breakfast", "S01_lunch", "S01_dinner"],
  S04: ["S04_lunch", "S04_snack", "universal_snack_casein"],
  S05: ["S01_breakfast", "S04_lunch"],
  S06: ["S01_breakfast", "universal_snack_protein"],
  S07: ["S07_lunch"],
  S08: ["S07_lunch"],
  S09: [],
  S10: ["S04_lunch", "universal_snack_fruit", "universal_snack_casein"],
};

/**
 * 获取某场景的健康数据对象（符合 HealthData 结构）
 * @param {string} id  场景 ID，如 "S01"
 * @returns {object}   HealthData
 */
export function loadScenario(id) {
  return SCENARIOS[id] ?? SCENARIOS["S01"];
}

/**
 * 获取某场景的预置饮食记录（符合 mealLog 结构）
 * @param {string} id  场景 ID，如 "S01"
 * @returns {object[]} Meal[]
 */
export function getMockMeals(id) {
  const keys = SCENARIO_MEALS[id] ?? [];
  return keys.map(k => MEAL_LIBRARY[k]).filter(Boolean);
}

/**
 * 所有场景 ID 列表（方便遍历测试）
 */
export const SCENARIO_IDS = Object.keys(SCENARIOS);

/**
 * 快捷 DEFAULT_DATA 替换示例：
 *
 * // health-utils.js 顶部：
 * import { loadScenario } from "./test-data/mock-data.js";
 * export const DEFAULT_DATA = loadScenario("S07");  // 红灯测试
 */
