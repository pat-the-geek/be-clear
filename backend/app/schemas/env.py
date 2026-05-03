from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.schemas.org import ClaRef, ImgBrief, ObjOut, ValueIn


# ─── Sous-schémas imbriqués ──────────────────

class TenvRef(BaseModel):
    id: int
    nom: str
    chemin: Optional[str] = None
    cla: ClaRef
    model_config = {"from_attributes": True}


# ─── ENV ─────────────────────────────────────

class EnvOut(BaseModel):
    id: int
    obj: ObjOut
    tenv: TenvRef
    model_config = {"from_attributes": True}


class EnvBrief(BaseModel):
    """Vue allégée pour les listes."""
    id: int
    nom: str
    tenv: TenvRef
    image_principale: Optional[ImgBrief] = None
    updated_at: Optional[datetime] = None
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
