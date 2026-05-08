"""Tests CRUD TEVENT — types d'événement."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def tevent_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_tevent_crud")
    cla = await create_cla(db_session, "ClaTeventCrud")
    user = await create_user(db_session, auth_uid="admin_tevent_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    return {"headers": {"Authorization": f"Bearer {token}"}, "cla_id": cla.id}


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tevent_create_ok(client: AsyncClient, tevent_fixtures):
    r = await client.post("/api/tevent",
                          json={"nom": "TeventNew", "cla_id": tevent_fixtures["cla_id"],
                                "duree_prevue_valeur": 2.0, "duree_prevue_unite": "heures"},
                          headers=tevent_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "TeventNew"
    assert data["duree_prevue_valeur"] == 2.0
    assert data["duree_prevue_unite"] == "heures"


@pytest.mark.asyncio
async def test_tevent_create_no_duree(client: AsyncClient, tevent_fixtures):
    """Un TEVENT peut être créé sans durée prévue."""
    r = await client.post("/api/tevent",
                          json={"nom": "TeventNoDuree", "cla_id": tevent_fixtures["cla_id"]},
                          headers=tevent_fixtures["headers"])
    assert r.status_code == 201
    assert r.json()["duree_prevue_valeur"] is None
    assert r.json()["duree_prevue_unite"] is None


@pytest.mark.asyncio
async def test_tevent_create_requires_admin(client: AsyncClient, db_session: AsyncSession):
    """Un non-ADMIN ne peut pas créer un TEVENT."""
    role = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_tevent_lecteur")
    cla = await create_cla(db_session, "ClaTeventLecteur")
    user = await create_user(db_session, auth_uid="lecteur_tevent",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)

    r = await client.post("/api/tevent",
                          json={"nom": "TeventForbidden", "cla_id": cla.id},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ─── READ / LIST ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tevent_read_ok(client: AsyncClient, tevent_fixtures):
    r = await client.post("/api/tevent",
                          json={"nom": "TeventRead", "cla_id": tevent_fixtures["cla_id"]},
                          headers=tevent_fixtures["headers"])
    tevent_id = r.json()["id"]

    r2 = await client.get(f"/api/tevent/{tevent_id}", headers=tevent_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["id"] == tevent_id
    assert r2.json()["nom"] == "TeventRead"


@pytest.mark.asyncio
async def test_tevent_read_404(client: AsyncClient, tevent_fixtures):
    r = await client.get("/api/tevent/999999", headers=tevent_fixtures["headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_tevent_list(client: AsyncClient, tevent_fixtures):
    await client.post("/api/tevent",
                      json={"nom": "TeventForList", "cla_id": tevent_fixtures["cla_id"]},
                      headers=tevent_fixtures["headers"])
    r = await client.get("/api/tevent", headers=tevent_fixtures["headers"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    noms = [t["nom"] for t in r.json()]
    assert "TeventForList" in noms


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tevent_update_duree(client: AsyncClient, tevent_fixtures):
    r = await client.post("/api/tevent",
                          json={"nom": "TeventUpd", "cla_id": tevent_fixtures["cla_id"],
                                "duree_prevue_valeur": 1.0, "duree_prevue_unite": "jours"},
                          headers=tevent_fixtures["headers"])
    tevent_id = r.json()["id"]

    r2 = await client.put(f"/api/tevent/{tevent_id}",
                          json={"duree_prevue_valeur": 3.0, "duree_prevue_unite": "heures"},
                          headers=tevent_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["duree_prevue_valeur"] == 3.0
    assert r2.json()["duree_prevue_unite"] == "heures"


@pytest.mark.asyncio
async def test_tevent_update_nom(client: AsyncClient, tevent_fixtures):
    r = await client.post("/api/tevent",
                          json={"nom": "TeventUpdNom", "cla_id": tevent_fixtures["cla_id"]},
                          headers=tevent_fixtures["headers"])
    tevent_id = r.json()["id"]

    r2 = await client.put(f"/api/tevent/{tevent_id}", json={"nom": "TeventUpdatedNom"},
                          headers=tevent_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["nom"] == "TeventUpdatedNom"


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tevent_delete_ok(client: AsyncClient, tevent_fixtures):
    r = await client.post("/api/tevent",
                          json={"nom": "TeventDel", "cla_id": tevent_fixtures["cla_id"]},
                          headers=tevent_fixtures["headers"])
    tevent_id = r.json()["id"]

    r2 = await client.delete(f"/api/tevent/{tevent_id}", headers=tevent_fixtures["headers"])
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_tevent_delete_404(client: AsyncClient, tevent_fixtures):
    r = await client.delete("/api/tevent/999999", headers=tevent_fixtures["headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_tevent_delete_blocked_rf09(client: AsyncClient, tevent_fixtures):
    """RF-09 : suppression d'un TEVENT bloquée si des EVENT lui sont rattachés."""
    h = tevent_fixtures["headers"]
    cla_id = tevent_fixtures["cla_id"]

    # Créer un TEVENT dédié
    r = await client.post("/api/tevent", json={"nom": "TeventRF09", "cla_id": cla_id,
                                               "duree_prevue_valeur": 1.0,
                                               "duree_prevue_unite": "heures"}, headers=h)
    assert r.status_code == 201
    tevent_id = r.json()["id"]

    # Créer la hiérarchie TORG→ORG, TENV→ENV, TENG→ENG
    r = await client.post("/api/torg", json={"nom": "TorgRF09", "cla_id": cla_id}, headers=h)
    torg_id = r.json()["id"]
    r = await client.post("/api/org", json={"nom": "OrgRF09", "torg_id": torg_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    org_id = r.json()["id"]
    r = await client.post("/api/tenv", json={"nom": "TenvRF09", "cla_id": cla_id}, headers=h)
    tenv_id = r.json()["id"]
    r = await client.post("/api/env", json={"nom": "EnvRF09", "tenv_id": tenv_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    env_id = r.json()["id"]
    r = await client.post("/api/teng", json={"nom": "TengRF09", "cla_id": cla_id}, headers=h)
    teng_id = r.json()["id"]
    r = await client.post("/api/eng", json={
        "nom": "EngRF09", "teng_id": teng_id, "cla_id": cla_id,
        "org_ids": [org_id], "env_ids": [env_id], "values": [],
    }, headers=h)
    assert r.status_code == 201
    eng_id = r.json()["id"]

    # Créer un EVENT rattaché à ce TEVENT
    r = await client.post("/api/event", json={
        "eng_id": eng_id, "tevent_id": tevent_id,
        "nom": "EventRF09", "cla_id": cla_id,
        "date_heure_prevue": "2026-06-01T10:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201
    event_id = r.json()["id"]

    # La suppression du TEVENT doit être bloquée (400)
    r = await client.delete(f"/api/tevent/{tevent_id}", headers=h)
    assert r.status_code == 400
    assert "RF-09" in r.json()["detail"]

    # Nettoyage
    await client.delete(f"/api/event/{event_id}", headers=h)
    await client.delete(f"/api/eng/{eng_id}", headers=h)
    await client.delete(f"/api/env/{env_id}", headers=h)
    await client.delete(f"/api/org/{org_id}", headers=h)
    await client.delete(f"/api/tevent/{tevent_id}", headers=h)
