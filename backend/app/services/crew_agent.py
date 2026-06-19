# app/services/crew_agent.py
#
# CrewAI-powered agents for the easiness prefilter and difficulty probe pipeline.
#
# Instead of a single monolithic LLM loop (the old _run_agent_once approach),
# we now use a CrewAI crew of specialised agents that collaborate to solve
# the task. Each agent has a defined role, goal, and backstory, mirroring
# the natural workflow of a human engineer:
#
#   1. Task Analyst       — reads instruction.md, task.toml, understands the brief
#   2. Solution Architect — studies solve.sh, plans the implementation strategy
#   3. Code Implementer   — executes commands to fix the code
#   4. Test Verifier      — runs tests and confirms completeness
#
# CrewAI process: sequential (each agent hands context to the next)
#
# ── crewai==1.14.7 LLM fix ────────────────────────────────────────────────────
#
# The old `CrewLLM` custom wrapper class is NOT compatible with crewai 1.x.
# Agent.llm is validated by Pydantic and must be either:
#   • a plain str (model name)          e.g. "openrouter/openai/gpt-4o"
#   • a crewai.LLM instance             (which delegates to LiteLLM)
#
# We now use crewai.LLM directly.  The model string it expects follows
# LiteLLM's convention:
#
#   "<provider>/<model_id>"
#
# where <provider> maps to a LiteLLM provider prefix.  For OpenRouter:
#
#   provider  (from DB) = "openrouter"
#   model_id  (from DB) = "openai/gpt-oss-120b:free"
#   → litellm model str = "openrouter/openai/gpt-oss-120b:free"
#
# This is exactly what probe_base.py already logs, so the DB values are
# used as-is — nothing is hard-coded here.
#
# Additional fixes in this revision
# ──────────────────────────────────
# • ReadTaskFilesTool._run now accepts **kwargs  (crewai-tools 1.14.7 requirement)
# • crew.kickoff() is run in a thread executor   (it is blocking/sync; calling it
#   directly inside an async function stalls the event loop and deadlocks the
#   5 staggered-parallel probe tasks in probe_base.py)
# • crew_completed_successfully handles CrewOutput objects (crewai 1.x return type)
# • Verifier task prompt explicitly requests a closing JSON block so the parser
#   has a reliable signal to detect success

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from crewai import Agent, Task, Crew, Process, LLM
from crewai.tools import BaseTool
from pydantic import Field

from app.services.agent_prompt import (
    AGENT_SYSTEM_PROMPT,
    build_initial_user_prompt,
)


# ── Configuration ──────────────────────────────────────────────────────────────

CREW_MAX_TOKENS  = 2048
CREW_TEMPERATURE = 0.3
CREW_MAX_ITER    = 15      # max total agent turns across all crew tasks


# ── Logging ────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[CREW-AGENT] {msg}", file=sys.stderr, flush=True)


# ── LLM factory ───────────────────────────────────────────────────────────────
#
# Converts the (model_id, provider) pair stored in the DB into a crewai.LLM
# instance that crewai 1.14.7 accepts.
#
# The DB stores them separately:
#   provider = "openrouter"
#   model_id = "openai/gpt-oss-120b:free"
#
# LiteLLM (which crewai.LLM wraps) wants a single prefixed string:
#   "openrouter/openai/gpt-oss-120b:free"
#
# For any other provider value we pass model_id through unchanged; LiteLLM
# resolves it natively (e.g. "anthropic/claude-3-5-sonnet-20241022").

def build_crewai_llm(model_id: str, provider: str) -> LLM:
    """
    Build a crewai.LLM from the (model_id, provider) pair fetched from the DB.

    No model strings are hard-coded here — we just assemble the LiteLLM
    prefix that crewai.LLM needs from whatever the DB gives us.
    """
    if provider == "openrouter":
        # Guard against model_id that already carries the prefix
        # (shouldn't happen if the DB is clean, but defensive is better)
        if model_id.startswith("openrouter/"):
            litellm_model = model_id
        else:
            litellm_model = f"openrouter/{model_id}"
    else:
        # Pass through for native LiteLLM providers (anthropic/, openai/, etc.)
        litellm_model = model_id

    return LLM(
        model=litellm_model,
        temperature=CREW_TEMPERATURE,
        max_tokens=CREW_MAX_TOKENS,
    )


