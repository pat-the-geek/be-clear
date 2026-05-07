"""Router CLA — gestion des classes et de leurs propriétés (ADMIN seulement)."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import User
from app.models.object import Cla, Prop, Obj, Value
from app.services.log import write_log
from app.services.cla_service import refresh_sous_classes

router = APIRouter()


async def _has_cycle(db: AsyncSession, cla_id: int, proposed_super_id: int) -> bool:
    """RF-03 : vérifie qu'assigner proposed_super_id comme parent de cla_id ne crée pas de cycle."""
    current: int | None = proposed_super_id
    visited: set[int] = set()
    while current is not None:
        if current == cla_id:
            return True
        if current in visited:
            break
        visited.add(current)
        row = await db.execute(select(Cla.super_classe_id).where(Cla.id == current))
        current = row.scalar_one_or_none()
    return False


# ─── Schémas ─────────────────────────────────────────────

class PropOut(BaseModel):
    id: int
    nom: str
    type: str
    valeurs_liste: list | None = None
    cla_id: int
    model_config = {"from_attributes": True}


class ClaRef(BaseModel):
    id: int
    nom: str
    model_config = {"from_attributes": True}


class ClaOut(BaseModel):
    id: int
    nom: str
    comportement: str | None = None
    visuel_type: str | None = None
    visuel_valeur: str | None = None
    super_classe_id: int | None = None
    super_classe_nom: str | None = None
    props: list[PropOut] = []
    model_config = {"from_attributes": True}


class ClaDetail(ClaOut):
    """Détail avec props résolues (propres + héritées)."""
    props_heritees: list[PropOut] = []


class ClaCreate(BaseModel):
    nom: str
    comportement: str | None = None
    visuel_type: str | None = None
    visuel_valeur: str | None = None
    super_classe_id: int | None = None


class ClaUpdate(BaseModel):
    nom: str | None = None
    comportement: str | None = None
    visuel_type: str | None = None
    visuel_valeur: str | None = None
    super_classe_id: int | None = None


class PropCreate(BaseModel):
    nom: str
    type: str
    valeurs_liste: list | None = None


class PropUpdate(BaseModel):
    nom: str


# ─── Helpers ─────────────────────────────────────────────

def _cla_options():
    return [
        joinedload(Cla.super_classe),
        selectinload(Cla.props),
    ]


async def _resolve_props(db: AsyncSession, cla: Cla) -> list[Prop]:
    """Résout toutes les PROP d'une CLA (propres + héritées via la chaîne d'héritage)."""
    props: list[Prop] = []
    seen_ids: set[int] = set()
    current = cla

    while current is not None:
        # S'assurer que les props sont chargées
        if not current.props:
            result = await db.execute(
                select(Prop).where(Prop.cla_id == current.id)
            )
            current_props = result.scalars().all()
        else:
            current_props = list(current.props)

        for p in current_props:
            if p.id not in seen_ids:
                props.append(p)
                seen_ids.add(p.id)

        if current.super_classe_id is not None:
            parent_result = await db.execute(
                select(Cla)
                .options(selectinload(Cla.props), joinedload(Cla.super_classe))
                .where(Cla.id == current.super_classe_id)
            )
            current = parent_result.unique().scalar_one_or_none()
        else:
            current = None

    return props


def _cla_to_out(cla: Cla) -> ClaOut:
    return ClaOut(
        id=cla.id,
        nom=cla.nom,
        comportement=cla.comportement,
        visuel_type=cla.visuel_type,
        visuel_valeur=cla.visuel_valeur,
        super_classe_id=cla.super_classe_id,
        super_classe_nom=cla.super_classe.nom if cla.super_classe else None,
        props=list(cla.props),
    )


# ─── GET /cla ─────────────────────────────────────────────

@router.get("")
async def list_clas(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Cla).options(*_cla_options()))
    clas = result.unique().scalars().all()
    return [_cla_to_out(c) for c in clas]


# ─── GET /cla/{id} ────────────────────────────────────────

