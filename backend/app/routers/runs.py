# app/routers/runs.py
import json
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cuid2 import Cuid

from app.core.database import get_db
from app.models.orm import BenchmarkRun, RunLog
from app.schemas.schemas import RunCreate, RunRead

_cuid_generator = Cuid()

router = APIRouter()


@router.get("/", response_model=list[RunRead])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BenchmarkRun).order_by(BenchmarkRun.createdAt.desc()))
    return result.scalars().all()


@router.get("/{run_id}", response_model=RunRead)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(BenchmarkRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/", response_model=RunRead, status_code=201)
async def create_run(payload: RunCreate, db: AsyncSession = Depends(get_db)):
    run = BenchmarkRun(
        id=_cuid_generator.generate(),
        taskId=payload.taskId,
        projectId=payload.projectId,
        provider=payload.provider,
        modelId=payload.modelId,
        status="running",
        createdAt=datetime.now(timezone.utc),
        updatedAt=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.post("/{run_id}/execute")
async def execute(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(BenchmarkRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in ("running", "failed"):
        raise HTTPException(status_code=409, detail=f"Run is already {run.status}")

    async def event_stream():
        # TODO: wire up real agent execution here
        # For now, stream a placeholder and mark completed
        placeholder_lines = [
            "Starting benchmark run...",
            "Loading task environment...",
            "Agent execution not yet implemented.",
        ]
        for line in placeholder_lines:
            log = RunLog(
                id=_cuid_generator.generate(),
                runId=run_id,
                stream="stdout",
                line=line,
                ts=datetime.now(timezone.utc),
            )
            db.add(log)
            await db.commit()
            yield f"data: {json.dumps({'log': line})}\n\n"
            await asyncio.sleep(0.1)

        run.status = "completed"
        run.score = 0.0
        run.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(run)
        yield f"data: {json.dumps({'status': run.status, 'score': run.score})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")