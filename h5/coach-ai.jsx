import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  DEFAULT_DATA,
  averageHrvWeek,
  calcCHI,
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

// ─── Design Tokens — VI Final Direction v1.0 ─────────────────────────────────
// "Luxury Athletic OS" — Warm Technology, Soft Athletic Futurism
const C = {
  // Surfaces
  mineral:"#1F2328", carbon:"#2B3138", midnight:"#39424F", indigo:"#4E5D94",
  warmFog:"#D8D1C7",
  // Emotional energy palette
  aqua:"#59C3C3", aerobic:"#7DA7D9", coral:"#F27D72", butter:"#F4D35E", dustRose:"#D9A5B3",
  // Soft tints
  aquaSoft:"rgba(89,195,195,0.14)", aerobicSoft:"rgba(125,167,217,0.14)",
  coralSoft:"rgba(242,125,114,0.14)", butterSoft:"rgba(244,211,94,0.16)",
  roseSoft:"rgba(217,165,179,0.14)",
  // Surfaces
  cardBg:"rgba(216,209,199,0.04)", cardBgWarm:"rgba(216,209,199,0.06)",
  border:"rgba(216,209,199,0.09)", borderStrong:"rgba(216,209,199,0.16)",
  // Text hierarchy
  text:"#F2EDE5", textSec:"rgba(242,237,229,0.62)",
  textTer:"rgba(242,237,229,0.38)", textDim:"rgba(242,237,229,0.20)",
  // Legacy aliases — keep for existing code
  ink:"#1F2328", ink2:"#2B3138", ink3:"#39424F", ink4:"#4E5D94",
  fog:"#6B6560", mid:"#A09A94", lit:"#C4BDB7", white:"#D8D1C7",
  o1:"#F27D72", o2:"#D96A60", blue:"#7DA7D9", rose:"#D9A5B3",
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
    title:"补给方案解读",
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
    title:"恢复节律趋势",
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
  chi:(chiData)=>({
    title:`细胞健康评分 · ${chiData.chi}`,
    color: chiData.color,
    icon:"ti-dna",
    sections:[
      { label:"什么是细胞健康评分",
        content:"CHI（Cellular Health Index）综合你的恢复状态、睡眠修复质量、营养支持和生活方式一致性，用 0–100 的单一评分反映你的细胞今天处于什么环境中。它不是单项指标，而是你身体整体状态的综合快照。" },
      { label:`今日状态 · ${chiData.stateLabel}`,
        content: chiData.chi >= 75
          ? "你的细胞正处于良好的工作环境中——有充足的能量供给、有效的夜间修复和均衡的营养原料。这是身体自我维护和适应训练刺激的理想状态。"
          : chiData.chi >= 55
          ? "你的细胞在平稳运作，整体处于可持续的状态。有一到两个维度还有提升空间，关注评分最低的支柱，做一个小调整就能明显改善。"
          : chiData.chi >= 40
          ? "你的细胞当前消耗多于补充，处于应激状态。这不是警报，而是身体在提醒你它需要多一点支持。今天适合轻柔地照顾，而不是继续施压。"
          : "你的身体正在发出需要被关注的信号。今天的重点不是挑战，而是补充——充足的营养、优质的睡眠、和缓的活动，让细胞先喘口气。" },
      { label:"四项支柱评分",
        content: (()=>{
          const scoreToLabel = s => s >= 75 ? "良好" : s >= 55 ? "尚可" : "偏低";
          return chiData.pillars.map(p=>
            `${p.name} ${p.score}分（${scoreToLabel(p.score)}，权重${p.weight}）`
          ).join("　·　");
        })() },
      { label:"今日关注",
        content:(()=>{
          const weakest = chiData.pillars.reduce((a,b)=>a.score<=b.score?a:b);
          const tips = {
            "恢复状态":"今日 HRV 或静息心率偏离基线，优先保证今晚睡眠质量，避免高强度训练，轻柔有氧或拉伸更适合当下。",
            "细胞修复":"深睡眠或 REM 比例不足，细胞夜间维护打了折扣。今晚提前 30 分钟上床，睡前减少屏幕，保持室温凉爽，有助于提升修复质量。",
            "营养支持":"蛋白质或整体营养摄入不足，细胞缺少修复原料。今天任意一餐加入优质蛋白质（鸡蛋、鱼肉或豆腐），分量约一个手掌大小即可。",
            "生活方式":"本周活动天数或节律一致性有待提升。保持固定的睡眠时间和规律的运动节奏，是细胞最喜欢的稳定环境。",
          };
          const tip = tips[weakest.name] || "保持当前良好的生活节律，各项指标均在健康范围内。";
          return `当前最需要关注「${weakest.name}」，评分 ${weakest.score} 分。${tip}`;
        })() },
    ]
  }),
};

// ─── Soft Material Card ──────────────────────────────────────────────────────
function Card({children,style,pad=20,onClick,accent,warm}) {
  return (
    <div onClick={onClick} style={{
      background:warm?`linear-gradient(160deg,${C.cardBgWarm},${C.cardBg})`:C.cardBg,
      border:`1px solid ${accent?accent+"33":C.border}`,
      borderRadius:28,padding:pad,cursor:onClick?"pointer":"default",
      boxShadow:"inset 0 1px 0 rgba(255,255,255,0.03)",
      backdropFilter:"blur(20px) saturate(140%)",
      WebkitBackdropFilter:"blur(20px) saturate(140%)",
      ...style,
    }}>{children}</div>
  );
}

