# app/services/easiness.py
#
# Stage 6 — Easiness Prefilter
#
# Uses the easiness_model from DB config (the fast / cheap model) to run
# 5 staggered-parallel agent attempts.  Pass logic:
#
#   - 0 passes              → TOO_HARD  → pipeline fails
#   - 1 to EASY_MAX_PASS   → ACCEPTABLE → pipeline passes
#   - all 5 runs pass      → TOO_EASY  → pipeline fails
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

# Easiness prefilter: ACCEPTABLE if pass_count is in [1, EASY_MAX_PASS]
EASY_MAX_PASS = 4   # 5/5 → TOO_EASY


# ── Public entry point ─────────────────────────────────────────────────────────

async def run_easiness_prefilter(
    task_id: str,
    storage_path: str,
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Stage 6 — Easiness prefilter.

    Uses the easiness_model from DB config (the fast / cheap model).

    Pass logic:
      - 0 passes              → TOO_HARD  → pipeline fails
      - 1 to EASY_MAX_PASS   → ACCEPTABLE → pipeline passes
      - all 5 runs pass      → TOO_EASY  → pipeline fails

    A per-task lock ensures only one easiness probe runs at a time for a
    given task_id, preventing double-spend from concurrent pipeline calls.
    """
    lock = get_task_lock(f"easiness:{task_id}")
    async with lock:
        model_id, provider = await get_model_for_role("easiness_model", db)

        pass_count, rate_limited_count, results = await run_probe(
            task_id=task_id,
            storage_path=storage_path,
            model_id=model_id,
            provider=provider,
            n=TOTAL_RUNS,
            easy_max_pass=EASY_MAX_PASS,
        )

        detail = per_run_detail(results)
        runs_done = len(results)

        if pass_count == 0:
            if rate_limited_count == runs_done:
                # Every failure was caused by rate limiting
                msg = (
                    f"pass@5: 0 / {runs_done} · RATE_LIMITED\n"
                    f"All {runs_done} runs failed due to OpenRouter rate limiting "
                    f"(HTTP 429). The model never had a chance to attempt the task.\n"
                    f"Wait for rate limits to reset, add credits, or use a non-free model.\n"
                    f"PER-RUN EPISODES ({runs_done})\n{detail}"
                )
                return False, msg
            elif rate_limited_count > 0:
                # Mixed: some rate-limited, some genuine failures
                msg = (
                    f"pass@5: 0 / {runs_done} · TOO_HARD / RATE_LIMITED\n"
                    f"{rate_limited_count} of {runs_done} runs failed due to OpenRouter rate limiting (HTTP 429).\n"
                    f"{runs_done - rate_limited_count} run(s) failed for other reasons.\n"
                    f"Wait for rate limits to reset, add credits, or use a non-free model, "
                    f"then retry for a clearer signal.\n"
                    f"PER-RUN EPISODES ({runs_done})\n{detail}"
                )
                return False, msg
            else:
                msg = (
                    f"pass@5: 0 / {runs_done} · TOO_HARD (model never solved the task)\n"
                    f"Task appears too hard: no run passed. Simplify or add more context to instruction.md.\n"
                    f"PER-RUN EPISODES ({runs_done})\n{detail}"
                )
                return False, msg

        if pass_count >= runs_done and runs_done == TOTAL_RUNS and rate_limited_count == 0:
            frontier_id, _ = await get_model_for_role("frontier_model", db)
            msg = (
                f"pass@5: {pass_count} / {runs_done} · TOO_EASY "
                f"({pass_count}/{runs_done} — frontier skipped)\n"
                f"Task is too easy: {model_id} passed every run. "
                f"Frontier model {frontier_id} difficulty probe skipped to save cost.\n"
                f"PER-RUN EPISODES ({runs_done})\n{detail}"
            )
            return False, msg

        msg = (
            f"pass@5: {pass_count} / {runs_done} · ACCEPTABLE\n"
            f"Task difficulty looks good: {pass_count} of {runs_done} runs solved by {model_id}.\n"
            f"PER-RUN EPISODES ({runs_done})\n{detail}"
        )
        return True, msg