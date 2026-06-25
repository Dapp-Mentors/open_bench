# app/services/agent_prompt.py
#
# Builds the system + user prompts that are sent to the LLM agent during
# easiness / difficulty probe runs.
#
# Extracted from easiness.py so the prompt can be iterated and unit-tested
# independently of the orchestration logic.
#
# Design notes
# ────────────
# The key insight from high-performing agent runs is that the LLM needs:
#   1. A strict, unambiguous JSON schema with field-level documentation.
#   2. Concrete duration guidance so the agent doesn't stall waiting for
#      slow commands (builds, test suites, package installs…).
#   3. Generic workflow rules that apply regardless of language or toolchain.
#   4. A reminder that task_complete must only be set after the tests pass.
#
# Nothing in this file is specific to any language, framework, or test runner.
# The agent must infer the right toolchain from the task files it reads.

from __future__ import annotations

from pathlib import Path

# ── System prompt ─────────────────────────────────────────────────────────────

AGENT_SYSTEM_PROMPT = """\
You are an AI assistant tasked with solving command-line tasks in a Linux environment.
You will be given a task description and the output from previously executed commands.
Your goal is to solve the task by providing batches of shell commands.

Format your response as JSON with the following structure:

{
  "analysis": "Analyse the current state based on the terminal output provided. What do you see? What has been accomplished? What still needs to be done?",
  "plan": "Describe your plan for the next steps. What commands will you run and why? Be specific about what you expect each command to accomplish.",
  "commands": [
    {
      "keystrokes": "ls -la\\n",
      "duration": 0.1
    },
    {
      "keystrokes": "cd project\\n",
      "duration": 0.1
    }
  ],
  "task_complete": true
}

Required fields:
- "analysis": Your analysis of the current situation
- "plan":     Your plan for the next steps
- "commands": Array of command objects to execute

Optional fields:
- "task_complete": Boolean — set to true ONLY when all tests pass and the task is fully solved.
  Defaults to false if omitted. Do NOT set this true speculatively; the grader will reject it.

Command object structure:
- "keystrokes": String containing the exact keystrokes to send to the terminal (required).
                End every command with \\n or it will not execute.
- "duration":   Seconds to wait after sending keystrokes (defaults to 1.0).

DURATION GUIDE — set these carefully; wrong durations cause stalls or missed output:
  Instant  (0.1 s): cd, ls, echo, cat, cp, mv, mkdir, export, which, pwd, touch
  Fast     (1–2 s): grep, find, simple one-liners, single-file compiles
  Medium   (5–15 s): dependency installs (cached), incremental builds,
                     small test suites, linters, formatters
  Slow    (30–90 s): cold dependency installs, full project builds,
                     large test suites, docker builds
  Very slow (120 s+): large image pulls, full clean rebuilds from scratch

Special key sequences (tmux-style):
  C-c  →  Ctrl+C   (interrupt a running process)
  C-d  →  Ctrl+D   (EOF / exit a REPL)

WORKFLOW RULES:
1. Start by exploring the repository structure and reading the key files:
   instruction.md and task.toml.
2. Understand the task requirements from instruction.md before touching any code.
3. Identify the language and toolchain from the project files, then apply the
   appropriate build and test commands for that stack.
4. Apply fixes incrementally. After each meaningful change, build the project to
   confirm your changes compile or parse correctly.
5. Set task_complete only after you have applied your fix and confirmed the build
   succeeds. Do not rely on your own judgement about correctness — the grader
   will run the real test suite externally.
6. If a command hangs, send an empty commands array with a longer duration to
   wait for it, rather than re-sending the command.

IMPORTANT: The text inside "keystrokes" is sent verbatim to the terminal.
Extra text before or after the JSON will generate warnings but be tolerated.
The JSON itself must be valid — use proper escaping for quotes and special characters.
The commands array may be empty if you want to wait without taking action.
"""


# ── User prompt ───────────────────────────────────────────────────────────────


def build_initial_user_prompt(task_dir: Path) -> str:
    """
    Build the first user message sent to the agent.

    Includes ONLY the files the agent is permitted to see:
      - instruction.md  (the task description the agent must solve)
      - task.toml       (metadata: language, timeout, scoring)

    Intentionally excluded (ground truth — must not leak to the agent):
      - solution/solve.sh      (oracle solution)
      - tests/test.sh          (test harness)
      - tests/test_outputs.py  (exact grader assertions)
      - tests/**/*             (all other test files)

    The agent must solve the task blind, using only instruction.md.
    Correctness is verified externally by running the agent's fix
    through Docker and checking reward.txt.
    """

    def _read(rel: str, max_chars: int = 8000) -> str:
        p = task_dir / rel
        if not p.exists():
            return "(not found)"
        text = p.read_text(encoding="utf-8", errors="replace")
        if len(text) > max_chars:
            text = text[:max_chars] + f"\n... [truncated at {max_chars} chars]"
        return text

    sections: list[str] = []

    # ── Core task description (permitted) ─────────────────────────────────────
    sections.append("## Task Description (instruction.md)\n" + _read("instruction.md"))

    # ── Metadata (permitted) ──────────────────────────────────────────────────
    sections.append("## Task Metadata (task.toml)\n" + _read("task.toml"))

    # NOTE: solution/solve.sh, tests/test.sh, tests/test_outputs.py, and all
    # other files under tests/ are intentionally NOT included here.
    # The agent must derive the fix solely from instruction.md.

    body = "\n\n---\n\n".join(sections)

    return (
        "Solve the task described below. "
        "The environment is already set up — do not reinstall dependencies unless a command fails.\n\n"
        + body
        + "\n\n---\n\n"
        "Current terminal state:\n"
        "Current Terminal Screen:\nroot@sandbox:/app#\n"
    )


def build_continuation_user_prompt(terminal_output: str) -> str:
    """
    Build the user message for subsequent turns — just the new terminal output.
    """
    return (
        "New Terminal Output:\n\n"
        + terminal_output.strip()
        + "\n\nContinue solving the task."
    )
