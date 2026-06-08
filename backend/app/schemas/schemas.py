from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ─────────────────────────────────────────
# Task schemas
# ─────────────────────────────────────────

class TaskRead(BaseModel):
    id: str
    projectId: str
    title: str
    description: str
    domain: str
    language: str
    storagePath: str
    status: str
    scoringType: str
    timeoutMs: int
    similarityScore: Optional[float] = None
    isDuplicate: Optional[bool] = None
    ciPassed: Optional[bool] = None
    qualityScore: Optional[float] = None
    qualityDetails: Optional[str] = None
    easinessResult: Optional[str] = None
    agentQualityNote: Optional[str] = None
    siaHash: Optional[str] = None
    indexdKey: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    approvedAt: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# BenchmarkRun schemas
# ─────────────────────────────────────────

class RunCreate(BaseModel):
    taskId: str
    projectId: str
    provider: str
    modelId: str


class RunRead(BaseModel):
    id: str
    taskId: str
    projectId: str
    provider: str
    modelId: str
    status: str
    score: Optional[float] = None
    runtimeMs: Optional[int] = None
    tokenUsage: Optional[int] = None
    siaHash: Optional[str] = None
    indexdKey: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# RunLog schemas
# ─────────────────────────────────────────

class RunLogRead(BaseModel):
    id: str
    runId: str
    stream: str
    line: str
    ts: datetime

    class Config:
        from_attributes = True