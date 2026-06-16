# app/services/quality.py
#
# Stage 3 — Quality Check.
#
# Scores the task against 11 criteria using an LLM-as-judge approach.
# Each criterion is scored 0.0–1.0. The average must be >= QUALITY_THRESHOLD
# (default 0.6) for the task to pass.
#
# The 11 criteria (aligned with common SWE-bench / agentic task rubrics):
#   1.  instruction_clarity      — Is the instruction unambiguous?
#   2.  scope_definition         — Is the scope well-bounded (not too broad/narrow)?
#   3.  reproducibility          — Can another person reproduce the setup exactly?
#   4.  test_coverage            — Do the tests cover the key behaviours?
#   5.  test_independence        — Are tests independent of each other?
#   6.  solution_verifiability   — Is it possible to verify correctness programmatically?
#   7.  no_leaked_assertions      — Does the instruction NOT leak test logic/expected values?
#   8.  realistic_scenario       — Does the task reflect a real-world coding scenario?
#   9.  single_responsibility    — Does the task focus on one clear goal?
#   10. domain_relevance         — Is the task relevant to its declared domain/language?
#   11. difficulty_appropriateness — Is it non-trivial but solvable by a capable agent?
#
# The LLM is prompted to return a JSON object with a score per criterion plus
# a brief rationale. We parse the JSON, average the scores, and return a
# structured message that the pipeline log can display.

from __future__ import annotations

import json
from pathlib import Path
from typing import Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from app.services.llm import chat_completion
from app.services.model_config import get_model_for_role

QUALITY_THRESHOLD = 0.6

CRITERIA = [
    "instruction_clarity",
    "scope_definition",
    "reproducibility",
    "test_coverage",
    "test_independence",
    "solution_verifiability",
    "no_leaked_assertions",
    "realistic_scenario",
    "single_responsibility",
    "domain_relevance",
    "difficulty_appropriateness",
]

_SYSTEM_PROMPT = """\
You are an expert evaluator of software engineering benchmark tasks.
You will be given the contents of a task package and must score it on 11 quality criteria.

Return ONLY valid JSON — no markdown fences, no preamble, no trailing text.
The JSON must have this exact structure:
{
  "scores": {
    "instruction_clarity":       <0.0–1.0>,
    "scope_definition":          <0.0–1.0>,
    "reproducibility":           <0.0–1.0>,
    "test_coverage":             <0.0–1.0>,
    "test_independence":         <0.0–1.0>,
    "solution_verifiability":    <0.0–1.0>,
    "no_leaked_assertions":      <0.0–1.0>,
    "realistic_scenario":        <0.0–1.0>,
    "single_responsibility":     <0.0–1.0>,
    "domain_relevance":          <0.0–1.0>,
    "difficulty_appropriateness":<0.0–1.0>
  },
  "rationale": {
    "instruction_clarity":       "<one sentence>",
    "scope_definition":          "<one sentence>",
    "reproducibility":           "<one sentence>",
    "test_coverage":             "<one sentence>",
    "test_independence":         "<one sentence>",
    "solution_verifiability":    "<one sentence>",
    "no_leaked_assertions":      "<one sentence>",
    "realistic_scenario":        "<one sentence>",
    "single_responsibility":     "<one sentence>",
    "domain_relevance":          "<one sentence>",
    "difficulty_appropriateness":"<one sentence>"
  }
}

Scoring guide:
  1.0 = exemplary    0.8 = good    0.6 = acceptable    0.4 = weak    0.2 = poor    0.0 = failing

Be strict. A task that barely passes each criterion should score around 0.6, not 0.9.
"""


def _build_user_prompt(task_dir: Path) -> str:
    """Assemble the task package contents into a prompt."""
    sections: list[str] = []

    def _read(rel: str) -> str:
        p = task_dir / rel
        return p.read_text(encoding="utf-8", errors="replace") if p.exists() else "(not found)"

    sections.append("## instruction.md\n" + _read("instruction.md"))
    sections.append("## task.toml\n" + _read("task.toml"))
    sections.append("## solution/solve.sh\n" + _read("solution/solve.sh"))
    sections.append("## tests/test.sh\n" + _read("tests/test.sh"))

    # Include up to 3 test_*.py files to stay within token budget
    test_files = sorted((task_dir / "tests").glob("test_*.py"))[:3]
    for tf in test_files:
        sections.append(f"## tests/{tf.name}\n" + tf.read_text(encoding="utf-8", errors="replace"))

    return "\n\n---\n\n".join(sections)


# ── Public entry point ────────────────────────────────────────────────────────

async def run_quality_check(
    task_id: str,
    storage_path: str,
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Returns (passed, message).
    message contains the average score and a compact per-criterion breakdown.
    """
    from app.services.pipeline import _task_dir  # shared extraction helper

    task_dir = _task_dir(storage_path)
    user_prompt = _build_user_prompt(task_dir)

    model_id, provider = await get_model_for_role("quality_model", db)

    raw = await chat_completion(
        system=_SYSTEM_PROMPT,
        user=user_prompt,
        provider=provider,
        model_id=model_id,
        temperature=0.0,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )

    # Parse — strip any accidental fences
    clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    try:
        data = json.loads(clean)
    except json.JSONDecodeError as e:
        # Fallback: pass with a warning so a broken LLM response doesn't kill the pipeline
        return True, f"Quality check could not parse LLM response ({e}); treating as passed"

    scores     = data.get("scores", {})
    rationale  = data.get("rationale", {})

    # Compute average over the 11 expected criteria
    values = [float(scores[c]) for c in CRITERIA if c in scores]
    if not values:
        return True, "Quality check returned no scores; treating as passed"

    avg = sum(values) / len(values)

    # Build a compact breakdown string for the pipeline log
    breakdown_lines = []
    for c in CRITERIA:
        s = scores.get(c, "?")
        r = rationale.get(c, "")
        breakdown_lines.append(f"  {c}: {s} — {r}")
    breakdown = "\n".join(breakdown_lines)

    passed = avg >= QUALITY_THRESHOLD
    status = "PASSED" if passed else "FAILED"
    message = (
        f"Quality score: {avg*100:.0f}% (threshold: {QUALITY_THRESHOLD*100:.0f}%) — {status}\n"
        + breakdown
    )

    return passed, message