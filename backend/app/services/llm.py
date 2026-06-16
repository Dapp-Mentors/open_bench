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

from typing import Any

import httpx

from app.core.config import settings

_CONNECT_TIMEOUT = 10.0
_CHAT_TIMEOUT    = 120.0
_EMBED_TIMEOUT   = 30.0


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
) -> str:
    """
    Call the configured chat/completions endpoint and return the assistant text.

    model_id  — the OpenRouter model slug (e.g. "anthropic/claude-sonnet-4-20250514")
    All other config comes from settings / .env.
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
            "No OPENROUTER_API_KEY configured. "
            "Set OPENROUTER_API_KEY in your .env file."
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

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(_CHAT_TIMEOUT, connect=_CONNECT_TIMEOUT)
    ) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    return data["choices"][0]["message"]["content"]


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