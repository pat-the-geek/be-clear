"""Service d'embedding via Ollama (nomic-embed-text ou autre modèle configuré)."""
from __future__ import annotations
import logging
import httpx
from app.config import settings

logger = logging.getLogger("beclear.embedding")


async def embed_text(text: str) -> list[float]:
    """
    Génère un vecteur d'embedding via l'API Ollama.
    Retourne [] si Ollama est indisponible ou si le modèle n'est pas chargé.
    """
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.OLLAMA_URL}/api/embeddings",
                json={"model": settings.OLLAMA_EMBED_MODEL, "prompt": text},
            )
            resp.raise_for_status()
            return resp.json().get("embedding", [])
    except Exception as exc:
        logger.warning("embed_text failed: %s", exc)
        return []


def build_embed_text(
    nom: str,
    description: str | None,
    values_text: list[str],
    entity_type: str,
) -> str:
    """Construit le texte consolidé à embedder pour un OBJ."""
    parts = [f"[{entity_type.upper()}] {nom}"]
    if description:
        parts.append(description)
    parts.extend(v for v in values_text if v)
    return " ".join(parts)


async def upsert_embedding(db, obj_id: int, text: str) -> None:
    """
    Génère l'embedding de `text` et l'insère/met à jour dans la table embedding.
    Si embed_text() retourne [] (Ollama indisponible), ne fait rien.
    Non-bloquant : entoure les erreurs SQL d'un try/except.
    """
    from datetime import datetime, timezone
    from sqlalchemy import text as sa_text

    vec = await embed_text(text)
    if not vec:
        return

    now = datetime.now(timezone.utc)
    vec_str = "[" + ",".join(f"{v:.8f}" for v in vec) + "]"

    try:
        async with db.begin_nested():
            result = await db.execute(
                sa_text("SELECT id FROM embedding WHERE obj_id = :oid"),
                {"oid": obj_id},
            )
            exists = result.scalar_one_or_none()

            if exists:
                await db.execute(
                    sa_text(
                        "UPDATE embedding SET vecteur = CAST(:v AS vector), updated_at = :t "
                        "WHERE obj_id = :oid"
                    ),
                    {"v": vec_str, "t": now, "oid": obj_id},
                )
            else:
                await db.execute(
                    sa_text(
                        "INSERT INTO embedding (obj_id, vecteur, created_at, updated_at) "
                        "VALUES (:oid, CAST(:v AS vector), :t, :t)"
                    ),
                    {"v": vec_str, "t": now, "oid": obj_id},
                )
        # Le savepoint est commité — on propage via le commit de l'appelant
    except Exception as exc:
        logger.warning("upsert_embedding failed for obj_id=%s: %s", obj_id, exc)
        # Le savepoint est rollbacké automatiquement — session principale intacte


async def delete_embedding(db, obj_id: int) -> None:
    """Supprime l'embedding d'un OBJ (appelé au DELETE de l'entité)."""
    from sqlalchemy import text as sa_text
    try:
        await db.execute(
            sa_text("DELETE FROM embedding WHERE obj_id = :oid"),
            {"oid": obj_id},
        )
        await db.commit()
    except Exception as exc:
        logger.warning("delete_embedding failed for obj_id=%s: %s", obj_id, exc)
