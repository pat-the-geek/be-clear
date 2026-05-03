"""
Tests CRUD ORG.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_torg, create_user, get_token,
)


@pytest.fixture
async def org_fixtures(db_session: AsyncSession):
    """Crée les prérequis : role, tuser, cla, torg, user ADMIN et retourne le token."""
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain")
    cla = await create_cla(db_session, "ClaOrg")
    torg = await create_torg(db_session, "TypeOrg", cla.id)
    user = await create_user(
        db_session,
        auth_uid="admin_org",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    await db_session.commit()
    token = await get_token(user)
    return {"token": token, "torg_id": torg.id, "cla_id": cla.id}


@pytest.mark.asyncio
async def test_create_org_requires_auth(client: AsyncClient, org_fixtures):
    """POST /api/org sans token → 401."""
    payload = {
        "nom": "Mon Org",
        "torg_id": org_fixtures["torg_id"],
        "cla_id": org_fixtures["cla_id"],
        "values": [],
    }
    response = await client.post("/api/org", json=payload)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_org_success(client: AsyncClient, org_fixtures):
    """POST /api/org avec token valide → 201 avec les champs attendus."""
    payload = {
        "nom": "Org Test",
        "torg_id": org_fixtures["torg_id"],
        "cla_id": org_fixtures["cla_id"],
        "values": [],
    }
    response = await client.post(
        "/api/org",
        json=payload,
        headers={"Authorization": f"Bearer {org_fixtures['token']}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["obj"]["nom"] == "Org Test"
    assert "id" in data
    assert "torg" in data


@pytest.mark.asyncio
async def test_list_orgs_paginated(client: AsyncClient, org_fixtures):
    """GET /api/org retourne une réponse paginée."""
    response = await client.get(
        "/api/org",
        headers={"Authorization": f"Bearer {org_fixtures['token']}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "per_page" in data


@pytest.mark.asyncio
async def test_get_org_not_found(client: AsyncClient, org_fixtures):
    """GET /api/org/99999 → 404."""
    response = await client.get(
        "/api/org/99999",
        headers={"Authorization": f"Bearer {org_fixtures['token']}"},
    )
    assert response.status_code == 404
