from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from fastapi.responses import StreamingResponse

from app.routers import approve, pipeline, runs, sia, tasks, model_config
from app.services import sia_client
from app.services.sse import sia_event_generator


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Prisma (frontend) owns the schema — we never call create_all here.

    # ── Load all settings from DB (setup wizard) ────────────────────────────
    # Reads OpenRouter key, Sia indexer URL, app ID, name, and description
    # from the AppSettings table. No .env fallback for these values.
    print("[Config] Loading settings from DB (setup wizard)…")
    await settings.load_db_settings()

    # ── Eagerly initialise the Sia client on boot ────────────────────────────
    # This triggers the approval flow (if needed) immediately so the operator
    # sees the ACTION REQUIRED URL without having to approve a task first.
    if settings.SIA_MODE != "demo":
        print("[Sia] Initialising Sia client on startup…")
        try:
            sdk = await sia_client.get_sdk()
            if sdk:
                print("[Sia] Successfully connected to Sia indexer")
            elif sia_client.is_demo_mode():
                print(f"[Sia] Running in demo mode: {sia_client.get_demo_reason()}")
        except Exception as exc:
            print(f"[Sia] Failed to initialise Sia client: {exc}")
            print("[Sia] The server is still running — uploads will fail until Sia is connected.")

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

# Task approval + Sia upload — called by the frontend after human review
app.include_router(approve.router, prefix="/api", tags=["approve"])

# Sia connection status — used by the NavBar
app.include_router(sia.router, prefix="/api/sia", tags=["sia"])

# Model configuration — admin UI for selecting OpenRouter models per pipeline role
app.include_router(model_config.router, prefix="/api/models", tags=["models"])

# SSE endpoint for real-time Sia pipeline status
@app.get("/api/sia/events", tags=["sse"])
async def sia_sse():
    return StreamingResponse(
        sia_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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