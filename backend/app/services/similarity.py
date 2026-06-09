# app/services/similarity.py
#
# Stage 1 — Similarity & Diversity check.
#
# Algorithm
# ─────────
# 1. Read instruction.md from the submitted task directory.
# 2. Embed it via Ollama nomic-embed-text (configured in .env as
#    OLLAMA_BASE_URL + OLLAMA_EMBED_MODEL).
# 3. Query the DB for all tasks with status="approved" (or "pipeline_passed")
#    that have a stored embeddingJson.
# 4. Compute cosine similarity between the new embedding and every stored one.
# 5. If any similarity >= SIMILARITY_THRESHOLD → reject as near-duplicate.
# 6. Persist the new embedding onto the Task row for future comparisons.
#
# Threshold
# ─────────
# 0.92 catches paraphrased duplicates while allowing tasks in the same
# domain that approach the problem differently.
# Override via SIMILARITY_THRESHOLD in .env if needed.
#
# Cold-start
# ──────────
# If there are no approved tasks yet the check passes and the embedding is
# stored so the next submission has something to compare against.

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.orm import Task
from app.services.llm import get_embedding
from app.services.pipeline import _task_dir  # shared ZIP-extraction helper

# Read threshold from env so it can be tuned without a code change.
# e.g. add  SIMILARITY_THRESHOLD=0.88  to .env
SIMILARITY_THRESHOLD: float = float(os.environ.get("SIMILARITY_THRESHOLD", "0.92"))


# ── Public entry point ────────────────────────────────────────────────────────

async def run_similarity_check(
    task_id: str,
    storage_path: str,
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Returns (passed, message).
    Always writes the new embedding back to Task.embeddingJson regardless
    of pass/fail so future checks have a reference point.
    """
    task_dir         = _task_dir(storage_path)
    instruction_text = _read_instruction(task_dir)

    new_vec = await get_embedding(instruction_text)

    # Fetch approved tasks that already have embeddings stored
    result = await db.execute(
        select(Task).where(
            Task.status.in_(["approved", "pipeline_passed"]),
            Task.embeddingJson.isnot(None),
            Task.id != task_id,
        )
    )
    approved_tasks = result.scalars().all()

    best_score   = 0.0
    best_task_id = None

    for existing in approved_tasks:
        try:
            existing_vec = json.loads(existing.embeddingJson)  # type: ignore[arg-type]
        except Exception:
            continue

        score = _cosine(new_vec, existing_vec)
        if score > best_score:
            best_score   = score
            best_task_id = existing.id

    # Persist embedding on this task regardless of outcome
    task = await db.get(Task, task_id)
    if task:
        task.embeddingJson = json.dumps(new_vec)
        await db.commit()

    if best_score >= SIMILARITY_THRESHOLD:
        return (
            False,
            f"Near-duplicate detected (similarity={best_score:.3f} ≥ {SIMILARITY_THRESHOLD}, "
            f"matched task {best_task_id}). Task rejected to maintain dataset diversity.",
        )

    if best_task_id:
        return (
            True,
            f"No near-duplicates found (closest={best_score:.3f} < {SIMILARITY_THRESHOLD})",
        )

    return True, "No near-duplicates found (no approved tasks to compare against yet)"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_instruction(task_dir: Path) -> str:
    p = task_dir / "instruction.md"
    if not p.exists():
        raise FileNotFoundError(f"instruction.md not found in {task_dir}")
    return p.read_text(encoding="utf-8")


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        raise ValueError(f"Vector length mismatch: {len(a)} vs {len(b)}")
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)