from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_editeur
from app.models.activity import Eng, Org, Env, Event, User, Teng, eng_org, eng_env
from app.models.object import Cla
from app.models.object import Obj, Value
from app.schemas.eng import EngOut, EngBrief, EngCreate, EngUpdate, OrgRef, EnvRef, EventBrief
from app.schemas.common import Paginated
from app.services.log import write_log
from app.services.gantt import recalculate_eng
from app.services.search_service import index_obj, delete_obj

router = APIRouter()


# ─── Chargement complet d'un ENG ─────────────────────────────

def _eng_options():
    return [
        joinedload(Eng.teng).joinedload(Teng.cla),
        joinedload(Eng.obj).options(
            joinedload(Obj.cla).selectinload(Cla.props),
            selectinload(Obj.values).joinedload(Value.prop),
            selectinload(Obj.images),
            selectinload(Obj.documents),
            joinedload(Obj.created_by).joinedload(User.obj),
            joinedload(Obj.updated_by).joinedload(User.obj),
        ),
        selectinload(Eng.orgs).joinedload(Org.obj),
        selectinload(Eng.envs).joinedload(Env.obj),
        joinedload(Eng.org_principale).joinedload(Org.obj),
        joinedload(Eng.env_principale).joinedload(Env.obj),
        selectinload(Eng.events).options(
            joinedload(Event.tevent),
            joinedload(Event.obj),
        ),
    ]


