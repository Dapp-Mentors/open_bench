# app/services/easiness.py
#
# Stage 6 — Easiness Prefilter  (5 sequential runs, pass threshold: 1–4 / 5)
# Stage 7 — Difficulty Probe    (5 sequential runs, pass threshold: 1–3 / 5)
#
# Each run launches an LLM agent that tries to solve the task from scratch
# inside a sandboxed environment.  The agent follows the structured JSON
# protocol defined in agent_prompt.py.

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

MAX_STEPS        = 12    # max agent turns per run before giving up
TOTAL_RUNS       = 5     # total independent attempts to execute
AGENT_MAX_TOKENS = 2048

# Seconds to wait between consecutive runs.
# Free-tier safe: 20 s.  Paid tier / no rate limit: set to 3–5 s.
INTER_RUN_DELAY  = 20.0

# Easiness prefilter: ACCEPTABLE if pass_count is in [1, EASY_MAX_PASS]
EASY_MAX_PASS = 4   # 5/5 passes → TOO_EASY

# Difficulty probe: ACCEPTABLE if pass_count is in [1, DIFF_MAX_PASS]
DIFF_MAX_PASS = 3


# ── Logging helpers ───────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[PROBE] {msg}", file=sys.stderr, flush=True)


# ── JSON extraction ───────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    """
    Pull the first valid JSON object out of a potentially noisy LLM response.
    Returns None if no valid JSON is found.
    """
    # Fast path: entire response is JSON
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


# ── Single-agent loop ─────────────────────────────────────────────────────────

async def _run_agent_once(
    task_dir: Path,
    run_index: int,
    model_id: str,
    provider: str,
) -> bool:
    """
    Execute one full agentic attempt (up to MAX_STEPS turns).

    Returns True  if the agent sets task_complete=True within MAX_STEPS.
    Returns False if it runs out of steps, returns bad JSON, or hits an
    LLM error that exhausts all retries in llm.py.

    The conversation is self-contained: full history is re-injected on every
    turn because chat_completion() is a single-turn helper.
    """
    initial_prompt = build_initial_user_prompt(task_dir)

    conversation_log: list[str] = []
    terminal_output = "root@sandbox:/app#"

    for step in range(MAX_STEPS):
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
            # llm.py has already exhausted its internal retries; give up on
            # this run.  The inter-run delay in _run_probe gives the API time
            # to recover before the next attempt.
            _log(f"run {run_index + 1}: LLM error at step {step}: {exc}")
            return False

        char_count = len(raw) if raw else 0
        _log(f"run {run_index + 1}: step {step + 1} response ({char_count} chars)")

        if not raw or not raw.strip():
            _log(f"run {run_index + 1}: empty LLM response — marking FAIL")
            return False

        parsed = _extract_json(raw)
        if parsed is None:
            _log(f"run {run_index + 1}: could not parse JSON — marking FAIL")
            return False

        if parsed.get("task_complete") is True:
            _log(f"run {run_index + 1}: task_complete=True — PASS")
            return True

        # Simulate terminal echo for the next turn
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

    _log(f"run {run_index + 1}: reached MAX_STEPS ({MAX_STEPS}) without completing — FAIL")
    return False


# ── Sequential probe ──────────────────────────────────────────────────────────

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
    Run `n` agent attempts one after another.

    Between every pair of consecutive runs we wait INTER_RUN_DELAY seconds so
    we don't saturate the OpenRouter rate limit.  The delay is skipped after
    the final run.

    Early-exit:
      If easy_max_pass is provided (easiness mode):
        - Stop as soon as a run fails when we already have at least 1 pass
          (outcome is ACCEPTABLE — no need to keep going).
        - Continue through all runs only when every run so far has passed
          (need to confirm whether it's TOO_EASY).

      If diff_max_pass is provided (difficulty mode):
        - Stop as soon as pass_count > diff_max_pass (already TOO_EASY).
        - Stop as soon as it's impossible for remaining runs to reach 1 pass
          (0 passes and 0 runs left — handled naturally).

    Returns (pass_count, per_run_results).
    """
    task_dir = _task_dir(storage_path)

    _log(
        f"starting sequential probe: {n} runs, delay={INTER_RUN_DELAY}s between runs "
        f"(task={task_id}, model={provider}/{model_id})"
    )

    results: list[bool] = []
    pass_count = 0

    for i in range(n):
        _log(f"--- run {i + 1} / {n} ---")
        result = await _run_agent_once(task_dir, i, model_id, provider)
        results.append(result)
        if result:
            pass_count += 1

        remaining = n - (i + 1)
        symbols_so_far = " ".join("✓" if r else "✗" for r in results)
        _log(f"after run {i + 1}: {pass_count} passes [{symbols_so_far}] ({remaining} remaining)")

        # ── Early-exit checks ─────────────────────────────────────────────────

        if easy_max_pass is not None:
            # Easiness mode: stop once we know we're in the ACCEPTABLE band.
            # ACCEPTABLE = at least 1 pass AND at least 1 fail.
            # If the current run failed and we already have a pass → done.
            if not result and pass_count >= 1:
                _log(f"early exit: ACCEPTABLE confirmed (mix of pass+fail after run {i + 1})")
                break
            # If every run so far passed and there are no runs left → TOO_EASY
            # (the loop will end naturally, no early exit needed here).

        if diff_max_pass is not None:
            # Difficulty mode: stop the moment pass_count exceeds the ceiling.
            if pass_count > diff_max_pass:
                _log(f"early exit: TOO_EASY confirmed (pass_count={pass_count} > {diff_max_pass})")
                break

        # ── Inter-run delay ───────────────────────────────────────────────────
        # Skip delay after the last run (or after an early exit, which breaks
        # the loop above before reaching this point).
        if remaining > 0:
            _log(f"waiting {INTER_RUN_DELAY}s before next run...")
            await asyncio.sleep(INTER_RUN_DELAY)

    symbols = " ".join("✓" if r else "✗" for r in results)
    _log(f"probe complete: {pass_count}/{len(results)} passed [{symbols}] model={provider}/{model_id}")

    return pass_count, results


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

    Pass logic (out of however many runs were actually executed):
      - 0 passes          → TOO_HARD  → pipeline fails
      - 1 to EASY_MAX_PASS → ACCEPTABLE → pipeline passes
      - all runs pass     → TOO_EASY  → pipeline fails
    """
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
        # All 5 completed runs passed
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
      - 0 passes             → TOO_HARD even for frontier → fail
      - 1 to DIFF_MAX_PASS   → correct difficulty band → pass
      - > DIFF_MAX_PASS      → TOO_EASY for frontier → fail
    """
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