/**
 * cbum-data.js — CBum 训练方法论数据 & 计划生成器
 * 来源：coach.ai spec v1.0 Section 2
 */

// ── 六大核心原则 ──────────────────────────────────────────────────────────────
export const CBUM_PRINCIPLES = [
  { id:1, name:"Mind-Muscle Connection", desc:"感受 > 重量，全程完整动作幅度，顶峰收缩停留 1 秒" },
  { id:2, name:"双重渐进超负荷",         desc:"同重量完成设定范围最高次数后，才加重 5-15 lbs" },
  { id:3, name:"复合优先，孤立收尾",     desc:"体力充沛时先做复合动作，之后用孤立动作精雕泵感" },
  { id:4, name:"末组高强度手段",         desc:"🟢 优秀日：末组执行递减组或超级组" },
  { id:5, name:"8-15 次肌肥大区间",      desc:"复合动作 6-8 次，孤立动作 10-15 次" },
  { id:6, name:"背部双频次",             desc:"每周期 2 次：厚度日（划船）+ 宽度日（下拉）" },
];

// ── 动作库 ────────────────────────────────────────────────────────────────────
// equipment: "full"=完整健身房 "home"=家庭器械 "outdoor"=户外
export const EXERCISES = {
  push: {
    compound: [
      { name:"杠铃卧推",     muscle:"胸（中下）", equipment:["full"],        sets:[3,4], reps:[6,8],   tip:"下放到胸部触碰，末组俯卧撑力竭，双侧完全夹胸", dropSet:true  },
      { name:"上斜哑铃卧推", muscle:"胸（上部）", equipment:["full","home"], sets:[3,4], reps:[8,10],  tip:"30-45° 角度，顶峰双侧夹胸收缩",                dropSet:false },
      { name:"哑铃肩推",     muscle:"肩（前/中）",equipment:["full","home"], sets:[3],   reps:[10,12], tip:"不要耸肩，肘部略向前，全程控制离心",            dropSet:true  },
    ],
    isolation: [
      { name:"绳索夹胸",         muscle:"胸（内侧）",  equipment:["full"],        sets:[3],   reps:[12,15], tip:"夹胸在中线停顿 1 秒，感受内侧收缩",             dropSet:false },
      { name:"侧平举",           muscle:"肩（中束）",  equipment:["full","home"], sets:[4],   reps:[12,15], tip:"轻重量高质量，不借力，感受三角肌中束单独发力",  dropSet:true  },
      { name:"绳索面拉",         muscle:"肩（后束）",  equipment:["full"],        sets:[3],   reps:[15,20], tip:"拉到面部，外旋发力，掌心向前",                  dropSet:false },
      { name:"绳索下压（三头）", muscle:"三头",        equipment:["full"],        sets:[3,4], reps:[12,15], tip:"肘部固定，全程收缩，末组力竭",                  dropSet:true  },
      { name:"过顶哑铃臂屈伸",   muscle:"三头（长头）",equipment:["full","home"], sets:[3],   reps:[12,15], tip:"肘部紧靠头部，离心慢放 3 秒",                   dropSet:false },
    ],
  },
  pull: {
    compound: [
      { name:"杠铃划船",   muscle:"背（厚度）", equipment:["full"],        sets:[4],   reps:[6,8],  tip:"肩胛骨完全回收，感受背部发力而非手臂",     dropSet:false },
      { name:"高位下拉",   muscle:"背（宽度）", equipment:["full"],        sets:[3,4], reps:[8,10], tip:"下拉到胸部，底部停顿，感受背阔肌完全收缩", dropSet:true  },
      { name:"杠铃弯举",   muscle:"二头",       equipment:["full","home"], sets:[3],   reps:[8,10], tip:"控制离心，不甩动，末组递减组",              dropSet:true  },
    ],
    isolation: [
      { name:"胸支撑哑铃划船", muscle:"背（厚度/细节）",equipment:["full","home"], sets:[3], reps:[10,12], tip:"隔离腰背，专注背阔和菱形肌",         dropSet:false },
      { name:"直臂下压",       muscle:"背（背阔）",     equipment:["full"],        sets:[3], reps:[12,15], tip:"手臂伸直，背阔发力下压，顶峰停顿",   dropSet:false },
      { name:"锤式弯举",       muscle:"二头（肱肌）",   equipment:["full","home"], sets:[3], reps:[10,12], tip:"增加肱肌和前臂厚度",                 dropSet:false },
      { name:"绳索弯举",       muscle:"二头",           equipment:["full"],        sets:[3], reps:[12,15], tip:"顶峰收缩 1 秒，离心慢放",            dropSet:false },
    ],
  },
  legs: {
    compound: [
      { name:"杠铃深蹲",    muscle:"股四头/臀", equipment:["full"],        sets:[4],   reps:[6,8],  tip:"全蹲，顶峰时不锁膝保持张力，控制下降节奏", dropSet:false },
      { name:"腿举",        muscle:"股四头",   equipment:["full"],        sets:[3,4], reps:[10,12],tip:"脚位靠上激活臀部，全程不锁膝",              dropSet:true  },
      { name:"罗马尼亚硬拉",muscle:"腘绳/臀",  equipment:["full","home"], sets:[3,4], reps:[8,10], tip:"感受腘绳拉伸，髋部后推，不是下背部主导",    dropSet:false },
    ],
    isolation: [
      { name:"腿伸展",   muscle:"股四头", equipment:["full"], sets:[3], reps:[12,15], tip:"顶峰停顿 1 秒，感受股四头完全收缩", dropSet:true  },
      { name:"腿弯举",   muscle:"腘绳",   equipment:["full"], sets:[3], reps:[10,12], tip:"离心慢放 3 秒，不要弹震",           dropSet:false },
    ],
  },
  cardio: {
    compound: [],
    isolation: [
      { name:"椭圆机 Z2 有氧", muscle:"全身有氧",equipment:["full"],             sets:[1], reps:[30,45], tip:"心率保持在 128-140 bpm（Z2），稳定节奏", dropSet:false },
      { name:"慢走恢复",       muscle:"主动恢复",equipment:["outdoor","full","home"],sets:[1],reps:[20,30],tip:"心率 < 127 bpm（Z1），轻松节奏，促进血液循环",dropSet:false },
    ],
  },
};

