"""
Configuration des fixtures pytest pour be.CLEAR.

On utilise SQLite en mémoire (aiosqlite) pour les tests.
Les types PostgreSQL-spécifiques (JSONB, UUID, TSVECTOR, indexes GIN)
sont neutralisés par des overrides de dialecte déclarés ici.
"""
import os

# ── Env vars TEST — doit être fait AVANT tout import applicatif ──────────────
# On pointe vers une PG URL fictive : le pool ne sera jamais utilisé
# car get_db est surchargé par la fixture client() ci-dessous.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test_beclear")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-32chars!")
os.environ.setdefault("MEILISEARCH_URL", "http://localhost:7700")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("MEDIA_PATH", "/tmp/beclear_test_media")
os.environ.setdefault("ENV", "test")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import event, text
from sqlalchemy.pool import StaticPool

# ── Neutralisation des types PG incompatibles avec SQLite ──────────────────
from sqlalchemy.dialects.postgresql import JSONB, UUID, TSVECTOR
from sqlalchemy import TypeDecorator, Text, String
import uuid as _uuid_mod


class _JsonbAsSqliteText(TypeDecorator):
    """Stocke JSONB comme TEXT en SQLite."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        import json
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        import json
        return json.loads(value)


class _UuidAsSqliteText(TypeDecorator):
    """Stocke UUID comme TEXT en SQLite."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return str(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return _uuid_mod.UUID(value) if value else None


# Monkey-patch : remplace les impls PG par nos types SQLite-compatibles
import sqlalchemy.dialects.postgresql as _pg
_pg.JSONB = _JsonbAsSqliteText
_pg.UUID = _UuidAsSqliteText
_pg.TSVECTOR = Text

# Re-importer les modèles APRÈS le patch
from app.main import app  # noqa: E402 — dépend des patches ci-dessus
from app.database import get_db, Base  # noqa: E402

# L'index partiel postgresql_where="est_principale = true" est ignoré par SQLite
# ce qui crée un UNIQUE sur toute la colonne obj_id et empêche plusieurs images par OBJ.
# On supprime cet index du schéma de test — l'invariant est enforced en application.
from app.models.object import Img as _Img  # noqa: E402
_img_partial_idx = next(
    (i for i in list(_Img.__table__.indexes) if i.name == "uq_img_principale"), None
)
if _img_partial_idx is not None:
    _Img.__table__.indexes.discard(_img_partial_idx)


TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def engine():
    """Engine SQLite en mémoire, isolé par test (scope function)."""
    eng = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    @event.listens_for(eng.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()  # in-memory DB disparaît avec l'engine


@pytest_asyncio.fixture
async def db_session(engine):
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
