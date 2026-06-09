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
    POST /workout/post-prompt    运动后追问生成
    POST /workout/log            动作分类标注 + 落库
    POST /report/workout-review  训练后复盘（Phase 3, Module C）
    POST /report/sleep           睡眠恢复报告（Phase 3, Module D）
    POST /report/annotation-impact  观察指标前后对比
    POST /report/environment-context 环境上下文标注（方向 B）
    POST /render                 教练口吻渲染（模板 + 提示词 + Claude 负载）
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import data, recovery, render, report, workout


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()   # 建表（不存在才建）
    yield


app = FastAPI(
    title="coach.ai API",
    version="2.0",
    description="数据驱动 × CBum 方法论 个人训练教练系统 — 后端核心引擎",
    lifespan=lifespan,
)

# WKWebView 中 H5 为 file:// 源（Origin: null），跨域调用后端需开放 CORS。
# 开发期放开所有来源；上线收敛到正式域名。不使用 credentials，故 "*" 可用。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recovery.router)
app.include_router(workout.router)
app.include_router(report.router)
app.include_router(data.router)
app.include_router(render.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "coach.ai", "version": "2.0"}
