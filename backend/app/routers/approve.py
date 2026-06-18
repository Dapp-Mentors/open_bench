# ── Approval endpoint ─────────────────────────────────────────────────────────#
#
# Simplified: human reviewer clicks "Approve" → task status flips to "approved".
# Sia upload is no longer part of approval — it runs automatically as stage 9
# of the pipeline (see pipeline.py → /api/pipeline/sia-upload).

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.orm import Task

router = APIRouter()


class ApproveRequest(BaseModel):
    taskId: str


class ApproveResponse(BaseModel):
    taskId: str
    siaHash: str | None = None
    siaStatus: str = "pending"


@router.post("/approve", response_model=ApproveResponse)
async def approve_task(
    body: ApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a pipeline-passed task.
    Simply flips the task status to "approved" — Sia upload has already
    happened as part of the pipeline (stage 9).
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

    # If already approved, just return existing data
    if task.status == "approved":
        return ApproveResponse(
            taskId=body.taskId,
            siaHash=task.siaHash,
            siaStatus=task.siaStatus or "pending",
        )

    # Mark as approved immediately (Sia was already uploaded in the pipeline)
    task.status = "approved"
    task.approvedAt = datetime.now(timezone.utc)
    task.updatedAt = datetime.now(timezone.utc)
    await db.commit()

    return ApproveResponse(
        taskId=body.taskId,
        siaHash=task.siaHash,
        siaStatus=task.siaStatus or "pending",
    )