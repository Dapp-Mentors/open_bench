# app/services/llm.py
#
# Async helpers for LLM chat completions and embeddings.
# All config (URLs, keys, model names) is read exclusively from `settings`,
# which in turn reads from the .env file — nothing is hardcoded here.
#
# Chat:       OpenRouter /chat/completions endpoint (sole LLM provider)
#             Supports DeepSeek, Claude, GPT, Gemini, Llama, Mistral, etc.
#
# Embeddings: Ollama /api/embed using OLLAMA_BASE_URL + OLLAMA_EMBED_MODEL
#             (nomic-embed-text:latest by default, no API key required)

from __future__ import annotations

import asyncio
import sys
from typing import Any

import httpx

from app.core.config import settings

_CONNECT_TIMEOUT = 10.0
_CHAT_TIMEOUT    = 120.0
_EMBED_TIMEOUT   = 30.0

# Retry configuration for transient errors (429, 5xx)
_MAX_RETRIES     = 3
_RETRY_BASE_DELAY = 2.0  # seconds; doubles on each retry


# ── Chat completion ───────────────────────────────────────────────────────────

async def chat_completion(
    *,
    system: str,
    user: str,
    provider: str | None = None,
    model_id: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1024,
    response_format: dict[str, Any] | None = None,
) -> str | None:
    """
    Call the configured chat/completions endpoint and return the assistant text.

    model_id  — the OpenRouter model slug (e.g. "anthropic/claude-sonnet-4-20250514")
    All other config comes from settings / .env.

    Retries automatically on transient errors (429 Too Many Requests, 5xx)
    with exponential back-off up to _MAX_RETRIES attempts.
    Returns None if the response content is null/empty after all retries.
    """
    base_url = settings.llm_base_url(provider)
    api_key  = settings.llm_api_key(provider)
    model    = model_id

    if not model:
        raise RuntimeError(
            "No model_id provided. Each LLM call must specify a model."
        )

    if not api_key:
        raise RuntimeError(
            "No OpenRouter API key configured. "
            "Set it via the setup wizard at /setup."
        )

    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]

    payload: dict[str, Any] = {
        "model":       model,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://openbench.internal",
        "X-Title":       "OpenBench",
    }

    url = f"{base_url.rstrip('/')}/chat/completions"

    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(_CHAT_TIMEOUT, connect=_CONNECT_TIMEOUT)
            ) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()

            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return content
            # content is None/empty — not retryable, just return None
            _llm_log(f"LLM returned empty content for model={model}")
            return None

        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            status = getattr(exc, "response", None)
            status_code = status.status_code if status is not None else None
            retryable = (
                status_code == 429
                or (status_code is not None and status_code >= 500)
                or isinstance(exc, httpx.RequestError)
            )
            if retryable and attempt < _MAX_RETRIES - 1:
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                # honour Retry-After header from 429 responses
                if status_code == 429 and status is not None:
                    retry_after = status.headers.get("Retry-After")
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except (ValueError, TypeError):
                            pass
                _llm_log(
                    f"LLM retry {attempt + 1}/{_MAX_RETRIES}: "
                    f"status={status_code} model={model} — waiting {delay:.1f}s"
                )
                await asyncio.sleep(delay)
            else:
                raise

    # Should not reach here, but safety net
    raise last_exc  # type: ignore[misc]


def _llm_log(msg: str) -> None:
    print(f"[LLM] {msg}", file=sys.stderr, flush=True)


# ── Embeddings via Ollama ─────────────────────────────────────────────────────

async def get_embedding(text: str) -> list[float]:
    """
    Embed `text` using Ollama's /api/embed endpoint.

    URL   → settings.OLLAMA_BASE_URL  (from OLLAMA_BASE_URL in .env)
    Model → settings.OLLAMA_EMBED_MODEL (from OLLAMA_EMBED_MODEL in .env,
            default: nomic-embed-text:latest)

    Ollama requires no API key.
    """
    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/embed"
    payload = {
        "model": settings.OLLAMA_EMBED_MODEL,
        "input": text,
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(_EMBED_TIMEOUT, connect=_CONNECT_TIMEOUT)
    ) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    # Ollama /api/embed returns {"embeddings": [[...float...]]}
    embeddings = data.get("embeddings")
    if not embeddings or not embeddings[0]:
        raise RuntimeError(
            f"Ollama /api/embed returned an empty response for model "
            f"'{settings.OLLAMA_EMBED_MODEL}'. "
            f"Is the model pulled? Run: ollama pull {settings.OLLAMA_EMBED_MODEL}"
        )

    return embeddings[0]