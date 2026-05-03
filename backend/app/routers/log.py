"""Router LOG — journal des opérations (ADMIN seulement)."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.dependencies import require_admin
from app.models.activity import User
from app.models.system import Log
from app.models.object import Obj
from app.schemas.common import Paginated

router = APIRouter()


# ─── Schémas ─────────────────────────────────────────────

class LogOut(BaseModel):
    id: int
    horodatage: str
    user_nom: str | None = None
    operation: str
    table_name: str
    entite_id: int | None = None
    avant: dict | None = None
    apres: dict | None = None
    model_config = {"from_attributes": True}


# ─── GET /log ─────────────────────────────────────────────

@router.get("", response_model=Paginated[LogOut])
async def list_logs(
    table_name: str | None = Query(None, description="Filtrer par table"),
    user_id: int | None = Query(None, description="Filtrer par utilisateur"),
    operation: str | None = Query(None, description="INSERT | UPDATE | DELETE"),
    date_from: datetime | None = Query(None, description="Date de début (ISO)"),
    date_to: datetime | None = Query(None, description="Date de fin (ISO)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(Log)

    if table_name is not None:
        q = q.where(Log.table_name == table_name)
    if user_id is not None:
        q = q.where(Log.user_id == user_id)
    if operation is not None:
        q = q.where(Log.operation == operation.upper())
    if date_from is not None:
        q = q.where(Log.horodatage >= date_from)
    if date_to is not None:
        q = q.where(Log.horodatage <= date_to)

    # Compter avant pagination
    count_q = select(func.count()).select_from(q.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar_one()

    # Appliquer tri et pagination
    q = q.order_by(Log.horodatage.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    logs = result.scalars().all()

    # Enrichir avec le nom du USER
    items: list[LogOut] = []
    for log in logs:
        user_nom: str | None = None
        if log.user_id is not None:
            user_result = await db.execute(
                select(User)
                .options(joinedload(User.obj))
                .where(User.id == log.user_id)
            )
            user = user_result.unique().scalar_one_or_none()
            if user is not None and user.obj is not None:
                user_nom = user.obj.nom

        items.append(LogOut(
            id=log.id,
            horodatage=log.horodatage.isoformat(),
            user_nom=user_nom,
            operation=log.operation,
            table_name=log.table_name,
            entite_id=log.entite_id,
            avant=log.avant,
            apres=log.apres,
        ))

    return Paginated(items=items, total=total, page=page, per_page=per_page)
