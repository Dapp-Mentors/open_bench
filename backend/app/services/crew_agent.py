# app/services/crew_agent.py
#
# CrewAI-powered agents for the easiness prefilter and difficulty probe pipeline.
#
# Agents (sequential, NO tools — see note below):
#   1. Task Analyst       — analyses task files (injected into prompt at creation)
#   2. Solution Architect — plans the fix based on analyst output
#   3. Code Implementer   — executes the fix step by step
#   4. Test Verifier      — runs the test suite and confirms pass/fail
#
# ── Why no tools? ─────────────────────────────────────────────────────────────
#
# crewai 1.14.7: whenever ANY agent has tools=[ ... ], the framework activates
# a "native tools" execution path that creates a raw OpenAI client internally,
# ignoring the base_url / api_key we set on crewai.LLM.  With OpenRouter (or
# any non-OpenAI provider) this crashes immediately:
#
#   ERROR: OpenAI API call failed: 'NoneType' object is not subscriptable
#   Error executing listener call_llm_native_tools: ...
#
# Solution: remove all tools.  Task file content is read once at crew-creation
# time (via build_initial_user_prompt) and injected directly into task_1's
# description, so the Task Analyst has everything it needs without a tool call.
#
# ── crewai.LLM + OpenRouter ───────────────────────────────────────────────────
#
# crewai.LLM requires all three of:
#   model    = "openrouter/<model_id>"         — LiteLLM provider prefix
#   base_url = settings.llm_base_url(provider) — https://openrouter.ai/api/v1
#   api_key  = settings.llm_api_key(provider)  — OPENROUTER_API_KEY from config
#
# model_id and provider always come from the DB via get_model_for_role() —
# nothing is hard-coded here.

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from crewai import Agent, Task, Crew, Process, LLM

from app.core.config import settings
from app.services.agent_prompt import build_initial_user_prompt


# ── Configuration ──────────────────────────────────────────────────────────────

CREW_MAX_TOKENS  = 2048
CREW_TEMPERATURE = 0.3
CREW_MAX_ITER    = 15


# ── Logging ────────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"[CREW-AGENT] {msg}", file=sys.stderr, flush=True)


# ── LLM factory ───────────────────────────────────────────────────────────────

def build_crewai_llm(model_id: str, provider: str) -> LLM:
    """
    Build a crewai.LLM from the (model_id, provider) pair fetched from the DB.
    Credentials and base URL come from settings — nothing is hard-coded here.
    """
    if provider == "openrouter":
        # Always prepend the LiteLLM "openrouter/" routing prefix unconditionally.
        # The DB stores the raw OpenRouter model slug exactly as shown in the UI
        # (e.g. "nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter/owl-alpha",
        # "openai/gpt-oss-120b:free"). The "openrouter/" in "openrouter/owl-alpha"
        # is part of that model's slug on OpenRouter — it is NOT the LiteLLM prefix.
        # LiteLLM always needs its own prefix on top of whatever the slug is:
        #   "nvidia/nemotron-..."    → "openrouter/nvidia/nemotron-..."
        #   "openai/gpt-oss-120b"   → "openrouter/openai/gpt-oss-120b"
        #   "openrouter/owl-alpha"  → "openrouter/openrouter/owl-alpha"
        litellm_model = f"openrouter/{model_id}"
    else:
        litellm_model = model_id

    return LLM(
        model=litellm_model,
        base_url=settings.llm_base_url(provider),
        api_key=settings.llm_api_key(provider),
        temperature=CREW_TEMPERATURE,
        max_tokens=CREW_MAX_TOKENS,
    )


# ── Agent definitions (no tools) ──────────────────────────────────────────────

