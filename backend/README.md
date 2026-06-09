# coach.ai backend

数据驱动 × CBum 方法论 个人训练教练系统 — 后端核心引擎
基于 **dev spec v2.0**（FastAPI + PostgreSQL + TimescaleDB 全栈方向）。

## 当前进度

**Phase 1 — 核心引擎**

| spec §7 Phase 1 任务 | 状态 |
|---|---|
| FastAPI 项目骨架（/health /recovery 路由） | ✅ |
| 恢复评分引擎（HRV 50% + RHR 35% + 腕温 15%） | ✅ |
| 7日滚动基线 + HRV 异常值（>100ms）剔除 | ✅ |
| 评级决策矩阵（HRV/RHR 矛盾取保守档） | ✅ |
| 心率区间分类器（Z1–Z5） | ✅ |
| PostgreSQL 全部数据模型建表（5 张表声明） | ✅ |

**Phase 2 — CBum 训练引擎**

| spec §7 Phase 2 任务 | 状态 |
|---|---|
| 部位轮换追踪器（自动建议今日部位） | ✅ |
| CBum 动作库结构化存储（§3.2） | ✅ |
| 训练计划生成器（评级×部位×器械） | ✅ |
| 强度调节（🟢加递减/超级组、🟡去力竭组、🔴转有氧） | ✅ |
| 双重渐进追踪（历史重量对比，自动加重建议） | ✅ |
| 运动后追问 + 动作分类标注记录（传感器优先，只问绕不开的） | ✅ |
| 教练口吻渲染（模型无关：模板 + 提示词 + Claude 负载，带 prompt caching） | ✅ |

**Phase 3 — 报告与可视化**

| spec §7 Phase 3 任务 | 状态 |
|---|---|
| 训练后心率分析器（锯齿模式、组间回落检测） | ✅ |
| 训练后复盘（Module C：强度匹配/负荷评分/过度训练预警/次日预判） | ✅ |
| 观察指标前后对比（§5 泛化：任意指标 × 任意分界日） | ✅ |
| 睡眠恢复报告（Module D：深睡/REM/连续性/碎片化/凌晨觉醒/训练关联/观察指标叠加） | ✅ |
| 环境上下文引擎（气压/海拔/天气/空气质量/血氧/旅行 → 解释性标注，方向 B） | ✅ |
| 跑步专项分析（配速、runningSpeed 时序） | ⏳ 后续 |
| 四大报告渲染 + ECharts | ⏳ 后续 |

**Phase 4 — 持久化层**

| 任务 | 状态 |
|---|---|
| DB 连接/会话（SQLite 默认，DATABASE_URL 可切 Postgres） | ✅ |
| 启动建表（create_all；Alembic 迁移留待生产） | ✅ |
| Repository 层（CRUD + 历史查询：recent_hrv / exercise_history / metric_series） | ✅ |
| /data 端点：健康指标、观察指标增删查、训练、睡眠、动作日志 | ✅ |
| **history-aware 恢复评分**（POST /data/health-metric 自动用 DB 历史算基线） | ✅ |
| iOS/HealthKit 真实采集与后台同步 | ⏳ 后续 |

> **设计说明**：spec §5「补剂追踪」未做成独立模块，而是泛化为通用「观察指标 / 数据标注」原语
> （`annotations` 表 + `engine/annotations.py`）。用户可对任意日期打标签（补剂/旅行/压力等），
> 可增删、可并存多个；「服用前 vs 服用后」对比由 `compare_before_after` 对任意指标通用计算。
> 标注 CRUD 持久化随 Phase 4 接 DB 落地。
>
> **环境上下文（方向 B）**：自动采集的环境信号（气压/海拔/天气/空气质量/血氧/定位）
> 不进核心评分，而是经 `engine/environment.py` 转成解释性标注，并入观察指标叠加层——
> 与处理 HRV 异常值同一哲学：不让弱噪声污染已验证的恢复评分。环境信号的实际采集
> （WeatherKit / CoreLocation / CMAltimeter / HealthKit SpO₂）随 Phase 4 iOS 落地。
>
> **教练口吻渲染（模型无关 + 省 token）**：`engine/coach_voice.py` 产出「渲染规格」而不亲自
> 调模型，供三层执行器消费——Tier 0 模板（复用引擎 notes，**零 token、零模型**，覆盖日常 80%）、
> Tier 1 端侧小模型（Apple Foundation Models / MLX，零 token）、Tier 2 Claude API（带 prompt
> caching，仅硬综合/老设备兜底）。**话术规范（COACH_PERSONA/RULES）是后台可升级的部分**——
> 升级"让模型说什么"而非 OTA 几个 GB 的权重。`build_claude_request` 对 system 前缀开
> prompt caching，重复调用成本大幅下降。

