from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import Tenv, Env, User
from app.models.object import Cla
from app.services.log import write_log

router = APIRouter()


# ─── Schémas Pydantic ────────────────────────────────────────

class TenvCreate(BaseModel):
    nom: str
    cla_id: Optional[int] = None   # si absent → CLA créée automatiquement
    parent_id: Optional[int] = None


class TenvUpdate(BaseModel):
    nom: Optional[str] = None
    cla_id: Optional[int] = None
    parent_id: Optional[int] = None


# ─── Nœud d'arborescence ─────────────────────────────────────

def _build_tree(nodes: list[Tenv], parent_id: int | None = None) -> list[dict]:
    """Construit récursivement l'arbre des TENV en mémoire."""
    result = []
    for node in nodes:
        if node.parent_id == parent_id:
            enfants = _build_tree(nodes, parent_id=node.id)
            result.append({
                "id": node.id,
                "nom": node.nom,
                "chemin": node.chemin,
                "cla_id": node.cla_id,
                "cla": {
                    "id": node.cla.id,
                    "nom": node.cla.nom,
                    "visuel_type": node.cla.visuel_type,
                    "visuel_valeur": node.cla.visuel_valeur,
                } if node.cla else None,
                "parent_id": node.parent_id,
                "enfants": enfants,
            })
    return result


def _tenv_to_dict(t: Tenv) -> dict:
    return {
        "id": t.id,
        "nom": t.nom,
        "chemin": t.chemin,
        "cla_id": t.cla_id,
        "cla_nom": t.cla.nom if t.cla else None,
        "parent_id": t.parent_id,
    }


# ─── GET /tenv ───────────────────────────────────────────────

@router.get("")
async def list_tenv(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Liste plate de tous les TENV."""
    result = await db.execute(
        select(Tenv).options(joinedload(Tenv.cla)).order_by(Tenv.nom)
    )
    tenv_list = result.unique().scalars().all()
    return [_tenv_to_dict(t) for t in tenv_list]


# ─── GET /tenv/tree ──────────────────────────────────────────

@router.get("/tree")
async def tenv_tree(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Arborescence récursive des TENV — construite en mémoire."""
    result = await db.execute(
        select(Tenv).options(joinedload(Tenv.cla)).order_by(Tenv.nom)
    )
    all_tenv = result.unique().scalars().all()
    return _build_tree(all_tenv, parent_id=None)


# ─── POST /tenv ──────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tenv(
    body: TenvCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Crée un nouveau TENV. Réservé aux ADMIN."""
    # Vérifier le parent s'il est fourni
    if body.parent_id is not None:
        parent = await db.get(Tenv, body.parent_id)
        if parent is None:
            raise HTTPException(status_code=400, detail="TENV parent introuvable")

    # Résoudre ou créer la CLA associée
    if body.cla_id is not None:
        cla = await db.get(Cla, body.cla_id)
        if cla is None:
            raise HTTPException(status_code=400, detail="CLA introuvable")
        cla_id = body.cla_id
    else:
        # Auto-création : réutiliser si une CLA du même nom existe déjà
        cla_result = await db.execute(select(Cla).where(Cla.nom == body.nom))
        cla = cla_result.scalar_one_or_none()
        if cla is None:
            cla = Cla(nom=body.nom, created_by_id=current_user.id, updated_by_id=current_user.id)
            db.add(cla)
            await db.flush()
        cla_id = cla.id

    tenv = Tenv(
        nom=body.nom,
        cla_id=cla_id,
        parent_id=body.parent_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(tenv)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="tenv", entite_id=tenv.id,
                    apres={"nom": body.nom, "cla_id": body.cla_id, "parent_id": body.parent_id})
    await db.commit()

    result = await db.execute(
        select(Tenv).options(joinedload(Tenv.cla)).where(Tenv.id == tenv.id)
    )
    return _tenv_to_dict(result.unique().scalar_one())


# ─── PUT /tenv/{id} ──────────────────────────────────────────

@router.put("/{tenv_id}")
async def update_tenv(
    tenv_id: int,
    body: TenvUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Met à jour un TENV. Réservé aux ADMIN."""
    result = await db.execute(
        select(Tenv).options(joinedload(Tenv.cla)).where(Tenv.id == tenv_id)
    )
    tenv = result.unique().scalar_one_or_none()
    if tenv is None:
        raise HTTPException(status_code=404, detail="TENV introuvable")

    avant = {"nom": tenv.nom, "cla_id": tenv.cla_id, "parent_id": tenv.parent_id}

    if body.nom is not None:
        tenv.nom = body.nom
    if body.cla_id is not None:
        cla = await db.get(Cla, body.cla_id)
        if cla is None:
            raise HTTPException(status_code=400, detail="CLA introuvable")
        tenv.cla_id = body.cla_id
    if body.parent_id is not None:
        if body.parent_id == tenv_id:
            raise HTTPException(status_code=400, detail="Un TENV ne peut pas être son propre parent")
        parent = await db.get(Tenv, body.parent_id)
        if parent is None:
            raise HTTPException(status_code=400, detail="TENV parent introuvable")
        tenv.parent_id = body.parent_id
    elif "parent_id" in body.model_fields_set:
        # parent_id explicitement passé à None — détachement
        tenv.parent_id = None

    tenv.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="tenv", entite_id=tenv_id, avant=avant,
                    apres={"nom": tenv.nom, "cla_id": tenv.cla_id, "parent_id": tenv.parent_id})
    await db.commit()

    result = await db.execute(
        select(Tenv).options(joinedload(Tenv.cla)).where(Tenv.id == tenv_id)
    )
    return _tenv_to_dict(result.unique().scalar_one())


# ─── DELETE /tenv/{id} ───────────────────────────────────────

@router.delete("/{tenv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenv(
    tenv_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Supprime un TENV. Bloque si des ENV y sont rattachées. Réservé aux ADMIN."""
    result = await db.execute(select(Tenv).where(Tenv.id == tenv_id))
    tenv = result.scalar_one_or_none()
    if tenv is None:
        raise HTTPException(status_code=404, detail="TENV introuvable")

    # Bloquer si des ENV utilisent ce TENV
    envs_result = await db.execute(select(Env).where(Env.tenv_id == tenv_id).limit(1))
    if envs_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce TENV : des ENV y sont rattachées",
        )

    # Bloquer si des sous-TENV existent
    enfants_result = await db.execute(select(Tenv).where(Tenv.parent_id == tenv_id).limit(1))
    if enfants_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce TENV : il possède des sous-types",
        )

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="tenv", entite_id=tenv_id,
                    avant={"nom": tenv.nom, "cla_id": tenv.cla_id})
    await db.delete(tenv)
    await db.commit()
