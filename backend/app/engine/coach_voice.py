"""
coach_voice.py — 模型无关的教练口吻渲染层

把引擎的结构化结果转成教练口吻文本，产出「渲染规格」供三种执行器消费：
  Tier 0  template_text   —— 模板直接渲染（复用引擎已有的 notes），零 token、零模型
  Tier 1/2 system/user_prompt —— 交给端侧小模型或 Claude 润色
  build_claude_request()  —— 构造带 prompt caching 的 Anthropic Messages 负载（客户端直接用）

话术规范（COACH_PERSONA / COACH_RULES）是「后台可升级」的部分——目前是常量，
将来可改为从 DB/配置下发，无需改模型、无需 OTA 权重。本模块纯函数，可独立测试。
"""
from __future__ import annotations

import json

# ── 话术规范（后台可升级的部分） ────────────────────────────────────────────
COACH_PERSONA = (
    "你是 Johnny 的专属 Coach.AI，融合 CBum 训练方法论与每日健康数据，"
    "把客观指标翻译成温暖、克制、可执行的教练建议。"
)
COACH_RULES = [
    "结论先行：先给判断，再给依据。",
    "语气温暖但不说教，不堆砌感叹号。",
    "建议必须具体可执行（给强度/心率区间/时长/重量）。",
    "中文，控制在 150 字以内。",
    "恢复差时明确建议休息，即使用户想练也先讲清客观风险。",
]

DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5"  # 可在请求中覆盖
DEFAULT_MAX_TOKENS = 300

_GRADE_ACTION = {
    "green": "状态在线，适合按计划全力训练，末组可上递减组。",
    "yellow": "建议把强度压到 75–80%，以动作质量与感受为主，末组不追力竭。",
    "red": "今天以恢复为主：Z1 有氧或休息，不做力竭组。",
}


# ── 模板渲染（Tier 0，零成本） ───────────────────────────────────────────────
def _render_recovery(d: dict) -> str:
    lead = f"{d.get('grade_emoji', '')} 今日恢复{d.get('grade_label', '')}（{d.get('score', '?')}/100）。"
    why = " ".join(d.get("notes") or [])
    action = _GRADE_ACTION.get(d.get("grade"), "")
    return " ".join(x for x in (lead, why, action) if x).strip()


def _render_workout_review(d: dict) -> str:
    parts: list[str] = []
    for sec_key in ("overtraining", "intensity_match", "training_load", "set_recovery"):
        sec = d.get(sec_key)
        if sec and sec.get("note"):
            parts.append(sec["note"])
    ot = d.get("overtraining") or {}
    if ot.get("next_day_prediction"):
        parts.append(ot["next_day_prediction"])
    return " ".join(parts)


def _render_sleep(d: dict) -> str:
    parts: list[str] = []
    for sec_key in ("continuity", "deep_sleep", "rem", "awakening_pattern", "training_link"):
        sec = d.get(sec_key)
        if sec and sec.get("note"):
            parts.append(sec["note"])
    ann = d.get("annotations") or {}
    if ann.get("note"):
        parts.append(ann["note"])
    return " ".join(parts)


_RENDERERS = {
    "recovery": _render_recovery,
    "workout_review": _render_workout_review,
    "sleep": _render_sleep,
}


# ── 提示词与渲染规格 ─────────────────────────────────────────────────────────
def _system_prompt() -> str:
    rules = "\n".join(f"{i}. {r}" for i, r in enumerate(COACH_RULES, 1))
    return f"{COACH_PERSONA}\n\n准则：\n{rules}"


def _user_prompt(kind: str, data: dict, draft: str) -> str:
    facts = json.dumps(data, ensure_ascii=False)
    return (
        f"以下是「{kind}」的结构化分析事实：\n{facts}\n\n"
        f"模板初稿：{draft}\n\n"
        "请基于以上事实，用教练口吻重写得更自然连贯，2–3 句、≤150 字，不要编造事实中没有的数据。"
    )


def build_render_spec(kind: str, data: dict) -> dict:
    """产出渲染规格：模板文本（零成本）+ 提示词（供端侧模型或 Claude 润色）。"""
    if kind not in _RENDERERS:
        raise ValueError(f"unknown render kind: {kind}")
    template_text = _RENDERERS[kind](data)
    return {
        "kind": kind,
        "template_text": template_text,
        "system_prompt": _system_prompt(),
        "user_prompt": _user_prompt(kind, data, template_text),
        "max_tokens": DEFAULT_MAX_TOKENS,
    }


def build_claude_request(spec: dict, model: str = DEFAULT_CLAUDE_MODEL) -> dict:
    """
    把渲染规格构造成 Anthropic Messages API 负载，对 system 开启 prompt caching
    （话术规范是稳定前缀，缓存后重复调用成本大幅下降）。客户端可直接发往 Claude。
    """
    return {
        "model": model,
        "max_tokens": spec["max_tokens"],
        "system": [{
            "type": "text",
            "text": spec["system_prompt"],
            "cache_control": {"type": "ephemeral"},
        }],
        "messages": [{"role": "user", "content": spec["user_prompt"]}],
    }
