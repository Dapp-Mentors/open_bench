import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cuid2 import Cuid

_cuid_generator = Cuid()

from app.core.database import get_db
from app.models.orm import Run, RunStatus
from app.schemas.schemas import RunCreate, RunRead
from app.services.runner import execute_run

router = APIRouter()


@router.get("/", response_model=list[RunRead])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Run).order_by(Run.created_at.desc()))
    return result.scalars().all()


@router.get("/{run_id}", response_model=RunRead)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/", response_model=RunRead, status_code=201)
async def create_run(payload: RunCreate, db: AsyncSession = Depends(get_db)):
    run = Run(id=_cuid_generator.generate(), model_id=payload.model_id, task_id=payload.task_id)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


@router.post("/{run_id}/execute")
async def execute(run_id: str, db: AsyncSession = Depends(get_db)):
    """
    Execute a benchmark run and stream log lines back as Server-Sent Events.
    The frontend LogTerminal component can consume this endpoint directly.
    """
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in (RunStatus.PENDING, RunStatus.FAILED):
        raise HTTPException(status_code=409, detail=f"Run is already {run.status}")

    async def event_stream():
        logs = []

        async for log_line in execute_run(run, db):
            logs.append(log_line)
            yield f"data: {json.dumps({'log': log_line})}\n\n"
            await asyncio.sleep(0)   # yield control back to the event loop

        # Final status push
        await db.refresh(run)
        yield f"data: {json.dumps({'status': run.status, 'score': run.score})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
