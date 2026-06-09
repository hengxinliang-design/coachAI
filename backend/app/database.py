"""
database.py — 数据库连接与会话管理

开发默认 SQLite（零配置，文件 coachai.db）；通过 DATABASE_URL 环境变量可切到
PostgreSQL（spec §6）。SQLAlchemy 屏蔽方言差异，引擎层无需改动。
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.db import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./coachai.db")

# SQLite 在多线程（FastAPI）下需要关闭同线程检查
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """建出全部表（不存在才建）。生产环境应改用 Alembic 迁移。"""
    Base.metadata.create_all(engine)


def get_db():
    """FastAPI 依赖：每请求一个会话，结束自动关闭。"""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
