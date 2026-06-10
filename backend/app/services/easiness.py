# app/services/easiness.py
#
# Probe runner for two pipeline stages:
#
#   Stage 6 — Easiness prefilter
#     Model: settings.DEFAULT_MODEL_ID  (e.g. deepseek-v4-flash — faster/cheaper)
#     Runs:  5 parallel oracle containers
#     Pass:  exactly 1/5 succeed
#     0/5   → TOO_HARD  (task env broken or oracle itself is wrong)
#     2+/5  → TOO_EASY  (task is not a real challenge)
#     1/5   → GOOD      (proceed to difficulty probe)
#
#   Stage 7 — Difficulty probe
#     Model: settings.DIFFICULTY_MODEL_ID  (e.g. deepseek-v4-pro — frontier)
#     Runs:  5 parallel oracle containers
#     Pass:  1–3/5 succeed
#     0/5   → TOO_HARD
#     4–5/5 → TOO_EASY
#     1–3/5 → GOOD
#
# Both stages run all N containers IN PARALLEL using a ThreadPoolExecutor so
# wall-clock time is ~1 container runtime rather than N × runtime.
#
# Container naming uses task_id + stage + run-index so names are globally
# unique even when multiple tasks are processed concurrently.
#
# All model references come exclusively from settings (config.py).
# Nothing is hardcoded.

from __future__ import annotations

import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Tuple

from app.core.config import settings
from app.services.pipeline import (
    _task_dir,
    _read_task_toml,
    _image_tag,
    _run_container_stage,
)

_PROBE_RUNS = 5

# Dedicated thread pool for parallel container launches.
# Max workers = probe runs so all containers start simultaneously.
_PROBE_POOL = ThreadPoolExecutor(max_workers=_PROBE_RUNS, thread_name_prefix="probe")


def _log(msg: str) -> None:
    print(f"[PROBE] {msg}", file=sys.stderr, flush=True)


# ── Public entry points ───────────────────────────────────────────────────────

async def run_easiness_prefilter(
    task_id: str,
    storage_path: str,
) -> Tuple[bool, str]:
    """
    Stage 6 — Easiness prefilter.
    Uses DEFAULT_MODEL_ID (fast/cheap model).
    Passes only if exactly 1/5 oracle runs produce reward=1.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _probe_sync, task_id, storage_path, "easiness",
        settings.DEFAULT_PROVIDER, settings.DEFAULT_MODEL_ID,
    )


async def run_difficulty_probe(
    task_id: str,
    storage_path: str,
) -> Tuple[bool, str]:
    """
    Stage 7 — Difficulty probe.
    Uses DIFFICULTY_MODEL_ID (frontier model — stronger judge of task hardness).
    Passes if 1–3/5 oracle runs produce reward=1.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _probe_sync, task_id, storage_path, "difficulty",
        settings.DEFAULT_PROVIDER, settings.DIFFICULTY_MODEL_ID,
    )


# ── Core probe logic ──────────────────────────────────────────────────────────

def _probe_sync(
    task_id: str,
    storage_path: str,
    mode: str,           # "easiness" | "difficulty"
    provider: str,
    model_id: str,
) -> Tuple[bool, str]:
    """
    Launches _PROBE_RUNS containers IN PARALLEL and collects their results.
    Each container is a fully independent oracle run (solve.sh + test.sh).
    Results are gathered in submission order regardless of completion order.
    """
    task_dir  = _task_dir(storage_path)
    task_meta = _read_task_toml(task_dir)
    img_tag   = _image_tag(task_id)
    model_label = f"{provider}/{model_id}"

    _log(f"{mode}: launching {_PROBE_RUNS} parallel oracle containers "
         f"(task={task_id}, model={model_label})")

    # Submit all runs simultaneously to the thread pool
    futures = {}
    for i in range(_PROBE_RUNS):
        stage_name = f"{mode}_{i}"
        future = _PROBE_POOL.submit(
            _run_container_stage,
            task_id=task_id,
            stage=stage_name,
            task_dir=task_dir,
            image_tag=img_tag,
            oracle=True,
            task_meta=task_meta,
        )
        futures[future] = i

    # Collect results — preserve per-run details for the log message
    run_results: list[dict] = [{}] * _PROBE_RUNS
    for future in as_completed(futures):
        i = futures[future]
        try:
            reward, logs = future.result()
            passed = reward == "1"
            run_results[i] = {
                "index": i + 1,
                "passed": passed,
                "reward": reward,
                "reward_missing": reward is None,
                "logs_tail": logs[-300:].strip() if logs else "",
            }
            _log(f"{mode} run {i+1}/{_PROBE_RUNS}: reward={reward!r} passed={passed}")
        except Exception as exc:
            run_results[i] = {
                "index": i + 1,
                "passed": False,
                "reward": None,
                "reward_missing": True,
                "logs_tail": f"Container exception: {exc}",
            }
            _log(f"{mode} run {i+1}/{_PROBE_RUNS}: EXCEPTION — {exc}")

    passes = sum(1 for r in run_results if r.get("passed"))
    symbols = ["✓" if r.get("passed") else "✗" for r in run_results]
    summary = " ".join(symbols)

    _log(f"{mode}: {passes}/{_PROBE_RUNS} passed [{summary}] model={model_label}")

    if mode == "easiness":
        return _score_easiness(passes, summary, model_label, run_results)
    return _score_difficulty(passes, summary, model_label, run_results)