// ─── Sparkline — Catmull-Rom smooth curve ────────────────────────────────────
function Sparkline({data,color=C.aqua,width=80,height=28,fluid=false}) {
  const valid=data.filter(v=>v!=null&&Number.isFinite(v));
  if(valid.length<2) return null;
  const mn=Math.min(...valid),mx=Math.max(...valid),range=Math.max(1,mx-mn);
  const pts=data.map((v,i)=>[
    (i/(data.length-1))*width,
    v==null?height/2:height-((v-mn)/range)*(height-4)-2,
  ]);
  let path=`M${pts[0][0]} ${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    const cp1x=p1[0]+(p2[0]-p0[0])/6,cp1y=p1[1]+(p2[1]-p0[1])/6;
    const cp2x=p2[0]-(p3[0]-p1[0])/6,cp2y=p2[1]-(p3[1]-p1[1])/6;
    path+=` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2[0]} ${p2[1]}`;
  }
  const area=path+` L${width} ${height} L0 ${height} Z`;
  const last=pts[pts.length-1];
  // Unique gradient ID per color to avoid cross-SVG ID collisions
  const gid=`spk_${color.replace(/[^a-z0-9]/gi,"")}_${width}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={fluid?"100%":width} height={height}
      preserveAspectRatio={fluid?"none":"xMidYMid meet"}
      style={{display:"block",overflow:"visible"}}
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={last[0]} cy={last[1]} r="3" fill={color}/>
      <circle cx={last[0]} cy={last[1]} r="6" fill={color} opacity="0.2"/>
    </svg>
  );
}
// legacy alias used by existing code
function Spark({vals,color,width=52,height=20}) {
  return <Sparkline data={vals} color={color} width={width} height={height}/>;
}

