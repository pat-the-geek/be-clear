"""
Service EXPORT — produit un export JSON complet d'une ORG, d'un ENV ou d'un ENG.

Objectif : fournir un document structuré et autonome (OBJ, propriétés/valeurs,
ENGs, EVENTs, images) destiné à des traitements ultérieurs par IA.

Le chargement des relations reprend les patterns d'eager-loading de rpt_service
pour éviter tout accès lazy en contexte asynchrone.
"""
from __future__ import annotations

from datetime import datetime, date, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.config import settings
from app.models.activity import Eng, Env, Event, Org
from app.models.object import Doc, Img, Obj, Value


# ─── Helpers de sérialisation ────────────────────────────────

def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _media_url(chemin: str) -> str:
    return f"{settings.PUBLIC_BASE_URL}/api/media/files/{chemin}"


def _value_brute(v: Value):
    """Retourne la valeur typée et JSON-sérialisable d'une Value."""
    if v.valeur_texte is not None:
        return v.valeur_texte
    if v.valeur_nombre is not None:
        return float(v.valeur_nombre) if isinstance(v.valeur_nombre, Decimal) else v.valeur_nombre
    if v.valeur_bool is not None:
        return v.valeur_bool
    if v.valeur_date is not None:
        return _iso(v.valeur_date)
    if v.valeur_json is not None:
        return v.valeur_json
    if v.valeur_ref_obj_id is not None:
        return {"ref_obj_id": v.valeur_ref_obj_id}
    return None


def _serialize_proprietes(values: list[Value]) -> list[dict]:
    """Tableau des propriétés : une ligne {propriete, type, valeur} par Value."""
    table: list[dict] = []
    for v in sorted(values, key=lambda x: (x.prop.nom if x.prop else "")):
        table.append({
            "propriete": v.prop.nom if v.prop else None,
            "type": v.prop.type if v.prop else None,
            "valeur": _value_brute(v),
        })
    return table


def _serialize_images(images: list[Img]) -> list[dict]:
    return [
        {
            "nom": img.nom_original,
            "url": _media_url(img.chemin),
            "principale": img.est_principale,
        }
        for img in images
    ]


def _serialize_documents(documents: list[Doc]) -> list[dict]:
    return [
        {"nom": doc.nom_original, "url": _media_url(doc.chemin)}
        for doc in documents
    ]


def _serialize_obj(obj: Obj, *, with_documents: bool = True) -> dict:
    data = {
        "uid": str(obj.uid) if isinstance(obj.uid, UUID) else obj.uid,
        "nom": obj.nom,
        "description": obj.description,
        "classe": obj.cla.nom if obj.cla else None,
        "proprietes": _serialize_proprietes(list(obj.values)),
        "images": _serialize_images(list(obj.images)),
        "created_at": _iso(obj.created_at),
        "updated_at": _iso(obj.updated_at),
    }
    if with_documents:
        data["documents"] = _serialize_documents(list(obj.documents))
    return data


def _serialize_event(ev: Event) -> dict:
    return {
        "id": ev.id,
        "nom": ev.obj.nom if ev.obj else None,
        "type": ev.tevent.nom if ev.tevent else None,
        "date_heure_prevue": _iso(ev.date_heure_prevue),
        "date_heure_reelle": _iso(ev.date_heure_reelle),
        "accompli": ev.date_heure_reelle is not None,
        "objet": _serialize_obj(ev.obj, with_documents=False) if ev.obj else None,
    }


