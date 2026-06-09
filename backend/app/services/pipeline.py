"""
services/pipeline.py
────────────────────
Low-level execution helpers called by the pipeline router.
Each function corresponds to one pipeline stage and returns (passed, message).

Container strategy
──────────────────
The backend runs inside Docker. To spin up task containers it uses the host 
Docker socket mounted at /var/run/docker.sock (see docker-compose.yml).
Containers are launched as siblings on the host daemon, not children.
Every container gets a unique name derived from taskId + stage so parallel
runs never collide. Containers are always removed after the stage completes.

File layout assumed
───────────────────
storagePath points to the unpacked task directory, which looks like:
  <storagePath>/
    instruction.md
    task.toml
    environment/
      Dockerfile
      ...
    solution/
      solve.sh
    tests/
      test.sh
      test_*.py
      ...
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Tuple

import docker
from docker.errors import BuildError, ContainerError, ImageNotFound

# ── Docker client (connects via socket mounted from host) ─────────────────────
# We create it lazily per-call so import doesn't fail if the socket isn't there yet.

def _docker_client() -> docker.DockerClient:
    return docker.from_env()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _task_dir(storage_path: str) -> Path:
    """
    Resolve storage_path to an unpacked task directory.

    storage_path may be either:
      - A path to a .zip file  -> extract next to it (cached after first call)
      - An already-extracted directory -> return as-is

    The extracted directory is placed at <zip_stem>/ beside the zip so every
    pipeline stage reuses the same extraction without re-unzipping.
    """
    p = Path(storage_path)

    # Already an extracted directory — nothing to do.
    if p.is_dir():
        return p

    # It's a ZIP file — extract if not already done.
    if p.is_file() and p.suffix.lower() == ".zip":
        extract_dir = p.parent / p.stem  # e.g. uploads/abc/e5e5c5f8-.../

        if not extract_dir.exists():
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(p) as zf:
                names = zf.namelist()
                if not names:
                    raise ValueError(f"ZIP is empty: {p}")

                # Detect single nested root folder inside ZIP.
                # e.g. ["my-task/instruction.md", "my-task/environment/Dockerfile"]
                # vs   ["instruction.md", "environment/Dockerfile"]
                top_level = {n.split("/")[0] for n in names if n.strip()}
                first = next(iter(top_level))
                has_single_root = (
                    len(top_level) == 1
                    and all(
                        n.startswith(first + "/") or n == first
                        for n in names
                    )
                )

                zf.extractall(extract_dir)

                if has_single_root:
                    # Contents landed in extract_dir/<root>/ — hoist them up one level
                    root_folder = extract_dir / first
                    if root_folder.is_dir():
                        for item in list(root_folder.iterdir()):
                            shutil.move(str(item), str(extract_dir / item.name))
                        root_folder.rmdir()

        return extract_dir

    raise FileNotFoundError(
        f"storage_path is neither a directory nor a .zip file: {storage_path}"
    )


def _run_subprocess(cmd: list[str], cwd: str | None = None) -> Tuple[int, str]:
    """Run a subprocess, return (returncode, combined stdout+stderr)."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=30,
    )
    output = (result.stdout + result.stderr).strip()
    return result.returncode, output


def _image_tag(task_id: str) -> str:
    # Lowercase slug safe for Docker image tags
    return f"openbench-task-{task_id.lower()}"


def _container_name(task_id: str, stage: str) -> str:
    return f"openbench_{task_id[:12]}_{stage}"


# ── Stage 1: CI checks ────────────────────────────────────────────────────────

