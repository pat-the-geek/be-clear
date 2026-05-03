"""
Tests des règles métier RF-15 sur les EVENT.
RF-15 : date_heure_prevue d'un EVENT ne peut pas être antérieure à date_debut de l'ENG.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_torg, create_tenv,
    create_user, get_token,
)
from app.models.activity import Teng, Tevent, Eng, Org, Env
from app.models.object import Obj


@pytest.fixture
async def event_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_event")
    cla = await create_cla(db_session, "ClaEvent")
    torg = await create_torg(db_session, "TypeOrgEv", cla.id)
    tenv = await create_tenv(db_session, "TypeEnvEv", cla.id)

    user = await create_user(
        db_session,
        auth_uid="editeur_event",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )

    # TENG et TEVENT
    teng = Teng(nom="TypeEngEv", cla_id=cla.id)
    db_session.add(teng)
    await db_session.flush()

    tevent = Tevent(
        nom="TypeEventEv",
        cla_id=cla.id,
        duree_prevue_valeur=1.0,
        duree_prevue_unite="heures",
    )
    db_session.add(tevent)
    await db_session.flush()

    # ORG
    obj_org = Obj(nom="OrgEv", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_org)
    await db_session.flush()
    org = Org(obj_id=obj_org.id, torg_id=torg.id)
    db_session.add(org)
    await db_session.flush()

    # ENV
    obj_env = Obj(nom="EnvEv", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_env)
    await db_session.flush()
    env = Env(obj_id=obj_env.id, tenv_id=tenv.id)
    db_session.add(env)
    await db_session.flush()

    # ENG avec date_debut = maintenant
    date_debut = datetime.now(timezone.utc)
    obj_eng = Obj(nom="EngEv", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_eng)
    await db_session.flush()
    eng = Eng(
        obj_id=obj_eng.id,
        teng_id=teng.id,
        date_debut=date_debut,
    )
    eng.orgs = [org]
    eng.envs = [env]
    db_session.add(eng)
    await db_session.flush()

    await db_session.commit()
    token = await get_token(user)
    return {
        "token": token,
        "eng_id": eng.id,
        "tevent_id": tevent.id,
        "cla_id": cla.id,
        "date_debut": date_debut.isoformat(),
    }


@pytest.mark.asyncio
async def test_event_date_before_eng_start(client: AsyncClient, event_fixtures):
    """POST /api/event avec date_heure_prevue < date_debut ENG → 400 (RF-15)."""
    # On envoie une date 1 jour AVANT la date de début de l'ENG
    date_avant = (
        datetime.fromisoformat(event_fixtures["date_debut"]) - timedelta(days=1)
    ).isoformat()

    payload = {
        "nom": "Event trop tôt",
        "eng_id": event_fixtures["eng_id"],
        "tevent_id": event_fixtures["tevent_id"],
        "cla_id": event_fixtures["cla_id"],
        "date_heure_prevue": date_avant,
        "values": [],
    }
    response = await client.post(
        "/api/event",
        json=payload,
        headers={"Authorization": f"Bearer {event_fixtures['token']}"},
    )
    assert response.status_code == 400
    assert "RF-15" in response.json()["detail"]


@pytest.mark.asyncio
async def test_event_suggest(client: AsyncClient, event_fixtures):
    """GET /api/event/suggest?eng_id=X → retourne une date suggérée."""
    response = await client.get(
        f"/api/event/suggest?eng_id={event_fixtures['eng_id']}",
        headers={"Authorization": f"Bearer {event_fixtures['token']}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "date_heure_prevue_suggere" in data
    # La valeur doit être parseable comme datetime
    suggested = data["date_heure_prevue_suggere"]
    assert suggested is not None
    datetime.fromisoformat(suggested)  # ne doit pas lever d'exception
