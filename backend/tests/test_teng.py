"""Tests CRUD TENG — types d'engagement."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def teng_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_teng_crud")
    cla = await create_cla(db_session, "ClaTengCrud")
    user = await create_user(db_session, auth_uid="admin_teng_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    return {"headers": {"Authorization": f"Bearer {token}"}, "cla_id": cla.id}


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_teng_create_ok(client: AsyncClient, teng_fixtures):
    r = await client.post("/api/teng",
                          json={"nom": "TengNew", "cla_id": teng_fixtures["cla_id"]},
                          headers=teng_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "TengNew"
    assert data["cla_id"] == teng_fixtures["cla_id"]


@pytest.mark.asyncio
async def test_teng_create_requires_admin(client: AsyncClient, db_session: AsyncSession):
    """Un non-ADMIN ne peut pas créer un TENG."""
    role = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_teng_lecteur")
    cla = await create_cla(db_session, "ClaTengLecteur")
    user = await create_user(db_session, auth_uid="lecteur_teng",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)

    r = await client.post("/api/teng",
                          json={"nom": "TengForbidden", "cla_id": cla.id},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ─── READ / LIST ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_teng_read_ok(client: AsyncClient, teng_fixtures):
    r = await client.post("/api/teng",
                          json={"nom": "TengRead", "cla_id": teng_fixtures["cla_id"]},
                          headers=teng_fixtures["headers"])
    teng_id = r.json()["id"]

    r2 = await client.get(f"/api/teng/{teng_id}", headers=teng_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["id"] == teng_id
    assert r2.json()["nom"] == "TengRead"


@pytest.mark.asyncio
async def test_teng_read_404(client: AsyncClient, teng_fixtures):
    r = await client.get("/api/teng/999999", headers=teng_fixtures["headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_teng_list(client: AsyncClient, teng_fixtures):
    await client.post("/api/teng",
                      json={"nom": "TengForList", "cla_id": teng_fixtures["cla_id"]},
                      headers=teng_fixtures["headers"])
    r = await client.get("/api/teng", headers=teng_fixtures["headers"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    noms = [t["nom"] for t in r.json()]
    assert "TengForList" in noms


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_teng_update_nom(client: AsyncClient, teng_fixtures):
    r = await client.post("/api/teng",
                          json={"nom": "TengUpd", "cla_id": teng_fixtures["cla_id"]},
                          headers=teng_fixtures["headers"])
    teng_id = r.json()["id"]

    r2 = await client.put(f"/api/teng/{teng_id}", json={"nom": "TengUpdated"},
                          headers=teng_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["nom"] == "TengUpdated"


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_teng_delete_ok(client: AsyncClient, teng_fixtures):
    r = await client.post("/api/teng",
                          json={"nom": "TengDel", "cla_id": teng_fixtures["cla_id"]},
                          headers=teng_fixtures["headers"])
    teng_id = r.json()["id"]

    r2 = await client.delete(f"/api/teng/{teng_id}", headers=teng_fixtures["headers"])
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_teng_delete_404(client: AsyncClient, teng_fixtures):
    r = await client.delete("/api/teng/999999", headers=teng_fixtures["headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_teng_delete_blocked_rf08(client: AsyncClient, teng_fixtures):
    """RF-08 : suppression d'un TENG bloquée si des ENG lui sont rattachés."""
    h = teng_fixtures["headers"]
    cla_id = teng_fixtures["cla_id"]

    # Créer un TENG dédié
    r = await client.post("/api/teng", json={"nom": "TengRF08", "cla_id": cla_id}, headers=h)
    assert r.status_code == 201
    teng_id = r.json()["id"]

    # Créer TORG → ORG
    r = await client.post("/api/torg", json={"nom": "TorgRF08", "cla_id": cla_id}, headers=h)
    assert r.status_code == 201
    torg_id = r.json()["id"]
    r = await client.post("/api/org", json={"nom": "OrgRF08", "torg_id": torg_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    assert r.status_code == 201
    org_id = r.json()["id"]

    # Créer TENV → ENV
    r = await client.post("/api/tenv", json={"nom": "TenvRF08", "cla_id": cla_id}, headers=h)
    assert r.status_code == 201
    tenv_id = r.json()["id"]
    r = await client.post("/api/env", json={"nom": "EnvRF08", "tenv_id": tenv_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    assert r.status_code == 201
    env_id = r.json()["id"]

    # Créer un ENG rattaché à ce TENG
    r = await client.post("/api/eng", json={
        "nom": "EngRF08", "teng_id": teng_id, "cla_id": cla_id,
        "org_ids": [org_id], "env_ids": [env_id], "values": [],
    }, headers=h)
    assert r.status_code == 201
    eng_id = r.json()["id"]

    # La suppression du TENG doit être bloquée (400)
    r = await client.delete(f"/api/teng/{teng_id}", headers=h)
    assert r.status_code == 400
    assert "RF-08" in r.json()["detail"]

    # Nettoyage
    await client.delete(f"/api/eng/{eng_id}", headers=h)
    await client.delete(f"/api/env/{env_id}", headers=h)
    await client.delete(f"/api/org/{org_id}", headers=h)
    await client.delete(f"/api/teng/{teng_id}", headers=h)
