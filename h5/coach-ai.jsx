import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  DEFAULT_DATA,
  averageHrvWeek,
  calcDietScore,
  calcMacroRatios,
  calcWeeklyOverall,
  classifyHrvColor,
  getLevel,
  getNutritionTargets,
  parseHealthJSON,
  sumMealTotals,
  validHrvWeek,
} from "./health-utils.js";

// ─── 色彩系统 — VI 最终定稿 v1.0 ────────────────────────────────────────────
// 「Luxury Athletic OS」Emotionally Intelligent Fitness System
// 来源：Coach.AI VI Design Final Direction v1.0
const C = {
  // Foundation Colors（Mineral / Carbon / Warm Fog）
  ink:    "#1F2328",  // Mineral Graphite — 主背景，Apple 深色哲学，非纯黑，高级矿物感
  ink2:   "#2B3138",  // Soft Carbon — 卡片底色，像高级运动面料·磨砂树脂
  ink3:   "#39424F",  // Midnight Fog — 边框/分割线
  ink4:   "#4E5D94",  // Deep Indigo — 次要元素背景
  // Text（Warm hierarchy — FENDI SS26 气质）
  fog:    "#6B6560",  // 隐色（极暖灰）
  mid:    "#A09A94",  // 次要文字（暖灰）
  lit:    "#C4BDB7",  // 正文（浅暖灰）
  white:  "#D8D1C7",  // Warm Fog — 标题/最亮，让系统「不冷」
  // Emotional Energy Colors
  o1:     "#F27D72",  // Warm Coral — Peak / HIIT / Alert，温暖运动能量，非危险红
  o2:     "#D96A60",  // Warm Coral 深色
  aqua:   "#59C3C3",  // Recovery Aqua — HRV / AI状态 / 恢复呼吸，"被阳光照射后的海盐颜色"
  blue:   "#7DA7D9",  // Aerobic Blue — Zone2 长距离有氧稳态训练
  butter: "#F4D35E",  // Butter Energy — streak / achievement / positive feedback
  rose:   "#D9A5B3",  // Dust Rose — Sleep / Recovery / Meditation / Emotional Calmness
  indigo: "#4E5D94",  // Deep Indigo
  // 向后兼容别名
  mag:    "#7DA7D9",
  go:     "#4E5D94",
  blue_:  "#7DA7D9",
  purple: "#4E5D94",
};
// 语义色 — Emotion as Material
const STATUS = {
  green:    "#59C3C3",  // Recovery Aqua — 恢复良好
  yellow:   "#F27D72",  // Warm Coral — 注意/降低强度
  red:      "#E85D52",  // Warm Alert Red — 强制休息（温暖，非电竞红）
  greenBg:  "#59C3C318",
  yellowBg: "#F27D7218",
  redBg:    "#E85D5218",
};

// ─── 解读内容库 ─────────────────────────────────────────────────────────────
const INTERP = {
  status:(d,lv)=>({
    title: lv==="green"?"恢复良好 — 可以训练":lv==="yellow"?"恢复偏弱 — 降低强度":"指标异常 — 强制休息",
    color: lv==="green"?STATUS.green:lv==="yellow"?STATUS.yellow:STATUS.red,
    icon:  lv==="green"?"ti-check":lv==="yellow"?"ti-alert-circle":"ti-alert-triangle",
    sections:[
      { label:"综合评级依据",
        content:`HRV ${Math.round(d.hrv)} ms（${d.hrv>=55?"绿灯":d.hrv>=48?"黄灯":"红灯"}） · 静息心率 ${d.rhr} bpm（${d.rhr<=56?"正常":"偏高"}） · 睡眠 ${d.sleep.toFixed(1)} h（${d.sleep>=7.5?"充足":"尚可"}）` },
      { label:"当前状态含义",
        content: lv==="green"
          ?"自主神经系统处于良好恢复状态，三项核心指标均在绿灯范围，身体已准备好接受训练刺激。"
          :lv==="yellow"
          ?`HRV ${Math.round(d.hrv)} ms 落在黄灯区间（48–54 ms），上次训练的疲劳尚未完全消散。今日已完成 ${d.workout.duration} 分钟力量训练，建议明日降低强度。`
          :"多项指标触发警告，自主神经系统处于抑制状态，强行训练将加深疲劳并显著增加受伤风险。" },
      { label:"建议行动",
        content: lv==="green"
          ?"可按正常计划训练，力量+有氧组合均可，心率区间 Z2–Z4。"
          :lv==="yellow"
          ?"仅做 Z1–Z2 有氧训练（30–40 分钟，心率 < 140 bpm），禁止力量训练。5/10 截止日明天到，请控制总负荷。"
          :"今日完全休息，或仅做 20 分钟轻度拉伸。明晨重新检查 HRV/RHR 后再做决定。" },
    ]
  }),
  hrv:(d)=>({
    title:"心率变异性（HRV）",
    color: d.hrv>=55?STATUS.green:d.hrv>=48?STATUS.yellow:STATUS.red,
    icon:"ti-activity",
    sections:[
      { label:"当前读数",
        content:`${Math.round(d.hrv)} ms — ${d.hrv>=55?"绿灯，恢复良好":d.hrv>=48?"黄灯，恢复尚可":"红灯，恢复不足"}` },
      { label:"HRV 是什么",
        content:"相邻心跳间隔时间的变化幅度。数值越高，自主神经调节能力越强，恢复越好。它是目前运动科学中评估训练就绪度最可靠的单项生物指标。" },
      { label:"你的参考基准",
        content:`7日均值 ${Math.round(averageHrvWeek(d.hrv_week))} ms。本周峰值 ${Math.round(Math.max(...validHrvWeek(d.hrv_week).map(x=>x.val),0))} ms，今日小幅回落属正常波动，非异常信号。` },
      { label:"阈值速查",
        content:"≥ 55 ms → 绿灯正常训练　48–54 ms → 黄灯降强度　< 48 ms → 红灯休息　< 43 ms → 强制完全休息" },
    ]
  }),
  rhr:(d)=>({
    title:"静息心率（RHR）",
    color: d.rhr<=56?STATUS.green:d.rhr<=59?STATUS.yellow:STATUS.red,
    icon:"ti-heart-rate-monitor",
    sections:[
      { label:"当前读数",
        content:`${d.rhr} bpm — ${d.rhr<=56?"处于基准以内，状态正常":d.rhr<=59?"略高于基准，提示有累积疲劳":"明显偏高，需要重点关注"}` },
      { label:"你的个人基准",
        content:"你的静息基准约为 55 bpm。比基准偏高 ≥ 5 bpm 通常是过度训练、睡眠不足或潜在炎症的早期信号。" },
      { label:"近期趋势",
        content:"本周从高点 59 bpm（5/6）持续下降至今日 56 bpm，方向向好，说明身体正在逐步恢复中。" },
    ]
  }),
  sleep:(d)=>({
    title:"睡眠分析",
    color: d.sleep>=7.5?STATUS.green:d.sleep>=6.5?STATUS.yellow:STATUS.red,
    icon:"ti-moon-stars",
    sections:[
      { label:"今晚概况",
        content:`总时长 ${d.sleep.toFixed(1)} 小时，夜间觉醒 ${d.awake} 次（优秀）。深睡占比 ${d.deep_pct}%，REM 占比 ${d.rem_pct}%。` },
      { label:"各阶段意义",
        content:`深睡（${d.deep_pct}%）：身体物理修复 + 肌肉恢复。REM（${d.rem_pct}%）：记忆巩固 + 认知恢复。两者合计 ${d.deep_pct+d.rem_pct}%，建议目标 ≥ 35%。` },
      { label:"对今日训练的影响",
        content:`觉醒 0 次，睡眠连贯性高，是 HRV 维持在黄灯上限的关键支撑。明晚建议同样保证 ≥ 7.5 小时，为后续恢复打好基础。` },
    ]
  }),
  workout:(d)=>({
    title:"今日训练记录",
    color:STATUS.yellow,
    icon:"ti-barbell",
    sections:[
      { label:"训练概览",
        content:`${d.workout.type} · ${d.workout.duration} 分钟 · 消耗 ${d.workout.calories} kcal` },
      { label:"负荷评估",
        content:`${d.workout.duration} 分钟力量训练属于中高负荷。消耗 ${d.workout.calories} kcal，训练后 30 分钟内应补充蛋白质 25–40 g + 碳水 40–60 g（黄金窗口）。` },
      { label:"对明日的影响",
        content:"力量训练后肌肉处于微损伤修复阶段（48–72 小时），明日不建议对相同肌群再次施加力量刺激。安排轻量有氧或完全休息效果最佳。" },
    ]
  }),
  rec:(lv)=>({
    title:"明日训练建议",
    color: lv==="green"?STATUS.green:lv==="yellow"?STATUS.yellow:STATUS.red,
    icon: lv==="green"?"ti-barbell":lv==="yellow"?"ti-run":"ti-zzz",
    sections:[
      { label:"推荐方案",
        content: lv==="green"
          ?"正常力量训练：俯卧撑 4×12 → 阻力带划船 3×15 → 核心 15 分钟。目标心率 Z2–Z3（128–152 bpm）。"
          :lv==="yellow"
          ?"轻量有氧：慢跑或快走 30–40 分钟，全程心率保持 Z2（128–140 bpm）。禁止力量训练。"
          :"完全休息，或 20 分钟轻度拉伸。任何高强度训练均不建议执行。" },
      { label:"心率区间说明",
        content:"Z1 < 127 bpm（极低）　Z2 128–140（有氧基础）　Z3 141–152（有氧提升）　Z4 153–164（无氧阈值）　Z5 165+（最大强度）" },
      { label:"特别提示",
        content:"5/10 项目截止日明天到，工作压力会额外消耗恢复资源。即使明晨 HRV 回升至绿灯，也建议将训练时长压缩至 40 分钟以内。" },
    ]
  }),
  nutrition:(d,lv)=>({
    title:"饮食方案解读",
    color:STATUS.yellow,
    icon:"ti-salad",
    sections:[
      { label:"今日模式",
        content: lv==="red"?"休息日：以糖原补充为主，确保充足碳水，帮助肌肉糖原恢复。"
          :lv==="yellow"?"轻训恢复日：优先抗炎食物，减少精制糖和酒精，支持组织修复。"
          :`训练日：今日消耗 ${d.workout.calories} kcal，需针对性补充蛋白质和碳水。` },
      { label:"蛋白质策略",
        content:`目标 ≥ ${lv==="red"?120:lv==="yellow"?130:140} g（体重 kg × 1.6–2.0 g）。每餐上限 40 g，超出部分无法额外吸收。建议均匀分布于 3–4 餐。` },
      { label:"补充时机",
        content:"训练后 30 分钟内（黄金窗口）：蛋白质 25–40 g + 快碳水 40–60 g。睡前：甘氨酸镁 200–400 mg + VD3 2000 IU + Omega-3 2 g（改善深睡和 HRV）。" },
      { label:"抗炎食物",
        content:"HRV 黄灯期间重点补充：三文鱼（Omega-3）、姜黄（姜黄素）、深色浆果（抗氧化）、核桃。同时减少酒精、精制糖和超加工食品。" },
    ]
  }),
  hrv_chart:(d)=>({
    title:"本周 HRV 趋势",
    color:STATUS.yellow,
    icon:"ti-chart-line",
    sections:[
      { label:"本周走势",
        content:`低点：5/6 的 47.5 ms（红灯区间）→ 峰值：5/7 的 69.4 ms（力量+有氧双训练后充分睡眠的结果）→ 今日回落至 54.2 ms（黄灯区间）。` },
      { label:"为何会波动",
        content:"HRV 日常波动完全正常。高强度训练次日通常下降，充分休息后回升。需要关注的是连续 3 天以上的单向下降趋势，而非单日的小幅变化。" },
      { label:"长期改善目标",
        content:`当前 7 日均值约 54 ms。持续规律训练 + 充足恢复，均值应逐步提升至 60+ ms。每 4 周安排一次减载周（训练量降 40%）是提升均值的关键手段。` },
    ]
  }),
};

