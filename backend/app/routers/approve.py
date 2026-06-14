# ── Sia upload on approval ────────────────────────────────────────────────────
#
# Add this endpoint to app/routers/pipeline.py (or keep it in its own router).
# It's called by the frontend (or Inngest) when a reviewer clicks "Approve".
#
# What it does:
#   1. Marks the task as "approved" in Postgres.
#   2. Uploads the task ZIP to the Sia network.
#   3. Stores the returned object ID in Task.siaHash.
#
# The frontend already owns the status write via the Next.js API layer,
# but the Sia upload must happen server-side (Python) because the SDK is
# a Python package. So this endpoint acts as the bridge.

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.orm import Task
from app.services import sia as sia_svc

router = APIRouter()  # attach to the existing pipeline router instead of re-declaring one


class ApproveRequest(BaseModel):
    taskId: str
    storagePath: str


class ApproveResponse(BaseModel):
    taskId: str
    siaHash: str


@router.post("/approve", response_model=ApproveResponse)
async def approve_and_upload(
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a pipeline-passed task as approved and upload its ZIP to Sia.

    Called by the frontend after a human reviewer clicks "Approve".
    Stores the Sia object ID in Task.siaHash so the object can be
    retrieved or shared later.
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

    # Upload to Sia — this may take a few seconds for large ZIPs
    try:
        sia_object_id = await sia_svc.upload_task(
            task_id=body.taskId,
            storage_path=body.storagePath,
            extra_meta={
                "projectId": task.projectId,
                "domain": task.domain,
                "language": task.language,
                "title": task.title,
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Sia upload failed: {exc}",
        )

    # Persist approval + Sia object ID
    task.status = "approved"
    task.siaHash = sia_object_id
    task.approvedAt = datetime.now(timezone.utc)
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    return ApproveResponse(taskId=body.taskId, siaHash=sia_object_id)