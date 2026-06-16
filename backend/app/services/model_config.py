# app/services/model_config.py
#
# Manages which OpenRouter model is assigned to each pipeline role.
# Reads/writes the ModelConfig table in the database.
#
# Keys:
#   "frontier_model"       — the strong model used for difficulty probe (Stage 7)
#   "easiness_model"       — the fast model used for easiness prefilter (Stage 6)
#   "quality_model"        — the model used for quality check (Stage 3)
#   "agent_quality_model"  — the model used for agent quality check (Stage 8)
#
# The admin selects models from the UI; this module provides the DB helpers.

from __future__ import annotations

import sys
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from cuid2 import Cuid

from app.core.config import settings
from app.models.orm import ModelConfig

_cuid = Cuid()

# ── Default model assignments (used when DB has no config yet) ────────────────

DEFAULTS: dict[str, dict[str, str]] = {
    "frontier_model": {
        "modelId": "anthropic/claude-opus-4-20250514",
        "modelName": "Claude Opus 4",
    },
    "easiness_model": {
        "modelId": "anthropic/claude-sonnet-4-20250514",
        "modelName": "Claude Sonnet 4",
    },
    "quality_model": {
        "modelId": "anthropic/claude-sonnet-4-20250514",
        "modelName": "Claude Sonnet 4",
    },
    "agent_quality_model": {
        "modelId": "anthropic/claude-sonnet-4-20250514",
        "modelName": "Claude Sonnet 4",
    },
}

# ── Curated top models for the UI picker ──────────────────────────────────────
# These are the best models available on OpenRouter, pre-filtered for quality.
# The full list is also fetchable from the OpenRouter API.

TOP_MODELS = [
    {"modelId": "anthropic/claude-opus-4-20250514",      "modelName": "Claude Opus 4",          "context": 200000, "pricing": "high"},
    {"modelId": "anthropic/claude-sonnet-4-20250514",     "modelName": "Claude Sonnet 4",         "context": 200000, "pricing": "medium"},
    {"modelId": "anthropic/claude-haiku-3.5",             "modelName": "Claude 3.5 Haiku",        "context": 200000, "pricing": "low"},
    {"modelId": "openai/gpt-4o",                          "modelName": "GPT-4o",                  "context": 128000, "pricing": "medium"},
    {"modelId": "openai/gpt-4o-mini",                     "modelName": "GPT-4o Mini",             "context": 128000, "pricing": "low"},
    {"modelId": "openai/o3-mini",                         "modelName": "o3-mini",                  "context": 200000, "pricing": "medium"},
    {"modelId": "google/gemini-2.5-pro-preview-06-05",    "modelName": "Gemini 2.5 Pro",          "context": 1000000, "pricing": "medium"},
    {"modelId": "google/gemini-2.5-flash-preview-05-20",  "modelName": "Gemini 2.5 Flash",        "context": 1000000, "pricing": "low"},
    {"modelId": "deepseek/deepseek-chat-v3-0324",        "modelName": "DeepSeek V3 (0324)",       "context": 131072, "pricing": "low"},
    {"modelId": "deepseek/deepseek-r1",                  "modelName": "DeepSeek R1",              "context": 131072, "pricing": "low"},
    {"modelId": "meta-llama/llama-4-maverick",           "modelName": "Llama 4 Maverick",        "context": 1000000, "pricing": "low"},
    {"modelId": "meta-llama/llama-4-scout",              "modelName": "Llama 4 Scout",           "context": 1000000, "pricing": "low"},
    {"modelId": "mistralai/mistral-large-2411",          "modelName": "Mistral Large 2",         "context": 128000, "pricing": "medium"},
    {"modelId": "qwen/qwen3-235b-a22b",                  "modelName": "Qwen3 235B",              "context": 131072, "pricing": "low"},
    {"modelId": "x-ai/grok-3",                           "modelName": "Grok 3",                  "context": 131072, "pricing": "medium"},
]


