"""Service de journalisation — trace toutes les opérations dans la table log."""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.system import Log


async def write_log(
    db: AsyncSession,
    *,
    user_id: int | None,
    operation: str,          # INSERT | UPDATE | DELETE
    table_name: str,
    entite_id: int | None = None,
    avant: dict | None = None,
    apres: dict | None = None,
) -> None:
    entry = Log(
        horodatage=datetime.now(timezone.utc),
        user_id=user_id,
        operation=operation,
        table_name=table_name,
        entite_id=entite_id,
        avant=avant,
        apres=apres,
    )
    db.add(entry)
    # flush sans commit — le commit est géré par le router
    await db.flush()
