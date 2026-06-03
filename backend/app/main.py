from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.core.config import settings
from app.routers import models, tasks, runs


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (use Alembic migrations in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="OpenBench API",
    description="Backend service for benchmarking AI models across providers",
    version="0.0.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(tasks.router,  prefix="/api/tasks",  tags=["tasks"])
app.include_router(runs.router,   prefix="/api/runs",   tags=["runs"])


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
