# app/routers/model_config.py
#
# API endpoints for managing which OpenRouter model is assigned to each
# pipeline role (frontier, easiness, quality, agent quality).
#
# GET  /api/models/config          — current model assignments
# POST /api/models/config          — update a single model assignment
# GET  /api/models/openrouter      — fetch available models from OpenRouter

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.schemas import ModelConfigRead, ModelConfigUpdate, OpenRouterModelsResponse
from app.services import model_config as svc

router = APIRouter()


@router.get("/config")
async def get_configs(db: AsyncSession = Depends(get_db)):
    """Return all model assignments (with defaults for unconfigured roles)."""
    configs = await svc.get_all_model_configs(db)

    result = []
    for key, info in configs.items():
        result.append({
            "key": key,
            "modelId": info["modelId"],
            "modelName": info["modelName"],
        })

    return result


@router.post("/config")
async def update_config(body: ModelConfigUpdate, db: AsyncSession = Depends(get_db)):
    """Update a single model assignment."""
    valid_keys = {"frontier_model", "easiness_model", "quality_model", "agent_quality_model"}
    if body.key not in valid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid key '{body.key}'. Must be one of: {', '.join(sorted(valid_keys))}"
        )

    row = await svc.set_model_config(
        key=body.key,
        model_id=body.modelId,
        model_name=body.modelName,
        db=db,
    )

    return {
        "key": row.key,
        "modelId": row.modelId,
        "modelName": row.modelName,
        "updatedAt": row.updatedAt.isoformat() if row.updatedAt else None,
    }


@router.get("/openrouter")
async def list_openrouter_models():
    """
    Fetch available models from OpenRouter.
    Falls back to curated list if the API is unreachable.
    """
    models = await svc.fetch_openrouter_models()
    return models