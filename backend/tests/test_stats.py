"""Tests pour GET /api/stats — métriques globales du système."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token

EXPECTED_KEYS = {
    "nb_orgs", "nb_envs", "nb_engs", "nb_events", "nb_users",
    "nb_events_retard", "nb_events_accomplis",
    "nb_engs_termines", "nb_engs_en_cours", "nb_engs_non_demarres",
    "nb_recents_7j",
}


@pytest.fixture
async def stats_admin(db_session: AsyncSession):
    role = await create_role(db_session, "ADMIN")
    role_lecteur = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_stats_test")
    cla = await create_cla(db_session, "ClaStatsTest")
    admin = await create_user(db_session, auth_uid="admin_stats_test",
                              tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    lecteur = await create_user(db_session, auth_uid="lecteur_stats_test",
                                tuser_id=tuser.id, role_id=role_lecteur.id, cla_id=cla.id)
    await db_session.commit()
    return {
        "h_admin": {"Authorization": f"Bearer {await get_token(admin)}"},
        "h_lecteur": {"Authorization": f"Bearer {await get_token(lecteur)}"},
        "cla_id": cla.id,
    }


# ─── Accès ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stats_requires_admin(client: AsyncClient, stats_admin):
    """Un LECTEUR ne peut pas accéder aux stats."""
    r = await client.get("/api/stats", headers=stats_admin["h_lecteur"])
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_stats_returns_all_keys(client: AsyncClient, stats_admin):
    """GET /api/stats retourne les 11 clés attendues."""
    r = await client.get("/api/stats", headers=stats_admin["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert EXPECTED_KEYS == set(data.keys())


@pytest.mark.asyncio
async def test_stats_values_are_non_negative_integers(client: AsyncClient, stats_admin):
    """Toutes les valeurs sont des entiers >= 0."""
    r = await client.get("/api/stats", headers=stats_admin["h_admin"])
    assert r.status_code == 200
    data = r.json()
    for key, val in data.items():
        assert isinstance(val, int), f"{key} devrait être un entier, got {type(val)}"
        assert val >= 0, f"{key} ne devrait pas être négatif, got {val}"


# ─── Cohérence des compteurs ──────────────────────────────────

@pytest.mark.asyncio
async def test_stats_nb_orgs_increases_after_create(client: AsyncClient, stats_admin):
    """Créer une ORG incrémente nb_orgs de 1."""
    h = stats_admin["h_admin"]
    cla_id = stats_admin["cla_id"]

    r0 = await client.get("/api/stats", headers=h)
    nb_before = r0.json()["nb_orgs"]

    # Créer TORG → ORG
    r = await client.post("/api/torg", json={"nom": "TorgStats1", "cla_id": cla_id}, headers=h)
    torg_id = r.json()["id"]
    r = await client.post("/api/org", json={"nom": "OrgStats1", "torg_id": torg_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    assert r.status_code == 201
    org_id = r.json()["id"]

    r1 = await client.get("/api/stats", headers=h)
    assert r1.json()["nb_orgs"] == nb_before + 1

    # Nettoyage
    await client.delete(f"/api/org/{org_id}", headers=h)


@pytest.mark.asyncio
async def test_stats_nb_envs_increases_after_create(client: AsyncClient, stats_admin):
    """Créer une ENV incrémente nb_envs de 1."""
    h = stats_admin["h_admin"]
    cla_id = stats_admin["cla_id"]

    r0 = await client.get("/api/stats", headers=h)
    nb_before = r0.json()["nb_envs"]

    r = await client.post("/api/tenv", json={"nom": "TenvStats1", "cla_id": cla_id}, headers=h)
    tenv_id = r.json()["id"]
    r = await client.post("/api/env", json={"nom": "EnvStats1", "tenv_id": tenv_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    assert r.status_code == 201
    env_id = r.json()["id"]

    r1 = await client.get("/api/stats", headers=h)
    assert r1.json()["nb_envs"] == nb_before + 1

    # Nettoyage
    await client.delete(f"/api/env/{env_id}", headers=h)


@pytest.mark.asyncio
async def test_stats_engs_status_counts_consistent(client: AsyncClient, stats_admin):
    """La somme des statuts ENG (terminés + en cours + non démarrés) == nb_engs."""
    r = await client.get("/api/stats", headers=stats_admin["h_admin"])
    assert r.status_code == 200
    data = r.json()
    total_from_status = (
        data["nb_engs_termines"] + data["nb_engs_en_cours"] + data["nb_engs_non_demarres"]
    )
    assert total_from_status == data["nb_engs"]


@pytest.mark.asyncio
async def test_stats_events_accomplis_le_total(client: AsyncClient, stats_admin):
    """nb_events_accomplis <= nb_events (les accomplis sont un sous-ensemble)."""
    r = await client.get("/api/stats", headers=stats_admin["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["nb_events_accomplis"] <= data["nb_events"]


@pytest.mark.asyncio
async def test_stats_events_retard_le_total(client: AsyncClient, stats_admin):
    """nb_events_retard <= nb_events (les retards sont un sous-ensemble des non-accomplis)."""
    r = await client.get("/api/stats", headers=stats_admin["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["nb_events_retard"] <= data["nb_events"]


@pytest.mark.asyncio
async def test_stats_nb_events_increases_after_create(client: AsyncClient, stats_admin):
    """Créer un EVENT incrémente nb_events de 1."""
    h = stats_admin["h_admin"]
    cla_id = stats_admin["cla_id"]

    r0 = await client.get("/api/stats", headers=h)
    nb_events_before = r0.json()["nb_events"]
    nb_engs_before = r0.json()["nb_engs"]

    # Créer la hiérarchie complète
    r = await client.post("/api/torg", json={"nom": "TorgStatsEv", "cla_id": cla_id}, headers=h)
    torg_id = r.json()["id"]
    r = await client.post("/api/org", json={"nom": "OrgStatsEv", "torg_id": torg_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    org_id = r.json()["id"]
    r = await client.post("/api/tenv", json={"nom": "TenvStatsEv", "cla_id": cla_id}, headers=h)
    tenv_id = r.json()["id"]
    r = await client.post("/api/env", json={"nom": "EnvStatsEv", "tenv_id": tenv_id,
                                            "cla_id": cla_id, "values": []}, headers=h)
    env_id = r.json()["id"]
    r = await client.post("/api/teng", json={"nom": "TengStatsEv", "cla_id": cla_id}, headers=h)
    teng_id = r.json()["id"]
    r = await client.post("/api/eng", json={
        "nom": "EngStatsEv", "teng_id": teng_id, "cla_id": cla_id,
        "org_ids": [org_id], "env_ids": [env_id], "values": [],
    }, headers=h)
    assert r.status_code == 201
    eng_id = r.json()["id"]
    r = await client.post("/api/tevent", json={"nom": "TeventStatsEv", "cla_id": cla_id},
                          headers=h)
    tevent_id = r.json()["id"]
    r = await client.post("/api/event", json={
        "eng_id": eng_id, "tevent_id": tevent_id,
        "nom": "EventStatsEv", "cla_id": cla_id,
        "date_heure_prevue": "2026-08-01T10:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201
    event_id = r.json()["id"]

    r1 = await client.get("/api/stats", headers=h)
    data = r1.json()
    assert data["nb_events"] == nb_events_before + 1
    assert data["nb_engs"] == nb_engs_before + 1

    # Nettoyage
    await client.delete(f"/api/event/{event_id}", headers=h)
    await client.delete(f"/api/eng/{eng_id}", headers=h)
    await client.delete(f"/api/env/{env_id}", headers=h)
    await client.delete(f"/api/org/{org_id}", headers=h)
