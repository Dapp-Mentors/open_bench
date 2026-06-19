# app/services/crew_agent.py
#
# CrewAI-powered agents for the easiness prefilter and difficulty probe pipeline.
#
# Instead of a single monolithic LLM loop (the old _run_agent_once approach),
# we now use a CrewAI crew of specialised agents that collaborate to solve
# the task. Each agent has a defined role, goal, and backstory, mirroring
# the natural workflow of a human engineer:
#
#   1. Task Analyst    — reads instruction.md, task.toml, understands the brief
#   2. Solution Architect — studies solve.sh, plans the implementation strategy
#   3. Code Implementer   — executes commands to fix the code
#   4. Test Verifier      — runs tests and confirms completeness
#
# CrewAI process: sequential (each agent hands context to the next)
#
# Integration with the rest of the pipeline:
#   - The crew is launched by _run_agent_once() in easiness.py (or diff probe)
#   - It receives the same task_dir, model_id, provider as before
#   - It returns True/False (task_complete) just like the old loop
#
# Why CrewAI instead of a flat prompt?
#   - Role specialisation yields better results on complex tasks
#   - Each agent's output is structured and auditable per role
#   - Easy to extend (add a Debugger agent, Security reviewer, etc.)
#   - Built-in tool support for file reading, web search, etc.

from __future__ import annotations

import json
import sys
from pathlib import Path

from crewai import Agent, Task, Crew, Process
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

from app.services.llm import chat_completion
from app.services.agent_prompt import (
    AGENT_SYSTEM_PROMPT,
    build_initial_user_prompt,
    build_continuation_user_prompt,
)


# ── Configuration ──────────────────────────────────────────────────────────────

CREW_MAX_TOKENS    = 2048
CREW_TEMPERATURE   = 0.3
CREW_MAX_ITER      = 15      # max total agent turns across all crew tasks


# ── Logging ────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[CREW-AGENT] {msg}", file=sys.stderr, flush=True)


# ── Custom CrewAI LLM wrapper ──────────────────────────────────────────────────
#
# CrewAI expects either a model name string (which it resolves via provider env
# vars) or a custom LLM class that implements the LLM interface.  We provide a
# thin wrapper around our existing `chat_completion` so we reuse the same
# provider/model resolution, retry logic, etc. without configuring CrewAI's
# built-in LLM resolvers.

