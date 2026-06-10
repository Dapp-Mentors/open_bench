# app/services/easiness.py
#
# Shared probe runner used by two pipeline stages:
#
#   Stage 6 — Easiness prefilter
#     Runs the oracle solution against the task 5 times.
#     Requirement: exactly 1/5 passes.
#     0/5 → TOO_HARD  (task environment is broken or unsolvable)
#     2+/5 → TOO_EASY (task is too easy, not a real challenge)
#     1/5 → GOOD      (sweet spot — hard but solvable)
#
#   Stage 7 — Difficulty probe
#     Same 5 runs, broader acceptance band: 1–3/5 passes.
#     0/5   → TOO_HARD
#     4–5/5 → TOO_EASY
#     1–3/5 → GOOD
#
# Both stages re-use the oracle container pattern from services/pipeline.py:
# spin up the pre-built Docker image, run solve.sh + test.sh in an independent
# container, read reward.txt. Each of the 5 runs gets a unique container name
# so they can never collide even if run concurrently.
#
# Model identity comes from settings.DEFAULT_PROVIDER / settings.DEFAULT_MODEL_ID
# and is included in the log message for traceability. The probe does NOT inject
# a live LLM — it uses the task's oracle solution (solve.sh) as the upper bound
# on solvability. This is intentional: if the oracle itself can't land 1–3/5 the
# task environment is the problem, not the agent.

from __future__ import annotations

import asyncio
from typing import Tuple

from app.core.config import settings
from app.services.pipeline import (
    _task_dir,
    _read_task_toml,
    _image_tag,
    _run_container_stage,
)

_PROBE_RUNS = 5


# ── Public entry points ───────────────────────────────────────────────────────

async def run_easiness_prefilter(
    task_id: str,
    storage_path: str,
) -> Tuple[bool, str]:
    """
    Stage 6 — Easiness prefilter.
    Passes only if exactly 1/5 oracle runs succeed.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _probe_sync, task_id, storage_path, "easiness"
    )


async def run_difficulty_probe(
    task_id: str,
    storage_path: str,
) -> Tuple[bool, str]:
    """
    Stage 7 — Difficulty probe.
    Passes if 1–3/5 oracle runs succeed.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _probe_sync, task_id, storage_path, "difficulty"
    )


# ── Core probe logic ──────────────────────────────────────────────────────────

def _probe_sync(
    task_id: str,
    storage_path: str,
    mode: str,  # "easiness" | "difficulty"
) -> Tuple[bool, str]:
    """
    Runs the oracle container _PROBE_RUNS times in sequence.
    Each run is fully independent — fresh container, no shared filesystem state.
    """
    task_dir  = _task_dir(storage_path)
    task_meta = _read_task_toml(task_dir)
    img_tag   = _image_tag(task_id)

    passes  = 0
    results = []

    for i in range(_PROBE_RUNS):
        # Unique stage name per attempt keeps container names collision-free
        stage_name = f"{mode}_{i}"
        reward, _logs = _run_container_stage(
            task_id=task_id,
            stage=stage_name,
            task_dir=task_dir,
            image_tag=img_tag,
            oracle=True,    # solve.sh always runs before test.sh
            task_meta=task_meta,
        )
        passed = reward == "1"
        passes += int(passed)
        results.append("✓" if passed else "✗")

    summary     = " ".join(results)
    model_label = f"{settings.DEFAULT_PROVIDER}/{settings.DEFAULT_MODEL_ID}"

    if mode == "easiness":
        return _score_easiness(passes, summary, model_label)
    return _score_difficulty(passes, summary, model_label)


def _score_easiness(passes: int, summary: str, model_label: str) -> Tuple[bool, str]:
    """
    Easiness prefilter scoring:
      0/5  → TOO_HARD  (reject)
      1/5  → GOOD      (pass — proceed to difficulty probe)
      2+/5 → TOO_EASY  (reject)
    """
    if passes == 0:
        return (
            False,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_HARD "
            f"(model={model_label}). "
            f"The oracle solution never produced reward=1. Check that solve.sh "
            f"is correct, or simplify the task / add more context to instruction.md.",
        )
    if passes == 1:
        return (
            True,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — GOOD "
            f"(model={model_label}). Proceeding to difficulty probe.",
        )
    return (
        False,
        f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_EASY "
        f"(model={model_label}). "
        f"Add complexity, remove hints, or tighten constraints so the task "
        f"requires genuine problem-solving.",
    )


def _score_difficulty(passes: int, summary: str, model_label: str) -> Tuple[bool, str]:
    """
    Difficulty probe scoring:
      0/5   → TOO_HARD  (reject)
      1–3/5 → GOOD      (pass)
      4–5/5 → TOO_EASY  (reject)
    """
    if passes == 0:
        return (
            False,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_HARD "
            f"(model={model_label}). "
            f"Simplify the task or add more context to instruction.md.",
        )
    if 1 <= passes <= 3:
        return (
            True,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — difficulty GOOD "
            f"(model={model_label}).",
        )
    return (
        False,
        f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_EASY "
        f"(model={model_label}). "
        f"Add complexity, remove hints, or tighten constraints.",
    )