// ── 热身模板 ──────────────────────────────────────────────────────────────────
export const WARMUP = {
  push:   ["弹力带肩部绕环 2×15","俯卧撑热身 2×10（轻松节奏）","空杆卧推感受轨迹 2×8"],
  pull:   ["弹力带肩胛骨激活 2×15","悬挂伸展 30 秒 × 2","轻重量高位下拉感受 2×10"],
  legs:   ["泡沫轴滚压股四头 60 秒","弓步激活髋屈肌 2×10","空蹲感受膝踝对齐 2×10"],
  cardio: ["关节绕环（踝/膝/髋）各 10 次","5 分钟慢走热身"],
};

// ── 拉伸模板 ──────────────────────────────────────────────────────────────────
export const COOLDOWN = {
  push:   ["胸部拉伸（门框拉伸）30s×2","三角肌前束拉伸 30s×2","三头牵拉 20s×2"],
  pull:   ["背阔拉伸（悬挂/侧弯）30s×2","二头牵拉 20s×2","胸椎旋转 10 次×2"],
  legs:   ["股四头站姿拉伸 30s×2","腘绳坐姿前屈 45s","髋屈肌弓步拉伸 30s×2"],
  cardio: ["全身静态拉伸 5-8 分钟","深呼吸放松 10 次"],
};

// ── 主入口：生成 CBum 训练计划 ─────────────────────────────────────────────────
/**
 * @param {"green"|"yellow"|"red"} grade   今日恢复评级
 * @param {"push"|"pull"|"legs"|"auto"} split  训练部位
 * @param {"full"|"home"|"outdoor"} equipment  可用器械
 * @returns {Object} plan
 */
export function generateCBumPlan(grade, split, equipment = "full") {
  // 🔴 较差 → 主动恢复
  if (grade === "red") {
    const moves = EXERCISES.cardio.isolation.filter(e =>
      e.equipment.some(eq => eq === equipment || eq === "full")
    );
    return {
      split: "cardio", splitLabel: "主动恢复",
      grade, warmup: WARMUP.cardio,
      exercises: moves.slice(0, 1),
      intensityNotes: [],
      cooldown: COOLDOWN.cardio,
      duration: "20-30 分钟",
      zoneTarget: "Z1 < 127 bpm",
      coachNote: "HRV 和心率显示今天需要恢复。轻松活动促进血液循环即可，不适合力量训练。",
    };
  }

  const actualSplit = split === "auto" ? "push" : split;
  const LABEL = { push:"推（胸/肩/三头）", pull:"拉（背/二头）", legs:"腿（股四/腘绳）" };
  const pool = EXERCISES[actualSplit];

  const byEquip = list => list.filter(e =>
    equipment === "full" || e.equipment.some(eq => eq === equipment)
  );

  // 🟢 优秀：3 复合 + 4 孤立；🟡 中等：2 复合 + 3 孤立
  const nCompound   = grade === "green" ? 3 : 2;
  const nIsolation  = grade === "green" ? 4 : 3;
  const compounds   = byEquip(pool.compound).slice(0, nCompound);
  const isolations  = byEquip(pool.isolation).slice(0, nIsolation);
  const exercises   = [...compounds, ...isolations].map(e => ({
    ...e,
    setsDisplay: grade === "green" ? (e.sets[1] ?? e.sets[0]) : e.sets[0],
    repsDisplay: `${e.reps[0]}-${e.reps[1]}`,
    hasDropSet:  grade === "green" && e.dropSet,
  }));

  const intensityNotes = grade === "green"
    ? exercises.filter(e => e.hasDropSet).map(e => `${e.name}：末组递减组`)
    : [];

  const firstCompound = compounds[0]?.name ?? "";
  const coachNote = grade === "green"
    ? `今天状态优秀，适合全力训练。${firstCompound ? `${firstCompound}可以冲今日最大重量，` : ""}末组执行递减组，感受肌肉充血。`
    : `今天状态中等，比常用重量减少约 20-25%，以动作质量和感受为主，末组不追求力竭。`;

  return {
    split: actualSplit,
    splitLabel: LABEL[actualSplit],
    grade,
    warmup:   WARMUP[actualSplit],
    exercises,
    intensityNotes,
    cooldown: COOLDOWN[actualSplit],
    duration: grade === "green" ? "70-80 分钟" : "55-70 分钟",
    zoneTarget: "组间心率回落 ≤ 115 bpm 再开始下一组",
    coachNote,
  };
}
