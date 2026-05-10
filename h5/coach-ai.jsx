import { useState, useRef, useEffect, useCallback } from "react";

// ─── 色彩系统 ───────────────────────────────────────────────────────────────
// ─── Blue Lotus 色彩体系 (#19309A / #4B69EF / #7E96FE / #B6D8F7 / #FFB967) ──
const C = {
  // 底色层次：深海蓝系
  ink:"#0D1629",   // 最深底色（基于 #19309A 加深）
  ink2:"#152040",  // 卡片底色
  ink3:"#1E2E55",  // 边框/分割线
  ink4:"#2A3E6E",  // 次要元素背景
  // 文字层次
  fog:"#3A527A", // 隐色（蓝调雾感）用实际色代替
  mid:"#7E96FE",   // 次要文字 → 浅蓝
  lit:"#B6D8F7",   // 正文文字 → 天蓝
  white:"#E8F2FF", // 标题/最亮文字
  // 功能色
  o1:"#FFB967",    // 主强调：暖橙（来自 Blue Lotus）
  o2:"#F5A347",    // 强调深色
  mag:"#7E96FE",   // 警告/红灯 → 用浅蓝紫（避免破坏配色，但需要区分）
  go:"#4B69EF",    // 成功/绿灯 → 中蓝（Blue Lotus 核心）
  blue:"#B6D8F7",  // 辅助蓝
  purple:"#19309A",// 深蓝强调
};
// 语义色（独立于 C，用于健康状态判断）
const STATUS = {
  green: "#4B69EF",   // 绿灯 → 中蓝
  yellow: "#FFB967",  // 黄灯 → 暖橙
  red: "#FF6B8A",     // 红灯 → 保留偏红（状态警告必须有红色语义）
  greenBg: "#19309A22",
  yellowBg: "#FFB96722",
  redBg: "#FF6B8A18",
};

// ─── 默认数据（5/9，等待同步更新为5/10最新数据）──────────────────────────
const DEFAULT_DATA = {
  hrv:54.2, rhr:56, sleep:7.17, awake:0, deep_pct:18, rem_pct:22,
  hrv_week:[
    {day:"5/4",val:52.0},{day:"5/5",val:53.8},{day:"5/6",val:47.5},
    {day:"5/7",val:69.4},{day:"5/8",val:54.2},{day:"5/9",val:54.2},
    {day:"5/10",val:null},
  ],
  workout:{type:"力量训练", duration:74, calories:515},
  sync_time:"19:41",
  sync_date:"5月9日",
  is_stale: true,  // 标记为旧数据，需要同步
};

// ─── 解析 Apple Health JSON（Claude回传的数据格式）────────────────────────
function parseHealthJSON(raw) {
  try {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    // 提取第一个完整 JSON 对象
    const match = text.match(/\{[\s\S]*\}/);
    if(!match) return null;
    const j = JSON.parse(match[0]);
    // 必须包含 hrv_today 才认为有效
    if(!j.hrv_today && !j.hrv) return null;
    const now = new Date();
    const month = now.getMonth()+1;
    const day = now.getDate();
    return {
      hrv:        parseFloat(j.hrv_today ?? j.hrv ?? 0),
      rhr:        parseFloat(j.rhr_today ?? j.rhr ?? 0),
      sleep:      parseFloat(j.sleep_hours ?? j.sleep ?? 0),
      awake:      parseInt(j.sleep_awake_count ?? j.awake ?? 0),
      deep_pct:   parseFloat(j.deep_sleep_pct ?? j.deep_pct ?? 18),
      rem_pct:    parseFloat(j.rem_sleep_pct  ?? j.rem_pct  ?? 22),
      hrv_week:   (j.hrv_week || []).map(x=>({day:x.day, val:parseFloat(x.val)})),
      workout:    j.workout_today ?? j.workout ?? {type:"未记录",duration:0,calories:0},
      sync_time:  j.sync_time ?? `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`,
      sync_date:  `${month}月${day}日`,
      is_stale:   false,
    };
  } catch(e) {
    return null;
  }
}

