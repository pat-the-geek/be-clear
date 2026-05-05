"""Service Meilisearch — indexation et recherche full-text des OBJ."""
from meilisearch_python_sdk import AsyncClient

from app.config import settings


async def get_client() -> AsyncClient:
    """Retourne un client Meilisearch configuré."""
    return AsyncClient(url=settings.MEILISEARCH_URL, api_key=settings.MEILISEARCH_KEY or None)


async def index_obj(
    obj_id: int,
    entity_id: int,
    nom: str,
    description: str | None,
    values_text: list[str],
    entity_type: str,
    cla_nom: str,
    image_chemin: str | None = None,
) -> None:
    """Indexe ou met à jour un OBJ dans Meilisearch. Index = 'objets'."""
    async with await get_client() as client:
        index = client.index("objets")
        document = {
            "id": obj_id,
            "entity_id": entity_id,
            "nom": nom,
            "description": description or "",
            "values_text": " ".join(values_text),
            "entity_type": entity_type,
            "cla_nom": cla_nom,
            "image_chemin": image_chemin or "",
        }
        await index.add_documents([document])


async def delete_obj(obj_id: int) -> None:
    """Supprime un OBJ de l'index Meilisearch."""
    async with await get_client() as client:
        index = client.index("objets")
        await index.delete_document(obj_id)


async def search_objs(q: str) -> list[dict]:
    """Recherche full-text. Retourne les hits avec attributs mis en évidence."""
    async with await get_client() as client:
        index = client.index("objets")
        results = await index.search(
            q,
            attributes_to_highlight=["nom", "description"],
            highlight_pre_tag="<em>",
            highlight_post_tag="</em>",
        )
        return results.hits
