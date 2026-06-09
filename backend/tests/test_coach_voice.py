"""test_coach_voice.py — 模型无关渲染层测试"""
import pytest

from app.engine.coach_voice import (
    DEFAULT_CLAUDE_MODEL,
    build_claude_request,
    build_render_spec,
)


class TestTemplateRendering:
    def test_recovery_template_includes_grade_and_action(self):
        spec = build_render_spec("recovery", {
            "grade": "green", "grade_label": "优秀", "grade_emoji": "🟢", "score": 88,
            "notes": ["HRV 与静息心率均在基线内。"],
        })
        t = spec["template_text"]
        assert "优秀" in t and "88" in t
        assert "全力训练" in t                       # green 行动建议
        assert "基线内" in t                          # 复用 notes

    def test_recovery_red_action(self):
        spec = build_render_spec("recovery", {"grade": "red", "grade_label": "较差",
                                              "grade_emoji": "🔴", "score": 38, "notes": []})
        assert "恢复为主" in spec["template_text"]

    def test_workout_review_template(self):
        spec = build_render_spec("workout_review", {
            "overtraining": {"note": "三项叠加，高风险。", "next_day_prediction": "明晨 HRV 预计下滑。"},
            "training_load": {"note": "今日为日均 2 倍。"},
            "intensity_match": {"note": "强度充分。"},
            "set_recovery": {"note": "组间回落充分。"},
        })
        t = spec["template_text"]
        assert "高风险" in t and "下滑" in t and "2 倍" in t

    def test_sleep_template(self):
        spec = build_render_spec("sleep", {
            "continuity": {"note": "连续性较差。"},
            "awakening_pattern": {"note": "凌晨长觉醒，皮质醇模式。"},
            "annotations": {"note": "镁甘氨酸生效中。"},
        })
        t = spec["template_text"]
        assert "连续性较差" in t and "皮质醇" in t and "镁甘氨酸" in t

    def test_unknown_kind_raises(self):
        with pytest.raises(ValueError):
            build_render_spec("nope", {})


class TestPromptSpec:
    def test_system_prompt_has_persona_and_rules(self):
        spec = build_render_spec("recovery", {"grade": "green", "score": 90, "notes": []})
        assert "Coach.AI" in spec["system_prompt"]
        assert "结论先行" in spec["system_prompt"]

    def test_user_prompt_embeds_facts_and_draft(self):
        spec = build_render_spec("recovery", {"grade": "green", "score": 90, "notes": ["状态好。"]})
        assert "结构化分析事实" in spec["user_prompt"]
        assert "模板初稿" in spec["user_prompt"]
        assert "不要编造" in spec["user_prompt"]


class TestClaudeRequest:
    def test_payload_structure_and_caching(self):
        spec = build_render_spec("recovery", {"grade": "green", "score": 90, "notes": []})
        req = build_claude_request(spec)
        assert req["model"] == DEFAULT_CLAUDE_MODEL
        assert req["max_tokens"] == spec["max_tokens"]
        # prompt caching 开在 system 前缀上
        assert req["system"][0]["cache_control"] == {"type": "ephemeral"}
        assert req["messages"][0]["role"] == "user"

    def test_model_override(self):
        spec = build_render_spec("sleep", {"continuity": {"note": "好。"}})
        req = build_claude_request(spec, model="claude-opus-4-1")
        assert req["model"] == "claude-opus-4-1"
