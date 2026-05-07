"""
Tests CRUD EVENT.
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
from app.models.activity import Teng, Tevent, Org, Env, Eng
from app.models.object import Obj


@pytest.fixture
async def event_crud_fixtures(client: AsyncClient, db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_event_crud")
    cla = await create_cla(db_session, "ClaEventCrud")
    torg = await create_torg(db_session, "TorgEventCrud", cla.id)
    tenv = await create_tenv(db_session, "TenvEventCrud", cla.id)

    teng = Teng(nom="TengEventCrud", cla_id=cla.id)
    db_session.add(teng)
    await db_session.flush()

    tevent = Tevent(nom="TeventCrud", cla_id=cla.id,
                    duree_prevue_valeur=1.0, duree_prevue_unite="heures")
    db_session.add(tevent)
    await db_session.flush()

    user = await create_user(db_session, auth_uid="editeur_event_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    headers = {"Authorization": f"Bearer {token}"}

    # ORG + ENV via API
    r_org = await client.post("/api/org",
                              json={"nom": "OrgEvCrud", "torg_id": torg.id,
                                    "cla_id": cla.id, "values": []},
                              headers=headers)
    org_id = r_org.json()["id"]

    r_env = await client.post("/api/env",
                              json={"nom": "EnvEvCrud", "tenv_id": tenv.id,
                                    "cla_id": cla.id, "values": []},
                              headers=headers)
    env_id = r_env.json()["id"]

    # ENG avec date_debut pour pouvoir créer des EVENTs valides
    date_debut = "2026-01-01T00:00:00+00:00"
    r_eng = await client.post("/api/eng",
                              json={"nom": "EngEvCrud", "teng_id": teng.id,
                                    "cla_id": cla.id, "org_ids": [org_id],
                                    "env_ids": [env_id], "date_debut": date_debut,
                                    "values": []},
                              headers=headers)
    assert r_eng.status_code == 201
    eng_id = r_eng.json()["id"]

    return {
        "token": token,
        "headers": headers,
        "cla_id": cla.id,
        "tevent_id": tevent.id,
        "eng_id": eng_id,
    }


def _event_payload(f: dict, nom: str = "EventTest",
                   date: str = "2026-01-10T09:00:00+00:00") -> dict:
    return {
        "nom": nom,
        "tevent_id": f["tevent_id"],
        "eng_id": f["eng_id"],
        "cla_id": f["cla_id"],
        "date_heure_prevue": date,
        "values": [],
    }


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_event_create_ok(client: AsyncClient, event_crud_fixtures):
    r = await client.post("/api/event", json=_event_payload(event_crud_fixtures),
                          headers=event_crud_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["eng_id"] == event_crud_fixtures["eng_id"]
    assert data["est_accompli"] is False


@pytest.mark.asyncio
async def test_event_create_before_eng_start_blocked(
    client: AsyncClient, event_crud_fixtures
):
    """RF-15 : EVENT avant date_debut ENG → 400."""
    r = await client.post(
        "/api/event",
        json=_event_payload(event_crud_fixtures, date="2025-12-31T09:00:00+00:00"),
        headers=event_crud_fixtures["headers"],
    )
    assert r.status_code == 400
    assert "RF-15" in r.json()["detail"]


# ─── READ ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_event_read_ok(client: AsyncClient, event_crud_fixtures):
    r = await client.post("/api/event", json=_event_payload(event_crud_fixtures, "EvRead"),
                          headers=event_crud_fixtures["headers"])
    ev_id = r.json()["id"]

    r2 = await client.get(f"/api/event/{ev_id}", headers=event_crud_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["id"] == ev_id


@pytest.mark.asyncio
async def test_event_read_404(client: AsyncClient, event_crud_fixtures):
    r = await client.get("/api/event/999999", headers=event_crud_fixtures["headers"])
    assert r.status_code == 404


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_event_update_nom(client: AsyncClient, event_crud_fixtures):
    r = await client.post("/api/event", json=_event_payload(event_crud_fixtures, "EvUpd"),
                          headers=event_crud_fixtures["headers"])
    ev_id = r.json()["id"]

    r2 = await client.put(f"/api/event/{ev_id}",
                          json={"nom": "EvUpdated"},
                          headers=event_crud_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["obj"]["nom"] == "EvUpdated"


@pytest.mark.asyncio
async def test_event_accomplish(client: AsyncClient, event_crud_fixtures):
    """Renseigner date_heure_reelle marque l'EVENT comme accompli."""
    r = await client.post("/api/event",
                          json=_event_payload(event_crud_fixtures, "EvAccomp"),
                          headers=event_crud_fixtures["headers"])
    ev_id = r.json()["id"]

    r2 = await client.put(
        f"/api/event/{ev_id}",
        json={"date_heure_reelle": "2026-01-10T10:30:00+00:00"},
        headers=event_crud_fixtures["headers"],
    )
    assert r2.status_code == 200
    assert r2.json()["est_accompli"] is True
    assert r2.json()["date_heure_reelle"] is not None


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_event_delete_ok(client: AsyncClient, event_crud_fixtures):
    r = await client.post("/api/event", json=_event_payload(event_crud_fixtures, "EvDel"),
                          headers=event_crud_fixtures["headers"])
    ev_id = r.json()["id"]

    r2 = await client.delete(f"/api/event/{ev_id}",
                             headers=event_crud_fixtures["headers"])
    assert r2.status_code == 204

    r3 = await client.get(f"/api/event/{ev_id}",
                          headers=event_crud_fixtures["headers"])
    assert r3.status_code == 404
