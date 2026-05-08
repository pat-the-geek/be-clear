"""Tests GET/PUT /api/config, CRUD /api/config/llm, CRUD /api/config/token."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def config_fixtures(db_session: AsyncSession):
    role_admin = await create_role(db_session, "ADMIN")
    role_lecteur = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_config_test")
    cla = await create_cla(db_session, "ClaConfigTest")
    admin = await create_user(db_session, auth_uid="admin_config_test",
                              tuser_id=tuser.id, role_id=role_admin.id, cla_id=cla.id)
    lecteur = await create_user(db_session, auth_uid="lecteur_config_test",
                                tuser_id=tuser.id, role_id=role_lecteur.id, cla_id=cla.id)
    await db_session.commit()
    return {
        "h_admin": {"Authorization": f"Bearer {await get_token(admin)}"},
        "h_lecteur": {"Authorization": f"Bearer {await get_token(lecteur)}"},
    }


# ─── CONFIG globale ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_config_requires_admin(client: AsyncClient, config_fixtures):
    r = await client.get("/api/config", headers=config_fixtures["h_lecteur"])
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_config_get_returns_structure(client: AsyncClient, config_fixtures):
    """GET /api/config retourne config + llms."""
    r = await client.get("/api/config", headers=config_fixtures["h_admin"])
    assert r.status_code == 200
    data = r.json()
    assert "config" in data
    assert "llms" in data
    assert isinstance(data["llms"], list)
    cfg = data["config"]
    assert "id" in cfg
    assert "obsidian_vault_path" in cfg
    assert "ollama_url" in cfg


@pytest.mark.asyncio
async def test_config_update_obsidian_path(client: AsyncClient, config_fixtures):
    """PUT /api/config met à jour le chemin Obsidian."""
    h = config_fixtures["h_admin"]
    r = await client.put("/api/config",
                         json={"obsidian_vault_path": "/home/user/vault"},
                         headers=h)
    assert r.status_code == 200
    assert r.json()["obsidian_vault_path"] == "/home/user/vault"


@pytest.mark.asyncio
async def test_config_update_ollama(client: AsyncClient, config_fixtures):
    """PUT /api/config met à jour les params Ollama."""
    h = config_fixtures["h_admin"]
    r = await client.put("/api/config",
                         json={"ollama_url": "http://ollama:11434",
                               "ollama_modele": "llama3"},
                         headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["ollama_url"] == "http://ollama:11434"
    assert data["ollama_modele"] == "llama3"


@pytest.mark.asyncio
async def test_config_update_requires_admin(client: AsyncClient, config_fixtures):
    r = await client.put("/api/config",
                         json={"obsidian_vault_path": "/tmp"},
                         headers=config_fixtures["h_lecteur"])
    assert r.status_code == 403


# ─── LLM distants ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_llm_create_ok(client: AsyncClient, config_fixtures):
    """POST /api/config/llm crée un LLM distant → 201."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/llm", json={
        "nom": "Claude Opus Test",
        "fournisseur": "anthropic",
        "modele": "claude-opus-4-7",
        "api_key": "sk-ant-test-key",
    }, headers=h)
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "Claude Opus Test"
    assert data["fournisseur"] == "anthropic"
    assert data["est_actif"] is True


@pytest.mark.asyncio
async def test_llm_create_with_api_url(client: AsyncClient, config_fixtures):
    """POST /api/config/llm avec api_url → stocké dans parametres."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/llm", json={
        "nom": "Azure LLM",
        "fournisseur": "azure",
        "modele": "gpt-4",
        "api_key": "azure-key",
        "api_url": "https://myinstance.openai.azure.com/",
    }, headers=h)
    assert r.status_code == 201
    data = r.json()
    assert data["parametres"] is not None
    assert data["parametres"]["api_url"] == "https://myinstance.openai.azure.com/"


@pytest.mark.asyncio
async def test_llm_list(client: AsyncClient, config_fixtures):
    """GET /api/config/llm retourne une liste."""
    h = config_fixtures["h_admin"]
    await client.post("/api/config/llm", json={
        "nom": "LLM List Test", "fournisseur": "openai",
        "modele": "gpt-4o", "api_key": "sk-test",
    }, headers=h)

    r = await client.get("/api/config/llm", headers=h)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    noms = [l["nom"] for l in r.json()]
    assert "LLM List Test" in noms


@pytest.mark.asyncio
async def test_llm_update_nom(client: AsyncClient, config_fixtures):
    """PUT /api/config/llm/{id} met à jour le nom."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/llm", json={
        "nom": "LLMUpd", "fournisseur": "openai",
        "modele": "gpt-4o-mini", "api_key": "sk-upd",
    }, headers=h)
    llm_id = r.json()["id"]

    r2 = await client.put(f"/api/config/llm/{llm_id}",
                          json={"nom": "LLMUpdated"}, headers=h)
    assert r2.status_code == 200
    assert r2.json()["nom"] == "LLMUpdated"


