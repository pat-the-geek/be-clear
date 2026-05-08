from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_editeur
from app.models.activity import Org, OrgTorgHistory, User, Torg
from app.models.object import Obj, Cla, Value, Img, Doc
from app.schemas.org import OrgOut, OrgBrief, OrgCreate, OrgUpdate, TorgHistoryEntry
from app.schemas.common import Paginated
from app.services.log import write_log
from app.services.search_service import index_obj, delete_obj

router = APIRouter()


def _org_to_out(org: Org) -> OrgOut:
    history = sorted(org.torg_history, key=lambda h: h.date_debut)
    return OrgOut(
        id=org.id,
        obj=org.obj,
        torg=org.torg,
        torg_history=[TorgHistoryEntry.from_orm_with_nom(h) for h in history],
    )


# ─── Chargement complet d'une ORG ────────────────────────

def _org_options():
    return [
        joinedload(Org.torg).joinedload(Torg.cla),
        joinedload(Org.obj).options(
            joinedload(Obj.cla).selectinload(Cla.props),
            selectinload(Obj.values).joinedload(Value.prop),
            selectinload(Obj.images),
            selectinload(Obj.documents),
            joinedload(Obj.created_by).joinedload(User.obj),
            joinedload(Obj.updated_by).joinedload(User.obj),
        ),
        selectinload(Org.torg_history).joinedload(OrgTorgHistory.torg),
    ]


# ─── GET /org ────────────────────────────────────────────

@router.get("", response_model=Paginated[OrgBrief])
async def list_orgs(
    torg_id: int | None = Query(None),
    q: str | None = Query(None, description="Recherche sur le nom (insensible à la casse)"),
    created_by_me: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Org).options(*_org_options())
    if torg_id:
        # Filtrage récursif : on inclut les ORG de tous les sous-types du TORG sélectionné
        torg = await db.get(Torg, torg_id, options=[joinedload(Torg.cla)])
        if torg and torg.cla and torg.cla.sous_classes_ids:
            cla_ids: list[int] = torg.cla.sous_classes_ids
            torg_ids_result = await db.execute(
                select(Torg.id).where(Torg.cla_id.in_(cla_ids))
            )
            torg_ids = [r[0] for r in torg_ids_result.all()]
            stmt = stmt.where(Org.torg_id.in_(torg_ids))
        else:
            stmt = stmt.where(Org.torg_id == torg_id)
    if q:
        stmt = stmt.where(Org.obj_id.in_(
            select(Obj.id).where(Obj.nom.ilike(f"%{q.strip()}%"))
        ))
    if created_by_me:
        stmt = stmt.where(Org.created_by_id == current_user.id)

    total_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = total_result.scalar_one()

    # ORDER BY via subquery corrélée pour éviter le conflit d'alias avec joinedload
    nom_subq = select(Obj.nom).where(Obj.id == Org.obj_id).correlate(Org).scalar_subquery()
    stmt = stmt.order_by(nom_subq).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    orgs = result.unique().scalars().all()

    items = []
    for org in orgs:
        img = next((i for i in org.obj.images if i.est_principale), None)
        items.append(OrgBrief(
            id=org.id,
            nom=org.obj.nom,
            torg=org.torg,
            image_principale=img,
            updated_at=org.obj.updated_at,
            values=list(org.obj.values),
        ))

    return Paginated(items=items, total=total, page=page, per_page=per_page)


# ─── GET /org/{id} ───────────────────────────────────────

@router.get("/{org_id}", response_model=OrgOut)
async def get_org(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Org).options(*_org_options()).where(Org.id == org_id)
    )
    org = result.unique().scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    return _org_to_out(org)


# ─── POST /org ───────────────────────────────────────────

