"""Router de recherche full-text via Meilisearch."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.auth.dependencies import get_current_user, require_admin
from app.database import get_db
from app.models.activity import User, Org, Env, Eng, Event
from app.models.object import Obj, Value
from app.services import search_service

router = APIRouter()


# ─── GET /search ──────────────────────────────────────────

@router.get("")
async def search(
    q: str = Query(..., min_length=2, description="Texte à rechercher (min 2 caractères)"),
    entity_type: str | None = Query(None, description="Filtrer par type : org | env | eng | event"),
    offset: int = Query(0, ge=0, description="Décalage pour la pagination"),
    limit: int = Query(20, ge=1, le=100, description="Nombre max de résultats"),
    _: User = Depends(get_current_user),
):
    """Recherche full-text sur les OBJ indexés dans Meilisearch."""
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="La requête doit comporter au moins 2 caractères")

    filter_expr = f'entity_type = "{entity_type}"' if entity_type else None
    result = await search_service.search_objs(q, offset=offset, limit=limit, filter_expr=filter_expr)

    items = []
    for hit in result["hits"]:
        items.append({
            "id": hit.get("id"),
            "entity_id": hit.get("entity_id") or hit.get("id"),
            "nom": hit.get("nom"),
            "entity_type": hit.get("entity_type"),
            "cla_nom": hit.get("cla_nom"),
            "image_chemin": hit.get("image_chemin") or None,
            "_formatted": hit.get("_formatted", {}),
        })

    return {
        "query": q,
        "hits": items,
        "estimatedTotalHits": result["estimated_total_hits"],
        "offset": offset,
        "limit": limit,
    }


# ─── POST /search/reindex ─────────────────────────────────

@router.post("/reindex")
async def reindex_all(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Ré-indexe toutes les entités dans Meilisearch (ADMIN uniquement)."""
    count = 0

    # ORG
    result = await db.execute(
        select(Org).options(
            joinedload(Org.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
            )
        )
    )
    for org in result.unique().scalars().all():
        try:
            await search_service.index_obj(
                obj_id=org.obj_id,
                entity_id=org.id,
                nom=org.obj.nom,
                description=org.obj.description,
                values_text=[v.valeur_texte for v in org.obj.values if v.valeur_texte],
                entity_type="org",
                cla_nom=org.obj.cla.nom,
                image_chemin=next((i.chemin for i in org.obj.images if i.est_principale), None),
            )
            count += 1
        except Exception:
            pass

    # ENV
    result = await db.execute(
        select(Env).options(
            joinedload(Env.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
            )
        )
    )
    for env in result.unique().scalars().all():
        try:
            await search_service.index_obj(
                obj_id=env.obj_id,
                entity_id=env.id,
                nom=env.obj.nom,
                description=env.obj.description,
                values_text=[v.valeur_texte for v in env.obj.values if v.valeur_texte],
                entity_type="env",
                cla_nom=env.obj.cla.nom,
                image_chemin=next((i.chemin for i in env.obj.images if i.est_principale), None),
            )
            count += 1
        except Exception:
            pass

    # ENG
    result = await db.execute(
        select(Eng).options(
            joinedload(Eng.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
            )
        )
    )
    for eng in result.unique().scalars().all():
        try:
            await search_service.index_obj(
                obj_id=eng.obj_id,
                entity_id=eng.id,
                nom=eng.obj.nom,
                description=eng.obj.description,
                values_text=[v.valeur_texte for v in eng.obj.values if v.valeur_texte],
                entity_type="eng",
                cla_nom=eng.obj.cla.nom,
                image_chemin=next((i.chemin for i in eng.obj.images if i.est_principale), None),
            )
            count += 1
        except Exception:
            pass

    # EVENT
    result = await db.execute(
        select(Event).options(
            joinedload(Event.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
            )
        )
    )
    for event in result.unique().scalars().all():
        try:
            await search_service.index_obj(
                obj_id=event.obj_id,
                entity_id=event.id,
                nom=event.obj.nom,
                description=event.obj.description,
                values_text=[v.valeur_texte for v in event.obj.values if v.valeur_texte],
                entity_type="event",
                cla_nom=event.obj.cla.nom,
                image_chemin=next((i.chemin for i in event.obj.images if i.est_principale), None),
            )
            count += 1
        except Exception:
            pass

    return {"reindexed": count}
