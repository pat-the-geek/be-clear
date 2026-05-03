"""
URL Tools — traitements sur les valeurs de type URL :
  GET  /api/url/preview   → métadonnées OG (titre, description, favicon)
  GET  /api/url/check     → vérification de disponibilité
  POST /api/url/index     → scraping + indexation RAG
  POST /api/url/summarize → scraping + résumé LLM (pour description OBJ)
"""
from __future__ import annotations
import logging
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.activity import User

logger = logging.getLogger("beclear.url_tools")
router = APIRouter()

# ─── Helpers ─────────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; beCLEAR/1.0; +https://beclear.app)"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "fr,en;q=0.5",
}
TIMEOUT = 10.0


def _absolute(url: str, base: str) -> str:
    """Rend une URL relative absolue."""
    if url.startswith("//"):
        scheme = urlparse(base).scheme or "https"
        return f"{scheme}:{url}"
    if url.startswith("http"):
        return url
    return urljoin(base, url)


def _extract_meta(soup: BeautifulSoup, base_url: str) -> dict:
    """Extrait les métadonnées Open Graph + fallback standards."""
    def og(prop: str) -> str | None:
        tag = soup.find("meta", property=f"og:{prop}") or soup.find("meta", attrs={"name": f"og:{prop}"})
        return tag.get("content") if tag else None

    def meta(name: str) -> str | None:
        tag = soup.find("meta", attrs={"name": name})
        return tag.get("content") if tag else None

    title = (
        og("title")
        or (soup.title.string.strip() if soup.title else None)
        or meta("title")
    )
    description = og("description") or meta("description") or meta("twitter:description")
    site_name = og("site_name")
    image = og("image")
    if image:
        image = _absolute(image, base_url)

    # Favicon
    favicon_tag = (
        soup.find("link", rel=lambda r: r and "icon" in " ".join(r).lower())
    )
    favicon = None
    if favicon_tag and favicon_tag.get("href"):
        favicon = _absolute(favicon_tag["href"], base_url)
    else:
        parsed = urlparse(base_url)
        favicon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"

    return {
        "title": title,
        "description": description,
        "site_name": site_name,
        "image": image,
        "favicon": favicon,
    }


# ─── Schémas ─────────────────────────────────────────────────────────────────

class UrlCheckOut(BaseModel):
    url: str
    reachable: bool
    status_code: int | None = None
    error: str | None = None


class UrlPreviewOut(BaseModel):
    url: str
    reachable: bool
    status_code: int | None = None
    title: str | None = None
    description: str | None = None
    site_name: str | None = None
    image: str | None = None
    favicon: str | None = None
    error: str | None = None


class UrlIndexOut(BaseModel):
    url: str
    success: bool
    chars_indexed: int = 0
    message: str


class UrlSummarizeOut(BaseModel):
    url: str
    success: bool
    summary: str | None = None
    title: str | None = None
    error: str | None = None


# ─── GET /check ──────────────────────────────────────────────────────────────

@router.get("/check", response_model=UrlCheckOut)
async def check_url(
    url: str = Query(..., description="URL à vérifier"),
    _: User = Depends(get_current_user),
):
    """Vérifie si une URL est accessible (HEAD request)."""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=TIMEOUT, headers=HEADERS
        ) as client:
            resp = await client.head(url)
            return UrlCheckOut(url=url, reachable=resp.status_code < 400, status_code=resp.status_code)
    except httpx.TimeoutException:
        return UrlCheckOut(url=url, reachable=False, error="Délai d'attente dépassé")
    except Exception as exc:
        return UrlCheckOut(url=url, reachable=False, error=str(exc)[:200])


# ─── GET /preview ─────────────────────────────────────────────────────────────