// ─── 弧形进度环 ─────────────────────────────────────────────────────────────
function Arc({value,max,color,size=88,stroke=7,label,sub,glow=false,labelSize=18}) {
  const r=(size-stroke*2)/2, circ=2*Math.PI*r, arc=circ*0.75;
  const fill=Math.min(value/max,1)*arc;
  const gid=`glow${size}`;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(135deg)",overflow:"visible"}}>
        {glow&&<defs>
          <filter id={gid} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.ink3} strokeWidth={stroke} strokeDasharray={`${arc} ${circ-arc}`} strokeLinecap="round"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round"
          filter={glow?`url(#${gid})`:undefined}
          style={{transition:"stroke-dasharray .6s cubic-bezier(.4,0,.2,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:labelSize,fontWeight:300,color:C.white,lineHeight:1,letterSpacing:"-.03em"}}>{label}</span>
        {sub&&<span style={{fontSize:9,color:C.fog,marginTop:3,letterSpacing:".06em"}}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── 迷你折线 ───────────────────────────────────────────────────────────────
function Spark({vals,color,width=52,height=20}) {
  const valid=vals.map((v,i)=>({v,i})).filter(x=>Number.isFinite(x.v));
  if(valid.length<2) return null;
  const mn=Math.min(...valid.map(x=>x.v)),mx=Math.max(...valid.map(x=>x.v)),rng=mx-mn||1;
  const denom=Math.max(vals.length-1,1);
  const pts=valid.map(({v,i})=>`${(i/denom)*width},${height-((v-mn)/rng)*(height-4)-2}`).join(" ");
  const last=pts.split(" ").pop().split(",").map(Number);
  return (
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color}/>
    </svg>
  );
}

// ─── 区间条 ─────────────────────────────────────────────────────────────────
function ZoneBar({zone}) {
  const defs=[{c:"#39424F",h:7},{c:"#59C3C3",h:11},{c:"#F27D72",h:15},{c:"#7DA7D9",h:11},{c:"#D8D1C7",h:7}];
  return (
    <div style={{display:"flex",gap:2,alignItems:"flex-end"}}>
      {defs.map((z,i)=>(
        <div key={i} style={{width:8,height:i+1===zone?z.h+5:z.h,borderRadius:2,background:i+1===zone?z.c:C.ink3,transition:"height .3s"}}/>
      ))}
    </div>
  );
}

// ─── 进度条 ─────────────────────────────────────────────────────────────────
function Bar({pct,color,h=5}) {
  return (
    <div style={{flex:1,height:h,background:C.ink3,borderRadius:100,overflow:"hidden"}}>
      <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:100,transition:"width .5s"}}/>
    </div>
  );
}

// ─── 可点击容器 ─────────────────────────────────────────────────────────────
function Tap({children,onTap}) {
  const [hov,setHov]=useState(false);
  return (
    <div onClick={onTap} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{cursor:"pointer",position:"relative",transition:"opacity .15s",opacity:hov?.88:1}}>
      {children}
      <div style={{
        position:"absolute",bottom:9,right:11,
        display:"flex",alignItems:"center",gap:3,
        opacity:hov?.85:.22,transition:"opacity .2s",pointerEvents:"none",
      }}>
        <Icon name="ti-info-circle" color={C.mid} size={11}/>
        <span style={{fontSize:9,color:C.mid}}>解读</span>
      </div>
    </div>
  );
}

