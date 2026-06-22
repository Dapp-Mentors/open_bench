# app/services/difficulty.py
#
# Stage 7 — Difficulty Probe
#
# Uses the frontier_model from DB config (the strong model) to run
# 5 staggered-parallel agent attempts.  Pass logic:
#
#   - 0 passes              → TOO_HARD even for frontier → fail
#   - 1 to DIFF_MAX_PASS   → correct difficulty band → pass
#   - > DIFF_MAX_PASS      → TOO_EASY for frontier → fail
#
# The heavy lifting (agent dispatch, early-exit, concurrency guards) lives
# in probe_base.py — this module is just the stage-specific glue.

from __future__ import annotations

from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.model_config import get_model_for_role
from app.services.probe_base import (
    get_task_lock,
    run_probe,
    per_run_detail,
    TOTAL_RUNS,
)

# ── Thresholds ─────────────────────────────────────────────────────────────────

# Difficulty probe: ACCEPTABLE if pass_count is in [1, DIFF_MAX_PASS]
DIFF_MAX_PASS = 3


# ── Public entry point ─────────────────────────────────────────────────────────

async def run_difficulty_probe(
    task_id: str,
    storage_path: str,
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Stage 7 — Difficulty probe.

    Uses the frontier_model from DB config (the strong model).

    Pass logic:
      - 0 passes              → TOO_HARD even for frontier → fail
      - 1 to DIFF_MAX_PASS   → correct difficulty band → pass
      - > DIFF_MAX_PASS      → TOO_EASY for frontier → fail

    A per-task lock ensures only one difficulty probe runs at a time for a
    given task_id, preventing double-spend from concurrent pipeline calls.
    """
    lock = get_task_lock(f"difficulty:{task_id}")
    async with lock:
        model_id, provider = await get_model_for_role("frontier_model", db)

        pass_count, results = await run_probe(
            task_id=task_id,
            storage_path=storage_path,
            model_id=model_id,
            provider=provider,
            n=TOTAL_RUNS,
            diff_max_pass=DIFF_MAX_PASS,
        )

        detail = per_run_detail(results)
        runs_done = len(results)

        if pass_count == 0:
            msg = (
                f"Difficulty probe: 0 / {runs_done} — TOO_HARD even for {model_id}.\n"
                f"PER-RUN EPISODES ({runs_done})\n{detail}"
            )
            return False, msg

        if pass_count > DIFF_MAX_PASS:
            msg = (
                f"Difficulty probe: {pass_count} / {runs_done} — TOO_EASY for {model_id}.\n"
                f"PER-RUN EPISODES ({runs_done})\n{detail}"
            )
            return False, msg

        msg = (
            f"Difficulty probe: {pass_count} / {runs_done} — ACCEPTABLE difficulty for {model_id}.\n"
            f"PER-RUN EPISODES ({runs_done})\n{detail}"
        )
        return True, msg