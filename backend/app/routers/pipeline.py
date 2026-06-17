# app/routers/pipeline.py

import os
import re
import sys
import zipfile
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
from app.services import similarity as sim_svc
from app.services import quality as qual_svc
from app.services import easiness as easiness_svc
from app.services import agent_quality as agent_quality_svc

_cuid = Cuid()

router = APIRouter()


# ── Logging helpers ───────────────────────────────────────────────────────────

def _diag(msg: str) -> None:
    """Always-visible diagnostic line — bypasses log level config."""
    print(f"[PIPELINE-DIAG] {msg}", file=sys.stderr, flush=True)


def _stage_result(stage: str, passed: bool, message: str) -> None:
    """
    Emit a structured pass/fail line for every stage so logs are scannable.
    For failures the full message (potentially multi-line) is printed so the
    terminal shows the complete reason without having to query the DB.
    """
    status = "PASS" if passed else "FAIL"
    print(f"[PIPELINE] [{stage}] {status}", file=sys.stderr, flush=True)
    if not passed:
        # Print each line individually so log aggregators don't eat newlines
        for line in message.splitlines():
            print(f"[PIPELINE] [{stage}]   {line}", file=sys.stderr, flush=True)


# ── Shared helpers ────────────────────────────────────────────────────────────

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


# ── Stage 1: Similarity & Diversity ──────────────────────────────────────────

