from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.jwt import create_access_token
from app.auth.dependencies import get_current_user
from app.models.activity import User, Role
from app.models.system import Config
from app.schemas.auth import LoginRequest, TokenResponse, UserMe, ObjBrief

router = APIRouter()


def _verify_password(plain: str, hashed: str | None) -> bool:
    """Vérifie un mot de passe bcrypt. Retourne False si aucun hash stocké."""
    if not hashed:
        return False
    try:
        import bcrypt
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _hash_password(plain: str) -> str:
    import bcrypt
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


# ─── Schémas OIDC ─────────────────────────────────────────────────────────────

class OidcPublicConfig(BaseModel):
    enabled: bool
    allow_local_login: bool


class OidcAuthorizeUrlRequest(BaseModel):
    redirect_uri: str


class OidcAuthorizeUrlResponse(BaseModel):
    url: str
    state: str


class OidcCallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: str


# ─── Auth locale ──────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authentification locale par auth_uid + mot de passe bcrypt."""
    # Vérifier si l'auth locale est autorisée
    config = await db.get(Config, 1)
    if config and config.oidc_enabled and not config.oidc_allow_local_login:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Connexion locale désactivée — utilisez l'authentification OIDC",
        )

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants incorrects",
    )

    result = await db.execute(
        select(User)
        .options(joinedload(User.obj))
        .where(User.auth_uid == body.username, User.est_actif == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None or not _verify_password(body.password, user.password_hash):
        raise credentials_exc

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change le mot de passe de l'utilisateur connecté."""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()

    if not _verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    user.password_hash = _hash_password(body.new_password)
    await db.commit()


@router.get("/me", response_model=UserMe)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retourne l'utilisateur connecté avec son rôle."""
    result = await db.execute(
        select(User)
        .options(joinedload(User.obj), joinedload(User.role))  # type: ignore[arg-type]
        .where(User.id == current_user.id)
    )
    user = result.unique().scalar_one()

    return UserMe(
        id=user.id,
        role=user.role.valeur if user.role else None,
        org_id=user.org_id,
        est_actif=user.est_actif,
        obj=ObjBrief.from_obj(user.obj),
    )


# ─── Auth OIDC ────────────────────────────────────────────────────────────────

@router.get("/oidc/config", response_model=OidcPublicConfig)
async def oidc_public_config(db: AsyncSession = Depends(get_db)):
    """Retourne la configuration OIDC publique (sans secret) — pour le frontend."""
    config = await db.get(Config, 1)
    if config is None:
        return OidcPublicConfig(enabled=False, allow_local_login=True)
    return OidcPublicConfig(
        enabled=bool(config.oidc_enabled),
        allow_local_login=bool(config.oidc_allow_local_login),
    )


@router.post("/oidc/authorize-url", response_model=OidcAuthorizeUrlResponse)
async def oidc_authorize_url(
    body: OidcAuthorizeUrlRequest,
    db: AsyncSession = Depends(get_db),
):
    """Génère l'URL d'autorisation OIDC + un state signé HMAC."""
    config = await db.get(Config, 1)
    if config is None or not config.oidc_enabled:
        raise HTTPException(status_code=400, detail="OIDC non configuré")
    if not config.oidc_issuer_url or not config.oidc_client_id:
        raise HTTPException(status_code=400, detail="Configuration OIDC incomplète")

    from app.config import settings
    from app.services.oidc_service import create_state, build_authorize_url

    state = create_state(settings.SECRET_KEY)
    scopes = config.oidc_scopes or "openid email profile"

    try:
        url = await build_authorize_url(
            issuer_url=config.oidc_issuer_url,
            client_id=config.oidc_client_id,
            redirect_uri=body.redirect_uri,
            scopes=scopes,
            state=state,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de contacter le provider OIDC : {exc}",
        )

    return OidcAuthorizeUrlResponse(url=url, state=state)


@router.post("/oidc/callback", response_model=TokenResponse)
async def oidc_callback(
    body: OidcCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Échange le code d'autorisation OIDC contre un JWT be.CLEAR.
    Crée le USER s'il n'existe pas encore.
    """
    config = await db.get(Config, 1)
    if config is None or not config.oidc_enabled:
        raise HTTPException(status_code=400, detail="OIDC non configuré")

    from app.config import settings
    from app.services.oidc_service import verify_state, exchange_code
    from app.services.crypto_service import decrypt_secret
    from app.services.log import write_log

    # Vérification du state HMAC
    if not verify_state(body.state, settings.SECRET_KEY):
        raise HTTPException(status_code=400, detail="State OIDC invalide ou expiré")

    client_secret = decrypt_secret(config.oidc_client_secret_chiffre or "")

    try:
        userinfo = await exchange_code(
            issuer_url=config.oidc_issuer_url,
            client_id=config.oidc_client_id,
            client_secret=client_secret,
            code=body.code,
            redirect_uri=body.redirect_uri,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de l'échange OIDC : {exc}",
        )

    # Extraire l'identifiant externe (sub) et le nom d'affichage
    sub = userinfo.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Claim 'sub' manquant dans userinfo")

    email = userinfo.get("email", "")
    display_name = (
        userinfo.get("name")
        or userinfo.get("preferred_username")
        or email
        or sub
    )

    # Charger ou créer le USER
    result = await db.execute(
        select(User)
        .options(joinedload(User.obj))
        .where(User.auth_uid == sub, User.est_actif == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Provisionnement automatique du USER
        user = await _provision_oidc_user(db, sub=sub, display_name=display_name)
        await write_log(
            db, user_id=None, operation="INSERT", table_name="user",
            entite_id=user.id,
            apres={"auth_uid": sub, "nom": display_name, "source": "oidc"},
        )

    await db.commit()

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


async def _provision_oidc_user(db: AsyncSession, sub: str, display_name: str) -> User:
    """
    Crée automatiquement un USER OIDC (LECTEUR, sans ORG, TUSER='humain').
    L'ADMIN pourra ensuite modifier son rôle/ORG depuis le panneau administration.
    """
    import uuid as _uuid
    from app.models.activity import Tuser, Role
    from app.models.object import Obj, Cla

    # TUSER 'humain' — premier trouvé
    tuser_result = await db.execute(select(Tuser).limit(1))
    tuser = tuser_result.scalar_one_or_none()
    if tuser is None:
        raise HTTPException(status_code=500, detail="Aucun TUSER configuré — impossible de provisionner le USER")

    # ROLE 'LECTEUR'
    role_result = await db.execute(select(Role).where(Role.valeur == "LECTEUR"))
    role = role_result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=500, detail="ROLE LECTEUR introuvable")

    # CLA par défaut pour l'OBJ USER
    cla_result = await db.execute(select(Cla).limit(1))
    cla = cla_result.scalar_one_or_none()
    if cla is None:
        raise HTTPException(status_code=500, detail="Aucune CLA disponible pour créer l'OBJ utilisateur")

    obj = Obj(nom=display_name, uid=_uuid.uuid4(), cla_id=cla.id)
    db.add(obj)
    await db.flush()

    user = User(
        obj_id=obj.id,
        tuser_id=tuser.id,
        role_id=role.id,
        auth_uid=sub,
        est_actif=True,
    )
    db.add(user)
    await db.flush()
    return user
