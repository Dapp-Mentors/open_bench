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
import io
import json
import os
import re
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

import docker
from docker.errors import ImageNotFound
from crewai import Agent, Task, Crew, Process, LLM
from app.core.config import settings
from app.services.agent_prompt import build_initial_user_prompt
from app.services.probe_types import (
    RUN_PASS,
    RUN_FAIL,
    RUN_RATE_LIMITED,
    is_rate_limit_error,
)

# ── Configuration ──────────────────────────────────────────────────────────────

CREW_MAX_TOKENS = 2048
CREW_TEMPERATURE = 0.3
CREW_MAX_ITER = 15


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
            "Study the task description provided in context, then produce a detailed "
            "step-by-step implementation plan with exact shell commands and "
            "verification steps. Derive the fix entirely from instruction.md."
        ),
        backstory=(
            "You are a senior software engineer specialising in code repair and "
            "test-driven development. You reason from first principles about what "
            "the task requires and devise the minimal correct fix."
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
            "  2. What the bug or missing feature is, based on instruction.md\n"
            "  3. Key files and their roles\n"
            "  4. Potential challenges and failure modes\n\n"
            "── TASK FILES ──────────────────────────────────────────────────\n\n"
            + task_content
        ),
        agent=analyst,
        expected_output=(
            "A comprehensive markdown analysis with all 4 sections filled in."
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
            "Derive the plan solely from the task description — do NOT reference "
            "or rely on solution/solve.sh or any test file."
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
            "Review the Code Implementer's work log and confirm the fix is complete:\n"
            "  - Was the fix applied without errors?\n"
            "  - Does the project build successfully?\n"
            "  - Are all the requirements from instruction.md addressed?\n\n"
            "IMPORTANT: You do NOT have access to the test suite — do not try to "
            "run tests/test.sh. The real test suite is run externally by the grader "
            "in a Docker container. Your job is only to verify that the fix was "
            "applied cleanly based on the implementer's log.\n\n"
            "Your final output MUST end with one of these exact JSON blocks "
            "(no extra text after it):\n"
            '  {"task_complete": true}   — fix was applied cleanly and build succeeds\n'
            '  {"task_complete": false}  — fix was not applied or build failed\n'
            "Omitting the JSON block is not allowed."
        ),
        agent=verifier,
        expected_output=(
            "A summary of whether the fix was applied correctly, with a closing "
            'JSON verdict: {"task_complete": true} or {"task_complete": false}.'
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

    analyst = create_task_analyst(llm)
    architect = create_solution_architect(llm)
    implementer = create_implementer(llm)
    verifier = create_verifier(llm)

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
                        if (
                            isinstance(block, dict)
                            and block.get("task_complete") is True
                        ):
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


# ── Docker verification ────────────────────────────────────────────────────────
#
# After the crew produces a fix, we extract the shell commands it executed from
# the implementer's task output and replay them inside the real task Docker
# image.  reward.txt must contain "1" for the run to count as PASS.
#
# This replaces the previous trust-the-agent approach where task_complete=true
# in the crew output was taken as ground truth.


def _image_tag(task_id_or_dir: str) -> str:
    """Derive the Docker image tag from the task directory path (last component)."""
    name = Path(task_id_or_dir).name.lower()
    return f"openbench-task-{name}"


def _extract_agent_commands(crew_output: Any) -> str | None:
    """
    Pull the shell commands the implementer executed from the crew output.

    Searches tasks_output (index 2 = implementer) first, then falls back to
    the full combined output.  Returns a shell script string or None if nothing
    useful is found.
    """
    texts: list[str] = []

    if hasattr(crew_output, "tasks_output") and crew_output.tasks_output:
        # task index 2 = implementer (0-based: analyst, architect, implementer, verifier)
        impl_idx = min(2, len(crew_output.tasks_output) - 1)
        impl_text = getattr(crew_output.tasks_output[impl_idx], "raw", None)
        if impl_text:
            texts.append(impl_text)

    if hasattr(crew_output, "raw") and crew_output.raw:
        texts.append(crew_output.raw)

    combined = "\n".join(texts)

    # Extract lines that look like shell commands from the implementer log.
    # The implementer is told to log every command it ran.
    lines: list[str] = []
    for line in combined.splitlines():
        stripped = line.strip()
        # Skip blank lines, markdown headers, and pure prose
        if not stripped or stripped.startswith("#"):
            continue
        # Accept lines that look like shell commands or are inside code fences
        if re.match(r"^[$>]\s+", stripped):
            lines.append(re.sub(r"^[$>]\s+", "", stripped))
        elif stripped.startswith("```"):
            continue
        elif re.match(
            r"^(bash|sh|python|pip|npm|cargo|go|make|cd|cp|mv|sed|awk|echo|export|touch|mkdir|chmod)\b",
            stripped,
        ):
            lines.append(stripped)

    if not lines:
        return None

    return "#!/usr/bin/env bash\nset -e\n" + "\n".join(lines)


def _verify_in_docker(
    task_dir: str,
    agent_script: str,
    run_index: int,
    task_id: str,
) -> bool:
    """
    Write the agent's fix script into a temp location, inject it into the
    already-built task Docker image, run it, then run tests/test.sh.
    Returns True iff reward.txt contains "1".

    Requires the task Docker image to have been built already by Stage 1 (CI).
    """
    image_tag = _image_tag(task_id)
    container_name = f"openbench_probe_{task_id[:12]}_run{run_index}"

    client = docker.from_env()

    try:
        client.images.get(image_tag)
    except ImageNotFound:
        _log(f"Docker image {image_tag} not found — cannot verify in Docker")
        return False

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write the agent's script to disk so we can inject it via bind-mount
        script_path = os.path.join(tmpdir, "agent_fix.sh")
        with open(script_path, "w") as f:
            f.write(agent_script)
        os.chmod(script_path, 0o755)

        reward_host_path = os.path.join(tmpdir, "reward.txt")

        # /logs/verifier is the only bind-mount — tests/ and solution/ are
        # already baked into the image by Stage 1 (_build_staging_context).
        # We inject the agent script via a second bind-mount on a temp path.
        volumes = {
            tmpdir: {"bind": "/logs/verifier", "mode": "rw"},
            script_path: {"bind": "/agent_fix.sh", "mode": "ro"},
        }
        environment = {
            "REWARD_FILE": "/logs/verifier/reward.txt",
            "TESTS_DIR": "/tests",
            "SOLUTION_DIR": "/solution",
        }

        # Run the agent's fix, then run the real test harness
        cmd = "bash /agent_fix.sh && bash /tests/test.sh"

        container = None
        try:
            container = client.containers.run(
                image=image_tag,
                name=container_name,
                command=["bash", "-c", cmd],
                working_dir="/app",
                volumes=volumes,
                environment=environment,
                remove=False,
                detach=True,
                mem_limit="1g",
            )
            container.wait(timeout=300)
            raw_logs = container.logs(stdout=True, stderr=True)
            container_logs = raw_logs.decode("utf-8", errors="replace")
            _log(
                f"Docker verification run {run_index + 1} logs (last 500 chars):\n{container_logs[-500:]}"
            )

            reward: str | None = None

            # Primary path: $REWARD_FILE written by test.sh
            if os.path.exists(reward_host_path):
                reward = open(reward_host_path).read().strip()

            # Fallback: docker cp from /app/reward.txt
            if reward is None:
                try:
                    bits, _ = container.get_archive("/app/reward.txt")
                    tar_bytes = b"".join(bits)
                    with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tar:
                        member = tar.getmember("reward.txt")
                        reward = tar.extractfile(member).read().decode().strip()
                except Exception:
                    pass

            container.remove(force=True)
            _log(f"Docker verification run {run_index + 1}: reward={reward!r}")
            return reward == "1"

        except Exception as exc:
            _log(f"Docker verification run {run_index + 1} failed: {exc}")
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass
            else:
                try:
                    client.containers.get(container_name).remove(force=True)
                except Exception:
                    pass
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
) -> str:
    """
    Execute one complete crew run, then verify the agent's fix in Docker.

    Flow:
      1. Crew runs blind (no solve.sh / test files in prompt).
      2. If crew output shows task_complete=true, extract the implementer's
         shell commands from the crew output.
      3. Write those commands to a script and run them inside the real task
         Docker image (built by Stage 1 CI).
      4. Run tests/test.sh in the same container and check reward.txt.
      5. Return RUN_PASS only if reward.txt == "1".

    model_id / provider are passed through from the DB unchanged.
    Returns one of RUN_PASS, RUN_FAIL, or RUN_RATE_LIMITED.
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
        if is_rate_limit_error(exc):
            return RUN_RATE_LIMITED
        return RUN_FAIL

    _log(f"{tag}: kicking off crew...")

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, crew.kickoff)
        _log(f"{tag}: crew finished — output type={type(result).__name__}")
    except Exception as exc:
        _log(f"{tag}: crew execution failed: {exc}")
        if is_rate_limit_error(exc):
            return RUN_RATE_LIMITED
        return RUN_FAIL

    # ── Step 1: did the crew believe it succeeded? ─────────────────────────────
    crew_claimed_success = crew_completed_successfully(result)
    _log(
        f"{tag}: crew self-report → {'claimed success' if crew_claimed_success else 'claimed failure'}"
    )

    if not crew_claimed_success:
        # Crew explicitly reported failure — no need to verify in Docker
        _log(f"{tag}: FAIL ✗ (crew self-reported failure)")
        return RUN_FAIL

    # ── Step 2: extract the agent's commands ──────────────────────────────────
    agent_script = _extract_agent_commands(result)
    if not agent_script:
        _log(f"{tag}: could not extract agent commands from crew output — FAIL ✗")
        return RUN_FAIL

    _log(
        f"{tag}: extracted agent script ({len(agent_script)} chars), verifying in Docker..."
    )

    # ── Step 3: verify in Docker ──────────────────────────────────────────────
    task_id = Path(task_dir).name  # directory name is used as the image tag key
    try:
        loop = asyncio.get_event_loop()
        docker_passed = await loop.run_in_executor(
            None,
            _verify_in_docker,
            task_dir,
            agent_script,
            run_index,
            task_id,
        )
    except Exception as exc:
        _log(f"{tag}: Docker verification raised exception: {exc} — FAIL ✗")
        return RUN_FAIL

    if docker_passed:
        _log(f"{tag}: PASS ✓ (Docker reward=1)")
        return RUN_PASS
    else:
        _log(f"{tag}: FAIL ✗ (Docker reward≠1)")
        return RUN_FAIL
