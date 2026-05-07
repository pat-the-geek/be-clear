"""
Test d'intégration RAG : crée TORG→ORG, TENV→ENV, TENG→ENG, puis interroge
le terminal IA et vérifie que les entités créées apparaissent dans la réponse.

Les noms utilisent le préfixe RAGTest_ suivi d'un code unique pour être
facilement retrouvables dans les logs et la base de données.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token

# Noms uniques — facilement identifiables dans les logs
ORG_NOM = "RAGTest_Zephyr7421"
ENV_NOM = "RAGTest_Borneo9863"
ENG_NOM = "RAGTest_Quasar5572"


@pytest.fixture
async def rag_setup(db_session: AsyncSession, client: AsyncClient):
    """
    Crée la hiérarchie complète via API :
    TORG → ORG(RAGTest_Zephyr7421)
    TENV → ENV(RAGTest_Borneo9863)
    TENG → ENG(RAGTest_Quasar5572) lié à l'ORG et l'ENV
    """
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_rag_integ")
    cla = await create_cla(db_session, "ClaRagInteg")
    user = await create_user(db_session, auth_uid="admin_rag_integ",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    h = {"Authorization": f"Bearer {token}"}

    # ── TORG ──────────────────────────────────────────────
    r = await client.post("/api/torg", json={"nom": "TorgRAGInteg", "cla_id": cla.id},
                          headers=h)
    assert r.status_code == 201, r.text
    torg_id = r.json()["id"]

    # ── ORG ───────────────────────────────────────────────
    r = await client.post("/api/org", json={
        "nom": ORG_NOM,
        "torg_id": torg_id,
        "cla_id": cla.id,
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    org_data = r.json()
    org_id = org_data["id"]
    org_obj_id = org_data["obj"]["id"]

    # ── TENV ──────────────────────────────────────────────
    r = await client.post("/api/tenv", json={"nom": "TenvRAGInteg", "cla_id": cla.id},
                          headers=h)
    assert r.status_code == 201, r.text
    tenv_id = r.json()["id"]

    # ── ENV ───────────────────────────────────────────────
    r = await client.post("/api/env", json={
        "nom": ENV_NOM,
        "tenv_id": tenv_id,
        "cla_id": cla.id,
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    env_data = r.json()
    env_id = env_data["id"]
    env_obj_id = env_data["obj"]["id"]

    # ── TENG ──────────────────────────────────────────────
    r = await client.post("/api/teng", json={"nom": "TengRAGInteg", "cla_id": cla.id},
                          headers=h)
    assert r.status_code == 201, r.text
    teng_id = r.json()["id"]

    # ── ENG (lié à l'ORG et l'ENV) ────────────────────────
    r = await client.post("/api/eng", json={
        "nom": ENG_NOM,
        "teng_id": teng_id,
        "cla_id": cla.id,
        "org_ids": [org_id],
        "env_ids": [env_id],
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    eng_data = r.json()
    eng_id = eng_data["id"]
    eng_obj_id = eng_data["obj"]["id"]

    return {
        "headers": h,
        "org_id": org_id, "org_obj_id": org_obj_id,
        "env_id": env_id, "env_obj_id": env_obj_id,
        "eng_id": eng_id, "eng_obj_id": eng_obj_id,
    }


# ─── Tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rag_entities_created(client: AsyncClient, rag_setup):
    """Vérifie que les trois entités sont bien accessibles via API."""
    h = rag_setup["headers"]

    r_org = await client.get(f"/api/org/{rag_setup['org_id']}", headers=h)
    assert r_org.status_code == 200
    assert r_org.json()["obj"]["nom"] == ORG_NOM

    r_env = await client.get(f"/api/env/{rag_setup['env_id']}", headers=h)
    assert r_env.status_code == 200
    assert r_env.json()["obj"]["nom"] == ENV_NOM

    r_eng = await client.get(f"/api/eng/{rag_setup['eng_id']}", headers=h)
    assert r_eng.status_code == 200
    assert r_eng.json()["obj"]["nom"] == ENG_NOM

    # L'ENG doit avoir l'ORG et l'ENV dans ses relations
    eng = r_eng.json()
    org_noms = [o["nom"] for o in eng["orgs"]]
    env_noms = [e["nom"] for e in eng["envs"]]
    assert ORG_NOM in org_noms
    assert ENV_NOM in env_noms


@pytest.mark.asyncio
async def test_rag_query_finds_created_entities(client: AsyncClient, rag_setup, monkeypatch):
    """
    Interroge le terminal IA avec les mocks de l'embedding et du LLM.
    Vérifie que la réponse mentionne les trois entités créées et que les
    sources sont correctement extraites et typées.

    Note : _enrich_sources (requêtes SQL JOINs) s'exécute sans mock — elle
    interroge la vraie base SQLite pour récupérer les relations ENG↔ORG/ENV.
    """
    s = rag_setup
    h = s["headers"]

    # ── Mocks ───────────────────────────────────────────────

    async def fake_embed(text: str) -> list[float]:
        return [0.1] * 128

    async def fake_search(db, query_vec, top_k=5):
        # Retourne les entités créées avec les obj_id réels de la base de test
        return [
            {
                "obj_id": s["eng_obj_id"], "entity_id": s["eng_id"],
                "nom": ENG_NOM, "description": "", "score": 0.95, "entity_type": "eng",
            },
            {
                "obj_id": s["org_obj_id"], "entity_id": s["org_id"],
                "nom": ORG_NOM, "description": "", "score": 0.90, "entity_type": "org",
            },
            {
                "obj_id": s["env_obj_id"], "entity_id": s["env_id"],
                "nom": ENV_NOM, "description": "", "score": 0.85, "entity_type": "env",
            },
        ]

    async def fake_llms(db):
        return [{
            "id": None, "nom": "OllamaTest", "fournisseur": "ollama",
            "modele": "test-model", "type": "local", "url": "http://localhost:11434",
        }]

    async def fake_generate(question: str, context: str, llm_config: dict) -> str:
        # Génère une réponse structurée mentionnant les trois entités
        return (
            f"L'engagement {ENG_NOM} implique l'organisation {ORG_NOM} "
            f"et opère dans l'environnement {ENV_NOM}.\n"
            "SOURCES_USED: 1,2,3"
        )

    monkeypatch.setattr("app.services.rag_service.embed_text", fake_embed)
    monkeypatch.setattr("app.services.rag_service.similarity_search", fake_search)
    monkeypatch.setattr("app.services.rag_service.list_available_llms", fake_llms)
    monkeypatch.setattr("app.services.rag_service._generate", fake_generate)

    # ── Requête RAG ─────────────────────────────────────────
    r = await client.post("/api/rag/query",
                          json={"question": f"Que sais-tu de {ORG_NOM} ?"},
                          headers=h)
    assert r.status_code == 200, r.text
    data = r.json()

    # La réponse contient les trois noms créés
    assert ENG_NOM in data["answer"]
    assert ORG_NOM in data["answer"]
    assert ENV_NOM in data["answer"]

    # Les sources contiennent les trois entités
    source_noms = {src["nom"] for src in data["sources"]}
    assert ENG_NOM in source_noms
    assert ORG_NOM in source_noms
    assert ENV_NOM in source_noms

    # Les types d'entités sont corrects
    source_by_nom = {src["nom"]: src for src in data["sources"]}
    assert source_by_nom[ORG_NOM]["entity_type"] == "org"
    assert source_by_nom[ENV_NOM]["entity_type"] == "env"
    assert source_by_nom[ENG_NOM]["entity_type"] == "eng"


@pytest.mark.asyncio
async def test_rag_enrich_sources_finds_relations(client: AsyncClient, rag_setup, monkeypatch):
    """
    Vérifie que _enrich_sources enrichit correctement l'ENG avec ses ORG/ENV liées
    (requêtes SQL réelles sur la base de test SQLite).
    """
    s = rag_setup
    h = s["headers"]

    # On capture le contexte construit par le pipeline
    captured_context: list[str] = []

    async def fake_embed(text: str) -> list[float]:
        return [0.1] * 128

    async def fake_search(db, query_vec, top_k=5):
        return [{
            "obj_id": s["eng_obj_id"], "entity_id": s["eng_id"],
            "nom": ENG_NOM, "description": "", "score": 0.95, "entity_type": "eng",
        }]

    async def fake_llms(db):
        return [{"id": None, "nom": "OllamaTest", "fournisseur": "ollama",
                 "modele": "test-model", "type": "local", "url": "http://localhost:11434"}]

    async def fake_generate(question: str, context: str, llm_config: dict) -> str:
        captured_context.append(context)
        return f"Résultat pour {ENG_NOM}.\nSOURCES_USED: 1"

    monkeypatch.setattr("app.services.rag_service.embed_text", fake_embed)
    monkeypatch.setattr("app.services.rag_service.similarity_search", fake_search)
    monkeypatch.setattr("app.services.rag_service.list_available_llms", fake_llms)
    monkeypatch.setattr("app.services.rag_service._generate", fake_generate)

    r = await client.post("/api/rag/query",
                          json={"question": f"Détails sur {ENG_NOM}"},
                          headers=h)
    assert r.status_code == 200, r.text

    # Le contexte construit par _enrich_sources doit lister les relations
    assert len(captured_context) == 1
    ctx = captured_context[0]
    assert ENG_NOM in ctx
    assert ORG_NOM in ctx   # _enrich_sources doit avoir retrouvé l'ORG liée
    assert ENV_NOM in ctx   # _enrich_sources doit avoir retrouvé l'ENV liée
