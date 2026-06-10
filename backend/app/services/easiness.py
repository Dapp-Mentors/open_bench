# app/services/easiness.py
#
# Probe runner for two pipeline stages:
#
#   Stage 6 — Easiness prefilter
#     Model:  settings.DEFAULT_MODEL_ID  (e.g. deepseek-v4-flash)
#     Runs:   5 parallel independent attempts
#     Pass:   exactly 1/5 succeed
#     0/5   → TOO_HARD
#     2+/5  → TOO_EASY
#     1/5   → GOOD  (proceed to difficulty probe)
#
#   Stage 7 — Difficulty probe
#     Model:  settings.DIFFICULTY_MODEL_ID  (e.g. deepseek-v4-pro — frontier)
#     Runs:   5 parallel independent attempts
#     Pass:   1–3/5 succeed
#     0/5   → TOO_HARD
#     4–5/5 → TOO_EASY
#     1–3/5 → GOOD
#
# ── How a single probe attempt works ─────────────────────────────────────────
#
#  1. Start a fresh container from the task's pre-built Docker image.
#     Only the task's own environment is present — NO solution/ and NO tests/
#     are visible to the container at this point.  The LLM sees the same blank
#     slate an AI agent would see.
#
#  2. Call the LLM (synchronous httpx inside the worker thread) with:
#       - system: a terse "you are a terminal agent" prompt
#       - user:   the full text of instruction.md
#     Ask it to respond with ONLY a bash script that solves the task.
#
#  3. Write the LLM's response to a temp file and copy it into the running
#     container via `docker cp`, then execute it with `docker exec`.
#
#  4. Mount tests/ (read-only) and run test.sh via a second `docker exec`,
#     injecting REWARD_FILE so reward.txt lands on the host tmpdir.
#
#  5. Read reward.txt.  "1" = pass.  Stop and remove the container.
#
# This is intentionally simple — no multi-turn, no tool use, no context
# window management.  The point is to measure raw task difficulty against a
# single-shot LLM call, matching how the Pluto platform's difficulty probe
# works.
#
# All model/provider config comes exclusively from settings (config.py).

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Tuple

import httpx

from app.core.config import settings
from app.services.pipeline import (
    _task_dir,
    _read_task_toml,
    _image_tag,
    _container_name,
    _force_remove_container,
)

_PROBE_RUNS    = 5
_LLM_TIMEOUT   = 120.0   # seconds to wait for the LLM response
_EXEC_TIMEOUT  = 180     # seconds to wait for the agent script inside the container
_TEST_TIMEOUT  = 180     # seconds to wait for test.sh

_PROBE_POOL = ThreadPoolExecutor(max_workers=_PROBE_RUNS, thread_name_prefix="probe")

_SYSTEM_PROMPT = """\
You are a terminal agent. You will be given a task description.
Respond with ONLY a bash script that solves the task — no explanation, no markdown fences, \
no preamble, just raw bash starting with the first command.
The script will be executed directly inside a Docker container that already has the \
project environment set up. Do not install packages; assume everything needed is present.
Do not read or write to /solution, /tests, or /logs/verifier — those paths do not exist.
"""


def _log(msg: str) -> None:
    print(f"[PROBE] {msg}", file=sys.stderr, flush=True)


# ── Public entry points ───────────────────────────────────────────────────────

async def run_easiness_prefilter(
    task_id: str,
    storage_path: str,
) -> Tuple[bool, str]:
    """
    Stage 6 — Easiness prefilter.
    Uses DEFAULT_PROVIDER / DEFAULT_MODEL_ID (fast model).
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _probe_sync,
        task_id, storage_path, "easiness",
        settings.DEFAULT_PROVIDER, settings.DEFAULT_MODEL_ID,
    )


async def run_difficulty_probe(
    task_id: str,
    storage_path: str,
) -> Tuple[bool, str]:
    """
    Stage 7 — Difficulty probe.
    Uses DEFAULT_PROVIDER / DIFFICULTY_MODEL_ID (frontier model).
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _probe_sync,
        task_id, storage_path, "difficulty",
        settings.DEFAULT_PROVIDER, settings.DIFFICULTY_MODEL_ID,
    )


# ── Core probe orchestrator ───────────────────────────────────────────────────

