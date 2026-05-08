"""Résolution du token API MCP → USER + vérification de rôle."""
import hashlib
import os

from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.activity import User
from app.models.system import ApiToken

BECLEAR_API_TOKEN: str = os.environ.get("BECLEAR_API_TOKEN", "")
BECLEAR_API_URL: str = os.environ.get("BECLEAR_API_URL", "http://localhost:8000")


async def get_mcp_user(db: AsyncSession) -> User:
    """Résout BECLEAR_API_TOKEN en USER be.CLEAR.

    Lève RuntimeError si le token est absent, invalide ou inactif.
    """
    if not BECLEAR_API_TOKEN:
        raise RuntimeError("Variable d'environnement BECLEAR_API_TOKEN non définie")

    token_hash = hashlib.sha256(BECLEAR_API_TOKEN.encode()).hexdigest()
    result = await db.execute(
        select(ApiToken).where(
            ApiToken.token_hash == token_hash,
            ApiToken.est_actif.is_(True),
        )
    )
    api_token = result.scalar_one_or_none()
    if api_token is None:
        raise RuntimeError("Token API invalide ou inactif")

    result = await db.execute(
        select(User).options(joinedload(User.role)).where(User.id == api_token.user_id)
    )
    user = result.unique().scalar_one_or_none()
    if user is None or not user.est_actif:
        raise RuntimeError("Utilisateur associé au token invalide ou inactif")

    return user


def is_editeur(user: User) -> bool:
    """Retourne True si l'utilisateur a le droit EDITEUR ou ADMIN (ou est système)."""
    if user.role_id is None:
        return True  # utilisateur système — droits ADMIN
    return user.role is not None and user.role.valeur in ("ADMIN", "EDITEUR")