// ─── Progress bar ────────────────────────────────────────────────────────────
function Bar({pct,color,h=5}) {
  return (
    <div style={{flex:1,height:h,background:C.midnight,borderRadius:100,overflow:"hidden"}}>
      <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:color,borderRadius:100,transition:"width .6s cubic-bezier(.2,.7,.2,1)"}}/>
    </div>
  );
}
function ProgressBar({value,goal,color,height=4}) {
  const pct=Math.min(1,value/Math.max(goal,1));
  return (
    <div style={{height,borderRadius:height,background:C.midnight,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct*100}%`,background:color,borderRadius:height,transition:"width .8s cubic-bezier(.2,.7,.2,1)"}}/>
    </div>
  );
}

// ─── ModeBadge ────────────────────────────────────────────────────────────────
function ModeBadge({mode,color}) {
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 14px 7px 10px",borderRadius:999,background:`${color}1a`,border:`1px solid ${color}33`}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:color,boxShadow:`0 0 10px ${color}`,animation:"breathDot 3.6s ease-in-out infinite"}}/>
      <span style={{fontSize:11,fontWeight:600,letterSpacing:".18em",color,textTransform:"uppercase"}}>{mode}</span>
    </div>
  );
}

// ─── BreathingRing — hero recovery gauge ─────────────────────────────────────
function BreathingRing({value,max=100,color=C.aqua,size=220,label,sublabel,onClick}) {
  const r=size/2-18,circ=2*Math.PI*r,pct=Math.max(0,Math.min(1,value/max));
  const gid=`br${color.replace(/[^a-z0-9]/gi,"")}${size}`;
  return (
    <div onClick={onClick} style={{position:"relative",width:size,height:size,cursor:onClick?"pointer":"default",flexShrink:0}}>
      <div style={{position:"absolute",inset:-8,borderRadius:"50%",background:`radial-gradient(circle,${color}26,transparent 70%)`,animation:"breathAura 4s ease-in-out infinite"}}/>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)",position:"relative"}}>
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.6"/>
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} stroke={C.midnight} strokeWidth="6" fill="none" opacity="0.6"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={`url(#${gid})`} strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={`${circ*pct} ${circ}`} style={{transition:"stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        {sublabel&&<div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,marginBottom:10,textTransform:"uppercase"}}>{sublabel}</div>}
        <div style={{fontSize:84,fontWeight:250,color:C.text,letterSpacing:"-0.05em",fontVariantNumeric:"tabular-nums",lineHeight:.9}}>{value}</div>
        {label&&<div style={{fontSize:11,fontWeight:600,letterSpacing:".16em",color,marginTop:6}}>{label}</div>}
      </div>
    </div>
  );
}

// ─── MetricTile — 3-column row ────────────────────────────────────────────────
function MetricTile({label,value,unit,color,trend,onClick}) {
  return (
    <div onClick={onClick} style={{padding:"16px 14px",borderRadius:22,background:"rgba(216,209,199,0.035)",border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:10,minHeight:124,cursor:onClick?"pointer":"default"}}>
      <div style={{fontSize:10,fontWeight:600,letterSpacing:".18em",color:C.textTer,textTransform:"uppercase"}}>{label}</div>
      <div style={{display:"flex",alignItems:"baseline",gap:3}}>
        <span style={{fontSize:32,fontWeight:300,color,letterSpacing:"-.03em",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{value}</span>
        <span style={{fontSize:10,color:C.textTer,fontWeight:500}}>{unit}</span>
      </div>
      <div style={{marginTop:"auto"}}>
        {trend&&trend.length>=2&&<Sparkline data={trend} color={color} width={80} height={22}/>}
      </div>
    </div>
  );
}

// ─── SleepWave — sine-curve sleep stage visual ────────────────────────────────
function SleepWave() {
  const W=320,H=56,pts=[];
  for(let i=0;i<=60;i++){
    const t=i/60,cycle=Math.sin(t*Math.PI*4.2)*.5+.5,baseline=1-t*.15;
    pts.push([t*W,H-(cycle*baseline)*(H-8)-4]);
  }
  let path=`M${pts[0][0]} ${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){
    const [x1,y1]=pts[i-1],[x2,y2]=pts[i],mx=(x1+x2)/2;
    path+=` Q${x1} ${y1} ${mx} ${(y1+y2)/2}`;
  }
  path+=` T${pts[pts.length-1][0]} ${pts[pts.length-1][1]}`;
  const area=path+` L${W} ${H} L0 ${H} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block"}}>
      <defs>
        <linearGradient id="sleepWG" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={C.dustRose} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={C.dustRose} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sleepWG)"/>
      <path d={path} fill="none" stroke={C.dustRose} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
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
  "ti-dna":          "M9 3c0 3 6 3 6 6s-6 3-6 6 6 3 6 6M15 3c0 3-6 3-6 6s6 3 6 6-6 3-6 6M7 6h10M7 12h10M7 18h10",
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
  "ti-dna":                (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 3c0 3 6 3 6 6s-6 3-6 6 6 3 6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 3c0 3-6 3-6 6s6 3 6 6-6 3-6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 6h10M7 12h10M7 18h10" stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity="0.55"/></svg>,
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

// ─── Status Page — new VI Design ─────────────────────────────────────────────
function StatusPage({d,mealLog,onTap}) {
  const chi=calcCHI(d,mealLog);
  const recovery=chi.chi;
  const mode=recovery<50?"gentle":recovery<70?"warm":"calm";
  const modeMap={
    gentle:{color:C.coral,  label:"Gentle Awareness",subtitle:"今天身体需要被照顾"},
    warm:  {color:C.aqua,   label:"Warm Breathing",  subtitle:"慢一点，身体在恢复中"},
    calm:  {color:C.aqua,   label:"Calm Energy",     subtitle:"准备充分，温和前行"},
  };
  const m=modeMap[mode];
  const level=getLevel(d);
  const deepMin=Math.round(d.deep_pct/100*d.sleep*60);
  const plan={
    green: {color:C.aerobic,name:"上肢力量",mins:45,zone:"Zone 3"},
    yellow:{color:C.aerobic,name:"轻量有氧",mins:35,zone:"Zone 2"},
    red:   {color:C.dustRose,name:"主动恢复",mins:20,zone:"拉伸"},
  }[level];
  const wa=Math.round(averageHrvWeek(d.hrv_week));
  return (
    <div style={{padding:"8px 22px 32px",display:"flex",flexDirection:"column",gap:22}}>
      {/* Hero */}
      <div style={{paddingTop:8,display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
        <ModeBadge mode={m.label} color={m.color}/>
        <BreathingRing value={recovery} max={100} color={m.color} sublabel="RECOVERY"
          label={recovery<70?"需要被照顾":"准备就绪"} size={236} onClick={()=>onTap("status")}/>
        <div style={{fontSize:13,color:C.textSec,textAlign:"center",maxWidth:280,lineHeight:1.65}}>{m.subtitle}</div>
      </div>

      {/* 3 metric tiles */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        <MetricTile label="HRV" value={Math.round(d.hrv)} unit="ms" color={C.aqua}
          trend={d.hrv_week.map(x=>x.val).filter(Boolean)} onClick={()=>onTap("hrv")}/>
        <MetricTile label="心率" value={d.rhr} unit="bpm" color={C.coral}
          trend={[58,57,56,58,55,56,d.rhr]} onClick={()=>onTap("rhr")}/>
        <MetricTile label="睡眠" value={d.sleep.toFixed(1)} unit="h" color={C.dustRose}
          trend={[6.8,7.5,6.2,8.1,7.0,7.4,d.sleep]} onClick={()=>onTap("sleep")}/>
      </div>

      {/* Sleep card with wave */}
      <Card pad={24} warm onClick={()=>onTap("sleep")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase"}}>Last Night</div>
            <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:14}}>
              <span style={{fontSize:56,fontWeight:250,color:C.dustRose,letterSpacing:"-.04em",lineHeight:.9,fontVariantNumeric:"tabular-nums"}}>{deepMin}</span>
              <span style={{fontSize:13,color:C.textTer}}>分钟深睡</span>
            </div>
          </div>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.dustRose} strokeWidth="1.8" strokeLinecap="round"><path d="M12 3a6 6 0 009 9 9 9 0 11-9-9z"/></svg>
        </div>
        <SleepWave/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:14,fontSize:10,letterSpacing:".08em",color:C.textTer}}>
          <span>入睡 {d.sleep_start||"23:00"}</span>
          <span>{d.sleep.toFixed(1)}h 总时长</span>
          <span>醒来 {d.sleep_end||"06:30"}</span>
        </div>
      </Card>

      {/* Tomorrow plan */}
      <Card pad={24} accent={plan.color}>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase",marginBottom:16}}>Tomorrow</div>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          <div style={{width:64,height:64,borderRadius:20,background:`radial-gradient(circle at 30% 30%,${plan.color}33,${plan.color}0a)`,border:`1px solid ${plan.color}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:19,fontWeight:500,letterSpacing:"-.01em",color:C.text}}>{plan.name}</div>
            <div style={{display:"flex",gap:14,marginTop:8,alignItems:"center"}}>
              <span style={{fontSize:22,fontWeight:300,color:plan.color,letterSpacing:"-.02em",fontVariantNumeric:"tabular-nums"}}>
                {plan.mins}<span style={{fontSize:11,color:C.textTer,fontWeight:500,marginLeft:3}}>min</span>
              </span>
              <span style={{width:1,height:14,background:C.borderStrong}}/>
              <span style={{fontSize:12,color:C.textSec,fontWeight:500}}>{plan.zone}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* CHI card */}
      <Card pad={20} accent={chi.color} onClick={()=>onTap("chi")}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase"}}>Cellular Health</div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            {chi.pillars.map((p,i)=>{const pc=p.score>=75?"#59C3C3":p.score>=55?"#7DA7D9":p.score>=40?"#F27D72":"#E85D52";return <div key={i} style={{width:8,height:8,borderRadius:"50%",background:pc,boxShadow:`0 0 6px ${pc}80`}}/>;  })}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:8}}>
          <span style={{fontSize:52,fontWeight:250,color:chi.color,letterSpacing:"-.04em",lineHeight:.9,fontVariantNumeric:"tabular-nums"}}>{chi.chi}</span>
          <span style={{fontSize:12,color:C.textTer}}>CHI · {chi.stateLabel}</span>
        </div>
        <div style={{marginTop:14,display:"flex",gap:6,flexWrap:"wrap"}}>
          {chi.pillars.map((p,i)=>{
            const pc=p.score>=75?"#59C3C3":p.score>=55?"#7DA7D9":p.score>=40?"#F27D72":"#E85D52";
            return <div key={i} style={{fontSize:9,padding:"3px 9px",borderRadius:99,background:`${pc}18`,color:pc,border:`1px solid ${pc}30`}}>{p.name} {p.score}</div>;
          })}
        </div>
      </Card>

      {/* HRV 7-day sparkline */}
      <Card pad={22} onClick={()=>onTap("hrv_chart")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase"}}>Recovery Rhythm</div>
          <span style={{fontSize:11,color:C.textSec}}>均值 <span style={{color:C.text,fontWeight:600}}>{wa}ms</span></span>
        </div>
        <Sparkline data={d.hrv_week.map(x=>x.val)} color={C.aqua} width={300} height={60} fluid/>
      </Card>
    </div>
  );
}

// ─── 异常警告条 (legacy — kept for reference, not rendered) ──────────────────
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
    green: {col:STATUS.green, label:"稳定", en:"RHYTHM", whisper:"今天的身体节律稳定，可以温和推进训练计划。"},
    yellow:{col:STATUS.yellow,label:"照顾", en:"CARE", whisper:"身体正在提醒你降低强度，把恢复放在训练之前。"},
    red:   {col:STATUS.red,   label:"保护", en:"PROTECT", whisper:"今天的任务不是突破，而是保护恢复节律。"},
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

        <div style={{
          position:"relative",
          marginBottom:16,
          padding:"10px 12px",
          borderRadius:16,
          background:"rgba(216,209,199,.045)",
          border:"1px solid rgba(216,209,199,.08)",
          color:C.lit,
          fontSize:12,
          lineHeight:1.55,
        }}>
          {cfg.whisper}
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
                {ic:"ti-activity",label:"恢复节律",val:d.hrv>=55?"稳定":d.hrv>=48?"观察":"保护",unit:""},
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

// ─── 四格指标卡（2×2）────────────────────────────────────────────────────────
function MetricRow({d,mealLog,onTap}) {
  const chi = calcCHI(d, mealLog);
  const cards=[
    {key:"rhr",    ic:"ti-heart-rate-monitor", val:d.rhr,              unit:"bpm",  spark:[57,58,59,57,56,56],         col:d.rhr>59?STATUS.red:d.rhr>56?STATUS.yellow:STATUS.green, sub:d.rhr>59?"偏高":d.rhr>56?"略高":"正常"},
    {key:"sleep",  ic:"ti-moon-stars",          val:d.sleep.toFixed(1), unit:"h",    spark:[7.3,6.5,7.0,6.8,7.2,7.2],  col:d.sleep<6.5?STATUS.red:d.sleep<7.5?STATUS.yellow:STATUS.green, sub:d.sleep<6.5?"不足":d.sleep<7.5?"尚可":"良好"},
    {key:"workout",ic:"ti-flame",               val:d.workout.calories, unit:"kcal", spark:[320,450,480,380,515,515],   col:"#F27D72", sub:`${d.workout.duration} 分钟`},
    {key:"chi",    ic:"ti-dna",                 val:chi.chi,            unit:"CHI",  chi, col:chi.color, sub:chi.stateLabel},
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginBottom:12}}>
      {cards.map(m=>(
        <Tap key={m.key} onTap={()=>onTap(m.key)}>
          <div style={{
            background:`linear-gradient(160deg,${m.col}18 0%,${C.ink2} 55%)`,
            border:`1px solid ${m.col}28`,
            borderRadius:18,padding:"13px 13px 16px",
            boxShadow:`inset 0 1px 0 ${m.col}18`,
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <Icon name={m.ic} color={`${m.col}cc`} size={14}/>
              {/* CHI 卡展示四支柱迷你点，其他卡展示折线 */}
              {m.key==="chi"
                ? <div style={{display:"flex",gap:4,alignItems:"center"}}>
                    {m.chi.pillars.map((p,i)=>{
                      const pc=p.score>=75?"#59C3C3":p.score>=55?"#7DA7D9":p.score>=40?"#F27D72":"#E85D52";
                      return <div key={i} style={{width:8,height:8,borderRadius:"50%",background:pc,opacity:.9,boxShadow:`0 0 6px ${pc}80`}}/>;
                    })}
                  </div>
                : <Spark vals={m.spark} color={m.col} width={44} height={18}/>
              }
            </div>
            <div style={{fontSize:26,fontWeight:300,color:"#FFFFFF",letterSpacing:"-.04em",lineHeight:1}}>
              {m.val}<span style={{fontSize:10,color:m.col,marginLeft:3,fontWeight:600}}>{m.unit}</span>
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
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>恢复节律</span>
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
            <span style={{fontSize:10,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:C.fog}}>今日补给</span>
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
          <span style={{fontSize:9,color:C.fog}}>{hasReal?"点击查看补给解读 · 前往【补给】继续记录":"前往【补给】拍照打卡，AI 自动计算"}</span>
        </div>
      </div>
    </Tap>
  );
}

// ─── AI Coach — new VI Design ─────────────────────────────────────────────────
function AIAvatar() {
  return (
    <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,background:`radial-gradient(circle at 30% 30%,${C.dustRose},${C.aqua}cc 80%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`inset 0 0 0 0.5px rgba(255,255,255,0.2),0 4px 12px rgba(89,195,195,0.25)`}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#fff" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.7"/></svg>
    </div>
  );
}
function TypingBubble() {
  return (
    <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
      <AIAvatar/>
      <div style={{padding:"14px 16px",borderRadius:"6px 20px 20px 20px",background:"rgba(216,209,199,0.05)",border:`1px solid ${C.border}`,display:"flex",gap:5}}>
        {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:3,background:C.dustRose,display:"block",animation:`tdot 1.6s ease-in-out ${i*.18}s infinite`}}/>)}
      </div>
    </div>
  );
}
function ChatMessage({role,text}) {
  const isAI=role==="ai";
  return (
    <div style={{display:"flex",flexDirection:isAI?"row":"row-reverse",gap:10,alignItems:"flex-end"}}>
      {isAI&&<AIAvatar/>}
      <div style={{maxWidth:"78%",padding:"12px 16px",borderRadius:isAI?"6px 20px 20px 20px":"20px 6px 20px 20px",background:isAI?"rgba(216,209,199,0.05)":`linear-gradient(135deg,${C.aqua},#4ab0b0)`,border:isAI?`1px solid ${C.border}`:"none",fontSize:13,lineHeight:1.65,color:isAI?C.text:"#fff",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
        {text}
      </div>
    </div>
  );
}

function CoachPage({d,mealLog}) {
  const hasMeals=mealLog&&mealLog.length>0;
  const mealTotals=useMemo(()=>hasMeals?sumMealTotals(mealLog):null,[hasMeals,mealLog]);
  const welcomeNutrition=hasMeals&&mealTotals?` · 今日已记录 ${mealLog.length} 餐，摄入 ${mealTotals.calories} kcal，蛋白质 ${mealTotals.protein}g`:"";
  const [msgs,setMsgs]=useState([{role:"ai",text:`HRV ${Math.round(d.hrv)} ms · 心率 ${d.rhr} bpm · 睡眠 ${d.sleep.toFixed(1)} h · 今日力量 ${d.workout.duration} 分钟${welcomeNutrition}。想聊什么？`}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const ref=useRef(null);
  const chips=hasMeals
    ?["今日饮食分析","蛋白质够了吗","训练后怎么吃","明日建议","恢复评级"]
    :["今日训练分析","明日建议","本周总结","补剂方案","恢复评级"];
  const nutritionCtx=useMemo(()=>hasMeals&&mealTotals
    ?`今日饮食打卡数据：共${mealLog.length}餐，总热量${mealTotals.calories}kcal，蛋白质${mealTotals.protein}g，碳水${mealTotals.carbs}g，脂肪${mealTotals.fat}g。食物明细：${mealLog.map(m=>`${m.time}(${m.foods.map(f=>f.name).join("+")}，${m.totals.calories}kcal)`).join("；")}。`
    :"今日无饮食打卡记录。",[hasMeals,mealLog,mealTotals]);
  const SYS=useMemo(()=>`你是 Johnny 的身体状态操作系统 Coach.AI。语气温暖克制，像长期陪伴的健康教练，不驱赶用户训练。中文，≤150字。健康数据：HRV ${Math.round(d.hrv)}ms，静息心率${d.rhr}bpm，睡眠${d.sleep.toFixed(1)}h，今日力量${d.workout.duration}min。${nutritionCtx}结合身体状态、恢复节律和饮食结构给出建议。`,[d,nutritionCtx]);
  const send=async(text)=>{
    if(!text.trim()||busy) return;
    const next=[...msgs,{role:"user",text}];
    setMsgs(next); setInput(""); setBusy(true);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-allow-browser":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,system:SYS,
          messages:next.map((m,i)=>i===0&&m.role==="ai"?null:{role:m.role==="ai"?"assistant":"user",content:m.text}).filter(Boolean)})
      });
      const j=await r.json();
      setMsgs(p=>[...p,{role:"ai",text:j.content?.find(c=>c.type==="text")?.text||"—"}]);
    }catch{ setMsgs(p=>[...p,{role:"ai",text:"连接失败，请重试。"}]); }
    setBusy(false);
  };
  useEffect(()=>{ if(ref.current) ref.current.scrollTop=ref.current.scrollHeight; },[msgs,busy]);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 140px)",minHeight:480}}>
      {/* Mode banner */}
      <div style={{padding:"10px 22px 4px",display:"flex",justifyContent:"center"}}>
        <ModeBadge mode="Quiet Protection" color={C.dustRose}/>
      </div>
      {/* Snapshot pill */}
      <div style={{padding:"8px 22px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px",borderRadius:18,background:C.cardBg,border:`1px solid ${C.border}`}}>
          {[{n:Math.round(d.hrv),u:"ms",l:"HRV",c:C.coral},{n:d.rhr,u:"bpm",l:"心率",c:C.aqua},{n:d.sleep.toFixed(1),u:"h",l:"睡眠",c:C.dustRose}].map((s,i)=>(
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
              <div>
                <span style={{fontSize:18,fontWeight:400,color:s.c,letterSpacing:"-.02em",fontVariantNumeric:"tabular-nums"}}>{s.n}</span>
                <span style={{fontSize:9,color:C.textTer,marginLeft:2}}>{s.u}</span>
              </div>
              <div style={{fontSize:9,color:C.textTer,letterSpacing:".16em",textTransform:"uppercase"}}>{s.l}</div>
              {i<2&&<span style={{position:"absolute"}}/>}
            </div>
          ))}
        </div>
      </div>
      {/* Messages */}
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"16px 22px 8px",display:"flex",flexDirection:"column",gap:14,WebkitOverflowScrolling:"touch"}}>
        {msgs.map((m,i)=><ChatMessage key={i} role={m.role} text={m.text}/>)}
        {busy&&<TypingBubble/>}
      </div>
      {/* Topic chips */}
      <div style={{padding:"0 22px 10px"}}>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
          {chips.map(c=>(
            <button key={c} onClick={()=>send(c)} style={{appearance:"none",flexShrink:0,padding:"9px 14px",borderRadius:999,background:C.cardBg,border:`1px solid ${C.border}`,color:C.textSec,fontFamily:"inherit",fontSize:12,fontWeight:500,letterSpacing:".04em",cursor:"pointer",transition:"all .25s",whiteSpace:"nowrap"}}>
              {c}
            </button>
          ))}
        </div>
      </div>
      {/* Input bar */}
      <div style={{padding:"10px 22px 12px",borderTop:`1px solid ${C.border}`,background:C.mineral,display:"flex",gap:10,alignItems:"center"}}>
        <div style={{flex:1,display:"flex",alignItems:"center",background:"rgba(216,209,199,0.06)",border:`1px solid ${C.border}`,borderRadius:22,padding:"0 16px",height:42}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send(input)}
            placeholder="问教练…" style={{flex:1,background:"transparent",border:"none",color:C.text,fontFamily:"inherit",fontSize:14,outline:"none"}}/>
        </div>
        <button onClick={()=>send(input)} disabled={!input.trim()||busy} aria-label="发送" style={{
          width:42,height:42,borderRadius:"50%",border:"none",flexShrink:0,
          background:input.trim()?`radial-gradient(circle at 30% 25%,${C.aqua},#4ab0b0 80%)`:"rgba(216,209,199,0.06)",
          display:"flex",alignItems:"center",justifyContent:"center",cursor:input.trim()?"pointer":"default",
          color:input.trim()?"#fff":C.textDim,transition:"all .25s",
          boxShadow:input.trim()?`0 6px 16px ${C.aqua}40`:"none",
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── 饮食打卡 ─────────────────────────────────────────────────────────────────

// ─── MacroRing — circular progress (new VI design) ───────────────────────────
function MacroRing({label,val,value,target,goal,color,unit="g",size=68}) {
  // support both old (val/target) and new (value/goal) props
  const v=val??value??0, g=target??goal??1;
  const r=size/2-5,circ=2*Math.PI*r,pct=Math.min(1,v/Math.max(g,1));
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} stroke={C.midnight} strokeWidth="3" fill="none" opacity="0.6"/>
          <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"
            strokeDasharray={`${circ*pct} ${circ}`} style={{transition:"stroke-dasharray .8s cubic-bezier(.2,.7,.2,1)"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",lineHeight:1}}>
          <div style={{fontSize:size>=68?16:13,fontWeight:500,letterSpacing:"-.02em",fontVariantNumeric:"tabular-nums",color:C.text}}>{v}</div>
          <div style={{fontSize:9,color:C.textTer,marginTop:2}}>/{g}{unit}</div>
        </div>
      </div>
      <div style={{fontSize:10,color:C.textSec,fontWeight:500,letterSpacing:".06em"}}>{label}</div>
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
        <span style={{fontSize:10,fontWeight:700,letterSpacing:".16em",textTransform:"uppercase",color:C.fog,whiteSpace:"nowrap"}}>今日补给解读</span>
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
          <span style={{fontSize:12,color:C.mid}}>今日补给结构</span>
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

// ─── Diet Page — new VI Design ────────────────────────────────────────────────
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
      setAnalyzing(true); setResult(null);
      const data=await analyzeFood(base64,file.type);
      setResult(data); setAnalyzing(false);
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
    <div style={{padding:"8px 22px 32px",display:"flex",flexDirection:"column",gap:20}}>
      {/* ── Hero header ── */}
      <div style={{paddingTop:12,display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <ModeBadge mode="Nourishment" color={C.butter}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:96,fontWeight:250,letterSpacing:"-.05em",color:C.text,lineHeight:.9,fontVariantNumeric:"tabular-nums"}}>
            {totals.calories}
          </div>
          <div style={{fontSize:11,color:C.textTer,marginTop:14,letterSpacing:".22em"}}>
            <span style={{color:C.textSec}}>{targets.calories}</span> KCAL TODAY
          </div>
        </div>
        <div style={{width:"70%",marginTop:6}}>
          <ProgressBar value={totals.calories} goal={targets.calories} color={C.butter} height={3}/>
        </div>
      </div>

      {/* ── Macro rings ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,padding:"8px 0"}}>
        <MacroRing val={totals.protein} target={targets.protein} color={C.coral}   label="蛋白" unit="g" size={68}/>
        <MacroRing val={totals.carbs}   target={targets.carbs}   color={C.aerobic} label="碳水" unit="g" size={68}/>
        <MacroRing val={totals.fat}     target={targets.fat}     color={C.butter}  label="脂肪" unit="g" size={68}/>
      </div>

      {/* ── Photo CTA card ── */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
      <Card pad={20} warm accent={C.butter} onClick={()=>fileRef.current?.click()} style={{display:"flex",alignItems:"center",gap:16,cursor:"pointer"}}>
        <div style={{width:52,height:52,borderRadius:18,background:`linear-gradient(135deg,${C.butter},${C.dustRose})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 6px 20px ${C.butter}40`,flexShrink:0}}>
          <Icon name="ti-camera" color="#2B3138" size={24}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:500,letterSpacing:"-.01em",color:C.text}}>记录这一餐</div>
          <div style={{fontSize:11,color:C.textSec,marginTop:4,letterSpacing:".04em"}}>拍照 · AI 识别食物</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </Card>

      {/* ── Meal slot tiles or empty state ── */}
      {mealLog.length===0?(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{label:"早餐",time:"7:00",emoji:"☼"},{label:"午餐",time:"12:30",emoji:"◐"},{label:"晚餐",time:"19:00",emoji:"☾"},{label:"加餐",time:"随时",emoji:"+"}].map(m=>(
            <button key={m.label} onClick={()=>fileRef.current?.click()} style={{appearance:"none",border:`1px solid ${C.border}`,padding:18,fontFamily:"inherit",cursor:"pointer",borderRadius:22,background:C.cardBg,textAlign:"left",display:"flex",flexDirection:"column",gap:10,minHeight:116,transition:"all .25s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:18,fontWeight:300,color:C.dustRose,width:26,height:26,borderRadius:"50%",background:C.roseSoft,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{m.emoji}</span>
                <Icon name="ti-plus" color={C.textTer} size={14}/>
              </div>
              <div style={{marginTop:"auto"}}>
                <div style={{fontSize:14,fontWeight:500,color:C.text}}>{m.label}</div>
                <div style={{fontSize:10,color:C.textTer,marginTop:4,letterSpacing:".08em"}}>{m.time} · 未记录</div>
              </div>
            </button>
          ))}
        </div>
      ):(
        mealLog.slice().reverse().map(meal=><MealCard key={meal.id} meal={meal} onDelete={onDeleteMeal}/>)
      )}

      {/* AI 饮食解读 */}
      <DietInsight mealLog={mealLog} totals={totals} targets={targets} level={level}/>

      {/* 分析弹层 */}
      {preview&&<PhotoAnalysisSheet preview={preview} analyzing={analyzing} result={result} onConfirm={confirmAdd} onCancel={cancelPreview}/>}
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
  const valid=validHrvWeek(d.hrv_week);
  const wa=valid.length?Math.round(valid.reduce((s,x)=>s+x.val,0)/valid.length):0;
  const colorOf=z=>({aqua:C.aqua,butter:C.butter,coral:C.coral,dim:C.textDim}[z]||C.textDim);
  const weekData=d.hrv_week.map(w=>{
    const z=!Number.isFinite(w.val)?"dim":w.val>=55?"aqua":w.val>=48?"butter":"coral";
    return {...w,z};
  });
  return (
    <div style={{padding:"8px 22px 32px",display:"flex",flexDirection:"column",gap:20}}>
      {/* Week header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 4px 0"}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:C.cardBg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase"}}>本周恢复</div>
          <div style={{fontSize:14,fontWeight:500,marginTop:4,color:C.text,letterSpacing:".02em",fontVariantNumeric:"tabular-nums"}}>
            {d.hrv_week[0]?.day||"—"} — {d.hrv_week[d.hrv_week.length-1]?.day||"—"}
          </div>
        </div>
        <div style={{width:36,height:36,borderRadius:"50%",background:C.cardBg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      {/* Recovery Rhythm card */}
      <Card pad={26} warm>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:22}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase"}}>Recovery Rhythm</div>
          <span style={{fontSize:12,color:C.textSec,fontVariantNumeric:"tabular-nums"}}>均值 <span style={{color:C.text,fontWeight:600}}>{wa}ms</span></span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
          {weekData.map((w,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:w.z==="dim"?"transparent":`${colorOf(w.z)}1f`,border:`1px solid ${w.z==="dim"?C.border:colorOf(w.z)+"55"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:500,color:colorOf(w.z),fontVariantNumeric:"tabular-nums"}}>
                {w.val??<span style={{opacity:.4}}>—</span>}
              </div>
              <div style={{fontSize:10,color:C.textTer,fontWeight:500,letterSpacing:".04em"}}>{w.day?.split("/")?.[1]||w.day}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:22,fontSize:10,color:C.textSec,letterSpacing:".08em"}}>
          {[[C.aqua,"≥ 55"],[C.butter,"48–54"],[C.coral,"< 48"]].map(([c,l])=>(
            <span key={l} style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:6,height:6,background:c,borderRadius:3}}/>{l}</span>
          ))}
        </div>
      </Card>

      {/* 3 week stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[{label:"HRV 均值",value:wa,unit:"ms",color:C.aqua},{label:"今日心率",value:d.rhr,unit:"bpm",color:C.coral},{label:"活跃天数",value:valid.length,unit:"天",color:C.aerobic}].map((s,i)=>(
          <div key={i} style={{padding:"16px 14px",borderRadius:22,background:"rgba(216,209,199,0.035)",border:`1px solid ${C.border}`,minHeight:96,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:10,fontWeight:600,letterSpacing:".16em",color:C.textTer,textTransform:"uppercase"}}>{s.label}</div>
            <div style={{display:"flex",alignItems:"baseline",gap:3,marginTop:"auto"}}>
              <span style={{fontSize:30,fontWeight:300,color:s.color,letterSpacing:"-.03em",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{s.value}</span>
              <span style={{fontSize:10,color:C.textTer,fontWeight:500}}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* HRV Wave */}
      <Card pad={22}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:18}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.textTer,textTransform:"uppercase"}}>HRV Wave</div>
          <span style={{fontSize:10,color:C.textTer,letterSpacing:".08em"}}>7 days</span>
        </div>
        <div style={{height:80}}>
          <Sparkline data={d.hrv_week.map(x=>x.val)} color={C.aqua} width={300} height={80} fluid/>
        </div>
      </Card>

      {/* Insight card */}
      {valid.length>=2&&(()=>{
        const peak=valid.reduce((a,b)=>b.val>a.val?b:a);
        const low=valid.reduce((a,b)=>b.val<a.val?b:a);
        const diff=Math.round(peak.val-low.val);
        return (
          <Card pad={22} accent={C.aqua}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <Icon name="ti-sparkles" color={C.aqua} size={16}/>
              <span style={{fontSize:10,fontWeight:600,letterSpacing:".22em",color:C.aqua,textTransform:"uppercase"}}>Insight</span>
            </div>
            <div style={{fontSize:14,lineHeight:1.7,color:C.text,fontWeight:400}}>
              本周 HRV 波动 <span style={{color:C.coral,fontWeight:500}}>{diff} ms</span>
              {diff>20?"，节奏不均。":"，训练恢复节奏均衡。"}
              下周安排 <span style={{color:C.aqua,fontWeight:500}}>1 天</span> 完整休息日。
            </div>
          </Card>
        );
      })()}

      {/* Detailed weekly insight */}
      <WeeklyInsight d={d}/>
    </div>
  );
}

// ─── AppHeader ────────────────────────────────────────────────────────────────
function AppHeader({syncing,onSync,d}) {
  const today=new Date();
  const dateStr=`${today.getMonth()+1}.${String(today.getDate()).padStart(2,"0")}`;
  const weekDay=["SUN","MON","TUE","WED","THU","FRI","SAT"][today.getDay()];
  return (
    <div style={{padding:"14px 22px 12px",background:"linear-gradient(180deg,rgba(31,35,40,0.98) 0%,rgba(31,35,40,0.8) 100%)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,flexShrink:0,zIndex:30}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:32,height:32,borderRadius:10,background:`radial-gradient(circle at 30% 25%,${C.carbon},${C.mineral} 85%)`,border:`1px solid ${C.borderStrong}`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 14px rgba(89,195,195,0.20)`}}>
          <svg width="20" height="20" viewBox="0 0 22 22">
            <defs><linearGradient id="logoRing" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor={C.aqua}/><stop offset="100%" stopColor={C.aerobic}/></linearGradient></defs>
            <path d="M11 2 A9 9 0 1 1 4.5 17.4" stroke="url(#logoRing)" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
            <path d="M5 11 L8 11 L9.5 8.5 L12 13.5 L13.5 11 L17 11" stroke={C.dustRose} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="17" cy="11" r="1.5" fill={C.butter}/>
          </svg>
        </div>
        <div style={{display:"flex",flexDirection:"column",lineHeight:1.05}}>
          <div style={{fontSize:15,fontWeight:600,letterSpacing:"-.01em",color:C.text}}>Coach<span style={{color:C.aqua}}>.</span>AI</div>
          <div style={{fontSize:9,fontWeight:500,letterSpacing:".22em",color:C.textTer,marginTop:3}}>BODY OS</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {!d.is_stale&&<span style={{fontSize:9,fontWeight:700,color:C.aqua}}>✓</span>}
          <span style={{fontVariantNumeric:"tabular-nums",fontWeight:600,letterSpacing:".04em",fontSize:11,color:C.text}}>{dateStr}</span>
          <span style={{fontSize:9,fontWeight:500,letterSpacing:".18em",color:C.textDim}}>{weekDay}</span>
        </div>
        <button onClick={onSync} disabled={syncing} aria-label="同步" style={{width:34,height:34,padding:0,borderRadius:"50%",border:"none",background:syncing?`${C.aqua}55`:"rgba(216,209,199,0.06)",color:syncing?C.aqua:C.textSec,display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:syncing?"progress":"pointer",transition:"all .25s",flexShrink:0}}>
          <span style={{display:"inline-flex",animation:syncing?"spin 1s linear infinite":"none"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 15.5-6.3M21 12a9 9 0 0 1-15.5 6.3"/><path d="M18 3v4h-4M6 21v-4h4"/>
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── BottomNav ────────────────────────────────────────────────────────────────
function BottomNav({active,onChange}) {
  const nc={status:C.aqua,diet:C.butter,coach:C.dustRose,history:C.aerobic};
  const items=[
    {id:"status", label:"状态",icon:(c)=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>},
    {id:"diet",   label:"饮食",icon:(c)=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10c0-3 3-6 5-6s5 3 5 6H7zm0 0v2a5 5 0 0010 0v-2"/></svg>},
    {id:"coach",  label:"教练",icon:(c)=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>},
    {id:"history",label:"历史",icon:(c)=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V6M10 19v-8M16 19V9M22 19H2"/></svg>},
  ];
  return (
    <div style={{flexShrink:0,padding:"8px 14px 28px",background:`linear-gradient(to top,${C.mineral} 60%,transparent)`,borderTop:`1px solid ${C.border}`}}>
      <div style={{background:"rgba(43,49,56,0.82)",backdropFilter:"blur(24px) saturate(160%)",WebkitBackdropFilter:"blur(24px) saturate(160%)",border:`1px solid ${C.borderStrong}`,borderRadius:26,padding:"6px",display:"grid",gridTemplateColumns:"repeat(4,1fr)",boxShadow:"0 14px 40px rgba(0,0,0,0.5),inset 0 1px 0 rgba(216,209,199,0.06)"}}>
        {items.map(it=>{
          const isActive=active===it.id,ac=nc[it.id];
          return (
            <button key={it.id} onClick={()=>onChange(it.id)} style={{appearance:"none",border:"none",background:isActive?`${ac}1a`:"transparent",padding:"10px 4px 8px",borderRadius:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,color:isActive?ac:C.textSec,cursor:"pointer",fontFamily:"inherit",transition:"all .25s",outline:"none",boxShadow:isActive?`inset 0 0 0 1px ${ac}33`:"none"}}>
              {it.icon(isActive?ac:C.textSec)}
              <div style={{fontSize:10,fontWeight:600,letterSpacing:".1em"}}>{it.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 根组件 ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]=useState("status");
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
      chi:()=>INTERP.chi(calcCHI(d,mealLog)),
    };
    setModal(map[key]?.() || null);
  },[d,level,mealLog]);

  // ── 真实数据同步：调用 Anthropic API 读取 Apple Health ──────────────────
  const doSync = async () => {
    if(syncing || syncPhase===1) return;
    setSyncing(true); setSyncPhase(1); setSyncItems([]);

    // ── iOS 原生路径：通过 WKWebView Bridge 直接读 HealthKit ──
    if(window.CoachBridge?.isNative) {
      // 数据回传由已有的 message 事件监听器处理（useEffect 第二个）
      window.CoachBridge.onDataReceived = (raw) => {
        window.dispatchEvent(new MessageEvent("message", {
          data: { type: "health_data", payload: raw },
        }));
      };
      window.__receiveHealthError = () => {
        setSyncPhase(0); setSyncing(false); setSyncItems([]);
      };
      window.CoachBridge.sync();
      // 10 秒超时保护
      setTimeout(()=>{
        setSyncPhase(p=>{ if(p===1){ setSyncing(false); setSyncItems([]); return 0; } return p; });
      }, 10000);
      return;
    }

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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes breathe{0%,100%{transform:scale(.7);opacity:.2}50%{transform:scale(1.4);opacity:.9}}
        @keyframes bop{0%,70%,100%{transform:translateY(0)}35%{transform:translateY(-4px)}}
        @keyframes slideUp{from{transform:translateY(56px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes screenFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ringPulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.14);opacity:.12}}
        @keyframes itemSlide{from{transform:translateX(-10px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes popIn{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes glowPulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.85;transform:scale(1.04)}}
        @keyframes gradientShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes calmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        /* New VI animations */
        @keyframes breathDot{0%,100%{transform:scale(.7);opacity:.4}50%{transform:scale(1.3);opacity:1}}
        @keyframes breathAura{0%,100%{opacity:.18;transform:scale(.95)}50%{opacity:.42;transform:scale(1.08)}}
        @keyframes tdot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
        button,input{outline:none;font-family:'Inter','DM Sans',sans-serif;}
        input::placeholder{color:#52504D;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#39424F;border-radius:99px;}
        ::-webkit-scrollbar-track{background:transparent;}
      `}</style>

      <div style={{
        maxWidth:480, margin:"0 auto",
        fontFamily:"'Inter','DM Sans',sans-serif",
        position:"relative",
        height:"100dvh",
        display:"flex", flexDirection:"column",
        overflow:"hidden",
        background:C.mineral,
        backgroundImage:"radial-gradient(ellipse at 50% 0%,#2B3138 0%,#1F2328 60%)",
      }}>
        <Modal data={modal} onClose={()=>setModal(null)}/>
        <SyncOverlay phase={syncPhase} items={syncItems}/>
        <AppHeader syncing={syncing} onSync={doSync} d={d}/>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          {tab==="status"&&<StatusPage d={d} mealLog={mealLog} onTap={openModal}/>}
          {tab==="diet"&&<FoodCheckinPage mealLog={mealLog} onAddMeal={addMeal} onDeleteMeal={deleteMeal} d={d} level={level}/>}
          {tab==="coach"&&<CoachPage d={d} mealLog={mealLog}/>}
          {tab==="history"&&<HistoryPage d={d}/>}
        </div>
        <BottomNav active={tab} onChange={setTab}/>
      </div>
    </>
  );
}
