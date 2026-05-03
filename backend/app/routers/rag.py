"""Router RAG — Terminal IA."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.activity import User
from app.services import rag_service

router = APIRouter()


# ─── Schémas ─────────────────────────────────────────────

class RagQueryIn(BaseModel):
    question: str
    llm_id: int | None = None


class RagSource(BaseModel):
    obj_id: int
    nom: str
    entity_type: str
    model_config = {"from_attributes": True}


class RagQueryOut(BaseModel):
    answer: str
    sources: list[RagSource] = []


# ─── GET /rag/llms ────────────────────────────────────────

@router.get("/llms")
async def list_llms(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Retourne la liste des LLM disponibles (distants actifs + local Ollama)."""
    llms = await rag_service.list_available_llms(db)
    return {"llms": llms}


# ─── POST /rag/query ──────────────────────────────────────

@router.post("/query")
async def rag_query(
    body: RagQueryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exécute une requête RAG en langage naturel sur les données structurées.
    RF-19 : le contexte RAG respecte les droits du USER courant.
    """
    result = await rag_service.rag_query(
        db=db,
        question=body.question,
        user_id=current_user.id,
        llm_id=body.llm_id,
    )
    return result
