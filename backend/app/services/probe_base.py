# app/services/probe_base.py
#
# Shared infrastructure for the easiness prefilter (Stage 6) and
# difficulty probe (Stage 7) pipeline stages.
#
# Houses the common probe logic — config constants, concurrency locks,
# JSON extraction, the legacy single-agent loop, staggered-parallel
# execution, early-exit, and the per-run detail formatter.
#
# Stage-specific services import from here rather than duplicating
# the 300+ lines of shared orchestration.

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from app.services.llm import chat_completion
from app.services.pipeline import _task_dir
from app.services.agent_prompt import (
    AGENT_SYSTEM_PROMPT,
    build_initial_user_prompt,
    build_continuation_user_prompt,
)
from app.services.crew_agent import run_crew_probe


# ── Config ─────────────────────────────────────────────────────────────────────

# Select agent engine: "crewai" (default) or "legacy"
AGENT_ENGINE = "crewai"

# Legacy single-agent loop limits
MAX_STEPS        = 12
AGENT_MAX_TOKENS = 2048

# Stagger between parallel run starts (seconds)
RUN_START_STAGGER  = 12.0

# Parse-retry resilience
STEP_PARSE_RETRIES = 2
STEP_RETRY_DELAY   = 5.0

TOTAL_RUNS = 5


# ── Per-task concurrency locks ─────────────────────────────────────────────────

_task_locks: dict[str, asyncio.Lock] = {}

def get_task_lock(key: str) -> asyncio.Lock:
    if key not in _task_locks:
        _task_locks[key] = asyncio.Lock()
    return _task_locks[key]


# ── Logging ────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[PROBE] {msg}", file=sys.stderr, flush=True)


# ── JSON extraction ────────────────────────────────────────────────────────────

def extract_json(text: str) -> dict | None:
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


# ── Legacy single-agent loop ───────────────────────────────────────────────────

async def run_agent_once(
    task_dir: Path,
    run_index: int,
    model_id: str,
    provider: str,
    start_delay: float = 0.0,
) -> bool:
    """
    Original flat-prompt single-agent loop.
    Used when AGENT_ENGINE == "legacy".
    """
    tag = f"run {run_index + 1}"

    if start_delay > 0:
        _log(f"{tag}: waiting {start_delay:.0f}s stagger before starting...")
        await asyncio.sleep(start_delay)

    initial_prompt = build_initial_user_prompt(task_dir)
    conversation_log: list[str] = []
    terminal_output = "root@sandbox:/app#"
    consecutive_parse_failures = 0

    step = 0
    while step < MAX_STEPS:
        # Build user message
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

        # ── LLM call ──────────────────────────────────────────────────────────
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

        _log(f"{tag}: step {step + 1} response ({len(raw) if raw else 0} chars)")

        # ── Empty response ────────────────────────────────────────────────────
        if not raw or not raw.strip():
            consecutive_parse_failures += 1
            if consecutive_parse_failures > STEP_PARSE_RETRIES:
                _log(f"{tag}: too many empty responses — marking FAIL")
                return False
            await asyncio.sleep(STEP_RETRY_DELAY)
            continue

        # ── JSON parse ────────────────────────────────────────────────────────
        parsed = extract_json(raw)
        if parsed is None:
            consecutive_parse_failures += 1
            if consecutive_parse_failures > STEP_PARSE_RETRIES:
                _log(f"{tag}: too many parse failures — marking FAIL")
                return False
            await asyncio.sleep(STEP_RETRY_DELAY)
            continue

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
        conversation_log.append(f"### Step {step + 1} — Terminal output\n{terminal_output}")

        step += 1

    _log(f"{tag}: reached MAX_STEPS ({MAX_STEPS}) without completing — FAIL")
    return False


# ── Staggered-parallel probe runner ────────────────────────────────────────────

