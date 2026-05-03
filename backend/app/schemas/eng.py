from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

from app.schemas.org import ClaRef, ObjOut, ValueIn


# ─── Sous-schémas imbriqués ──────────────────

class TengRef(BaseModel):
    id: int
    nom: str
    cla: ClaRef
    model_config = {"from_attributes": True}


class OrgRef(BaseModel):
    """Référence légère à une ORG."""
    id: int
    nom: str
    model_config = {"from_attributes": True}


class EnvRef(BaseModel):
    """Référence légère à un ENV."""
    id: int
    nom: str
    model_config = {"from_attributes": True}


class EventBrief(BaseModel):
    id: int
    date_heure_prevue: str
    date_heure_reelle: Optional[str] = None
    tevent_nom: str
    obj_nom: str
    est_accompli: bool
    model_config = {"from_attributes": True}


# ─── ENG ─────────────────────────────────────

class EngOut(BaseModel):
    id: int
    obj: ObjOut
    teng: TengRef
    orgs: list[OrgRef] = []
    envs: list[EnvRef] = []
    events: list[EventBrief] = []
    date_debut: Optional[str] = None
    date_debut_prevue: Optional[str] = None
    date_fin: Optional[str] = None
    date_fin_prevue: Optional[str] = None
    accomplissement: Optional[float] = None
    gantt_mermaid: Optional[str] = None
    model_config = {"from_attributes": True}


class EngBrief(BaseModel):
    """Vue allégée pour les listes."""
    id: int
    nom: str
    teng: TengRef
    accomplissement: Optional[float] = None
    nb_events: int = 0
    date_debut: Optional[str] = None
    date_debut_prevue: Optional[str] = None
    date_fin: Optional[str] = None
    date_fin_prevue: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by_nom: Optional[str] = None
    updated_by_nom: Optional[str] = None
    model_config = {"from_attributes": True}


class EngCreate(BaseModel):
    teng_id: int
    nom: str
    description: Optional[str] = None
    cla_id: int
    org_ids: list[int] = []
    env_ids: list[int] = []
    date_debut: Optional[str] = None
    date_debut_prevue: Optional[str] = None
    date_fin: Optional[str] = None
    date_fin_prevue: Optional[str] = None
    values: list[ValueIn] = []


class EngUpdate(BaseModel):
    teng_id: Optional[int] = None
    nom: Optional[str] = None
    description: Optional[str] = None
    org_ids: Optional[list[int]] = None
    env_ids: Optional[list[int]] = None
    date_debut: Optional[str] = None
    date_debut_prevue: Optional[str] = None
    date_fin: Optional[str] = None
    values: list[ValueIn] = []


EngCreate.model_rebuild()
EngUpdate.model_rebuild()