@router.post("", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
async def create_org(
    body: OrgCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    # Vérifier que le TORG existe
    torg = await db.get(Torg, body.torg_id)
    if torg is None:
        raise HTTPException(status_code=400, detail="TORG introuvable")

    # Créer l'OBJ
    obj = Obj(
        nom=body.nom,
        description=body.description,
        cla_id=body.cla_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(obj)
    await db.flush()  # obtenir obj.id

    # Créer les VALUE
    for v in body.values:
        value = Value(obj_id=obj.id, **v.model_dump())
        db.add(value)

    # Créer l'ORG
    org = Org(obj_id=obj.id, torg_id=body.torg_id,
              created_by_id=current_user.id, updated_by_id=current_user.id)
    db.add(org)
    await db.flush()

    # RF-11 : enregistrer l'entrée initiale dans l'historique TORG
    from datetime import datetime as _dt, timezone as _tz
    history_entry = OrgTorgHistory(
        org_id=org.id,
        torg_id=body.torg_id,
        date_debut=_dt.now(_tz.utc),
        changed_by_id=current_user.id,
    )
    db.add(history_entry)

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="org", entite_id=org.id,
                    apres={"nom": body.nom, "torg_id": body.torg_id})
    await db.commit()

    # Recharger avec toutes les relations
    result = await db.execute(
        select(Org).options(*_org_options()).where(Org.id == org.id)
    )
    org = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=org.obj_id,
            entity_id=org.id,
            nom=org.obj.nom,
            description=org.obj.description,
            values_text=[v.valeur_texte for v in org.obj.values if v.valeur_texte],
            entity_type="org",
            cla_nom=org.obj.cla.nom,
            image_chemin=next((i.chemin for i in org.obj.images if i.est_principale), None),
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=org.obj.nom,
            description=org.obj.description,
            values_text=[v.valeur_texte for v in org.obj.values if v.valeur_texte],
            entity_type="org",
        )
        await upsert_embedding(db, org.obj_id, embed_txt)
    except Exception:
        pass

    return _org_to_out(org)


# ─── PUT /org/{id} ───────────────────────────────────────

@router.put("/{org_id}", response_model=OrgOut)
async def update_org(
    org_id: int,
    body: OrgUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(
        select(Org).options(*_org_options()).where(Org.id == org_id)
    )
    org = result.unique().scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    avant = {"nom": org.obj.nom, "torg_id": org.torg_id}

    if body.nom is not None:
        org.obj.nom = body.nom
    if body.description is not None:
        org.obj.description = body.description
    if body.torg_id is not None and body.torg_id != org.torg_id:
        from datetime import datetime as _dt, timezone as _tz
        from sqlalchemy import update as _sa_update
        now = _dt.now(_tz.utc)
        await db.execute(
            _sa_update(OrgTorgHistory)
            .where(OrgTorgHistory.org_id == org_id, OrgTorgHistory.date_fin.is_(None))
            .values(date_fin=now)
        )
        db.add(OrgTorgHistory(org_id=org_id, torg_id=body.torg_id,
                              date_debut=now, changed_by_id=current_user.id))
        org.torg_id = body.torg_id
    elif body.torg_id is not None:
        org.torg_id = body.torg_id
    org.obj.updated_by_id = current_user.id

    # ── Mise à jour des VALUES ──────────────────────────────────
    # Utiliser directement les instances déjà chargées par selectinload pour éviter
    # les conflits d'identity map de SQLAlchemy async (second SELECT sur même session)
    value_map = {v.prop_id: v for v in org.obj.values}

    for vin in body.values:
        value = value_map.get(vin.prop_id)
        if value is None:
            value = Value(obj_id=org.obj_id, prop_id=vin.prop_id,
                          created_by_id=current_user.id, updated_by_id=current_user.id)
            db.add(value)
        value.valeur_texte = vin.valeur_texte
        # Convertir la date string en datetime pour SQLAlchemy
        if vin.valeur_date is not None:
            from datetime import datetime as dt
            value.valeur_date = dt.fromisoformat(vin.valeur_date)
        else:
            value.valeur_date = None
        value.valeur_nombre = vin.valeur_nombre
        value.valeur_bool = vin.valeur_bool
        value.valeur_json = vin.valeur_json
        value.valeur_ref_obj_id = vin.valeur_ref_obj_id
        value.updated_by_id = current_user.id

    await db.flush()  # s'assurer que les changements sont trackés avant le log

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="org", entite_id=org_id, avant=avant,
                    apres={"nom": org.obj.nom, "torg_id": org.torg_id})
    await db.commit()

    result = await db.execute(
        select(Org).options(*_org_options()).where(Org.id == org_id)
    )
    org = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=org.obj_id,
            entity_id=org.id,
            nom=org.obj.nom,
            description=org.obj.description,
            values_text=[v.valeur_texte for v in org.obj.values if v.valeur_texte],
            entity_type="org",
            cla_nom=org.obj.cla.nom,
            image_chemin=next((i.chemin for i in org.obj.images if i.est_principale), None),
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=org.obj.nom,
            description=org.obj.description,
            values_text=[v.valeur_texte for v in org.obj.values if v.valeur_texte],
            entity_type="org",
        )
        await upsert_embedding(db, org.obj_id, embed_txt)
    except Exception:
        pass

    return _org_to_out(org)


# ─── DELETE /org/{id} ────────────────────────────────────

@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(select(Org).where(Org.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    try:
        await delete_obj(org.obj_id)
    except Exception:
        pass

    try:
        from app.services.embedding_service import delete_embedding
        await delete_embedding(db, org.obj_id)
    except Exception:
        pass

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="org", entite_id=org_id,
                    avant={"org_id": org_id})
    await db.delete(org)
    await db.commit()
