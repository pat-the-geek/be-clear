from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_editeur
from app.models.activity import Event, Eng, User, Tevent, eng_org, eng_env
from app.models.object import Obj, Cla, Value
from app.schemas.event import EventOut, EventCreate, EventUpdate, TeventRef, UpcomingEventOut
from app.schemas.org import ObjOut
from app.services.log import write_log
from app.services.gantt import recalculate_eng, _to_timedelta
from app.services.search_service import index_obj, delete_obj

router = APIRouter()


# ─── Chargement complet d'un EVENT ───────────────────────────

def _event_options():
    return [
        joinedload(Event.tevent),
        joinedload(Event.eng).joinedload(Eng.obj),
        joinedload(Event.obj).options(
            joinedload(Obj.cla).selectinload(Cla.props),
            selectinload(Obj.values).joinedload(Value.prop),
            selectinload(Obj.images),
            selectinload(Obj.documents),
            joinedload(Obj.created_by).joinedload(User.obj),
            joinedload(Obj.updated_by).joinedload(User.obj),
        ),
    ]


def _dt_to_str(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def _event_to_out(event: Event) -> EventOut:
    eng_nom = None
    if event.eng is not None and event.eng.obj is not None:
        eng_nom = event.eng.obj.nom
    return EventOut(
        id=event.id,
        obj=event.obj,
        eng_id=event.eng_id,
        eng_nom=eng_nom,
        tevent=event.tevent,
        date_heure_prevue=_dt_to_str(event.date_heure_prevue),
        date_heure_reelle=_dt_to_str(event.date_heure_reelle),
        est_accompli=event.est_accompli,
    )


# ─── GET /event/suggest ──────────────────────────────────────
# Déclaré AVANT /{event_id} pour éviter la collision de route

@router.get("/suggest")
async def suggest_event_date(
    eng_id: int = Query(..., description="ID de l'ENG cible"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Calcule la date suggérée pour le prochain EVENT d'un ENG.
    Logique : date_heure_prevue du dernier EVENT + durée de son TEVENT.
    Si aucun EVENT existant, suggère date_debut_prevue de l'ENG (ou maintenant).
    """
    eng_result = await db.execute(
        select(Eng)
        .options(
            selectinload(Eng.events).joinedload(Event.tevent)
        )
        .where(Eng.id == eng_id)
    )
    eng = eng_result.unique().scalar_one_or_none()
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")

    events = sorted(
        [e for e in eng.events if e.date_heure_prevue is not None],
        key=lambda e: e.date_heure_prevue,
    )

    if not events:
        # Pas d'EVENT : suggérer la date de début prévue de l'ENG
        suggested = eng.date_debut_prevue or eng.date_debut or datetime.now()
        return {"date_heure_prevue_suggere": _dt_to_str(suggested)}

    dernier = events[-1]
    tevent = dernier.tevent

    if (
        tevent is not None
        and tevent.duree_prevue_valeur is not None
        and tevent.duree_prevue_unite is not None
    ):
        delta = _to_timedelta(float(tevent.duree_prevue_valeur), tevent.duree_prevue_unite)
    else:
        delta = timedelta(hours=1)  # fallback

    suggested = dernier.date_heure_prevue + delta
    return {"date_heure_prevue_suggere": _dt_to_str(suggested)}


# ─── GET /event/upcoming ─────────────────────────────────────
# Déclaré AVANT /{event_id} pour éviter la collision de route

@router.get("/upcoming", response_model=list[UpcomingEventOut])
async def upcoming_events(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne les prochains EVENTs non accomplis dans les ENGs créés par l'utilisateur."""
    from datetime import timezone
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Event)
        .join(Eng, Event.eng_id == Eng.id)
        .join(Obj, Eng.obj_id == Obj.id)
        .options(
            joinedload(Event.tevent),
            joinedload(Event.obj),
            joinedload(Event.eng).joinedload(Eng.obj),
        )
        .where(
            Event.date_heure_reelle.is_(None),
            Event.date_heure_prevue >= now,
            Eng.created_by_id == current_user.id,
        )
        .order_by(Event.date_heure_prevue.asc())
        .limit(limit)
    )
    events = result.unique().scalars().all()
    return [
        UpcomingEventOut(
            id=e.id,
            nom=e.obj.nom,
            eng_id=e.eng_id,
            eng_nom=e.eng.obj.nom,
            tevent_nom=e.tevent.nom if e.tevent else "",
            date_heure_prevue=_dt_to_str(e.date_heure_prevue),
        )
        for e in events
    ]


# ─── GET /event/overdue ──────────────────────────────────────

@router.get("/overdue", response_model=list[UpcomingEventOut])
async def overdue_events(
    limit: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne les EVENTs en retard (date_heure_prevue passée, non accomplis) des ENGs de l'utilisateur."""
    from datetime import timezone
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Event)
        .join(Eng, Event.eng_id == Eng.id)
        .options(
            joinedload(Event.tevent),
            joinedload(Event.obj),
            joinedload(Event.eng).joinedload(Eng.obj),
        )
        .where(
            Event.date_heure_reelle.is_(None),
            Event.date_heure_prevue < now,
            Eng.created_by_id == current_user.id,
        )
        .order_by(Event.date_heure_prevue.desc())
        .limit(limit)
    )
    events = result.unique().scalars().all()
    return [
        UpcomingEventOut(
            id=e.id,
            nom=e.obj.nom,
            eng_id=e.eng_id,
            eng_nom=e.eng.obj.nom,
            tevent_nom=e.tevent.nom if e.tevent else "",
            date_heure_prevue=_dt_to_str(e.date_heure_prevue),
        )
        for e in events
    ]


