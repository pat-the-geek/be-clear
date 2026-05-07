"""
Tests CRUD ENV — création, liste paginée, 404.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_tenv, create_user, get_token,
)


@pytest.fixture
async def env_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_env")
    cla = await create_cla(db_session, "ClaEnv")
    tenv = await create_tenv(db_session, "TypeEnv", cla.id)
    user = await create_user(
        db_session,
        auth_uid="admin_env",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    await db_session.commit()
    token = await get_token(user)
    return {"token": token, "tenv_id": tenv.id, "cla_id": cla.id}


@pytest.mark.asyncio
async def test_create_env_requires_auth(client: AsyncClient, env_fixtures):
    """POST /api/env sans token → 401."""
    payload = {"nom": "Mon Env", "tenv_id": env_fixtures["tenv_id"], "cla_id": env_fixtures["cla_id"], "values": []}
    response = await client.post("/api/env", json=payload)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_env_success(client: AsyncClient, env_fixtures):
    """POST /api/env avec token valide → 201."""
    payload = {"nom": "Env Test", "tenv_id": env_fixtures["tenv_id"], "cla_id": env_fixtures["cla_id"], "values": []}
    response = await client.post(
        "/api/env",
        json=payload,
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["obj"]["nom"] == "Env Test"
    assert "id" in data
    assert "tenv" in data


@pytest.mark.asyncio
async def test_list_envs_paginated(client: AsyncClient, env_fixtures):
    """GET /api/env retourne une réponse paginée."""
    response = await client.get(
        "/api/env",
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_get_env_not_found(client: AsyncClient, env_fixtures):
    """GET /api/env/99999 → 404."""
    response = await client.get(
        "/api/env/99999",
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_env(client: AsyncClient, env_fixtures):
    """PUT /api/env/{id} met à jour le nom."""
    # Créer d'abord
    payload = {"nom": "Env Initial", "tenv_id": env_fixtures["tenv_id"], "cla_id": env_fixtures["cla_id"], "values": []}
    r = await client.post(
        "/api/env", json=payload,
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    env_id = r.json()["id"]

    # Mettre à jour
    r2 = await client.put(
        f"/api/env/{env_id}",
        json={"nom": "Env Modifié"},
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    assert r2.status_code == 200
    assert r2.json()["obj"]["nom"] == "Env Modifié"


@pytest.mark.asyncio
async def test_delete_env(client: AsyncClient, env_fixtures):
    """DELETE /api/env/{id} supprime l'ENV."""
    payload = {"nom": "Env à supprimer", "tenv_id": env_fixtures["tenv_id"], "cla_id": env_fixtures["cla_id"], "values": []}
    r = await client.post(
        "/api/env", json=payload,
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    env_id = r.json()["id"]

    r2 = await client.delete(
        f"/api/env/{env_id}",
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    assert r2.status_code == 204

    # Vérifier la suppression
    r3 = await client.get(
        f"/api/env/{env_id}",
        headers={"Authorization": f"Bearer {env_fixtures['token']}"},
    )
    assert r3.status_code == 404
