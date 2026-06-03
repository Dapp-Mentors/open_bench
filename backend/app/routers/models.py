from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cuid2 import Cuid

_cuid_generator = Cuid()

from app.core.database import get_db
from app.models.orm import Model
from app.schemas.schemas import ModelCreate, ModelRead

router = APIRouter()


@router.get("/", response_model=list[ModelRead])
async def list_models(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Model).order_by(Model.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=ModelRead, status_code=201)
async def create_model(payload: ModelCreate, db: AsyncSession = Depends(get_db)):
    model = Model(id=_cuid_generator.generate(), **payload.model_dump())
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return model


@router.get("/{model_id}", response_model=ModelRead)
async def get_model(model_id: str, db: AsyncSession = Depends(get_db)):
    model = await db.get(Model, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: str, db: AsyncSession = Depends(get_db)):
    model = await db.get(Model, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(model)
    await db.commit()
