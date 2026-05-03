"""Router de recherche full-text via Meilisearch."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user
from app.models.activity import User
from app.services import search_service

router = APIRouter()


# ─── GET /search ──────────────────────────────────────────

@router.get("")
async def search(
    q: str = Query(..., min_length=2, description="Texte à rechercher (min 2 caractères)"),
    _: User = Depends(get_current_user),
):
    """
    Recherche full-text sur les OBJ indexés dans Meilisearch.
    Retourne les hits avec les champs nom et description mis en évidence.
    """
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="La requête doit comporter au moins 2 caractères")

    hits = await search_service.search_objs(q)

    # Normaliser les hits pour ne retourner que les champs attendus
    items = []
    for hit in hits:
        items.append({
            "id": hit.get("id"),
            "nom": hit.get("nom"),
            "entity_type": hit.get("entity_type"),
            "cla_nom": hit.get("cla_nom"),
            "_formatted": hit.get("_formatted", {}),
        })

    return {"query": q, "hits": items}
