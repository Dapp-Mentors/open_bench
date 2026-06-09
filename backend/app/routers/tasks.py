# app/routers/tasks.py
#
# Read-only task endpoints.
# The frontend (Next.js / Prisma) owns all task creation, status updates,
# and approval writes. The backend only needs to read task data when the
# pipeline service needs it — but these endpoints are handy for debugging.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.orm import Task
from app.schemas.schemas import TaskRead

router = APIRouter()


@router.get("/", response_model=list[TaskRead])
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).order_by(Task.createdAt.desc()))
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task