def _serialize_eng(eng: Eng) -> dict:
    events = sorted(
        [e for e in eng.events if e.date_heure_prevue],
        key=lambda e: e.date_heure_prevue,
    )
    accomplissement = eng.accomplissement
    if isinstance(accomplissement, Decimal):
        accomplissement = float(accomplissement)
    return {
        "id": eng.id,
        "nom": eng.obj.nom if eng.obj else None,
        "type": eng.teng.nom if eng.teng else None,
        "dates": {
            "debut": _iso(eng.date_debut),
            "debut_prevue": _iso(eng.date_debut_prevue),
            "fin": _iso(eng.date_fin),
            "fin_prevue": _iso(eng.date_fin_prevue),
        },
        "accomplissement": accomplissement,
        "objet": _serialize_obj(eng.obj, with_documents=False) if eng.obj else None,
        "events": [_serialize_event(ev) for ev in events],
    }


# ─── Options d'eager-loading ─────────────────────────────────

def _eng_loader():
    """Options d'eager-loading d'un ENG imbriqué (teng, obj, events)."""
    return (
        joinedload(Eng.teng),
        joinedload(Eng.obj).options(
            joinedload(Obj.cla),
            selectinload(Obj.values).joinedload(Value.prop),
            selectinload(Obj.images),
        ),
        selectinload(Eng.events).options(
            joinedload(Event.tevent),
            joinedload(Event.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
            ),
        ),
    )


# ─── Constructeurs d'export ──────────────────────────────────

async def build_org_export(db: AsyncSession, org_id: int) -> dict:
    result = await db.execute(
        select(Org)
        .options(
            joinedload(Org.torg),
            joinedload(Org.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
                selectinload(Obj.documents),
            ),
            selectinload(Org.engs).options(*_eng_loader()),
        )
        .where(Org.id == org_id)
    )
    org = result.unique().scalar_one_or_none()
    if org is None:
        raise ValueError(f"ORG {org_id} introuvable")

    return {
        "exporte_le": datetime.now(timezone.utc).isoformat(),
        "entite": "ORG",
        "id": org.id,
        "type": org.torg.nom if org.torg else None,
        "objet": _serialize_obj(org.obj),
        "engagements": [_serialize_eng(eng) for eng in org.engs],
    }


async def build_env_export(db: AsyncSession, env_id: int) -> dict:
    result = await db.execute(
        select(Env)
        .options(
            joinedload(Env.tenv),
            joinedload(Env.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
                selectinload(Obj.documents),
            ),
            selectinload(Env.engs).options(*_eng_loader()),
        )
        .where(Env.id == env_id)
    )
    env = result.unique().scalar_one_or_none()
    if env is None:
        raise ValueError(f"ENV {env_id} introuvable")

    return {
        "exporte_le": datetime.now(timezone.utc).isoformat(),
        "entite": "ENV",
        "id": env.id,
        "type": env.tenv.nom if env.tenv else None,
        "objet": _serialize_obj(env.obj),
        "engagements": [_serialize_eng(eng) for eng in env.engs],
    }


async def build_eng_export(db: AsyncSession, eng_id: int) -> dict:
    result = await db.execute(
        select(Eng)
        .options(
            joinedload(Eng.teng),
            joinedload(Eng.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
                selectinload(Obj.documents),
            ),
            selectinload(Eng.events).options(
                joinedload(Event.tevent),
                joinedload(Event.obj).options(
                    joinedload(Obj.cla),
                    selectinload(Obj.values).joinedload(Value.prop),
                    selectinload(Obj.images),
                ),
            ),
            selectinload(Eng.orgs).joinedload(Org.obj),
            selectinload(Eng.envs).joinedload(Env.obj),
        )
        .where(Eng.id == eng_id)
    )
    eng = result.unique().scalar_one_or_none()
    if eng is None:
        raise ValueError(f"ENG {eng_id} introuvable")

    export = {
        "exporte_le": datetime.now(timezone.utc).isoformat(),
        "entite": "ENG",
        **_serialize_eng(eng),
        "organisations": [
            {"id": o.id, "nom": o.obj.nom if o.obj else None}
            for o in eng.orgs
        ],
        "environnements": [
            {"id": e.id, "nom": e.obj.nom if e.obj else None}
            for e in eng.envs
        ],
    }
    return export
