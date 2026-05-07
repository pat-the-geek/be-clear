"""
Tests CRUD CLA + gestion des PROP.
Toutes les opérations d'écriture sur CLA requièrent le rôle ADMIN.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def cla_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_cla_crud")
    cla_seed = await create_cla(db_session, "ClaCrudSeed")
    user = await create_user(db_session, auth_uid="admin_cla_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla_seed.id)
    await db_session.commit()
    token = await get_token(user)
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}}


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cla_create_ok(client: AsyncClient, cla_fixtures):
    r = await client.post("/api/cla", json={"nom": "ClaNew"},
                          headers=cla_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "ClaNew"
    assert data["props"] == []


@pytest.mark.asyncio
async def test_cla_create_with_parent(client: AsyncClient, cla_fixtures):
    r_parent = await client.post("/api/cla", json={"nom": "ClaParent"},
                                 headers=cla_fixtures["headers"])
    parent_id = r_parent.json()["id"]

    r_child = await client.post("/api/cla",
                                json={"nom": "ClaChild", "super_classe_id": parent_id},
                                headers=cla_fixtures["headers"])
    assert r_child.status_code == 201
    assert r_child.json()["super_classe_id"] == parent_id


# ─── READ ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cla_read_ok(client: AsyncClient, cla_fixtures):
    r = await client.post("/api/cla", json={"nom": "ClaRead"},
                          headers=cla_fixtures["headers"])
    cla_id = r.json()["id"]

    r2 = await client.get(f"/api/cla/{cla_id}", headers=cla_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["id"] == cla_id
    assert r2.json()["nom"] == "ClaRead"


@pytest.mark.asyncio
async def test_cla_read_404(client: AsyncClient, cla_fixtures):
    r = await client.get("/api/cla/999999", headers=cla_fixtures["headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_cla_list(client: AsyncClient, cla_fixtures):
    r = await client.get("/api/cla", headers=cla_fixtures["headers"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cla_update_nom(client: AsyncClient, cla_fixtures):
    r = await client.post("/api/cla", json={"nom": "ClaUpd"},
                          headers=cla_fixtures["headers"])
    cla_id = r.json()["id"]

    r2 = await client.put(f"/api/cla/{cla_id}",
                          json={"nom": "ClaUpdated"},
                          headers=cla_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["nom"] == "ClaUpdated"


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cla_delete_empty_ok(client: AsyncClient, cla_fixtures):
    """Supprimer une CLA sans OBJ ni sous-classe → 204."""
    r = await client.post("/api/cla", json={"nom": "ClaDel"},
                          headers=cla_fixtures["headers"])
    cla_id = r.json()["id"]

    r2 = await client.delete(f"/api/cla/{cla_id}", headers=cla_fixtures["headers"])
    assert r2.status_code == 204


# ─── PROP ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cla_add_prop(client: AsyncClient, cla_fixtures):
    r = await client.post("/api/cla", json={"nom": "ClaProps"},
                          headers=cla_fixtures["headers"])
    cla_id = r.json()["id"]

    r2 = await client.post(f"/api/cla/{cla_id}/prop",
                           json={"nom": "Date de naissance", "type": "DATE"},
                           headers=cla_fixtures["headers"])
    assert r2.status_code == 201
    data = r2.json()
    assert data["nom"] == "Date de naissance"
    assert data["type"] == "DATE"
    assert data["cla_id"] == cla_id


@pytest.mark.asyncio
async def test_cla_delete_prop(client: AsyncClient, cla_fixtures):
    r = await client.post("/api/cla", json={"nom": "ClaDelProp"},
                          headers=cla_fixtures["headers"])
    cla_id = r.json()["id"]

    r_prop = await client.post(f"/api/cla/{cla_id}/prop",
                               json={"nom": "Champ à supprimer", "type": "TEXTE"},
                               headers=cla_fixtures["headers"])
    prop_id = r_prop.json()["id"]

    r2 = await client.delete(f"/api/cla/{cla_id}/prop/{prop_id}",
                             headers=cla_fixtures["headers"])
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_cla_props_all_includes_inherited(client: AsyncClient, cla_fixtures):
    """GET /cla/{id}/props-all retourne les PROP héritées de la super-classe."""
    r_parent = await client.post("/api/cla", json={"nom": "ClaBaseProps"},
                                 headers=cla_fixtures["headers"])
    parent_id = r_parent.json()["id"]
    await client.post(f"/api/cla/{parent_id}/prop",
                      json={"nom": "PropParent", "type": "TEXTE"},
                      headers=cla_fixtures["headers"])

    r_child = await client.post("/api/cla",
                                json={"nom": "ClaChildProps", "super_classe_id": parent_id},
                                headers=cla_fixtures["headers"])
    child_id = r_child.json()["id"]
    await client.post(f"/api/cla/{child_id}/prop",
                      json={"nom": "PropEnfant", "type": "ENTIER"},
                      headers=cla_fixtures["headers"])

    r_all = await client.get(f"/api/cla/{child_id}/props-all",
                             headers=cla_fixtures["headers"])
    assert r_all.status_code == 200
    noms = [p["nom"] for p in r_all.json()]
    assert "PropParent" in noms
    assert "PropEnfant" in noms