def _probe_sync(
    task_id: str,
    storage_path: str,
    mode: str,
    provider: str,
    model_id: str,
) -> Tuple[bool, str]:
    """
    Fires _PROBE_RUNS agent attempts in parallel and collects results.
    """
    task_dir    = _task_dir(storage_path)
    task_meta   = _read_task_toml(task_dir)
    img_tag     = _image_tag(task_id)
    model_label = f"{provider}/{model_id}"

    instruction = _read_instruction(task_dir)
    working_dir = task_meta.get("task", {}).get("working_dir", "/app")
    net_required = task_meta.get("task", {}).get("network_required", False)
    network_mode = "bridge" if net_required else "none"

    _log(
        f"{mode}: launching {_PROBE_RUNS} parallel agent attempts "
        f"(task={task_id}, model={model_label}, working_dir={working_dir})"
    )

    futures = {}
    for i in range(_PROBE_RUNS):
        container_nm = _container_name(task_id, f"{mode}_{i}")
        future = _PROBE_POOL.submit(
            _single_probe_attempt,
            run_index=i,
            mode=mode,
            container_name=container_nm,
            img_tag=img_tag,
            instruction=instruction,
            task_dir=task_dir,
            working_dir=working_dir,
            network_mode=network_mode,
            provider=provider,
            model_id=model_id,
        )
        futures[future] = i

    run_results: list[dict] = [{}] * _PROBE_RUNS
    for future in as_completed(futures):
        i = futures[future]
        try:
            result = future.result()
            run_results[i] = result
            _log(
                f"{mode} run {i+1}/{_PROBE_RUNS}: "
                f"reward={result.get('reward')!r} passed={result.get('passed')}"
            )
        except Exception as exc:
            run_results[i] = {
                "index": i + 1,
                "passed": False,
                "reward": None,
                "reward_missing": True,
                "llm_script": "",
                "logs_tail": f"Unhandled exception in probe worker: {exc}",
            }
            _log(f"{mode} run {i+1}/{_PROBE_RUNS}: EXCEPTION — {exc}")

    passes  = sum(1 for r in run_results if r.get("passed"))
    symbols = ["✓" if r.get("passed") else "✗" for r in run_results]
    summary = " ".join(symbols)

    _log(f"{mode}: {passes}/{_PROBE_RUNS} passed [{summary}] model={model_label}")

    if mode == "easiness":
        return _score_easiness(passes, summary, model_label, run_results)
    return _score_difficulty(passes, summary, model_label, run_results)


# ── Single attempt ────────────────────────────────────────────────────────────

