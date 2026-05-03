from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    role: Optional[str]
    org_id: Optional[int]
    est_actif: bool
    obj: "ObjBrief"

    model_config = {"from_attributes": True}


class ObjBrief(BaseModel):
    id: int
    uid: str
    nom: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_obj(cls, obj) -> "ObjBrief":
        return cls(id=obj.id, uid=str(obj.uid), nom=obj.nom)


UserMe.model_rebuild()
