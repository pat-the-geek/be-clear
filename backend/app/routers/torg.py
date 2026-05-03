from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import Torg, Org, User
from app.models.object import Cla
from app.services.log import write_log

router = APIRouter()


# ─── Schémas Pydantic ────────────────────────────────────────

class TorgCreate(BaseModel):
    nom: str
    cla_id: Optional[int] = None   # si absent → CLA créée automatiquement
    parent_id: Optional[int] = None


class TorgUpdate(BaseModel):
    nom: Optional[str] = None
    cla_id: Optional[int] = None
    parent_id: Optional[int] = None


# ─── Nœud d'arborescence ─────────────────────────────────────

def _build_tree(nodes: list[Torg], parent_id: int | None = None) -> list[dict]:
    """Construit récursivement l'arbre des TORG en mémoire."""
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


def _torg_to_dict(t: Torg) -> dict:
    return {
        "id": t.id,
        "nom": t.nom,
        "chemin": t.chemin,
        "cla_id": t.cla_id,
        "cla_nom": t.cla.nom if t.cla else None,
        "parent_id": t.parent_id,
    }


# ─── GET /torg ───────────────────────────────────────────────

@router.get("")
async def list_torg(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Liste plate de tous les TORG."""
    result = await db.execute(
        select(Torg).options(joinedload(Torg.cla)).order_by(Torg.nom)
    )
    torg_list = result.unique().scalars().all()
    return [_torg_to_dict(t) for t in torg_list]


# ─── GET /torg/tree ──────────────────────────────────────────

@router.get("/tree")
async def torg_tree(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Arborescence récursive des TORG — construite en mémoire."""
    result = await db.execute(
        select(Torg).options(joinedload(Torg.cla)).order_by(Torg.nom)
    )
    all_torg = result.unique().scalars().all()
    return _build_tree(all_torg, parent_id=None)


# ─── POST /torg ──────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_torg(
    body: TorgCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Crée un nouveau TORG. Réservé aux ADMIN."""
    # Vérifier le parent s'il est fourni
    if body.parent_id is not None:
        parent = await db.get(Torg, body.parent_id)
        if parent is None:
            raise HTTPException(status_code=400, detail="TORG parent introuvable")

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

    torg = Torg(
        nom=body.nom,
        cla_id=cla_id,
        parent_id=body.parent_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(torg)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="torg", entite_id=torg.id,
                    apres={"nom": body.nom, "cla_id": body.cla_id, "parent_id": body.parent_id})
    await db.commit()

    result = await db.execute(
        select(Torg).options(joinedload(Torg.cla)).where(Torg.id == torg.id)
    )
    return _torg_to_dict(result.unique().scalar_one())


# ─── PUT /torg/{id} ──────────────────────────────────────────

@router.put("/{torg_id}")
async def update_torg(
    torg_id: int,
    body: TorgUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Met à jour un TORG. Réservé aux ADMIN."""
    result = await db.execute(
        select(Torg).options(joinedload(Torg.cla)).where(Torg.id == torg_id)
    )
    torg = result.unique().scalar_one_or_none()
    if torg is None:
        raise HTTPException(status_code=404, detail="TORG introuvable")

    avant = {"nom": torg.nom, "cla_id": torg.cla_id, "parent_id": torg.parent_id}

    if body.nom is not None:
        torg.nom = body.nom
    if body.cla_id is not None:
        cla = await db.get(Cla, body.cla_id)
        if cla is None:
            raise HTTPException(status_code=400, detail="CLA introuvable")
        torg.cla_id = body.cla_id
    if body.parent_id is not None:
        if body.parent_id == torg_id:
            raise HTTPException(status_code=400, detail="Un TORG ne peut pas être son propre parent")
        parent = await db.get(Torg, body.parent_id)
        if parent is None:
            raise HTTPException(status_code=400, detail="TORG parent introuvable")
        torg.parent_id = body.parent_id
    elif "parent_id" in body.model_fields_set:
        # parent_id explicitement passé à None — détachement
        torg.parent_id = None

    torg.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="torg", entite_id=torg_id, avant=avant,
                    apres={"nom": torg.nom, "cla_id": torg.cla_id, "parent_id": torg.parent_id})
    await db.commit()

    result = await db.execute(
        select(Torg).options(joinedload(Torg.cla)).where(Torg.id == torg_id)
    )
    return _torg_to_dict(result.unique().scalar_one())


# ─── DELETE /torg/{id} ───────────────────────────────────────

@router.delete("/{torg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_torg(
    torg_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Supprime un TORG. Bloque si des ORG y sont rattachées. Réservé aux ADMIN."""
    result = await db.execute(select(Torg).where(Torg.id == torg_id))
    torg = result.scalar_one_or_none()
    if torg is None:
        raise HTTPException(status_code=404, detail="TORG introuvable")

    # Bloquer si des ORG utilisent ce TORG
    orgs_result = await db.execute(select(Org).where(Org.torg_id == torg_id).limit(1))
    if orgs_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce TORG : des ORG y sont rattachées",
        )

    # Bloquer si des sous-TORG existent
    enfants_result = await db.execute(select(Torg).where(Torg.parent_id == torg_id).limit(1))
    if enfants_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer ce TORG : il possède des sous-types",
        )

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="torg", entite_id=torg_id,
                    avant={"nom": torg.nom, "cla_id": torg.cla_id})
    await db.delete(torg)
    await db.commit()
