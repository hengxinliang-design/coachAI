"""
render.py (router) — 教练口吻渲染（模型无关）

POST /render → 返回渲染规格：模板文本（零成本可直接用）+ 提示词，
可选附带带 prompt caching 的 Claude 请求负载。客户端按设备能力选执行器。
"""
from fastapi import APIRouter, HTTPException

from app.engine.coach_voice import (
    DEFAULT_CLAUDE_MODEL,
    build_claude_request,
    build_render_spec,
)
from app.models.schemas import RenderRequest

router = APIRouter(prefix="/render", tags=["render"])


@router.post("")
def render(req: RenderRequest) -> dict:
    try:
        spec = build_render_spec(req.kind, req.data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if req.include_claude_request:
        spec["claude_request"] = build_claude_request(spec, model=req.model or DEFAULT_CLAUDE_MODEL)
    return spec
