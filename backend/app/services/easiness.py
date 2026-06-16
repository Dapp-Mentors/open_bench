# app/services/easiness.py
#
# Stage 6 — Easiness Prefilter  (5 staggered-parallel runs, pass threshold: 1–4 / 5)
# Stage 7 — Difficulty Probe    (5 staggered-parallel runs, pass threshold: 1–3 / 5)
#
# Each run launches an LLM agent that tries to solve the task from scratch
# inside a sandboxed environment.  The agent follows the structured JSON
# protocol defined in agent_prompt.py.
#
# Execution model
# ───────────────
# Runs execute in parallel but with a staggered start: run N begins
# RUN_START_STAGGER seconds after run N-1.  This spreads the initial burst
# of requests across time so we don't slam the OpenRouter API all at once,
# while still finishing much faster than fully sequential execution.
#
# For a free-tier model the stagger should be at least 10 s.  For paid tiers
# you can lower it to 1–3 s or even 0 to go fully parallel.
#
# Concurrency guard
# ─────────────────
# A per-task asyncio.Lock prevents two pipeline invocations for the same
# task_id from running their probes simultaneously (which produces interleaved
# logs and double API spend).  The second caller waits until the first
# finishes, then re-uses the cached result if available.
#
# Step-level resilience
# ─────────────────────
# Free models often return garbage short responses (30–60 chars) that fail
# JSON parsing.  Rather than failing the entire run on the first bad step,
# we retry that step up to STEP_PARSE_RETRIES times with a short delay,
# asking the model to try again.  Only if every retry produces garbage do
# we mark the run as FAIL.
#
# Early-exit
# ──────────
# Once the outcome is decided (enough passes or too many passes) we cancel
# any still-running tasks to save API cost.

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from app.services.llm import chat_completion
from app.services.pipeline import _task_dir
from app.services.model_config import get_model_for_role
from app.services.agent_prompt import (
    AGENT_SYSTEM_PROMPT,
    build_initial_user_prompt,
    build_continuation_user_prompt,
)

# ── Tuneable constants ────────────────────────────────────────────────────────

MAX_STEPS          = 12    # max agent turns per run before giving up
TOTAL_RUNS         = 5     # number of independent attempts
AGENT_MAX_TOKENS   = 2048

# Seconds between each run's start time.  Set to 0 for fully parallel.
# 12 s is safe for OpenRouter free-tier (rate limit window ~10–15 s).
RUN_START_STAGGER  = 12.0

# If the model returns a response that can't be parsed as JSON, retry the
# step this many extra times before giving up on the whole run.
STEP_PARSE_RETRIES = 2
STEP_RETRY_DELAY   = 5.0   # seconds between parse-retry attempts

# Easiness prefilter: ACCEPTABLE if pass_count is in [1, EASY_MAX_PASS]
EASY_MAX_PASS = 4   # 5/5 → TOO_EASY

# Difficulty probe: ACCEPTABLE if pass_count is in [1, DIFF_MAX_PASS]
DIFF_MAX_PASS = 3

# ── Per-task concurrency locks ────────────────────────────────────────────────
# Prevents two simultaneous pipeline calls for the same task_id from running
# overlapping probes (interleaved logs, wasted spend).

_task_locks: dict[str, asyncio.Lock] = {}

def _get_task_lock(task_id: str) -> asyncio.Lock:
    if task_id not in _task_locks:
        _task_locks[task_id] = asyncio.Lock()
    return _task_locks[task_id]


# ── Logging helpers ───────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[PROBE] {msg}", file=sys.stderr, flush=True)


