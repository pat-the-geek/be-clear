"""Router CONFIG — configuration globale, LLM distants, tokens API."""
import hashlib
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import User
from app.models.system import Config, LlmConfig, ApiToken
from app.services.log import write_log

router = APIRouter()


# ─── Schémas ─────────────────────────────────────────────

class ConfigOut(BaseModel):
    id: int
    obsidian_vault_path: str | None = None
    ollama_url: str | None = None
    ollama_modele: str | None = None
    model_config = {"from_attributes": True}


class ConfigUpdate(BaseModel):
    obsidian_vault_path: str | None = None
    ollama_url: str | None = None
    ollama_modele: str | None = None


class LlmConfigOut(BaseModel):
    id: int
    nom: str
    fournisseur: str
    modele: str
    est_actif: bool
    parametres: dict | None = None
    model_config = {"from_attributes": True}


class LlmConfigCreate(BaseModel):
    nom: str
    fournisseur: str
    modele: str
    api_key: str
    api_url: str | None = None          # URL custom (Azure, proxy, etc.) — stockée dans parametres
    parametres: dict | None = None


class LlmConfigUpdate(BaseModel):
    nom: str | None = None
    fournisseur: str | None = None
    modele: str | None = None
    api_key: str | None = None
    api_url: str | None = None          # URL custom — stockée dans parametres
    est_actif: bool | None = None
    parametres: dict | None = None


class ApiTokenOut(BaseModel):
    id: int
    nom: str | None = None
    expire_at: str | None = None
    est_actif: bool
    derniere_utilisation: str | None = None
    model_config = {"from_attributes": True}


class ApiTokenCreate(BaseModel):
    nom: str | None = None
    expire_at: datetime | None = None


class ApiTokenCreated(ApiTokenOut):
    """Retourné uniquement lors de la création — contient le token en clair."""
    token: str


# ─── Helpers ─────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _get_or_create_config(db: AsyncSession) -> Config:
    """Récupère ou crée le singleton CONFIG (id=1)."""
    config = await db.get(Config, 1)
    if config is None:
        config = Config(id=1)
        db.add(config)
        await db.flush()
    return config


# ─── GET /config ──────────────────────────────────────────

@router.get("")
async def get_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    config = await _get_or_create_config(db)
    result = await db.execute(select(LlmConfig))
    llms = result.scalars().all()
    await db.commit()  # commit si config vient d'être créée

    return {
        "config": ConfigOut.model_validate(config),
        "llms": [LlmConfigOut.model_validate(l) for l in llms],
    }


# ─── PUT /config ──────────────────────────────────────────

@router.put("")
async def update_config(
    body: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    config = await _get_or_create_config(db)

    avant = {
        "obsidian_vault_path": config.obsidian_vault_path,
        "ollama_url": config.ollama_url,
        "ollama_modele": config.ollama_modele,
    }

    if body.obsidian_vault_path is not None:
        config.obsidian_vault_path = body.obsidian_vault_path
    if body.ollama_url is not None:
        config.ollama_url = body.ollama_url
    if body.ollama_modele is not None:
        config.ollama_modele = body.ollama_modele

    config.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="config", entite_id=1, avant=avant,
                    apres={
                        "obsidian_vault_path": config.obsidian_vault_path,
                        "ollama_url": config.ollama_url,
                        "ollama_modele": config.ollama_modele,
                    })
    await db.commit()
    await db.refresh(config)
    return ConfigOut.model_validate(config)


# ─── GET /config/llm ──────────────────────────────────────

@router.get("/llm")
async def list_llms(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(LlmConfig))
    llms = result.scalars().all()
    return [LlmConfigOut.model_validate(l) for l in llms]


# ─── POST /config/llm ─────────────────────────────────────