def _format_run_details(run_results: list[dict]) -> str:
    """
    Build a per-run breakdown for the failure message.
    Only includes failing runs with non-empty log tails to keep noise down.
    """
    lines = []
    for r in run_results:
        idx     = r.get("index", "?")
        passed  = r.get("passed", False)
        reward  = r.get("reward")
        missing = r.get("reward_missing", False)
        tail    = r.get("logs_tail", "").strip()

        status = "PASS" if passed else "FAIL"
        reward_str = "(reward.txt missing)" if missing and reward is None else f"reward={reward!r}"

        line = f"  Run {idx}: {status} {reward_str}"
        if not passed and tail:
            # Indent the log tail under the run line
            indented = "\n    ".join(tail.splitlines())
            line += f"\n    {indented}"
        lines.append(line)
    return "\n".join(lines)


def _score_easiness(
    passes: int,
    summary: str,
    model_label: str,
    run_results: list[dict],
) -> Tuple[bool, str]:
    """
    Easiness prefilter:
      0/5  → TOO_HARD  (reject)
      1/5  → GOOD      (pass — proceed to difficulty probe)
      2+/5 → TOO_EASY  (reject)
    """
    details = _format_run_details(run_results)

    if passes == 0:
        return (
            False,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_HARD "
            f"(model={model_label}).\n"
            f"The oracle solution never produced reward=1 across {_PROBE_RUNS} independent runs. "
            f"This usually means solve.sh isn't applying the fix correctly, or the test "
            f"environment has a non-deterministic failure.\n"
            f"Check that solve.sh runs cleanly and that tests pass after it does.\n"
            f"Per-run details:\n{details}",
        )

    if passes == 1:
        return (
            True,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — GOOD "
            f"(model={model_label}). Proceeding to difficulty probe.\n"
            f"Per-run details:\n{details}",
        )

    # passes >= 2
    return (
        False,
        f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_EASY "
        f"(model={model_label}).\n"
        f"The oracle solution passed {passes}/{_PROBE_RUNS} times — the task is too easy "
        f"to provide a meaningful benchmark signal.\n"
        f"Add complexity, remove hints, or tighten constraints so the task "
        f"requires genuine problem-solving.\n"
        f"Per-run details:\n{details}",
    )


def _score_difficulty(
    passes: int,
    summary: str,
    model_label: str,
    run_results: list[dict],
) -> Tuple[bool, str]:
    """
    Difficulty probe:
      0/5   → TOO_HARD  (reject)
      1–3/5 → GOOD      (pass)
      4–5/5 → TOO_EASY  (reject)
    """
    details = _format_run_details(run_results)

    if passes == 0:
        return (
            False,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_HARD "
            f"(model={model_label}).\n"
            f"The frontier model never passed across {_PROBE_RUNS} independent runs. "
            f"Simplify the task or add more context to instruction.md so an agent "
            f"can make meaningful progress.\n"
            f"Per-run details:\n{details}",
        )

    if 1 <= passes <= 3:
        return (
            True,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — difficulty GOOD "
            f"(model={model_label}).\n"
            f"Per-run details:\n{details}",
        )

    # passes >= 4
    return (
        False,
        f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_EASY "
        f"(model={model_label}).\n"
        f"The frontier model passed {passes}/{_PROBE_RUNS} times — difficulty band exceeded. "
        f"Add complexity, remove hints, or tighten constraints.\n"
        f"Per-run details:\n{details}",
    )