@router.get("/{cla_id}")
async def get_cla(
    cla_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Cla).options(*_cla_options()).where(Cla.id == cla_id)
    )
    cla = result.unique().scalar_one_or_none()
    if cla is None:
        raise HTTPException(status_code=404, detail="Classe introuvable")

    all_props = await _resolve_props(db, cla)
    own_ids = {p.id for p in cla.props}

    props_propres = [p for p in all_props if p.id in own_ids]
    props_heritees = [p for p in all_props if p.id not in own_ids]

    return ClaDetail(
        id=cla.id,
        nom=cla.nom,
        comportement=cla.comportement,
        visuel_type=cla.visuel_type,
        visuel_valeur=cla.visuel_valeur,
        super_classe_id=cla.super_classe_id,
        super_classe_nom=cla.super_classe.nom if cla.super_classe else None,
        props=props_propres,
        props_heritees=props_heritees,
    )


# ─── POST /cla ────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_cla(
    body: ClaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Vérifier la super-classe si fournie
    if body.super_classe_id is not None:
        super_cla = await db.get(Cla, body.super_classe_id)
        if super_cla is None:
            raise HTTPException(status_code=400, detail="Super-classe introuvable")

    cla = Cla(

        nom=body.nom,
        comportement=body.comportement,
        visuel_type=body.visuel_type,
        visuel_valeur=body.visuel_valeur,
        super_classe_id=body.super_classe_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(cla)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="cla", entite_id=cla.id,
                    apres={"nom": body.nom, "super_classe_id": body.super_classe_id})

    # Mettre à jour sous_classes_ids (soi + ancêtres)
    await refresh_sous_classes(db, cla.id)
    await db.commit()

    result = await db.execute(
        select(Cla).options(*_cla_options()).where(Cla.id == cla.id)
    )
    cla = result.unique().scalar_one()
    return _cla_to_out(cla)


# ─── PUT /cla/{id} ────────────────────────────────────────

@router.put("/{cla_id}")
async def update_cla(
    cla_id: int,
    body: ClaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(Cla).options(*_cla_options()).where(Cla.id == cla_id)
    )
    cla = result.unique().scalar_one_or_none()
    if cla is None:
        raise HTTPException(status_code=404, detail="Classe introuvable")

    avant = {"nom": cla.nom, "super_classe_id": cla.super_classe_id}

    if body.nom is not None:
        cla.nom = body.nom
    if body.comportement is not None:
        cla.comportement = body.comportement
    if body.visuel_type is not None:
        cla.visuel_type = body.visuel_type
    if body.visuel_valeur is not None:
        cla.visuel_valeur = body.visuel_valeur
    if body.super_classe_id is not None:
        super_cla = await db.get(Cla, body.super_classe_id)
        if super_cla is None:
            raise HTTPException(status_code=400, detail="Super-classe introuvable")
        # RF-03 : détecter les cycles
        if await _has_cycle(db, cla_id, body.super_classe_id):
            raise HTTPException(
                status_code=400,
                detail="RF-03 : assigner cette super-classe crée un cycle d'héritage"
            )
        cla.super_classe_id = body.super_classe_id

    cla.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="cla", entite_id=cla_id, avant=avant,
                    apres={"nom": cla.nom, "super_classe_id": cla.super_classe_id})

    # Recalculer sous_classes_ids (la hiérarchie a peut-être changé)
    await refresh_sous_classes(db, cla_id)
    await db.commit()
    await db.refresh(cla)
    return _cla_to_out(cla)


# ─── DELETE /cla/{id} ─────────────────────────────────────

@router.delete("/{cla_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cla(
    cla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """RF-02 : bloqué si des OBJ sont rattachés à cette CLA."""
    cla = await db.get(Cla, cla_id)
    if cla is None:
        raise HTTPException(status_code=404, detail="Classe introuvable")

    # RF-02 : vérifier l'absence d'OBJ rattachés
    count_result = await db.execute(
        select(func.count()).select_from(Obj).where(Obj.cla_id == cla_id)
    )
    count = count_result.scalar_one()
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"RF-02 : impossible de supprimer — {count} objet(s) rattaché(s) à cette classe"
        )

    # RF-04 : récupérer les sous-classes directes avant suppression pour rafraîchir leur cache
    children_result = await db.execute(
        select(Cla.id).where(Cla.super_classe_id == cla_id)
    )
    child_ids = [r[0] for r in children_result.all()]

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="cla", entite_id=cla_id,
                    avant={"nom": cla.nom})
    await db.delete(cla)
    await db.flush()

    # RF-04 : rafraîchir le cache sous_classes_ids des anciennes sous-classes (maintenant racines)
    for child_id in child_ids:
        await refresh_sous_classes(db, child_id)

    await db.commit()


# ─── GET /cla/{id}/props-all ─────────────────────────────

