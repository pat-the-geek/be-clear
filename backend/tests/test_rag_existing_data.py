"""
Test de vérification d'éléments existants par le terminal IA.

Stratégie :
1. Insérer un jeu de données cohérent (2 ORG, 2 ENV, 2 ENG avec EVENTs)
2. Lire leurs propriétés exactes depuis la base (noms, dates, relations)
3. Interroger le terminal IA avec plusieurs questions ciblées
4. Vérifier que chaque réponse contient les informations précises attendues

Les noms sont déterministes pour pouvoir être retrouvés sans ambiguïté.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token

# ─── Noms déterministes ───────────────────────────────────────────────────────
ORG_A    = "Existing_OrgAlpha8831"
ORG_B    = "Existing_OrgBeta4467"
ENV_X    = "Existing_EnvXray3312"
ENV_Y    = "Existing_EnvYield7745"
ENG_1    = "Existing_Eng1Sigma9920"
ENG_2    = "Existing_Eng2Delta2258"
EV_1A    = "Existing_Ev1Alpha6601"   # ENG_1, prévu 2026-06-01, accompli
EV_1B    = "Existing_Ev1Beta8823"    # ENG_1, prévu 2026-06-15
EV_2A    = "Existing_Ev2Alpha3374"   # ENG_2, prévu 2026-07-01
EV_2B    = "Existing_Ev2Beta5519"    # ENG_2, prévu 2026-07-20, accompli


@pytest.fixture
async def existing_data(db_session: AsyncSession, client: AsyncClient):
    """
    Crée et expose le jeu de données existant.
    Retourne les IDs et obj_ids de tous les éléments pour que les mocks
    de similarity_search puissent retourner les bons obj_ids.
    """
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_existing")
    cla = await create_cla(db_session, "ClaExisting")
    user = await create_user(db_session, auth_uid="admin_existing",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    h = {"Authorization": f"Bearer {token}"}

    # Types
    r = await client.post("/api/torg", json={"nom": "TorgExisting", "cla_id": cla.id}, headers=h)
    torg_id = r.json()["id"]

    r = await client.post("/api/tenv", json={"nom": "TenvExisting", "cla_id": cla.id}, headers=h)
    tenv_id = r.json()["id"]

    r = await client.post("/api/teng", json={"nom": "TengExisting", "cla_id": cla.id}, headers=h)
    teng_id = r.json()["id"]

    r = await client.post("/api/tevent", json={
        "nom": "TeventExisting", "cla_id": cla.id,
        "duree_prevue_valeur": 1.0, "duree_prevue_unite": "jours",
    }, headers=h)
    tevent_id = r.json()["id"]

    # ORG A
    r = await client.post("/api/org", json={
        "nom": ORG_A, "torg_id": torg_id, "cla_id": cla.id, "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    org_a = r.json(); org_a_id = org_a["id"]; org_a_obj = org_a["obj"]["id"]

    # ORG B
    r = await client.post("/api/org", json={
        "nom": ORG_B, "torg_id": torg_id, "cla_id": cla.id, "values": [],
    }, headers=h)
    assert r.status_code == 201
    org_b = r.json(); org_b_id = org_b["id"]; org_b_obj = org_b["obj"]["id"]

    # ENV X
    r = await client.post("/api/env", json={
        "nom": ENV_X, "tenv_id": tenv_id, "cla_id": cla.id, "values": [],
    }, headers=h)
    assert r.status_code == 201
    env_x = r.json(); env_x_id = env_x["id"]; env_x_obj = env_x["obj"]["id"]

    # ENV Y
    r = await client.post("/api/env", json={
        "nom": ENV_Y, "tenv_id": tenv_id, "cla_id": cla.id, "values": [],
    }, headers=h)
    assert r.status_code == 201
    env_y = r.json(); env_y_id = env_y["id"]; env_y_obj = env_y["obj"]["id"]

    # ENG 1 : ORG_A + ORG_B dans ENV_X, début 2026-06-01
    r = await client.post("/api/eng", json={
        "nom": ENG_1, "teng_id": teng_id, "cla_id": cla.id,
        "org_ids": [org_a_id, org_b_id], "env_ids": [env_x_id],
        "date_debut": "2026-06-01T08:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    eng1 = r.json(); eng1_id = eng1["id"]; eng1_obj = eng1["obj"]["id"]

    # ENG 2 : ORG_B seul dans ENV_Y, début 2026-07-01
    r = await client.post("/api/eng", json={
        "nom": ENG_2, "teng_id": teng_id, "cla_id": cla.id,
        "org_ids": [org_b_id], "env_ids": [env_y_id],
        "date_debut": "2026-07-01T08:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    eng2 = r.json(); eng2_id = eng2["id"]; eng2_obj = eng2["obj"]["id"]

    # EV_1A : ENG_1, 2026-06-01, accompli le 2026-06-01 T17:00
    r = await client.post("/api/event", json={
        "eng_id": eng1_id, "tevent_id": tevent_id, "nom": EV_1A,
        "cla_id": cla.id, "date_heure_prevue": "2026-06-01T09:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev1a = r.json(); ev1a_id = ev1a["id"]; ev1a_obj = ev1a["obj"]["id"]
    await client.put(f"/api/event/{ev1a_id}",
                     json={"date_heure_reelle": "2026-06-01T17:00:00"}, headers=h)

    # EV_1B : ENG_1, 2026-06-15, non accompli
    r = await client.post("/api/event", json={
        "eng_id": eng1_id, "tevent_id": tevent_id, "nom": EV_1B,
        "cla_id": cla.id, "date_heure_prevue": "2026-06-15T10:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev1b = r.json(); ev1b_id = ev1b["id"]; ev1b_obj = ev1b["obj"]["id"]

    # EV_2A : ENG_2, 2026-07-01, non accompli
    r = await client.post("/api/event", json={
        "eng_id": eng2_id, "tevent_id": tevent_id, "nom": EV_2A,
        "cla_id": cla.id, "date_heure_prevue": "2026-07-01T09:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev2a = r.json(); ev2a_id = ev2a["id"]; ev2a_obj = ev2a["obj"]["id"]

    # EV_2B : ENG_2, 2026-07-20, accompli le 2026-07-21 T08:30
    r = await client.post("/api/event", json={
        "eng_id": eng2_id, "tevent_id": tevent_id, "nom": EV_2B,
        "cla_id": cla.id, "date_heure_prevue": "2026-07-20T14:00:00", "values": [],
    }, headers=h)
    assert r.status_code == 201, r.text
    ev2b = r.json(); ev2b_id = ev2b["id"]; ev2b_obj = ev2b["obj"]["id"]
    await client.put(f"/api/event/{ev2b_id}",
                     json={"date_heure_reelle": "2026-07-21T08:30:00"}, headers=h)

    return {
        "headers": h,
        "org_a_id": org_a_id, "org_a_obj": org_a_obj,
        "org_b_id": org_b_id, "org_b_obj": org_b_obj,
        "env_x_id": env_x_id, "env_x_obj": env_x_obj,
        "env_y_id": env_y_id, "env_y_obj": env_y_obj,
        "eng1_id": eng1_id,   "eng1_obj": eng1_obj,
        "eng2_id": eng2_id,   "eng2_obj": eng2_obj,
        "ev1a_id": ev1a_id,   "ev1a_obj": ev1a_obj,
        "ev1b_id": ev1b_id,   "ev1b_obj": ev1b_obj,
        "ev2a_id": ev2a_id,   "ev2a_obj": ev2a_obj,
        "ev2b_id": ev2b_id,   "ev2b_obj": ev2b_obj,
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _headers_llms():
    async def fake_embed(text: str):
        return [0.1] * 128

    async def fake_llms(db):
        return [{"id": None, "nom": "TestLLM", "fournisseur": "ollama",
                 "modele": "test", "type": "local", "url": "http://localhost:11434"}]

    return fake_embed, fake_llms


async def _rag(client, question, h, monkeypatch, fake_search, fake_generate):
    """Utilitaire — patch les services et exécute une requête RAG."""
    fake_embed, fake_llms = _headers_llms()
    monkeypatch.setattr("app.services.rag_service.embed_text", fake_embed)
    monkeypatch.setattr("app.services.rag_service.similarity_search", fake_search)
    monkeypatch.setattr("app.services.rag_service.list_available_llms", fake_llms)
    monkeypatch.setattr("app.services.rag_service._generate", fake_generate)
    r = await client.post("/api/rag/query", json={"question": question}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# ─── Tests de vérification des données existantes ────────────────────────────

@pytest.mark.asyncio
async def test_existing_data_readable_via_api(client: AsyncClient, existing_data):
    """
    Contrôle 1 — données directement accessibles via API.
    Vérifie que les éléments existent et que leurs propriétés sont exactes.
    """
    s = existing_data
    h = s["headers"]

    # ORG A et B existent
    r = await client.get(f"/api/org/{s['org_a_id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["obj"]["nom"] == ORG_A

    r = await client.get(f"/api/org/{s['org_b_id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["obj"]["nom"] == ORG_B

    # ENV X et Y existent
    r = await client.get(f"/api/env/{s['env_x_id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["obj"]["nom"] == ENV_X

    r = await client.get(f"/api/env/{s['env_y_id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["obj"]["nom"] == ENV_Y

    # ENG 1 — ORG_A + ORG_B, ENV_X
    r = await client.get(f"/api/eng/{s['eng1_id']}", headers=h)
    assert r.status_code == 200
    eng1 = r.json()
    assert eng1["obj"]["nom"] == ENG_1
    org_noms = {o["nom"] for o in eng1["orgs"]}
    assert ORG_A in org_noms
    assert ORG_B in org_noms
    env_noms = {e["nom"] for e in eng1["envs"]}
    assert ENV_X in env_noms

    # ENG 2 — ORG_B seul, ENV_Y
    r = await client.get(f"/api/eng/{s['eng2_id']}", headers=h)
    eng2 = r.json()
    assert eng2["obj"]["nom"] == ENG_2
    assert len(eng2["orgs"]) == 1
    assert eng2["orgs"][0]["nom"] == ORG_B
    assert eng2["envs"][0]["nom"] == ENV_Y

    # EVENTs : statuts accompli/non accompli
    r = await client.get(f"/api/event/{s['ev1a_id']}", headers=h)
    assert r.json()["est_accompli"] is True
    assert r.json()["date_heure_reelle"].startswith("2026-06-01")

    r = await client.get(f"/api/event/{s['ev1b_id']}", headers=h)
    assert r.json()["est_accompli"] is False

    r = await client.get(f"/api/event/{s['ev2b_id']}", headers=h)
    assert r.json()["est_accompli"] is True
    assert r.json()["date_heure_reelle"].startswith("2026-07-21")


@pytest.mark.asyncio
async def test_rag_query_org_engagements(client: AsyncClient, existing_data, monkeypatch):
    """
    Contrôle 2 — RAG : "Quels engagements impliquent ORG_B ?"
    ORG_B participe à ENG_1 et ENG_2 → les deux doivent apparaître dans la réponse.
    _enrich_sources doit retrouver les deux ENGs via SQL.
    """
    s = existing_data
    h = s["headers"]
    captured = []

    async def fake_search(db, q, top_k=5):
        return [{"obj_id": s["org_b_obj"], "entity_id": s["org_b_id"],
                 "nom": ORG_B, "description": "", "score": 0.95, "entity_type": "org"}]

    async def fake_generate(question, context, llm_config):
        captured.append(context)
        return (f"{ORG_B} participe à deux engagements : {ENG_1} et {ENG_2}.\n"
                "SOURCES_USED: 1")

    data = await _rag(client, f"Quels engagements impliquent {ORG_B} ?",
                      h, monkeypatch, fake_search, fake_generate)

    assert ENG_1 in data["answer"]
    assert ENG_2 in data["answer"]
    assert len(data["sources"]) == 1
    assert data["sources"][0]["nom"] == ORG_B

    # Le contexte SQL doit avoir trouvé les deux ENGs pour ORG_B
    assert len(captured) == 1
    assert ENG_1 in captured[0]
    assert ENG_2 in captured[0]


@pytest.mark.asyncio
async def test_rag_query_eng_participants(client: AsyncClient, existing_data, monkeypatch):
    """
    Contrôle 3 — RAG : "Qui participe à ENG_1 ?"
    ENG_1 implique ORG_A et ORG_B dans ENV_X → tous présents dans le contexte.
    """
    s = existing_data
    h = s["headers"]
    captured = []

    async def fake_search(db, q, top_k=5):
        return [{"obj_id": s["eng1_obj"], "entity_id": s["eng1_id"],
                 "nom": ENG_1, "description": "", "score": 0.98, "entity_type": "eng"}]

    async def fake_generate(question, context, llm_config):
        captured.append(context)
        return (f"{ENG_1} implique {ORG_A} et {ORG_B} dans l'environnement {ENV_X}.\n"
                "SOURCES_USED: 1")

    data = await _rag(client, f"Qui participe à {ENG_1} ?",
                      h, monkeypatch, fake_search, fake_generate)

    assert ORG_A in data["answer"]
    assert ORG_B in data["answer"]
    assert ENV_X in data["answer"]

    # Le contexte doit avoir ORG_A, ORG_B, ENV_X via _enrich_sources
    assert len(captured) == 1
    assert ORG_A in captured[0]
    assert ORG_B in captured[0]
    assert ENV_X in captured[0]


@pytest.mark.asyncio
async def test_rag_query_events_in_june(client: AsyncClient, existing_data, monkeypatch):
    """
    Contrôle 4 — RAG : "Quels événements en juin 2026 ?"
    EV_1A (accompli le 01/06) et EV_1B (prévu le 15/06) appartiennent à ENG_1.
    Les deux doivent apparaître avec leurs dates exactes dans le contexte.
    """
    s = existing_data
    h = s["headers"]
    captured = []

    async def fake_search(db, q, top_k=5):
        return [
            {"obj_id": s["ev1a_obj"], "entity_id": s["ev1a_id"],
             "nom": EV_1A, "description": "", "score": 0.92, "entity_type": "event"},
            {"obj_id": s["ev1b_obj"], "entity_id": s["ev1b_id"],
             "nom": EV_1B, "description": "", "score": 0.88, "entity_type": "event"},
        ]

    async def fake_generate(question, context, llm_config):
        captured.append(context)
        return (f"En juin 2026 : {EV_1A} prévu le 01/06 (accompli le 01/06 à 17h00), "
                f"{EV_1B} prévu le 15/06 (non accompli).\nSOURCES_USED: 1,2")

    data = await _rag(client, "Quels événements en juin 2026 ?",
                      h, monkeypatch, fake_search, fake_generate)

    assert EV_1A in data["answer"]
    assert EV_1B in data["answer"]
    source_noms = {src["nom"] for src in data["sources"]}
    assert EV_1A in source_noms
    assert EV_1B in source_noms

    # Contrôles du contexte : dates prévues et date réelle de EV_1A
    assert len(captured) == 1
    ctx = captured[0]
    assert "2026-06-01" in ctx   # date_prevue EV_1A
    assert "17:00" in ctx        # date_reelle EV_1A (accomplie)
    assert "2026-06-15" in ctx   # date_prevue EV_1B
    assert ENG_1 in ctx          # ENG parent des deux events


@pytest.mark.asyncio
async def test_rag_query_accomplished_events_only(client: AsyncClient, existing_data, monkeypatch):
    """
    Contrôle 5 — RAG : only events accomplies (EV_1A et EV_2B).
    Vérifie que les dates réelles sont correctes et que les events non-accomplis sont absents.
    """
    s = existing_data
    h = s["headers"]
    captured = []

    async def fake_search(db, q, top_k=5):
        return [
            {"obj_id": s["ev1a_obj"], "entity_id": s["ev1a_id"],
             "nom": EV_1A, "description": "", "score": 0.95, "entity_type": "event"},
            {"obj_id": s["ev2b_obj"], "entity_id": s["ev2b_id"],
             "nom": EV_2B, "description": "", "score": 0.90, "entity_type": "event"},
        ]

    async def fake_generate(question, context, llm_config):
        captured.append(context)
        return (f"Événements accomplis : {EV_1A} (réel : 01/06/2026 17h00), "
                f"{EV_2B} (réel : 21/07/2026 08h30).\nSOURCES_USED: 1,2")

    data = await _rag(client, "Quels événements ont été accomplis ?",
                      h, monkeypatch, fake_search, fake_generate)

    assert EV_1A in data["answer"]
    assert EV_2B in data["answer"]
    # EV_1B et EV_2A (non accomplis) ne doivent pas être dans les sources
    source_noms = {src["nom"] for src in data["sources"]}
    assert EV_1B not in source_noms
    assert EV_2A not in source_noms

    # Dates réelles exactes dans le contexte
    assert len(captured) == 1
    ctx = captured[0]
    assert "2026-06-01" in ctx   # date réelle EV_1A
    assert "17:00" in ctx
    assert "2026-07-21" in ctx   # date réelle EV_2B
    assert "08:30" in ctx


@pytest.mark.asyncio
async def test_rag_query_env_engagements(client: AsyncClient, existing_data, monkeypatch):
    """
    Contrôle 6 — RAG : "Quels engagements dans ENV_Y ?"
    Seul ENG_2 est dans ENV_Y → seul ENG_2 doit apparaître.
    """
    s = existing_data
    h = s["headers"]
    captured = []

    async def fake_search(db, q, top_k=5):
        return [{"obj_id": s["env_y_obj"], "entity_id": s["env_y_id"],
                 "nom": ENV_Y, "description": "", "score": 0.96, "entity_type": "env"}]

    async def fake_generate(question, context, llm_config):
        captured.append(context)
        return (f"L'environnement {ENV_Y} est impliqué dans l'engagement {ENG_2}.\n"
                "SOURCES_USED: 1")

    data = await _rag(client, f"Quels engagements se déroulent dans {ENV_Y} ?",
                      h, monkeypatch, fake_search, fake_generate)

    assert ENV_Y in data["answer"]
    assert ENG_2 in data["answer"]
    # ENG_1 ne doit pas être dans la réponse (il est dans ENV_X, pas ENV_Y)
    assert ENG_1 not in data["answer"]

    assert len(captured) == 1
    ctx = captured[0]
    assert ENG_2 in ctx
    assert ENG_1 not in ctx     # ENV_Y n'est pas liée à ENG_1


@pytest.mark.asyncio
async def test_rag_multi_entity_query(client: AsyncClient, existing_data, monkeypatch):
    """
    Contrôle 7 — RAG multi-entités : retourne ORG_A, ENG_1, EV_1A dans les sources.
    Vérifie que le contexte mixte (org, eng, event) est correctement construit.
    """
    s = existing_data
    h = s["headers"]
    captured = []

    async def fake_search(db, q, top_k=5):
        return [
            {"obj_id": s["org_a_obj"], "entity_id": s["org_a_id"],
             "nom": ORG_A, "description": "", "score": 0.95, "entity_type": "org"},
            {"obj_id": s["eng1_obj"], "entity_id": s["eng1_id"],
             "nom": ENG_1, "description": "", "score": 0.90, "entity_type": "eng"},
            {"obj_id": s["ev1a_obj"], "entity_id": s["ev1a_id"],
             "nom": EV_1A, "description": "", "score": 0.85, "entity_type": "event"},
        ]

    async def fake_generate(question, context, llm_config):
        captured.append(context)
        return (f"Résumé : {ORG_A} participe à {ENG_1}. "
                f"Premier événement : {EV_1A} accompli le 01/06/2026.\n"
                "SOURCES_USED: 1,2,3")

    data = await _rag(client, f"Résume l'activité de {ORG_A}",
                      h, monkeypatch, fake_search, fake_generate)

    assert ORG_A in data["answer"]
    assert ENG_1 in data["answer"]
    assert EV_1A in data["answer"]

    source_types = {src["nom"]: src["entity_type"] for src in data["sources"]}
    assert source_types[ORG_A] == "org"
    assert source_types[ENG_1] == "eng"
    assert source_types[EV_1A] == "event"

    assert len(captured) == 1
    ctx = captured[0]
    # ORG_A → ses ENGs via _enrich_sources
    assert ENG_1 in ctx
    # ENG_1 → ses ORGs et ENVs
    assert ORG_A in ctx
    assert ENV_X in ctx
    # EV_1A → sa date réelle
    assert "17:00" in ctx
    assert ENG_1 in ctx   # ENG parent de l'event


# ─── Nettoyage ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cleanup_created_elements(client: AsyncClient, existing_data):
    """
    Contrôle final — supprime dans l'ordre correct tous les éléments créés
    (events → engs → orgs → envs) et vérifie que chacun retourne 404 après suppression.

    Note : avec SQLite in-memory les données sont de toute façon éphémères par test,
    mais ce test valide explicitement les endpoints DELETE et la cohérence des erreurs 404.
    """
    s = existing_data
    h = s["headers"]

    # ── Étape 1 : supprimer les EVENTs ────────────────────
    for ev_id, nom in [
        (s["ev1a_id"], EV_1A), (s["ev1b_id"], EV_1B),
        (s["ev2a_id"], EV_2A), (s["ev2b_id"], EV_2B),
    ]:
        r = await client.delete(f"/api/event/{ev_id}", headers=h)
        assert r.status_code == 204, f"DELETE event {nom} → {r.status_code}"

    # Vérification : les EVENTs retournent 404
    for ev_id, nom in [
        (s["ev1a_id"], EV_1A), (s["ev1b_id"], EV_1B),
        (s["ev2a_id"], EV_2A), (s["ev2b_id"], EV_2B),
    ]:
        r = await client.get(f"/api/event/{ev_id}", headers=h)
        assert r.status_code == 404, f"GET event {nom} après delete → {r.status_code} (attendu 404)"

    # ── Étape 2 : supprimer les ENGs ──────────────────────
    for eng_id, nom in [(s["eng1_id"], ENG_1), (s["eng2_id"], ENG_2)]:
        r = await client.delete(f"/api/eng/{eng_id}", headers=h)
        assert r.status_code == 204, f"DELETE eng {nom} → {r.status_code}"

    # Vérification : les ENGs retournent 404
    for eng_id, nom in [(s["eng1_id"], ENG_1), (s["eng2_id"], ENG_2)]:
        r = await client.get(f"/api/eng/{eng_id}", headers=h)
        assert r.status_code == 404, f"GET eng {nom} après delete → {r.status_code} (attendu 404)"

    # ── Étape 3 : supprimer les ORGs ──────────────────────
    for org_id, nom in [(s["org_a_id"], ORG_A), (s["org_b_id"], ORG_B)]:
        r = await client.delete(f"/api/org/{org_id}", headers=h)
        assert r.status_code == 204, f"DELETE org {nom} → {r.status_code}"

    # Vérification : les ORGs retournent 404
    for org_id, nom in [(s["org_a_id"], ORG_A), (s["org_b_id"], ORG_B)]:
        r = await client.get(f"/api/org/{org_id}", headers=h)
        assert r.status_code == 404, f"GET org {nom} après delete → {r.status_code} (attendu 404)"

    # ── Étape 4 : supprimer les ENVs ──────────────────────
    for env_id, nom in [(s["env_x_id"], ENV_X), (s["env_y_id"], ENV_Y)]:
        r = await client.delete(f"/api/env/{env_id}", headers=h)
        assert r.status_code == 204, f"DELETE env {nom} → {r.status_code}"

    # Vérification : les ENVs retournent 404
    for env_id, nom in [(s["env_x_id"], ENV_X), (s["env_y_id"], ENV_Y)]:
        r = await client.get(f"/api/env/{env_id}", headers=h)
        assert r.status_code == 404, f"GET env {nom} après delete → {r.status_code} (attendu 404)"

    # ── Contrôle final via listes filtrées ────────────────
    # Aucun event ne doit subsister pour les ENGs supprimés
    r = await client.get(f"/api/event?eng_id={s['eng1_id']}", headers=h)
    assert r.json()["total"] == 0, "Des events subsistent après suppression de ENG_1"

    r = await client.get(f"/api/event?eng_id={s['eng2_id']}", headers=h)
    assert r.json()["total"] == 0, "Des events subsistent après suppression de ENG_2"
