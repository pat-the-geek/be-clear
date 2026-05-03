from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.jwt import decode_token
from app.models.activity import User, Role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = decode_token(token)
    except JWTError:
        raise credentials_exc

    result = await db.execute(
        select(User)
        .options(joinedload(User.role))
        .where(User.id == int(user_id))
    )
    user = result.unique().scalar_one_or_none()
    if user is None or not user.est_actif:
        raise credentials_exc
    return user


async def require_editeur(user: User = Depends(get_current_user)) -> User:
    """Autorise les ADMIN, EDITEUR, et les utilisateurs non-humains (role_id IS NULL)."""
    if user.role_id is not None:
        # Utilisateur humain — doit avoir au moins le rôle EDITEUR
        role_valeur = user.role.valeur if user.role else None
        if role_valeur not in ("ADMIN", "EDITEUR"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rôle insuffisant (EDITEUR ou ADMIN requis)",
            )
    # Les utilisateurs non-humains (role_id IS NULL) agissent avec droits ADMIN
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Autorise uniquement les ADMIN et les utilisateurs non-humains (role_id IS NULL)."""
    if user.role_id is not None:
        # Utilisateur humain — doit avoir le rôle ADMIN
        role_valeur = user.role.valeur if user.role else None
        if role_valeur != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rôle insuffisant (ADMIN requis)",
            )
    # Les utilisateurs non-humains (role_id IS NULL) agissent avec droits ADMIN
    return user