def _single_probe_attempt(
    *,
    run_index: int,
    mode: str,
    container_name: str,
    img_tag: str,
    instruction: str,
    task_dir: Path,
    working_dir: str,
    network_mode: str,
    provider: str,
    model_id: str,
) -> dict:
    """
    One independent LLM-agent attempt:
      1. Ask the LLM to solve instruction.md  →  bash script
      2. Spin up a clean container (no solution/, no tests/ mounted)
      3. Copy the LLM script in and exec it
      4. Exec test.sh (with tests/ mounted read-only) to score the result
      5. Return the run result dict
    """
    import docker
    client = docker.from_env()

    result_base = {
        "index": run_index + 1,
        "passed": False,
        "reward": None,
        "reward_missing": True,
        "llm_script": "",
        "logs_tail": "",
    }

    # ── Step 1: Ask the LLM ───────────────────────────────────────────────────
    try:
        llm_script = _call_llm_sync(
            provider=provider,
            model_id=model_id,
            instruction=instruction,
        )
        llm_script = _strip_fences(llm_script)
        result_base["llm_script"] = llm_script[:500]   # store a preview for logs
        _log(f"{mode} run {run_index+1}: LLM response ({len(llm_script)} chars)")
    except Exception as exc:
        result_base["logs_tail"] = f"LLM call failed: {exc}"
        _log(f"{mode} run {run_index+1}: LLM call failed — {exc}")
        return result_base

    # ── Step 2: Start a clean container ──────────────────────────────────────
    # No solution/ mount.  No tests/ mount yet.  The LLM gets the same blank
    # environment an agent would see.
    try:
        container = client.containers.run(
            image=img_tag,
            name=container_name,
            command=["sleep", "600"],   # keep alive while we exec into it
            working_dir=working_dir,
            network_mode=network_mode,
            mem_limit="1g",
            remove=False,
            detach=True,
        )
    except Exception as exc:
        result_base["logs_tail"] = f"Container start failed: {exc}"
        _log(f"{mode} run {run_index+1}: container start failed — {exc}")
        _force_remove_container(container_name)
        return result_base

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            reward_host_path = os.path.join(tmpdir, "reward.txt")

            # ── Step 3: Copy LLM script in and execute it ─────────────────────
            script_host = os.path.join(tmpdir, "agent_solve.sh")
            with open(script_host, "w") as f:
                f.write(llm_script)

            # docker cp the script into the container
            _docker_cp_to(script_host, container_name, "/tmp/agent_solve.sh")

            exec_result = container.exec_run(
                cmd=["bash", "/tmp/agent_solve.sh"],
                workdir=working_dir,
                environment={"DEBIAN_FRONTEND": "noninteractive"},
                demux=False,
                tty=False,
            )
            agent_logs = (exec_result.output or b"").decode("utf-8", errors="replace")
            agent_exit = exec_result.exit_code
            _log(f"{mode} run {run_index+1}: agent script exit_code={agent_exit}")

            # ── Step 4: Mount tests/ and run test.sh ──────────────────────────
            # We use a second container exec with tests/ bind-mounted via
            # docker cp (exec_run can't add volumes).  Instead we copy the
            # entire tests/ tree into the container under /tests, then exec
            # test.sh from there.
            _docker_cp_to(
                str(task_dir / "tests"), container_name, "/tests"
            )

            # Also make the reward dir available
            container.exec_run(
                cmd=["mkdir", "-p", "/logs/verifier"],
                demux=False,
            )

            test_result = container.exec_run(
                cmd=["bash", "/tests/test.sh"],
                workdir=working_dir,
                environment={
                    "REWARD_FILE": "/logs/verifier/reward.txt",
                    "TESTS_DIR":   "/tests",
                },
                demux=False,
                tty=False,
            )
            test_logs = (test_result.output or b"").decode("utf-8", errors="replace")
            test_exit = test_result.exit_code
            _log(f"{mode} run {run_index+1}: test.sh exit_code={test_exit}")

            # ── Step 5: Read reward.txt back from the container ───────────────
            reward = _read_reward_from_container(container, container_name)

            combined_tail = (agent_logs + "\n" + test_logs).strip()[-400:]
            result_base.update({
                "passed":        reward == "1",
                "reward":        reward,
                "reward_missing": reward is None,
                "logs_tail":     combined_tail,
            })

    except Exception as exc:
        result_base["logs_tail"] = f"Probe attempt error: {exc}\n{result_base.get('logs_tail', '')}"
        _log(f"{mode} run {run_index+1}: probe error — {exc}")

    finally:
        try:
            container.stop(timeout=5)
        except Exception:
            pass
        _force_remove_container(container_name)

    return result_base


# ── LLM call (synchronous, for use inside worker threads) ─────────────────────

def _call_llm_sync(
    provider: str,
    model_id: str,
    instruction: str,
) -> str:
    """
    Synchronous HTTP call to the LLM — safe to call from any thread.
    Reads base_url and api_key exclusively from settings.
    """
    base_url = settings.llm_base_url(provider)
    api_key  = settings.llm_api_key(provider)

    if not api_key:
        raise RuntimeError(
            f"No API key configured for provider '{provider}'. "
            f"Set the key in your .env file."
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }
    if provider.lower() == "openrouter":
        headers["HTTP-Referer"] = "https://openbench.internal"

    payload = {
        "model":       model_id,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": instruction},
        ],
        "temperature": 0.7,   # some variance across runs is intentional
        "max_tokens":  2048,
    }

    url = f"{base_url.rstrip('/')}/chat/completions"

    with httpx.Client(timeout=httpx.Timeout(_LLM_TIMEOUT, connect=10.0)) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    return data["choices"][0]["message"]["content"]


# ── Docker helpers ────────────────────────────────────────────────────────────

