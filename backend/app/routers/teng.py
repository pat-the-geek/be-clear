from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import Teng, User
from app.models.object import Cla
from app.services.log import write_log

router = APIRouter()


# ─── Schémas ─────────────────────────────────────────────────

class TengCreate(BaseModel):
    nom: str
    cla_id: int


class TengUpdate(BaseModel):
    nom: Optional[str] = None
    cla_id: Optional[int] = None


def _teng_to_dict(t: Teng) -> dict:
    return {
        "id": t.id,
        "nom": t.nom,
        "cla_id": t.cla_id,
        "cla": {
            "id": t.cla.id,
            "nom": t.cla.nom,
            "visuel_type": t.cla.visuel_type,
            "visuel_valeur": t.cla.visuel_valeur,
        } if t.cla else None,
    }


# ─── GET /teng ───────────────────────────────────────────────

@router.get("")
async def list_tengs(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Teng).options(joinedload(Teng.cla)).order_by(Teng.nom)
    )
    tengs = result.unique().scalars().all()
    return [_teng_to_dict(t) for t in tengs]


# ─── GET /teng/{id} ──────────────────────────────────────────

@router.get("/{teng_id}")
async def get_teng(
    teng_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Teng).options(joinedload(Teng.cla)).where(Teng.id == teng_id)
    )
    teng = result.unique().scalar_one_or_none()
    if teng is None:
        raise HTTPException(status_code=404, detail="TENG introuvable")
    return _teng_to_dict(teng)


# ─── POST /teng ──────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_teng(
    body: TengCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cla = await db.get(Cla, body.cla_id)
    if cla is None:
        raise HTTPException(status_code=400, detail="CLA introuvable")
    teng = Teng(nom=body.nom, cla_id=body.cla_id, created_by_id=current_user.id, updated_by_id=current_user.id)
    db.add(teng)
    await db.flush()
    await db.refresh(teng, ["cla"])
    await write_log(db, "teng", teng.id, "CREATE", current_user.id)
    await db.commit()
    await db.refresh(teng, ["cla"])
    return _teng_to_dict(teng)


# ─── PUT /teng/{id} ──────────────────────────────────────────

@router.put("/{teng_id}")
async def update_teng(
    teng_id: int,
    body: TengUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(Teng).options(joinedload(Teng.cla)).where(Teng.id == teng_id)
    )
    teng = result.unique().scalar_one_or_none()
    if teng is None:
        raise HTTPException(status_code=404, detail="TENG introuvable")
    if body.nom is not None:
        teng.nom = body.nom
    if body.cla_id is not None:
        teng.cla_id = body.cla_id
    teng.updated_by_id = current_user.id
    await db.flush()
    await write_log(db, "teng", teng.id, "UPDATE", current_user.id)
    await db.commit()
    await db.refresh(teng, ["cla"])
    return _teng_to_dict(teng)


# ─── DELETE /teng/{id} ───────────────────────────────────────

@router.delete("/{teng_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_teng(
    teng_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Teng).where(Teng.id == teng_id))
    teng = result.scalar_one_or_none()
    if teng is None:
        raise HTTPException(status_code=404, detail="TENG introuvable")
    await write_log(db, "teng", teng_id, "DELETE", current_user.id)
    await db.delete(teng)
    await db.commit()