@router.post("/similarity", response_model=PipelineStageResponse)
async def stage_similarity(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, body.taskId)
    _diag(f"[similarity] taskId={body.taskId} storagePath={body.storagePath}")

    passed, message = await sim_svc.run_similarity_check(
        task_id=body.taskId,
        storage_path=body.storagePath,
        db=db,
    )

    _stage_result("similarity", passed, message)

    task.isDuplicate = not passed
    if not passed:
        task.similarityScore = 1.0
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    await _write_log(db, body.taskId, "similarity", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 2: CI checks ────────────────────────────────────────────────────────

@router.post("/ci", response_model=PipelineStageResponse)
async def stage_ci(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, body.taskId)

    sp = body.storagePath
    _diag("=" * 60)
    _diag(f"taskId      = {body.taskId}")
    _diag(f"storagePath = {sp}")
    _diag(f"exists={os.path.exists(sp)}  is_file={os.path.isfile(sp)}  is_dir={os.path.isdir(sp)}")

    if os.path.isfile(sp) and sp.lower().endswith(".zip"):
        _diag("storagePath is a ZIP file — inspecting contents:")
        try:
            with zipfile.ZipFile(sp) as zf:
                names = sorted(zf.namelist())
            _diag(f"  {len(names)} entries inside ZIP:")
            for n in names:
                _diag(f"    {n}")
        except Exception as e:
            _diag(f"  ERROR reading ZIP: {e}")
    elif os.path.isdir(sp):
        _diag("storagePath is a directory — walking tree:")
        for root, dirs, files in os.walk(sp):
            dirs[:] = sorted(d for d in dirs if d != "__pycache__")
            rel = os.path.relpath(root, sp)
            for f in sorted(files):
                _diag(f"    {os.path.join(rel, f)}")
    else:
        _diag("WARNING: storagePath does not exist or is not a ZIP/directory!")
    _diag("=" * 60)

    passed, message = await svc.run_ci_checks(body.taskId, body.storagePath)

    _stage_result("ci", passed, message)

    task.ciPassed = passed
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    await _write_log(db, body.taskId, "ci", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 3: Quality Check ────────────────────────────────────────────────────

@router.post("/quality", response_model=PipelineStageResponse)
async def stage_quality(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, body.taskId)
    _diag(f"[quality] taskId={body.taskId} storagePath={body.storagePath}")

    passed, message = await qual_svc.run_quality_check(
        task_id=body.taskId,
        storage_path=body.storagePath,
        db=db,
    )

    _stage_result("quality", passed, message)

    score_match = re.search(r"Quality score:\s*(\d+(?:\.\d+)?)\s*%", message)
    if score_match:
        task.qualityScore = float(score_match.group(1)) / 100.0
    if "\n" in message:
        task.qualityDetails = message.split("\n", 1)[1]
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    # Log only the summary line to keep PipelineLog readable
    await _write_log(db, body.taskId, "quality", passed, message.split("\n")[0])
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 4: Validation preflight ─────────────────────────────────────────────

@router.post("/preflight", response_model=PipelineStageResponse)
async def stage_preflight(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    await _get_task_or_404(db, body.taskId)
    _diag(f"[preflight] taskId={body.taskId}")

    passed, message = await svc.run_preflight(body.taskId, body.storagePath)

    _stage_result("preflight", passed, message)

    await _write_log(db, body.taskId, "preflight", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 5: Oracle / NOP validation ─────────────────────────────────────────

@router.post("/oracle-nop", response_model=PipelineStageResponse)
async def stage_oracle_nop(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    await _get_task_or_404(db, body.taskId)
    _diag(f"[oracle-nop] taskId={body.taskId}")

    passed, message = await svc.run_oracle_nop(body.taskId, body.storagePath)

    _stage_result("oracle-nop", passed, message)

    await _write_log(db, body.taskId, "oracle_nop", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 6: Easiness prefilter ───────────────────────────────────────────────
#
# 5 parallel oracle runs using the easiness_model from DB config (fast model).
# Passes only if exactly 1/5 succeed.

@router.post("/easiness", response_model=PipelineStageResponse)
async def stage_easiness(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, body.taskId)
    _diag(
        f"[easiness] taskId={body.taskId} "
        f"model=openrouter (from DB config)"
    )

    passed, message = await easiness_svc.run_easiness_prefilter(
        task_id=body.taskId,
        storage_path=body.storagePath,
        db=db,
    )

    _stage_result("easiness", passed, message)

    # Persist summary line on Task row for the frontend
    task.easinessResult = message.split("\n")[0]
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    # Full message (with per-run details) goes to PipelineLog
    await _write_log(db, body.taskId, "easiness", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 7: Difficulty probe ─────────────────────────────────────────────────
#
# 5 parallel oracle runs using the frontier_model from DB config.
# Passes if 1–3/5 succeed.

@router.post("/difficulty", response_model=PipelineStageResponse)
async def stage_difficulty(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    await _get_task_or_404(db, body.taskId)
    _diag(
        f"[difficulty] taskId={body.taskId} "
        f"model=openrouter (from DB config)"
    )

    passed, message = await easiness_svc.run_difficulty_probe(
        task_id=body.taskId,
        storage_path=body.storagePath,
        db=db,
    )

    _stage_result("difficulty", passed, message)

    await _write_log(db, body.taskId, "difficulty", passed, message)
    return PipelineStageResponse(passed=passed, message=message)


# ── Stage 8: Agent quality check ──────────────────────────────────────────────
#
# LLM-as-judge across 6 criteria: instruction realism, natural register,
# no leaked assertions, no oracle hints, no over-specified steps,
# agent actionability. Threshold: 70%.

@router.post("/agent-quality", response_model=PipelineStageResponse)
async def stage_agent_quality(body: PipelineStageRequest, db: AsyncSession = Depends(get_db)):
    task = await _get_task_or_404(db, body.taskId)
    _diag(f"[agent-quality] taskId={body.taskId}")

    passed, message = await agent_quality_svc.run_agent_quality_check(
        task_id=body.taskId,
        storage_path=body.storagePath,
        db=db,
    )

    _stage_result("agent-quality", passed, message)

    task.agentQualityNote = message.split("\n")[0]
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    await _write_log(db, body.taskId, "agent_quality", passed, message.split("\n")[0])
    return PipelineStageResponse(passed=passed, message=message)


# ── Benchmark execution ───────────────────────────────────────────────────────

@router.post("/benchmark/execute", response_model=PipelineStageResponse)
async def execute_benchmark(
    body: BenchmarkExecuteRequest,
    db: AsyncSession = Depends(get_db),
):
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

    run.status    = "completed" if error is None else "failed"
    run.score     = float(score)
    run.runtimeMs = end_ms - start_ms
    run.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    if error:
        _diag(f"[benchmark] runId={body.runId} FAILED: {error}")

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