import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.jwt import decode_token
from app.models.activity import User, Role
from app.models.system import ApiToken

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _load_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User).options(joinedload(User.role)).where(User.id == user_id)
    )
    return result.unique().scalar_one_or_none()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # ── Essai 1 : JWT (session web normale) ──────────────
    try:
        user_id = decode_token(token)
        user = await _load_user_by_id(db, int(user_id))
        if user is None or not user.est_actif:
            raise credentials_exc
        return user
    except JWTError:
        pass  # pas un JWT → tenter ApiToken

    # ── Essai 2 : ApiToken (clé API externe) ─────────────
    token_hash = _hash_token(token)
    result = await db.execute(
        select(ApiToken).where(
            ApiToken.token_hash == token_hash,
            ApiToken.est_actif.is_(True),
        )
    )
    api_token = result.scalar_one_or_none()
    if api_token is None:
        raise credentials_exc

    if api_token.expire_at and api_token.expire_at < datetime.now(timezone.utc):
        raise credentials_exc

    user = await _load_user_by_id(db, api_token.user_id)
    if user is None or not user.est_actif:
        raise credentials_exc

    # Met à jour derniere_utilisation — commit immédiat pour que même
    # les endpoints en lecture seule tracent l'utilisation du token.
    await db.execute(
        sa_update(ApiToken)
        .where(ApiToken.id == api_token.id)
        .values(derniere_utilisation=datetime.now(timezone.utc))
    )
    await db.commit()

    return user


async def require_editeur(user: User = Depends(get_current_user)) -> User:
    """Autorise les ADMIN, EDITEUR, et les utilisateurs non-humains (role_id IS NULL)."""
    if user.role_id is not None:
        role_valeur = user.role.valeur if user.role else None
        if role_valeur not in ("ADMIN", "EDITEUR"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rôle insuffisant (EDITEUR ou ADMIN requis)",
            )
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Autorise uniquement les ADMIN et les utilisateurs non-humains (role_id IS NULL)."""
    if user.role_id is not None:
        role_valeur = user.role.valeur if user.role else None
        if role_valeur != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rôle insuffisant (ADMIN requis)",
            )
    return user
