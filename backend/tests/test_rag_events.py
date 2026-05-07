"""
Test d'intégration RAG — EVENTs avec dates.

Crée un ENG avec 3 événements à des dates précises (début, milieu accompli, fin),
puis interroge le terminal IA sur les dates et vérifie que les réponses contiennent
les événements créés avec leurs dates de début et de fin.

Noms uniques préfixés RAGEvent_ pour être facilement retrouvables.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token

# ─── Noms uniques ─────────────────────────────────────────────────────────────
ENG_NOM        = "RAGEvent_Nexus6174"
EVENT_DEBUT    = "RAGEvent_Alpha3891"   # 2026-05-10 09:00 — prévu, non accompli
EVENT_MILIEU   = "RAGEvent_Beta7629"    # 2026-05-15 14:00 → accompli le 15/05 15:30
EVENT_FIN      = "RAGEvent_Gamma4752"   # 2026-05-20 10:00 — prévu, non accompli

DATE_DEBUT_ENG          = "2026-05-01T08:00:00"
DATE_PREVUE_DEBUT       = "2026-05-10T09:00:00"
DATE_PREVUE_MILIEU      = "2026-05-15T14:00:00"
DATE_REELLE_MILIEU      = "2026-05-15T15:30:00"
DATE_PREVUE_FIN         = "2026-05-20T10:00:00"


@pytest.fixture
async def rag_events_setup(db_session: AsyncSession, client: AsyncClient):
    """
    Crée via API :
    TORG → ORG, TENV → ENV, TENG → ENG(RAGEvent_Nexus6174, date_debut=2026-05-01)
    TEVENT → 3 EVENTs avec dates distinctes, dont Beta7629 accompli.
    """
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_rag_events")
    cla = await create_cla(db_session, "ClaRagEvents")
    user = await create_user(db_session, auth_uid="admin_rag_events",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    h = {"Authorization": f"Bearer {token}"}

    # ── TORG + ORG ────────────────────────────────────────
    r = await client.post("/api/torg", json={"nom": "TorgRAGEvents", "cla_id": cla.id}, headers=h)
    assert r.status_code == 201
    torg_id = r.json()["id"]

    r = await client.post("/api/org", json={
        "nom": "OrgRAGEvents", "torg_id": torg_id, "cla_id": cla.id, "values": [],
    }, headers=h)
    assert r.status_code == 201
    org_id = r.json()["id"]

    # ── TENV + ENV ────────────────────────────────────────
    r = await client.post("/api/tenv", json={"nom": "TenvRAGEvents", "cla_id": cla.id}, headers=h)
    assert r.status_code == 201
    tenv_id = r.json()["id"]

    r = await client.post("/api/env", json={
        "nom": "EnvRAGEvents", "tenv_id": tenv_id, "cla_id": cla.id, "values": [],
    }, headers=h)
    assert r.status_code == 201
    env_id = r.json()["id"]

    # ── TENG + ENG ────────────────────────────────────────
    r = await client.post("/api/teng", json={"nom": "TengRAGEvents", "cla_id": cla.id}, headers=h)
    assert r.status_code == 201
    teng_id = r.json()["id"]

    r = await client.post("/api/eng", json={
        "nom": ENG_NOM,
        "teng_id": teng_id,
        "cla_id": cla.id,
        "org_ids": [org_id],
        "env_ids": [env_id],
        "date_debut": DATE_DEBUT_ENG,
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    eng_data = r.json()
    eng_id = eng_data["id"]
    eng_obj_id = eng_data["obj"]["id"]

    # ── TEVENT ────────────────────────────────────────────
    r = await client.post("/api/tevent", json={
        "nom": "TeventRAGEvents", "cla_id": cla.id,
        "duree_prevue_valeur": 2.0, "duree_prevue_unite": "heures",
    }, headers=h)
    assert r.status_code == 201
    tevent_id = r.json()["id"]

    # ── EVENT 1 : début (non accompli) ────────────────────
    r = await client.post("/api/event", json={
        "eng_id": eng_id,
        "tevent_id": tevent_id,
        "nom": EVENT_DEBUT,
        "cla_id": cla.id,
        "date_heure_prevue": DATE_PREVUE_DEBUT,
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev1_data = r.json()
    ev1_id = ev1_data["id"]
    ev1_obj_id = ev1_data["obj"]["id"]

    # ── EVENT 2 : milieu (accompli) ───────────────────────
    r = await client.post("/api/event", json={
        "eng_id": eng_id,
        "tevent_id": tevent_id,
        "nom": EVENT_MILIEU,
        "cla_id": cla.id,
        "date_heure_prevue": DATE_PREVUE_MILIEU,
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev2_data = r.json()
    ev2_id = ev2_data["id"]
    ev2_obj_id = ev2_data["obj"]["id"]

    # Marquer EVENT_MILIEU comme accompli
    r = await client.put(f"/api/event/{ev2_id}",
                         json={"date_heure_reelle": DATE_REELLE_MILIEU},
                         headers=h)
    assert r.status_code == 200, r.text

    # ── EVENT 3 : fin (non accompli) ─────────────────────
    r = await client.post("/api/event", json={
        "eng_id": eng_id,
        "tevent_id": tevent_id,
        "nom": EVENT_FIN,
        "cla_id": cla.id,
        "date_heure_prevue": DATE_PREVUE_FIN,
        "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev3_data = r.json()
    ev3_id = ev3_data["id"]
    ev3_obj_id = ev3_data["obj"]["id"]

    return {
        "headers": h,
        "eng_id": eng_id, "eng_obj_id": eng_obj_id,
        "ev1_id": ev1_id, "ev1_obj_id": ev1_obj_id,
        "ev2_id": ev2_id, "ev2_obj_id": ev2_obj_id,
        "ev3_id": ev3_id, "ev3_obj_id": ev3_obj_id,
    }


# ─── Helpers mock ─────────────────────────────────────────────────────────────

def _fake_llms():
    return [{"id": None, "nom": "OllamaTest", "fournisseur": "ollama",
             "modele": "test-model", "type": "local", "url": "http://localhost:11434"}]


def _all_event_sources(s: dict) -> list[dict]:
    return [
        {"obj_id": s["ev1_obj_id"], "entity_id": s["ev1_id"],
         "nom": EVENT_DEBUT, "description": "", "score": 0.95, "entity_type": "event"},
        {"obj_id": s["ev2_obj_id"], "entity_id": s["ev2_id"],
         "nom": EVENT_MILIEU, "description": "", "score": 0.90, "entity_type": "event"},
        {"obj_id": s["ev3_obj_id"], "entity_id": s["ev3_id"],
         "nom": EVENT_FIN, "description": "", "score": 0.85, "entity_type": "event"},
    ]


# ─── Tests ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rag_events_created(client: AsyncClient, rag_events_setup):
    """Vérifie les 3 événements accessibles via API avec leurs dates et statuts."""
    s = rag_events_setup
    h = s["headers"]

    r1 = await client.get(f"/api/event/{s['ev1_id']}", headers=h)
    assert r1.status_code == 200
    assert r1.json()["obj"]["nom"] == EVENT_DEBUT
    assert r1.json()["date_heure_prevue"].startswith("2026-05-10")
    assert r1.json()["est_accompli"] is False

    r2 = await client.get(f"/api/event/{s['ev2_id']}", headers=h)
    assert r2.status_code == 200
    assert r2.json()["obj"]["nom"] == EVENT_MILIEU
    assert r2.json()["date_heure_prevue"].startswith("2026-05-15")
    assert r2.json()["date_heure_reelle"].startswith("2026-05-15")
    assert r2.json()["est_accompli"] is True

    r3 = await client.get(f"/api/event/{s['ev3_id']}", headers=h)
    assert r3.status_code == 200
    assert r3.json()["obj"]["nom"] == EVENT_FIN
    assert r3.json()["date_heure_prevue"].startswith("2026-05-20")
    assert r3.json()["est_accompli"] is False

    # L'ENG doit comptabiliser les 3 events via l'endpoint de liste
    r_list = await client.get(f"/api/event?eng_id={s['eng_id']}", headers=h)
    assert r_list.status_code == 200
    assert r_list.json()["total"] == 3


@pytest.mark.asyncio
async def test_rag_query_finds_events_by_date(client: AsyncClient, rag_events_setup, monkeypatch):
    """
    Interroge le terminal IA sur les dates de mai 2026.
    Vérifie que les 3 EVENTs apparaissent dans la réponse et les sources.
    """
    s = rag_events_setup
    h = s["headers"]

    async def fake_embed(text: str) -> list[float]:
        return [0.1] * 128

    async def fake_search(db, query_vec, top_k=5):
        return _all_event_sources(s)

    async def fake_llms(db):
        return _fake_llms()

    async def fake_generate(question: str, context: str, llm_config: dict) -> str:
        return (
            f"En mai 2026, l'engagement {ENG_NOM} comprend trois événements :\n"
            f"- {EVENT_DEBUT} prévu le 10/05/2026 à 09:00 (non accompli)\n"
            f"- {EVENT_MILIEU} prévu le 15/05/2026 à 14:00, accompli le 15/05/2026 à 15:30\n"
            f"- {EVENT_FIN} prévu le 20/05/2026 à 10:00 (non accompli)\n"
            "SOURCES_USED: 1,2,3"
        )

    monkeypatch.setattr("app.services.rag_service.embed_text", fake_embed)
    monkeypatch.setattr("app.services.rag_service.similarity_search", fake_search)
    monkeypatch.setattr("app.services.rag_service.list_available_llms", fake_llms)
    monkeypatch.setattr("app.services.rag_service._generate", fake_generate)

    r = await client.post("/api/rag/query",
                          json={"question": "Quels événements sont prévus en mai 2026 ?"},
                          headers=h)
    assert r.status_code == 200, r.text
    data = r.json()

    # Les 3 événements doivent être mentionnés dans la réponse
    assert EVENT_DEBUT in data["answer"]
    assert EVENT_MILIEU in data["answer"]
    assert EVENT_FIN in data["answer"]

    # Les 3 apparaissent dans les sources avec le bon type
    source_noms = {src["nom"] for src in data["sources"]}
    assert EVENT_DEBUT in source_noms
    assert EVENT_MILIEU in source_noms
    assert EVENT_FIN in source_noms
    for src in data["sources"]:
        assert src["entity_type"] == "event"


@pytest.mark.asyncio
async def test_rag_events_context_includes_dates(client: AsyncClient, rag_events_setup, monkeypatch):
    """
    Vérifie que _enrich_sources enrichit chaque EVENT avec sa date prévue, sa date
    réelle (si accompli) et le nom de l'ENG parent, via SQL sur la base de test SQLite.
    Le contexte transmis au LLM doit contenir ces informations.
    """
    s = rag_events_setup
    h = s["headers"]

    captured_contexts: list[str] = []

    async def fake_embed(text: str) -> list[float]:
        return [0.1] * 128

    async def fake_search(db, query_vec, top_k=5):
        return _all_event_sources(s)

    async def fake_llms(db):
        return _fake_llms()

    async def fake_generate(question: str, context: str, llm_config: dict) -> str:
        captured_contexts.append(context)
        return f"Résultats pour {ENG_NOM}.\nSOURCES_USED: 1,2,3"

    monkeypatch.setattr("app.services.rag_service.embed_text", fake_embed)
    monkeypatch.setattr("app.services.rag_service.similarity_search", fake_search)
    monkeypatch.setattr("app.services.rag_service.list_available_llms", fake_llms)
    monkeypatch.setattr("app.services.rag_service._generate", fake_generate)

    r = await client.post("/api/rag/query",
                          json={"question": "Dates de début et fin des événements"},
                          headers=h)
    assert r.status_code == 200, r.text

    assert len(captured_contexts) == 1
    ctx = captured_contexts[0]

    # Le contexte doit mentionner l'ENG parent pour chaque event
    assert ENG_NOM in ctx

    # Les dates prévues des 3 events doivent apparaître
    assert "2026-05-10" in ctx   # date_prevue d'Alpha3891
    assert "2026-05-15" in ctx   # date_prevue de Beta7629
    assert "2026-05-20" in ctx   # date_prevue de Gamma4752

    # La date réelle de Beta7629 (accompli) doit aussi apparaître
    assert "15:30" in ctx        # date_reelle de Beta7629


@pytest.mark.asyncio
async def test_rag_filter_accomplished_event(client: AsyncClient, rag_events_setup, monkeypatch):
    """
    Interroge le terminal IA uniquement sur l'event accompli (EVENT_MILIEU).
    Vérifie que la date réelle apparaît dans le contexte et la réponse.
    """
    s = rag_events_setup
    h = s["headers"]

    captured_contexts: list[str] = []

    async def fake_embed(text: str) -> list[float]:
        return [0.1] * 128

    async def fake_search(db, query_vec, top_k=5):
        # Ne retourne que l'event accompli
        return [{"obj_id": s["ev2_obj_id"], "entity_id": s["ev2_id"],
                 "nom": EVENT_MILIEU, "description": "", "score": 0.98, "entity_type": "event"}]

    async def fake_llms(db):
        return _fake_llms()

    async def fake_generate(question: str, context: str, llm_config: dict) -> str:
        captured_contexts.append(context)
        return f"{EVENT_MILIEU} a été accompli le 15 mai 2026 à 15h30.\nSOURCES_USED: 1"

    monkeypatch.setattr("app.services.rag_service.embed_text", fake_embed)
    monkeypatch.setattr("app.services.rag_service.similarity_search", fake_search)
    monkeypatch.setattr("app.services.rag_service.list_available_llms", fake_llms)
    monkeypatch.setattr("app.services.rag_service._generate", fake_generate)

    r = await client.post("/api/rag/query",
                          json={"question": f"Quand a été accompli {EVENT_MILIEU} ?"},
                          headers=h)
    assert r.status_code == 200, r.text
    data = r.json()

    assert EVENT_MILIEU in data["answer"]
    assert len(data["sources"]) == 1
    assert data["sources"][0]["nom"] == EVENT_MILIEU

    # Le contexte doit contenir la date réelle
    assert len(captured_contexts) == 1
    assert "15:30" in captured_contexts[0]
    assert DATE_REELLE_MILIEU[:10] in captured_contexts[0]
