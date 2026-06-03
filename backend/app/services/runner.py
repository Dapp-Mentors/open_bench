"""
runner.py
─────────
Executes a benchmark Run against the configured model provider.
Yields log lines (strings) as it progresses so the caller can stream them.

Providers currently scaffolded:
  - ollama   → local Ollama instance
  - openai   → OpenAI-compatible REST endpoint
  - echo     → dummy provider for testing (no external call)

Add new providers by implementing the `_run_<provider>` pattern below.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.orm import Run, RunStatus, Model, Task


async def execute_run(
    run: Run,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """
    Drive a Run to completion.  Yields human-readable log lines.
    Updates run.status / run.score / run.output / run.logs in the DB.
    """
    # ── load relations ──────────────────────────────────────────────
    model: Model = await db.get(Model, run.model_id)
    task: Task   = await db.get(Task,  run.task_id)

    logs: list[str] = []

    def emit(line: str) -> str:
        logs.append(line)
        return line

    # ── mark as running ─────────────────────────────────────────────
    run.status     = RunStatus.RUNNING
    run.started_at = datetime.now(timezone.utc)
    await db.commit()

    yield emit(f"[runner] starting run {run.id}")
    yield emit(f"[runner] model={model.name}  provider={model.provider}")
    yield emit(f"[runner] task={task.name}")
    yield emit(f"[runner] prompt → {task.prompt[:120]}{'…' if len(task.prompt) > 120 else ''}")

    try:
        provider = model.provider.lower()

        if provider == "ollama":
            output = await _run_ollama(model, task, logs, emit)
        elif provider in ("openai", "mistral", "phi2", "llama3"):
            output = await _run_openai_compat(model, task, logs, emit)
        elif provider == "echo":
            output = await _run_echo(model, task, logs, emit)
        else:
            raise ValueError(f"Unknown provider: {provider!r}")

        score = _score(task.prompt, output)

        yield emit(f"[scorer] raw score = {score:.4f}")

        run.status   = RunStatus.COMPLETED
        run.output   = output
        run.score    = score

    except Exception as exc:
        yield emit(f"[runner] ERROR: {exc}")
        run.status = RunStatus.FAILED

    finally:
        run.ended_at = datetime.now(timezone.utc)
        run.logs     = logs
        await db.commit()

    yield emit(f"[runner] finished — status={run.status}")


# ── Provider implementations ────────────────────────────────────────────────

async def _run_ollama(
    model: Model,
    task: Task,
    logs: list[str],
    emit,
) -> str:
    base_url   = (model.config or {}).get("base_url", settings.OLLAMA_BASE_URL)
    model_name = (model.config or {}).get("model", model.name)

    emit(f"[ollama] calling {base_url}/api/generate  model={model_name}")

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{base_url}/api/generate",
            json={"model": model_name, "prompt": task.prompt, "stream": False},
        )
        response.raise_for_status()
        data = response.json()

    output = data.get("response", "")
    emit(f"[ollama] received {len(output)} chars")
    return output


async def _run_openai_compat(
    model: Model,
    task: Task,
    logs: list[str],
    emit,
) -> str:
    cfg        = model.config or {}
    base_url   = cfg.get("base_url", settings.OPENAI_BASE_URL)
    api_key    = cfg.get("api_key",  settings.OPENAI_API_KEY)
    model_name = cfg.get("model",    model.name)

    emit(f"[openai-compat] calling {base_url}/chat/completions  model={model_name}")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json={
                "model": model_name,
                "messages": [{"role": "user", "content": task.prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()

    output = data["choices"][0]["message"]["content"]
    emit(f"[openai-compat] received {len(output)} chars")
    return output


async def _run_echo(
    model: Model,
    task: Task,
    logs: list[str],
    emit,
) -> str:
    """Dummy provider — echoes the prompt back. Useful for testing the pipeline."""
    emit("[echo] simulating model response…")
    await asyncio.sleep(0.5)
    output = f"ECHO: {task.prompt}"
    emit(f"[echo] done")
    return output


# ── Scoring ──────────────────────────────────────────────────────────────────

def _score(prompt: str, output: str) -> float:
    """
    Placeholder scorer — replace with your real evaluation logic.
    Currently returns the ratio of output length to prompt length, clamped to [0, 1].
    """
    if not output:
        return 0.0
    return min(len(output) / max(len(prompt), 1), 1.0)