async def run_ci_checks(task_id: str, storage_path: str) -> Tuple[bool, str]:
    """
    Syntax-checks all scripts and builds the Docker image.
    Returns (passed, message).
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _ci_checks_sync, task_id, storage_path)


def _ci_checks_sync(task_id: str, storage_path: str) -> Tuple[bool, str]:
    task_dir = _task_dir(storage_path)

    # 1. Required files present
    required = [
        task_dir / "instruction.md",
        task_dir / "task.toml",
        task_dir / "environment" / "Dockerfile",
        task_dir / "solution" / "solve.sh",
        task_dir / "tests" / "test.sh",
    ]
    for f in required:
        if not f.exists():
            return False, f"Missing required file: {f.relative_to(task_dir)}"

    # 2. Bash syntax on shell scripts
    for sh in [task_dir / "solution" / "solve.sh", task_dir / "tests" / "test.sh"]:
        code, out = _run_subprocess(["bash", "-n", str(sh)])
        if code != 0:
            return False, f"Bash syntax error in {sh.name}: {out}"

    # 3. Python syntax on test files
    for py in (task_dir / "tests").glob("test_*.py"):
        code, out = _run_subprocess(["python", "-m", "py_compile", str(py)])
        if code != 0:
            return False, f"Python syntax error in {py.name}: {out}"

    # 4. task.toml parses cleanly
    toml_path = task_dir / "task.toml"
    code, out = _run_subprocess(
        ["python", "-c", f"import tomllib; tomllib.load(open('{toml_path}','rb'))"]
    )
    if code != 0:
        return False, f"task.toml parse error: {out}"

    # 5. Count test functions — need at least 6
    test_functions = 0
    for py in (task_dir / "tests").glob("test_*.py"):
        content = py.read_text()
        test_functions += content.count("\ndef test_")
    if test_functions < 6:
        return False, f"Only {test_functions} test_ functions found — need at least 6"

    # 6. Docker build from environment/
    try:
        client = _docker_client()
        client.images.build(
            path=str(task_dir / "environment"),
            tag=_image_tag(task_id),
            rm=True,
            forcerm=True,
        )
    except BuildError as e:
        # Collect build log into a readable string
        log_lines = [l.get("stream", "") for l in e.build_log if isinstance(l, dict)]
        return False, "Docker build failed: " + " ".join(log_lines)[-500:]
    except Exception as e:
        return False, f"Docker build error: {e}"

    return True, "Syntax checks passed, Docker build succeeded"


# ── Stage 2: Preflight (pytest collect) ───────────────────────────────────────

async def run_preflight(task_id: str, storage_path: str) -> Tuple[bool, str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _preflight_sync, task_id, storage_path)


def _preflight_sync(task_id: str, storage_path: str) -> Tuple[bool, str]:
    """
    Runs the built image and does pytest --collect-only to confirm
    at least 6 test functions are discoverable inside the container.
    """
    task_dir = _task_dir(storage_path)
    image_tag = _image_tag(task_id)
    container_name = _container_name(task_id, "preflight")

    try:
        client = _docker_client()

        # Copy tests/ into a temp context, run collect-only
        container = client.containers.run(
            image=image_tag,
            name=container_name,
            command=["pytest", "--collect-only", "-q", "/tests"],
            volumes={
                str(task_dir / "tests"): {"bind": "/tests", "mode": "ro"},
            },
            remove=False,
            detach=True,
        )

        result = container.wait(timeout=60)
        logs = container.logs(stdout=True, stderr=True).decode()
        container.remove(force=True)

        # Count collected items from pytest output
        collected = logs.count("<Function test_")
        if collected < 6:
            return False, f"Only {collected} test functions collected — need at least 6. Output: {logs[-300:]}"

        return True, f"{collected} test functions collected"

    except Exception as e:
        _force_remove_container(container_name)
        return False, f"Preflight error: {e}"


# ── Stage 3: Oracle / NOP validation ─────────────────────────────────────────

async def run_oracle_nop(task_id: str, storage_path: str) -> Tuple[bool, str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _oracle_nop_sync, task_id, storage_path)


def _oracle_nop_sync(task_id: str, storage_path: str) -> Tuple[bool, str]:
    """
    NOP run:    mount tests/, run test.sh → reward.txt must be "0"
    Oracle run: mount tests/ + solution/, run solve.sh then test.sh → reward.txt must be "1"
    Both runs use completely independent containers.
    """
    task_dir  = _task_dir(storage_path)
    image_tag = _image_tag(task_id)

    nop_reward    = _run_container_stage(task_id, "nop",    task_dir, image_tag, oracle=False)
    oracle_reward = _run_container_stage(task_id, "oracle", task_dir, image_tag, oracle=True)

    if nop_reward is None:
        return False, "NOP run failed to produce reward.txt"
    if oracle_reward is None:
        return False, "Oracle run failed to produce reward.txt"
    if nop_reward != "0":
        return False, f"NOP check failed — tests passed before solve.sh ran (reward={nop_reward}). Tests must fail in the initial state."
    if oracle_reward != "1":
        return False, f"Oracle check failed — tests did not pass after solve.sh ran (reward={oracle_reward})."

    return True, "NOP reward=0 ✓  Oracle reward=1 ✓"


def _run_container_stage(
    task_id: str,
    stage: str,
    task_dir: Path,
    image_tag: str,
    oracle: bool,
) -> str | None:
    """
    Spin up a fresh container, optionally run solve.sh, then run test.sh.
    Returns the content of /logs/verifier/reward.txt, or None on error.
    """
    container_name = _container_name(task_id, stage)
    client = _docker_client()

    # Use a temp dir for the reward file so we can read it back
    with tempfile.TemporaryDirectory() as tmpdir:
        reward_host_path = os.path.join(tmpdir, "reward.txt")

        volumes = {
            str(task_dir / "tests"): {"bind": "/tests", "mode": "ro"},
            tmpdir: {"bind": "/logs/verifier", "mode": "rw"},
        }
        if oracle:
            volumes[str(task_dir / "solution")] = {"bind": "/solution", "mode": "ro"}

        # Build the shell command to run inside the container
        if oracle:
            cmd = "bash /solution/solve.sh && bash /tests/test.sh"
        else:
            cmd = "bash /tests/test.sh"

        try:
            container = client.containers.run(
                image=image_tag,
                name=container_name,
                command=["bash", "-c", cmd],
                volumes=volumes,
                remove=False,
                detach=True,
                mem_limit="512m",
                network_mode="none",   # no outbound network during test runs
            )

            container.wait(timeout=120)
            container.remove(force=True)

            # Read reward.txt from the host-side temp dir
            if os.path.exists(reward_host_path):
                return open(reward_host_path).read().strip()
            return None

        except Exception:
            _force_remove_container(container_name)
            return None


# ── Stage 4: Benchmark run execution ─────────────────────────────────────────

async def execute_benchmark_run(
    run_id: str,
    task_id: str,
    storage_path: str,
    agent_config: dict,
) -> Tuple[int, str | None]:
    """
    Runs the task against the specified agent.
    Returns (score, error_message).
    score is 1 (pass) or 0 (fail).
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        _benchmark_run_sync,
        run_id, task_id, storage_path, agent_config,
    )


