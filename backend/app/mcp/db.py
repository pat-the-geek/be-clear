"""Session SQLAlchemy autonome pour le serveur MCP (hors contexte FastAPI)."""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.config import settings

_engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
AsyncSession = async_sessionmaker(_engine, expire_on_commit=False)
