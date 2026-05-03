"""
Configuration des fixtures pytest pour be.CLEAR.

On utilise SQLite en mémoire (aiosqlite) pour les tests.
Les types PostgreSQL-spécifiques (JSONB, UUID, TSVECTOR, indexes GIN)
sont neutralisés par des overrides de dialecte déclarés ici.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import event, text
from sqlalchemy.dialects import sqlite as sqlite_dialect

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
JSONB.__init_subclass__ = lambda cls, **kw: None  # no-op guard
import sqlalchemy.dialects.postgresql as _pg
_pg.JSONB = _JsonbAsSqliteText
_pg.UUID = _UuidAsSqliteText

# TSVECTOR — on le remplace par Text (pas utilisé en test)
import sqlalchemy
sqlalchemy.dialects.postgresql.TSVECTOR = Text

# Re-importer les modèles APRÈS le patch
from app.main import app  # noqa: E402 — dépend des patches ci-dessus
from app.database import get_db, Base  # noqa: E402


TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(TEST_DB_URL, echo=False)

    # Activer les foreign keys SQLite
    @event.listens_for(eng.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with eng.begin() as conn:
        # Créer les tables — on ignore les erreurs sur les index PG-spécifiques
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


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
