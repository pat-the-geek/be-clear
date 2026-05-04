from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.models import *  # noqa: F401,F403 — enregistre tous les modèles


async def _setup_meilisearch() -> None:
    """Configure l'index Meilisearch au démarrage (idempotent)."""
    try:
        from meilisearch_python_sdk import AsyncClient
        async with AsyncClient(
            url=settings.MEILISEARCH_URL,
            api_key=settings.MEILISEARCH_KEY or None,
        ) as client:
            # Crée l'index s'il n'existe pas (idempotent)
            try:
                await client.create_index("objets", primary_key="id")
            except Exception:
                pass  # index déjà créé

            # Configure les attributs de recherche et de filtre
            index = client.index("objets")
            await index.update_searchable_attributes(
                ["nom", "description", "values_text", "cla_nom"]
            )
            await index.update_filterable_attributes(
                ["entity_type", "cla_nom"]
            )
    except Exception as exc:
        # Meilisearch non disponible au démarrage — pas bloquant
        import logging
        logging.getLogger("beclear").warning("Meilisearch indisponible au démarrage : %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Démarrage / arrêt de l'application."""
    await _setup_meilisearch()
    yield
    await engine.dispose()


app = FastAPI(
    title="be.CLEAR API",
    description="API REST du système be.CLEAR — gestion des interactions ORG ↔ ENV",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Routers ───────────────────────────────────────────────
from app.routers import auth, org, env, eng, event, torg, tenv, teng as teng_router, tevent as tevent_router
from app.routers import search, rag, user, cla, config, log as log_router, rpt, url_tools, media

app.include_router(auth.router,           prefix="/api/auth",    tags=["auth"])
app.include_router(org.router,            prefix="/api/org",     tags=["org"])
app.include_router(torg.router,           prefix="/api/torg",    tags=["types"])
app.include_router(tenv.router,           prefix="/api/tenv",    tags=["types"])
app.include_router(teng_router.router,    prefix="/api/teng",    tags=["types"])
app.include_router(tevent_router.router,  prefix="/api/tevent",  tags=["types"])
app.include_router(env.router,          prefix="/api/env",    tags=["env"])
app.include_router(eng.router,          prefix="/api/eng",    tags=["eng"])
app.include_router(event.router,      prefix="/api/event",  tags=["event"])
app.include_router(search.router,     prefix="/api/search", tags=["search"])
app.include_router(rag.router,        prefix="/api/rag",    tags=["rag"])
app.include_router(rpt.router,        prefix="/api/rpt",    tags=["rpt"])
app.include_router(user.router,       prefix="/api/user",   tags=["user"])
app.include_router(cla.router,        prefix="/api/cla",    tags=["admin"])
app.include_router(config.router,     prefix="/api/config", tags=["admin"])
app.include_router(log_router.router, prefix="/api/log",    tags=["admin"])
app.include_router(url_tools.router,  prefix="/api/url",    tags=["url"])
app.include_router(media.router,      prefix="/api/media",  tags=["media"])

# Servir les fichiers uploadés — monté en dernier pour ne pas masquer les routes
from fastapi.staticfiles import StaticFiles
from app.config import settings as _settings
import pathlib as _pathlib
_pathlib.Path(_settings.MEDIA_PATH).mkdir(parents=True, exist_ok=True)
app.mount("/api/media/files", StaticFiles(directory=_settings.MEDIA_PATH), name="media_files")


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "version": app.version}