async def run_probe(
    task_id: str,
    storage_path: str,
    model_id: str,
    provider: str,
    *,
    n: int = TOTAL_RUNS,
    easy_max_pass: int | None = None,
    diff_max_pass: int | None = None,
) -> tuple[int, list[bool]]:
    """
    Launch `n` agent runs in staggered parallel: run i starts after
    i * RUN_START_STAGGER seconds.

    Collects results via asyncio.as_completed().  Applies early-exit:
    cancels remaining tasks the moment the outcome is decided.

    Returns (pass_count, results_in_run_order).
    """
    task_dir = _task_dir(storage_path)

    _log(
        f"launching {n} staggered-parallel runs "
        f"(stagger={RUN_START_STAGGER}s, task={task_id}, model={provider}/{model_id}) "
        f"engine={AGENT_ENGINE}"
    )

    # ── Agent dispatch ────────────────────────────────────────────────────────
    if AGENT_ENGINE == "crewai":
        task_dir_str = str(task_dir)
        tasks = {
            asyncio.create_task(
                run_crew_probe(
                    task_dir=task_dir_str,
                    run_index=i,
                    model_id=model_id,
                    provider=provider,
                    start_delay=i * RUN_START_STAGGER,
                ),
                name=f"probe-run-{i}",
            ): i
            for i in range(n)
        }
    else:
        tasks = {
            asyncio.create_task(
                run_agent_once(
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

    results: dict[int, bool] = {}
    pass_count = 0
    fail_count = 0
    early_exit_reason: str | None = None

    try:
        for coro in asyncio.as_completed(list(tasks.keys())):
            result = await coro

            run_idx: int | None = None
            for task, idx in tasks.items():
                if task.done() and idx not in results:
                    run_idx = idx
                    break

            if run_idx is None:
                run_idx = len(results)

            results[run_idx] = result
            if result:
                pass_count += 1
            else:
                fail_count += 1

            completed = len(results)
            remaining = n - completed
            _log(
                f"run {run_idx + 1} finished → {'PASS' if result else 'FAIL'} "
                f"[{pass_count}P/{fail_count}F, {remaining} still running]"
            )

            # ── Early-exit checks ─────────────────────────────────────────────
            if easy_max_pass is not None:
                # ACCEPTABLE: at least 1 pass AND at least 1 fail
                if pass_count >= 1 and fail_count >= 1:
                    early_exit_reason = f"ACCEPTABLE ({pass_count}P/{fail_count}F)"
                    break
                # TOO_HARD: no passes, no runs left
                if pass_count == 0 and remaining == 0:
                    break

            if diff_max_pass is not None:
                # TOO_EASY: more passes than threshold
                if pass_count > diff_max_pass:
                    early_exit_reason = f"TOO_EASY (pass_count={pass_count} > {diff_max_pass})"
                    break
                # ACCEPTABLE: at least 1 pass AND at least 1 fail
                if pass_count >= 1 and fail_count >= 1:
                    early_exit_reason = f"ACCEPTABLE ({pass_count}P/{fail_count}F)"
                    break
                # TOO_HARD: no passes, no runs left
                if pass_count == 0 and remaining == 0:
                    break

    finally:
        cancelled = 0
        for task in tasks:
            if not task.done():
                task.cancel()
                cancelled += 1
        if cancelled:
            await asyncio.gather(
                *[t for t in tasks if t.cancelled()], return_exceptions=True
            )
            _log(f"cancelled {cancelled} still-running task(s) after early exit")

    if early_exit_reason:
        _log(f"early exit: {early_exit_reason}")

    completed_results = [results.get(i, False) for i in range(n)]
    _log(
        f"probe complete: {pass_count}/{n} passed "
        f"model={provider}/{model_id}"
    )

    return pass_count, completed_results


# ── Per-run detail formatter ───────────────────────────────────────────────────

def per_run_detail(results: list[bool]) -> str:
    lines = []
    for i, passed in enumerate(results):
        status = "PASS" if passed else "FAIL"
        lines.append(f"    Run {i + 1}: {status} reward='{'1' if passed else '0'}'")
    return "\n".join(lines)