def create_task_analyst(llm: LLM) -> Agent:
    return Agent(
        role="Task Analyst",
        goal=(
            "Analyse the benchmark task files provided in the task description "
            "and produce a clear, structured summary of what needs to be done."
        ),
        backstory=(
            "You are an expert at reading technical specifications and distilling "
            "them into actionable plans. You have deep experience with software "
            "engineering benchmarks and understand exactly what each task file "
            "contributes to the overall challenge."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


def create_solution_architect(llm: LLM) -> Agent:
    return Agent(
        role="Solution Architect",
        goal=(
            "Study the oracle solution (solution/solve.sh) and the task description "
            "provided in context, then produce a detailed step-by-step implementation "
            "plan with exact shell commands and verification steps."
        ),
        backstory=(
            "You are a senior software engineer specialising in code repair and "
            "test-driven development. You study reference solutions carefully and "
            "adapt them rather than reinventing from scratch."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


def create_implementer(llm: LLM) -> Agent:
    return Agent(
        role="Code Implementer",
        goal=(
            "Execute the implementation plan step by step. Run shell commands "
            "to apply the fix, build the project, and prepare for testing. "
            "If a command fails, diagnose and try a different approach."
        ),
        backstory=(
            "You are a skilled DevOps engineer who excels at executing complex "
            "build and fix workflows in Linux environments. You are methodical: "
            "one command at a time, check output, proceed only on success. "
            "Familiar with Python, JavaScript/TypeScript, Hardhat, Rust, Go, and more."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


def create_verifier(llm: LLM) -> Agent:
    return Agent(
        role="Test Verifier",
        goal=(
            "Run the full test suite (tests/test.sh) and verify every test passes. "
            "Only confirm task completion when all tests pass with reward=1."
        ),
        backstory=(
            "You are a QA engineer with a keen eye for detail. A task is only "
            "complete when the test suite says so. You are thorough and sceptical "
            "of premature success claims."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
        max_iter=CREW_MAX_ITER // 4,
    )


# ── Task definitions ───────────────────────────────────────────────────────────
#
# task_content is the output of build_initial_user_prompt() — the full text of
# all task files (instruction.md, task.toml, solve.sh, test.sh, test_outputs.py).
# We inject it directly into task_1's description so no tool call is needed.

def create_crew_tasks(
    analyst: Agent,
    architect: Agent,
    implementer: Agent,
    verifier: Agent,
    task_content: str,
) -> list[Task]:

    task_1 = Task(
        description=(
            "Analyse the following benchmark task files and produce a structured "
            "analysis covering:\n"
            "  1. What the task requires (language, framework, problem type)\n"
            "  2. What the oracle solution does (summarise solve.sh)\n"
            "  3. How the test suite validates correctness\n"
            "  4. Key files and their roles\n"
            "  5. Potential challenges and failure modes\n\n"
            "── TASK FILES ──────────────────────────────────────────────────\n\n"
            + task_content
        ),
        agent=analyst,
        expected_output=(
            "A comprehensive markdown analysis with all 5 sections filled in."
        ),
    )

    task_2 = Task(
        description=(
            "Based on the Task Analyst's analysis, produce a detailed "
            "step-by-step implementation plan:\n"
            "  1. List the exact files that need to be modified\n"
            "  2. Describe the changes needed in each file\n"
            "  3. Specify the order of operations\n"
            "  4. Include the exact shell commands to run at each step\n"
            "  5. Explain how to verify each step succeeded\n"
            "Follow solve.sh's approach closely — don't reinvent."
        ),
        agent=architect,
        expected_output=(
            "A numbered step-by-step plan in markdown, each step with "
            "rationale, commands, and verification method."
        ),
    )

    task_3 = Task(
        description=(
            "Execute the implementation plan from the Solution Architect. "
            "For each step:\n"
            "  1. Run the specified command\n"
            "  2. Capture and analyse the output\n"
            "  3. If the command fails, diagnose and retry\n"
            "  4. Move to the next step only when the current one succeeds\n"
            "Keep a log of every command and its result. "
            "Do NOT run the test suite — that is the Verifier's job."
        ),
        agent=implementer,
        expected_output=(
            "A log of every command executed and its result, confirming the fix "
            "has been applied and the project builds successfully."
        ),
    )

    task_4 = Task(
        description=(
            "Run the test suite to verify the fix:\n"
            "  bash tests/test.sh\n"
            "Analyse the output:\n"
            "  - Did all tests pass? (reward=1)\n"
            "  - Did some tests fail? (reward=0)\n"
            "Your final output MUST end with one of these exact JSON blocks "
            "(no extra text after it):\n"
            '  {"task_complete": true}   — ALL tests passed with reward=1\n'
            '  {"task_complete": false}  — any test failed\n'
            "Omitting the JSON block is not allowed."
        ),
        agent=verifier,
        expected_output=(
            "Test results with pass/fail per test and a closing JSON verdict: "
            '{"task_complete": true} or {"task_complete": false}.'
        ),
    )

    return [task_1, task_2, task_3, task_4]


# ── Crew factory ───────────────────────────────────────────────────────────────

def create_probe_crew(
    task_dir: str,
    model_id: str,
    provider: str,
) -> Crew:
    """
    Build a CrewAI crew for one probe run (crewai==1.14.7, no tools).
    model_id / provider come from the DB — nothing hard-coded.
    Task file content is read once here and injected into task_1's description.
    """
    llm = build_crewai_llm(model_id=model_id, provider=provider)

    # Read task files once at crew-creation time — no tool call needed at runtime
    task_content = build_initial_user_prompt(Path(task_dir))

    analyst     = create_task_analyst(llm)
    architect   = create_solution_architect(llm)
    implementer = create_implementer(llm)
    verifier    = create_verifier(llm)

    tasks = create_crew_tasks(
        analyst=analyst,
        architect=architect,
        implementer=implementer,
        verifier=verifier,
        task_content=task_content,
    )

    return Crew(
        agents=[analyst, architect, implementer, verifier],
        tasks=tasks,
        process=Process.sequential,
        verbose=False,
    )


# ── Crew result parser ─────────────────────────────────────────────────────────
#
# crewai 1.x returns a CrewOutput object, not a raw string.
# We check .raw (top-level) and .tasks_output[-1].raw (Verifier output).

def crew_completed_successfully(crew_output: Any) -> bool:
    if crew_output is None:
        return False

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

    # Scan every { ... } block for task_complete: true
    pos = 0
    while True:
        start = combined.find("{", pos)
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
        pos = start + 1

    # Fallback prose markers
    combined_lower = combined.lower()
    for marker in (
        '"task_complete": true',
        'task_complete": true',
        "all tests passed",
        "all tests pass",
        "reward=1",
    ):
        if marker in combined or marker in combined_lower:
            return True

    return False


# ── Crew runner ────────────────────────────────────────────────────────────────
#
# crew.kickoff() is synchronous/blocking — run it in a thread executor so it
# doesn't stall the asyncio event loop and deadlock probe_base.py's parallel tasks.

async def run_crew_probe(
    task_dir: str,
    run_index: int,
    model_id: str,
    provider: str,
    start_delay: float = 0.0,
) -> bool:
    """
    Execute one complete crew run.
    model_id / provider are passed through from the DB unchanged.
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