def _log(msg: str) -> None:
    print(f"[MODEL-CONFIG] {msg}", file=sys.stderr, flush=True)


# ── DB helpers ─────────────────────────────────────────────────────────────────

async def get_model_config(
    key: str,
    db: AsyncSession,
) -> Optional[ModelConfig]:
    """Return a single ModelConfig row by key, or None."""
    result = await db.execute(
        select(ModelConfig).where(ModelConfig.key == key)
    )
    return result.scalar_one_or_none()


async def get_all_model_configs(db: AsyncSession) -> dict[str, dict[str, str]]:
    """
    Return all model configs as a dict keyed by role.
    Falls back to DEFAULTS for any missing keys.
    """
    result = await db.execute(select(ModelConfig))
    rows = result.scalars().all()

    configs: dict[str, dict[str, str]] = {}
    for row in rows:
        configs[row.key] = {
            "modelId": row.modelId,
            "modelName": row.modelName,
        }

    # Fill in defaults for missing keys
    for key, default in DEFAULTS.items():
        if key not in configs:
            configs[key] = default

    return configs


async def set_model_config(
    key: str,
    model_id: str,
    model_name: str,
    db: AsyncSession,
) -> ModelConfig:
    """
    Upsert a model config entry. Creates or updates.
    """
    existing = await get_model_config(key, db)

    if existing:
        existing.modelId = model_id
        existing.modelName = model_name
        existing.updatedAt = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        _log(f"Updated {key} → {model_id} ({model_name})")
        return existing
    else:
        row = ModelConfig(
            id=_cuid.generate(),
            key=key,
            modelId=model_id,
            modelName=model_name,
            updatedAt=datetime.now(timezone.utc),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        _log(f"Created {key} → {model_id} ({model_name})")
        return row


async def get_model_for_role(role: str, db: AsyncSession) -> tuple[str, str]:
    """
    Convenience helper: returns (model_id, provider) for the given role.
    Always returns provider="openrouter".
    Falls back to DEFAULTS if no DB config exists.
    """
    config = await get_model_config(role, db)
    if config:
        return config.modelId, "openrouter"

    default = DEFAULTS.get(role)
    if default:
        return default["modelId"], "openrouter"

    # Ultimate fallback
    return "anthropic/claude-sonnet-4-20250514", "openrouter"


# ── OpenRouter API helpers ────────────────────────────────────────────────────

async def fetch_openrouter_models() -> list[dict]:
    """
    Fetch available models from the OpenRouter API.
    Returns a simplified list with id, name, context length, and pricing info.
    """
    api_key = settings.OPENROUTER_API_KEY
    if not api_key:
        _log("No OPENROUTER_API_KEY configured — returning curated list only")
        return TOP_MODELS

    url = "https://openrouter.ai/api/v1/models"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        models = data.get("data", [])

        # Simplify and filter to useful models
        result = []
        for m in models:
            model_id = m.get("id", "")
            name = m.get("name", model_id)
            context = m.get("context_length", 0)
            pricing = m.get("pricing", {})
            prompt_price = float(pricing.get("prompt", "0") or "0")

            # Classify pricing tier
            if prompt_price == 0:
                tier = "free"
            elif prompt_price < 0.000003:
                tier = "low"
            elif prompt_price < 0.00003:
                tier = "medium"
            else:
                tier = "high"

            result.append({
                "modelId": model_id,
                "modelName": name,
                "context": context,
                "pricing": tier,
                "promptPrice": prompt_price,
            })

        # Sort: free first, then by pricing tier, then by name
        tier_order = {"free": 0, "low": 1, "medium": 2, "high": 3}
        result.sort(key=lambda x: (tier_order.get(x["pricing"], 3), x["modelName"]))

        _log(f"Fetched {len(result)} models from OpenRouter API")
        return result

    except Exception as exc:
        _log(f"Failed to fetch OpenRouter models: {exc} — returning curated list")
        return TOP_MODELS