def _dt_to_str(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def _eng_to_out(eng: Eng) -> EngOut:
    """Construit un EngOut à partir du modèle SQLAlchemy."""
    orgs = [OrgRef(id=o.id, nom=o.obj.nom) for o in eng.orgs]
    envs = [EnvRef(id=e.id, nom=e.obj.nom) for e in eng.envs]
    org_principale = OrgRef(id=eng.org_principale.id, nom=eng.org_principale.obj.nom) if eng.org_principale else None
    env_principale = EnvRef(id=eng.env_principale.id, nom=eng.env_principale.obj.nom) if eng.env_principale else None
    events = [
        EventBrief(
            id=ev.id,
            date_heure_prevue=_dt_to_str(ev.date_heure_prevue),
            date_heure_reelle=_dt_to_str(ev.date_heure_reelle),
            tevent_nom=ev.tevent.nom if ev.tevent else "",
            obj_nom=ev.obj.nom if ev.obj else "",
            est_accompli=ev.est_accompli,
        )
        for ev in sorted(eng.events, key=lambda e: e.date_heure_prevue)
    ]
    return EngOut(
        id=eng.id,
        obj=eng.obj,
        teng=eng.teng,
        orgs=orgs,
        envs=envs,
        org_principale=org_principale,
        env_principale=env_principale,
        events=events,
        date_debut=_dt_to_str(eng.date_debut),
        date_debut_prevue=_dt_to_str(eng.date_debut_prevue),
        date_fin=_dt_to_str(eng.date_fin),
        date_fin_prevue=_dt_to_str(eng.date_fin_prevue),
        accomplissement=float(eng.accomplissement) if eng.accomplissement is not None else None,
        gantt_mermaid=eng.gantt_mermaid,
    )


# ─── GET /eng ────────────────────────────────────────────────

@router.get("", response_model=Paginated[EngBrief])
async def list_engs(
    org_id: int | None = Query(None),
    env_id: int | None = Query(None),
    teng_id: int | None = Query(None),
    q: str | None = Query(None, description="Recherche sur le nom (insensible à la casse)"),
    created_by_me: bool = Query(False),
    status: str | None = Query(None, description="non_demarre | en_cours | termine"),
    sort_by: str = Query("nom", description="Champ de tri"),
    sort_dir: str = Query("asc", description="Direction : asc ou desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Eng).options(*_eng_options())
    if org_id:
        stmt = stmt.join(eng_org, Eng.id == eng_org.c.eng_id).where(eng_org.c.org_id == org_id)
    if env_id:
        stmt = stmt.join(eng_env, Eng.id == eng_env.c.eng_id).where(eng_env.c.env_id == env_id)
    if teng_id:
        stmt = stmt.where(Eng.teng_id == teng_id)
    if q:
        stmt = stmt.where(Eng.obj_id.in_(
            select(Obj.id).where(Obj.nom.ilike(f"%{q.strip()}%"))
        ))
    if created_by_me:
        stmt = stmt.where(Eng.created_by_id == current_user.id)
    if status == "non_demarre":
        stmt = stmt.where((Eng.accomplissement == None) | (Eng.accomplissement == 0))
    elif status == "en_cours":
        stmt = stmt.where(Eng.accomplissement > 0, Eng.accomplissement < 100)
    elif status == "termine":
        stmt = stmt.where(Eng.accomplissement >= 100)

    total_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = total_result.scalar_one()

    nom_subq = select(Obj.nom).where(Obj.id == Eng.obj_id).correlate(Eng).scalar_subquery()
    teng_nom_subq = select(Teng.nom).where(Teng.id == Eng.teng_id).correlate(Eng).scalar_subquery()
    nb_events_subq = select(func.count(Event.id)).where(Event.eng_id == Eng.id).correlate(Eng).scalar_subquery()

    updated_at_subq = select(Obj.updated_at).where(Obj.id == Eng.obj_id).correlate(Eng).scalar_subquery()
    created_at_subq = select(Obj.created_at).where(Obj.id == Eng.obj_id).correlate(Eng).scalar_subquery()

    _sort_map = {
        "nom": nom_subq,
        "teng": teng_nom_subq,
        "date_debut_prevue": Eng.date_debut_prevue,
        "date_fin_prevue": Eng.date_fin_prevue,
        "date_debut": Eng.date_debut,
        "date_fin": Eng.date_fin,
        "accomplissement": Eng.accomplissement,
        "nb_events": nb_events_subq,
        "created_at": created_at_subq,
        "updated_at": updated_at_subq,
    }
    sort_col = _sort_map.get(sort_by, nom_subq)
    if sort_dir == "desc":
        stmt = stmt.order_by(sort_col.desc(), nom_subq.asc())
    else:
        stmt = stmt.order_by(sort_col.asc(), nom_subq.asc())

    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    engs = result.unique().scalars().all()

    items = []
    for eng in engs:
        created_by_nom: str | None = None
        updated_by_nom: str | None = None
        try:
            if eng.obj.created_by is not None:
                created_by_nom = eng.obj.created_by.nom
        except Exception:
            pass
        try:
            if eng.obj.updated_by is not None:
                updated_by_nom = eng.obj.updated_by.nom
        except Exception:
            pass

        org_principale_nom: str | None = None
        env_principale_nom: str | None = None
        try:
            if eng.org_principale is not None:
                org_principale_nom = eng.org_principale.obj.nom
        except Exception:
            pass
        try:
            if eng.env_principale is not None:
                env_principale_nom = eng.env_principale.obj.nom
        except Exception:
            pass

        items.append(EngBrief(
            id=eng.id,
            nom=eng.obj.nom,
            teng=eng.teng,
            accomplissement=float(eng.accomplissement) if eng.accomplissement is not None else None,
            nb_events=len(eng.events),
            org_principale_nom=org_principale_nom,
            env_principale_nom=env_principale_nom,
            date_debut=_dt_to_str(eng.date_debut),
            date_debut_prevue=_dt_to_str(eng.date_debut_prevue),
            date_fin=_dt_to_str(eng.date_fin),
            date_fin_prevue=_dt_to_str(eng.date_fin_prevue),
            created_at=_dt_to_str(eng.obj.created_at),
            updated_at=_dt_to_str(eng.obj.updated_at),
            created_by_nom=created_by_nom,
            updated_by_nom=updated_by_nom,
        ))

    return Paginated(items=items, total=total, page=page, per_page=per_page)


# ─── GET /eng/{id} ───────────────────────────────────────────

@router.get("/{eng_id}", response_model=EngOut)
async def get_eng(
    eng_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Eng).options(*_eng_options()).where(Eng.id == eng_id)
    )
    eng = result.unique().scalar_one_or_none()
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")
    return _eng_to_out(eng)


# ─── POST /eng ───────────────────────────────────────────────

@router.post("", response_model=EngOut, status_code=status.HTTP_201_CREATED)
async def create_eng(
    body: EngCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    # RF-12 : au moins 1 ORG ou 1 ENV
    if not body.org_ids and not body.env_ids:
        raise HTTPException(status_code=400, detail="Un ENG doit être lié à au moins 1 ORG ou 1 ENV (RF-12)")

    # Vérifier TENG
    teng = await db.get(Teng, body.teng_id)
    if teng is None:
        raise HTTPException(status_code=400, detail="TENG introuvable")

    # Charger les ORG et ENV
    orgs_result = await db.execute(select(Org).where(Org.id.in_(body.org_ids)))
    orgs = orgs_result.scalars().all()
    if len(orgs) != len(body.org_ids):
        raise HTTPException(status_code=400, detail="Une ou plusieurs ORG introuvables")

    envs_result = await db.execute(select(Env).where(Env.id.in_(body.env_ids)))
    envs = envs_result.scalars().all()
    if len(envs) != len(body.env_ids):
        raise HTTPException(status_code=400, detail="Un ou plusieurs ENV introuvables")

    # Valider org_principale_id / env_principale_id
    if body.org_principale_id is not None and body.org_principale_id not in body.org_ids:
        raise HTTPException(status_code=400, detail="org_principale_id doit faire partie des org_ids")
    if body.env_principale_id is not None and body.env_principale_id not in body.env_ids:
        raise HTTPException(status_code=400, detail="env_principale_id doit faire partie des env_ids")

    # Parser les dates
    date_debut = datetime.fromisoformat(body.date_debut) if body.date_debut else None
    date_debut_prevue = datetime.fromisoformat(body.date_debut_prevue) if body.date_debut_prevue else None
    date_fin = datetime.fromisoformat(body.date_fin) if body.date_fin else None
    date_fin_prevue = datetime.fromisoformat(body.date_fin_prevue) if body.date_fin_prevue else None

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

    # Créer l'ENG
    eng = Eng(
        obj_id=obj.id,
        teng_id=body.teng_id,
        date_debut=date_debut,
        date_debut_prevue=date_debut_prevue,
        date_fin=date_fin,
        date_fin_prevue=date_fin_prevue,
        org_principale_id=body.org_principale_id,
        env_principale_id=body.env_principale_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    eng.orgs = list(orgs)
    eng.envs = list(envs)
    db.add(eng)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="eng", entite_id=eng.id,
                    apres={"nom": body.nom, "teng_id": body.teng_id,
                           "org_ids": body.org_ids, "env_ids": body.env_ids})
    await db.commit()

    # Recharger avec toutes les relations
    result = await db.execute(
        select(Eng).options(*_eng_options()).where(Eng.id == eng.id)
    )
    eng = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=eng.obj_id,
            entity_id=eng.id,
            nom=eng.obj.nom,
            description=eng.obj.description,
            values_text=[v.valeur_texte for v in eng.obj.values if v.valeur_texte],
            entity_type="eng",
            cla_nom=eng.obj.cla.nom,
            image_chemin=next((i.chemin for i in eng.obj.images if i.est_principale), None),
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=eng.obj.nom,
            description=eng.obj.description,
            values_text=[v.valeur_texte for v in eng.obj.values if v.valeur_texte],
            entity_type="eng",
        )
        await upsert_embedding(db, eng.obj_id, embed_txt)
    except Exception:
        pass

    return _eng_to_out(eng)


# ─── PUT /eng/{id} ───────────────────────────────────────────

@router.put("/{eng_id}", response_model=EngOut)
async def update_eng(
    eng_id: int,
    body: EngUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(
        select(Eng).options(*_eng_options()).where(Eng.id == eng_id)
    )
    eng = result.unique().scalar_one_or_none()
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")

    avant = {"nom": eng.obj.nom, "teng_id": eng.teng_id}

    if body.nom is not None:
        eng.obj.nom = body.nom
    if body.description is not None:
        eng.obj.description = body.description
    if body.teng_id is not None:
        teng = await db.get(Teng, body.teng_id)
        if teng is None:
            raise HTTPException(status_code=400, detail="TENG introuvable")
        eng.teng_id = body.teng_id
    if body.date_debut is not None:
        eng.date_debut = datetime.fromisoformat(body.date_debut)
    if body.date_debut_prevue is not None:
        eng.date_debut_prevue = datetime.fromisoformat(body.date_debut_prevue)
    if body.date_fin is not None:
        eng.date_fin = datetime.fromisoformat(body.date_fin)
    if body.org_ids is not None:
        orgs_result = await db.execute(select(Org).where(Org.id.in_(body.org_ids)))
        eng.orgs = list(orgs_result.scalars().all())
    if body.env_ids is not None:
        envs_result = await db.execute(select(Env).where(Env.id.in_(body.env_ids)))
        eng.envs = list(envs_result.scalars().all())

    # Valider org_principale_id / env_principale_id après mise à jour des relations
    effective_org_ids = set(body.org_ids) if body.org_ids is not None else {o.id for o in eng.orgs}
    effective_env_ids = set(body.env_ids) if body.env_ids is not None else {e.id for e in eng.envs}
    if 'org_principale_id' in body.model_fields_set:
        if body.org_principale_id is not None and body.org_principale_id not in effective_org_ids:
            raise HTTPException(status_code=400, detail="org_principale_id doit faire partie des org_ids")
        eng.org_principale_id = body.org_principale_id
    if 'env_principale_id' in body.model_fields_set:
        if body.env_principale_id is not None and body.env_principale_id not in effective_env_ids:
            raise HTTPException(status_code=400, detail="env_principale_id doit faire partie des env_ids")
        eng.env_principale_id = body.env_principale_id

    # ── Mise à jour des VALUES ──────────────────────────────────
    if body.values:
        value_map = {v.prop_id: v for v in eng.obj.values}
        for vin in body.values:
            value = value_map.get(vin.prop_id)
            if value is None:
                value = Value(obj_id=eng.obj_id, prop_id=vin.prop_id,
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

    eng.obj.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="eng", entite_id=eng_id, avant=avant,
                    apres={"nom": eng.obj.nom, "teng_id": eng.teng_id})
    await db.commit()

    result = await db.execute(
        select(Eng).options(*_eng_options()).where(Eng.id == eng_id)
    )
    eng = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=eng.obj_id,
            entity_id=eng.id,
            nom=eng.obj.nom,
            description=eng.obj.description,
            values_text=[v.valeur_texte for v in eng.obj.values if v.valeur_texte],
            entity_type="eng",
            cla_nom=eng.obj.cla.nom,
            image_chemin=next((i.chemin for i in eng.obj.images if i.est_principale), None),
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=eng.obj.nom,
            description=eng.obj.description,
            values_text=[v.valeur_texte for v in eng.obj.values if v.valeur_texte],
            entity_type="eng",
        )
        await upsert_embedding(db, eng.obj_id, embed_txt)
    except Exception:
        pass

    return _eng_to_out(eng)


# ─── DELETE /eng/{id} ────────────────────────────────────────

@router.delete("/{eng_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_eng(
    eng_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(select(Eng).where(Eng.id == eng_id))
    eng = result.scalar_one_or_none()
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")

    try:
        await delete_obj(eng.obj_id)
    except Exception:
        pass

    try:
        from app.services.embedding_service import delete_embedding
        await delete_embedding(db, eng.obj_id)
    except Exception:
        pass

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="eng", entite_id=eng_id,
                    avant={"eng_id": eng_id})
    await db.delete(eng)
    await db.commit()


# ─── POST /eng/{id}/duplicate ────────────────────────────────

@router.post("/{eng_id}/duplicate", response_model=EngOut, status_code=status.HTTP_201_CREATED)
async def duplicate_eng(
    eng_id: int,
    offset_days: int = Query(0, description="Décaler les dates des EVENTs (jours)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    """Duplique un ENG avec tous ses EVENTs (dates décalées de offset_days jours)."""
    from datetime import timedelta

    result = await db.execute(
        select(Eng).options(*_eng_options()).where(Eng.id == eng_id)
    )
    src = result.unique().scalar_one_or_none()
    if src is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")

    # Nouvel OBJ pour l'ENG copie
    new_obj = Obj(
        nom=f"{src.obj.nom} (copie)",
        description=src.obj.description,
        cla_id=src.obj.cla_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(new_obj)
    await db.flush()

    delta = timedelta(days=offset_days)

    new_eng = Eng(
        obj_id=new_obj.id,
        teng_id=src.teng_id,
        date_debut=src.date_debut and src.date_debut + delta,
        date_debut_prevue=src.date_debut_prevue and src.date_debut_prevue + delta,
        date_fin=src.date_fin and src.date_fin + delta,
        org_principale_id=src.org_principale_id,
        env_principale_id=src.env_principale_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    new_eng.orgs = list(src.orgs)
    new_eng.envs = list(src.envs)
    db.add(new_eng)
    await db.flush()

    # Dupliquer les EVENTs
    events_result = await db.execute(
        select(Event).options(
            joinedload(Event.obj).options(selectinload(Obj.values))
        ).where(Event.eng_id == eng_id).order_by(Event.date_heure_prevue)
    )
    for ev in events_result.unique().scalars().all():
        ev_obj = Obj(
            nom=ev.obj.nom,
            description=ev.obj.description,
            cla_id=ev.obj.cla_id,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        db.add(ev_obj)
        await db.flush()
        for v in ev.obj.values:
            db.add(Value(obj_id=ev_obj.id, prop_id=v.prop_id,
                         valeur_texte=v.valeur_texte, valeur_date=v.valeur_date,
                         valeur_nombre=v.valeur_nombre, valeur_bool=v.valeur_bool,
                         valeur_json=v.valeur_json, valeur_ref_obj_id=v.valeur_ref_obj_id))
        db.add(Event(
            obj_id=ev_obj.id,
            eng_id=new_eng.id,
            tevent_id=ev.tevent_id,
            date_heure_prevue=ev.date_heure_prevue + delta,
            date_heure_reelle=None,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        ))

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="eng", entite_id=new_eng.id,
                    apres={"nom": new_obj.nom, "source_eng_id": eng_id})
    await db.commit()

    res = await db.execute(select(Eng).options(*_eng_options()).where(Eng.id == new_eng.id))
    return _to_eng_out(res.unique().scalar_one())


# ─── GET /eng/{id}/gantt ─────────────────────────────────────

@router.get("/{eng_id}/gantt")
async def get_gantt(
    eng_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Eng).where(Eng.id == eng_id))
    eng = result.scalar_one_or_none()
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement introuvable")
    return {"mermaid": eng.gantt_mermaid}