@router.get("/{cla_id}/props-all", response_model=list[PropOut])
async def get_all_props(
    cla_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Retourne toutes les PROP d'une CLA (directes + héritées via la chaîne d'héritage)."""
    result = await db.execute(
        select(Cla).options(*_cla_options()).where(Cla.id == cla_id)
    )
    cla = result.unique().scalar_one_or_none()
    if cla is None:
        raise HTTPException(status_code=404, detail="Classe introuvable")
    props = await _resolve_props(db, cla)
    return [PropOut.model_validate(p) for p in props]


# ─── GET /cla/{id}/prop ───────────────────────────────────

@router.get("/{cla_id}/prop")
async def list_props(
    cla_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cla = await db.get(Cla, cla_id)
    if cla is None:
        raise HTTPException(status_code=404, detail="Classe introuvable")

    result = await db.execute(
        select(Prop).where(Prop.cla_id == cla_id)
    )
    props = result.scalars().all()
    return [PropOut.model_validate(p) for p in props]


# ─── POST /cla/{id}/prop ──────────────────────────────────

@router.post("/{cla_id}/prop", status_code=status.HTTP_201_CREATED)
async def add_prop(
    cla_id: int,
    body: PropCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cla = await db.get(Cla, cla_id)
    if cla is None:
        raise HTTPException(status_code=404, detail="Classe introuvable")

    # Vérifier que le type est valide
    if body.type not in Prop.TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Type invalide. Types autorisés : {', '.join(Prop.TYPES)}"
        )

    prop = Prop(
        cla_id=cla_id,
        nom=body.nom,
        type=body.type,
        valeurs_liste=body.valeurs_liste,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(prop)
    await db.flush()  # obtenir prop.id

    # ── Initialisation automatique des VALUES pour les OBJ existants ──
    # Périmètre : la CLA elle-même + toutes ses sous-classes (via sous_classes_ids)
    descendant_cla_ids: list[int] = list(cla.sous_classes_ids or [cla_id])
    if cla_id not in descendant_cla_ids:
        descendant_cla_ids.append(cla_id)

    # OBJ rattachés à ces CLAs qui n'ont pas encore de Value pour cette PROP
    existing_value_obj_ids = select(Value.obj_id).where(Value.prop_id == prop.id)
    objs_result = await db.execute(
        select(Obj.id).where(
            Obj.cla_id.in_(descendant_cla_ids),
            Obj.id.not_in(existing_value_obj_ids),
        )
    )
    obj_ids = [row[0] for row in objs_result.all()]

    for obj_id in obj_ids:
        db.add(Value(
            obj_id=obj_id,
            prop_id=prop.id,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        ))

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="prop", entite_id=prop.id,
                    apres={"cla_id": cla_id, "nom": body.nom, "type": body.type,
                           "values_created": len(obj_ids)})
    await db.commit()
    await db.refresh(prop)
    return PropOut.model_validate(prop)


# ─── PUT /cla/{id}/prop/{prop_id} ─────────────────────────

@router.put("/{cla_id}/prop/{prop_id}")
async def update_prop(
    cla_id: int,
    prop_id: int,
    body: PropUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """RF : seul le nom est modifiable — le type ne peut pas être changé après création."""
    result = await db.execute(
        select(Prop).where(Prop.id == prop_id, Prop.cla_id == cla_id)
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise HTTPException(status_code=404, detail="Propriété introuvable")

    avant = {"nom": prop.nom}
    prop.nom = body.nom
    prop.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="prop", entite_id=prop_id, avant=avant,
                    apres={"nom": prop.nom})
    await db.commit()
    await db.refresh(prop)
    return PropOut.model_validate(prop)


# ─── DELETE /cla/{id}/prop/{prop_id} ──────────────────────

@router.delete("/{cla_id}/prop/{prop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prop(
    cla_id: int,
    prop_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """RF-05 : supprime la PROP et toutes ses VALUE associées (cascade)."""
    result = await db.execute(
        select(Prop).where(Prop.id == prop_id, Prop.cla_id == cla_id)
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise HTTPException(status_code=404, detail="Propriété introuvable")

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="prop", entite_id=prop_id,
                    avant={"cla_id": cla_id, "nom": prop.nom, "type": prop.type})
    # La cascade "all, delete-orphan" sur Prop.values supprime les VALUE
    await db.delete(prop)
    await db.commit()
