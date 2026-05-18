"""Router EXPORT — export JSON complet d'une ORG, d'un ENV ou d'un ENG.

Le JSON inclut l'OBJ, ses propriétés/valeurs (en tableau), les ENGs et EVENTs
imbriqués — destiné à des traitements ultérieurs par IA.
"""
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.activity import User
from app.services.export_service import (
    build_eng_export,
    build_env_export,
    build_org_export,
)
from app.services.log import write_log

router = APIRouter()


def _safe_filename(nom: str) -> str:
    return re.sub(r"[^\w\-]", "_", nom or "").strip("_") or "export"


def _json_response(payload: dict, entity_type: str) -> Response:
    nom = (payload.get("objet") or {}).get("nom") or payload.get("nom") or entity_type
    filename = f"export_{entity_type}_{_safe_filename(str(nom))}.json"
    content = json.dumps(payload, ensure_ascii=False, indent=2)
    return Response(
        content=content.encode("utf-8"),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/org/{org_id}")
async def export_org(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export JSON complet d'une ORG (avec ses ENGs et EVENTs)."""
    try:
        payload = await build_org_export(db, org_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="export", entite_id=org_id,
                    apres={"type": "org", "destination": "download"})
    await db.commit()

    return _json_response(payload, "org")


@router.get("/env/{env_id}")
async def export_env(
    env_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export JSON complet d'un ENV (avec ses ENGs et EVENTs)."""
    try:
        payload = await build_env_export(db, env_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="export", entite_id=env_id,
                    apres={"type": "env", "destination": "download"})
    await db.commit()

    return _json_response(payload, "env")


@router.get("/eng/{eng_id}")
async def export_eng(
    eng_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export JSON complet d'un ENG (avec ses EVENTs)."""
    try:
        payload = await build_eng_export(db, eng_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="export", entite_id=eng_id,
                    apres={"type": "eng", "destination": "download"})
    await db.commit()

    return _json_response(payload, "eng")
