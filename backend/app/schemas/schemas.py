from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from app.models.orm import RunStatus


# ─────────────────────────────────────────
# Model schemas
# ─────────────────────────────────────────

class ModelCreate(BaseModel):
    name: str
    provider: str
    config: Optional[Dict[str, Any]] = None


class ModelRead(ModelCreate):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# Task schemas
# ─────────────────────────────────────────

class TaskCreate(BaseModel):
    name: str
    description: Optional[str] = None
    prompt: str


class TaskRead(TaskCreate):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# Run schemas
# ─────────────────────────────────────────

class RunCreate(BaseModel):
    model_id: str
    task_id: str


class RunRead(BaseModel):
    id: str
    status: RunStatus
    model_id: str
    task_id: str
    score: Optional[float]
    logs: Optional[List[str]]
    output: Optional[str]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True
