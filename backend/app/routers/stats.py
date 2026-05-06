"""Router STATS — métriques globales du système."""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import Org, Env, Eng, Event, User
from app.models.object import Obj

router = APIRouter()


@router.get("")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Retourne les métriques globales du système."""
    now = datetime.now(timezone.utc)

    # Comptages de base
    nb_orgs   = (await db.execute(select(func.count()).select_from(Org))).scalar_one()
    nb_envs   = (await db.execute(select(func.count()).select_from(Env))).scalar_one()
    nb_engs   = (await db.execute(select(func.count()).select_from(Eng))).scalar_one()
    nb_events = (await db.execute(select(func.count()).select_from(Event))).scalar_one()
    nb_users  = (await db.execute(select(func.count()).select_from(User))).scalar_one()

    # EVENTs en retard (non accomplis + date_heure_prevue < now)
    nb_events_retard = (await db.execute(
        select(func.count()).select_from(Event)
        .where(Event.date_heure_reelle.is_(None))
        .where(Event.date_heure_prevue < now)
    )).scalar_one()

    # EVENTs accomplis
    nb_events_accomplis = (await db.execute(
        select(func.count()).select_from(Event)
        .where(Event.date_heure_reelle.isnot(None))
    )).scalar_one()

    # ENGs par statut (terminés ≥100%, en cours 1-99%, non démarrés 0%)
    engs_result = await db.execute(
        select(Eng.accomplissement)
    )
    engs_accomp = [row[0] or 0.0 for row in engs_result.all()]
    nb_engs_termines    = sum(1 for a in engs_accomp if a >= 100)
    nb_engs_en_cours    = sum(1 for a in engs_accomp if 0 < a < 100)
    nb_engs_non_demarres = sum(1 for a in engs_accomp if a == 0)

    # Activité récente — nb d'OBJ modifiés dans les 7 derniers jours
    since_7d = now - timedelta(days=7)
    nb_recents = (await db.execute(
        select(func.count()).select_from(Obj)
        .where(Obj.updated_at >= since_7d)
    )).scalar_one()

    return {
        "nb_orgs": nb_orgs,
        "nb_envs": nb_envs,
        "nb_engs": nb_engs,
        "nb_events": nb_events,
        "nb_users": nb_users,
        "nb_events_retard": nb_events_retard,
        "nb_events_accomplis": nb_events_accomplis,
        "nb_engs_termines": nb_engs_termines,
        "nb_engs_en_cours": nb_engs_en_cours,
        "nb_engs_non_demarres": nb_engs_non_demarres,
        "nb_recents_7j": nb_recents,
    }