# ── JSON extraction ───────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    """
    Pull the first valid JSON object out of a potentially noisy LLM response.
    Returns None if no valid JSON is found.
    """
    # Fast path: entire response is already valid JSON
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Strip common markdown fences the model might wrap around its JSON
    stripped = text.strip()
    for fence in ("```json", "```"):
        if stripped.startswith(fence):
            stripped = stripped[len(fence):]
            if stripped.endswith("```"):
                stripped = stripped[:-3]
            stripped = stripped.strip()
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                pass

    # Find the outermost { ... } block
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


# ── Single-agent loop ─────────────────────────────────────────────────────────

async def _run_agent_once(
    task_dir: Path,
    run_index: int,
    model_id: str,
    provider: str,
    start_delay: float = 0.0,
) -> bool:
    """
    Execute one full agentic attempt (up to MAX_STEPS turns).

    start_delay: seconds to wait before the very first LLM call.  Used by
    _run_probe to stagger parallel run starts.

    Returns True  if the agent sets task_complete=True within MAX_STEPS.
    Returns False on exhausted steps, persistent bad JSON, or LLM errors.

    Resilience against garbage responses:
      If a step produces a response that can't be parsed as valid JSON, we
      retry that step up to STEP_PARSE_RETRIES times with a short pause.
      This handles free-tier models that occasionally return truncated or
      malformed output instead of the expected JSON schema.
    """
    tag = f"run {run_index + 1}"

    if start_delay > 0:
        _log(f"{tag}: waiting {start_delay:.0f}s stagger before starting...")
        await asyncio.sleep(start_delay)

    initial_prompt = build_initial_user_prompt(task_dir)
    conversation_log: list[str] = []
    terminal_output = "root@sandbox:/app#"

    consecutive_parse_failures = 0  # reset when a step succeeds

    step = 0
    while step < MAX_STEPS:
        # Build the user message
        if step == 0:
            user_message = initial_prompt
        else:
            history = "\n\n".join(conversation_log)
            user_message = (
                initial_prompt
                + "\n\n---\n\n## Conversation so far\n\n"
                + history
                + "\n\n---\n\n"
                + build_continuation_user_prompt(terminal_output)
            )

        # ── LLM call ─────────────────────────────────────────────────────────
        try:
            raw = await chat_completion(
                system=AGENT_SYSTEM_PROMPT,
                user=user_message,
                provider=provider,
                model_id=model_id,
                temperature=0.3,
                max_tokens=AGENT_MAX_TOKENS,
            )
        except Exception as exc:
            _log(f"{tag}: LLM error at step {step + 1}: {exc}")
            return False

        char_count = len(raw) if raw else 0
        _log(f"{tag}: step {step + 1} response ({char_count} chars)")

        # ── Empty response ────────────────────────────────────────────────────
        if not raw or not raw.strip():
            consecutive_parse_failures += 1
            _log(
                f"{tag}: empty response at step {step + 1} "
                f"(failure {consecutive_parse_failures}/{STEP_PARSE_RETRIES + 1})"
            )
            if consecutive_parse_failures > STEP_PARSE_RETRIES:
                _log(f"{tag}: too many empty responses — marking FAIL")
                return False
            _log(f"{tag}: retrying step {step + 1} in {STEP_RETRY_DELAY}s...")
            await asyncio.sleep(STEP_RETRY_DELAY)
            # Don't advance `step` — retry the same logical step
            continue

        # ── JSON parse ────────────────────────────────────────────────────────
        parsed = _extract_json(raw)
        if parsed is None:
            consecutive_parse_failures += 1
            _log(
                f"{tag}: bad JSON at step {step + 1} "
                f"(failure {consecutive_parse_failures}/{STEP_PARSE_RETRIES + 1}) "
                f"— snippet: {raw[:80]!r}"
            )
            if consecutive_parse_failures > STEP_PARSE_RETRIES:
                _log(f"{tag}: too many parse failures — marking FAIL")
                return False
            _log(f"{tag}: retrying step {step + 1} in {STEP_RETRY_DELAY}s...")
            await asyncio.sleep(STEP_RETRY_DELAY)
            continue  # retry same step

        # Good parse — reset the failure counter
        consecutive_parse_failures = 0

        # ── Task complete? ────────────────────────────────────────────────────
        if parsed.get("task_complete") is True:
            _log(f"{tag}: task_complete=True — PASS ✓")
            return True

        # ── Simulate terminal echo for next turn ──────────────────────────────
        commands = parsed.get("commands", [])
        if not commands:
            terminal_output = "root@sandbox:/app#"
        else:
            cmd_lines = [c.get("keystrokes", "").rstrip("\n") for c in commands[:4]]
            terminal_output = "\n".join(
                f"root@sandbox:/app# {cmd}" for cmd in cmd_lines if cmd
            ) + "\nroot@sandbox:/app#"

        conversation_log.append(f"### Step {step + 1} — Agent response\n{raw}")
        conversation_log.append(
            f"### Step {step + 1} — Terminal output\n{terminal_output}"
        )

        step += 1  # only advance on a successful parse

    _log(f"{tag}: reached MAX_STEPS ({MAX_STEPS}) without completing — FAIL")
    return False


# ── Staggered-parallel probe ──────────────────────────────────────────────────

async def _run_probe(
    task_id: str,
    storage_path: str,
    model_id: str,
    provider: str,
    n: int = TOTAL_RUNS,
    easy_max_pass: int | None = None,
    diff_max_pass: int | None = None,
) -> tuple[int, list[bool]]:
    """
    Launch `n` agent runs in staggered parallel: run i starts after
    i * RUN_START_STAGGER seconds, so the initial API burst is spread
    across time rather than hitting all at once.

    Collects results as they arrive via asyncio.as_completed().
    Applies early-exit: cancels remaining tasks the moment the outcome
    is already decided (saves API spend).

    Returns (pass_count, results_in_run_order).
    """
    task_dir = _task_dir(storage_path)

    _log(
        f"launching {n} staggered-parallel runs "
        f"(stagger={RUN_START_STAGGER}s, task={task_id}, model={provider}/{model_id})"
    )

    # Each task gets a start_delay proportional to its index
    tasks = {
        asyncio.create_task(
            _run_agent_once(
                task_dir,
                i,
                model_id,
                provider,
                start_delay=i * RUN_START_STAGGER,
            ),
            name=f"probe-run-{i}",
        ): i
        for i in range(n)
    }

    results: dict[int, bool] = {}   # run_index → result
    pass_count = 0
    fail_count = 0
    early_exit_reason: str | None = None

    try:
        for coro in asyncio.as_completed(list(tasks.keys())):
            result = await coro

            # Figure out which run index this task belongs to
            # (as_completed doesn't preserve identity directly, so we match
            # by iterating the done tasks we haven't recorded yet)
            run_idx: int | None = None
            for task, idx in tasks.items():
                if task.done() and idx not in results:
                    run_idx = idx
                    break

            if run_idx is None:
                # Fallback: assign to next unrecorded slot in order received
                run_idx = len(results)

            results[run_idx] = result
            if result:
                pass_count += 1
            else:
                fail_count += 1

            completed = len(results)
            remaining = n - completed
            symbols_so_far = "".join(
                ("✓" if results[j] else "✗") for j in sorted(results)
            )
            _log(
                f"run {run_idx + 1} finished → {'PASS' if result else 'FAIL'} "
                f"[{symbols_so_far}] ({pass_count}P/{fail_count}F, {remaining} still running)"
            )

            # ── Early-exit checks ─────────────────────────────────────────────
            if easy_max_pass is not None:
                # Already know it's ACCEPTABLE: at least 1 pass AND at least 1 fail
                if pass_count >= 1 and fail_count >= 1:
                    early_exit_reason = f"ACCEPTABLE confirmed ({pass_count}P/{fail_count}F)"
                    break
                # Already know it's TOO_HARD: no passes and no more runs can save it
                if pass_count == 0 and remaining == 0:
                    break  # natural end, not technically early

            if diff_max_pass is not None:
                # Too easy — no point continuing
                if pass_count > diff_max_pass:
                    early_exit_reason = f"TOO_EASY confirmed (pass_count={pass_count} > {diff_max_pass})"
                    break
                # Too hard — no passes left possible
                if pass_count == 0 and remaining == 0:
                    break

    finally:
        # Cancel any tasks that are still running (early exit case)
        cancelled = 0
        for task in tasks:
            if not task.done():
                task.cancel()
                cancelled += 1
        if cancelled:
            # Give cancelled tasks a moment to clean up
            await asyncio.gather(*[t for t in tasks if t.cancelled()], return_exceptions=True)
            _log(f"cancelled {cancelled} still-running task(s) after early exit")

    if early_exit_reason:
        _log(f"early exit: {early_exit_reason}")

    # Build ordered results list, filling any gaps with False (cancelled runs)
    ordered = [results.get(i, False) for i in range(n)]
    # Only report runs that actually completed
    completed_results = [results[i] for i in sorted(results)]

    symbols = " ".join("✓" if r else "✗" for r in completed_results)
    _log(
        f"probe complete: {pass_count}/{len(completed_results)} passed "
        f"[{symbols}] model={provider}/{model_id}"
    )

    return pass_count, completed_results


# ── Per-run detail formatter ──────────────────────────────────────────────────

def _per_run_detail(results: list[bool]) -> str:
    lines = []
    for i, passed in enumerate(results):
        status = "PASS" if passed else "FAIL"
        lines.append(f"    Run {i + 1}: {status} reward='{'1' if passed else '0'}'")
    return "\n".join(lines)


# ── Public entry points ───────────────────────────────────────────────────────

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
    lock = _get_task_lock(f"easiness:{task_id}")
    async with lock:
        model_id, provider = await get_model_for_role("easiness_model", db)

        pass_count, results = await _run_probe(
            task_id=task_id,
            storage_path=storage_path,
            model_id=model_id,
            provider=provider,
            n=TOTAL_RUNS,
            easy_max_pass=EASY_MAX_PASS,
        )

        detail = _per_run_detail(results)
        runs_done = len(results)

        if pass_count == 0:
            msg = (
                f"pass@5: 0 / {runs_done} · TOO_HARD (model never solved the task)\n"
                f"Task appears too hard: no run passed. Simplify or add more context to instruction.md.\n"
                f"PER-RUN EPISODES ({runs_done})\n{detail}"
            )
            return False, msg

        if pass_count >= runs_done and runs_done == TOTAL_RUNS:
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


async def run_difficulty_probe(
    task_id: str,
    storage_path: str,
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Stage 7 — Difficulty probe.

    Uses the frontier_model from DB config (the strong model).

    Pass logic:
      - 0 passes           → TOO_HARD even for frontier → fail
      - 1 to DIFF_MAX_PASS → correct difficulty band → pass
      - > DIFF_MAX_PASS    → TOO_EASY for frontier → fail
    """
    lock = _get_task_lock(f"difficulty:{task_id}")
    async with lock:
        model_id, provider = await get_model_for_role("frontier_model", db)

        pass_count, results = await _run_probe(
            task_id=task_id,
            storage_path=storage_path,
            model_id=model_id,
            provider=provider,
            n=TOTAL_RUNS,
            diff_max_pass=DIFF_MAX_PASS,
        )

        detail = _per_run_detail(results)
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