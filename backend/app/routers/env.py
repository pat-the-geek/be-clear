from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_editeur
from app.models.activity import Env, User, Tenv
from app.models.object import Obj, Cla, Value, Img, Doc
from app.schemas.env import EnvOut, EnvBrief, EnvCreate, EnvUpdate
from app.schemas.common import Paginated
from app.services.log import write_log
from app.services.search_service import index_obj, delete_obj

router = APIRouter()


# ─── Chargement complet d'un ENV ─────────────────────────────

def _env_options():
    return [
        joinedload(Env.tenv).joinedload(Tenv.cla),
        joinedload(Env.obj).options(
            joinedload(Obj.cla).selectinload(Cla.props),
            selectinload(Obj.values).joinedload(Value.prop),
            selectinload(Obj.images),
            selectinload(Obj.documents),
            joinedload(Obj.created_by).joinedload(User.obj),
            joinedload(Obj.updated_by).joinedload(User.obj),
        ),
    ]


# ─── GET /env ────────────────────────────────────────────────

@router.get("", response_model=Paginated[EnvBrief])
async def list_envs(
    tenv_id: int | None = Query(None),
    q: str | None = Query(None, description="Recherche sur le nom (insensible à la casse)"),
    created_by_me: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Env).options(*_env_options())
    if tenv_id:
        tenv = await db.get(Tenv, tenv_id, options=[joinedload(Tenv.cla)])
        if tenv and tenv.cla and tenv.cla.sous_classes_ids:
            cla_ids: list[int] = tenv.cla.sous_classes_ids
            tenv_ids_result = await db.execute(
                select(Tenv.id).where(Tenv.cla_id.in_(cla_ids))
            )
            tenv_ids = [r[0] for r in tenv_ids_result.all()]
            stmt = stmt.where(Env.tenv_id.in_(tenv_ids))
        else:
            stmt = stmt.where(Env.tenv_id == tenv_id)
    if q:
        stmt = stmt.where(Env.obj_id.in_(
            select(Obj.id).where(Obj.nom.ilike(f"%{q.strip()}%"))
        ))
    if created_by_me:
        stmt = stmt.where(Env.created_by_id == current_user.id)

    total_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = total_result.scalar_one()

    nom_subq = select(Obj.nom).where(Obj.id == Env.obj_id).correlate(Env).scalar_subquery()
    stmt = stmt.order_by(nom_subq).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    envs = result.unique().scalars().all()

    items = []
    for env in envs:
        img = next((i for i in env.obj.images if i.est_principale), None)
        items.append(EnvBrief(
            id=env.id,
            nom=env.obj.nom,
            tenv=env.tenv,
            image_principale=img,
            updated_at=env.obj.updated_at,
        ))

    return Paginated(items=items, total=total, page=page, per_page=per_page)


# ─── GET /env/{id} ───────────────────────────────────────────

@router.get("/{env_id}", response_model=EnvOut)
async def get_env(
    env_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Env).options(*_env_options()).where(Env.id == env_id)
    )
    env = result.unique().scalar_one_or_none()
    if env is None:
        raise HTTPException(status_code=404, detail="Environnement introuvable")
    return env


# ─── POST /env ───────────────────────────────────────────────

@router.post("", response_model=EnvOut, status_code=status.HTTP_201_CREATED)
async def create_env(
    body: EnvCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    # Vérifier que le TENV existe
    tenv = await db.get(Tenv, body.tenv_id)
    if tenv is None:
        raise HTTPException(status_code=400, detail="TENV introuvable")

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

    # Créer l'ENV
    env = Env(
        obj_id=obj.id,
        tenv_id=body.tenv_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(env)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="env", entite_id=env.id,
                    apres={"nom": body.nom, "tenv_id": body.tenv_id})
    await db.commit()

    # Recharger avec toutes les relations
    result = await db.execute(
        select(Env).options(*_env_options()).where(Env.id == env.id)
    )
    env = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=env.obj_id,
            nom=env.obj.nom,
            description=env.obj.description,
            values_text=[v.valeur_texte for v in env.obj.values if v.valeur_texte],
            entity_type="env",
            cla_nom=env.obj.cla.nom,
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=env.obj.nom,
            description=env.obj.description,
            values_text=[v.valeur_texte for v in env.obj.values if v.valeur_texte],
            entity_type="env",
        )
        await upsert_embedding(db, env.obj_id, embed_txt)
    except Exception:
        pass

    return env


# ─── PUT /env/{id} ───────────────────────────────────────────

@router.put("/{env_id}", response_model=EnvOut)
async def update_env(
    env_id: int,
    body: EnvUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(
        select(Env).options(*_env_options()).where(Env.id == env_id)
    )
    env = result.unique().scalar_one_or_none()
    if env is None:
        raise HTTPException(status_code=404, detail="Environnement introuvable")

    avant = {"nom": env.obj.nom, "tenv_id": env.tenv_id}

    if body.nom is not None:
        env.obj.nom = body.nom
    if body.description is not None:
        env.obj.description = body.description
    if body.tenv_id is not None:
        env.tenv_id = body.tenv_id
    env.obj.updated_by_id = current_user.id

    # ── Mise à jour des VALUES ──────────────────────────────────
    # Utiliser directement les instances déjà chargées par selectinload
    value_map = {v.prop_id: v for v in env.obj.values}

    for vin in body.values:
        value = value_map.get(vin.prop_id)
        if value is None:
            value = Value(obj_id=env.obj_id, prop_id=vin.prop_id,
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
                    table_name="env", entite_id=env_id, avant=avant,
                    apres={"nom": env.obj.nom, "tenv_id": env.tenv_id})
    await db.commit()

    result = await db.execute(
        select(Env).options(*_env_options()).where(Env.id == env_id)
    )
    env = result.unique().scalar_one()

    try:
        await index_obj(
            obj_id=env.obj_id,
            nom=env.obj.nom,
            description=env.obj.description,
            values_text=[v.valeur_texte for v in env.obj.values if v.valeur_texte],
            entity_type="env",
            cla_nom=env.obj.cla.nom,
        )
    except Exception:
        pass

    # ─── Embedding RAG ─────────────────────────────────────────
    try:
        from app.services.embedding_service import upsert_embedding, build_embed_text
        embed_txt = build_embed_text(
            nom=env.obj.nom,
            description=env.obj.description,
            values_text=[v.valeur_texte for v in env.obj.values if v.valeur_texte],
            entity_type="env",
        )
        await upsert_embedding(db, env.obj_id, embed_txt)
    except Exception:
        pass

    return env


# ─── DELETE /env/{id} ────────────────────────────────────────

@router.delete("/{env_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_env(
    env_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    result = await db.execute(select(Env).where(Env.id == env_id))
    env = result.scalar_one_or_none()
    if env is None:
        raise HTTPException(status_code=404, detail="Environnement introuvable")

    try:
        await delete_obj(env.obj_id)
    except Exception:
        pass

    try:
        from app.services.embedding_service import delete_embedding
        await delete_embedding(db, env.obj_id)
    except Exception:
        pass

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="env", entite_id=env_id,
                    avant={"env_id": env_id})
    await db.delete(env)
    await db.commit()


# ─── POST /env/{id}/rpt ──────────────────────────────────────

@router.post("/{env_id}/rpt", status_code=status.HTTP_200_OK)
async def generate_rpt_env(
    env_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editeur),
):
    # Vérifier que l'ENV existe
    result = await db.execute(select(Env).where(Env.id == env_id))
    env = result.scalar_one_or_none()
    if env is None:
        raise HTTPException(status_code=404, detail="Environnement introuvable")

    return {"status": "not_implemented"}
