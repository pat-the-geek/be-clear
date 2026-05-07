"""
Tests des règles métier RF-13 sur les ENG.
RF-13 : modifier date_debut d'un ENG vérifie la cohérence avec les EVENTs existants.
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
from app.models.activity import Teng, Tevent, Eng, Org, Env, Event
from app.models.object import Obj


@pytest.fixture
async def rf13_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_rf13")
    cla = await create_cla(db_session, "ClaRf13")
    torg = await create_torg(db_session, "TypeOrgRf13", cla.id)
    tenv = await create_tenv(db_session, "TypeEnvRf13", cla.id)
    user = await create_user(db_session, auth_uid="editeur_rf13", tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)

    teng = Teng(nom="TypeEngRf13", cla_id=cla.id)
    db_session.add(teng)
    await db_session.flush()

    tevent = Tevent(nom="TypeEventRf13", cla_id=cla.id, duree_prevue_valeur=1.0, duree_prevue_unite="heures")
    db_session.add(tevent)
    await db_session.flush()

    obj_org = Obj(nom="OrgRf13", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_org)
    await db_session.flush()
    org = Org(obj_id=obj_org.id, torg_id=torg.id)
    db_session.add(org)
    await db_session.flush()

    obj_env = Obj(nom="EnvRf13", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_env)
    await db_session.flush()
    env = Env(obj_id=obj_env.id, tenv_id=tenv.id)
    db_session.add(env)
    await db_session.flush()

    date_debut = datetime(2025, 1, 10, 0, 0, 0, tzinfo=timezone.utc)
    obj_eng = Obj(nom="EngRf13", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_eng)
    await db_session.flush()
    eng = Eng(obj_id=obj_eng.id, teng_id=teng.id, date_debut=date_debut)
    eng.orgs = [org]
    eng.envs = [env]
    db_session.add(eng)
    await db_session.flush()

    # Un EVENT prévu le 2025-01-15
    obj_ev = Obj(nom="EventRf13", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_ev)
    await db_session.flush()
    event = Event(
        obj_id=obj_ev.id,
        eng_id=eng.id,
        tevent_id=tevent.id,
        date_heure_prevue=datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add(event)
    await db_session.flush()

    await db_session.commit()
    token = await get_token(user)
    return {"token": token, "eng_id": eng.id, "event_id": event.id}


@pytest.mark.asyncio
async def test_rf13_move_date_debut_forward_blocked(client: AsyncClient, rf13_fixtures):
    """RF-13 : avancer date_debut après les EVENTs existants → 400."""
    payload = {"date_debut": "2025-01-20T00:00:00+00:00"}
    response = await client.put(
        f"/api/eng/{rf13_fixtures['eng_id']}",
        json=payload,
        headers={"Authorization": f"Bearer {rf13_fixtures['token']}"},
    )
    assert response.status_code == 400
    assert "RF-13" in response.json()["detail"]


@pytest.mark.asyncio
async def test_rf13_move_date_debut_backward_ok(client: AsyncClient, rf13_fixtures):
    """RF-13 : reculer date_debut (avant les EVENTs) → accepté."""
    payload = {"date_debut": "2025-01-01T00:00:00+00:00"}
    response = await client.put(
        f"/api/eng/{rf13_fixtures['eng_id']}",
        json=payload,
        headers={"Authorization": f"Bearer {rf13_fixtures['token']}"},
    )
    assert response.status_code == 200
