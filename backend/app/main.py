"""
main.py — FastAPI 应用入口（coach.ai dev spec v2.0 §6 / Phase 1）

启动：
    cd backend && uvicorn app.main:app --reload
路由（其余按 spec §7 逐步补齐）：
    GET  /health                 健康检查
    POST /recovery               恢复评分引擎（Phase 1）
    POST /workout/plan           CBum 训练计划生成（Phase 2）
    POST /workout/suggest-split  部位轮换建议（Phase 2）
    POST /workout/progression    双重渐进超负荷判断（Phase 2）
"""
from fastapi import FastAPI

from app.routers import recovery, workout

app = FastAPI(
    title="coach.ai API",
    version="2.0",
    description="数据驱动 × CBum 方法论 个人训练教练系统 — 后端核心引擎",
)

app.include_router(recovery.router)
app.include_router(workout.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "coach.ai", "version": "2.0"}
