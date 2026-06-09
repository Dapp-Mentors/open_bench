# app/routers/pipeline.py
#
# Called exclusively by the Inngest pipeline function (pipeline-inngest.ts).
# Each endpoint corresponds to one pipeline stage. Inngest handles retries,
# concurrency, and state — this layer just executes and responds.
#
# Convention: POST /api/pipeline/<stage>
# Body:   PipelineStageRequest  { taskId, storagePath }
# Return: PipelineStageResponse { passed, message, detail? }

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from cuid2 import Cuid

from app.core.database import get_db
from app.models.orm import Task, PipelineLog, BenchmarkRun, RunLog
from app.schemas.schemas import (
    PipelineStageRequest,
    PipelineStageResponse,
    BenchmarkExecuteRequest,
)
from app.services import pipeline as svc

_cuid = Cuid()

router = APIRouter()


# ── Shared helper ─────────────────────────────────────────────────────────────

async def _write_log(
    db: AsyncSession,
    task_id: str,
    stage: str,
    passed: bool,
    message: str,
) -> None:
    log = PipelineLog(
        id=_cuid.generate(),
        taskId=task_id,
        stage=stage,
        passed=passed,
        message=message,
        ts=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()


async def _get_task_or_404(db: AsyncSession, task_id: str) -> Task:
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task


# ── Stage: CI checks ──────────────────────────────────────────────────────────

@router.post("/ci", response_model=PipelineStageResponse)
async def stage_ci(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, body.taskId)

    passed, message = await svc.run_ci_checks(body.taskId, body.storagePath)

    # Persist the result on the Task row so the frontend can surface it
    task.ciPassed = passed
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    await _write_log(db, body.taskId, "ci", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage: Validation preflight (pytest collect) ──────────────────────────────

@router.post("/preflight", response_model=PipelineStageResponse)
async def stage_preflight(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    await _get_task_or_404(db, body.taskId)

    passed, message = await svc.run_preflight(body.taskId, body.storagePath)

    await _write_log(db, body.taskId, "preflight", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage: Oracle / NOP validation ───────────────────────────────────────────

@router.post("/oracle-nop", response_model=PipelineStageResponse)
async def stage_oracle_nop(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    await _get_task_or_404(db, body.taskId)

    passed, message = await svc.run_oracle_nop(body.taskId, body.storagePath)

    await _write_log(db, body.taskId, "oracle_nop", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Benchmark execution ───────────────────────────────────────────────────────
# Called by the Inngest benchmark runner (runBenchmark function).

@router.post("/benchmark/execute", response_model=PipelineStageResponse)
async def execute_benchmark(
    body: BenchmarkExecuteRequest,
    db: AsyncSession = Depends(get_db),
):
    # Verify the run exists
    run = await db.get(BenchmarkRun, body.runId)
    if not run:
        raise HTTPException(status_code=404, detail=f"BenchmarkRun {body.runId} not found")

    start_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    score, error = await svc.execute_benchmark_run(
        run_id=body.runId,
        task_id=body.taskId,
        storage_path=body.storagePath,
        agent_config=body.agentConfig,
    )

    end_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    # Update the run row — Inngest also updates this, but we do it here too
    # so the result is written even if Inngest's DB update step is still pending
    run.status    = "completed" if error is None else "failed"
    run.score     = float(score)
    run.runtimeMs = end_ms - start_ms
    run.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    # Write a log entry for the run result
    log = RunLog(
        id=_cuid.generate(),
        runId=body.runId,
        stream="stdout",
        line=f"score={score}" if error is None else f"error: {error}",
        ts=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()

    if error:
        return PipelineStageResponse(passed=False, message="Benchmark run failed", detail=error)
    return PipelineStageResponse(passed=True, message=f"score={score}")