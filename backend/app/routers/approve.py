# ── Sia upload on approval ────────────────────────────────────────────────────
#
# Called by the frontend when a reviewer clicks "Approve".
#
# What it does:
#   1. Sets task status → "approved" and siaStatus → "queued"
#   2. Starts the Sia upload pipeline in a background task:
#        queued → uploading → pinning → ready
#   3. Returns immediately so the frontend can poll siaStatus via the task API
#
# This gives the SiaPipelineAccordion component real-time status visibility.

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, async_session_factory
from app.models.orm import Task
from app.services import sia as sia_svc

router = APIRouter()


class ApproveRequest(BaseModel):
    taskId: str
    storagePath: str


class ApproveResponse(BaseModel):
    taskId: str
    siaHash: str | None = None
    siaStatus: str = "queued"


# ── Background Sia pipeline ────────────────────────────────────────────────────
# Runs as a FastAPI background task so the HTTP response returns immediately
# with siaStatus="queued". Each step updates the DB so the frontend can poll.

async def _sia_pipeline(task_id: str, storage_path: str, task: Task) -> str:
    """
    Background task: upload → pin → mark ready.
    Returns the Sia object ID on success.
    """

    async def set_status(status: str) -> None:
        """Update siaStatus in a new DB session (background task context)."""
        async with async_session_factory() as db:
            obj = await db.get(Task, task_id)
            if obj:
                obj.siaStatus = status
                obj.updatedAt = datetime.now(timezone.utc)
                await db.commit()

    try:
        async def _on_status(s: str) -> None:
            """Callback fires at "uploading" then "pinning" stages."""
            await set_status(s)

        sia_object_id = await sia_svc.upload_task(
            task_id=task_id,
            storage_path=storage_path,
            extra_meta={
                "projectId": task.projectId,
                "domain": task.domain,
                "language": task.language,
                "title": task.title,
            },
            on_status=_on_status,
        )

        # Step: ready — persist siaHash + final status
        async with async_session_factory() as db:
            obj = await db.get(Task, task_id)
            if obj:
                obj.siaHash = sia_object_id
                obj.siaStatus = "ready"
                obj.updatedAt = datetime.now(timezone.utc)
                await db.commit()

        return sia_object_id
    except Exception as exc:
        # Step: failed
        async with async_session_factory() as db:
            obj = await db.get(Task, task_id)
            if obj:
                obj.siaStatus = "failed"
                obj.updatedAt = datetime.now(timezone.utc)
                await db.commit()
        raise


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/approve", response_model=ApproveResponse)
async def approve_and_upload(
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a pipeline-passed task as approved and start the Sia upload pipeline.

    Returns immediately with siaStatus="queued". The actual Sia upload runs
    in a background asyncio task. Poll GET /api/tasks/{taskId} to see the
    progressing siaStatus: queued → uploading → pinning → ready (or failed).
    """
    task = await db.get(Task, body.taskId)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {body.taskId} not found")

    if task.status not in ("pipeline_passed", "approved"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Task is in status '{task.status}'. "
                "Only tasks that have passed the full pipeline can be approved."
            ),
        )

    # Persist approval + queued status immediately
    task.status = "approved"
    task.approvedAt = datetime.now(timezone.utc)
    task.siaStatus = "queued"
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    # Fire-and-forget the Sia pipeline in background
    import asyncio
    asyncio.create_task(
        _sia_pipeline(body.taskId, body.storagePath, task)
    )

    return ApproveResponse(taskId=body.taskId, siaStatus="queued")