def _docker_cp_to(host_path: str, container_name: str, container_dest: str) -> None:
    """
    Copy a file or directory from the host into a running container.
    Uses the `docker cp` CLI since the Python SDK doesn't expose cp directly.
    """
    result = subprocess.run(
        ["docker", "cp", host_path, f"{container_name}:{container_dest}"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"docker cp failed (host={host_path} → {container_name}:{container_dest}): "
            f"{result.stderr.strip()}"
        )


def _read_reward_from_container(container, container_name: str) -> str | None:
    """
    Read /logs/verifier/reward.txt from inside the running container
    using `docker exec cat`.  Returns the stripped content or None.
    """
    try:
        result = container.exec_run(
            cmd=["cat", "/logs/verifier/reward.txt"],
            demux=False,
        )
        if result.exit_code == 0 and result.output:
            return result.output.decode("utf-8", errors="replace").strip()
    except Exception:
        pass
    return None


# ── Text helpers ──────────────────────────────────────────────────────────────

def _read_instruction(task_dir: Path) -> str:
    p = task_dir / "instruction.md"
    if not p.exists():
        raise FileNotFoundError(f"instruction.md not found in {task_dir}")
    return p.read_text(encoding="utf-8")


def _strip_fences(text: str) -> str:
    """
    Remove markdown code fences if the LLM included them despite instructions.
    Handles ```bash, ```sh, ``` etc.
    """
    text = text.strip()
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```$", "", text)
    return text.strip()


# ── Scoring ───────────────────────────────────────────────────────────────────

def _format_run_details(run_results: list[dict]) -> str:
    lines = []
    for r in run_results:
        idx     = r.get("index", "?")
        passed  = r.get("passed", False)
        reward  = r.get("reward")
        missing = r.get("reward_missing", False)
        tail    = r.get("logs_tail", "").strip()

        status     = "PASS" if passed else "FAIL"
        reward_str = "(reward.txt missing)" if (missing and reward is None) else f"reward={reward!r}"
        line = f"  Run {idx}: {status} {reward_str}"

        if not passed and tail:
            indented = "\n    ".join(tail.splitlines())
            line += f"\n    {indented}"
        lines.append(line)
    return "\n".join(lines)


def _score_easiness(
    passes: int,
    summary: str,
    model_label: str,
    run_results: list[dict],
) -> Tuple[bool, str]:
    details = _format_run_details(run_results)

    if passes == 0:
        return (
            False,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_HARD "
            f"(model={model_label}).\n"
            f"The model never solved the task across {_PROBE_RUNS} independent attempts. "
            f"Check agent logs below — if runs show environment errors rather than genuine "
            f"attempts, fix the environment first. Otherwise simplify the task or add more "
            f"context to instruction.md.\n"
            f"Per-run details:\n{details}",
        )
    if passes == 1:
        return (
            True,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — GOOD "
            f"(model={model_label}). Proceeding to difficulty probe.\n"
            f"Per-run details:\n{details}",
        )
    return (
        False,
        f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_EASY "
        f"(model={model_label}).\n"
        f"The model solved the task {passes}/{_PROBE_RUNS} times from instruction alone. "
        f"Add complexity, remove hints, or tighten constraints so the task "
        f"requires genuine problem-solving.\n"
        f"Per-run details:\n{details}",
    )


def _score_difficulty(
    passes: int,
    summary: str,
    model_label: str,
    run_results: list[dict],
) -> Tuple[bool, str]:
    details = _format_run_details(run_results)

    if passes == 0:
        return (
            False,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_HARD "
            f"(model={model_label}).\n"
            f"The frontier model never solved the task across {_PROBE_RUNS} independent attempts. "
            f"Simplify the task or add more context to instruction.md.\n"
            f"Per-run details:\n{details}",
        )
    if 1 <= passes <= 3:
        return (
            True,
            f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — difficulty GOOD "
            f"(model={model_label}).\n"
            f"Per-run details:\n{details}",
        )
    return (
        False,
        f"pass@5: {passes}/{_PROBE_RUNS} [{summary}] — TOO_EASY "
        f"(model={model_label}).\n"
        f"The frontier model solved the task {passes}/{_PROBE_RUNS} times. "
        f"Add complexity, remove hints, or tighten constraints.\n"
        f"Per-run details:\n{details}",
    )