// ─── 恢复评级 ────────────────────────────────────────────────────────────────
function getLevel(d) {
  let y=0, r=0;
  if(d.hrv<48) r++; else if(d.hrv<55) y++;
  if(d.rhr>59) r++; else if(d.rhr>56) y++;
  if(d.sleep<6.5) r++; else if(d.sleep<7.5) y++;
  if(d.awake>=4) y++;
  if(r>=1||y>=3) return "red";
  if(y>=1) return "yellow";
  return "green";
}

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
        content:`7日均值 ${Math.round(d.hrv_week.reduce((s,x)=>s+x.val,0)/d.hrv_week.length)} ms。本周峰值 ${Math.round(Math.max(...d.hrv_week.map(x=>x.val)))} ms（5/7），今日小幅回落属正常波动，非异常信号。` },
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
function Arc({value,max,color,size=88,stroke=7,label,sub}) {
  const r=(size-stroke*2)/2, circ=2*Math.PI*r, arc=circ*0.75;
  const fill=Math.min(value/max,1)*arc;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(135deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.ink3} strokeWidth={stroke} strokeDasharray={`${arc} ${circ-arc}`} strokeLinecap="round"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round" style={{transition:"stroke-dasharray .6s cubic-bezier(.4,0,.2,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:18,fontWeight:400,color:C.white,lineHeight:1,letterSpacing:"-.02em"}}>{label}</span>
        {sub&&<span style={{fontSize:9,color:C.fog,marginTop:2,letterSpacing:".06em"}}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── 迷你折线 ───────────────────────────────────────────────────────────────
function Spark({vals,color,width=52,height=20}) {
  const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*width},${height-((v-mn)/rng)*(height-4)-2}`).join(" ");
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
  const defs=[{c:"#1E2E55",h:7},{c:"#4B69EF",h:11},{c:"#FFB967",h:15},{c:"#7E96FE",h:11},{c:"#B6D8F7",h:7}];
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
};
function Icon({name, color, size=18}) {
  const fn = SVG_ICONS[name];
  if(fn) return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,flexShrink:0}}>{fn(color)}</span>;
  // 最终 fallback：彩色圆点
  return <span style={{width:size,height:size,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0,opacity:.7}}/>;
}
function SyncItemIcon({name, done}) { return <Icon name={name} color={done?"#4B69EF":"#FFB967"} size={16}/>; }
function NutriIcon({name, color})   { return <Icon name={name} color={color} size={16}/>; }

// ─── 同步动画覆盖层 ──────────────────────────────────────────────────────────
function SyncOverlay({phase, items}) {
  if(phase===0) return null;
  const done = phase===2;
  return (
    <div style={{
      position:"absolute",top:0,left:0,right:0,bottom:0,
      background:"rgba(13,22,41,.96)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      zIndex:150, borderRadius:28,
      animation:"fadeIn .22s ease forwards",
    }}>
      {/* 脉冲环 */}
      <div style={{position:"relative",width:96,height:96,marginBottom:32}}>
        {/* 外环脉冲 */}
        <div style={{
          position:"absolute",inset:-8,borderRadius:"50%",
          border:`1.5px solid ${done ? "#4B69EF" : "#FFB967"}`,
          opacity: done ? 0 : 1,
          animation: done ? "none" : "ringPulse 1.6s ease-in-out infinite",
        }}/>
        {/* 中环 */}
        <div style={{
          position:"absolute",inset:-2,borderRadius:"50%",
          border:`1.5px solid ${done ? "#4B69EF60" : "#FFB96750"}`,
          animation: done ? "none" : "ringPulse 1.6s .4s ease-in-out infinite",
        }}/>
        {/* 主圆 */}
        <div style={{
          width:96,height:96,borderRadius:"50%",
          background: done ? "#4B69EF18" : "#FFB96710",
          border:`2px solid ${done ? "#4B69EF" : "#FFB967"}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          transition:"background .4s, border-color .4s",
        }}>
          {done ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{animation:"popIn .3s cubic-bezier(.34,1.56,.64,1) forwards"}}>
              <path d="M5 12l5 5L20 7" stroke="#4B69EF" strokeWidth="2.2"/>
            </svg>
          ) : (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" style={{animation:"spin 1.2s linear infinite"}}>
              <circle cx="12" cy="12" r="10" stroke="#FFB967" opacity="0.18"/>
              <path d="M12 2 A10 10 0 0 1 22 12" stroke="#FFB967" strokeWidth="2.2"/>
            </svg>
          )}
        </div>
      </div>

      {/* 状态文字 */}
      <div style={{
        fontSize:15,fontWeight:600,color:done?"#4B69EF":C.white,
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
            background:C.ink2,border:`1px solid ${done?"#4B69EF60":C.ink3}`,
            borderRadius:14,padding:"10px 14px",
            animation:"itemSlide .38s cubic-bezier(.25,1,.4,1) forwards",
            transition:"border-color .4s",
          }}>
            <div style={{width:30,height:30,borderRadius:9,background:done?"#4B69EF14":"#FFB96720",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <SyncItemIcon name={it.icon} done={done}/>
            </div>
            <span style={{fontSize:12,color:C.mid,flex:1}}>{it.label}</span>
            <span style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:done?"#4B69EF":C.white}}>{it.value}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={done?"#4B69EF":"#FFB967"} strokeWidth="2.5" strokeLinecap="round">
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
        background:"#152040",
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
              <path d="M1 1L13 13M13 1L1 13" stroke="#7E96FE" strokeWidth="2" strokeLinecap="round"/>
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
    <div style={{background:isDanger?"#0D1629":"#0D1629",border:`1px solid ${bc}`,borderRadius:18,padding:"10px 14px",marginBottom:12,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:bc,borderRadius:"18px 18px 0 0"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <Icon name={isDanger?"ti-alert-triangle":"ti-alert-circle"} color={bc} size={15}/>
        {flags.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.04)",borderRadius:8,padding:"4px 10px"}}>
            <Icon name={f.ic} color={bc} size={11}/>
            <span style={{fontSize:11,color:C.lit,fontWeight:400}}>{f.val}</span>
            <span style={{fontSize:9,color:bc,fontWeight:600,letterSpacing:".04em"}}>{f.note}</span>
          </div>
        ))}
        <span style={{fontSize:10,color:bc,fontWeight:600,letterSpacing:".06em",marginLeft:"auto"}}>
          {isDanger?"强制休息":"降低强度"}
        </span>
      </div>
    </div>
  );
}