@pytest.mark.asyncio
async def test_llm_update_est_actif(client: AsyncClient, config_fixtures):
    """PUT /api/config/llm/{id} peut désactiver un LLM."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/llm", json={
        "nom": "LLMActive", "fournisseur": "openai",
        "modele": "gpt-4o", "api_key": "sk-act",
    }, headers=h)
    llm_id = r.json()["id"]

    r2 = await client.put(f"/api/config/llm/{llm_id}",
                          json={"est_actif": False}, headers=h)
    assert r2.status_code == 200
    assert r2.json()["est_actif"] is False


@pytest.mark.asyncio
async def test_llm_delete_ok(client: AsyncClient, config_fixtures):
    """DELETE /api/config/llm/{id} → 204."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/llm", json={
        "nom": "LLMDel", "fournisseur": "anthropic",
        "modele": "claude-haiku-4-5-20251001", "api_key": "sk-del",
    }, headers=h)
    llm_id = r.json()["id"]

    r2 = await client.delete(f"/api/config/llm/{llm_id}", headers=h)
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_llm_delete_404(client: AsyncClient, config_fixtures):
    r = await client.delete("/api/config/llm/999999",
                            headers=config_fixtures["h_admin"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_llm_requires_admin(client: AsyncClient, config_fixtures):
    r = await client.get("/api/config/llm", headers=config_fixtures["h_lecteur"])
    assert r.status_code == 403


# ─── Tokens API ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_token_create_ok(client: AsyncClient, config_fixtures):
    """POST /api/config/token génère un token visible en clair une seule fois."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/token",
                          json={"nom": "Token de test CI"},
                          headers=h)
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["nom"] == "Token de test CI"
    assert "token" in data
    assert len(data["token"]) > 10
    assert data["est_actif"] is True


@pytest.mark.asyncio
async def test_token_list(client: AsyncClient, config_fixtures):
    """GET /api/config/token liste les tokens de l'utilisateur courant."""
    h = config_fixtures["h_admin"]
    await client.post("/api/config/token", json={"nom": "TListA"}, headers=h)
    await client.post("/api/config/token", json={"nom": "TListB"}, headers=h)

    r = await client.get("/api/config/token", headers=h)
    assert r.status_code == 200
    noms = [t["nom"] for t in r.json()]
    assert "TListA" in noms
    assert "TListB" in noms


@pytest.mark.asyncio
async def test_token_list_scoped_to_user(client: AsyncClient, config_fixtures):
    """Un lecteur ne voit que ses propres tokens."""
    h_admin = config_fixtures["h_admin"]
    h_lecteur = config_fixtures["h_lecteur"]

    await client.post("/api/config/token", json={"nom": "AdminToken"}, headers=h_admin)
    await client.post("/api/config/token", json={"nom": "LecteurToken"}, headers=h_lecteur)

    r_admin = await client.get("/api/config/token", headers=h_admin)
    r_lecteur = await client.get("/api/config/token", headers=h_lecteur)

    admin_noms = [t["nom"] for t in r_admin.json()]
    lecteur_noms = [t["nom"] for t in r_lecteur.json()]

    assert "AdminToken" in admin_noms
    assert "LecteurToken" not in admin_noms
    assert "LecteurToken" in lecteur_noms
    assert "AdminToken" not in lecteur_noms


@pytest.mark.asyncio
async def test_token_revoke_ok(client: AsyncClient, config_fixtures):
    """DELETE /api/config/token/{id} révoque le token (est_actif=False)."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/token", json={"nom": "TokenRevoke"}, headers=h)
    token_id = r.json()["id"]

    r2 = await client.delete(f"/api/config/token/{token_id}", headers=h)
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_token_revoke_other_user_forbidden(client: AsyncClient, config_fixtures):
    """Un utilisateur ne peut pas révoquer le token d'un autre → 404."""
    h_admin = config_fixtures["h_admin"]
    h_lecteur = config_fixtures["h_lecteur"]

    r = await client.post("/api/config/token", json={"nom": "AdminOnlyToken"},
                          headers=h_admin)
    token_id = r.json()["id"]

    r2 = await client.delete(f"/api/config/token/{token_id}", headers=h_lecteur)
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_token_create_without_nom(client: AsyncClient, config_fixtures):
    """Un token peut être créé sans nom."""
    r = await client.post("/api/config/token", json={},
                          headers=config_fixtures["h_admin"])
    assert r.status_code == 201
    assert r.json()["nom"] is None


@pytest.mark.asyncio
async def test_api_token_authenticates_requests(client: AsyncClient, config_fixtures):
    """Un token API valide permet d'accéder aux routes protégées."""
    h = config_fixtures["h_admin"]
    r = await client.post("/api/config/token", json={"nom": "TokenAuth"}, headers=h)
    plain_token = r.json()["token"]

    r2 = await client.get("/api/stats",
                          headers={"Authorization": f"Bearer {plain_token}"})
    assert r2.status_code == 200
