"""Service RAG — recherche vectorielle pgvector + génération LLM (Ollama ou distant)."""
from __future__ import annotations
import logging
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text as sa_text
from app.models.system import Config, LlmConfig
from app.services.crypto_service import decrypt_secret as _decrypt
from app.services.embedding_service import embed_text  # noqa: E402 — import circulaire évité via TYPE_CHECKING si besoin

logger = logging.getLogger("beclear.rag")

# ─── Prompt système ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es un assistant expert du système be.CLEAR.
be.CLEAR gère des Engagements (ENG) entre des Organisations (ORG) et des Environnements (ENV).
Le contexte fourni liste des entités numérotées avec leurs relations explicites :
- Pour un ENG : "Organisations liées" indique quelles ORG participent à cet engagement.
- Pour une ORG : "Engagements" liste ses engagements (si vide ou absent = aucun engagement).
- Pour un ENV : "Engagements" liste ses engagements (si vide ou absent = aucun engagement).
Réponds en français, de façon concise et factuelle, en t'appuyant UNIQUEMENT sur les relations explicitement listées dans le contexte.
Ne déduis rien au-delà de ce qui est écrit. Si une ORG ne figure pas dans "Organisations liées" d'un ENG, elle n'a pas cet engagement.

IMPORTANT : à la toute fin de ta réponse, ajoute obligatoirement une ligne (et une seule) de la forme exacte :
SOURCES_USED: 1,3,5
Règles strictes pour SOURCES_USED :
- N'inclus QUE les numéros des entités dont le contenu propre (nom, description) t'a servi à formuler ta réponse.
- N'inclus PAS une entité qui apparaît uniquement comme relation d'une autre (ex : une ORG citée dans "Organisations liées" d'un ENG ne doit pas être listée comme source sauf si tu as aussi utilisé sa fiche propre).
- Si tu réponds à partir d'un seul ENG, cite uniquement ce numéro.
Si aucun élément n'a été utilisé, écris : SOURCES_USED:"""


# ─── Sélection du LLM ────────────────────────────────────────────────────────

async def list_available_llms(db: AsyncSession) -> list[dict]:
    """Retourne les LLM configurés actifs (distants + local Ollama si configuré)."""
    llms: list[dict] = []

    result = await db.execute(select(LlmConfig).where(LlmConfig.est_actif.is_(True)))
    for llm in result.scalars().all():
        # api_url peut être stockée dans le champ parametres (JSONB) si besoin
        api_url = None
        if llm.parametres and isinstance(llm.parametres, dict):
            api_url = llm.parametres.get("api_url")
        llms.append({
            "id": llm.id,
            "nom": llm.nom,
            "fournisseur": llm.fournisseur,
            "modele": llm.modele,
            "api_key": _decrypt(llm.api_key_chiffree),
            "api_url": api_url,
            "type": "distant",
        })

    # Ollama local — récupéré depuis la CONFIG singleton
    config_result = await db.execute(select(Config).where(Config.id == 1))
    config = config_result.scalar_one_or_none()
    if config and config.ollama_url and config.ollama_modele:
        llms.append({
            "id": None,
            "nom": f"Ollama ({config.ollama_modele})",
            "fournisseur": "ollama",
            "modele": config.ollama_modele,
            "url": config.ollama_url,
            "type": "local",
        })

    return llms


# ─── Recherche vectorielle ────────────────────────────────────────────────────

async def similarity_search(db: AsyncSession, query_vec: list[float], top_k: int = 5) -> list[dict]:
    """Recherche les OBJ les plus proches dans pgvector (distance cosinus)."""
    if not query_vec:
        return []

    vec_str = "[" + ",".join(f"{v:.8f}" for v in query_vec) + "]"

    sql = sa_text("""
        SELECT
            e.obj_id,
            o.nom,
            o.description,
            1 - (e.vecteur <=> CAST(:vec AS vector)) AS score,
            CASE
                WHEN EXISTS (SELECT 1 FROM org   WHERE obj_id = e.obj_id) THEN 'org'
                WHEN EXISTS (SELECT 1 FROM env   WHERE obj_id = e.obj_id) THEN 'env'
                WHEN EXISTS (SELECT 1 FROM eng   WHERE obj_id = e.obj_id) THEN 'eng'
                WHEN EXISTS (SELECT 1 FROM event WHERE obj_id = e.obj_id) THEN 'event'
            END AS entity_type,
            COALESCE(
                (SELECT id FROM org   WHERE obj_id = e.obj_id),
                (SELECT id FROM env   WHERE obj_id = e.obj_id),
                (SELECT id FROM eng   WHERE obj_id = e.obj_id),
                (SELECT id FROM event WHERE obj_id = e.obj_id)
            ) AS entity_id
        FROM embedding e
        JOIN obj o ON o.id = e.obj_id
        WHERE e.vecteur IS NOT NULL
          AND (
              EXISTS (SELECT 1 FROM org   WHERE obj_id = e.obj_id) OR
              EXISTS (SELECT 1 FROM env   WHERE obj_id = e.obj_id) OR
              EXISTS (SELECT 1 FROM eng   WHERE obj_id = e.obj_id) OR
              EXISTS (SELECT 1 FROM event WHERE obj_id = e.obj_id)
          )
        ORDER BY e.vecteur <=> CAST(:vec AS vector)
        LIMIT :k
    """)
    try:
        result = await db.execute(sql, {"vec": vec_str, "k": top_k})
        rows = result.fetchall()
        return [
            {
                "obj_id": r.obj_id,
                "entity_id": r.entity_id,
                "nom": r.nom,
                "description": r.description or "",
                "score": float(r.score),
                "entity_type": r.entity_type,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("similarity_search failed: %s", exc)
        return []


# ─── Génération LLM ──────────────────────────────────────────────────────────

async def _enrich_sources(db: AsyncSession, sources: list[dict]) -> list[dict]:
    """Enrichit les sources avec les relations ENG↔ORG/ENV pour donner au LLM un contexte structurel."""
    from sqlalchemy import text as sa_text
    enriched = []
    for src in sources:
        etype = src["entity_type"]
        obj_id = src["obj_id"]

        if etype == "eng":
            # ORGs liées
            r = await db.execute(sa_text("""
                SELECT ob.nom FROM org o
                JOIN obj ob ON ob.id = o.obj_id
                JOIN eng_org eo ON eo.org_id = o.id
                JOIN eng e ON e.id = eo.eng_id AND e.obj_id = :oid
            """), {"oid": obj_id})
            src = {**src, "orgs": [row[0] for row in r.fetchall()]}
            # ENVs liées
            r = await db.execute(sa_text("""
                SELECT ob.nom FROM env v
                JOIN obj ob ON ob.id = v.obj_id
                JOIN eng_env ee ON ee.env_id = v.id
                JOIN eng e ON e.id = ee.eng_id AND e.obj_id = :oid
            """), {"oid": obj_id})
            src = {**src, "envs": [row[0] for row in r.fetchall()]}

        elif etype == "org":
            # ENGs liés
            r = await db.execute(sa_text("""
                SELECT ob.nom FROM eng e
                JOIN obj ob ON ob.id = e.obj_id
                JOIN eng_org eo ON eo.eng_id = e.id
                JOIN org o ON o.id = eo.org_id AND o.obj_id = :oid
            """), {"oid": obj_id})
            src = {**src, "engs": [row[0] for row in r.fetchall()]}

        elif etype == "env":
            # ENGs liés
            r = await db.execute(sa_text("""
                SELECT ob.nom FROM eng e
                JOIN obj ob ON ob.id = e.obj_id
                JOIN eng_env ee ON ee.eng_id = e.id
                JOIN env v ON v.id = ee.env_id AND v.obj_id = :oid
            """), {"oid": obj_id})
            src = {**src, "engs": [row[0] for row in r.fetchall()]}

        elif etype == "event":
            # ENG parent + dates
            r = await db.execute(sa_text("""
                SELECT ev.date_heure_prevue, ev.date_heure_reelle, ob.nom
                FROM event ev
                JOIN eng e ON e.id = ev.eng_id
                JOIN obj ob ON ob.id = e.obj_id
                WHERE ev.obj_id = :oid
            """), {"oid": obj_id})
            row = r.fetchone()
            if row:
                src = {
                    **src,
                    "date_prevue": str(row[0]) if row[0] else None,
                    "date_reelle": str(row[1]) if row[1] else None,
                    "eng_nom": row[2],
                }

        enriched.append(src)
    return enriched


def _build_context(sources: list[dict]) -> str:
    parts = []
    for i, src in enumerate(sources, 1):
        part = f"{i}. [{src['entity_type'].upper()}] {src['nom']}"
        if src["description"]:
            part += f"\n   Description : {src['description'][:300]}"
        if src.get("orgs"):
            part += f"\n   Organisations liées : {', '.join(src['orgs'])}"
        if src.get("envs"):
            part += f"\n   Environnements liés : {', '.join(src['envs'])}"
        if src.get("engs"):
            engs = src["engs"]
            if engs:
                part += f"\n   Engagements : {', '.join(engs)}"
            else:
                part += "\n   Engagements : aucun"
        if src.get("eng_nom"):
            part += f"\n   Engagement : {src['eng_nom']}"
        if src.get("date_prevue"):
            part += f"\n   Date prévue : {src['date_prevue']}"
        if src.get("date_reelle"):
            part += f"\n   Date réelle : {src['date_reelle']}"
        parts.append(part)
    return "\n\n".join(parts)


async def _generate_ollama(question: str, context: str, url: str, modele: str) -> str:
    prompt_user = f"Voici les éléments pertinents du système :\n\n{context}\n\nQuestion : {question}"
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{url}/api/chat",
                json={
                    "model": modele,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt_user},
                    ],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]
    except Exception as exc:
        logger.error("Ollama generation failed: %s", exc)
        return f"Erreur lors de la génération (Ollama) : {exc}"


async def _generate_openai(question: str, context: str, modele: str, api_key: str, api_url: str | None) -> str:
    try:
        from llama_index.llms.openai import OpenAI
        llm = OpenAI(model=modele, api_key=api_key, api_base=api_url)
        prompt = f"{SYSTEM_PROMPT}\n\nContexte :\n{context}\n\nQuestion : {question}"
        response = await llm.acomplete(prompt)
        return str(response)
    except Exception as exc:
        logger.error("OpenAI generation failed: %s", exc)
        return f"Erreur lors de la génération (OpenAI) : {exc}"


async def _generate_anthropic(question: str, context: str, modele: str, api_key: str) -> str:
    try:
        from llama_index.llms.anthropic import Anthropic
        llm = Anthropic(model=modele, api_key=api_key)
        prompt = f"{SYSTEM_PROMPT}\n\nContexte :\n{context}\n\nQuestion : {question}"
        response = await llm.acomplete(prompt)
        return str(response)
    except Exception as exc:
        logger.error("Anthropic generation failed: %s", exc)
        return f"Erreur lors de la génération (Anthropic) : {exc}"


async def _generate(question: str, context: str, llm_config: dict) -> str:
    fournisseur = llm_config["fournisseur"]
    modele = llm_config["modele"]

    if fournisseur == "ollama":
        url = llm_config.get("url", "http://100.72.122.51:11434")
        return await _generate_ollama(question, context, url, modele)
    elif fournisseur == "openai":
        return await _generate_openai(
            question, context, modele,
            api_key=llm_config.get("api_key") or "",
            api_url=llm_config.get("api_url"),
        )
    elif fournisseur in ("anthropic", "claude"):
        return await _generate_anthropic(
            question, context, modele,
            api_key=llm_config.get("api_key") or "",
        )
    else:
        return f"Fournisseur '{fournisseur}' non supporté."


# ─── Point d'entrée principal ─────────────────────────────────────────────────

async def rag_query(
    db: AsyncSession,
    question: str,
    user_id: int,
    llm_id: int | None = None,
) -> dict:
    """
    Exécute une requête RAG complète :
    1. Embed la question (Ollama nomic-embed-text)
    2. Recherche vectorielle dans pgvector
    3. Génère une réponse via le LLM sélectionné
    Retourne { answer: str, sources: [{ obj_id, nom, entity_type }] }
    """
    # ── 1. Sélection du LLM ──────────────────────────────
    available_llms = await list_available_llms(db)
    if not available_llms:
        return {
            "answer": "Aucun LLM configuré. Ajoutez un modèle dans Administration → Configuration.",
            "sources": [],
        }

    selected_llm: dict | None = None
    if llm_id is not None:
        selected_llm = next((l for l in available_llms if l.get("id") == llm_id), None)
        if selected_llm is None:
            return {"answer": "LLM demandé introuvable ou inactif.", "sources": []}
    else:
        # Priorité : Ollama local d'abord
        selected_llm = next((l for l in available_llms if l["type"] == "local"), available_llms[0])

    # ── 2. Embedding de la question ──────────────────────
    from app.config import settings

    query_vec = await embed_text(question)
    if not query_vec:
        return {
            "answer": (
                "Impossible de calculer l'embedding de votre question. "
                "Vérifiez que le serveur Ollama est accessible et que le modèle "
                f"'{settings.OLLAMA_EMBED_MODEL}' est disponible."
            ),
            "sources": [],
        }

    # ── 3. Recherche vectorielle ─────────────────────────
    sources = await similarity_search(db, query_vec, top_k=8)
    if not sources:
        return {
            "answer": (
                "Aucun résultat pertinent trouvé. "
                "Vérifiez que des données ont bien été indexées (créez ou modifiez des ORG/ENV/ENG/EVENT)."
            ),
            "sources": [],
        }

    # ── 4. Enrichissement + construction du contexte ────
    sources = await _enrich_sources(db, sources)
    context = _build_context(sources)

    # ── 5. Génération ────────────────────────────────────
    raw_answer = await _generate(question, context, selected_llm)

    # ── 6. Extraction des sources réellement utilisées ───
    used_indices: set[int] = set()
    answer_lines = raw_answer.strip().splitlines()
    clean_lines = []
    for line in answer_lines:
        stripped = line.strip()
        if stripped.startswith("SOURCES_USED:"):
            # Extrait les numéros ex: "SOURCES_USED: 1,3,5"
            nums_part = stripped[len("SOURCES_USED:"):].strip()
            for token in nums_part.split(","):
                token = token.strip()
                if token.isdigit():
                    used_indices.add(int(token))
        else:
            clean_lines.append(line)
    answer = "\n".join(clean_lines).strip()

    # Si le LLM n'a pas joué le jeu, on retombe sur le filtre score
    if used_indices:
        filtered_sources = [
            sources[i - 1]  # numérotation 1-based dans le contexte
            for i in sorted(used_indices)
            if 1 <= i <= len(sources)
        ]
    else:
        filtered_sources = [s for s in sources if s["score"] > 0.3]

    formatted_sources = [
        {
            "obj_id": s["obj_id"],
            "entity_id": s["entity_id"],
            "nom": s["nom"],
            "entity_type": s["entity_type"],
        }
        for s in filtered_sources
    ]

    return {"answer": answer, "sources": formatted_sources}
