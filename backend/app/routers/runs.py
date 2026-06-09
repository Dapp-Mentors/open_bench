# app/routers/runs.py
#
# Run endpoints. Creation and status updates happen via the Inngest pipeline.
# This router exposes:
#   GET  /api/runs/{run_id}         — fetch a single run
#   GET  /api/runs/{run_id}/logs    — SSE stream of RunLog rows for live tailing

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.orm import BenchmarkRun, RunLog
from app.schemas.schemas import RunRead, RunLogRead

router = APIRouter()


@router.get("/{run_id}", response_model=RunRead)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(BenchmarkRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/logs", response_model=list[RunLogRead])
async def get_run_logs(run_id: str, db: AsyncSession = Depends(get_db)):
    """Return all log lines for a completed or in-progress run."""
    result = await db.execute(
        select(RunLog)
        .where(RunLog.runId == run_id)
        .order_by(RunLog.ts.asc())
    )
    return result.scalars().all()


@router.get("/{run_id}/stream")
async def stream_run_logs(run_id: str, db: AsyncSession = Depends(get_db)):
    """
    SSE endpoint — polls for new RunLog rows and streams them as they appear.
    Closes when the run reaches a terminal status (completed / failed).
    The frontend LogTerminal component can connect here for live output.
    """
    run = await db.get(BenchmarkRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_stream():
        seen_ids: set[str] = set()
        poll_interval = 0.5  # seconds

        for _ in range(600):  # max 5 minutes of polling
            result = await db.execute(
                select(RunLog)
                .where(RunLog.runId == run_id)
                .order_by(RunLog.ts.asc())
            )
            logs = result.scalars().all()

            for log in logs:
                if log.id not in seen_ids:
                    seen_ids.add(log.id)
                    yield f"data: {json.dumps({'stream': log.stream, 'line': log.line})}\n\n"

            # Refresh run status
            await db.refresh(run)
            if run.status in ("completed", "failed"):
                yield f"data: {json.dumps({'status': run.status, 'score': run.score})}\n\n"
                return

            await asyncio.sleep(poll_interval)

        yield f"data: {json.dumps({'error': 'stream timeout'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")