# ── Custom tools ───────────────────────────────────────────────────────────────
#
# crewai-tools 1.14.7: BaseTool._run must accept **kwargs — CrewAI may inject
# keyword arguments at call time.  Omitting **kwargs causes a runtime TypeError.
#
# task_dir is declared as a Pydantic Field so it survives model serialisation
# inside CrewAI's internals (Pydantic v2 requires explicit Field declarations
# for instance-level values on BaseModel subclasses).

class ReadTaskFilesTool(BaseTool):
    """Read the task's instruction, metadata, solution, and test files."""

    name: str = "Read Task Files"
    description: str = (
        "Read the task description (instruction.md), metadata (task.toml), "
        "the oracle solution (solution/solve.sh), and test files (tests/test.sh, "
        "tests/test_outputs.py) to understand what needs to be done. "
        "Call this tool with no arguments — it reads the pre-configured task directory."
    )

    task_dir: str = Field(default="/tmp", description="Absolute path to the task directory")

    def _run(self, *args: Any, **kwargs: Any) -> str:  # noqa: ARG002
        try:
            return build_initial_user_prompt(Path(self.task_dir))
        except Exception as exc:
            return f"Error reading task files: {exc}"


# ── Agent definitions ──────────────────────────────────────────────────────────

def create_task_analyst(llm: LLM, task_dir: str, run_index: int) -> Agent:
    """Agent 1 — reads and analyses the task."""
    return Agent(
        role="Task Analyst",
        goal=(
            f"Thoroughly analyze the benchmark task in {task_dir} and produce "
            "a clear, structured summary of what the task requires. "
            "Read instruction.md, task.toml, solution/solve.sh, tests/test.sh, "
            f"and tests/test_outputs.py to understand the full picture. "
            f"You have a maximum of {CREW_MAX_ITER // 4} steps."
        ),
        backstory=(
            "You are an expert at reading technical specifications and distilling "
            "them into actionable plans. You have deep experience with software "
            "engineering benchmarks and understand exactly what each task file "
            "contributes to the overall challenge. You never rush to conclusions "
            "and always read all available files before forming your analysis."
        ),
        llm=llm,
        tools=[ReadTaskFilesTool(task_dir=task_dir)],
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


def create_solution_architect(llm: LLM) -> Agent:
    """Agent 2 — plans the fix based on the analyst's output."""
    return Agent(
        role="Solution Architect",
        goal=(
            "Study the oracle solution (solution/solve.sh) and the task description, "
            "then produce a detailed step-by-step plan for implementing the fix. "
            "The plan must include the exact commands needed at each step, "
            "the expected outcomes, and how to verify success via the test suite."
        ),
        backstory=(
            "You are a senior software engineer specialising in code repair and "
            "test-driven development. You study reference solutions carefully and "
            "adapt them rather than reinventing from scratch. Your plans are "
            "precise, minimal, and focused on passing the test suite efficiently."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


def create_implementer(llm: LLM) -> Agent:
    """Agent 3 — executes the plan."""
    return Agent(
        role="Code Implementer",
        goal=(
            "Execute the implementation plan step by step. Run shell commands "
            "to apply the fix, build the project, and prepare for testing. "
            "Each command must be precise and well-documented. "
            "If a command fails, diagnose the issue and try a different approach."
        ),
        backstory=(
            "You are a skilled DevOps engineer and software developer who excels "
            "at executing complex build and fix workflows in Linux environments. "
            "You are methodical: you run one command at a time, check the output, "
            "and proceed only when each step succeeds. You are familiar with "
            "Python, JavaScript/TypeScript, Hardhat, Rust, Go, and many other "
            "toolchains."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


def create_verifier(llm: LLM) -> Agent:
    """Agent 4 — validates via the test suite."""
    return Agent(
        role="Test Verifier",
        goal=(
            "Run the full test suite (tests/test.sh) and verify that every test "
            "passes. Analyse any failures and determine if they are genuine or "
            "environmental. Only confirm task completion when all tests pass "
            "with reward=1."
        ),
        backstory=(
            "You are a quality assurance engineer with a keen eye for detail. "
            "You know that a task is only complete when the test suite says so. "
            "You are thorough, sceptical of premature success claims, and always "
            "verify with actual test execution rather than relying on assumptions."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


# ── Task definitions ───────────────────────────────────────────────────────────

def create_crew_tasks(
    analyst: Agent,
    architect: Agent,
    implementer: Agent,
    verifier: Agent,
    task_dir: str,
    run_index: int,
) -> list[Task]:
    task_1 = Task(
        description=(
            f"Read and analyse the benchmark task located at {task_dir}. "
            "You MUST read all of these files: "
            "instruction.md (the task description), task.toml (metadata), "
            "solution/solve.sh (the reference fix), tests/test.sh (test runner), "
            "tests/test_outputs.py (test assertions). "
            "Use the Read Task Files tool to read them. "
            "Then produce a structured analysis covering:\n"
            "  1. What the task requires (language, framework, problem type)\n"
            "  2. What the oracle solution does (summarise solve.sh)\n"
            "  3. How the test suite validates correctness\n"
            "  4. Key files and their roles\n"
            "  5. Potential challenges and failure modes\n"
            "Be thorough — the next agents depend on your analysis."
        ),
        agent=analyst,
        expected_output=(
            "A comprehensive markdown analysis with all 5 sections filled in. "
            "Include file contents or summaries for each key file."
        ),
    )

    task_2 = Task(
        description=(
            "Based on the Task Analyst's analysis above, produce a detailed "
            "step-by-step implementation plan. Your plan must:\n"
            "  1. List the exact files that need to be modified\n"
            "  2. Describe the changes needed in each file\n"
            "  3. Specify the order of operations (what to fix first, second, etc.)\n"
            "  4. Include the exact shell commands to run at each step\n"
            "  5. Explain how to verify each step succeeded\n"
            "Study solve.sh carefully and follow its approach — don't reinvent.\n"
            "Your plan will be executed by the Code Implementer agent."
        ),
        agent=architect,
        expected_output=(
            "A numbered step-by-step plan in markdown format, with each step "
            "including the rationale, commands, and verification method."
        ),
    )

    task_3 = Task(
        description=(
            "Execute the implementation plan from the Solution Architect above. "
            "For each step:\n"
            "  1. Run the specified command\n"
            "  2. Capture and analyse the output\n"
            "  3. If the command fails, diagnose and retry with a corrected approach\n"
            "  4. Move to the next step only when the current one succeeds\n"
            "Keep a log of every command you run and its result. "
            "After implementing the fix, build the project to ensure it compiles. "
            "Do NOT run the test suite yet — that is the Verifier's job."
        ),
        agent=implementer,
        expected_output=(
            "A log of every command executed and its result, confirming the fix "
            "has been applied and the project builds successfully."
        ),
    )

    task_4 = Task(
        description=(
            "Run the test suite to verify the fix. Execute:\n"
            "  bash tests/test.sh\n"
            "Analyse the output carefully:\n"
            "  - Did all tests pass? (reward=1)\n"
            "  - Did some tests fail? (reward=0)\n"
            "  - Are the failures genuine or environmental?\n"
            "If tests fail and the fix seems correct, re-check the implementation "
            "and try again (you can coordinate with the implementer via context). \n"
            "Your final output MUST end with one of these exact JSON blocks:\n"
            '  {"task_complete": true}   — if ALL tests passed with reward=1\n'
            '  {"task_complete": false}  — if any test failed\n'
            "Do not omit this JSON block under any circumstances."
        ),
        agent=verifier,
        expected_output=(
            "Test execution results with clear pass/fail for each test, "
            'and a closing JSON verdict: {"task_complete": true} or {"task_complete": false}.'
        ),
    )

    return [task_1, task_2, task_3, task_4]


# ── Crew factory ───────────────────────────────────────────────────────────────

def create_probe_crew(
    task_dir: str,
    model_id: str,
    provider: str,
    run_index: int,
) -> Crew:
    """
    Build a CrewAI crew for one probe run (crewai==1.14.7 compatible).

    model_id and provider come directly from the DB via get_model_for_role()
    — nothing is hard-coded.  build_crewai_llm() assembles the LiteLLM
    model string from them.
    """
    llm = build_crewai_llm(model_id=model_id, provider=provider)

    analyst     = create_task_analyst(llm, task_dir, run_index)
    architect   = create_solution_architect(llm)
    implementer = create_implementer(llm)
    verifier    = create_verifier(llm)

    tasks = create_crew_tasks(
        analyst=analyst,
        architect=architect,
        implementer=implementer,
        verifier=verifier,
        task_dir=task_dir,
        run_index=run_index,
    )

    return Crew(
        agents=[analyst, architect, implementer, verifier],
        tasks=tasks,
        process=Process.sequential,
        verbose=False,
    )


# ── Crew result parser ─────────────────────────────────────────────────────────
#
# crewai 1.x returns a CrewOutput object from kickoff(), not a raw string.
# CrewOutput has:
#   .raw            — str, the final agent output
#   .tasks_output   — list[TaskOutput], one per task
# We check both the top-level .raw and the last task's output (the Verifier).

def crew_completed_successfully(crew_output: Any) -> bool:
    """
    Determine whether the crew run resulted in task_complete=true.
    Handles both the crewai 1.x CrewOutput object and plain strings.
    """
    if crew_output is None:
        return False

    # Collect all text to scan: top-level raw + last task output (Verifier)
    texts: list[str] = []

    if hasattr(crew_output, "raw") and crew_output.raw:
        texts.append(crew_output.raw)

    if hasattr(crew_output, "tasks_output") and crew_output.tasks_output:
        last = crew_output.tasks_output[-1]
        last_text = getattr(last, "raw", None) or str(last)
        if last_text:
            texts.append(last_text)

    if not texts:
        texts.append(str(crew_output))

    combined = "\n".join(texts)

    # 1. Strict JSON extraction — scan every { ... } block
    start = 0
    while True:
        start = combined.find("{", start)
        if start == -1:
            break
        depth = 0
        for i, ch in enumerate(combined[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        block = json.loads(combined[start : i + 1])
                        if isinstance(block, dict) and block.get("task_complete") is True:
                            return True
                    except (json.JSONDecodeError, ValueError):
                        pass
                    break
        start += 1

    # 2. Fallback: unambiguous prose markers
    combined_lower = combined.lower()
    for marker in (
        '"task_complete": true',
        "task_complete\": true",
        "all tests passed",
        "all tests pass",
        "reward=1",
    ):
        if marker in combined or marker in combined_lower:
            return True

    return False


# ── Crew runner ────────────────────────────────────────────────────────────────
#
# crew.kickoff() is synchronous and can block for several minutes.
# Running it directly inside an async function would stall the asyncio event
# loop and deadlock the staggered-parallel tasks in probe_base.py.
# We hand it off to the default ThreadPoolExecutor via run_in_executor().

async def run_crew_probe(
    task_dir: str,
    run_index: int,
    model_id: str,
    provider: str,
    start_delay: float = 0.0,
) -> bool:
    """
    Execute one complete crew run for a probe (crewai==1.14.7).

    model_id / provider are passed through from the DB — not modified here.
    build_crewai_llm() handles the LiteLLM prefix assembly.
    """
    tag = f"crew-run {run_index + 1}"

    if start_delay > 0:
        _log(f"{tag}: waiting {start_delay:.0f}s stagger before starting...")
        await asyncio.sleep(start_delay)

    _log(f"{tag}: creating crew (model={provider}/{model_id}, dir={task_dir})")

    try:
        crew = create_probe_crew(
            task_dir=task_dir,
            model_id=model_id,
            provider=provider,
            run_index=run_index,
        )
    except Exception as exc:
        _log(f"{tag}: crew creation failed: {exc}")
        return False

    _log(f"{tag}: kicking off crew...")

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, crew.kickoff)
        _log(f"{tag}: crew finished — output type={type(result).__name__}")
    except Exception as exc:
        _log(f"{tag}: crew execution failed: {exc}")
        return False

    completed = crew_completed_successfully(result)
    _log(f"{tag}: {'PASS ✓' if completed else 'FAIL ✗'}")
    return completed