class CrewLLM:
    """
    Adapter that lets CrewAI agents call our existing chat_completion function.
    CrewAI internally calls llm.generate_reply(messages) on the LLM object.
    """

    def __init__(
        self,
        model_id: str,
        provider: str,
        temperature: float = CREW_TEMPERATURE,
        max_tokens: int = CREW_MAX_TOKENS,
    ):
        self.model_id = model_id
        self.provider = provider
        self.temperature = temperature
        self.max_tokens = max_tokens

    def generate_reply(self, messages: list[dict]) -> str:
        """
        CrewAI calls this with a list of messages:
          [{"role": "system", "content": "..."},
           {"role": "user", "content": "..."}]
        We extract the last user message and call our chat_completion.
        """
        system_parts = []
        user_parts = []

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "system":
                system_parts.append(content)
            elif role == "user":
                user_parts.append(content)

        system = "\n".join(system_parts) if system_parts else AGENT_SYSTEM_PROMPT
        user = "\n".join(user_parts) if user_parts else "Proceed with the task."

        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        result = loop.run_until_complete(
            chat_completion(
                system=system,
                user=user,
                provider=self.provider,
                model_id=self.model_id,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
        )
        return result or ""


# ── Custom tools ───────────────────────────────────────────────────────────────
#
# CrewAI tools let agents read files and run sandboxed commands.
# We wrap the same prompt-building logic that the old agent used.

class ReadTaskFilesTool(BaseTool):
    """Read the task's instruction, metadata, solution, and test files."""
    name: str = "Read Task Files"
    description: str = (
        "Read the task description (instruction.md), metadata (task.toml), "
        "the oracle solution (solution/solve.sh), and test files (tests/test.sh, "
        "tests/test_outputs.py) to understand what needs to be done."
    )

    task_dir: str = "/tmp"  # will be set per-instance

    def _run(self) -> str:
        task_dir = Path(self.task_dir)
        try:
            return build_initial_user_prompt(task_dir)
        except Exception as exc:
            return f"Error reading task files: {exc}"

    async def _arun(self) -> str:
        return self._run()


# ── Agent definitions ──────────────────────────────────────────────────────────

def _build_duration_str(run_index: int) -> str:
    return (
        "You have a maximum of 12 steps to complete this task. "
        "Be efficient and focused. Use the test suite to validate your work."
    )


def create_task_analyst(
    llm: CrewLLM,
    task_dir: str,
    run_index: int,
) -> Agent:
    """
    Agent 1 — Task Analyst
    Reads and analyses the task description, metadata, and files.
    Outputs a structured summary of what needs to be done.
    """
    return Agent(
        role="Task Analyst",
        goal=(
            f"Thoroughly analyze the benchmark task in {task_dir} and produce "
            f"a clear, structured summary of what the task requires. "
            f"Read instruction.md, task.toml, solution/solve.sh, tests/test.sh, "
            f"and tests/test_outputs.py to understand the full picture. "
            f"{_build_duration_str(run_index)}"
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


def create_solution_architect(llm: CrewLLM) -> Agent:
    """
    Agent 2 — Solution Architect
    Studies the oracle solution and plans the implementation approach.
    """
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


def create_implementer(llm: CrewLLM) -> Agent:
    """
    Agent 3 — Code Implementer
    Executes the plan by running commands and fixing the code.
    """
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


def create_verifier(llm: CrewLLM) -> Agent:
    """
    Agent 4 — Test Verifier
    Runs the test suite and confirms the task is complete.
    """
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
    """
    Create the four sequential tasks for the crew.
    Each task passes its output as context to the next.
    """

    task_1 = Task(
        description=(
            f"Read and analyse the benchmark task located at {task_dir}. "
            f"You MUST read all of these files: "
            f"instruction.md (the task description), task.toml (metadata), "
            f"solution/solve.sh (the reference fix), tests/test.sh (test runner), "
            f"tests/test_outputs.py (test assertions). "
            f"Use the Read Task Files tool to read them. "
            f"Then produce a structured analysis covering:\n"
            f"  1. What the task requires (language, framework, problem type)\n"
            f"  2. What the oracle solution does (summarise solve.sh)\n"
            f"  3. How the test suite validates correctness\n"
            f"  4. Key files and their roles\n"
            f"  5. Potential challenges and failure modes\n"
            f"Be thorough — the next agents depend on your analysis."
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
            "and try again (you can coordinate with the implementer via context). "
            "ONLY set task_complete=true when ALL tests pass with reward=1."
        ),
        agent=verifier,
        expected_output=(
            "Test execution results with clear pass/fail for each test, "
            "and a final verdict: task_complete=true or task_complete=false."
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
    Build a CrewAI crew for one probe run.

    The crew consists of 4 specialised agents working sequentially:
      1. Task Analyst     → reads & analyses the task
      2. Solution Architect → plans the fix
      3. Code Implementer   → executes the fix
      4. Test Verifier      → validates the fix

    Each agent uses the same LLM (easiness or frontier model) but with a
    different role-specific prompt.

    Args:
        task_dir:  Absolute path to the unpacked task directory
        model_id:  OpenRouter model slug (e.g. "anthropic/claude-sonnet-4-20250514")
        provider:  LLM provider name ("openrouter")
        run_index: 0-based run index for logging

    Returns:
        A configured Crew instance ready to kickoff.
    """
    llm = CrewLLM(
        model_id=model_id,
        provider=provider,
        temperature=CREW_TEMPERATURE,
        max_tokens=CREW_MAX_TOKENS,
    )

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

    crew = Crew(
        agents=[analyst, architect, implementer, verifier],
        tasks=tasks,
        process=Process.sequential,
        verbose=False,
    )

    return crew


# ── Crew result parser ─────────────────────────────────────────────────────────
#
# After the crew finishes, we extract the task_complete flag from the
# Verifier's output.  If the JSON structure isn't found we fall back to
# scanning the final output for success markers.

def crew_completed_successfully(crew_output: str | dict | None) -> bool:
    """
    Determine whether the crew run resulted in task_complete=true.

    Accepts:
      - A dict with a `final_output` key (CrewAI's output format)
      - A raw string (final output text)
      - None (crew failure)

    Checks the Verifier's output (the last task in the sequence) for
    the task_complete flag.
    """
    if crew_output is None:
        return False

    # Extract the text we need to parse
    if isinstance(crew_output, dict):
        text = crew_output.get("final_output", "") or str(crew_output)
    else:
        text = str(crew_output)

    # Try JSON extraction first
    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, dict) and parsed.get("task_complete") is True:
            return True
    except (json.JSONDecodeError, ValueError):
        pass

    # Find outermost { ... } block
    start = text.find("{")
    if start != -1:
        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        block = json.loads(text[start : i + 1])
                        if isinstance(block, dict) and block.get("task_complete") is True:
                            return True
                    except (json.JSONDecodeError, ValueError):
                        pass
                    break

    # Fallback: scan for success markers in the final output
    success_markers = [
        "task_complete\": true",
        "task_complete': true",
        "all tests pass",
        "reward=1",
        "all tests passed",
        "task complete",
    ]
    text_lower = text.lower()
    for marker in success_markers:
        if marker in text_lower or marker in text:
            return True

    return False


# ── Crew runner ────────────────────────────────────────────────────────────────
#
# Async wrapper around crew.kickoff() so the existing pipeline can await it.

async def run_crew_probe(
    task_dir: str,
    run_index: int,
    model_id: str,
    provider: str,
    start_delay: float = 0.0,
) -> bool:
    """
    Execute one complete crew run for a probe (replaces _run_agent_once).

    Creates a 4-agent crew, runs it, and returns True if the Verifier
    determined task_complete=true.

    Args:
        task_dir:    Path to the unpacked task directory
        run_index:   0-based run index (for logging)
        model_id:    OpenRouter model slug
        provider:    Provider name ("openrouter")
        start_delay: Seconds to wait before starting (stagger)

    Returns:
        True if the task was completed, False otherwise.
    """
    tag = f"crew-run {run_index + 1}"

    if start_delay > 0:
        _log(f"{tag}: waiting {start_delay:.0f}s stagger before starting...")
        import asyncio
        await asyncio.sleep(start_delay)

    _log(f"{tag}: creating crew (model={provider}/{model_id}, dir={task_dir})")

    try:
        crew = create_probe_crew(
            task_dir=task_dir,
            model_id=model_id,
            provider=provider,
            run_index=run_index,
        )

        _log(f"{tag}: kicking off crew...")
        result = crew.kickoff()
        _log(f"{tag}: crew finished — output type={type(result).__name__}")

        completed = crew_completed_successfully(result)
        status = "PASS ✓" if completed else "FAIL ✗"
        _log(f"{tag}: {status}")
        return completed

    except Exception as exc:
        _log(f"{tag}: crew execution failed: {exc}")
        return False