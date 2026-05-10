"""Session SQLAlchemy autonome pour le serveur MCP (hors contexte FastAPI)."""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.config import settings

_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    # Évite les blocages silencieux si Postgres est inaccessible
    pool_timeout=10,
    connect_args={
        "timeout": 10,          # timeout de connexion TCP (asyncpg)
        "command_timeout": 25,  # timeout par requête SQL
    },
)
AsyncSession = async_sessionmaker(_engine, expire_on_commit=False)
