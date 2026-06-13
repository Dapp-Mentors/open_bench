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
   instruction.md, task.toml, solution/solve.sh, tests/test.sh.
2. Read the test files to understand exactly what must pass before touching any code.
3. Read solve.sh carefully — it contains the reference fix; adapt it rather than
   reinventing from scratch.
4. Identify the language and toolchain from the project files, then apply the
   appropriate build and test commands for that stack.
5. Apply fixes incrementally. After each meaningful change, build and run the
   tests to confirm progress.
6. Always run the project's own test harness (tests/test.sh) to verify correctness
   before marking task_complete — do not rely on your own judgement alone.
7. If a command hangs, send an empty commands array with a longer duration to
   wait for it, rather than re-sending the command.
8. Set task_complete only after you have confirmed the test suite passes.

IMPORTANT: The text inside "keystrokes" is sent verbatim to the terminal.
Extra text before or after the JSON will generate warnings but be tolerated.
The JSON itself must be valid — use proper escaping for quotes and special characters.
The commands array may be empty if you want to wait without taking action.
"""


# ── User prompt ───────────────────────────────────────────────────────────────

def build_initial_user_prompt(task_dir: Path) -> str:
    """
    Build the first user message sent to the agent.

    Includes the standard zip task files that are always present:
      - instruction.md      (the task description the agent must solve)
      - task.toml           (metadata: language, timeout, scoring)
      - solution/solve.sh   (oracle solution — gives the agent the fix pattern)
      - tests/test.sh       (how the grader runs tests)
      - tests/test_outputs.py (what exact assertions the grader makes)

    Then appends any additional test files found under tests/ so the agent
    can see the full suite regardless of language or test framework.
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

    # ── Core task description ─────────────────────────────────────────────────
    sections.append(
        "## Task Description (instruction.md)\n" + _read("instruction.md")
    )

    # ── Metadata ──────────────────────────────────────────────────────────────
    sections.append(
        "## Task Metadata (task.toml)\n" + _read("task.toml")
    )

    # ── Oracle solution — gives agent the fix pattern ─────────────────────────
    sections.append(
        "## Oracle Solution (solution/solve.sh)\n"
        "This is the reference solution. Study it carefully — "
        "your fix should follow the same approach.\n\n"
        + _read("solution/solve.sh")
    )

    # ── Test harness ──────────────────────────────────────────────────────────
    sections.append(
        "## Test Runner (tests/test.sh)\n"
        "This is how the grader executes the tests. "
        "Run this script to verify your fix before marking task_complete.\n\n"
        + _read("tests/test.sh")
    )

    # ── Test assertions ───────────────────────────────────────────────────────
    sections.append(
        "## Test Assertions (tests/test_outputs.py)\n"
        "These are the exact assertions the grader checks. "
        "Make sure every one of them passes.\n\n"
        + _read("tests/test_outputs.py")
    )

    # ── Any additional test files under tests/ ────────────────────────────────
    # Walk the tests directory and include every file that is NOT already
    # covered above (test.sh, test_outputs.py) and NOT a cache/metadata file.
    # This handles arbitrary toolchains: Hardhat JS suites, Rust integration
    # tests, Go test files, etc. — whatever the task author placed there.
    tests_dir = task_dir / "tests"
    already_included = {"test.sh", "test_outputs.py"}
    skip_dirs = {"__pycache__", ".pytest_cache", "node_modules"}

    if tests_dir.is_dir():
        for path in sorted(tests_dir.rglob("*")):
            if not path.is_file():
                continue
            # Skip any path that passes through a noise directory
            if any(part in skip_dirs for part in path.parts):
                continue
            if path.name in already_included:
                continue
            rel = path.relative_to(task_dir)
            sections.append(
                f"## Additional test file ({rel})\n" + _read(str(rel), max_chars=4000)
            )

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