// ─── 状态主环 ───────────────────────────────────────────────────────────────
function StatusRing({d,level,onTap}) {
  const cfg={green:{col:STATUS.green,label:"良好"},yellow:{col:STATUS.yellow,label:"注意"},red:{col:STATUS.red,label:"休息"}}[level];
  const wa=d.hrv_week.reduce((s,x)=>s+x.val,0)/d.hrv_week.length;
  return (
    <Tap onTap={onTap}>
      <div style={{
        background:C.ink2,
        border:`1px solid ${level==="green"?C.ink3:cfg.col}`,
        borderRadius:22,padding:"16px 18px",marginBottom:12,
        position:"relative",overflow:"hidden",
      }}>
        {level!=="green"&&<div style={{position:"absolute",top:0,left:0,right:0,height:2.5,background:cfg.col,borderRadius:"22px 22px 0 0"}}/>}
        {level!=="green"&&<div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 0% 50%,${cfg.col}0c,transparent 55%)`,pointerEvents:"none"}}/>}
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <Arc value={d.hrv} max={80} color={cfg.col} size={90} stroke={7} label={Math.round(d.hrv)} sub="HRV ms"/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
              <span style={{fontSize:20,fontWeight:600,color:cfg.col,letterSpacing:"-.01em"}}>{cfg.label}</span>
              {level!=="green"&&<div style={{width:6,height:6,borderRadius:"50%",background:cfg.col,animation:"breathe 2s ease-in-out infinite"}}/>}
            </div>
            <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:11,flexWrap:"wrap"}}>
              {[
                {ic:"ti-heart-rate-monitor",val:`${d.rhr}`,unit:"bpm"},
                {ic:"ti-moon",val:`${d.sleep.toFixed(1)}`,unit:"h"},
                {ic:"ti-trending-up",val:`均值 ${Math.round(wa)}`,unit:""},
              ].map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                  <Icon name={m.ic} color={C.fog} size={12}/>
                  <span style={{fontSize:12,fontWeight:500,color:C.lit}}>{m.val}</span>
                  {m.unit&&<span style={{fontSize:9,color:C.fog,marginLeft:1}}>{m.unit}</span>}
                </div>
              ))}
            </div>
            <Spark vals={d.hrv_week.map(x=>x.val)} color={cfg.col} width={168} height={26}/>
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
    {key:"workout",ic:"ti-flame",             val:d.workout.calories,unit:"kcal",spark:[320,450,480,380,515,515],col:"#FFB967",sub:`${d.workout.duration} 分钟`},
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:12}}>
      {cards.map(m=>(
        <Tap key={m.key} onTap={()=>onTap(m.key)}>
          <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"12px 12px 22px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <Icon name={m.ic} color={C.fog} size={13}/>
              <Spark vals={m.spark} color={m.col} width={42} height={17}/>
            </div>
            <div style={{fontSize:21,fontWeight:400,color:C.white,letterSpacing:"-.02em",lineHeight:1}}>
              {m.val}<span style={{fontSize:10,color:C.fog,marginLeft:2,fontWeight:400}}>{m.unit}</span>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:m.col,marginTop:5,letterSpacing:".02em"}}>{m.sub}</div>
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
  const bars=[{label:"浅睡",min:core,col:"#B6D8F7"},{label:"REM",min:rem,col:"#7E96FE"},{label:"深睡",min:deep,col:"#4B69EF"}];
  return (
    <Tap onTap={onTap}>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"13px 15px 22px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Icon name="ti-moon-stars" color={C.fog} size={14}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>睡眠</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            {d.awake===0&&<Icon name="ti-check" color={"#4B69EF"} size={12}/>}
            <span style={{fontSize:11,fontWeight:500,color:d.awake>2?"#FFB967":C.mid}}>觉醒 {d.awake} 次</span>
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
  const max=Math.max(...d.hrv_week.map(x=>x.val),80);
  const wa=Math.round(d.hrv_week.reduce((s,x)=>s+x.val,0)/d.hrv_week.length);
  return (
    <Tap onTap={onTap}>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"13px 15px 22px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Icon name="ti-chart-line" color={C.fog} size={14}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>本周 HRV</span>
          </div>
          <span style={{fontSize:11,color:C.fog}}>均值 <span style={{color:C.mid,fontWeight:500}}>{wa} ms</span></span>
        </div>
        {d.hrv_week.map((w,i)=>{
          const pct=Math.round(w.val/max*100);
          const col=w.val>=55?"#4B69EF":w.val>=48?"#FFB967":"#FF6B8A";
          const isLast=i===d.hrv_week.length-1;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<d.hrv_week.length-1?7:9}}>
              <span style={{fontSize:10,fontWeight:isLast?600:400,color:isLast?C.white:C.fog,width:28,flexShrink:0}}>{w.day}</span>
              <div style={{flex:1,height:6,background:C.ink3,borderRadius:99,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:99}}/>
              </div>
              <span style={{fontSize:11,fontWeight:isLast?600:400,color:isLast?C.white:C.fog,width:26,textAlign:"right"}}>{Math.round(w.val)}</span>
            </div>
          );
        })}
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          {[["#4B69EF","≥ 55"],["#FFB967","48–54"],["#FF6B8A","< 48"]].map(([c,l])=>(
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
    green:{ic:"ti-barbell",col:STATUS.green,bg:"#162040",bd:"#19309A",name:"正常训练",zone:3,mins:50,detail:"推 · 拉 · 核心"},
    yellow:{ic:"ti-run",   col:STATUS.yellow,bg:"#1E1A10",bd:"#FFB96760",name:"轻量有氧",zone:2,mins:35,detail:"Z2 · 低于 140 bpm"},
    red:{   ic:"ti-zzz",   col:STATUS.red,bg:"#1A0D14",bd:"#1E2E55",name:"休息",   zone:1,mins:20,detail:"仅拉伸"},
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
function NutritionCard({d,level,onTap}) {
  const isR=level==="red",isY=level==="yellow";
  const proT=isR?120:isY?130:140;
  const water=d.workout.calories>500?3.0:2.5;
  const items=[
    {ic:"ti-meat",   col:"#FFB967",  label:"蛋白质",unit:"g",  target:proT,          est:Math.round(proT*.45),     fc:"#FFB967"},
    {ic:"ti-grain",  col:"#4B69EF",  label:"碳水",  unit:"g",  target:50,            est:isR?50:22,                fc:"#4B69EF"},
    {ic:"ti-droplet",col:"#B6D8F7",  label:"补水",  unit:"L",  target:water,         est:parseFloat((water*.5).toFixed(1)),fc:"#B6D8F7"},
    {ic:"ti-leaf",   col:"#7E96FE",  label:"抗炎",  unit:"",   target:1,             est:isR||isY?0:1,             fc:"#7E96FE"},
    {ic:"ti-pill",   col:"#19309A",  label:"补剂",  unit:"",   target:1,             est:0,                        fc:"#7E96FE"},
  ];
  const modeLabel=isR?"休息日":isY?"恢复日":"训练日";
  const modeCol=isR?STATUS.red:isY?STATUS.yellow:STATUS.green;
  const timings=[
    {lbl:"训练前",       col:C.ink3,                        tc:C.mid},
    {lbl:"训练后 30分钟",col:"rgba(255,185,103,.18)",        tc:"#FFB967"},
    {lbl:"补水",         col:"rgba(182,216,247,.12)",        tc:"#B6D8F7"},
    ...(isR||isY?[{lbl:"抗炎食物",col:"rgba(126,150,254,.14)",tc:"#7E96FE"}]:[]),
    {lbl:"睡前补剂",     col:"rgba(25,48,154,.3)",           tc:"#7E96FE"},
  ];
  return (
    <Tap onTap={onTap}>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,overflow:"hidden",marginBottom:12}}>
        <div style={{padding:"11px 15px 10px",borderBottom:`1px solid ${C.ink3}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <Icon name="ti-salad" color={C.fog} size={14}/>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>营养</span>
          </div>
          <span style={{fontSize:11,fontWeight:600,color:modeCol}}>{modeLabel}</span>
        </div>
        {items.map((it,i)=>{
          const pct=it.target>1?(it.est/it.target)*100:it.est*100;
          const done=it.target===1&&it.est===1;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 15px",borderBottom:i<items.length-1?`1px solid ${C.ink3}`:"none"}}>
              <div style={{width:30,height:30,borderRadius:9,background:C.ink3,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <NutriIcon name={it.ic} color={it.col}/>
              </div>
              <span style={{fontSize:11,fontWeight:400,color:C.fog,width:44,flexShrink:0}}>{it.label}</span>
              <Bar pct={pct} color={it.fc}/>
              <div style={{flexShrink:0,textAlign:"right",minWidth:42}}>
                {it.target>1
                  ?<span style={{fontSize:11,fontWeight:500,color:C.mid}}>{it.est}<span style={{color:C.fog,fontSize:9}}>/{it.target}{it.unit}</span></span>
                  :<Icon name={done?"ti-check":"ti-alert-circle"} color={done?"#4B69EF":C.fog} size={13}/>
                }
              </div>
            </div>
          );
        })}
        {/* 时机标签 */}
        <div style={{padding:"9px 15px 13px",borderTop:`1px solid ${C.ink3}`,display:"flex",gap:5,flexWrap:"wrap"}}>
          {timings.map((tc,i)=>(
            <span key={i} style={{fontSize:9,fontWeight:500,padding:"3px 10px",borderRadius:99,background:tc.col,color:tc.tc,letterSpacing:".04em"}}>{tc.lbl}</span>
          ))}
        </div>
      </div>
    </Tap>
  );
}

// ─── AI 教练对话 ─────────────────────────────────────────────────────────────
function CoachPage({d}) {
  const [msgs,setMsgs]=useState([{role:"ai",text:`HRV ${Math.round(d.hrv)} ms · 心率 ${d.rhr} bpm · 睡眠 ${d.sleep.toFixed(1)} h · 今日力量 ${d.workout.duration} 分钟。想聊什么？`}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const ref=useRef(null);
  const chips=["今日训练分析","明日建议","本周总结","补剂方案","恢复评级"];
  const SYS=`你是 Johnny 的私人运动教练 AI。简洁专业，中文，≤120字。实时数据：${JSON.stringify(d)}。HRV黄灯(${Math.round(d.hrv)}ms)，今日力量${d.workout.duration}min，5/10截止日明天，高压期。`;
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
            style={{padding:"5px 13px",border:`1px solid ${C.ink3}`,borderRadius:99,fontSize:11,fontWeight:400,color:"#7E96FE",cursor:"pointer",background:"transparent"}}>
            {c}
          </button>
        ))}
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,padding:"4px 0"}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-end",flexDirection:m.role==="user"?"row-reverse":"row"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:m.role==="ai"?"#4B69EF":C.ink4,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:10,fontWeight:700,color:C.white}}>
              {m.role==="ai"?"AI":<Icon name="ti-run" color={C.fog} size={12}/>}
            </div>
            <div style={{maxWidth:"80%",padding:"11px 15px",fontSize:13.5,fontWeight:400,lineHeight:1.65,
              background:m.role==="ai"?C.ink2:"#FFB967",color:m.role==="ai"?C.lit:C.white,
              borderRadius:m.role==="ai"?"18px 18px 18px 4px":"18px 18px 4px 18px",
              border:m.role==="ai"?`1px solid ${C.ink3}`:"none"}}>{m.text}</div>
          </div>
        ))}
        {busy&&(
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"#4B69EF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:C.white,flexShrink:0}}>AI</div>
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
          style={{width:40,height:40,borderRadius:"50%",background:"#FFB967",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 20L20 12 4 4v6l12 2-12 2v6z" fill="#f0f0f0"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── 晨检 ───────────────────────────────────────────────────────────────────
function CheckinPage() {
  const [scores,setScores]=useState([0,0,0,0,0]);
  const [plv,setPlv]=useState(null);
  const items=[{l:"睡眠",ic:"ti-moon"},{l:"酸痛",ic:"ti-muscle"},{l:"精力",ic:"ti-bolt"},{l:"情绪",ic:"ti-mood-smile"},{l:"压力",ic:"ti-brain"}];
  const total=scores.every(s=>s>0)?scores.reduce((a,b)=>a+b,0):null;
  const fillCol=total===null?C.fog:total>=21?"#4B69EF":total>=15?"#FFB967":"#FF6B8A";
  const plevels=[{id:"low",l:"低压",ic:"ti-sun",col:"#4B69EF"},{id:"mid",l:"中压",ic:"ti-bolt",col:"#FFB967"},{id:"high",l:"高压",ic:"ti-flame",col:"#FF6B8A"}];
  return (
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:10}}>晨间自检</div>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"14px 15px 13px",marginBottom:12}}>
        {items.map((it,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<items.length-1?10:0}}>
            <Icon name={it.ic} color={C.fog} size={14}/>
            <span style={{fontSize:11,fontWeight:400,color:C.fog,width:34,flexShrink:0}}>{it.l}</span>
            <div style={{display:"flex",gap:4}}>
              {[1,2,3,4,5].map(v=>(
                <div key={v} onClick={()=>setScores(p=>{const n=[...p];n[i]=v;return n;})}
                  style={{width:27,height:27,borderRadius:9,border:`1px solid ${scores[i]>=v?"#FFB967":C.ink4}`,background:scores[i]>=v?`rgba(255,185,103,${.2+v*.14})`:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .12s"}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke={scores[i]>=v?C.white:"transparent"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              ))}
            </div>
            <Bar pct={scores[i]*20} color={"#FFB967"} h={3}/>
          </div>
        ))}
        <div style={{marginTop:14,paddingTop:13,borderTop:`1px solid ${C.ink3}`}}>
          <Bar pct={total?(total/25)*100:0} color={fillCol} h={6}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:10,fontWeight:500,color:C.fog}}>评分</span>
            <span style={{fontSize:13,fontWeight:600,color:fillCol}}>{total??"—"}<span style={{fontSize:9,color:C.fog}}>/25</span></span>
          </div>
        </div>
      </div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:10}}>工作压力</div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {plevels.map(pl=>{
          const active=plv===pl.id;
          const bgs={low:"rgba(37,192,104,.08)",mid:"rgba(255,107,0,.08)",high:"rgba(217,26,122,.08)"};
          const bds={low:"rgba(75,105,239,.35)",mid:"rgba(255,185,103,.35)",high:"rgba(255,107,138,.35)"};
          return (
            <button key={pl.id} onClick={()=>setPlv(pl.id)}
              style={{flex:1,padding:"12px 6px",border:`1px solid ${active?bds[pl.id]:C.ink3}`,borderRadius:14,background:active?bgs[pl.id]:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <Icon name={pl.ic} color={active?pl.col:C.fog} size={21}/>
              <span style={{fontSize:10,fontWeight:600,color:active?pl.col:"#3A527A"}}>{pl.l}</span>
            </button>
          );
        })}
      </div>
      <button style={{width:"100%",padding:14,background:"#FFB967",color:"#0D1629",border:"none",borderRadius:99,fontSize:13,fontWeight:600,letterSpacing:".06em",cursor:"pointer"}}>
        提交晨检
      </button>
    </div>
  );
}

// ─── 历史页 ─────────────────────────────────────────────────────────────────
function HistoryPage({d}) {
  const max=Math.max(...d.hrv_week.map(x=>x.val),80);
  return (
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:12}}>本周 HRV</div>
      <div style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:16,padding:"14px 15px 13px",marginBottom:12}}>
        {d.hrv_week.map((w,i)=>{
          const col=w.val>=55?"#4B69EF":w.val>=48?"#FFB967":"#FF6B8A";
          const isL=i===d.hrv_week.length-1;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<d.hrv_week.length-1?8:0}}>
              <span style={{fontSize:10,fontWeight:isL?700:400,color:isL?C.white:C.fog,width:28,flexShrink:0}}>{w.day}</span>
              <div style={{flex:1,height:7,background:C.ink3,borderRadius:99,overflow:"hidden"}}>
                <div style={{width:`${Math.round(w.val/max*100)}%`,height:"100%",background:col,borderRadius:99}}/>
              </div>
              <span style={{fontSize:11,fontWeight:isL?700:400,color:isL?C.white:C.fog,width:26,textAlign:"right"}}>{Math.round(w.val)}</span>
            </div>
          );
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
        {[{l:"HRV 均值",v:"54",u:"ms",c:"#FFB967"},{l:"心率均值",v:"57",u:"bpm",c:"#7E96FE"},{l:"本周训练",v:"5",u:"次",c:"#4B69EF"}].map((s,i)=>(
          <div key={i} style={{background:C.ink2,border:`1px solid ${C.ink3}`,borderRadius:14,padding:"12px 13px 11px"}}>
            <div style={{fontSize:9,fontWeight:600,letterSpacing:".12em",textTransform:"uppercase",color:C.fog,marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:21,fontWeight:400,color:s.c,letterSpacing:"-.02em"}}>{s.v}<span style={{fontSize:9,color:C.fog,marginLeft:2}}>{s.u}</span></div>
          </div>
        ))}
      </div>
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
  const d=liveData, level=getLevel(liveData);

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
    {id:"checkin",  ic:"ti-clipboard-check",l:"晨检"},
    {id:"coach",    ic:"ti-message-circle",l:"教练"},
    {id:"history",  ic:"ti-chart-line",l:"历史"},
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes breathe{0%,100%{transform:scale(.6);opacity:.2}50%{transform:scale(1.4);opacity:1}}
        @keyframes bop{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes slideUp{from{transform:translateY(72px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes ringPulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.18);opacity:.15}}
        @keyframes itemSlide{from{transform:translateX(-12px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes popIn{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
        button,input{outline:none;font-family:'DM Sans',sans-serif;}
        input::placeholder{color:#505050;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:99px;}
      `}</style>

      {/* ── 外层定位容器（不裁切，让 Modal 可以 absolute 覆盖） ── */}
      <div style={{
        maxWidth:680, margin:"0 auto",
        fontFamily:"'DM Sans',sans-serif",
        position:"relative",  /* Modal absolute 的锚点 */
        borderRadius:28,
        overflow:"hidden",    /* 裁切圆角 + 裁切 Modal 遮罩 */
        background:C.ink,
        backgroundImage:"linear-gradient(145deg, #0D1629 0%, #152040 100%)",
      }}>
        {/* Modal 放在最顶层，position:absolute inset:0 */}
        <Modal data={modal} onClose={()=>setModal(null)}/>
        {/* 同步动画覆盖层 */}
        <SyncOverlay phase={syncPhase} items={syncItems}/>

        {/* Topbar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px 12px",borderBottom:`1px solid ${C.ink3}`,background:C.ink}}>
          <span style={{fontSize:13,fontWeight:700,letterSpacing:".22em",textTransform:"uppercase",color:C.white}}>
            教练<em style={{fontStyle:"normal",color:"#FFB967"}}>.</em>AI
          </span>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {d.is_stale
              ? <span style={{fontSize:10,fontWeight:500,color:C.fog}}>数据待更新</span>
              : <span style={{fontSize:10,fontWeight:500,color:"#4B69EF"}}>{d.sync_date} {d.sync_time} ✓</span>
            }
            <button onClick={()=>doSync()}
              style={{display:"flex",alignItems:"center",gap:6,padding:"7px 16px",background:syncing?C.ink4:"#FFB967",border:"none",borderRadius:99,fontSize:11,fontWeight:600,letterSpacing:".06em",color:C.white,cursor:syncing?"not-allowed":"pointer",opacity:syncing?.7:1,transition:"opacity .2s"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={syncing?{animation:"spin 1s linear infinite"}:{}}><path d="M4 12a8 8 0 018-8 8 8 0 016.9 4M20 12a8 8 0 01-8 8 8 8 0 01-6.9-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/><path d="M20 4v4h-4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>同步
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav style={{display:"flex",background:C.ink2,borderBottom:`1px solid ${C.ink3}`}}>
          {nav.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"10px 4px",background:"transparent",border:"none",borderBottom:`2.5px solid ${tab===n.id?"#FFB967":"transparent"}`,cursor:"pointer",fontSize:10,fontWeight:tab===n.id?700:500,letterSpacing:".1em",textTransform:"uppercase",color:tab===n.id?"#FFB967":C.fog}}>
              <Icon name={n.ic} color={tab===n.id?"#FFB967":"#3A527A"} size={18}/>{n.l}
            </button>
          ))}
        </nav>

        {/* 页面内容 */}
        <div style={{padding:"16px 16px 32px",minHeight:400}}>
          {tab==="dashboard"&&<>
            <AnomalyStrip d={d} level={level}/>
            <StatusRing d={d} level={level} onTap={()=>openModal("status")}/>
            <MetricRow d={d} onTap={openModal}/>
            <SleepCard d={d} onTap={()=>openModal("sleep")}/>
            <HRVChart d={d} onTap={()=>openModal("hrv_chart")}/>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:10}}>明日计划</div>
            <RecCard level={level} onTap={()=>openModal("rec")}/>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:C.fog,marginBottom:10}}>营养</div>
            <NutritionCard d={d} level={level} onTap={()=>openModal("nutrition")}/>
          </>}
          {tab==="checkin"&&<CheckinPage/>}
          {tab==="coach"&&<CoachPage d={d}/>}
          {tab==="history"&&<HistoryPage d={d}/>}
        </div>
      </div>
    </>
  );
}
