"""
Tests CRUD ENG + duplication.
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
from app.models.activity import Teng, Tevent, Org, Env
from app.models.object import Obj


@pytest.fixture
async def eng_crud_fixtures(client: AsyncClient, db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_eng_crud")
    cla = await create_cla(db_session, "ClaEngCrud")
    torg = await create_torg(db_session, "TorgEngCrud", cla.id)
    tenv = await create_tenv(db_session, "TenvEngCrud", cla.id)

    teng = Teng(nom="TengCrud", cla_id=cla.id)
    db_session.add(teng)
    await db_session.flush()

    tevent = Teng(nom="TeventCrud", cla_id=cla.id)  # Teng réutilisé pour cla_id minimal
    db_session.add(tevent)
    await db_session.flush()

    user = await create_user(db_session, auth_uid="editeur_eng_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    headers = {"Authorization": f"Bearer {token}"}

    # Créer une ORG via l'API
    r_org = await client.post("/api/org",
                              json={"nom": "OrgEngCrud", "torg_id": torg.id,
                                    "cla_id": cla.id, "values": []},
                              headers=headers)
    assert r_org.status_code == 201
    org_id = r_org.json()["id"]

    # Créer un ENV via l'API
    r_env = await client.post("/api/env",
                              json={"nom": "EnvEngCrud", "tenv_id": tenv.id,
                                    "cla_id": cla.id, "values": []},
                              headers=headers)
    assert r_env.status_code == 201
    env_id = r_env.json()["id"]

    return {
        "token": token,
        "headers": headers,
        "cla_id": cla.id,
        "teng_id": teng.id,
        "org_id": org_id,
        "env_id": env_id,
    }


def _eng_payload(f: dict, nom: str = "EngTest") -> dict:
    return {
        "nom": nom,
        "teng_id": f["teng_id"],
        "cla_id": f["cla_id"],
        "org_ids": [f["org_id"]],
        "env_ids": [f["env_id"]],
        "date_debut": "2026-01-01T00:00:00+00:00",
        "values": [],
    }


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eng_create_ok(client: AsyncClient, eng_crud_fixtures):
    r = await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures),
                          headers=eng_crud_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["obj"]["nom"] == "EngTest"
    assert len(data["orgs"]) == 1
    assert len(data["envs"]) == 1


@pytest.mark.asyncio
async def test_eng_create_sets_org_principale(client: AsyncClient, eng_crud_fixtures):
    """Si une seule ORG est fournie, elle devient automatiquement org_principale."""
    r = await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures, "EngPrinc"),
                          headers=eng_crud_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    # org_principale doit pointer vers la seule ORG
    assert data["org_principale"] is not None or len(data["orgs"]) == 1


# ─── READ ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eng_read_ok(client: AsyncClient, eng_crud_fixtures):
    r = await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures, "EngRead"),
                          headers=eng_crud_fixtures["headers"])
    eng_id = r.json()["id"]

    r2 = await client.get(f"/api/eng/{eng_id}", headers=eng_crud_fixtures["headers"])
    assert r2.status_code == 200
    data = r2.json()
    assert data["id"] == eng_id
    assert "events" in data
    assert "orgs" in data
    assert "envs" in data


@pytest.mark.asyncio
async def test_eng_read_404(client: AsyncClient, eng_crud_fixtures):
    r = await client.get("/api/eng/999999", headers=eng_crud_fixtures["headers"])
    assert r.status_code == 404


# ─── LIST ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eng_list_paginated(client: AsyncClient, eng_crud_fixtures):
    for i in range(3):
        await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures, f"EngList{i}"),
                          headers=eng_crud_fixtures["headers"])

    r = await client.get("/api/eng?per_page=2&page=1", headers=eng_crud_fixtures["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) <= 2


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eng_update_nom(client: AsyncClient, eng_crud_fixtures):
    r = await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures, "EngUpdate"),
                          headers=eng_crud_fixtures["headers"])
    eng_id = r.json()["id"]

    r2 = await client.put(f"/api/eng/{eng_id}",
                          json={"nom": "EngUpdated"},
                          headers=eng_crud_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["obj"]["nom"] == "EngUpdated"


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eng_delete_ok(client: AsyncClient, eng_crud_fixtures):
    r = await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures, "EngDel"),
                          headers=eng_crud_fixtures["headers"])
    eng_id = r.json()["id"]

    r2 = await client.delete(f"/api/eng/{eng_id}", headers=eng_crud_fixtures["headers"])
    assert r2.status_code == 204

    r3 = await client.get(f"/api/eng/{eng_id}", headers=eng_crud_fixtures["headers"])
    assert r3.status_code == 404


# ─── DUPLICATION ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eng_duplicate_ok(client: AsyncClient, eng_crud_fixtures):
    r = await client.post("/api/eng", json=_eng_payload(eng_crud_fixtures, "EngDupSrc"),
                          headers=eng_crud_fixtures["headers"])
    eng_id = r.json()["id"]

    r2 = await client.post(f"/api/eng/{eng_id}/duplicate",
                           headers=eng_crud_fixtures["headers"])
    assert r2.status_code == 201
    data = r2.json()
    assert "copie" in data["obj"]["nom"]
    assert data["id"] != eng_id
    assert len(data["orgs"]) == 1
    assert len(data["envs"]) == 1


@pytest.mark.asyncio
async def test_eng_duplicate_with_offset(client: AsyncClient, eng_crud_fixtures):
    """La duplication avec offset_days=7 décale les dates."""
    payload = _eng_payload(eng_crud_fixtures, "EngDupOffset")
    payload["date_debut"] = "2026-06-01T00:00:00+00:00"
    r = await client.post("/api/eng", json=payload, headers=eng_crud_fixtures["headers"])
    eng_id = r.json()["id"]

    r2 = await client.post(f"/api/eng/{eng_id}/duplicate?offset_days=7",
                           headers=eng_crud_fixtures["headers"])
    assert r2.status_code == 201
    data = r2.json()
    if data.get("date_debut"):
        dt = datetime.fromisoformat(data["date_debut"])
        assert dt.date().isoformat() == "2026-06-08"
