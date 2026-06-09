from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.routers import pipeline, runs, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Prisma (frontend) owns the schema — we never call create_all here.
    yield


app = FastAPI(
    title="OpenBench Pipeline API",
    description=(
        "Handles heavy-duty pipeline execution: Docker builds, CI checks, "
        "NOP/oracle validation, and benchmark runs. "
        "Routine DB reads/writes go through the Next.js API layer."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pipeline stage endpoints — called by Inngest
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])

# Benchmark run reads and log streaming — consumed by the frontend
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])

# Task reads — mostly for debugging; frontend owns task writes
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])


@app.get("/health", tags=["health"])
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "db": "ok",
            "database_url": settings.DATABASE_URL.split("@")[-1],
        }
    except Exception as e:
        return {"status": "degraded", "db": "error", "detail": str(e)}