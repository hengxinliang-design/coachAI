"""
cbum.py — CBum 训练方法论引擎（dev spec v2.0 §3 / §4.2）

把 H5 端 cbum-data.js 的动作库与计划生成器迁移到后端，行为保持一致：
  · 动作库按 PPL（Push/Pull/Legs）分组，对应 spec §3.2 的部位结构
  · 强度调节遵循 §4.2：🟢 加递减/超级组、🟡 去力竭组、🔴 转有氧
  · 体现 §3.1 六大原则：复合开场孤立收尾、8-15 次区间、高强度手段仅优秀日
"""
from __future__ import annotations

# ── 六大核心原则（spec §3.1） ────────────────────────────────────────────────
CBUM_PRINCIPLES = [
    {"id": 1, "name": "Mind-Muscle Connection", "desc": "感受 > 重量，完整动作幅度，顶峰收缩停 1 秒"},
    {"id": 2, "name": "双重渐进超负荷", "desc": "同重量完成设定范围最高次数后，才加重 5-15 lbs"},
    {"id": 3, "name": "复合优先，孤立收尾", "desc": "体力充沛时先做复合动作，之后用孤立动作精雕"},
    {"id": 4, "name": "末组高强度手段", "desc": "🟢 优秀日：末组执行递减组或超级组"},
    {"id": 5, "name": "8-15 次肌肥大区间", "desc": "复合动作 6-8 次，孤立动作 10-15 次"},
    {"id": 6, "name": "背部双频次", "desc": "每周期 2 次：厚度日（划船）+ 宽度日（下拉）"},
]

# ── 动作库（spec §3.2，equipment: full=完整健身房 home=家庭 outdoor=户外） ────
EXERCISES = {
    "push": {
        "compound": [
            {"name": "杠铃卧推", "muscle": "胸（中下）", "equipment": ["full"], "sets": [3, 4], "reps": [6, 8], "tip": "下放到胸部触碰，末组俯卧撑力竭，双侧完全夹胸", "drop_set": True},
            {"name": "上斜哑铃卧推", "muscle": "胸（上部）", "equipment": ["full", "home"], "sets": [3, 4], "reps": [8, 10], "tip": "30-45° 角度，顶峰双侧夹胸收缩", "drop_set": False},
            {"name": "哑铃肩推", "muscle": "肩（前/中）", "equipment": ["full", "home"], "sets": [3], "reps": [10, 12], "tip": "不要耸肩，肘部略向前，全程控制离心", "drop_set": True},
        ],
        "isolation": [
            {"name": "绳索夹胸", "muscle": "胸（内侧）", "equipment": ["full"], "sets": [3], "reps": [12, 15], "tip": "双手胸前完全夹紧停 1 秒，感受内侧收缩", "drop_set": False},
            {"name": "侧平举", "muscle": "肩（中束）", "equipment": ["full", "home"], "sets": [4], "reps": [12, 15], "tip": "宁轻勿重，不借力，感受三角肌中束单独发力", "drop_set": True},
            {"name": "绳索面拉", "muscle": "肩（后束）", "equipment": ["full"], "sets": [3], "reps": [15, 20], "tip": "拉到面部，外旋发力，掌心向前", "drop_set": False},
            {"name": "绳索下压", "muscle": "三头", "equipment": ["full"], "sets": [3, 4], "reps": [12, 15], "tip": "肘部固定，全程收紧，末组力竭", "drop_set": True},
            {"name": "过顶哑铃臂屈伸", "muscle": "三头（长头）", "equipment": ["full", "home"], "sets": [3], "reps": [12, 15], "tip": "肘部紧靠头部，离心慢放 3 秒", "drop_set": False},
        ],
    },
    "pull": {
        "compound": [
            {"name": "杠铃划船", "muscle": "背（厚度）", "equipment": ["full"], "sets": [4], "reps": [6, 8], "tip": "肩胛骨主导回收，感受背部发力而非手臂", "drop_set": False},
            {"name": "高位下拉", "muscle": "背（宽度）", "equipment": ["full"], "sets": [3, 4], "reps": [8, 10], "tip": "下拉到胸部，底部停顿，感受背阔肌完全收缩", "drop_set": True},
            {"name": "杠铃弯举", "muscle": "二头", "equipment": ["full", "home"], "sets": [3], "reps": [8, 10], "tip": "控制离心，不甩动，末组递减组", "drop_set": True},
        ],
        "isolation": [
            {"name": "胸支撑哑铃划船", "muscle": "背（厚度/细节）", "equipment": ["full", "home"], "sets": [3], "reps": [10, 12], "tip": "隔离腰背，专注背阔和菱形肌", "drop_set": False},
            {"name": "直臂下压", "muscle": "背（背阔）", "equipment": ["full"], "sets": [3], "reps": [12, 15], "tip": "手臂伸直，背阔发力下压，顶峰停顿", "drop_set": False},
            {"name": "锤式弯举", "muscle": "二头（肱肌）", "equipment": ["full", "home"], "sets": [3], "reps": [10, 12], "tip": "增加肱肌和前臂厚度", "drop_set": False},
            {"name": "绳索弯举", "muscle": "二头", "equipment": ["full"], "sets": [3], "reps": [12, 15], "tip": "顶峰收缩 1 秒，离心慢放", "drop_set": False},
        ],
    },
    "legs": {
        "compound": [
            {"name": "杠铃深蹲", "muscle": "股四头/臀", "equipment": ["full"], "sets": [4], "reps": [6, 8], "tip": "全蹲，顶峰不锁膝保持张力，控制下降节奏", "drop_set": False},
            {"name": "腿举", "muscle": "股四头", "equipment": ["full"], "sets": [3, 4], "reps": [10, 12], "tip": "脚位靠上激活臀部，全程不锁膝", "drop_set": True},
            {"name": "罗马尼亚硬拉", "muscle": "腘绳/臀", "equipment": ["full", "home"], "sets": [3, 4], "reps": [8, 10], "tip": "感受腘绳拉伸，髋部后推，非下背主导", "drop_set": False},
        ],
        "isolation": [
            {"name": "腿伸展", "muscle": "股四头", "equipment": ["full"], "sets": [3], "reps": [12, 15], "tip": "顶峰停顿 1 秒，感受股四头完全收缩", "drop_set": True},
            {"name": "腿弯举", "muscle": "腘绳", "equipment": ["full"], "sets": [3], "reps": [10, 12], "tip": "离心慢放 3 秒，不要弹震", "drop_set": False},
        ],
    },
    "cardio": {
        "compound": [],
        "isolation": [
            {"name": "椭圆机 Z2 有氧", "muscle": "全身有氧", "equipment": ["full"], "sets": [1], "reps": [30, 45], "tip": "心率保持在 128-140 bpm（Z2），稳定节奏", "drop_set": False},
            {"name": "慢走恢复", "muscle": "主动恢复", "equipment": ["outdoor", "full", "home"], "sets": [1], "reps": [20, 30], "tip": "心率 < 127 bpm（Z1），轻松节奏，促进血液循环", "drop_set": False},
        ],
    },
}

