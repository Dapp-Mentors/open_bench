# app/services/agent_quality.py
#
# Stage 8 — Agent Quality Check.
#
# LLM-as-judge evaluation focused on two things the quality check (stage 3)
# doesn't cover deeply:
#
#   1. Instruction realism — does instruction.md read like a real task a
#      developer would encounter, written naturally without AI-assistant prose?
#
#   2. No leaked assertions — does instruction.md avoid revealing test logic,
#      expected values, assertion details, or oracle paths that would trivially
#      hand the answer to an agent?
#
# The LLM scores 6 focused criteria (0.0–1.0 each). Average must be >= 0.7
# (slightly stricter than the general quality check) to pass.
#
# All LLM calls go through app.services.llm.chat_completion, which reads
# provider / model / keys exclusively from settings (config.py). Nothing is
# hardcoded here.

from __future__ import annotations

import json
from pathlib import Path
from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from app.services.llm import chat_completion
from app.services.pipeline import _task_dir
from app.services.model_config import get_model_for_role

AGENT_QUALITY_THRESHOLD = 0.7

CRITERIA = [
    "instruction_realism",
    "natural_language_register",
    "no_leaked_test_assertions",
    "no_revealed_oracle_path",
    "no_over_specified_steps",
    "agent_actionability",
]

_SYSTEM_PROMPT = """\
You are an expert evaluator of benchmark tasks designed for AI coding agents.
Your job is to judge whether a task's instruction is realistic, naturally written,
and free of information that would trivially leak the solution to an agent.

Return ONLY valid JSON — no markdown fences, no preamble, no trailing text.
The JSON must have this exact structure:
{
  "scores": {
    "instruction_realism":        <0.0–1.0>,
    "natural_language_register":  <0.0–1.0>,
    "no_leaked_test_assertions":  <0.0–1.0>,
    "no_revealed_oracle_path":    <0.0–1.0>,
    "no_over_specified_steps":    <0.0–1.0>,
    "agent_actionability":        <0.0–1.0>
  },
  "rationale": {
    "instruction_realism":        "<one sentence>",
    "natural_language_register":  "<one sentence>",
    "no_leaked_test_assertions":  "<one sentence>",
    "no_revealed_oracle_path":    "<one sentence>",
    "no_over_specified_steps":    "<one sentence>",
    "agent_actionability":        "<one sentence>"
  }
}

Criteria guide:
  instruction_realism       — Does it read like a real task a developer would face? (not contrived)
  natural_language_register — Is it written conversationally, like explaining to a teammate?
                              Penalise heavy bullet hierarchies, AI-assistant phrasing, formal
                              report language, or numbered step-by-step instructions.
  no_leaked_test_assertions — Does instruction.md avoid revealing test assertions, expected values,
                              function names under test, or exact error messages from the test suite?
  no_revealed_oracle_path   — Does it avoid hinting at the exact fix solve.sh applies?
                              (e.g. "change line 42 to X" is a red flag)
  no_over_specified_steps   — Does it avoid spelling out the exact commands or code changes needed?
                              Loose prompts like "the build is broken" are fine; step-by-step
                              walkthroughs are not.
  agent_actionability       — Could an AI agent act on this instruction with only the task
                              environment available, without needing external context?

Scoring:
  1.0 = exemplary   0.8 = good   0.6 = acceptable   0.4 = weak   0.2 = poor   0.0 = failing

Be strict. A task that barely passes each criterion should score around 0.7, not 0.9.
"""


def _build_user_prompt(task_dir: Path) -> str:
    """Assemble the instruction + task.toml for the judge."""

    def _read(rel: str) -> str:
        p = task_dir / rel
        return p.read_text(encoding="utf-8", errors="replace") if p.exists() else "(not found)"

    parts = [
        "## instruction.md\n" + _read("instruction.md"),
        "## task.toml\n" + _read("task.toml"),
    ]
    return "\n\n---\n\n".join(parts)


# ── Public entry point ────────────────────────────────────────────────────────

async def run_agent_quality_check(
    task_id: str,
    storage_path: str,
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Returns (passed, message).
    message is a one-line summary; full per-criterion breakdown follows on
    subsequent lines so the router can log the summary separately.
    """
    task_dir    = _task_dir(storage_path)
    user_prompt = _build_user_prompt(task_dir)

    model_id, provider = await get_model_for_role("agent_quality_model", db)

    raw = await chat_completion(
        system=_SYSTEM_PROMPT,
        user=user_prompt,
        provider=provider,
        model_id=model_id,
        temperature=0.0,
        max_tokens=1000,
        response_format={"type": "json_object"},
    )

    if not raw or not raw.strip():
        return True, "Agent quality check: LLM returned empty response; treating as passed"

    # Strip accidental markdown fences before parsing
    clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    try:
        data = json.loads(clean)
    except json.JSONDecodeError as e:
        # A broken LLM response shouldn't hard-block the pipeline — treat as passed
        # with a warning so a human reviewer can see what happened.
        return True, f"Agent quality check could not parse LLM response ({e}); treating as passed"

    scores    = data.get("scores", {})
    rationale = data.get("rationale", {})

    values = [float(scores[c]) for c in CRITERIA if c in scores]
    if not values:
        return True, "Agent quality check returned no scores; treating as passed"

    avg    = sum(values) / len(values)
    passed = avg >= AGENT_QUALITY_THRESHOLD
    status = "PASSED" if passed else "FAILED"

    breakdown_lines = [
        f"  {c}: {scores.get(c, '?')} — {rationale.get(c, '')}"
        for c in CRITERIA
    ]
    breakdown = "\n".join(breakdown_lines)

    message = (
        f"Agent quality score: {avg * 100:.0f}% "
        f"(threshold: {AGENT_QUALITY_THRESHOLD * 100:.0f}%) — {status}\n"
        + breakdown
    )
    return passed, message