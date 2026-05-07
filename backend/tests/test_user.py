"""
Tests CRUD USER — création, lecture, modification, désactivation.
Toutes les opérations d'écriture sur USER requièrent le rôle ADMIN.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_torg,
    create_user, get_token,
)


@pytest.fixture
async def user_fixtures(db_session: AsyncSession):
    role_admin = await create_role(db_session, "ADMIN")
    role_edit = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_user_crud")
    cla = await create_cla(db_session, "ClaUserCrud")

    admin = await create_user(db_session, auth_uid="admin_user_crud",
                              tuser_id=tuser.id, role_id=role_admin.id, cla_id=cla.id)
    editeur = await create_user(db_session, auth_uid="editeur_user_crud",
                                tuser_id=tuser.id, role_id=role_edit.id, cla_id=cla.id)
    await db_session.commit()
    return {
        "admin_token": await get_token(admin),
        "editeur_token": await get_token(editeur),
        "tuser_id": tuser.id,
        "cla_id": cla.id,
        "role_admin_id": role_admin.id,
        "role_edit_id": role_edit.id,
    }


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_payload(f: dict, nom: str = "UserTest", uid: str = "uid_test") -> dict:
    return {
        "nom": nom,
        "tuser_id": f["tuser_id"],
        "cla_id": f["cla_id"],
        "role_id": f["role_edit_id"],
        "auth_uid": uid,
        "password": "secret123",
    }


# ─── CREATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_create_ok(client: AsyncClient, user_fixtures):
    r = await client.post("/api/user",
                          json=_create_payload(user_fixtures),
                          headers=_headers(user_fixtures["admin_token"]))
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "UserTest"
    assert data["est_actif"] is True


@pytest.mark.asyncio
async def test_user_create_requires_admin(client: AsyncClient, user_fixtures):
    """Un EDITEUR ne peut pas créer un USER."""
    r = await client.post("/api/user",
                          json=_create_payload(user_fixtures, uid="uid_blocked"),
                          headers=_headers(user_fixtures["editeur_token"]))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_user_create_duplicate_auth_uid(client: AsyncClient, user_fixtures):
    """Deux USER avec le même auth_uid → erreur."""
    payload = _create_payload(user_fixtures, uid="uid_dup")
    await client.post("/api/user", json=payload,
                      headers=_headers(user_fixtures["admin_token"]))
    r2 = await client.post("/api/user", json=payload,
                           headers=_headers(user_fixtures["admin_token"]))
    assert r2.status_code in (400, 409, 422)


# ─── READ ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_read_ok(client: AsyncClient, user_fixtures):
    r = await client.post("/api/user",
                          json=_create_payload(user_fixtures, nom="UserRead", uid="uid_read"),
                          headers=_headers(user_fixtures["admin_token"]))
    user_id = r.json()["id"]

    r2 = await client.get(f"/api/user/{user_id}",
                          headers=_headers(user_fixtures["admin_token"]))
    assert r2.status_code == 200
    assert r2.json()["id"] == user_id


@pytest.mark.asyncio
async def test_user_read_404(client: AsyncClient, user_fixtures):
    r = await client.get("/api/user/999999",
                         headers=_headers(user_fixtures["admin_token"]))
    assert r.status_code == 404


# ─── LIST ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_list(client: AsyncClient, user_fixtures):
    r = await client.get("/api/user", headers=_headers(user_fixtures["admin_token"]))
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 2  # au moins admin + editeur créés en fixture


# ─── UPDATE ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_update_role(client: AsyncClient, user_fixtures):
    r = await client.post("/api/user",
                          json=_create_payload(user_fixtures, nom="UserUpd", uid="uid_upd"),
                          headers=_headers(user_fixtures["admin_token"]))
    user_id = r.json()["id"]

    r2 = await client.put(f"/api/user/{user_id}",
                          json={"role_id": user_fixtures["role_admin_id"]},
                          headers=_headers(user_fixtures["admin_token"]))
    assert r2.status_code == 200
    assert r2.json()["role"]["valeur"] == "ADMIN"


# ─── DÉSACTIVATION ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_deactivate(client: AsyncClient, user_fixtures):
    """DELETE /api/user/{id} désactive le USER (soft delete)."""
    r = await client.post("/api/user",
                          json=_create_payload(user_fixtures, nom="UserDel", uid="uid_del"),
                          headers=_headers(user_fixtures["admin_token"]))
    user_id = r.json()["id"]

    r2 = await client.delete(f"/api/user/{user_id}",
                             headers=_headers(user_fixtures["admin_token"]))
    assert r2.status_code == 204

    r3 = await client.get(f"/api/user/{user_id}",
                          headers=_headers(user_fixtures["admin_token"]))
    # L'utilisateur existe encore mais est inactif
    assert r3.status_code == 200
    assert r3.json()["est_actif"] is False


# ─── ROLES ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_list_roles(client: AsyncClient, user_fixtures):
    r = await client.get("/api/user/roles",
                         headers=_headers(user_fixtures["admin_token"]))
    assert r.status_code == 200
    valeurs = [role["valeur"] for role in r.json()]
    assert "ADMIN" in valeurs
    assert "EDITEUR" in valeurs
