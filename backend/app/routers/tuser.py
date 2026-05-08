from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.activity import Tuser, User

router = APIRouter()


@router.get("")
async def list_tusers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Tuser).order_by(Tuser.valeur))
    return [{"id": t.id, "valeur": t.valeur} for t in result.scalars().all()]
