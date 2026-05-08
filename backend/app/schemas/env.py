from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.schemas.org import ClaRef, ImgBrief, ObjOut, ValueIn, ValueOut


# ─── Sous-schémas imbriqués ──────────────────

class TenvRef(BaseModel):
    id: int
    nom: str
    chemin: Optional[str] = None
    cla: ClaRef
    model_config = {"from_attributes": True}


# ─── ENV ─────────────────────────────────────

class TenvHistoryEntry(BaseModel):
    id: int
    tenv_id: int
    tenv_nom: Optional[str] = None
    date_debut: datetime
    date_fin: Optional[datetime] = None
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_nom(cls, h) -> "TenvHistoryEntry":
        return cls(
            id=h.id,
            tenv_id=h.tenv_id,
            tenv_nom=h.tenv.nom if h.tenv else None,
            date_debut=h.date_debut,
            date_fin=h.date_fin,
        )


class EnvOut(BaseModel):
    id: int
    obj: ObjOut
    tenv: TenvRef
    tenv_history: list[TenvHistoryEntry] = []
    model_config = {"from_attributes": True}


class EnvBrief(BaseModel):
    """Vue allégée pour les listes."""
    id: int
    nom: str
    tenv: TenvRef
    image_principale: Optional[ImgBrief] = None
    updated_at: Optional[datetime] = None
    values: list[ValueOut] = []
    model_config = {"from_attributes": True}


class EnvCreate(BaseModel):
    tenv_id: int
    nom: str
    description: Optional[str] = None
    cla_id: int
    values: list[ValueIn] = []


class EnvUpdate(BaseModel):
    tenv_id: Optional[int] = None
    nom: Optional[str] = None
    description: Optional[str] = None
    values: list[ValueIn] = []


EnvCreate.model_rebuild()
EnvUpdate.model_rebuild()
