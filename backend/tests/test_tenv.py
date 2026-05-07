"""Tests CRUD TENV — types d'environnement."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def tenv_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_tenv_crud")
    cla = await create_cla(db_session, "ClaTenvCrud")
    user = await create_user(db_session, auth_uid="admin_tenv_crud",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    return {"headers": {"Authorization": f"Bearer {token}"}, "cla_id": cla.id}


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenv_create_ok(client: AsyncClient, tenv_fixtures):
    r = await client.post("/api/tenv", json={"nom": "TenvNew"},
                          headers=tenv_fixtures["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "TenvNew"
    assert data["parent_id"] is None


@pytest.mark.asyncio
async def test_tenv_create_with_cla(client: AsyncClient, tenv_fixtures):
    r = await client.post("/api/tenv",
                          json={"nom": "TenvWithCla", "cla_id": tenv_fixtures["cla_id"]},
                          headers=tenv_fixtures["headers"])
    assert r.status_code == 201
    assert r.json()["cla_id"] == tenv_fixtures["cla_id"]


@pytest.mark.asyncio
async def test_tenv_create_with_parent(client: AsyncClient, tenv_fixtures):
    r_parent = await client.post("/api/tenv", json={"nom": "TenvParentNew"},
                                 headers=tenv_fixtures["headers"])
    parent_id = r_parent.json()["id"]

    r_child = await client.post("/api/tenv",
                                json={"nom": "TenvChildNew", "parent_id": parent_id},
                                headers=tenv_fixtures["headers"])
    assert r_child.status_code == 201
    assert r_child.json()["parent_id"] == parent_id


# ─── LIST / TREE ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenv_list(client: AsyncClient, tenv_fixtures):
    await client.post("/api/tenv", json={"nom": "TenvForList"},
                      headers=tenv_fixtures["headers"])
    r = await client.get("/api/tenv", headers=tenv_fixtures["headers"])
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    noms = [t["nom"] for t in r.json()]
    assert "TenvForList" in noms


@pytest.mark.asyncio
async def test_tenv_tree(client: AsyncClient, tenv_fixtures):
    r_p = await client.post("/api/tenv", json={"nom": "TenvTreeParent"},
                            headers=tenv_fixtures["headers"])
    p_id = r_p.json()["id"]
    await client.post("/api/tenv",
                      json={"nom": "TenvTreeChild", "parent_id": p_id},
                      headers=tenv_fixtures["headers"])

    r = await client.get("/api/tenv/tree", headers=tenv_fixtures["headers"])
    assert r.status_code == 200
    tree = r.json()
    assert isinstance(tree, list)
    parent_node = next((n for n in tree if n["id"] == p_id), None)
    assert parent_node is not None
    assert len(parent_node["enfants"]) >= 1


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenv_update_nom(client: AsyncClient, tenv_fixtures):
    r = await client.post("/api/tenv", json={"nom": "TenvUpd"},
                          headers=tenv_fixtures["headers"])
    tenv_id = r.json()["id"]

    r2 = await client.put(f"/api/tenv/{tenv_id}", json={"nom": "TenvUpdated"},
                          headers=tenv_fixtures["headers"])
    assert r2.status_code == 200
    assert r2.json()["nom"] == "TenvUpdated"


# ─── DELETE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenv_delete_empty_ok(client: AsyncClient, tenv_fixtures):
    r = await client.post("/api/tenv", json={"nom": "TenvDel"},
                          headers=tenv_fixtures["headers"])
    tenv_id = r.json()["id"]

    r2 = await client.delete(f"/api/tenv/{tenv_id}", headers=tenv_fixtures["headers"])
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_tenv_delete_blocked_with_children(client: AsyncClient, tenv_fixtures):
    """Supprimer un TENV avec des sous-types → 400."""
    r_parent = await client.post("/api/tenv", json={"nom": "TenvDelParent"},
                                 headers=tenv_fixtures["headers"])
    parent_id = r_parent.json()["id"]
    await client.post("/api/tenv",
                      json={"nom": "TenvDelChild", "parent_id": parent_id},
                      headers=tenv_fixtures["headers"])

    r_del = await client.delete(f"/api/tenv/{parent_id}", headers=tenv_fixtures["headers"])
    assert r_del.status_code == 400


@pytest.mark.asyncio
async def test_tenv_delete_404(client: AsyncClient, tenv_fixtures):
    r = await client.delete("/api/tenv/999999", headers=tenv_fixtures["headers"])
    assert r.status_code == 404
