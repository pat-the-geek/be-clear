from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.jwt import create_access_token
from app.auth.dependencies import get_current_user
from app.models.activity import User, Role
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


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authentification locale par auth_uid + mot de passe bcrypt."""
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

    # Injecte le libellé du rôle dans le schéma de retour
    return UserMe(
        id=user.id,
        role=user.role.valeur if user.role else None,
        org_id=user.org_id,
        est_actif=user.est_actif,
        obj=ObjBrief.from_obj(user.obj),
    )