def _benchmark_run_sync(
    run_id: str,
    task_id: str,
    storage_path: str,
    agent_config: dict,
) -> Tuple[int, str | None]:
    """
    Spins up the task container and injects the agent.
    Currently scaffolded — wires up the container and reads the reward file.
    Actual agent injection (streaming stdout, model calls) is a TODO.
    """
    task_dir   = _task_dir(storage_path)
    image_tag  = _image_tag(task_id)
    container_name = _container_name(run_id[:12], "bench")

    client = _docker_client()

    # Make sure the image exists — if it was built during pipeline it'll be cached;
    # if not, build it now (e.g. for tasks that skipped CI or were approved externally)
    try:
        client.images.get(image_tag)
    except ImageNotFound:
        client.images.build(
            path=str(task_dir / "environment"),
            tag=image_tag,
            rm=True,
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        reward_host_path = os.path.join(tmpdir, "reward.txt")

        volumes = {
            str(task_dir / "tests"):    {"bind": "/tests",    "mode": "ro"},
            str(task_dir / "solution"): {"bind": "/solution", "mode": "ro"},
            tmpdir:                     {"bind": "/logs/verifier", "mode": "rw"},
        }

        # TODO: replace this with real agent injection
        # The agent should be given /instruction.md and work via the container shell.
        # For now we run the oracle solution so the system is end-to-end wired.
        cmd = "bash /solution/solve.sh && bash /tests/test.sh"

        try:
            container = client.containers.run(
                image=image_tag,
                name=container_name,
                command=["bash", "-c", cmd],
                volumes=volumes,
                remove=False,
                detach=True,
                mem_limit="1g",
            )

            container.wait(timeout=300)
            container.remove(force=True)

            if os.path.exists(reward_host_path):
                reward = open(reward_host_path).read().strip()
                return (1 if reward == "1" else 0), None
            return 0, "reward.txt not written by test.sh"

        except Exception as e:
            _force_remove_container(container_name)
            return 0, str(e)


# ── Utility ───────────────────────────────────────────────────────────────────

def _force_remove_container(name: str) -> None:
    """Best-effort cleanup — never raises."""
    try:
        client = _docker_client()
        c = client.containers.get(name)
        c.remove(force=True)
    except Exception:
        pass


def unzip_task(zip_path: str, dest_dir: str) -> str:
    """
    Unzips a task ZIP into dest_dir/<task-name>/ and returns that path.
    Validates flat-root layout.
    """
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        if not names:
            raise ValueError("ZIP is empty")

        # All entries must share the same top-level directory (flat-root layout)
        roots = {n.split("/")[0] for n in names if n.strip()}
        if len(roots) != 1:
            raise ValueError(
                f"ZIP must have exactly one top-level directory (flat-root). Found: {roots}"
            )

        zf.extractall(dest_dir)
        task_name = roots.pop()
        return os.path.join(dest_dir, task_name)