# ─── GET /event ──────────────────────────────────────────────

@router.get("")
async def list_events(
    q: str | None = Query(None, description="Recherche textuelle sur le nom"),
    eng_id: int | None = Query(None, description="Filtre par ENG"),
    org_id: int | None = Query(None, description="Filtre par ORG (via ENGs)"),
    env_id: int | None = Query(None, description="Filtre par ENV (via ENGs)"),
    tevent_id: int | None = Query(None, description="Filtre par type TEVENT"),
    accompli: bool | None = Query(None, description="True = accomplis, False = en attente, None = tous"),
    date_from: str | None = Query(None, description="Date prévue ≥ (ISO date)"),
    date_to: str | None = Query(None, description="Date prévue ≤ (ISO date)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from datetime import timezone as _tz
    from sqlalchemy import func

    stmt = select(Event).options(*_event_options())
    if q:
        stmt = stmt.join(Obj, Event.obj_id == Obj.id).where(Obj.nom.ilike(f'%{q}%'))
    if eng_id is not None:
        stmt = stmt.where(Event.eng_id == eng_id)
    if org_id is not None:
        stmt = stmt.join(eng_org, Event.eng_id == eng_org.c.eng_id).where(eng_org.c.org_id == org_id)
    if env_id is not None:
        stmt = stmt.join(eng_env, Event.eng_id == eng_env.c.eng_id).where(eng_env.c.env_id == env_id)
    if tevent_id is not None:
        stmt = stmt.where(Event.tevent_id == tevent_id)
    if accompli is True:
        stmt = stmt.where(Event.date_heure_reelle.is_not(None))
    elif accompli is False:
        stmt = stmt.where(Event.date_heure_reelle.is_(None))
    if date_from:
        dt_from = datetime.fromisoformat(date_from).replace(tzinfo=_tz.utc)
        stmt = stmt.where(Event.date_heure_prevue >= dt_from)
    if date_to:
        dt_to = datetime.fromisoformat(date_to).replace(tzinfo=_tz.utc)
        stmt = stmt.where(Event.date_heure_prevue <= dt_to)

    total_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = total_result.scalar_one()

    stmt = stmt.order_by(Event.date_heure_prevue).offset((page - 1) * per_page).limit(per_page)
    events = (await db.execute(stmt)).unique().scalars().all()

    return {
        "items": [_event_to_out(e) for e in events],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ─── GET /event/{id} ─────────────────────────────────────────

@router.get("/{event_id}", response_model=EventOut)
async def get_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event).options(*_event_options()).where(Event.id == event_id)
    )
    event = result.unique().scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Évènement introuvable")
    return _event_to_out(event)


# ─── POST /event ─────────────────────────────────────────────

@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    # Vérifier que l'ENG existe
    eng = await db.get(Eng, body.eng_id)
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")

    # Lire date_debut immédiatement (avant tout autre appel DB qui expirerait l'objet)
    eng_date_debut = eng.date_debut

    # Vérifier que le TEVENT existe
    tevent = await db.get(Tevent, body.tevent_id)
    if tevent is None:
        raise HTTPException(status_code=400, detail="TEVENT introuvable")

    # RF-15 : date_heure_prevue >= eng.date_debut
    from datetime import timezone as _tz
    date_heure_prevue = datetime.fromisoformat(body.date_heure_prevue)
    # Rendre le datetime aware si nécessaire pour comparer avec DateTime(timezone=True)
    if date_heure_prevue.tzinfo is None:
        date_heure_prevue = date_heure_prevue.replace(tzinfo=_tz.utc)
    if eng_date_debut is not None and date_heure_prevue < eng_date_debut:
        raise HTTPException(
            status_code=400,
            detail=(
                f"RF-15 : date_heure_prevue ({body.date_heure_prevue}) "
                f"ne peut pas être antérieure à date_debut de l'ENG "
                f"({_dt_to_str(eng.date_debut)})"
            ),
        )

    # Créer l'OBJ
    obj = Obj(
        nom=body.nom,
        description=body.description,
        cla_id=body.cla_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(obj)
    await db.flush()

    # Créer les VALUE
    for v in body.values:
        value = Value(obj_id=obj.id, **v.model_dump())
        db.add(value)

    # Créer l'EVENT
    event = Event(
        obj_id=obj.id,
        eng_id=body.eng_id,
        tevent_id=body.tevent_id,
        date_heure_prevue=date_heure_prevue,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(event)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="event", entite_id=event.id,
                    apres={"nom": body.nom, "eng_id": body.eng_id,
                           "tevent_id": body.tevent_id,
                           "date_heure_prevue": body.date_heure_prevue})
    await db.commit()

    # Recalculer le Gantt de l'ENG
    await recalculate_eng(db, body.eng_id)
    await db.commit()

    # Recharger avec toutes les relations
    result = await db.execute(
        select(Event).options(*_event_options()).where(Event.id == event.id)
    )
    event = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=event.obj_id,
            entity_id=event.id,
            nom=event.obj.nom,
            description=event.obj.description,
            values_text=[v.valeur_texte for v in event.obj.values if v.valeur_texte],
            entity_type="event",
            cla_nom=event.obj.cla.nom,
            image_chemin=next((i.chemin for i in event.obj.images if i.est_principale), None),
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=event.obj.nom,
            description=event.obj.description,
            values_text=[v.valeur_texte for v in event.obj.values if v.valeur_texte],
            entity_type="event",
        )
        await upsert_embedding(db, event.obj_id, embed_txt)
    except Exception:
        pass

    return _event_to_out(event)


# ─── PUT /event/{id} ─────────────────────────────────────────

@router.put("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    body: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(
        select(Event).options(*_event_options()).where(Event.id == event_id)
    )
    event = result.unique().scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Évènement introuvable")

    avant = {
        "date_heure_prevue": _dt_to_str(event.date_heure_prevue),
        "date_heure_reelle": _dt_to_str(event.date_heure_reelle),
    }
    eng_id = event.eng_id

    if body.nom is not None:
        event.obj.nom = body.nom
    if body.description is not None:
        event.obj.description = body.description
    if body.tevent_id is not None:
        tevent = await db.get(Tevent, body.tevent_id)
        if tevent is None:
            raise HTTPException(status_code=400, detail="TEVENT introuvable")
        event.tevent_id = body.tevent_id
    if body.date_heure_prevue is not None:
        from datetime import timezone as _tz
        new_date = datetime.fromisoformat(body.date_heure_prevue)
        if new_date.tzinfo is None:
            new_date = new_date.replace(tzinfo=_tz.utc)
        # RF-15 : vérifier la cohérence avec date_debut de l'ENG
        eng = await db.get(Eng, eng_id)
        eng_date_debut = eng.date_debut if eng else None
        if eng and eng_date_debut is not None and new_date < eng_date_debut:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"RF-15 : date_heure_prevue ({body.date_heure_prevue}) "
                    f"ne peut pas être antérieure à date_debut de l'ENG "
                    f"({_dt_to_str(eng.date_debut)})"
                ),
            )
        event.date_heure_prevue = new_date
    if body.date_heure_reelle is not None:
        event.date_heure_reelle = datetime.fromisoformat(body.date_heure_reelle)

    # ── Mise à jour des VALUES ──────────────────────────────────
    if body.values:
        value_map = {v.prop_id: v for v in event.obj.values}
        for vin in body.values:
            value = value_map.get(vin.prop_id)
            if value is None:
                value = Value(obj_id=event.obj_id, prop_id=vin.prop_id,
                              created_by_id=current_user.id, updated_by_id=current_user.id)
                db.add(value)
            value.valeur_texte = vin.valeur_texte
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

    event.obj.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="event", entite_id=event_id, avant=avant,
                    apres={
                        "date_heure_prevue": _dt_to_str(event.date_heure_prevue),
                        "date_heure_reelle": _dt_to_str(event.date_heure_reelle),
                    })
    await db.commit()

    # Recalculer le Gantt de l'ENG
    await recalculate_eng(db, eng_id)
    await db.commit()

    result = await db.execute(
        select(Event).options(*_event_options()).where(Event.id == event_id)
    )
    event = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=event.obj_id,
            entity_id=event.id,
            nom=event.obj.nom,
            description=event.obj.description,
            values_text=[v.valeur_texte for v in event.obj.values if v.valeur_texte],
            entity_type="event",
            cla_nom=event.obj.cla.nom,
            image_chemin=next((i.chemin for i in event.obj.images if i.est_principale), None),
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=event.obj.nom,
            description=event.obj.description,
            values_text=[v.valeur_texte for v in event.obj.values if v.valeur_texte],
            entity_type="event",
        )
        await upsert_embedding(db, event.obj_id, embed_txt)
    except Exception:
        pass

    return _event_to_out(event)


# ─── DELETE /event/{id} ──────────────────────────────────────

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Évènement introuvable")

    eng_id = event.eng_id

    try:
        await delete_obj(event.obj_id)
    except Exception:
        pass

    try:
        from app.services.embedding_service import delete_embedding
        await delete_embedding(db, event.obj_id)
    except Exception:
        pass

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="event", entite_id=event_id,
                    avant={"event_id": event_id, "eng_id": eng_id})
    await db.delete(event)
    await db.commit()

    # Recalculer le Gantt de l'ENG après suppression
    await recalculate_eng(db, eng_id)
    await db.commit()
