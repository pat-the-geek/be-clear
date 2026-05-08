from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import Teng, Eng, Tevent, TengTeventTemplate, User
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


def _template_to_dict(tmpl: TengTeventTemplate) -> dict:
    return {
        "id": tmpl.id,
        "teng_id": tmpl.teng_id,
        "tevent_id": tmpl.tevent_id,
        "ordre": tmpl.ordre,
        "tevent_nom": tmpl.tevent.nom if tmpl.tevent else None,
        "tevent_duree_valeur": float(tmpl.tevent.duree_prevue_valeur) if tmpl.tevent and tmpl.tevent.duree_prevue_valeur else None,
        "tevent_duree_unite": tmpl.tevent.duree_prevue_unite if tmpl.tevent else None,
    }


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
    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="teng", entite_id=teng.id,
                    apres={"nom": body.nom, "cla_id": body.cla_id})
    await db.commit()
    result = await db.execute(
        select(Teng).options(joinedload(Teng.cla)).where(Teng.id == teng.id)
    )
    return _teng_to_dict(result.unique().scalar_one())


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
    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="teng", entite_id=teng_id,
                    apres={"nom": teng.nom, "cla_id": teng.cla_id})
    await db.commit()
    result = await db.execute(
        select(Teng).options(joinedload(Teng.cla)).where(Teng.id == teng_id)
    )
    return _teng_to_dict(result.unique().scalar_one())


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

    # RF-08 : bloquer si des ENG utilisent ce TENG
    eng_result = await db.execute(select(Eng).where(Eng.teng_id == teng_id).limit(1))
    if eng_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="RF-08 : impossible de supprimer ce TENG — des ENG lui sont rattachés",
        )

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="teng", entite_id=teng_id,
                    avant={"nom": teng.nom, "cla_id": teng.cla_id})
    await db.delete(teng)
    await db.commit()


# ─── Templates TEVENT d'un TENG ──────────────────────────────

class TemplateAdd(BaseModel):
    tevent_id: int


class TemplateReorder(BaseModel):
    ordre: list[int]  # liste ordonnée des template_id


async def _load_templates(db: AsyncSession, teng_id: int) -> list[TengTeventTemplate]:
    result = await db.execute(
        select(TengTeventTemplate)
        .options(joinedload(TengTeventTemplate.tevent))
        .where(TengTeventTemplate.teng_id == teng_id)
        .order_by(TengTeventTemplate.ordre)
    )
    return result.unique().scalars().all()


@router.get("/{teng_id}/templates")
async def list_templates(
    teng_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    teng = await db.get(Teng, teng_id)
    if teng is None:
        raise HTTPException(status_code=404, detail="TENG introuvable")
    templates = await _load_templates(db, teng_id)
    return [_template_to_dict(t) for t in templates]


@router.post("/{teng_id}/templates", status_code=status.HTTP_201_CREATED)
async def add_template(
    teng_id: int,
    body: TemplateAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    teng = await db.get(Teng, teng_id)
    if teng is None:
        raise HTTPException(status_code=404, detail="TENG introuvable")
    tevent = await db.get(Tevent, body.tevent_id)
    if tevent is None:
        raise HTTPException(status_code=400, detail="TEVENT introuvable")

    # Calcul du prochain ordre
    existing = await _load_templates(db, teng_id)
    next_ordre = max((t.ordre for t in existing), default=-1) + 1

    tmpl = TengTeventTemplate(
        teng_id=teng_id,
        tevent_id=body.tevent_id,
        ordre=next_ordre,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(tmpl)
    await db.flush()
    await db.refresh(tmpl)
    # Charger la relation tevent
    result = await db.execute(
        select(TengTeventTemplate)
        .options(joinedload(TengTeventTemplate.tevent))
        .where(TengTeventTemplate.id == tmpl.id)
    )
    tmpl = result.unique().scalar_one()
    await db.commit()
    return _template_to_dict(tmpl)


@router.delete("/{teng_id}/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    teng_id: int,
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(TengTeventTemplate).where(
            TengTeventTemplate.id == template_id,
            TengTeventTemplate.teng_id == teng_id,
        )
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None:
        raise HTTPException(status_code=404, detail="Template introuvable")
    await db.delete(tmpl)

    # Renumérote les ordres restants
    remaining = await _load_templates(db, teng_id)
    for i, t in enumerate(remaining):
        t.ordre = i
    await db.commit()


@router.put("/{teng_id}/templates/reorder", status_code=status.HTTP_200_OK)
async def reorder_templates(
    teng_id: int,
    body: TemplateReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """body.ordre = liste ordonnée des template_id → réassigne les ordres 0, 1, 2…"""
    teng = await db.get(Teng, teng_id)
    if teng is None:
        raise HTTPException(status_code=404, detail="TENG introuvable")

    result = await db.execute(
        select(TengTeventTemplate)
        .options(joinedload(TengTeventTemplate.tevent))
        .where(TengTeventTemplate.teng_id == teng_id)
    )
    tmpl_map = {t.id: t for t in result.unique().scalars().all()}

    for tmpl_id in body.ordre:
        if tmpl_id not in tmpl_map:
            raise HTTPException(status_code=400, detail=f"Template {tmpl_id} introuvable")

    # Two-phase update: avoid UNIQUE(teng_id, ordre) conflicts during reorder.
    # Phase 1: shift all orders to a high offset so no two rows share the same value.
    offset = len(tmpl_map) + 1000
    for t in tmpl_map.values():
        t.ordre = offset + t.ordre
    await db.flush()

    # Phase 2: assign final orders 0, 1, 2…
    for i, tmpl_id in enumerate(body.ordre):
        tmpl_map[tmpl_id].ordre = i

    await db.commit()
    templates = await _load_templates(db, teng_id)
    return [_template_to_dict(t) for t in templates]
