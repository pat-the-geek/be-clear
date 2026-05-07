"""Tests CRUD TORG — types d'organisation."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def torg_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_torg_crud")
    cla = await create_cla(db_session, "ClaTorgCrud")
    user = await create_user(db_session, auth_uid="admin_torg_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    return {"headers": {"Authorization": f"Bearer {token}"}, "cla_id": cla.id}


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_torg_create_ok(client: AsyncClient, torg_fixtures):
    r = await client.post("/api/torg", json={"nom": "TorgNew"},
                          headers=torg_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "TorgNew"
    assert data["parent_id"] is None


@pytest.mark.asyncio
async def test_torg_create_with_cla(client: AsyncClient, torg_fixtures):
    r = await client.post("/api/torg",
                          json={"nom": "TorgWithCla", "cla_id": torg_fixtures["cla_id"]},
                          headers=torg_fixtures["headers"])
    assert r.status_code == 201
    assert r.json()["cla_id"] == torg_fixtures["cla_id"]


@pytest.mark.asyncio
async def test_torg_create_with_parent(client: AsyncClient, torg_fixtures):
    r_parent = await client.post("/api/torg", json={"nom": "TorgParentNew"},
                                 headers=torg_fixtures["headers"])
    parent_id = r_parent.json()["id"]

    r_child = await client.post("/api/torg",
                                json={"nom": "TorgChildNew", "parent_id": parent_id},
                                headers=torg_fixtures["headers"])
    assert r_child.status_code == 201
    assert r_child.json()["parent_id"] == parent_id


# ─── LIST / TREE ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_torg_list(client: AsyncClient, torg_fixtures):
    await client.post("/api/torg", json={"nom": "TorgForList"},
                      headers=torg_fixtures["headers"])
    r = await client.get("/api/torg", headers=torg_fixtures["headers"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    noms = [t["nom"] for t in r.json()]
    assert "TorgForList" in noms


@pytest.mark.asyncio
async def test_torg_tree(client: AsyncClient, torg_fixtures):
    r_p = await client.post("/api/torg", json={"nom": "TorgTreeParent"},
                            headers=torg_fixtures["headers"])
    p_id = r_p.json()["id"]
    await client.post("/api/torg",
                      json={"nom": "TorgTreeChild", "parent_id": p_id},
                      headers=torg_fixtures["headers"])

    r = await client.get("/api/torg/tree", headers=torg_fixtures["headers"])
    assert r.status_code == 200
    tree = r.json()
    assert isinstance(tree, list)
    parent_node = next((n for n in tree if n["id"] == p_id), None)
    assert parent_node is not None
    assert len(parent_node["enfants"]) >= 1


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_torg_update_nom(client: AsyncClient, torg_fixtures):
    r = await client.post("/api/torg", json={"nom": "TorgUpd"},
                          headers=torg_fixtures["headers"])
    torg_id = r.json()["id"]

    r2 = await client.put(f"/api/torg/{torg_id}", json={"nom": "TorgUpdated"},
                          headers=torg_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["nom"] == "TorgUpdated"


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_torg_delete_empty_ok(client: AsyncClient, torg_fixtures):
    r = await client.post("/api/torg", json={"nom": "TorgDel"},
                          headers=torg_fixtures["headers"])
    torg_id = r.json()["id"]

    r2 = await client.delete(f"/api/torg/{torg_id}", headers=torg_fixtures["headers"])
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_torg_delete_blocked_with_children(client: AsyncClient, torg_fixtures):
    """Supprimer un TORG avec des sous-types → 400."""
    r_parent = await client.post("/api/torg", json={"nom": "TorgDelParent"},
                                 headers=torg_fixtures["headers"])
    parent_id = r_parent.json()["id"]
    await client.post("/api/torg",
                      json={"nom": "TorgDelChild", "parent_id": parent_id},
                      headers=torg_fixtures["headers"])

    r_del = await client.delete(f"/api/torg/{parent_id}", headers=torg_fixtures["headers"])
    assert r_del.status_code == 400


@pytest.mark.asyncio
async def test_torg_delete_404(client: AsyncClient, torg_fixtures):
    r = await client.delete("/api/torg/999999", headers=torg_fixtures["headers"])
    assert r.status_code == 404
