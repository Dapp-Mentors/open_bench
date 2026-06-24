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
storagePath points to the unpacked task directory:
  <storagePath>/
    instruction.md
    task.toml          ← may declare working_dir, network_required
    environment/
      Dockerfile
    solution/
      solve.sh
    tests/
      test.sh
      test_*.py / hardhat/*.js / ...

reward.txt contract
───────────────────
test.sh MUST write reward.txt to $REWARD_FILE.
The container runner injects:
  REWARD_FILE=/logs/verifier/reward.txt
  SOLUTION_DIR=/solution   (oracle run only)
  TESTS_DIR=/tests

If test.sh writes reward.txt to a different path it will not be found.

Bind-mount note
───────────────
The backend uses the host Docker socket, so sibling containers are launched
on the HOST daemon. Bind-mount source paths are resolved from the HOST
filesystem — NOT from inside this backend container. Because task files live
inside the task_uploads named Docker volume (mounted at /uploads inside the
backend container), those paths do NOT exist on the host. Docker would silently
create empty directories on the host, resulting in empty /tests and /solution
mounts and exit_code=127.

Fix: the CI stage bakes tests/ and solution/ into the image by widening the
build context from environment/ to the full task_dir. _run_container_stage
therefore only needs to bind-mount the writable /logs/verifier tmpdir, which
is created by tempfile.TemporaryDirectory() and DOES resolve on the host side.

Docker build cache / GPG note
─────────────────────────────
Task Dockerfiles commonly run apt-get. Cached RUN layers can contain stale
Debian GPG signatures that cause "At least one invalid signature was
encountered" build failures — especially after a fresh docker compose down/up
clears the image cache but leaves the build cache in a stale state.

We pass nocache=True on every CI build to force a clean layer pull. This costs
a few extra seconds per build but completely eliminates the stale-signature
class of failures. Task images are small (typically <500 MB) and are pruned
after pipeline completion anyway, so the cache savings would be minimal.
"""

from __future__ import annotations

import asyncio
import io
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path
from typing import Tuple

import docker
from docker.errors import BuildError, ImageNotFound

# ── Docker client ─────────────────────────────────────────────────────────────


def _docker_client() -> docker.DockerClient:
    return docker.from_env()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _task_dir(storage_path: str) -> Path:
    """
    Resolve storage_path to an unpacked task directory.
    Handles both plain directories and .zip files (extracts on first call).
    """
    p = Path(storage_path)

    if p.is_dir():
        return p

    if p.is_file() and p.suffix.lower() == ".zip":
        extract_dir = p.parent / p.stem

        if not extract_dir.exists():
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(p) as zf:
                names = zf.namelist()
                if not names:
                    raise ValueError(f"ZIP is empty: {p}")

                top_level = {n.split("/")[0] for n in names if n.strip()}
                first = next(iter(top_level))
                has_single_root = len(top_level) == 1 and all(
                    n.startswith(first + "/") or n == first for n in names
                )

                zf.extractall(extract_dir)

                if has_single_root:
                    root_folder = extract_dir / first
                    if root_folder.is_dir():
                        for item in list(root_folder.iterdir()):
                            shutil.move(str(item), str(extract_dir / item.name))
                        root_folder.rmdir()

        return extract_dir

    raise FileNotFoundError(
        f"storage_path is neither a directory nor a .zip file: {storage_path}"
    )


def _read_task_toml(task_dir: Path) -> dict:
    """
    Parse task.toml and return its contents as a dict.
    Returns {} if the file is missing or unparseable — callers use .get() with defaults.
    """
    try:
        import tomllib

        toml_path = task_dir / "task.toml"
        if toml_path.exists():
            with open(toml_path, "rb") as f:
                return tomllib.load(f)
    except Exception:
        pass
    return {}


def _run_subprocess(cmd: list[str], cwd: str | None = None) -> Tuple[int, str]:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result.returncode, (result.stdout + result.stderr).strip()


def _image_tag(task_id: str) -> str:
    return f"openbench-task-{task_id.lower()}"


def _container_name(task_id: str, stage: str) -> str:
    return f"openbench_{task_id[:12]}_{stage}"


def _diag(msg: str) -> None:
    print(f"[PIPELINE] {msg}", file=sys.stderr, flush=True)


# ── Stage 1: CI checks ────────────────────────────────────────────────────────


async def run_ci_checks(task_id: str, storage_path: str) -> Tuple[bool, str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _ci_checks_sync, task_id, storage_path)


def _build_staging_context(task_dir: Path, tmp_root: str) -> str:
    """
    Create a temporary build context directory that:
      1. Copies everything from environment/ to the root (so Dockerfile's
         relative COPY paths like `COPY package.json ./` still resolve).
      2. Adds tests/ and solution/ as subdirectories in the context.
      3. Patches .dockerignore so tests/ and solution/ are never excluded.
      4. Appends COPY instructions to the Dockerfile so tests/ and solution/
         are actually baked into the image at /tests and /solution.

    Returns the path to the staging directory.
    """
    staging = Path(tmp_root) / "staging"
    staging.mkdir(parents=True, exist_ok=True)

    # 1. Flatten environment/ contents into staging root
    env_dir = task_dir / "environment"
    if env_dir.is_dir():
        for item in env_dir.iterdir():
            dest = staging / item.name
            if item.is_dir():
                shutil.copytree(str(item), str(dest))
            else:
                shutil.copy2(str(item), str(dest))

    # 2. Copy tests/ and solution/ into the staging context
    for subdir in ("tests", "solution"):
        src = task_dir / subdir
        if src.is_dir():
            shutil.copytree(str(src), str(staging / subdir))

    # 3. Patch .dockerignore — the task's environment/.dockerignore may contain
    #    wildcard rules (e.g. `*`, `tests/`, `solution/`) that cause Docker to
    #    strip these directories from the build context before the daemon even
    #    sees them, making `COPY tests/ /tests/` fail with "not found".
    #    We overwrite it entirely with a minimal safe version that explicitly
    #    allows the two directories we injected.
    dockerignore_path = staging / ".dockerignore"
    with open(dockerignore_path, "w") as f:
        f.write(
            "# Generated by OpenBench pipeline — overrides task .dockerignore\n"
            "# Preserve tests/ and solution/ so they can be baked into the image.\n"
            ".git\n"
            ".gitignore\n"
            "*.log\n"
            "!tests/\n"
            "!solution/\n"
        )

    # 4. Append COPY instructions to the Dockerfile so the directories
    #    are actually present inside the built image at /tests and /solution.
    dockerfile_path = staging / "Dockerfile"
    if dockerfile_path.exists():
        with open(dockerfile_path, "a") as f:
            f.write("\n# Injected by OpenBench pipeline — bake in tests and solution\n")
            if (staging / "tests").is_dir():
                f.write("COPY tests/ /tests/\n")
                f.write("RUN chmod +x /tests/test.sh\n")
            if (staging / "solution").is_dir():
                f.write("COPY solution/ /solution/\n")
                f.write("RUN chmod +x /solution/solve.sh\n")

    return str(staging)


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

    # 3. Python syntax on test files (skip if there are none — JS tasks are fine)
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

    # 5. Count test functions — need at least 6 across Python OR JS test files
    test_count = _count_tests(task_dir)
    if test_count < 6:
        return False, f"Only {test_count} test functions found — need at least 6"

    # 6. Docker build using a staging context so:
    #    - Dockerfile's relative COPY paths resolve correctly (environment/ contents at root)
    #    - tests/ and solution/ are baked into the image at /tests and /solution
    try:
        client = _docker_client()
        with tempfile.TemporaryDirectory() as tmp_root:
            staging_path = _build_staging_context(task_dir, tmp_root)
            client.images.build(
                path=staging_path,
                dockerfile="Dockerfile",
                tag=_image_tag(task_id),
                rm=True,
                forcerm=True,
                nocache=True,
            )
    except BuildError as e:
        log_lines = [l.get("stream", "") for l in e.build_log if isinstance(l, dict)]
        _cleanup_task_image(task_id)
        return False, "Docker build failed:\n" + "".join(log_lines)[-2000:]
    except Exception as e:
        _cleanup_task_image(task_id)
        return False, f"Docker build error: {e}"

    return True, "Syntax checks passed, Docker build succeeded"


def _count_tests(task_dir: Path) -> int:
    """
    Count test functions across Python test files and JS/TS test files.
    Python: lines matching ^def test_
    JS/TS:  it(...) / it.skip(...) / test(...) blocks
    """
    count = 0

    # Python
    for py in (task_dir / "tests").glob("test_*.py"):
        content = py.read_text(errors="replace")
        count += len(re.findall(r"^\s*def test_", content, re.MULTILINE))

    # JavaScript / TypeScript  (Mocha / Jest / Hardhat)
    for js in list((task_dir / "tests").rglob("*.js")) + list(
        (task_dir / "tests").rglob("*.ts")
    ):
        content = js.read_text(errors="replace")
        # match:  it("...",   it(`...`,   it('...',   and same for test(
        count += len(re.findall(r"\b(?:it|test)\s*\(", content))

    return count


# ── Stage 2: Preflight (pytest collect OR JS test dry-run) ────────────────────


async def run_preflight(task_id: str, storage_path: str) -> Tuple[bool, str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _preflight_sync, task_id, storage_path)


def _preflight_sync(task_id: str, storage_path: str) -> Tuple[bool, str]:
    task_dir = _task_dir(storage_path)
    task_meta = _read_task_toml(task_dir)
    image_tag = _image_tag(task_id)

    # Decide test runner from task.toml [task] test_runner field, or auto-detect
    test_runner = task_meta.get("task", {}).get("test_runner", "").lower()
    if not test_runner:
        test_runner = _detect_test_runner(task_dir)

    _diag(f"preflight: test_runner={test_runner} task={task_id}")

    if test_runner in ("hardhat", "mocha", "jest", "js"):
        return _preflight_js(task_id, task_dir, image_tag, task_meta)
    else:
        return _preflight_pytest(task_id, task_dir, image_tag)


def _detect_test_runner(task_dir: Path) -> str:
    """Infer the test runner from task file structure."""
    # Hardhat project: hardhat.config.js in environment/
    if (task_dir / "environment" / "hardhat.config.js").exists():
        return "hardhat"
    if (task_dir / "environment" / "hardhat.config.ts").exists():
        return "hardhat"
    # Any JS test files
    js_tests = list((task_dir / "tests").rglob("*.js")) + list(
        (task_dir / "tests").rglob("*.ts")
    )
    if js_tests:
        return "js"
    return "pytest"


def _preflight_pytest(task_id: str, task_dir: Path, image_tag: str) -> Tuple[bool, str]:
    """Run pytest --collect-only inside the image."""
    container_name = _container_name(task_id, "preflight")
    try:
        client = _docker_client()
        # tests/ is already inside the image at /tests (baked in during _ci_checks_sync).
        # No bind-mount needed — run pytest against the image's own /tests directory.
        container = client.containers.run(
            image=image_tag,
            name=container_name,
            command=["pytest", "--collect-only", "-q", "--no-header", "/tests"],
            remove=False,
            detach=True,
        )
        container.wait(timeout=60)
        raw = container.logs(stdout=True, stderr=True)
        logs = (
            raw.decode("utf-8", errors="replace")
            .replace("\r\n", "\n")
            .replace("\r", "\n")
        )
        container.remove(force=True)

        collected = 0
        m = re.search(r"(\d+)\s+tests?\s+collected", logs, re.IGNORECASE)
        if m:
            collected = int(m.group(1))
        else:
            m2 = re.search(r"collected\s+(\d+)\s+items?", logs, re.IGNORECASE)
            if m2:
                collected = int(m2.group(1))

        if collected < 6:
            tail = logs[-400:].replace("\n", " ").strip()
            return (
                False,
                f"Only {collected} tests collected — need at least 6. Output: {tail}",
            )
        return True, f"{collected} test functions collected"

    except Exception as e:
        _force_remove_container(container_name)
        return False, f"Preflight error: {e}"


def _preflight_js(
    task_id: str, task_dir: Path, image_tag: str, task_meta: dict
) -> Tuple[bool, str]:
    """
    For Hardhat / Mocha tasks: do a compile-only dry-run to verify the
    project builds cleanly and count test cases from source.
    We don't run the actual tests here — that's oracle/NOP's job.
    """
    container_name = _container_name(task_id, "preflight")
    working_dir = task_meta.get("task", {}).get("working_dir", "/app")

    try:
        client = _docker_client()
        # Just compile — verify the project is well-formed
        container = client.containers.run(
            image=image_tag,
            name=container_name,
            command=["bash", "-c", "npx hardhat compile 2>&1 || true"],
            working_dir=working_dir,
            remove=False,
            detach=True,
        )
        container.wait(timeout=120)
        logs = container.logs(stdout=True, stderr=True).decode(
            "utf-8", errors="replace"
        )
        container.remove(force=True)

        _diag(f"preflight JS compile output: {logs[-300:]}")

        if "Error" in logs and "compiled" not in logs.lower():
            return False, f"Hardhat compile failed: {logs[-300:]}"

        # Count test cases from source (no execution needed)
        test_count = _count_tests(task_dir)
        if test_count < 6:
            return False, f"Only {test_count} test cases found — need at least 6"

        return True, f"{test_count} test functions collected (Hardhat/JS)"

    except Exception as e:
        _force_remove_container(container_name)
        return False, f"Preflight JS error: {e}"


# ── Stage 3: Oracle / NOP validation ─────────────────────────────────────────


async def run_oracle_nop(task_id: str, storage_path: str) -> Tuple[bool, str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _oracle_nop_sync, task_id, storage_path)


def _oracle_nop_sync(task_id: str, storage_path: str) -> Tuple[bool, str]:
    task_dir = _task_dir(storage_path)
    image_tag = _image_tag(task_id)
    task_meta = _read_task_toml(task_dir)

    try:
        nop_reward, nop_logs = _run_container_stage(
            task_id, "nop", task_dir, image_tag, oracle=False, task_meta=task_meta
        )
        oracle_reward, ora_logs = _run_container_stage(
            task_id, "oracle", task_dir, image_tag, oracle=True, task_meta=task_meta
        )

        _diag(f"NOP    reward={nop_reward!r}  logs_tail={nop_logs[-200:]!r}")
        _diag(f"Oracle reward={oracle_reward!r}  logs_tail={ora_logs[-200:]!r}")

        if nop_reward is None:
            return (
                False,
                f"NOP run failed to produce reward.txt. Container output: {nop_logs[-400:]}",
            )
        if oracle_reward is None:
            return (
                False,
                f"Oracle run failed to produce reward.txt. Container output: {ora_logs[-400:]}",
            )
        if nop_reward != "0":
            return (
                False,
                f"NOP check failed — tests passed before solve.sh ran (reward={nop_reward!r}). "
                f"Tests must fail on the unmodified code.\nContainer output: {nop_logs[-300:]}",
            )
        if oracle_reward != "1":
            return (
                False,
                f"Oracle check failed — tests did not pass after solve.sh ran (reward={oracle_reward!r}). "
                f"Check that solve.sh correctly fixes the code.\nContainer output: {ora_logs[-300:]}",
            )

        return True, "NOP reward=0 ✓  Oracle reward=1 ✓"

    finally:
        # Always remove the task image after oracle/nop regardless of outcome.
        # This is the last stage that needs the image. Keeping it wastes disk and
        # will eventually freeze Postgres when the volume fills up.
        _cleanup_task_image(task_id)


def _run_container_stage(
    task_id: str,
    stage: str,
    task_dir: Path,
    image_tag: str,
    oracle: bool,
    task_meta: dict,
) -> Tuple[str | None, str]:
    container_name = _container_name(task_id, stage)
    client = _docker_client()

    task_cfg = task_meta.get("task", {})
    working_dir = task_cfg.get("working_dir", "/app")
    net_required = task_cfg.get("network_required", False)
    network_mode = "bridge" if net_required else "none"

    _diag(f"{stage}: working_dir={working_dir} network={network_mode} oracle={oracle}")

    environment = {
        "REWARD_FILE": "/logs/verifier/reward.txt",
        "TESTS_DIR": "/tests",
    }
    if oracle:
        environment["SOLUTION_DIR"] = "/solution"

    if oracle:
        cmd = "bash /solution/solve.sh && bash /tests/test.sh"
    else:
        cmd = "bash /tests/test.sh"

    container_logs = ""
    container = None
    try:
        container = client.containers.run(
            image=image_tag,
            name=container_name,
            command=["bash", "-c", cmd],
            working_dir=working_dir,
            environment=environment,
            remove=False,
            detach=True,
            mem_limit="1g",
            network_mode=network_mode,
            # NO volumes — tmpdir bind-mounts don't resolve on the host daemon
        )

        result = container.wait(timeout=180)
        raw_logs = container.logs(stdout=True, stderr=True)
        container_logs = raw_logs.decode("utf-8", errors="replace")
        exit_code = result.get("StatusCode", -1)
        _diag(f"{stage}: exit_code={exit_code}")

        # Primary: docker cp from the hardcoded path test.sh writes to
        for reward_path in ["/logs/verifier/reward.txt", f"{working_dir}/reward.txt"]:
            try:
                bits, _ = container.get_archive(reward_path)
                tar_bytes = b"".join(bits)
                with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tar:
                    member = tar.getmembers()[0]
                    reward = tar.extractfile(member).read().decode().strip()
                _diag(
                    f"{stage}: reward.txt recovered from {reward_path} — value={reward!r}"
                )
                container.remove(force=True)
                return reward, container_logs
            except Exception:
                continue

        container.remove(force=True)
        return None, container_logs

    except Exception as e:
        if container is not None:
            try:
                container.remove(force=True)
            except Exception:
                pass
        else:
            _force_remove_container(container_name)
        return None, f"Container exception: {e}\n{container_logs}"


# ── Stage 4: Benchmark run execution ─────────────────────────────────────────


async def execute_benchmark_run(
    run_id: str,
    task_id: str,
    storage_path: str,
    agent_config: dict,
) -> Tuple[int, str | None]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        _benchmark_run_sync,
        run_id,
        task_id,
        storage_path,
        agent_config,
    )


def _benchmark_run_sync(
    run_id: str,
    task_id: str,
    storage_path: str,
    agent_config: dict,
) -> Tuple[int, str | None]:
    task_dir = _task_dir(storage_path)
    image_tag = _image_tag(task_id)
    task_meta = _read_task_toml(task_dir)
    container_name = _container_name(run_id[:12], "bench")
    client = _docker_client()

    try:
        client.images.get(image_tag)
    except ImageNotFound:
        with tempfile.TemporaryDirectory() as tmp_root:
            staging_path = _build_staging_context(task_dir, tmp_root)
            client.images.build(
                path=staging_path,
                dockerfile="Dockerfile",
                tag=image_tag,
                rm=True,
                nocache=True,
            )

    task_cfg = task_meta.get("task", {})
    working_dir = task_cfg.get("working_dir", "/app")

    with tempfile.TemporaryDirectory() as tmpdir:
        reward_host_path = os.path.join(tmpdir, "reward.txt")

        # tests/ and solution/ are inside the image — only /logs/verifier is mounted.
        volumes = {
            tmpdir: {"bind": "/logs/verifier", "mode": "rw"},
        }
        environment = {
            "REWARD_FILE": "/logs/verifier/reward.txt",
            "TESTS_DIR": "/tests",
            "SOLUTION_DIR": "/solution",
        }

        # TODO: replace with real agent injection
        cmd = "bash /solution/solve.sh && bash /tests/test.sh"

        container = None
        try:
            container = client.containers.run(
                image=image_tag,
                name=container_name,
                command=["bash", "-c", cmd],
                working_dir=working_dir,
                volumes=volumes,
                environment=environment,
                remove=False,
                detach=True,
                mem_limit="1g",
            )
            container.wait(timeout=300)
            raw_logs = container.logs(stdout=True, stderr=True)
            container_logs = raw_logs.decode("utf-8", errors="replace")

            # Primary: $REWARD_FILE path
            if os.path.exists(reward_host_path):
                reward = open(reward_host_path).read().strip()
                container.remove(force=True)
                return (1 if reward == "1" else 0), None

            # Fallback: CWD reward.txt via docker cp
            try:
                bits, _ = container.get_archive(f"{working_dir}/reward.txt")
                tar_bytes = b"".join(bits)
                with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tar:
                    member = tar.getmember("reward.txt")
                    reward = tar.extractfile(member).read().decode().strip()
                container.remove(force=True)
                return (1 if reward == "1" else 0), None
            except Exception:
                pass

            container.remove(force=True)
            return 0, "reward.txt not written by test.sh"

        except Exception as e:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass
            else:
                _force_remove_container(container_name)
            return 0, str(e)


# ── Utility ───────────────────────────────────────────────────────────────────


def _force_remove_container(name: str) -> None:
    try:
        client = _docker_client()
        c = client.containers.get(name)
        c.remove(force=True)
    except Exception:
        pass


def unzip_task(zip_path: str, dest_dir: str) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        if not names:
            raise ValueError("ZIP is empty")
        roots = {n.split("/")[0] for n in names if n.strip()}
        if len(roots) != 1:
            raise ValueError(
                f"ZIP must have exactly one top-level directory. Found: {roots}"
            )
        zf.extractall(dest_dir)
        return os.path.join(dest_dir, roots.pop())


# ── Docker cleanup helpers ────────────────────────────────────────────────────


def remove_task_image(task_id: str) -> Tuple[bool, str]:
    """
    Remove the Docker image built for a specific task.
    Also prunes unused build cache to prevent disk bloat.
    """
    tag = _image_tag(task_id)
    client = _docker_client()
    removed = False

    try:
        image = client.images.get(tag)
        client.images.remove(image.id, force=True, noprompt=True)
        removed = True
        _diag(f"Removed Docker image {tag}")
    except ImageNotFound:
        _diag(f"Docker image {tag} not found — nothing to remove")
    except Exception as e:
        return False, f"Failed to remove image {tag}: {e}"

    try:
        client.images.prune(filters={"dangling": True})
        _diag("Pruned dangling Docker images")
    except Exception as e:
        _diag(f"Docker prune warning: {e}")

    if removed:
        return True, f"Removed Docker image {tag} and pruned build cache"
    return True, f"No Docker image found for {tag}"


def prune_docker_system() -> Tuple[int, str]:
    """
    Aggressive Docker system prune.
    Removes all unused containers, networks, images (not just dangling),
    and build cache.
    """
    try:
        client = _docker_client()

        img_report = client.images.prune(filters={"dangling": False})
        images_reclaimed = img_report.get("SpaceReclaimed", 0)

        import subprocess as sp

        sp.run(
            ["docker", "builder", "prune", "--all", "--force"],
            capture_output=True,
            text=True,
            timeout=120,
        )

        ctn_report = client.containers.prune()
        containers_reclaimed = ctn_report.get("SpaceReclaimed", 0)

        total_mb = (images_reclaimed + containers_reclaimed) / (1024 * 1024)
        return 0, (
            f"Docker system prune complete: "
            f"{total_mb:.1f} MB reclaimed, "
            f"build cache pruned"
        )
    except Exception as e:
        return 1, f"Docker system prune failed: {e}"


def _cleanup_task_image(task_id: str) -> None:
    """
    Remove the task image and prune dangling layers immediately after use.
    Called after oracle/nop (last stage needing the image) and on CI build failure.
    Swallows all errors — cleanup must never crash the pipeline.
    """
    tag = _image_tag(task_id)
    try:
        client = _docker_client()
        try:
            image = client.images.get(tag)
            client.images.remove(image.id, force=True, noprune=False)
            _diag(f"[cleanup] Removed task image {tag}")
        except ImageNotFound:
            pass  # already gone, nothing to do
        # Prune dangling layers left behind by the removed image
        client.images.prune(filters={"dangling": True})
        _diag(f"[cleanup] Pruned dangling layers after {tag}")
    except Exception as e:
        _diag(f"[cleanup] Warning: could not remove image {tag}: {e}")
