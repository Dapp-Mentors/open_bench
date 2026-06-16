# app/services/easiness.py
#
# Stage 6 — Easiness Prefilter  (5 parallel runs, pass threshold: 1–4 / 5)
# Stage 7 — Difficulty Probe    (5 parallel runs, pass threshold: 1–3 / 5)
#
# Each run launches an LLM agent that tries to solve the task from scratch
# inside a sandboxed environment.  The agent follows the structured JSON
# protocol defined in agent_prompt.py.
#
# Pass / fail logic
# ─────────────────
# Easiness prefilter:  task is TOO EASY  if sonnet passes >= 5/5
#                      task is ACCEPTABLE if 1–4 runs pass
#                      task is TOO HARD   if 0/5 pass (or probe skipped)
#
# Difficulty probe:    passes if 1–3 of 5 frontier-model runs succeed
#
# Orchestration
# ─────────────
# 1. _run_agent_once()    — single agentic loop (up to MAX_STEPS steps)
# 2. _run_probe()         — run N attempts in parallel, return pass count
# 3. run_easiness_prefilter / run_difficulty_probe — public entry points

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

MAX_STEPS       = 12   # max agent turns per run before giving up
PARALLEL_RUNS   = 5    # how many independent attempts to launch
AGENT_MAX_TOKENS = 2048
SEQUENTIAL_DELAY = 15.0 # seconds between sequential fallback attempts (free-tier rate limits are ~1 req / 10-20s)

# Easiness: task passes the prefilter if pass count is in [1, EASY_MAX_PASS]
EASY_MAX_PASS = 4      # if ALL 5 pass → too easy; reject

# Difficulty: task passes the difficulty probe if pass count is in [1, DIFF_MAX_PASS]
DIFF_MAX_PASS = 3


# ── Logging helpers ───────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[PROBE] {msg}", file=sys.stderr, flush=True)


# ── Single-agent loop ─────────────────────────────────────────────────────────

def _is_transient_error(exc: Exception) -> bool:
    """Return True if the exception represents a transient / retryable error."""
    import httpx

    # httpx.HTTPStatusError raised by chat_completion after retries are exhausted
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code if exc.response is not None else None
        return code == 429 or (code is not None and code >= 500)
    # Network-level failures
    if isinstance(exc, (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout)):
        return True
    return False


async def _run_agent_once(
    task_dir: Path,
    run_index: int,
    model_id: str,
    provider: str,
) -> bool:
    """
    Run one agentic attempt.  Returns True if the agent marks task_complete=True
    within MAX_STEPS steps, False otherwise.

    The agent receives the structured system prompt from agent_prompt.py.
    Because chat_completion() is a single-turn helper (system + user), we
    accumulate the full conversation history and pass it as a single user
    message on each subsequent turn — this is the same pattern the real
    benchmark runner uses when replaying terminal output.

    We simulate a minimal terminal so the agent can track its own progress:
    each turn echoes the keystrokes the agent requested back as prompt lines.
    """
    global _all_runs_hit_transient_error  # noqa: PLW0603

    initial_prompt = build_initial_user_prompt(task_dir)

    # conversation_log holds the raw back-and-forth for context injection
    conversation_log: list[str] = []
    terminal_output = "root@sandbox:/app#"

    for step in range(MAX_STEPS):
        if step == 0:
            user_message = initial_prompt
        else:
            # Inject full history so the agent remembers what it has already done
            history = "\n\n".join(conversation_log)
            user_message = (
                initial_prompt
                + "\n\n---\n\n## Conversation so far\n\n"
                + history
                + "\n\n---\n\n"
                + build_continuation_user_prompt(terminal_output)
            )

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
            _log(f"easiness run {run_index + 1}: LLM error at step {step}: {exc}")
            if _is_transient_error(exc):
                _all_runs_hit_transient_error = True
            return False

        char_count = len(raw) if raw else 0
        _log(f"easiness run {run_index + 1}: LLM response ({char_count} chars)")

        if not raw or not raw.strip():
            # Empty response — model refused or hit a safety filter; count as failure
            _log(f"easiness run {run_index + 1}: agent script exit_code=0")
            return False

        # Extract JSON — agent may wrap it in prose/markdown
        parsed = _extract_json(raw)
        if parsed is None:
            _log(f"easiness run {run_index + 1}: agent script exit_code=2")
            return False

        if parsed.get("task_complete") is True:
            _log(f"easiness run {run_index + 1}: agent script exit_code=0")
            return True

        # Simulate terminal echo for next turn
        commands = parsed.get("commands", [])
        if not commands:
            terminal_output = "root@sandbox:/app#"
        else:
            cmd_lines = [c.get("keystrokes", "").rstrip("\n") for c in commands[:4]]
            terminal_output = "\n".join(
                f"root@sandbox:/app# {cmd}" for cmd in cmd_lines if cmd
            ) + "\nroot@sandbox:/app#"

        # Append to conversation log for history injection
        conversation_log.append(f"### Step {step + 1} — Agent response\n{raw}")
        conversation_log.append(
            f"### Step {step + 1} — Terminal output\n{terminal_output}"
        )

    _log(f"easiness run {run_index + 1}: agent script exit_code=0")
    return False


def _extract_json(text: str) -> dict | None:
    """
    Pull the first valid JSON object out of a potentially noisy LLM response.
    Returns None if no valid JSON is found.
    """
    # Fast path: entire text is JSON
    try:
        return json.loads(text.strip())
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


# ── Parallel probe ────────────────────────────────────────────────────────────

