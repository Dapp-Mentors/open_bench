from contextlib import asynccontextmanager
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import get_db
from app.core.config import settings
from app.routers import tasks, runs



@asynccontextmanager
async def lifespan(app: FastAPI):
    yield  # Prisma manages the schema — backend never calls create_all


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

app.include_router(tasks.router,  prefix="/api/tasks",  tags=["tasks"])
app.include_router(runs.router,   prefix="/api/runs",   tags=["runs"])


@app.get("/health", tags=["health"])
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok", "database_url": settings.DATABASE_URL.split("@")[-1]}
    except Exception as e:
        return {"status": "degraded", "db": "error", "detail": str(e)}