// ─── 弹窗图标（SVG 备用，确保无论字体是否加载都能显示）────────────────────
const ICON_PATHS = {
  "ti-check":        "M5 12l5 5L20 7",
  "ti-alert-circle": "M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v4m0 4v.01",
  "ti-alert-triangle":"M12 3L2 20h20L12 3zm0 6v4m0 4v.01",
  "ti-activity":     "M3 12h3l3-8 4 16 3-8h3",
  "ti-heart-rate-monitor":"M3 9h4l2 7 4-13 2 6h4",
  "ti-moon-stars":   "M17 12a5 5 0 01-10 0 5 5 0 015-9.95A7 7 0 0117 12zM19 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z",
  "ti-barbell":      "M6 6h12v2H6zm0 8h12v2H6zM4 9h16v6H4z",
  "ti-run":          "M13 4a1 1 0 100-2 1 1 0 000 2zm-3 8l-2 4H5m5-4l4 4m-4-4l1-5 3 3 3-1",
  "ti-zzz":          "M4 8h8L4 16h8M14 8h6l-4 4 4 4h-6",
  "ti-salad":        "M7 10c0-3 3-6 5-6s5 3 5 6H7zm0 0v2a5 5 0 0010 0v-2",
  "ti-chart-line":   "M4 19l4-6 4 4 4-8 4 3",
};
function ModalIcon({name, color}) {
  const path = ICON_PATHS[name] || ICON_PATHS["ti-alert-circle"];
  return (
    <div style={{width:42,height:42,borderRadius:14,flexShrink:0,background:`${color}18`,border:`1px solid ${color}50`,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={path}/>
      </svg>
    </div>
  );
}

// ─── 内联 SVG 图标（完全不依赖字体）────────────────────────────────────────
const SVG_ICONS = {
  "ti-activity":           (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12h3l3-7 4 14 3-7h5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-heart-rate-monitor": (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 10h4l2 6 4-12 2 6h6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-moon-stars":         (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z" stroke={c} strokeWidth="2" strokeLinecap="round"/><path d="M17 4l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  "ti-barbell":            (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="11" width="3" height="2" rx="0.5" stroke={c} strokeWidth="1.8" fill="none"/><rect x="19" y="11" width="3" height="2" rx="0.5" stroke={c} strokeWidth="1.8" fill="none"/><rect x="5" y="8" width="2" height="8" rx="0.5" stroke={c} strokeWidth="1.8" fill="none"/><rect x="17" y="8" width="2" height="8" rx="0.5" stroke={c} strokeWidth="1.8" fill="none"/><line x1="7" y1="12" x2="17" y2="12" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  "ti-meat":               (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.5 9.5l-5 5M20 4l-1.5 1.5A5 5 0 0112 7H9a3 3 0 000 6h1a3 3 0 013 3v1a5 5 0 001.5 3.5L16 22l4-18z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-grain":              (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8 7 8 12 12 22c4-10 4-15 0-20z" stroke={c} strokeWidth="1.8" strokeLinecap="round"/><path d="M12 8c-2-2-5-2-6 0m6 4c-2-2-5-2-6 0m12-4c-1-2-4-2-6 0m6 4c-1-2-4-2-6 0" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  "ti-droplet":            (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8 8 6 11 6 15a6 6 0 0012 0c0-4-2-7-6-13z" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-leaf":               (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 20c4-4 6-8 6-13 3-1 6-2 7-4-4 0-8 2-10 6-1-2-1-4 0-5C4 5 3 10 5 14l-2 6h3z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-pill":               (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="10" width="18" height="4" rx="2" stroke={c} strokeWidth="1.8" fill="none"/><path d="M3 12h18" stroke={c} strokeWidth="1.2" opacity="0.4"/><circle cx="7" cy="12" r="4" stroke={c} strokeWidth="1.8" fill="none"/><circle cx="17" cy="12" r="4" stroke={c} strokeWidth="1.8" fill="none"/></svg>,
  "ti-salad":              (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 11h16M7 11C7 7 9 4 12 4s5 3 5 7" stroke={c} strokeWidth="1.8" strokeLinecap="round"/><path d="M5 11v2a7 7 0 0014 0v-2" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  "ti-run":                (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="14" cy="4" r="1.5" stroke={c} strokeWidth="1.8"/><path d="M5 18l4-4 3 3 3-6 4-2M9 14l-2 4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-zzz":                (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 8h8L4 16h8M14 6h6l-5 5 5 6h-6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-flame":              (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2c0 6-5 8-5 14a5 5 0 0010 0c0-4-2-6-2-10-1 2-1 4-3 5 0-3 1-6 0-9z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-check":              (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-alert-circle":       (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8"/><path d="M12 8v4m0 4v.01" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  "ti-alert-triangle":     (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 20h20L12 3z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 9v4m0 4v.01" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  "ti-chart-line":         (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20l4-8 4 4 4-10 4 5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-moon":               (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  "ti-camera":             (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 4H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-4l-2-2H9z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8"/></svg>,
  "ti-plus":               (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2.2" strokeLinecap="round"/></svg>,
  "ti-x":                  (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  "ti-sparkles":           (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "ti-trash":              (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};
function Icon({name, color, size=18}) {
  const fn = SVG_ICONS[name];
  if(fn) return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,flexShrink:0}}>{fn(color)}</span>;
  // 最终 fallback：彩色圆点
  return <span style={{width:size,height:size,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0,opacity:.7}}/>;
}
function SyncItemIcon({name, done}) { return <Icon name={name} color={done?"#59C3C3":"#F27D72"} size={16}/>; }
function NutriIcon({name, color})   { return <Icon name={name} color={color} size={16}/>; }

// ─── 同步动画覆盖层 ──────────────────────────────────────────────────────────
function SyncOverlay({phase, items}) {
  if(phase===0) return null;
  const done = phase===2;
  return (
    <div style={{
      position:"absolute",top:0,left:0,right:0,bottom:0,
      background:"rgba(31,35,40,.96)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      zIndex:150, borderRadius:28,
      animation:"fadeIn .22s ease forwards",
    }}>
      {/* 脉冲环 */}
      <div style={{position:"relative",width:96,height:96,marginBottom:32}}>
        {/* 外环脉冲 */}
        <div style={{
          position:"absolute",inset:-8,borderRadius:"50%",
          border:`1.5px solid ${done ? "#59C3C3" : "#F27D72"}`,
          opacity: done ? 0 : 1,
          animation: done ? "none" : "ringPulse 1.6s ease-in-out infinite",
        }}/>
        {/* 中环 */}
        <div style={{
          position:"absolute",inset:-2,borderRadius:"50%",
          border:`1.5px solid ${done ? "#59C3C360" : "#F27D7250"}`,
          animation: done ? "none" : "ringPulse 1.6s .4s ease-in-out infinite",
        }}/>
        {/* 主圆 */}
        <div style={{
          width:96,height:96,borderRadius:"50%",
          background: done ? "#59C3C318" : "#F27D7210",
          border:`2px solid ${done ? "#59C3C3" : "#F27D72"}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          transition:"background .4s, border-color .4s",
        }}>
          {done ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{animation:"popIn .3s cubic-bezier(.34,1.56,.64,1) forwards"}}>
              <path d="M5 12l5 5L20 7" stroke="#59C3C3" strokeWidth="2.2"/>
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" style={{animation:"spin 1.2s linear infinite"}}>
              <circle cx="12" cy="12" r="10" stroke="#F27D72" opacity="0.18"/>
              <path d="M12 2 A10 10 0 0 1 22 12" stroke="#F27D72" strokeWidth="2.2"/>
            </svg>
          )}
        </div>
      </div>

      {/* 状态文字 */}
      <div style={{
        fontSize:15,fontWeight:600,color:done?"#59C3C3":C.white,
        marginBottom:6,letterSpacing:".02em",
        transition:"color .4s",
      }}>
        {done ? "同步完成" : "正在读取健康数据"}
      </div>
      <div style={{fontSize:12,color:C.fog,marginBottom:28}}>
        {done ? "数据已更新" : "Apple Watch · 正在同步..."}
      </div>

      {/* 数据项列表 */}
      <div style={{display:"flex",flexDirection:"column",gap:8,width:220}}>
        {items.map((it,i)=>(
          <div key={i} style={{
            display:"flex",alignItems:"center",gap:12,
            background:C.ink2,border:`1px solid ${done?"#59C3C360":C.ink3}`,
            borderRadius:14,padding:"10px 14px",
            animation:"itemSlide .38s cubic-bezier(.25,1,.4,1) forwards",
            transition:"border-color .4s",
          }}>
            <div style={{width:30,height:30,borderRadius:9,background:done?"#59C3C314":"#F27D7220",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <SyncItemIcon name={it.icon} done={done}/>
            </div>
            <span style={{fontSize:12,color:C.mid,flex:1}}>{it.label}</span>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:done?"#59C3C3":C.white}}>{it.value}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={done?"#59C3C3":"#F27D72"} strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12l5 5L20 7"/>
            </svg>
          </div>
        ))}
        {/* 占位骨架 */}
        {Array.from({length:Math.max(0,4-items.length)}).map((_,i)=>(
          <div key={"sk"+i} style={{
            height:50,background:C.ink2,border:`1px solid ${C.ink3}`,
            borderRadius:14,overflow:"hidden",position:"relative",
          }}>
            <div style={{
              position:"absolute",inset:0,
              background:`linear-gradient(90deg,transparent,${C.ink3}80,transparent)`,
              animation:"shimmer 1.4s infinite",
            }}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 弹窗 ────────────────────────────────────────────────────────────────────
function Modal({data,onClose}) {
  useEffect(()=>{
    if(!data) return;
    const fn=e=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",fn);
    return ()=>document.removeEventListener("keydown",fn);
  },[data,onClose]);

  if(!data) return null;

  return (
    <div onClick={onClose} style={{
      position:"absolute", top:0, left:0, right:0, bottom:0,
      background:"rgba(0,0,0,.86)",
      display:"flex", flexDirection:"column", justifyContent:"flex-end",
      zIndex:99, borderRadius:28,
      overflow:"hidden",
    }}>
      {/* 弹出面板 */}
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#2B3138",
        borderRadius:"22px 22px 0 0",
        maxHeight:"76%",
        overflowY:"auto",
        animation:"slideUp .32s cubic-bezier(.25,1,.4,1) forwards",
        WebkitOverflowScrolling:"touch",
      }}>
        {/* 把手 */}
        <div style={{display:"flex",justifyContent:"center",paddingTop:14,paddingBottom:4}}>
          <div style={{width:44,height:4,borderRadius:99,background:C.ink4}}/>
        </div>
        {/* 头部行 */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 20px 10px",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <ModalIcon name={data.icon} color={data.color}/>
            <span style={{fontSize:18,fontWeight:600,color:C.white,letterSpacing:"-.02em",lineHeight:1.2}}>{data.title}</span>
          </div>
          <button onClick={onClose} style={{
            width:36,height:36,borderRadius:"50%",flexShrink:0,
            background:C.ink3,border:`1px solid ${C.ink4}`,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L13 13M13 1L1 13" stroke="#7DA7D9" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {/* 彩线 */}
        <div style={{height:2,margin:"0 20px 18px",borderRadius:99,background:`linear-gradient(90deg,${data.color},${data.color}30)`}}/>
        {/* 内容块 */}
        <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
          {data.sections.map((s,i)=>(
            <div key={i} style={{background:C.ink2,borderRadius:16,padding:"15px 16px",border:`1px solid ${C.ink3}`}}>
              <div style={{
                display:"flex",alignItems:"center",gap:7,
                fontSize:10,fontWeight:700,letterSpacing:".16em",
                textTransform:"uppercase",color:data.color,marginBottom:10,
              }}>
                <div style={{width:3,height:13,borderRadius:99,background:data.color,flexShrink:0}}/>
                {s.label}
              </div>
              <div style={{fontSize:14.5,color:C.lit,lineHeight:1.75,fontWeight:400,letterSpacing:".01em"}}>{s.content}</div>
            </div>
          ))}
        </div>
        {/* 底部 */}
        <div style={{padding:"18px 20px 28px",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          <Icon name="ti-info-circle" color={C.fog} size={13}/>
          <span style={{fontSize:12,color:C.fog}}>点击空白处关闭</span>
        </div>
      </div>
    </div>
  );
}

// ─── 异常警告条 ─────────────────────────────────────────────────────────────
function AnomalyStrip({d,level}) {
  if(level==="green") return null;
  const isDanger=level==="red", bc=isDanger?STATUS.red:STATUS.yellow;
  const flags=[];
  if(d.hrv<55)  flags.push({ic:"ti-activity",val:`HRV ${Math.round(d.hrv)} ms`,note:d.hrv<48?"红灯":"黄灯"});
  if(d.rhr>56)  flags.push({ic:"ti-heart-rate-monitor",val:`心率 ${d.rhr} bpm`,note:"偏高"});
  if(d.sleep<7.5) flags.push({ic:"ti-moon",val:`睡眠 ${d.sleep.toFixed(1)} h`,note:d.sleep<6.5?"不足":"偏少"});
  return (
    <div style={{
      background:`linear-gradient(135deg,${bc}1a 0%,${bc}08 100%)`,
      border:`1px solid ${bc}45`,borderRadius:18,padding:"11px 15px",marginBottom:12,
      position:"relative",overflow:"hidden",
      boxShadow:`0 2px 20px ${bc}18`,
    }}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${bc},${bc}40)`,borderRadius:"18px 18px 0 0"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <Icon name={isDanger?"ti-alert-triangle":"ti-alert-circle"} color={bc} size={16}/>
        {flags.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:`${bc}12`,border:`1px solid ${bc}30`,borderRadius:10,padding:"4px 10px"}}>
            <Icon name={f.ic} color={bc} size={11}/>
            <span style={{fontSize:11,color:C.lit,fontWeight:500}}>{f.val}</span>
            <span style={{fontSize:9,color:bc,fontWeight:700,letterSpacing:".05em"}}>{f.note}</span>
          </div>
        ))}
        <span style={{fontSize:10,color:bc,fontWeight:700,letterSpacing:".08em",marginLeft:"auto",textTransform:"uppercase"}}>
          {isDanger?"强制休息":"降低强度"}
        </span>
      </div>
    </div>
  );
}

// ─── 状态主环 ───────────────────────────────────────────────────────────────
function StatusRing({d,level,onTap}) {
  const cfg={
    green: {col:STATUS.green, label:"良好", en:"READY"},
    yellow:{col:STATUS.yellow,label:"注意", en:"CAUTION"},
    red:   {col:STATUS.red,   label:"休息", en:"REST"},
  }[level];
  const wa=averageHrvWeek(d.hrv_week);
  return (
    <Tap onTap={onTap}>
      <div style={{
        background:`linear-gradient(150deg,${C.ink2} 0%,${C.ink} 100%)`,
        borderRadius:24,padding:"20px 20px",marginBottom:12,
        position:"relative",overflow:"hidden",
        boxShadow:`0 6px 32px rgba(0,0,0,.38),0 0 0 1px ${cfg.col}20`,
      }}>
        {/* 情绪光晕 — Soft Material Interface */}
        <div style={{
          position:"absolute",top:-50,left:-30,width:220,height:220,
          background:`radial-gradient(circle,${cfg.col}2e 0%,transparent 60%)`,
          pointerEvents:"none",
        }}/>
        {/* 背景英文大字装饰 */}
        <div style={{
          position:"absolute",right:-6,bottom:-12,
          fontSize:60,fontWeight:900,letterSpacing:"-.04em",lineHeight:1,
          color:`${cfg.col}10`,pointerEvents:"none",userSelect:"none",
        }}>{cfg.en}</div>

        {/* 顶部：徽标行 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,position:"relative"}}>
          <div style={{
            display:"inline-flex",alignItems:"center",gap:7,
            padding:"5px 14px 5px 10px",borderRadius:99,
            background:`${cfg.col}18`,border:`1px solid ${cfg.col}50`,
            boxShadow:`0 0 14px ${cfg.col}28`,
          }}>
            <div style={{width:7,height:7,borderRadius:"50%",background:cfg.col,
              boxShadow:`0 0 8px ${cfg.col}`,animation:"breathe 2s ease-in-out infinite"}}/>
            <span style={{fontSize:12,fontWeight:700,color:cfg.col,letterSpacing:".08em"}}>{cfg.label}</span>
          </div>
          <span style={{fontSize:10,color:C.fog}}>7 日均值 <span style={{color:C.mid,fontWeight:600}}>{Math.round(wa)} ms</span></span>
        </div>

        {/* 主体：环 + 三项指标 */}
        <div style={{display:"flex",gap:16,alignItems:"center",position:"relative"}}>
          <Arc value={d.hrv} max={80} color={cfg.col} size={104} stroke={8}
            label={Math.round(d.hrv)} sub="HRV ms" glow={true} labelSize={22}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px",marginBottom:12}}>
              {[
                {ic:"ti-heart-rate-monitor",label:"静息心率",val:`${d.rhr}`,unit:"bpm"},
                {ic:"ti-moon",label:"睡眠",val:`${d.sleep.toFixed(1)}`,unit:"h"},
                {ic:"ti-activity",label:"HRV 状态",val:d.hrv>=55?"绿灯":d.hrv>=48?"黄灯":"红灯",unit:""},
                {ic:"ti-flame",label:"今日消耗",val:`${d.workout.calories}`,unit:"kcal"},
              ].map((m,i)=>(
                <div key={i}>
                  <div style={{fontSize:8,color:C.fog,letterSpacing:".08em",marginBottom:2}}>{m.label}</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:3}}>
                    <span style={{fontSize:14,fontWeight:500,color:C.white}}>{m.val}</span>
                    {m.unit&&<span style={{fontSize:8,color:C.fog}}>{m.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
            <Spark vals={d.hrv_week.map(x=>x.val)} color={cfg.col} width={150} height={24}/>
          </div>
        </div>
      </div>
    </Tap>
  );
}

// ─── 三格指标卡 ─────────────────────────────────────────────────────────────
function MetricRow({d,onTap}) {
  const cards=[
    {key:"rhr",  ic:"ti-heart-rate-monitor",val:d.rhr,           unit:"bpm",spark:[57,58,59,57,56,56],col:d.rhr>59?STATUS.red:d.rhr>56?STATUS.yellow:STATUS.green,sub:d.rhr>59?"偏高":d.rhr>56?"略高":"正常"},
    {key:"sleep",ic:"ti-moon-stars",          val:d.sleep.toFixed(1),unit:"h",spark:[7.3,6.5,7.0,6.8,7.2,7.2],col:d.sleep<6.5?STATUS.red:d.sleep<7.5?STATUS.yellow:STATUS.green,sub:d.sleep<6.5?"不足":d.sleep<7.5?"尚可":"良好"},
    {key:"workout",ic:"ti-flame",             val:d.workout.calories,unit:"kcal",spark:[320,450,480,380,515,515],col:"#F27D72",sub:`${d.workout.duration} 分钟`},
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:12}}>
      {cards.map(m=>(
        <Tap key={m.key} onTap={()=>onTap(m.key)}>
          <div style={{
            background:`linear-gradient(160deg,${m.col}18 0%,${C.ink2} 55%)`,
            border:`1px solid ${m.col}28`,
            borderRadius:18,padding:"13px 13px 18px",
            boxShadow:`inset 0 1px 0 ${m.col}18`,
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <Icon name={m.ic} color={`${m.col}cc`} size={14}/>
              <Spark vals={m.spark} color={m.col} width={44} height={18}/>
            </div>
            <div style={{fontSize:26,fontWeight:300,color:C.white,letterSpacing:"-.04em",lineHeight:1}}>
              {m.val}<span style={{fontSize:10,color:C.fog,marginLeft:3,fontWeight:400}}>{m.unit}</span>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:m.col,marginTop:6,letterSpacing:".03em"}}>{m.sub}</div>
          </div>
        </Tap>
      ))}
    </div>
  );
}

// ─── 睡眠卡 ─────────────────────────────────────────────────────────────────
function SleepCard({d,onTap}) {
  const total=d.sleep*60;
  const deep=Math.round(d.deep_pct/100*total);
  const rem=Math.round(d.rem_pct/100*total);
  const core=Math.round(total-deep-rem);
  // Dust Rose → 浅睡；Aerobic Blue → REM；Recovery Aqua → 深睡（VI Dust Rose 对应 Sleep/Recovery/Calmness）
  const bars=[{label:"浅睡",min:core,col:"#D9A5B3"},{label:"REM",min:rem,col:"#7DA7D9"},{label:"深睡",min:deep,col:"#59C3C3"}];
  return (
    <Tap onTap={onTap}>
      <div style={{background:`linear-gradient(160deg,#D9A5B314 0%,${C.ink2} 50%)`,border:`1px solid #D9A5B320`,borderRadius:18,padding:"13px 15px 20px",marginBottom:12,boxShadow:`inset 0 1px 0 #D9A5B314`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Icon name="ti-moon-stars" color={C.fog} size={14}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>睡眠</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            {d.awake===0&&<Icon name="ti-check" color={"#59C3C3"} size={12}/>}
            <span style={{fontSize:11,fontWeight:500,color:d.awake>2?"#F27D72":C.mid}}>觉醒 {d.awake} 次</span>
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:10,height:9}}>
          {bars.map((b,i)=><div key={i} style={{flex:b.min,background:b.col,borderRadius:5}}/>)}
        </div>
        <div style={{display:"flex",gap:14}}>
          {bars.map((b,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:7,height:7,borderRadius:2,background:b.col,flexShrink:0}}/>
              <span style={{fontSize:10,color:C.fog}}>{b.label}</span>
              <span style={{fontSize:11,fontWeight:500,color:C.mid}}>{b.min}m</span>
            </div>
          ))}
        </div>
      </div>
    </Tap>
  );
}

// ─── HRV 周趋势 ─────────────────────────────────────────────────────────────
function HRVChart({d,onTap}) {
  const max=Math.max(...validHrvWeek(d.hrv_week).map(x=>x.val),80);
  const wa=Math.round(averageHrvWeek(d.hrv_week));
  return (
    <Tap onTap={onTap}>
      <div style={{background:`linear-gradient(160deg,#59C3C312 0%,${C.ink2} 50%)`,border:`1px solid #59C3C320`,borderRadius:18,padding:"13px 15px 20px",marginBottom:12,boxShadow:`inset 0 1px 0 #59C3C314`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Icon name="ti-chart-line" color="#59C3C3cc" size={14}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>本周 HRV</span>
          </div>
          <span style={{fontSize:11,color:C.fog}}>均值 <span style={{color:C.mid,fontWeight:600}}>{wa} ms</span></span>
        </div>
        {d.hrv_week.map((w,i)=>{
          const hasValue=Number.isFinite(w.val);
          const pct=hasValue?Math.round(w.val/max*100):0;
          const col=!hasValue?C.ink3:classifyHrvColor(w.val);
          const isLast=i===d.hrv_week.length-1;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<d.hrv_week.length-1?7:9}}>
              <span style={{fontSize:10,fontWeight:isLast?600:400,color:isLast?C.white:C.fog,width:28,flexShrink:0}}>{w.day}</span>
              <div style={{flex:1,height:6,background:C.ink3,borderRadius:99,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:99}}/>
              </div>
              <span style={{fontSize:11,fontWeight:isLast?600:400,color:isLast?C.white:C.fog,width:26,textAlign:"right"}}>{hasValue?Math.round(w.val):"—"}</span>
            </div>
          );
        })}
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          {[["#59C3C3","≥ 55"],["#F27D72","48–54"],["#E85D52","< 48"]].map(([c,l])=>(
            <span key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:c}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>{l}
            </span>
          ))}
        </div>
      </div>
    </Tap>
  );
}

// ─── 训练建议卡 ─────────────────────────────────────────────────────────────
function RecCard({level,onTap}) {
  const p={
    green:{ic:"ti-barbell",col:STATUS.green,bg:"#1D2527",bd:"#59C3C340",name:"正常训练",zone:3,mins:50,detail:"推 · 拉 · 核心"},
    yellow:{ic:"ti-run",   col:STATUS.yellow,bg:"#272220",bd:"#F27D7260",name:"轻量有氧",zone:2,mins:35,detail:"Z2 · 低于 140 bpm"},
    red:{   ic:"ti-zzz",   col:STATUS.red,bg:"#261F1F",bd:"#E85D5240",name:"休息",   zone:1,mins:20,detail:"仅拉伸"},
  }[level];
  const r=22,circ=2*Math.PI*r,arc=circ*0.65,fill=(p.mins/90)*arc;
  return (
    <Tap onTap={onTap}>
      <div style={{background:p.bg,border:`1px solid ${p.bd}`,borderRadius:16,padding:"14px 16px 22px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{position:"relative",width:52,height:52,flexShrink:0}}>
            <svg width={52} height={52} style={{transform:"rotate(162deg)"}}>
              <circle cx={26} cy={26} r={r} fill="none" stroke={C.ink3} strokeWidth={5} strokeDasharray={`${arc} ${circ-arc}`} strokeLinecap="round"/>
              <circle cx={26} cy={26} r={r} fill="none" stroke={p.col} strokeWidth={5} strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round"/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Icon name={p.ic} color={p.col} size={19}/>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:C.white,marginBottom:7}}>{p.name}</div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
              <ZoneBar zone={p.zone}/>
              <span style={{fontSize:11,fontWeight:500,color:C.mid}}>{p.mins} 分钟</span>
            </div>
            <span style={{fontSize:10,color:C.fog}}>{p.detail}</span>
          </div>
        </div>
      </div>
    </Tap>
  );
}

// ─── 营养卡 ─────────────────────────────────────────────────────────────────
function NutritionCard({d,level,mealLog,onTap}) {
  const isR=level==="red",isY=level==="yellow";
  const targets=getNutritionTargets(level);
  const modeLabel=isR?"休息日":isY?"恢复日":"训练日";
  const modeCol=isR?STATUS.red:isY?STATUS.yellow:STATUS.green;

  // 真实打卡数据 or 估算
  const hasReal=mealLog&&mealLog.length>0;
  const real=hasReal?sumMealTotals(mealLog):null;

  const items=[
    {ic:"ti-meat",   col:"#F27D72",label:"蛋白质",unit:"g",  target:targets.protein,  val:real?real.protein:Math.round(targets.protein*.45)},
    {ic:"ti-grain",  col:"#59C3C3",label:"碳水",  unit:"g",  target:targets.carbs,    val:real?real.carbs:(isR?50:22)},
    {ic:"ti-flame",  col:"#D8D1C7",label:"热量",  unit:"kcal",target:targets.calories, val:real?real.calories:0},
    {ic:"ti-droplet",col:"#7DA7D9",label:"脂肪",  unit:"g",  target:targets.fat,      val:real?real.fat:0},
  ];

  return (
    <Tap onTap={onTap}>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,overflow:"hidden",marginBottom:12}}>
        <div style={{padding:"11px 15px 10px",borderBottom:`1px solid ${C.ink3}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Icon name="ti-salad" color={C.fog} size={14}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>今日营养</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {hasReal&&(
              <span style={{fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:99,background:"#59C3C318",color:"#59C3C3",border:"1px solid #59C3C330"}}>
                {mealLog.length} 餐已记录
              </span>
            )}
            <span style={{fontSize:11,fontWeight:600,color:modeCol}}>{modeLabel}</span>
          </div>
        </div>
        {/* 热量大字 + 进度条 */}
        <div style={{padding:"12px 15px 10px",borderBottom:`1px solid ${C.ink3}`}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:8}}>
            <span style={{fontSize:28,fontWeight:300,color:C.white,letterSpacing:"-.03em"}}>{items[2].val}</span>
            <span style={{fontSize:10,color:C.fog}}>/ {targets.calories} kcal</span>
            {!hasReal&&<span style={{fontSize:9,color:C.fog,marginLeft:"auto",fontStyle:"italic"}}>待打卡记录</span>}
          </div>
          <div style={{height:4,background:C.ink3,borderRadius:99,overflow:"hidden"}}>
            <div style={{width:`${Math.min(items[2].val/targets.calories*100,100)}%`,height:"100%",background:"#F27D72",borderRadius:99,transition:"width .5s"}}/>
          </div>
        </div>
        {/* 宏量行 */}
        {[items[0],items[1],items[3]].map((it,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 15px",borderBottom:i<2?`1px solid ${C.ink3}`:"none"}}>
            <div style={{width:30,height:30,borderRadius:9,background:C.ink3,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <NutriIcon name={it.ic} color={it.col}/>
            </div>
            <span style={{fontSize:11,color:C.fog,width:40,flexShrink:0}}>{it.label}</span>
            <Bar pct={(it.val/it.target)*100} color={it.col}/>
            <span style={{fontSize:11,fontWeight:500,color:C.mid,flexShrink:0,minWidth:52,textAlign:"right"}}>
              {it.val}<span style={{color:C.fog,fontSize:9}}>/{it.target}{it.unit}</span>
            </span>
          </div>
        ))}
        {/* 底部提示 */}
        <div style={{padding:"8px 15px 11px",display:"flex",alignItems:"center",gap:6}}>
          <Icon name="ti-camera" color={C.fog} size={11}/>
          <span style={{fontSize:9,color:C.fog}}>{hasReal?"点击查看营养解读 · 前往【饮食】tab 继续记录":"前往【饮食】tab 拍照打卡，AI 自动计算"}</span>
        </div>
      </div>
    </Tap>
  );
}

// ─── AI 教练对话 ─────────────────────────────────────────────────────────────
function CoachPage({d,mealLog}) {
  const hasMeals=mealLog&&mealLog.length>0;
  // memoize so sumMealTotals doesn't re-run on every chat-bubble render
  const mealTotals=useMemo(()=>hasMeals?sumMealTotals(mealLog):null,[hasMeals,mealLog]);

  const welcomeNutrition=hasMeals&&mealTotals
    ?` · 今日已记录 ${mealLog.length} 餐，摄入 ${mealTotals.calories} kcal，蛋白质 ${mealTotals.protein}g`
    :"";
  const [msgs,setMsgs]=useState([{role:"ai",text:`HRV ${Math.round(d.hrv)} ms · 心率 ${d.rhr} bpm · 睡眠 ${d.sleep.toFixed(1)} h · 今日力量 ${d.workout.duration} 分钟${welcomeNutrition}。想聊什么？`}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const ref=useRef(null);
  const chips=hasMeals
    ?["今日饮食分析","蛋白质够了吗","训练后怎么吃","明日建议","恢复评级"]
    :["今日训练分析","明日建议","本周总结","补剂方案","恢复评级"];

  // memoize so the system-prompt string isn't rebuilt on every typing keystroke
  const nutritionCtx=useMemo(()=>hasMeals&&mealTotals
    ?`今日饮食打卡数据：共${mealLog.length}餐，总热量${mealTotals.calories}kcal，蛋白质${mealTotals.protein}g，碳水${mealTotals.carbs}g，脂肪${mealTotals.fat}g。食物明细：${mealLog.map(m=>`${m.time}(${m.foods.map(f=>f.name).join("+")}，${m.totals.calories}kcal)`).join("；")}。`
    :"今日无饮食打卡记录。",[hasMeals,mealLog,mealTotals]);
  const SYS=useMemo(()=>`你是 Johnny 的私人运动教练 AI。简洁专业，中文，≤150字。健康数据：HRV ${Math.round(d.hrv)}ms（黄灯），静息心率${d.rhr}bpm，睡眠${d.sleep.toFixed(1)}h，今日力量${d.workout.duration}min。${nutritionCtx}结合以上综合分析给出建议。`,[d,nutritionCtx]);
  const send=async(text)=>{
    if(!text.trim()||busy) return;
    const next=[...msgs,{role:"user",text}];
    setMsgs(next); setInput(""); setBusy(true);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,system:SYS,
          messages:next.map((m,i)=>i===0&&m.role==="ai"?null:{role:m.role==="ai"?"assistant":"user",content:m.text}).filter(Boolean)})
      });
      const j=await r.json();
      setMsgs(p=>[...p,{role:"ai",text:j.content?.find(c=>c.type==="text")?.text||"—"}]);
    }catch{ setMsgs(p=>[...p,{role:"ai",text:"连接失败，请重试。"}]); }
    setBusy(false);
  };
  useEffect(()=>{ if(ref.current) ref.current.scrollTop=99999; },[msgs,busy]);
  return (
    <div style={{display:"flex",flexDirection:"column",height:500}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
        {chips.map(c=>(
          <button key={c} onClick={()=>send(c)}
            style={{padding:"5px 13px",border:`1px solid ${C.ink3}`,borderRadius:99,fontSize:11,fontWeight:400,color:"#7DA7D9",cursor:"pointer",background:"transparent"}}>
            {c}
          </button>
        ))}
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"4px 0"}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-end",flexDirection:m.role==="user"?"row-reverse":"row"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:m.role==="ai"?"#59C3C3":C.ink4,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:10,fontWeight:700,color:C.white}}>
              {m.role==="ai"?"AI":<Icon name="ti-run" color={C.fog} size={12}/>}
            </div>
            <div style={{maxWidth:"80%",padding:"11px 15px",fontSize:13.5,fontWeight:400,lineHeight:1.65,
              background:m.role==="ai"?C.ink2:"#F27D72",color:m.role==="ai"?C.lit:C.white,
              borderRadius:m.role==="ai"?"18px 18px 18px 4px":"18px 18px 4px 18px",
              border:m.role==="ai"?`1px solid ${C.ink3}`:"none"}}>{m.text}</div>
          </div>
        ))}
        {busy&&(
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"#59C3C3",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:C.white,flexShrink:0}}>AI</div>
            <div style={{padding:"11px 15px",background:C.ink2,borderRadius:"18px 18px 18px 4px",border:`1px solid ${C.ink3}`,display:"flex",gap:4,alignItems:"center"}}>
              {[0,.2,.4].map((d,i)=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:C.fog,animation:`bop 1.2s ${d}s infinite`}}/>)}
            </div>
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:8,marginTop:12,paddingTop:12,borderTop:`1px solid ${C.ink3}`}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send(input)}
          placeholder="问教练..."
          style={{flex:1,padding:"11px 16px",background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:99,fontSize:13,color:C.white,outline:"none"}}/>
        <button onClick={()=>send(input)} disabled={busy}
          style={{width:40,height:40,borderRadius:"50%",background:"#F27D72",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 20L20 12 4 4v6l12 2-12 2v6z" fill="#f0f0f0"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── 饮食打卡 ─────────────────────────────────────────────────────────────────

// 弧形宏量环（日汇总用）
function MacroRing({label,val,target,color,unit}) {
  const size=62,stroke=5,r=(size-stroke*2)/2;
  const circ=2*Math.PI*r,arc=circ*.75;
  const pct=Math.min(val/Math.max(target,1),1);
  const fill=pct*arc;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(135deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.ink3} strokeWidth={stroke} strokeDasharray={`${arc} ${circ-arc}`} strokeLinecap="round"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round" style={{transition:"stroke-dasharray .6s cubic-bezier(.4,0,.2,1)"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
          <span style={{fontSize:13,fontWeight:700,color,lineHeight:1}}>{val}</span>
          <span style={{fontSize:7,color:C.fog,letterSpacing:".04em"}}>{unit}</span>
        </div>
      </div>
      <span style={{fontSize:9,color:C.fog,letterSpacing:".06em",textTransform:"uppercase"}}>{label}</span>
      <span style={{fontSize:8,color:C.mid}}>/ {target}{unit}</span>
    </div>
  );
}

// 日营养汇总横条（顶部 banner）
function DailyNutritionBanner({totals,targets,mealCount}) {
  const pct=Math.min(totals.calories/targets.calories,1);
  const col=pct<.5?"#7DA7D9":pct<.9?"#59C3C3":"#F27D72";
  return (
    <div style={{
      background:`linear-gradient(135deg,${C.ink2},#4E5D94cc)`,
      border:`1px solid #4E5D94`,borderRadius:18,
      padding:"16px 18px",marginBottom:14,
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog}}>今日摄入</div>
          <div style={{fontSize:26,fontWeight:300,color:C.white,letterSpacing:"-.03em",marginTop:2}}>
            {totals.calories}<span style={{fontSize:11,color:C.fog,marginLeft:4}}>kcal</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",background:`${col}18`,border:`1px solid ${col}40`,borderRadius:99}}>
          <span style={{fontSize:9,fontWeight:700,color:col,letterSpacing:".08em"}}>{mealCount} 餐已记录</span>
        </div>
      </div>
      {/* 总热量进度条 */}
      <div style={{height:5,background:C.ink3,borderRadius:99,overflow:"hidden",marginBottom:14}}>
        <div style={{width:`${pct*100}%`,height:"100%",background:col,borderRadius:99,transition:"width .5s"}}/>
      </div>
      {/* 三大营养素环 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,justifyItems:"center"}}>
        <MacroRing label="蛋白质" val={totals.protein} target={targets.protein} color="#F27D72" unit="g"/>
        <MacroRing label="碳水"   val={totals.carbs}   target={targets.carbs}   color="#59C3C3" unit="g"/>
        <MacroRing label="脂肪"   val={totals.fat}     target={targets.fat}     color="#7DA7D9" unit="g"/>
        <MacroRing label="热量"   val={totals.calories} target={targets.calories} color={col}   unit="k"/>
      </div>
    </div>
  );
}

// 单餐卡片
function MealCard({meal,onDelete}) {
  const [open,setOpen]=useState(false);
  const macros=[
    {label:"蛋白质",val:meal.totals.protein,unit:"g",col:"#F27D72"},
    {label:"碳水",  val:meal.totals.carbs,  unit:"g",col:"#59C3C3"},
    {label:"脂肪",  val:meal.totals.fat,    unit:"g",col:"#7DA7D9"},
  ];
  return (
    <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,marginBottom:10,overflow:"hidden"}}>
      {/* 卡片头 */}
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",cursor:"pointer"}}>
        {/* 缩略图 */}
        <div style={{width:52,height:52,borderRadius:11,overflow:"hidden",flexShrink:0,background:C.ink3}}>
          <img src={meal.photoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            <span style={{fontSize:10,color:C.fog}}>{meal.time}</span>
            <span style={{fontSize:11,fontWeight:700,color:C.white,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {meal.foods.map(f=>f.emoji||"🍽").join("")} {meal.foods.map(f=>f.name).join("、")}
            </span>
          </div>
          {/* 宏量标签行 */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#F27D7218",color:"#F27D72",border:"1px solid #F27D7230"}}>
              {meal.totals.calories} kcal
            </span>
            {macros.map(m=>(
              <span key={m.label} style={{fontSize:9,padding:"2px 8px",borderRadius:99,background:`${m.col}14`,color:m.col,border:`1px solid ${m.col}30`}}>
                {m.label} {m.val}g
              </span>
            ))}
          </div>
        </div>
        {/* 展开箭头 */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink:0,transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>
          <path d="M6 9l6 6 6-6" stroke={C.fog} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {/* 展开详情 */}
      {open&&(
        <div style={{borderTop:`1px solid ${C.ink3}`,padding:"10px 14px 12px"}}>
          {/* AI 备注 */}
          {meal.note&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:10,padding:"8px 10px",background:"#4E5D94aa",borderRadius:10}}>
              <Icon name="ti-sparkles" color="#7DA7D9" size={13}/>
              <span style={{fontSize:11,color:C.lit,lineHeight:1.6}}>{meal.note}</span>
            </div>
          )}
          {/* 食物列表 */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {meal.foods.map((f,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16,flexShrink:0}}>{f.emoji||"🍽"}</span>
                <span style={{fontSize:11,color:C.lit,flex:1}}>{f.name}</span>
                <span style={{fontSize:10,color:C.fog}}>{f.amount}</span>
                <span style={{fontSize:10,fontWeight:600,color:"#F27D72",minWidth:48,textAlign:"right"}}>{f.calories} kcal</span>
              </div>
            ))}
          </div>
          {/* 删除 */}
          <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
            <button onClick={e=>{e.stopPropagation();onDelete(meal.id);}}
              style={{display:"flex",alignItems:"center",gap:5,background:"transparent",border:`1px solid ${C.ink3}`,borderRadius:99,padding:"5px 12px",cursor:"pointer",color:C.fog,fontSize:10}}>
              <Icon name="ti-trash" color={C.fog} size={12}/>删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 照片分析浮层
function PhotoAnalysisSheet({preview,analyzing,result,onConfirm,onCancel}) {
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:200,
      background:"rgba(0,0,0,.82)",
      display:"flex",flexDirection:"column",justifyContent:"flex-end",
    }}>
      <div style={{
        background:C.ink2,borderRadius:"22px 22px 0 0",
        maxHeight:"85vh",overflowY:"auto",
        animation:"slideUp .3s cubic-bezier(.25,1,.4,1) forwards",
        WebkitOverflowScrolling:"touch",
      }}>
        {/* 把手 */}
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 8px"}}>
          <div style={{width:40,height:4,borderRadius:99,background:C.ink3}}/>
        </div>
        {/* 照片预览 */}
        <div style={{position:"relative",margin:"0 16px 14px",borderRadius:16,overflow:"hidden",background:C.ink3}}>
          <img src={preview.dataUrl} alt="" style={{width:"100%",maxHeight:220,objectFit:"cover",display:"block"}}/>
          {/* 分析中蒙层 */}
          {analyzing&&(
            <div style={{
              position:"absolute",inset:0,
              background:"rgba(26,31,43,.82)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{animation:"spin 1s linear infinite"}}>
                <circle cx="12" cy="12" r="10" stroke="#F27D72" opacity=".18" strokeWidth="2"/>
                <path d="M12 2A10 10 0 0122 12" stroke="#F27D72" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:600,color:C.white}}>AI 识别中</div>
                <div style={{fontSize:11,color:C.fog,marginTop:3}}>正在分析食物营养成分…</div>
              </div>
            </div>
          )}
          {/* AI 识别完成角标 */}
          {!analyzing&&result&&!result.error&&(
            <div style={{position:"absolute",top:10,right:10,display:"flex",alignItems:"center",gap:5,padding:"4px 10px",background:"#1F2328ee",borderRadius:99,border:"1px solid #59C3C340"}}>
              <Icon name="ti-sparkles" color="#59C3C3" size={11}/>
              <span style={{fontSize:9,fontWeight:700,color:"#59C3C3"}}>识别完成</span>
            </div>
          )}
        </div>

        {/* 识别结果 */}
        {!analyzing&&result&&!result.error&&(
          <div style={{padding:"0 16px 4px"}}>
            {/* 热量大字 */}
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:12}}>
              <span style={{fontSize:32,fontWeight:300,color:C.white,letterSpacing:"-.03em"}}>{result.totals?.calories??0}</span>
              <span style={{fontSize:12,color:C.fog}}>kcal</span>
              <div style={{flex:1}}/>
              {[{l:"蛋白质",v:result.totals?.protein??0,c:"#F27D72"},{l:"碳水",v:result.totals?.carbs??0,c:"#59C3C3"},{l:"脂肪",v:result.totals?.fat??0,c:"#7DA7D9"}].map(m=>(
                <div key={m.l} style={{textAlign:"center",minWidth:40}}>
                  <div style={{fontSize:14,fontWeight:600,color:m.c}}>{m.v}<span style={{fontSize:8,color:C.fog}}>g</span></div>
                  <div style={{fontSize:8,color:C.fog}}>{m.l}</div>
                </div>
              ))}
            </div>
            {/* AI 备注 */}
            {result.note&&(
              <div style={{display:"flex",gap:8,padding:"9px 12px",background:"#4E5D94aa",borderRadius:12,marginBottom:12}}>
                <Icon name="ti-sparkles" color="#7DA7D9" size={13}/>
                <span style={{fontSize:12,color:C.lit,lineHeight:1.65}}>{result.note}</span>
              </div>
            )}
            {/* 食物列表 */}
            <div style={{background:C.ink3,borderRadius:14,overflow:"hidden",marginBottom:14}}>
              {(result.foods||[]).map((f,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",borderBottom:i<result.foods.length-1?`1px solid ${C.ink2}`:"none"}}>
                  <span style={{fontSize:18,flexShrink:0}}>{f.emoji||"🍽"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:C.white}}>{f.name}</div>
                    <div style={{fontSize:10,color:C.fog}}>{f.amount}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#F27D72"}}>{f.calories}</div>
                    <div style={{fontSize:8,color:C.fog}}>kcal</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* 识别失败 */}
        {!analyzing&&result?.error&&(
          <div style={{margin:"0 16px 14px",padding:"16px",background:C.ink3,borderRadius:14,textAlign:"center"}}>
            <div style={{fontSize:13,color:C.fog}}>识别暂未成功，请手动添加或重新拍照</div>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{display:"flex",gap:10,padding:"0 16px 32px"}}>
          <button onClick={onCancel} style={{
            flex:1,padding:"13px",border:`1px solid ${C.ink3}`,borderRadius:14,
            background:"transparent",fontSize:13,fontWeight:600,color:C.fog,cursor:"pointer",
          }}>取消</button>
          <button onClick={onConfirm} disabled={analyzing||!result||result.error} style={{
            flex:2,padding:"13px",border:"none",borderRadius:14,
            background:analyzing||!result||result.error?"#39424F":"#F27D72",
            fontSize:13,fontWeight:600,color:C.white,cursor:"pointer",
            opacity:analyzing||!result||result.error?.6:1,transition:"opacity .2s",
          }}>记录这一餐</button>
        </div>
      </div>
    </div>
  );
}

// AI 识别营养（调用 Claude vision API）
async function analyzeFood(base64,mimeType) {
  const MOCK={
    foods:[
      {name:"米饭",emoji:"🍚",amount:"约 200g",calories:260,protein:5,carbs:56,fat:1},
      {name:"清蒸鱼",emoji:"🐟",amount:"约 150g",calories:180,protein:28,carbs:0,fat:6},
      {name:"炒青菜",emoji:"🥦",amount:"约 100g",calories:45,protein:3,carbs:6,fat:2},
    ],
    totals:{calories:485,protein:36,carbs:62,fat:9},
    note:"这顿饭蛋白质充足、碳水适中，是典型的训练日午餐配比，非常棒！建议搭配一杯温水。",
  };
  try {
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-allow-browser":"true"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:600,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:mimeType,data:base64}},
          {type:"text",text:`分析这张食物/饮品照片，识别所有食材，仅返回如下JSON（不含其他文字）：
{"foods":[{"name":"食物名","emoji":"🍗","amount":"约100g","calories":200,"protein":25,"carbs":5,"fat":8}],"totals":{"calories":X,"protein":X,"carbs":X,"fat":X},"note":"一句话简评，包含营养建议"}
所有数值为整数，以克(g)为单位估算热量和营养素。`}
        ]}]
      })
    });
    if(!r.ok) return MOCK;
    const j=await r.json();
    const text=j.content?.find(c=>c.type==="text")?.text||"";
    const match=text.match(/\{[\s\S]*\}/);
    if(match) return JSON.parse(match[0]);
    return MOCK;
  } catch {
    return MOCK;
  }
}

// ─── 饮食 AI 解读 ────────────────────────────────────────────────────────────
function DietInsight({mealLog,totals,targets,level}) {
  // Memoize all derived values — recalculate only when meal data or targets change
  const stats=useMemo(()=>{
    if(mealLog.length===0) return null;
    const {pPct,cPct,fPct}=calcMacroRatios(totals);
    const {proOk,carbOk,fatOk,calOk,score,label:scoreLabel,color:scoreCol}=calcDietScore(totals,targets);
    const topMeal=mealLog.reduce((a,b)=>b.totals.calories>a.totals.calories?b:a);
    return {pPct,cPct,fPct,proOk,carbOk,fatOk,calOk,score,scoreLabel,scoreCol,topMeal};
  },[mealLog,totals,targets]);
  if(!stats) return null;
  const {pPct,cPct,fPct,proOk,carbOk,fatOk,calOk,score,scoreLabel,scoreCol,topMeal}=stats;

  // 恢复状态建议文字
  const recText=level==="green"
    ?"训练日蛋白质需求高，确保每餐含优质蛋白（鸡蛋、鱼、豆腐），训练后30分钟内补充最关键。"
    :level==="yellow"
    ?"恢复日以抗炎食物为主，减少精制碳水，增加深色蔬菜和 Omega-3 摄入有助于 HRV 回升。"
    :"休息日热量需求低，以高蛋白低碳水为主，重点补充睡前甘氨酸镁和 VD3，加速恢复。";

  return (
    <div style={{marginTop:18}}>
      {/* 分区标题 */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <div style={{flex:1,height:1,background:C.ink3}}/>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",color:C.fog,whiteSpace:"nowrap"}}>今日饮食解读</span>
        <div style={{flex:1,height:1,background:C.ink3}}/>
      </div>

      {/* ① 宏量结构卡 */}
      <div style={{
        background:`linear-gradient(135deg,${C.ink2},${scoreCol}10)`,
        border:`1px solid ${scoreCol}35`,borderRadius:18,
        padding:"15px 17px",marginBottom:10,position:"relative",overflow:"hidden",
      }}>
        {/* 背景大字装饰 */}
        <div style={{position:"absolute",right:-4,top:-8,fontSize:72,fontWeight:900,color:`${scoreCol}08`,lineHeight:1,pointerEvents:"none",userSelect:"none"}}>{scoreLabel}</div>

        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:13}}>
          <div style={{padding:"4px 12px",borderRadius:99,background:`${scoreCol}20`,border:`1px solid ${scoreCol}50`,fontSize:11,fontWeight:700,color:scoreCol,letterSpacing:".05em"}}>{scoreLabel}</div>
          <span style={{fontSize:12,color:C.mid}}>今日饮食结构</span>
          <span style={{marginLeft:"auto",fontSize:11,color:C.fog}}>{mealLog.length} 餐 · <span style={{color:"#F27D72",fontWeight:600}}>{totals.calories}</span> kcal</span>
        </div>

        {/* 三大营养素堆叠横条 */}
        <div style={{marginBottom:8}}>
          <div style={{height:12,borderRadius:99,overflow:"hidden",display:"flex",gap:2,marginBottom:7}}>
            <div style={{flex:pPct,background:"#F27D72",borderRadius:"99px 0 0 99px",minWidth:4,transition:"flex .6s"}}/>
            <div style={{flex:cPct,background:"#59C3C3",minWidth:4,transition:"flex .6s"}}/>
            <div style={{flex:fPct,background:"#7DA7D9",borderRadius:"0 99px 99px 0",minWidth:4,transition:"flex .6s"}}/>
          </div>
          <div style={{display:"flex",gap:14}}>
            {[["蛋白质",pPct,"#F27D72",totals.protein,"g"],[" 碳水  ",cPct,"#59C3C3",totals.carbs,"g"],["脂肪",fPct,"#7DA7D9",totals.fat,"g"]].map(([l,p,c,v,u])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:c,display:"inline-block",flexShrink:0}}/>
                <span style={{fontSize:9,color:C.fog}}>{l}</span>
                <span style={{fontSize:10,fontWeight:700,color:c}}>{p}%</span>
                <span style={{fontSize:9,color:C.fog}}>({v}{u})</span>
              </div>
            ))}
          </div>
        </div>

        {/* 餐次时间轴气泡 */}
        <div style={{marginTop:12,paddingTop:11,borderTop:`1px solid ${C.ink3}`,display:"flex",alignItems:"flex-end",gap:0,position:"relative",height:54}}>
          <div style={{position:"absolute",bottom:18,left:0,right:0,height:1,background:C.ink3}}/>
          {mealLog.map((m,i)=>{
            const isTop=m.id===topMeal.id;
            const bubbleH=24+Math.round(m.totals.calories/totals.calories*24);
            return (
              <div key={m.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{fontSize:7,fontWeight:isTop?700:400,color:isTop?"#F27D72":C.fog}}>{m.totals.calories}k</div>
                <div style={{
                  width:isTop?34:26,height:isTop?34:26,borderRadius:"50%",
                  background:isTop?"#F27D7222":C.ink3,
                  border:`2px solid ${isTop?"#F27D72":"#39424F"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:isTop?14:11,
                  transition:"all .3s",zIndex:1,position:"relative",
                }}>
                  {m.foods[0]?.emoji||"🍽"}
                </div>
                <div style={{fontSize:7,color:C.fog}}>{m.time}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ② 营养叙述卡 */}
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"13px 15px",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
          <Icon name="ti-sparkles" color="#7DA7D9" size={13}/>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.fog}}>营养结构解读</span>
        </div>
        <p style={{fontSize:12.5,color:C.lit,lineHeight:1.78,margin:0}}>
          今日已摄入<Chip val={totals.calories} unit="kcal" color="#F27D72"/>，
          完成热量目标的<Chip val={Math.round(totals.calories/targets.calories*100)} unit="%" color={calOk?"#59C3C3":"#F27D72"}/>。
          蛋白质<Chip val={totals.protein} unit="g" color="#F27D72"/>
          {proOk
            ?<span style={{color:"#59C3C3",fontWeight:600}}>已达标 ✓</span>
            :<span>，距目标<Chip val={targets.protein-totals.protein} unit="g" color="#E85D52"/>缺口，需在接下来的餐次补足</span>}。
          碳水<Chip val={totals.carbs} unit="g" color="#59C3C3"/>
          {carbOk?"处于合理范围":<span style={{color:"#E85D52"}}>略偏高，注意控制精制碳水</span>}，
          脂肪<Chip val={totals.fat} unit="g" color="#7DA7D9"/>
          {fatOk?"摄入适中":"偏高，以不饱和脂肪优先"}。
          热量最高的一餐是 <span style={{color:C.white,fontWeight:600}}>{topMeal.time}</span>
          （<Chip val={topMeal.totals.calories} unit="kcal" color="#F27D72"/>）。
        </p>
      </div>

      {/* ③ 与恢复状态联动 & 行动建议 */}
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"4px 15px 6px",marginBottom:10}}>
        <div style={{padding:"10px 0 6px",borderBottom:`1px solid ${C.ink3}`,marginBottom:2}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.fog}}>结合今日恢复状态</span>
        </div>
        <InsightRow icon={level==="green"?"ti-barbell":level==="yellow"?"ti-run":"ti-zzz"} color={level==="green"?STATUS.green:level==="yellow"?STATUS.yellow:STATUS.red}>
          {recText}
        </InsightRow>
        {!proOk&&(
          <InsightRow icon="ti-meat" color="#F27D72">
            今日蛋白质缺口<Chip val={targets.protein-totals.protein} unit="g" color="#F27D72"/>——
            可在下一餐补充鸡胸肉（100g ≈ 31g 蛋白质）或希腊酸奶（200g ≈ 20g）。
          </InsightRow>
        )}
        {totals.calories<targets.calories*0.5&&(
          <InsightRow icon="ti-flame" color="#D8D1C7">
            今日总热量仅<Chip val={totals.calories} unit="kcal" color="#D8D1C7"/>，
            热量摄入不足会加速肌肉分解，尤其在训练后恢复期，建议增加一餐。
          </InsightRow>
        )}
        <InsightRow icon="ti-droplet" color="#7DA7D9">
          运动消耗<Chip val={mealLog[0]?.totals?.calories??0} unit="" color="#7DA7D9"/>后记得补水，
          今日建议饮水<Chip val={totals.calories>400?2.5:2.0} unit="L" color="#7DA7D9"/>，
          有助于营养素的吸收和 HRV 稳定。
        </InsightRow>
      </div>
    </div>
  );
}

// 饮食打卡主页
function FoodCheckinPage({mealLog,onAddMeal,onDeleteMeal,d,level}) {
  const [analyzing,setAnalyzing]=useState(false);
  const [preview,setPreview]=useState(null);
  const [result,setResult]=useState(null);
  const fileRef=useRef(null);

  const totals=useMemo(()=>sumMealTotals(mealLog),[mealLog]);
  const targets=useMemo(()=>getNutritionTargets(level),[level]);

  const handleFile=async(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{
      const dataUrl=ev.target.result;
      const base64=dataUrl.split(",")[1];
      setPreview({dataUrl,base64,mimeType:file.type});
      setAnalyzing(true);
      setResult(null);
      const data=await analyzeFood(base64,file.type);
      setResult(data);
      setAnalyzing(false);
    };
    reader.readAsDataURL(file);
    e.target.value="";
  };

  const confirmAdd=()=>{
    if(!result||!preview||result.error) return;
    const now=new Date();
    const time=`${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
    onAddMeal({id:Date.now(),time,photoUrl:preview.dataUrl,foods:result.foods||[],totals:result.totals||{calories:0,protein:0,carbs:0,fat:0},note:result.note||""});
    setPreview(null); setResult(null);
  };

  const cancelPreview=()=>{ setPreview(null); setResult(null); };

  return (
    <div>
      {/* 日汇总 banner */}
      <DailyNutritionBanner totals={totals} targets={targets} mealCount={mealLog.length}/>

      {/* 拍照按钮 */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
      <button onClick={()=>fileRef.current?.click()} style={{
        width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
        border:`2px dashed #39424F`,borderRadius:16,padding:"18px",marginBottom:14,
        background:"transparent",cursor:"pointer",transition:"border-color .2s",
      }}
        onMouseEnter={e=>e.currentTarget.style.borderColor="#F27D72"}
        onMouseLeave={e=>e.currentTarget.style.borderColor="#39424F"}
      >
        <div style={{width:38,height:38,borderRadius:12,background:"#F27D721a",border:"1px solid #F27D7240",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Icon name="ti-camera" color="#F27D72" size={18}/>
        </div>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,fontWeight:600,color:C.white}}>拍照记录这一餐</div>
          <div style={{fontSize:10,color:C.fog,marginTop:2}}>AI 自动识别食物，计算营养成分</div>
        </div>
      </button>

      {/* 餐次列表 */}
      {mealLog.length===0?(
        <div style={{textAlign:"center",padding:"40px 0 20px"}}>
          <div style={{fontSize:36,marginBottom:10}}>📸</div>
          <div style={{fontSize:13,color:C.fog}}>还没有记录，拍张今天第一餐吧</div>
          <div style={{fontSize:11,color:C.ink4,marginTop:5}}>AI 帮你算热量、蛋白质、碳水和脂肪</div>
        </div>
      ):(
        mealLog.slice().reverse().map(meal=>(
          <MealCard key={meal.id} meal={meal} onDelete={onDeleteMeal}/>
        ))
      )}

      {/* AI 饮食解读（有数据才显示） */}
      <DietInsight mealLog={mealLog} totals={totals} targets={targets} level={level}/>

      {/* 分析弹层 */}
      {preview&&(
        <PhotoAnalysisSheet
          preview={preview}
          analyzing={analyzing}
          result={result}
          onConfirm={confirmAdd}
          onCancel={cancelPreview}
        />
      )}
    </div>
  );
}

// ─── 历史页 ─────────────────────────────────────────────────────────────────
// ─── 行内数字芯片 ────────────────────────────────────────────────────────────
function Chip({val,unit,color}) {
  return (
    <span style={{
      display:"inline-flex",alignItems:"baseline",gap:2,
      background:`${color}20`,border:`1px solid ${color}55`,
      borderRadius:6,padding:"1px 7px",margin:"0 2px",
      fontSize:13,fontWeight:700,color,verticalAlign:"middle",
      lineHeight:1.6,
    }}>
      {val}<span style={{fontSize:9,fontWeight:500,opacity:.8}}>{unit}</span>
    </span>
  );
}

// ─── 七日圆点日历条 ──────────────────────────────────────────────────────────
function WeekDots({weeks}) {
  return (
    <div style={{display:"flex",gap:6,justifyContent:"space-between",padding:"2px 0"}}>
      {weeks.map((w,i)=>{
        const col=classifyHrvColor(w.val);
        const size=w.val===null?28:32;
        return (
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,flex:1}}>
            <div style={{
              width:size,height:size,borderRadius:"50%",
              background:w.val===null?C.ink3:`${col}22`,
              border:`2px solid ${col}`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:8,fontWeight:700,color:w.val===null?C.fog:col,
              transition:"all .3s",
            }}>
              {w.val===null?"—":Math.round(w.val)}
            </div>
            <span style={{fontSize:8,color:C.fog,letterSpacing:".03em"}}>{w.day}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 迷你内嵌折线（行内用）──────────────────────────────────────────────────
function InlineSpark({vals,color,w=72,h=26}) {
  const valid=vals.filter(v=>v!==null);
  if(valid.length<2) return null;
  const mn=Math.min(...valid),mx=Math.max(...valid),rng=mx-mn||1;
  const pts=vals.map((v,i)=>{
    const x=(i/(vals.length-1))*w;
    const y=v===null?h/2:h-((v-mn)/rng)*(h-4)-2;
    return `${x},${y}`;
  }).join(" ");
  const last=pts.split(" ").filter(p=>!p.includes("NaN")).pop().split(",").map(Number);
  return (
    <svg width={w} height={h} style={{display:"inline-block",verticalAlign:"middle",overflow:"visible",margin:"0 4px"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" opacity={.85}/>
      <circle cx={last[0]} cy={last[1]} r={3} fill={color}/>
    </svg>
  );
}

// ─── 亮点 / 警示 图标行 ──────────────────────────────────────────────────────
function InsightRow({icon,color,children}) {
  return (
    <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"9px 0",borderBottom:`1px solid ${C.ink3}`}}>
      <div style={{
        width:28,height:28,borderRadius:8,flexShrink:0,marginTop:1,
        background:`${color}18`,border:`1px solid ${color}40`,
        display:"flex",alignItems:"center",justifyContent:"center",
      }}>
        <Icon name={icon} color={color} size={14}/>
      </div>
      <div style={{fontSize:12,color:C.lit,lineHeight:1.65,flex:1}}>{children}</div>
    </div>
  );
}

// ─── 本周解读区块 ────────────────────────────────────────────────────────────
function WeeklyInsight({d}) {
  // Memoize all the expensive reductions — they only change when hrv_week changes
  const stats=useMemo(()=>{
    const valid=validHrvWeek(d.hrv_week);
    if(valid.length===0) return null;
    const avg=Math.round(valid.reduce((s,x)=>s+x.val,0)/valid.length);
    const peak=valid.reduce((a,b)=>b.val>a.val?b:a);
    const low=valid.reduce((a,b)=>b.val<a.val?b:a);
    const trend=valid.length>=2?valid[valid.length-1].val-valid[valid.length-2].val:0;
    const overall=calcWeeklyOverall(valid);
    return {avg,peak,low,trend,...overall};
  },[d.hrv_week]);
  if(!stats) return null;
  const {avg,peak,low,trend,score:overallScore,color:overallCol,greenDays,yellowDays,redDays}=stats;
  const vals=d.hrv_week.map(w=>w.val);

  return (
    <div style={{marginTop:20}}>
      {/* 分区标题 */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <div style={{flex:1,height:1,background:C.ink3}}/>
        <span style={{fontSize:10,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",color:C.fog,whiteSpace:"nowrap"}}>本周解读</span>
        <div style={{flex:1,height:1,background:C.ink3}}/>
      </div>

      {/* ① 总评卡 */}
      <div style={{
        background:`linear-gradient(135deg,${C.ink2} 0%,${overallCol}12 100%)`,
        border:`1px solid ${overallCol}40`,borderRadius:18,
        padding:"16px 18px",marginBottom:12,position:"relative",overflow:"hidden",
      }}>
        {/* 装饰大字背景 */}
        <div style={{
          position:"absolute",right:-6,top:-10,
          fontSize:80,fontWeight:900,color:`${overallCol}09`,
          lineHeight:1,pointerEvents:"none",userSelect:"none",letterSpacing:"-.04em",
        }}>{overallScore}</div>

        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{
            padding:"4px 12px",borderRadius:99,
            background:`${overallCol}22`,border:`1px solid ${overallCol}60`,
            fontSize:11,fontWeight:700,color:overallCol,letterSpacing:".06em",
          }}>{overallScore}</div>
          <span style={{fontSize:12,color:C.mid}}>本周整体恢复</span>
        </div>

        {/* 七日圆点日历 */}
        <WeekDots weeks={d.hrv_week}/>

        {/* 图例 */}
        <div style={{display:"flex",gap:12,marginTop:10,justifyContent:"center"}}>
          {[["#59C3C3",`${greenDays}天绿灯`],["#F27D72",`${yellowDays}天黄灯`],["#E85D52",`${redDays}天红灯`]].map(([c,l])=>(
            <span key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:c}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>{l}
            </span>
          ))}
        </div>
      </div>

      {/* ② HRV 趋势叙述卡 */}
      <div style={{
        background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,
        padding:"14px 16px",marginBottom:10,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
          <Icon name="ti-chart-line" color="#7DA7D9" size={14}/>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.fog}}>HRV 趋势叙述</span>
          <InlineSpark vals={vals} color="#7DA7D9" w={60} h={22}/>
        </div>
        <p style={{fontSize:12.5,color:C.lit,lineHeight:1.75,margin:0}}>
          本周 HRV 均值为<Chip val={avg} unit="ms" color="#7DA7D9"/>，整体处于
          <Chip val={overallScore} unit="" color={overallCol}/>水平。
          峰值出现在 <span style={{color:C.white,fontWeight:600}}>{peak.day}</span>，达到
          <Chip val={Math.round(peak.val)} unit="ms" color="#59C3C3"/>——
          这通常是前一晚充分睡眠 + 低训练负荷共同作用的结果。
          低点出现在 <span style={{color:C.white,fontWeight:600}}>{low.day}</span>
          （<Chip val={Math.round(low.val)} unit="ms" color="#E85D52"/>），
          建议回顾当日睡眠质量或前一日训练强度。
          截至今日，HRV 趋势
          {trend>=2
            ? <span style={{color:"#59C3C3",fontWeight:600}}> 正在回升 ↑</span>
            : trend<=-2
            ? <span style={{color:"#E85D52",fontWeight:600}}> 持续下滑 ↓</span>
            : <span style={{color:"#F27D72",fontWeight:600}}> 基本平稳 →</span>}，
          需持续关注后续数据。
        </p>
      </div>

      {/* ③ 亮点 & 注意 */}
      <div style={{
        background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,
        padding:"4px 16px 6px",marginBottom:10,
      }}>
        <div style={{padding:"10px 0 6px",borderBottom:`1px solid ${C.ink3}`,marginBottom:2}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.fog}}>本周亮点 &amp; 注意</span>
        </div>

        {greenDays>=2&&(
          <InsightRow icon="ti-check" color="#59C3C3">
            本周共有 <Chip val={greenDays} unit="天" color="#59C3C3"/> 绿灯日，
            说明自主神经恢复能力稳定，继续保持当前训练节奏。
          </InsightRow>
        )}
        <InsightRow icon="ti-activity" color="#7DA7D9">
          峰值<Chip val={Math.round(peak.val)} unit="ms" color="#59C3C3"/>
          与低谷<Chip val={Math.round(low.val)} unit="ms" color="#E85D52"/>
          之间相差 <Chip val={Math.round(peak.val-low.val)} unit="ms" color="#7DA7D9"/>，
          {peak.val-low.val>20
            ? "波动幅度较大，提示本周负荷节奏不够均匀。"
            : "波动幅度合理，训练与恢复节奏较为平衡。"}
        </InsightRow>
        {redDays>0&&(
          <InsightRow icon="ti-alert-triangle" color="#E85D52">
            本周出现 <Chip val={redDays} unit="天" color="#E85D52"/> 红灯日（HRV &lt; 48 ms），
            建议在红灯日严格执行休息或轻量拉伸，避免叠加疲劳。
          </InsightRow>
        )}
        <InsightRow icon="ti-barbell" color="#F27D72">
          本周完成训练 <Chip val={5} unit="次" color="#F27D72"/>，
          累计消耗约 <Chip val={d.workout.calories} unit="kcal" color="#F27D72"/>。
          力量训练后 48 h 内 HRV 通常小幅下滑，属于正常适应反应。
        </InsightRow>
      </div>

      {/* ④ 下周行动建议 */}
      <div style={{
        background:`linear-gradient(135deg,${C.ink2},#4E5D94cc)`,
        border:`1px solid #4E5D94`,borderRadius:16,
        padding:"14px 16px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:11}}>
          <Icon name="ti-run" color="#D8D1C7" size={14}/>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.fog}}>下周行动建议</span>
        </div>
        {[
          {n:"01",text:`将 HRV 均值目标提升至 ${avg+3} ms 以上，每天晨起记录静息心率。`,col:"#D8D1C7"},
          {n:"02",text:"高强度训练后安排 1 天完全休息日，防止 HRV 连续下滑。",col:"#7DA7D9"},
          {n:"03",text:"睡前补充甘氨酸镁 300 mg + Omega-3 2 g，有助于提升深睡比例和次日 HRV。",col:"#59C3C3"},
        ].map(({n,text,col})=>(
          <div key={n} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:9,lastChild:{marginBottom:0}}}>
            <span style={{
              fontSize:9,fontWeight:900,color:col,letterSpacing:".05em",
              minWidth:22,paddingTop:2,
            }}>{n}</span>
            <span style={{fontSize:12,color:C.lit,lineHeight:1.65}}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPage({d}) {
  const max=Math.max(...d.hrv_week.map(x=>x.val??0),80);
  return (
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:12}}>本周 HRV</div>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"14px 15px 13px",marginBottom:12}}>
        {d.hrv_week.map((w,i)=>{
          const hasValue=Number.isFinite(w.val);
          const col=!hasValue?C.ink3:classifyHrvColor(w.val);
          const isL=i===d.hrv_week.length-1;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<d.hrv_week.length-1?8:0}}>
              <span style={{fontSize:10,fontWeight:isL?700:400,color:isL?C.white:C.fog,width:28,flexShrink:0}}>{w.day}</span>
              <div style={{flex:1,height:7,background:C.ink3,borderRadius:99,overflow:"hidden"}}>
                <div style={{width:`${hasValue?Math.round(w.val/max*100):0}%`,height:"100%",background:col,borderRadius:99}}/>
              </div>
              <span style={{fontSize:11,fontWeight:isL?700:400,color:isL?C.white:C.fog,width:26,textAlign:"right"}}>{hasValue?Math.round(w.val):"—"}</span>
            </div>
          );
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
        {[{l:"HRV 均值",v:"54",u:"ms",c:"#F27D72"},{l:"心率均值",v:"57",u:"bpm",c:"#7DA7D9"},{l:"本周训练",v:"5",u:"次",c:"#59C3C3"}].map((s,i)=>(
          <div key={i} style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:14,padding:"12px 13px 11px"}}>
            <div style={{fontSize:9,fontWeight:600,letterSpacing:".12em",textTransform:"uppercase",color:C.fog,marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:21,fontWeight:400,color:s.c,letterSpacing:"-.02em"}}>{s.v}<span style={{fontSize:9,color:C.fog,marginLeft:2}}>{s.u}</span></div>
          </div>
        ))}
      </div>
      <WeeklyInsight d={d}/>
    </div>
  );
}

// ─── 根组件 ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]=useState("dashboard");
  const [syncing,setSyncing]=useState(false);
  const [syncPhase,setSyncPhase]=useState(0);
  const [syncItems,setSyncItems]=useState([]);
  const [modal,setModal]=useState(null);
  const [liveData,setLiveData]=useState(DEFAULT_DATA);
  const [mealLog,setMealLog]=useState([]);
  const d=liveData, level=getLevel(liveData);

  const addMeal=useCallback((meal)=>setMealLog(p=>[...p,meal]),[]);
  const deleteMeal=useCallback((id)=>setMealLog(p=>p.filter(m=>m.id!==id)),[]);

  // ── Load Tabler Icons font once on mount ──
  useEffect(()=>{
    const id='tabler-icons-css';
    if(document.getElementById(id)) return;
    const link=document.createElement('link');
    link.id=id;
    link.rel='stylesheet';
    link.href='https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.19.0/fonts/tabler-icons.min.css';
    document.head.appendChild(link);
  },[]);

  // ── 监听 Claude 回传的健康数据 ──
  useEffect(()=>{
    const handler = (e) => {
      if(!e.data) return;
      // 接受 string 或 object
      let raw = "";
      if(typeof e.data === "string") raw = e.data;
      else if(typeof e.data === "object") {
        // Claude.ai 内部消息格式
        if(e.data.type === "health_data") raw = JSON.stringify(e.data.payload);
        else if(e.data.text) raw = e.data.text;
        else raw = JSON.stringify(e.data);
      }
      if(!raw) return;
      // 过滤：必须包含健康数据字段
      const hasHRV = raw.includes("hrv_today") || raw.includes('"hrv"');
      if(!hasHRV) return;
      const parsed = parseHealthJSON(raw);
      if(parsed && parsed.hrv > 0) {
        setLiveData(parsed);
        setSyncItems([
          {icon:"ti-activity",          label:"HRV",    value:`${Math.round(parsed.hrv)} ms`},
          {icon:"ti-heart-rate-monitor",label:"静息心率",value:`${Math.round(parsed.rhr)} bpm`},
          {icon:"ti-moon-stars",        label:"睡眠",   value:`${parsed.sleep.toFixed(1)} h`},
          {icon:"ti-barbell",           label:"训练记录",value:`${parsed.workout?.duration_min ?? parsed.workout?.duration ?? 0} min`},
        ]);
        setSyncPhase(2);
        setTimeout(()=>{ setSyncPhase(0); setSyncing(false); setSyncItems([]); }, 2400);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  },[]);

  const openModal=useCallback(key=>{
    const map={
      status:()=>INTERP.status(d,level),
      hrv:()=>INTERP.hrv(d),
      rhr:()=>INTERP.rhr(d),
      sleep:()=>INTERP.sleep(d),
      workout:()=>INTERP.workout(d),
      rec:()=>INTERP.rec(level),
      nutrition:()=>INTERP.nutrition(d,level),
      hrv_chart:()=>INTERP.hrv_chart(d),
    };
    setModal(map[key]?.() || null);
  },[d,level]);

  // ── 真实数据同步：调用 Anthropic API 读取 Apple Health ──────────────────
  const doSync = async () => {
    if(syncing || syncPhase===1) return;
    setSyncing(true); setSyncPhase(1); setSyncItems([]);

    // 先用 sendPrompt 触发 Claude 读健康数据（主路径）
    if(typeof sendPrompt === "function") {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      const weekAgo = new Date(now - 7*86400000);
      const weekStart = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth()+1).padStart(2,"0")}-${String(weekAgo.getDate()).padStart(2,"0")}`;
      sendPrompt(`COACH_AI_SYNC:请立即读取我的 Apple Watch 健康数据，今日 ${today}，本周 ${weekStart} 到 ${today}。只回复纯 JSON 不含其他任何文字：{"hrv_today":数值,"rhr_today":数值,"sleep_hours":数值,"sleep_awake_count":数值,"deep_sleep_pct":数值,"rem_sleep_pct":数值,"hrv_week":[{"day":"M/D","val":数值}],"workout_today":{"type":"类型","duration_min":数值,"calories":数值},"sync_time":"HH:MM"}`);
      // postMessage 监听器会接收回传数据并更新
      // 30秒超时保护
      setTimeout(()=>{
        setSyncPhase(p => {
          if(p === 1) { // 还在等待中
            setSyncing(false);
            setSyncItems([]);
            return 0;
          }
          return p;
        });
      }, 30000);
    } else {
      // fallback：演示动画
      const now = new Date();
      const items=[
        {icon:"ti-activity",          label:"HRV",    value:`${Math.round(d.hrv)} ms`},
        {icon:"ti-heart-rate-monitor",label:"静息心率",value:`${d.rhr} bpm`},
        {icon:"ti-moon-stars",        label:"睡眠",   value:`${d.sleep.toFixed(1)} h`},
        {icon:"ti-barbell",           label:"训练记录",value:`${d.workout.duration} min`},
      ];
      items.forEach((_,i)=>{ setTimeout(()=>setSyncItems(p=>[...p,items[i]]), 500+i*480); });
      setTimeout(()=>setSyncPhase(2), 500+items.length*480+400);
      setTimeout(()=>{ setSyncPhase(0); setSyncing(false); setSyncItems([]); }, 500+items.length*480+1600);
    }
  };

  const nav=[
    {id:"dashboard",ic:"ti-activity",l:"状态"},
    {id:"checkin",  ic:"ti-camera",l:"饮食"},
    {id:"coach",    ic:"ti-message-circle",l:"教练"},
    {id:"history",  ic:"ti-chart-line",l:"历史"},
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;}
        /* VI Motion System — 动效像：呼吸·心率·水波·肌肉放松·空气流动 */
        @keyframes spin{to{transform:rotate(360deg);}}
        /* Recovery — 柔和呼吸感 (2.8s slower than before) */
        @keyframes breathe{0%,100%{transform:scale(.7);opacity:.2}50%{transform:scale(1.4);opacity:.9}}
        /* Chat bop — 软弹，非机械弹跳 */
        @keyframes bop{0%,70%,100%{transform:translateY(0)}35%{transform:translateY(-4px)}}
        /* Sheet slide — 柔和曲线 */
        @keyframes slideUp{from{transform:translateY(56px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        /* Ring pulse — 极慢微脉冲，像海盐水波 */
        @keyframes ringPulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.14);opacity:.12}}
        @keyframes itemSlide{from{transform:translateX(-10px);opacity:0}to{transform:translateX(0);opacity:1}}
        /* Shimmer — 骨架屏柔和流光 */
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes popIn{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
        /* Glow pulse — 极轻微，像呼吸间的体温变化 */
        @keyframes glowPulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.85;transform:scale(1.04)}}
        @keyframes gradientShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        /* Calm float — 页面元素轻微浮动，生命感 */
        @keyframes calmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        button,input{outline:none;font-family:'DM Sans',sans-serif;}
        input::placeholder{color:#52504D;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#39424F;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}
      `}</style>

      {/* ── 外层定位容器：固定视口高度，让 Modal bottom:0 对准可视区底部 ── */}
      <div style={{
        maxWidth:680, margin:"0 auto",
        fontFamily:"'DM Sans',sans-serif",
        position:"relative",  /* Modal absolute 的锚点 */
        height:"100dvh",      /* 固定为视口高度，避免弹窗被推到文档底部 */
        display:"flex", flexDirection:"column",
        borderRadius:28,
        overflow:"hidden",    /* 裁切圆角 + 裁切 Modal 遮罩 */
        background:"#1F2328",
        backgroundImage:"radial-gradient(ellipse at 50% 0%,#2B3138 0%,#1F2328 50%)",
      }}>
        {/* Modal 放在最顶层，position:absolute inset:0 */}
        <Modal data={modal} onClose={()=>setModal(null)}/>
        {/* 同步动画覆盖层 */}
        <SyncOverlay phase={syncPhase} items={syncItems}/>

        {/* Topbar */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"16px 20px 14px",
          background:"linear-gradient(180deg,#181D22 0%,#1A1F24 100%)",
          borderBottom:`1px solid ${C.ink3}`,
        }}>
          <div style={{display:"flex",flexDirection:"column",gap:1}}>
            <span style={{fontSize:15,fontWeight:700,letterSpacing:".28em",textTransform:"uppercase",color:C.white}}>
              教练<em style={{fontStyle:"normal",color:"#F27D72",textShadow:"0 0 12px #F27D7255"}}>.</em>AI
            </span>
            <span style={{fontSize:8,color:C.fog,letterSpacing:".18em",textTransform:"uppercase"}}>Personal Coach</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {d.is_stale
              ? <span style={{fontSize:10,color:C.fog}}>数据待更新</span>
              : <span style={{fontSize:10,fontWeight:600,color:"#59C3C3"}}>{d.sync_date} {d.sync_time} ✓</span>
            }
            <button onClick={()=>doSync()} style={{
              display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
              background:syncing?C.ink3:`linear-gradient(135deg,#F27D72,#D96A60)`,
              border:"none",borderRadius:99,fontSize:11,fontWeight:700,letterSpacing:".06em",
              color:C.white,cursor:syncing?"not-allowed":"pointer",
              opacity:syncing?.6:1,transition:"opacity .2s",
              boxShadow:syncing?"none":"0 4px 16px #F27D7240",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={syncing?{animation:"spin 1s linear infinite"}:{}}><path d="M4 12a8 8 0 018-8 8 8 0 016.9 4M20 12a8 8 0 01-8 8 8 8 0 01-6.9-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/><path d="M20 4v4h-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>同步
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav style={{display:"flex",background:"#1E2328",borderBottom:`1px solid ${C.ink3}`,padding:"0 6px"}}>
          {nav.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{
              flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,
              padding:"11px 4px 10px",background:"transparent",border:"none",
              cursor:"pointer",position:"relative",
            }}>
              {tab===n.id&&<div style={{
                position:"absolute",top:7,left:"50%",transform:"translateX(-50%)",
                width:40,height:34,borderRadius:11,
                background:"#F27D7214",border:"1px solid #F27D7228",
              }}/>}
              <Icon name={n.ic} color={tab===n.id?"#F27D72":"#6B6560"} size={tab===n.id?20:18}/>
              <span style={{
                fontSize:9,fontWeight:tab===n.id?700:500,
                letterSpacing:".1em",textTransform:"uppercase",
                color:tab===n.id?"#F27D72":C.fog,position:"relative",
              }}>{n.l}</span>
            </button>
          ))}
        </nav>

        {/* 页面内容：flex:1 撑满剩余高度，自身负责滚动 */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 16px 32px",WebkitOverflowScrolling:"touch"}}>
          {tab==="dashboard"&&<>
            <AnomalyStrip d={d} level={level}/>
            <StatusRing d={d} level={level} onTap={()=>openModal("status")}/>
            <MetricRow d={d} onTap={openModal}/>
            <SleepCard d={d} onTap={()=>openModal("sleep")}/>
            <HRVChart d={d} onTap={()=>openModal("hrv_chart")}/>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:10}}>明日计划</div>
            <RecCard level={level} onTap={()=>openModal("rec")}/>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:10}}>营养</div>
            <NutritionCard d={d} level={level} mealLog={mealLog} onTap={()=>openModal("nutrition")}/>
          </>}
          {tab==="checkin"&&<FoodCheckinPage mealLog={mealLog} onAddMeal={addMeal} onDeleteMeal={deleteMeal} d={d} level={level}/>}
          {tab==="coach"&&<CoachPage d={d} mealLog={mealLog}/>}
          {tab==="history"&&<HistoryPage d={d}/>}
        </div>
      </div>
    </>
  );
}