async def _run_probe(
    task_id: str,
    storage_path: str,
    model_id: str,
    provider: str,
    n: int = PARALLEL_RUNS,
) -> tuple[int, list[bool]]:
    """
    Launch `n` agent attempts.

    Strategy:
      1. Try all `n` attempts in parallel.
      2. If every single attempt raised an exception (e.g. rate-limit 429 on
         all of them), fall back to running them sequentially with a short
         delay between each to avoid triggering rate-limits again.
      3. If only some attempts failed (or all failed with non-exception
         returns like empty LLM output), we keep the parallel results as-is
         — those reflect real task difficulty, not infra issues.

    Returns (pass_count, per_run_results).
    """
    global _all_runs_hit_transient_error  # noqa: PLW0603

    _all_runs_hit_transient_error = False

    _log(f"easiness: launching {n} parallel agent attempts "
         f"(task={task_id}, model={provider}/{model_id}, working_dir=/app)")

    task_dir = _task_dir(storage_path)

    # ── Phase 1: parallel ─────────────────────────────────────────────────
    results: list[bool] = await asyncio.gather(
        *[
            _run_agent_once(task_dir, i, model_id, provider)
            for i in range(n)
        ],
        return_exceptions=False,
    )

    pass_count = sum(results)
    all_failed = pass_count == 0

    # ── Phase 2: sequential fallback ──────────────────────────────────────
    # If every run returned False and every underlying LLM call hit a
    # transient error (like 429), retry sequentially with delays.
    if all_failed and _all_runs_hit_transient_error:
        _log(
            f"easiness: all {n} parallel runs failed with transient errors "
            f"— falling back to sequential execution"
        )
        seq_results: list[bool] = []
        for i in range(n):
            result = await _run_agent_once(task_dir, i, model_id, provider)
            seq_results.append(result)
            if i < n - 1:
                await asyncio.sleep(SEQUENTIAL_DELAY)

        pass_count = sum(seq_results)
        results = seq_results

    symbols = " ".join("✓" if r else "✗" for r in results)
    _log(f"easiness: {pass_count}/{n} passed [{symbols}] model={provider}/{model_id}")

    return pass_count, list(results)


# ── Transient-error tracking ───────────────────────────────────────────────────
# _all_runs_hit_transient_error is set to True by _run_agent_once when the
# exception it caught was a retryable / transient error (429, 5xx, network).
# It is reset at the start of each _run_probe call.

_all_runs_hit_transient_error: bool = False


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

    Uses the easiness_model from DB config (the fast model).

    Pass logic:
      - 0 / 5 pass   → TOO_HARD  → pipeline fails (task needs simplification)
      - 1–4 / 5 pass → ACCEPTABLE → pipeline passes
      - 5 / 5 pass   → TOO_EASY  → pipeline fails (task needs hardening)
    """
    model_id, provider = await get_model_for_role("easiness_model", db)

    pass_count, results = await _run_probe(
        task_id=task_id,
        storage_path=storage_path,
        model_id=model_id,
        provider=provider,
    )

    detail = _per_run_detail(results)

    if pass_count == 0:
        msg = (
            f"pass@5: 0 / {PARALLEL_RUNS} · TOO_HARD (model never solved the task)\n"
            f"Task appears too hard: no run passed. Simplify or add more context to instruction.md.\n"
            f"PER-RUN EPISODES ({PARALLEL_RUNS})\n{detail}"
        )
        return False, msg

    if pass_count >= PARALLEL_RUNS:
        frontier_id, _ = await get_model_for_role("frontier_model", db)
        msg = (
            f"pass@5: {pass_count} / {PARALLEL_RUNS} · TOO_EASY "
            f"({pass_count}/{PARALLEL_RUNS} — frontier skipped)\n"
            f"Task is too easy: {model_id} passed {pass_count}/{PARALLEL_RUNS} runs. "
            f"Frontier model {frontier_id} difficulty probe skipped to save cost.\n"
            f"PER-RUN EPISODES ({PARALLEL_RUNS})\n{detail}"
        )
        return False, msg

    msg = (
        f"pass@5: {pass_count} / {PARALLEL_RUNS} · ACCEPTABLE\n"
        f"Task difficulty looks good: {pass_count} of {PARALLEL_RUNS} runs solved by "
        f"{model_id}.\n"
        f"PER-RUN EPISODES ({PARALLEL_RUNS})\n{detail}"
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
      - 0 / 5 pass        → too hard even for frontier → fail
      - 1–DIFF_MAX_PASS   → correct difficulty band → pass
      - > DIFF_MAX_PASS   → too easy for frontier → fail
    """
    model_id, provider = await get_model_for_role("frontier_model", db)

    pass_count, results = await _run_probe(
        task_id=task_id,
        storage_path=storage_path,
        model_id=model_id,
        provider=provider,
    )

    detail = _per_run_detail(results)

    if pass_count == 0:
        msg = (
            f"Difficulty probe: 0 / {PARALLEL_RUNS} — TOO_HARD even for {model_id}.\n"
            f"PER-RUN EPISODES ({PARALLEL_RUNS})\n{detail}"
        )
        return False, msg

    if pass_count > DIFF_MAX_PASS:
        msg = (
            f"Difficulty probe: {pass_count} / {PARALLEL_RUNS} — TOO_EASY for {model_id}.\n"
            f"PER-RUN EPISODES ({PARALLEL_RUNS})\n{detail}"
        )
        return False, msg

    msg = (
        f"Difficulty probe: {pass_count} / {PARALLEL_RUNS} — ACCEPTABLE difficulty for {model_id}.\n"
        f"PER-RUN EPISODES ({PARALLEL_RUNS})\n{detail}"
    )
    return True, msg