@router.post("/llm", status_code=status.HTTP_201_CREATED)
async def create_llm(
    body: LlmConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Fusionne api_url dans parametres (JSONB)
    params = dict(body.parametres or {})
    if body.api_url:
        params["api_url"] = body.api_url

    llm = LlmConfig(
        nom=body.nom,
        fournisseur=body.fournisseur,
        modele=body.modele,
        api_key_chiffree=body.api_key,  # TODO : chiffrer au repos
        est_actif=True,
        parametres=params or None,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(llm)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="llm_config", entite_id=llm.id,
                    apres={"nom": body.nom, "fournisseur": body.fournisseur,
                           "modele": body.modele})
    await db.commit()
    await db.refresh(llm)
    return LlmConfigOut.model_validate(llm)


# ─── PUT /config/llm/{id} ─────────────────────────────────

@router.put("/llm/{llm_id}")
async def update_llm(
    llm_id: int,
    body: LlmConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    llm = await db.get(LlmConfig, llm_id)
    if llm is None:
        raise HTTPException(status_code=404, detail="LLM introuvable")

    avant = {"nom": llm.nom, "fournisseur": llm.fournisseur, "modele": llm.modele,
             "est_actif": llm.est_actif}

    if body.nom is not None:
        llm.nom = body.nom
    if body.fournisseur is not None:
        llm.fournisseur = body.fournisseur
    if body.modele is not None:
        llm.modele = body.modele
    if body.api_key is not None:
        llm.api_key_chiffree = body.api_key  # TODO : chiffrer au repos
    if body.est_actif is not None:
        llm.est_actif = body.est_actif
    # Fusionne api_url dans parametres si fournie
    if body.api_url is not None or body.parametres is not None:
        params = dict(llm.parametres or {})
        if body.parametres is not None:
            params.update(body.parametres)
        if body.api_url is not None:
            params["api_url"] = body.api_url
        llm.parametres = params or None

    llm.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="llm_config", entite_id=llm_id, avant=avant,
                    apres={"nom": llm.nom, "fournisseur": llm.fournisseur,
                           "modele": llm.modele, "est_actif": llm.est_actif})
    await db.commit()
    await db.refresh(llm)
    return LlmConfigOut.model_validate(llm)


# ─── DELETE /config/llm/{id} ──────────────────────────────

@router.delete("/llm/{llm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_llm(
    llm_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    llm = await db.get(LlmConfig, llm_id)
    if llm is None:
        raise HTTPException(status_code=404, detail="LLM introuvable")

    await write_log(db, user_id=current_user.id, operation="DELETE",
                    table_name="llm_config", entite_id=llm_id,
                    avant={"nom": llm.nom})
    await db.delete(llm)
    await db.commit()


# ─── GET /config/token ────────────────────────────────────

@router.get("/token")
async def list_tokens(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste les tokens API du USER courant."""
    result = await db.execute(
        select(ApiToken).where(ApiToken.user_id == current_user.id)
    )
    tokens = result.scalars().all()
    return [ApiTokenOut.model_validate(t) for t in tokens]


# ─── POST /config/token ───────────────────────────────────

@router.post("/token", status_code=status.HTTP_201_CREATED)
async def create_token(
    body: ApiTokenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApiTokenCreated:
    """
    Génère un nouveau token API.
    Le token en clair est retourné UNE SEULE FOIS — seul son hash est stocké.
    """
    plain_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(plain_token)

    token = ApiToken(
        user_id=current_user.id,
        token_hash=token_hash,
        nom=body.nom,
        expire_at=body.expire_at,
        est_actif=True,
    )
    db.add(token)
    await db.flush()

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="api_token", entite_id=token.id,
                    apres={"nom": body.nom, "user_id": current_user.id})
    await db.commit()
    await db.refresh(token)

    return ApiTokenCreated(
        id=token.id,
        nom=token.nom,
        expire_at=token.expire_at.isoformat() if token.expire_at else None,
        est_actif=token.est_actif,
        derniere_utilisation=None,
        token=plain_token,  # retourné en clair UNE SEULE FOIS
    )


# ─── DELETE /config/token/{id} ────────────────────────────

@router.delete("/token/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Révoque un token (met est_actif=False). Seul le propriétaire peut révoquer."""
    token = await db.get(ApiToken, token_id)
    if token is None or token.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Token introuvable")

    token.est_actif = False

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="api_token", entite_id=token_id,
                    avant={"est_actif": True},
                    apres={"est_actif": False})
    await db.commit()
