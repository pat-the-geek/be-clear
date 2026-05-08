"""Tests pour GET /api/log — journal des opérations (ADMIN seulement)."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def log_fixtures(db_session: AsyncSession, client: AsyncClient):
    """
    Crée un admin et un lecteur, génère quelques entrées de LOG via API
    (création d'un TORG et mise à jour), puis retourne les tokens et IDs utiles.
    """
    role_admin = await create_role(db_session, "ADMIN")
    role_lecteur = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_log_test")
    cla = await create_cla(db_session, "ClaLogTest")

    admin = await create_user(db_session, auth_uid="admin_log_test",
                              tuser_id=tuser.id, role_id=role_admin.id, cla_id=cla.id)
    lecteur = await create_user(db_session, auth_uid="lecteur_log_test",
                                tuser_id=tuser.id, role_id=role_lecteur.id, cla_id=cla.id)
    await db_session.commit()

    h_admin = {"Authorization": f"Bearer {await get_token(admin)}"}
    h_lecteur = {"Authorization": f"Bearer {await get_token(lecteur)}"}

    # Générer des entrées de LOG : INSERT + UPDATE sur un TORG
    r = await client.post("/api/torg",
                          json={"nom": "TorgLogTest", "cla_id": cla.id},
                          headers=h_admin)
    assert r.status_code == 201
    torg_id = r.json()["id"]

    await client.put(f"/api/torg/{torg_id}",
                     json={"nom": "TorgLogTestUpdated"},
                     headers=h_admin)

    return {
        "h_admin": h_admin,
        "h_lecteur": h_lecteur,
        "torg_id": torg_id,
        "cla_id": cla.id,
    }


# ─── Accès et structure ───────────────────────────────────────

@pytest.mark.asyncio
async def test_log_requires_admin(client: AsyncClient, log_fixtures):
    """Un LECTEUR ne peut pas accéder au LOG."""
    r = await client.get("/api/log", headers=log_fixtures["h_lecteur"])
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_log_list_returns_paginated(client: AsyncClient, log_fixtures):
    """GET /api/log retourne une structure paginée avec les bons champs."""
    r = await client.get("/api/log", headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "per_page" in data
    assert data["total"] >= 2  # au moins INSERT + UPDATE du TORG
    assert isinstance(data["items"], list)
    # Structure d'une entrée
    entry = data["items"][0]
    assert "id" in entry
    assert "horodatage" in entry
    assert "operation" in entry
    assert "table_name" in entry


# ─── Filtres ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_filter_by_table_name(client: AsyncClient, log_fixtures):
    """Filtrer par table_name retourne uniquement les entrées de cette table."""
    r = await client.get("/api/log?table_name=torg", headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2
    for entry in data["items"]:
        assert entry["table_name"] == "torg"


@pytest.mark.asyncio
async def test_log_filter_by_operation_insert(client: AsyncClient, log_fixtures):
    """Filtrer par operation=INSERT ne retourne que les insertions."""
    r = await client.get("/api/log?table_name=torg&operation=INSERT",
                         headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    for entry in data["items"]:
        assert entry["operation"] == "INSERT"


@pytest.mark.asyncio
async def test_log_filter_by_operation_update(client: AsyncClient, log_fixtures):
    """Filtrer par operation=UPDATE ne retourne que les mises à jour."""
    r = await client.get("/api/log?table_name=torg&operation=UPDATE",
                         headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    for entry in data["items"]:
        assert entry["operation"] == "UPDATE"


@pytest.mark.asyncio
async def test_log_filter_by_entite_id(client: AsyncClient, log_fixtures):
    """Filtrer par entite_id retourne uniquement les entrées pour cette entité."""
    torg_id = log_fixtures["torg_id"]
    r = await client.get(f"/api/log?entite_id={torg_id}",
                         headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2  # INSERT + UPDATE
    for entry in data["items"]:
        assert entry["entite_id"] == torg_id


@pytest.mark.asyncio
async def test_log_filter_unknown_table(client: AsyncClient, log_fixtures):
    """Filtrer par une table inexistante retourne 0 résultats."""
    r = await client.get("/api/log?table_name=table_inexistante_xyz",
                         headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    assert r.json()["total"] == 0


# ─── Pagination ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_pagination(client: AsyncClient, log_fixtures):
    """La pagination fonctionne : per_page=1 retourne 1 entrée, page=2 une autre."""
    r1 = await client.get("/api/log?table_name=torg&per_page=1&page=1",
                          headers=log_fixtures["h_admin"])
    assert r1.status_code == 200
    d1 = r1.json()
    assert len(d1["items"]) == 1
    assert d1["per_page"] == 1
    assert d1["page"] == 1

    r2 = await client.get("/api/log?table_name=torg&per_page=1&page=2",
                          headers=log_fixtures["h_admin"])
    assert r2.status_code == 200
    d2 = r2.json()
    assert len(d2["items"]) == 1
    # Les deux entrées doivent être différentes
    assert d1["items"][0]["id"] != d2["items"][0]["id"]


# ─── Contenu des entrées ──────────────────────────────────────

@pytest.mark.asyncio
async def test_log_insert_entry_has_apres(client: AsyncClient, log_fixtures):
    """Une entrée INSERT doit avoir le champ `apres` renseigné."""
    r = await client.get("/api/log?table_name=torg&operation=INSERT",
                         headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    entries = r.json()["items"]
    assert len(entries) >= 1
    insert_entries = [e for e in entries if e["entite_id"] == log_fixtures["torg_id"]]
    assert len(insert_entries) >= 1
    entry = insert_entries[0]
    assert entry["apres"] is not None
    assert "nom" in entry["apres"]


@pytest.mark.asyncio
async def test_log_update_entry_has_avant_and_apres(client: AsyncClient, log_fixtures):
    """Une entrée UPDATE doit avoir `avant` et `apres` renseignés."""
    r = await client.get(
        f"/api/log?table_name=torg&operation=UPDATE&entite_id={log_fixtures['torg_id']}",
        headers=log_fixtures["h_admin"])
    assert r.status_code == 200
    entries = r.json()["items"]
    assert len(entries) >= 1
    entry = entries[0]
    assert entry["avant"] is not None
    assert entry["apres"] is not None
    assert entry["avant"]["nom"] == "TorgLogTest"
    assert entry["apres"]["nom"] == "TorgLogTestUpdated"
