import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, DateTime, Enum, ForeignKey, JSON, Text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class RunStatus(str, enum.Enum):
    PENDING   = "PENDING"
    RUNNING   = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED    = "FAILED"


class Model(Base):
    __tablename__ = "models"

    id         = Column(String, primary_key=True)
    name       = Column(String, nullable=False)
    provider   = Column(String, nullable=False)   # ollama | mistral | llama3 | phi2 …
    config     = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    runs = relationship("Run", back_populates="model")


class Task(Base):
    __tablename__ = "tasks"

    id          = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    prompt      = Column(Text, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    runs = relationship("Run", back_populates="task")


class Run(Base):
    __tablename__ = "runs"

    id         = Column(String, primary_key=True)
    status     = Column(Enum(RunStatus), default=RunStatus.PENDING, nullable=False)
    model_id   = Column(String, ForeignKey("models.id"), nullable=False)
    task_id    = Column(String, ForeignKey("tasks.id"), nullable=False)
    score      = Column(Float, nullable=True)
    logs       = Column(JSON, nullable=True)       # streamed log lines
    output     = Column(Text, nullable=True)       # raw model response
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at   = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    model = relationship("Model", back_populates="runs")
    task  = relationship("Task",  back_populates="runs")
