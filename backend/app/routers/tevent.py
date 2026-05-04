"""Router TEVENT — gestion des types d'EVENT (lecture : tous, écriture : ADMIN)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import Tevent, User
from app.models.object import Cla
from app.services.log import write_log

router = APIRouter()


# ─── Schémas ──────────────────────────���──────────────────────

class TeventCreate(BaseModel):
    nom: str
    cla_id: int
    duree_prevue_valeur: Optional[float] = None
    duree_prevue_unite: Optional[str] = None  # secondes|minutes|heures|jours|mois


class TeventUpdate(BaseModel):
    nom: Optional[str] = None
    cla_id: Optional[int] = None
    duree_prevue_valeur: Optional[float] = None
    duree_prevue_unite: Optional[str] = None


def _tevent_to_dict(t: Tevent) -> dict:
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
        "duree_prevue_valeur": float(t.duree_prevue_valeur) if t.duree_prevue_valeur is not None else None,
        "duree_prevue_unite": t.duree_prevue_unite,
    }


# ─── GET /tevent ────────────────────────────────────────��────

@router.get("")
async def list_tevents(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tevent).options(joinedload(Tevent.cla)).order_by(Tevent.nom)
    )
    return [_tevent_to_dict(t) for t in result.unique().scalars().all()]


# ─── GET /tevent/{id} ────────────────────────────────────────

@router.get("/{tevent_id}")
async def get_tevent(
    tevent_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tevent).options(joinedload(Tevent.cla)).where(Tevent.id == tevent_id)
    )
    tevent = result.unique().scalar_one_or_none()
    if tevent is None:
        raise HTTPException(status_code=404, detail="TEVENT introuvable")
    return _tevent_to_dict(tevent)


# ─── POST /tevent ───────────────────────────────��────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tevent(
    body: TeventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cla = await db.get(Cla, body.cla_id)
    if cla is None:
        raise HTTPException(status_code=400, detail="CLA introuvable")
    tevent = Tevent(
        nom=body.nom,
        cla_id=body.cla_id,
        duree_prevue_valeur=body.duree_prevue_valeur,
        duree_prevue_unite=body.duree_prevue_unite,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(tevent)
    await db.flush()
    await db.refresh(tevent, ["cla"])
    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="tevent", entite_id=tevent.id,
                    apres={"nom": body.nom, "cla_id": body.cla_id})
    await db.commit()
    await db.refresh(tevent, ["cla"])
    return _tevent_to_dict(tevent)


# ─── PUT /tevent/{id} ────────────────────────────────────���───

@router.put("/{tevent_id}")
async def update_tevent(
    tevent_id: int,
    body: TeventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(Tevent).options(joinedload(Tevent.cla)).where(Tevent.id == tevent_id)
    )
    tevent = result.unique().scalar_one_or_none()
    if tevent is None:
        raise HTTPException(status_code=404, detail="TEVENT introuvable")
    avant = {"nom": tevent.nom}
    if body.nom is not None:
        tevent.nom = body.nom
    if body.cla_id is not None:
        tevent.cla_id = body.cla_id
    if body.duree_prevue_valeur is not None:
        tevent.duree_prevue_valeur = body.duree_prevue_valeur
    if body.duree_prevue_unite is not None:
        tevent.duree_prevue_unite = body.duree_prevue_unite
    tevent.updated_by_id = current_user.id
    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="tevent", entite_id=tevent_id,
                    avant=avant, apres={"nom": tevent.nom})
    await db.commit()
    await db.refresh(tevent, ["cla"])
    return _tevent_to_dict(tevent)


# ─── DELETE /tevent/{id} ──────────────────────────���──────────

@router.delete("/{tevent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tevent(
    tevent_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Tevent).where(Tevent.id == tevent_id))
    tevent = result.scalar_one_or_none()
    if tevent is None:
        raise HTTPException(status_code=404, detail="TEVENT introuvable")
    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="tevent", entite_id=tevent_id,
                    avant={"nom": tevent.nom})
    await db.delete(tevent)
    await db.commit()
