from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Optional


# ─── Sous-schémas imbriqués ──────────────────

class UserBrief(BaseModel):
    """Référence légère d'un utilisateur (créateur / modificateur)."""
    id: int
    nom: str   # extrait de user.obj.nom via la @property User.nom
    model_config = {"from_attributes": True}


class PropRef(BaseModel):
    id: int
    nom: str
    type: str
    valeurs_liste: Optional[list] = None
    model_config = {"from_attributes": True}


class ClaRef(BaseModel):
    """Référence légère (sans props) — utilisée dans TorgRef, TenvRef, EngBrief, etc."""
    id: int
    nom: str
    visuel_type: Optional[str] = None
    visuel_valeur: Optional[str] = None
    model_config = {"from_attributes": True}


class ClaWithProps(ClaRef):
    """ClaRef enrichi des props directes — utilisé uniquement dans ObjOut."""
    props: list[PropRef] = []


class TorgRef(BaseModel):
    id: int
    nom: str
    chemin: Optional[str] = None
    cla: ClaRef
    model_config = {"from_attributes": True}


class ImgBrief(BaseModel):
    id: int
    chemin: str
    est_principale: bool
    model_config = {"from_attributes": True}


class ValueOut(BaseModel):
    id: int
    prop: PropRef
    valeur_texte: Optional[str] = None
    valeur_date: Optional[datetime] = None   # datetime stocké en DB, sérialisé en ISO string
    valeur_nombre: Optional[float] = None
    valeur_bool: Optional[bool] = None
    valeur_json: Optional[dict] = None
    valeur_ref_obj_id: Optional[int] = None
    model_config = {"from_attributes": True}


class DocBrief(BaseModel):
    id: int
    chemin: str
    nom_original: str
    format: str
    taille_octets: Optional[int] = None
    model_config = {"from_attributes": True}


class ObjOut(BaseModel):
    id: int
    uid: UUID
    nom: str
    description: Optional[str] = None
    cla: ClaWithProps
    values: list[ValueOut] = []
    images: list[ImgBrief] = []
    documents: list[DocBrief] = []
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UserBrief] = None
    updated_by: Optional[UserBrief] = None
    model_config = {"from_attributes": True}


# ─── ORG ────────────────────────────────────

class TorgHistoryEntry(BaseModel):
    id: int
    torg_id: int
    torg_nom: Optional[str] = None
    date_debut: datetime
    date_fin: Optional[datetime] = None
    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_nom(cls, h) -> "TorgHistoryEntry":
        return cls(
            id=h.id,
            torg_id=h.torg_id,
            torg_nom=h.torg.nom if h.torg else None,
            date_debut=h.date_debut,
            date_fin=h.date_fin,
        )


class OrgOut(BaseModel):
    id: int
    obj: ObjOut
    torg: TorgRef
    torg_history: list[TorgHistoryEntry] = []
    model_config = {"from_attributes": True}


class OrgBrief(BaseModel):
    """Vue allégée pour les listes."""
    id: int
    nom: str
    torg: TorgRef
    image_principale: Optional[ImgBrief] = None
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class OrgCreate(BaseModel):
    torg_id: int
    nom: str
    description: Optional[str] = None
    cla_id: int
    values: list["ValueIn"] = []


class OrgUpdate(BaseModel):
    torg_id: Optional[int] = None
    nom: Optional[str] = None
    description: Optional[str] = None
    values: list["ValueIn"] = []


class ValueIn(BaseModel):
    prop_id: int
    valeur_texte: Optional[str] = None
    valeur_date: Optional[str] = None
    valeur_nombre: Optional[float] = None
    valeur_bool: Optional[bool] = None
    valeur_json: Optional[dict] = None
    valeur_ref_obj_id: Optional[int] = None


OrgCreate.model_rebuild()
OrgUpdate.model_rebuild()