## 运行

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 启动 API（默认 SQLite，自动建表 coachai.db）
.venv/bin/uvicorn app.main:app --reload
# 文档：http://127.0.0.1:8000/docs

# 切到 PostgreSQL（spec §6）
DATABASE_URL="postgresql+psycopg://user:pass@localhost/coachai" .venv/bin/uvicorn app.main:app

# 测试（含覆盖率，conftest 用隔离的临时 DB）
.venv/bin/pytest tests/ --cov=app
```

## 核心算法（spec §2.2 / §2.3）

恢复评分引擎实现三条实战教训：

1. **HRV 异常值剔除**：单日 HRV > 100ms（如 5/13 的 105ms、5/31 的 154ms）视为测量偏差，
   既不入评级、也不入 7 日滚动基线，改用 RHR 70% + 腕温 30% 评分、仅按 RHR 评级。
2. **HRV/RHR 矛盾取保守档**：如 5/25 的 HRV 69ms（优秀）+ RHR 59bpm（中等）→ 取「中等」。
3. **7 日滚动基线**：剔除异常值与空值后取均值，数据不足时回落到个人基线 66ms。

```
POST /recovery
{ "hrv_ms": 69.0, "rhr_bpm": 59, "wrist_temp_dev": 0.1, "recent_hrv": [62, 65, 60, 66] }
→ { "score": .., "grade": "yellow", "grade_label": "中等",
    "hrv_is_outlier": false, "notes": ["...按保守原则取「中等」。"] }
```

## 目录结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 个人基线与阈值（spec §2.1）
│   ├── engine/
│   │   ├── recovery.py      # 恢复评分引擎（§2.2/§2.3）
│   │   ├── hr_zones.py      # 心率分区分类器（§2.1）
│   │   ├── cbum.py              # CBum 动作库 + 计划生成器（§3/§4.2）
│   │   ├── rotation.py          # 部位轮换追踪器（§4.2）
│   │   ├── progression.py       # 双重渐进超负荷追踪（§3.1②）
│   │   ├── workout_logging.py   # 运动后追问 + 动作分类标注记录
│   │   ├── coach_voice.py       # 模型无关教练口吻渲染（模板+提示词+Claude负载）
│   │   ├── workout_analysis.py  # 训练后复盘分析器（§4.3）
│   │   ├── annotations.py       # 观察指标前后对比（§5 泛化）
│   │   ├── sleep_analysis.py    # 睡眠恢复报告（§4.4，含观察指标叠加）
│   │   └── environment.py       # 环境上下文引擎（方向 B：解释性标注）
│   ├── database.py          # DB 连接/会话/建表（SQLite→Postgres 可切）
│   ├── repository.py        # 数据访问层：CRUD + 历史查询
│   ├── models/
│   │   ├── schemas.py       # Pydantic 请求/响应
│   │   └── db.py            # SQLAlchemy 数据模型（§6.2，5 张表）
│   └── routers/
│       ├── recovery.py      # /recovery 路由
│       ├── workout.py       # /workout/* 路由
│       ├── report.py        # /report/* 路由
│       ├── data.py          # /data/* 持久化层路由
│       └── render.py        # /render 教练口吻渲染路由
└── tests/                   # 177 条测试（含实战回归 + 持久化 + 渲染 + 100% 覆盖）
```
