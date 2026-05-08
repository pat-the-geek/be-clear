"""Tests GET /api/search et POST /api/search/reindex."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def search_fixtures(db_session: AsyncSession):
    role_admin = await create_role(db_session, "ADMIN")
    role_lecteur = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_search_test")
    cla = await create_cla(db_session, "ClaSearchTest")
    admin = await create_user(db_session, auth_uid="admin_search_test",
                              tuser_id=tuser.id, role_id=role_admin.id, cla_id=cla.id)
    lecteur = await create_user(db_session, auth_uid="lecteur_search_test",
                                tuser_id=tuser.id, role_id=role_lecteur.id, cla_id=cla.id)
    await db_session.commit()
    return {
        "h_admin": {"Authorization": f"Bearer {await get_token(admin)}"},
        "h_lecteur": {"Authorization": f"Bearer {await get_token(lecteur)}"},
        "cla_id": cla.id,
    }


def _fake_search_result(hits: list[dict]) -> dict:
    return {"hits": hits, "estimated_total_hits": len(hits)}


# ─── Accès ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_requires_auth(client: AsyncClient):
    r = await client.get("/api/search?q=test")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_search_query_too_short(client: AsyncClient, search_fixtures):
    """Une requête d'un seul caractère doit retourner 422 (validation Pydantic min_length=2)."""
    r = await client.get("/api/search?q=a", headers=search_fixtures["h_admin"])
    assert r.status_code == 422


# ─── Recherche ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_returns_structure(client: AsyncClient, search_fixtures, monkeypatch):
    """GET /api/search retourne la structure attendue avec les bons champs."""
    fake_hits = [
        {"id": 1, "entity_id": 10, "nom": "Org Alpha", "entity_type": "org",
         "cla_nom": "TypeOrg", "image_chemin": "", "_formatted": {"nom": "Org <em>Alpha</em>"}},
        {"id": 2, "entity_id": 20, "nom": "Eng Beta", "entity_type": "eng",
         "cla_nom": "TypeEng", "image_chemin": None, "_formatted": {}},
    ]

    async def fake_search_objs(q, offset=0, limit=20, filter_expr=None):
        return _fake_search_result(fake_hits)

    monkeypatch.setattr("app.services.search_service.search_objs", fake_search_objs)

    r = await client.get("/api/search?q=alpha", headers=search_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["query"] == "alpha"
    assert "hits" in data
    assert "estimatedTotalHits" in data
    assert "offset" in data
    assert "limit" in data
    assert len(data["hits"]) == 2
    hit = data["hits"][0]
    assert "id" in hit
    assert "nom" in hit
    assert "entity_type" in hit


@pytest.mark.asyncio
async def test_search_filter_entity_type(client: AsyncClient, search_fixtures, monkeypatch):
    """Le filtre entity_type est bien transmis à search_objs."""
    captured = {}

    async def fake_search_objs(q, offset=0, limit=20, filter_expr=None):
        captured["filter_expr"] = filter_expr
        return _fake_search_result([])

    monkeypatch.setattr("app.services.search_service.search_objs", fake_search_objs)

    await client.get("/api/search?q=test&entity_type=org",
                     headers=search_fixtures["h_admin"])
    assert captured.get("filter_expr") == 'entity_type = "org"'


@pytest.mark.asyncio
async def test_search_no_filter_when_no_entity_type(client: AsyncClient, search_fixtures, monkeypatch):
    """Sans entity_type, filter_expr doit être None."""
    captured = {}

    async def fake_search_objs(q, offset=0, limit=20, filter_expr=None):
        captured["filter_expr"] = filter_expr
        return _fake_search_result([])

    monkeypatch.setattr("app.services.search_service.search_objs", fake_search_objs)

    await client.get("/api/search?q=test", headers=search_fixtures["h_admin"])
    assert captured.get("filter_expr") is None


@pytest.mark.asyncio
async def test_search_pagination_params(client: AsyncClient, search_fixtures, monkeypatch):
    """Les paramètres offset et limit sont transmis."""
    captured = {}

    async def fake_search_objs(q, offset=0, limit=20, filter_expr=None):
        captured["offset"] = offset
        captured["limit"] = limit
        return _fake_search_result([])

    monkeypatch.setattr("app.services.search_service.search_objs", fake_search_objs)

    await client.get("/api/search?q=test&offset=10&limit=5",
                     headers=search_fixtures["h_admin"])
    assert captured["offset"] == 10
    assert captured["limit"] == 5


@pytest.mark.asyncio
async def test_search_empty_results(client: AsyncClient, search_fixtures, monkeypatch):
    """Une recherche sans résultats retourne un tableau vide."""
    async def fake_search_objs(q, offset=0, limit=20, filter_expr=None):
        return _fake_search_result([])

    monkeypatch.setattr("app.services.search_service.search_objs", fake_search_objs)

    r = await client.get("/api/search?q=zzz_inexistant",
                         headers=search_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["hits"] == []
    assert data["estimatedTotalHits"] == 0


# ─── Réindexation ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reindex_requires_admin(client: AsyncClient, search_fixtures):
    """Un LECTEUR ne peut pas lancer le réindex."""
    r = await client.post("/api/search/reindex", headers=search_fixtures["h_lecteur"])
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_reindex_ok(client: AsyncClient, search_fixtures, monkeypatch):
    """POST /api/search/reindex s'exécute sans erreur et retourne le nombre réindexé."""
    async def fake_index_obj(**kwargs):
        pass

    monkeypatch.setattr("app.services.search_service.index_obj", fake_index_obj)

    r = await client.post("/api/search/reindex", headers=search_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert "reindexed" in data
    assert isinstance(data["reindexed"], int)
    assert data["reindexed"] >= 0