@router.get("/preview", response_model=UrlPreviewOut)
async def preview_url(
    url: str = Query(..., description="URL à prévisualiser"),
    _: User = Depends(get_current_user),
):
    """Extrait les métadonnées Open Graph d'une URL (titre, description, image, favicon)."""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=TIMEOUT, headers=HEADERS
        ) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return UrlPreviewOut(url=url, reachable=False, status_code=resp.status_code,
                                     error=f"HTTP {resp.status_code}")

            content_type = resp.headers.get("content-type", "")
            if "html" not in content_type:
                return UrlPreviewOut(url=url, reachable=True, status_code=resp.status_code,
                                     error="Pas une page HTML")

            soup = BeautifulSoup(resp.text, "lxml")
            meta = _extract_meta(soup, str(resp.url))
            return UrlPreviewOut(url=url, reachable=True, status_code=resp.status_code, **meta)

    except httpx.TimeoutException:
        return UrlPreviewOut(url=url, reachable=False, error="Délai d'attente dépassé")
    except Exception as exc:
        logger.warning("preview_url error for %s: %s", url, exc)
        return UrlPreviewOut(url=url, reachable=False, error=str(exc)[:200])


# ─── POST /index ──────────────────────────────────────────────────────────────

@router.post("/index", response_model=UrlIndexOut)
async def index_url(
    url: str = Query(..., description="URL à indexer pour le RAG"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Scrape une page web, extrait le texte principal et crée un embedding
    dans la table embedding (rattaché à un OBJ virtuel ou mis à jour si déjà indexé).
    """
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=TIMEOUT, headers=HEADERS
        ) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return UrlIndexOut(url=url, success=False,
                                   message=f"Impossible de récupérer la page (HTTP {resp.status_code})")

            soup = BeautifulSoup(resp.text, "lxml")

            # Supprime les éléments non-textuels
            for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
                tag.decompose()

            # Extraction du texte principal
            text = soup.get_text(separator="\n", strip=True)
            # Limite à 8000 caractères pour l'embedding
            text_for_embed = text[:8000]

            if len(text_for_embed) < 50:
                return UrlIndexOut(url=url, success=False, message="Contenu textuel insuffisant")

            # Métadonnées
            meta = _extract_meta(soup, str(resp.url))
            title = meta.get("title") or url

        # Embedding du contenu
        from app.services.embedding_service import embed_text
        from app.models.object import Obj, Embedding, Cla
        from sqlalchemy import select, text as sa_text
        from datetime import datetime, timezone

        embed_input = f"{title}\n\n{text_for_embed}"
        vector = await embed_text(embed_input)
        if not vector:
            return UrlIndexOut(url=url, success=False, message="Impossible de calculer l'embedding (Ollama inaccessible ?)")

        vec_str = "[" + ",".join(f"{v:.8f}" for v in vector) + "]"
        now = datetime.now(timezone.utc)

        # Cherche si un OBJ existe déjà pour cette URL (description commence par l'URL)
        existing_obj = await db.execute(
            sa_text("SELECT o.id FROM obj o JOIN embedding e ON e.obj_id = o.id WHERE o.description LIKE :prefix LIMIT 1"),
            {"prefix": f"[URL] {url}%"},
        )
        existing_row = existing_obj.fetchone()

        if existing_row:
            # Met à jour l'embedding existant
            await db.execute(
                sa_text("UPDATE embedding SET vecteur = CAST(:vec AS vector), updated_at = :now WHERE obj_id = :oid"),
                {"vec": vec_str, "now": now, "oid": existing_row[0]},
            )
            await db.commit()
            return UrlIndexOut(url=url, success=True, chars_indexed=len(text_for_embed),
                               message=f"Embedding mis à jour ({len(text_for_embed)} caractères indexés)")
        else:
            # Crée un OBJ minimal pour porter l'embedding
            cla_result = await db.execute(select(Cla).limit(1))
            cla = cla_result.scalar_one_or_none()
            if not cla:
                return UrlIndexOut(url=url, success=False, message="Aucune classe disponible pour créer l'objet")

            description = f"[URL] {url}\n\n{text[:1000]}"
            obj = Obj(nom=title[:500], description=description, cla_id=cla.id)
            db.add(obj)
            await db.flush()

            embed = Embedding(obj_id=obj.id, created_at=now, updated_at=now)
            db.add(embed)
            await db.flush()

            await db.execute(
                sa_text("UPDATE embedding SET vecteur = CAST(:vec AS vector) WHERE id = :eid"),
                {"vec": vec_str, "eid": embed.id},
            )
            await db.commit()

            return UrlIndexOut(url=url, success=True, chars_indexed=len(text_for_embed),
                               message=f"Page indexée ({len(text_for_embed)} caractères — \"{title[:60]}\")")

    except Exception as exc:
        logger.error("index_url error for %s: %s", url, exc)
        return UrlIndexOut(url=url, success=False, message=f"Erreur : {str(exc)[:200]}")


# ─── POST /summarize ──────────────────────────────────────────────────────────

SUMMARIZE_PROMPT = """Tu es un assistant expert en synthèse d'information.
On te fournit le contenu textuel d'une page web.
Génère une description concise (3 à 6 phrases en français) résumant les points essentiels de cette page :
qui/quoi, objectifs principaux, points clés, et ce que l'utilisateur peut y trouver.
Style : factuel, clair, sans formule d'introduction comme "Cette page...".
Réponds uniquement avec la description, sans titre ni balise."""


@router.post("/summarize", response_model=UrlSummarizeOut)
async def summarize_url(
    url: str = Query(..., description="URL de la page à résumer"),
    llm_id: int | None = Query(None, description="ID du LLM à utiliser (optionnel)"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Scrape une page web et génère un résumé via le LLM pour alimenter la description d'un OBJ."""
    try:
        # ── 1. Scraping ──────────────────────────────────────
        async with httpx.AsyncClient(follow_redirects=True, timeout=TIMEOUT, headers=HEADERS) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return UrlSummarizeOut(url=url, success=False, error=f"HTTP {resp.status_code}")
            if "html" not in resp.headers.get("content-type", ""):
                return UrlSummarizeOut(url=url, success=False, error="Pas une page HTML")

            soup = BeautifulSoup(resp.text, "lxml")

        # Extraction texte
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        meta = _extract_meta(soup, str(resp.url))
        title = meta.get("title") or url

        if len(text.strip()) < 50:
            return UrlSummarizeOut(url=url, success=False, error="Contenu textuel insuffisant")

        # Limite le texte envoyé au LLM
        text_truncated = text[:6000]

        # ── 2. Sélection du LLM ──────────────────────────────
        from app.services.rag_service import list_available_llms, _generate
        available_llms = await list_available_llms(db)
        if not available_llms:
            return UrlSummarizeOut(url=url, success=False, error="Aucun LLM configuré")

        selected_llm = None
        if llm_id is not None:
            selected_llm = next((l for l in available_llms if l.get("id") == llm_id), None)
        if selected_llm is None:
            # Priorité : distant d'abord pour la qualité du résumé, sinon local
            selected_llm = next((l for l in available_llms if l["type"] == "distant"), available_llms[0])

        # ── 3. Génération du résumé ───────────────────────────
        context = f"Titre : {title}\n\nContenu de la page :\n{text_truncated}"
        question = "Génère une description concise de cette page en français."

        # On remplace temporairement le system prompt
        from app.services import rag_service
        original_prompt = rag_service.SYSTEM_PROMPT
        rag_service.SYSTEM_PROMPT = SUMMARIZE_PROMPT
        try:
            summary = await _generate(question, context, selected_llm)
        finally:
            rag_service.SYSTEM_PROMPT = original_prompt

        # Nettoie les éventuelles lignes SOURCES_USED
        clean_lines = [l for l in summary.splitlines() if not l.strip().startswith("SOURCES_USED:")]
        summary = "\n".join(clean_lines).strip()

        return UrlSummarizeOut(url=url, success=True, summary=summary, title=title)

    except Exception as exc:
        logger.error("summarize_url error for %s: %s", url, exc)
        return UrlSummarizeOut(url=url, success=False, error=str(exc)[:200])
