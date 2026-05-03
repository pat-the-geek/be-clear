"""Router RPT — génération de rapports Markdown pour ORG et ENV."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Literal

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.activity import User
from app.services.rpt_service import generate_org_report, generate_env_report, save_report
from app.services.log import write_log

router = APIRouter()


class RptRequest(BaseModel):
    destination: Literal["filesystem", "obsidian"] = "filesystem"


class RptResponse(BaseModel):
    chemin: str
    nom_fichier: str


@router.post("/org/{org_id}", response_model=RptResponse)
async def rpt_org(
    org_id: int,
    body: RptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Génère et sauvegarde le rapport Markdown d'une ORG."""
    try:
        content = await generate_org_report(db, org_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Récupérer le nom pour le fichier
    from app.models.activity import Org
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from app.models.object import Obj
    org_result = await db.execute(
        select(Org).options(joinedload(Org.obj)).where(Org.id == org_id)
    )
    org = org_result.unique().scalar_one_or_none()
    nom = org.obj.nom if org and org.obj else f"org-{org_id}"

    chemin = save_report(content, "org", nom, body.destination)

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="rpt", entite_id=org_id,
                    apres={"type": "org", "destination": body.destination, "chemin": chemin})
    await db.commit()

    return RptResponse(chemin=chemin, nom_fichier=chemin.split("/")[-1])


@router.post("/env/{env_id}", response_model=RptResponse)
async def rpt_env(
    env_id: int,
    body: RptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Génère et sauvegarde le rapport Markdown d'un ENV."""
    try:
        content = await generate_env_report(db, env_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    from app.models.activity import Env
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from app.models.object import Obj
    env_result = await db.execute(
        select(Env).options(joinedload(Env.obj)).where(Env.id == env_id)
    )
    env = env_result.unique().scalar_one_or_none()
    nom = env.obj.nom if env and env.obj else f"env-{env_id}"

    chemin = save_report(content, "env", nom, body.destination)

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="rpt", entite_id=env_id,
                    apres={"type": "env", "destination": body.destination, "chemin": chemin})
    await db.commit()

    return RptResponse(chemin=chemin, nom_fichier=chemin.split("/")[-1])
