# app/models/orm.py
#
# These ORM classes mirror the Prisma schema owned by the frontend.
# DO NOT add columns, rename tables, or run DDL from here.
# If the Prisma schema changes, update these classes to match.

from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Project(Base):
    __tablename__ = "Project"

    id          = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    description = Column(String, nullable=False)
    domain      = Column(String, nullable=False)
    createdAt   = Column(DateTime(timezone=True))
    updatedAt   = Column(DateTime(timezone=True))

    tasks = relationship("Task", back_populates="project")


class Task(Base):
    __tablename__ = "Task"

    id               = Column(String, primary_key=True)
    projectId        = Column(String, ForeignKey("Project.id", ondelete="CASCADE"), nullable=False)
    title            = Column(String, nullable=False)
    description      = Column(String, default="")
    domain           = Column(String, nullable=False)
    language         = Column(String, nullable=False)
    storagePath      = Column(String, nullable=False)
    dockerImage      = Column(String, default="")
    timeoutMs        = Column(Integer, default=120000)
    scoringType      = Column(String, default="passfail")
    expectedOutput   = Column(String, nullable=True)
    expectedPattern  = Column(String, nullable=True)
    status           = Column(String, default="pending")
    similarityScore  = Column(Float, nullable=True)
    isDuplicate      = Column(Boolean, nullable=True)
    ciPassed         = Column(Boolean, nullable=True)
    qualityScore     = Column(Float, nullable=True)
    qualityDetails   = Column(Text, nullable=True)
    easinessResult   = Column(String, nullable=True)
    agentQualityNote = Column(String, nullable=True)
    siaHash          = Column(String, nullable=True)
    indexdKey        = Column(String, nullable=True)
    embeddingJson    = Column(Text, nullable=True)
    createdAt        = Column(DateTime(timezone=True))
    updatedAt        = Column(DateTime(timezone=True))
    approvedAt       = Column(DateTime(timezone=True), nullable=True)

    project      = relationship("Project", back_populates="tasks")
    pipelineLogs = relationship("PipelineLog", back_populates="task")
    runs         = relationship("BenchmarkRun", back_populates="task")


class PipelineLog(Base):
    __tablename__ = "PipelineLog"

    id      = Column(String, primary_key=True)
    taskId  = Column(String, ForeignKey("Task.id", ondelete="CASCADE"), nullable=False)
    stage   = Column(String, nullable=False)
    passed  = Column(Boolean, nullable=True)
    message = Column(String, default="")
    ts      = Column(DateTime(timezone=True))

    task = relationship("Task", back_populates="pipelineLogs")


class BenchmarkRun(Base):
    __tablename__ = "BenchmarkRun"

    id         = Column(String, primary_key=True)
    taskId     = Column(String, ForeignKey("Task.id", ondelete="CASCADE"), nullable=False)
    projectId  = Column(String, nullable=False)
    provider   = Column(String, nullable=False)
    modelId    = Column(String, nullable=False)
    status     = Column(String, default="running")
    score      = Column(Float, nullable=True)
    runtimeMs  = Column(Integer, nullable=True)
    tokenUsage = Column(Integer, nullable=True)
    siaHash    = Column(String, nullable=True)
    indexdKey  = Column(String, nullable=True)
    createdAt  = Column(DateTime(timezone=True))
    updatedAt  = Column(DateTime(timezone=True))

    task = relationship("Task", back_populates="runs")
    logs = relationship("RunLog", back_populates="run")


class RunLog(Base):
    __tablename__ = "RunLog"

    id     = Column(String, primary_key=True)
    runId  = Column(String, ForeignKey("BenchmarkRun.id", ondelete="CASCADE"), nullable=False)
    stream = Column(String, nullable=False)
    line   = Column(String, nullable=False)
    ts     = Column(DateTime(timezone=True))

    run = relationship("BenchmarkRun", back_populates="logs")