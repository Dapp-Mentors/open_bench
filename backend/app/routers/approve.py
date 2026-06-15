# ── Sia upload BEFORE approval ─────────────────────────────────────────────────#
#
# Called by the frontend when a reviewer clicks "Approve".
#
# Key change from previous version:
#   The task is NOT marked as "approved" until the Sia upload pipeline finishes.
#   This ensures the asset is shipped to Sia before being considered approved.
#
# Flow:
#   1. Keeps task status as "pipeline_passed", sets siaStatus → "queued"
#   2. Starts the Sia upload pipeline in a background task:
#        queued → uploading → pinning → ready
#   3. Only when siaStatus reaches "ready", flips task.status → "approved"
#   4. If upload fails, siaStatus → "failed" and task remains "pipeline_passed"
#
# The frontend can subscribe to SSE at /api/sia/events for real-time updates.

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, async_session_factory
from app.models.orm import Task
from app.services import sia as sia_svc
from app.services.sse import sia_broadcast

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
# Task is only marked "approved" AFTER the Sia upload completes successfully.

async def _sia_pipeline(task_id: str, storage_path: str, task: Task) -> str:
    """
    Background task: upload → pin → mark approved + ready.
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
        # Broadcast status change via SSE
        sia_broadcast(task_id, status)

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

        # Step: ready — persist siaHash + final status AND mark as approved
        async with async_session_factory() as db:
            obj = await db.get(Task, task_id)
            if obj:
                obj.siaHash = sia_object_id
                obj.siaStatus = "ready"
                obj.status = "approved"           # ← Only now approved!
                obj.approvedAt = datetime.now(timezone.utc)
                obj.updatedAt = datetime.now(timezone.utc)
                await db.commit()

        # Broadcast final status
        sia_broadcast(task_id, "ready", sia_hash=sia_object_id)

        return sia_object_id
    except Exception as exc:
        # Step: failed
        async with async_session_factory() as db:
            obj = await db.get(Task, task_id)
            if obj:
                obj.siaStatus = "failed"
                # NOTE: status stays as "pipeline_passed" — the admin can retry
                obj.updatedAt = datetime.now(timezone.utc)
                await db.commit()

        sia_broadcast(task_id, "failed")

        print(f"[Sia] Upload failed for task {task_id}: {exc}")
        raise


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/approve", response_model=ApproveResponse)
async def approve_and_upload(
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Start Sia upload for a pipeline-passed task.

    The task status stays as "pipeline_passed" while uploading.
    Only after Sia confirms the upload + pin does status flip to "approved".

    Returns immediately with siaStatus="queued". Subscribe to SSE at
    GET /api/sia/events for real-time status updates, or poll
    GET /api/tasks/{taskId} to see the progressing siaStatus.

    siaStatus lifecycle: queued → uploading → pinning → ready (or failed)
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

    # If already approved + ready, just return the existing data
    if task.status == "approved" and task.siaStatus == "ready":
        return ApproveResponse(
            taskId=body.taskId,
            siaHash=task.siaHash,
            siaStatus="ready",
        )

    # If sia upload previously failed, allow retry
    if task.siaStatus == "failed":
        print(f"[Sia] Retrying upload for task {body.taskId}")

    # Persist queued status immediately (status stays pipeline_passed)
    task.siaStatus = "queued"
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    # Broadcast initial queued status
    sia_broadcast(body.taskId, "queued")

    # Fire-and-forget the Sia pipeline in background
    import asyncio
    asyncio.create_task(
        _sia_pipeline(body.taskId, body.storagePath, task)
    )

    return ApproveResponse(taskId=body.taskId, siaStatus="queued")