WARMUP = {
    "push": ["弹力带肩部绕环 2×15", "俯卧撑热身 2×10（轻松节奏）", "空杆卧推感受轨迹 2×8"],
    "pull": ["弹力带肩胛骨激活 2×15", "悬挂伸展 30 秒 × 2", "轻重量高位下拉感受 2×10"],
    "legs": ["泡沫轴滚压股四头 60 秒", "弓步激活髋屈肌 2×10", "空蹲感受膝踝对齐 2×10"],
    "cardio": ["关节绕环（踝/膝/髋）各 10 次", "5 分钟慢走热身"],
}

COOLDOWN = {
    "push": ["胸部拉伸（门框拉伸）30s×2", "三角肌前束拉伸 30s×2", "三头牵拉 20s×2"],
    "pull": ["背阔拉伸（悬挂/侧弯）30s×2", "二头牵拉 20s×2", "胸椎旋转 10 次×2"],
    "legs": ["股四头站姿拉伸 30s×2", "腘绳坐姿前屈 45s", "髋屈肌弓步拉伸 30s×2"],
    "cardio": ["全身静态拉伸 5-8 分钟", "深呼吸放松 10 次"],
}

SPLIT_LABEL = {
    "push": "推（胸/肩/三头）",
    "pull": "拉（背/二头）",
    "legs": "腿（股四/腘绳）",
    "cardio": "主动恢复",
}


def _by_equipment(items: list[dict], equipment: str) -> list[dict]:
    return [e for e in items if equipment == "full" or equipment in e["equipment"]]


def generate_plan(grade: str, split: str, equipment: str = "full") -> dict:
    """
    生成 CBum 训练计划（spec §4.2）。

    grade      green / yellow / red
    split      push / pull / legs / auto
    equipment  full / home / outdoor
    """
    # 🔴 较差 → 主动恢复（spec §2.3 / §4.2）
    if grade == "red":
        moves = _by_equipment(EXERCISES["cardio"]["isolation"], equipment)
        return {
            "split": "cardio",
            "split_label": SPLIT_LABEL["cardio"],
            "grade": grade,
            "warmup": WARMUP["cardio"],
            "exercises": moves[:1],
            "intensity_notes": [],
            "cooldown": COOLDOWN["cardio"],
            "duration": "20-30 分钟",
            "zone_target": "Z1 < 127 bpm",
            "coach_note": "HRV 和心率显示今天需要恢复。轻松活动促进血液循环即可，不做力竭组。",
        }

    actual_split = "push" if split == "auto" else split
    pool = EXERCISES[actual_split]

    # 🟢 优秀：3 复合 + 4 孤立；🟡 中等：2 复合 + 3 孤立
    n_compound = 3 if grade == "green" else 2
    n_isolation = 4 if grade == "green" else 3
    compounds = _by_equipment(pool["compound"], equipment)[:n_compound]
    isolations = _by_equipment(pool["isolation"], equipment)[:n_isolation]

    exercises = []
    for e in [*compounds, *isolations]:
        exercises.append({
            **e,
            "sets_display": (e["sets"][1] if len(e["sets"]) > 1 else e["sets"][0]) if grade == "green" else e["sets"][0],
            "reps_display": f"{e['reps'][0]}-{e['reps'][1]}",
            "has_drop_set": grade == "green" and e["drop_set"],
        })

    intensity_notes = (
        [f"{e['name']}：末组递减组" for e in exercises if e["has_drop_set"]]
        if grade == "green" else []
    )

    first_compound = compounds[0]["name"] if compounds else ""
    coach_note = (
        f"今天状态优秀，适合全力训练。{first_compound + '可以冲今日最大重量，' if first_compound else ''}末组执行递减组，感受肌肉充血。"
        if grade == "green" else
        "今天状态中等，比常用重量减少约 20-25%（75-80%），以动作质量和感受为主，末组不追求力竭。"
    )

    return {
        "split": actual_split,
        "split_label": SPLIT_LABEL[actual_split],
        "grade": grade,
        "warmup": WARMUP[actual_split],
        "exercises": exercises,
        "intensity_notes": intensity_notes,
        "cooldown": COOLDOWN[actual_split],
        "duration": "70-80 分钟" if grade == "green" else "55-70 分钟",
        "zone_target": "组间心率回落 ≤ 115 bpm 再开始下一组",
        "coach_note": coach_note,
    }
