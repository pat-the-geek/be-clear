from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

from app.schemas.org import ObjOut, ValueIn


# ─── Sous-schémas imbriqués ──────────────────

class TeventRef(BaseModel):
    id: int
    nom: str
    duree_prevue_valeur: Optional[float] = None
    duree_prevue_unite: Optional[str] = None
    model_config = {"from_attributes": True}


# ─── EVENT ───────────────────────────────────

class EventOut(BaseModel):
    id: int
    obj: ObjOut
    eng_id: int
    eng_nom: Optional[str] = None
    tevent: TeventRef
    date_heure_prevue: str
    date_heure_reelle: Optional[str] = None
    est_accompli: bool
    model_config = {"from_attributes": True}


class UpcomingEventOut(BaseModel):
    """Vue allégée pour le panel — prochains EVENTs non accomplis."""
    id: int
    nom: str
    eng_id: int
    eng_nom: str
    tevent_nom: str
    date_heure_prevue: str
    model_config = {"from_attributes": True}


class EventCreate(BaseModel):
    eng_id: int
    tevent_id: int
    nom: str
    description: Optional[str] = None
    cla_id: int
    date_heure_prevue: str
    values: list[ValueIn] = []


class EventUpdate(BaseModel):
    tevent_id: Optional[int] = None
    nom: Optional[str] = None
    description: Optional[str] = None
    date_heure_prevue: Optional[str] = None
    date_heure_reelle: Optional[str] = None
    values: list[ValueIn] = []


EventCreate.model_rebuild()
EventUpdate.model_rebuild()
