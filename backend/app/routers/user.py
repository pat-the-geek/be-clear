"""Router USER — gestion des utilisateurs (ADMIN seulement)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.auth.dependencies import get_current_user, require_admin
from app.models.activity import User, Tuser, Role, Org
from app.models.object import Obj, Cla
from app.schemas.common import Paginated
from app.services.log import write_log

router = APIRouter()


# ─── Schémas ─────────────────────────────────────────────

class TuserRef(BaseModel):
    id: int
    valeur: str
    model_config = {"from_attributes": True}


class RoleRef(BaseModel):
    id: int
    valeur: str
    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: int
    nom: str           # obj.nom
    tuser: TuserRef
    role: RoleRef | None = None
    org_id: int | None = None
    org_nom: str | None = None
    est_actif: bool
    auth_uid: str | None = None
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    tuser_id: int
    nom: str
    role_id: int | None = None
    org_id: int | None = None
    auth_uid: str | None = None
    cla_id: int         # CLA de l'OBJ associé
    password: str | None = None


class UserUpdate(BaseModel):
    role_id: int | None = None
    org_id: int | None = None
    est_actif: bool | None = None


class SetPasswordBody(BaseModel):
    password: str


# ─── Helpers ─────────────────────────────────────────────

def _user_options():
    return [
        joinedload(User.tuser),
        joinedload(User.org),
        joinedload(User.obj).joinedload(Obj.cla),
    ]


async def _load_user_with_role(db: AsyncSession, user_id: int) -> tuple:
    """Charge un User avec son Role et son Org. Retourne (User, Role | None, Org | None)."""
    result = await db.execute(
        select(User)
        .options(
            joinedload(User.tuser),
            joinedload(User.org),
            joinedload(User.obj).joinedload(Obj.cla),
        )
        .where(User.id == user_id)
    )
    user = result.unique().scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    role = None
    if user.role_id is not None:
        role = await db.get(Role, user.role_id)

    return user, role, user.org


# ─── GET /user/roles ──────────────────────────────────────

@router.get("/roles")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Retourne la liste des rôles disponibles."""
    from sqlalchemy import select as _select
    result = await db.execute(_select(Role).order_by(Role.id))
    roles = result.scalars().all()
    return [{"id": r.id, "valeur": r.valeur} for r in roles]


# ─── GET /user ────────────────────────────────────────────

@router.get("", response_model=Paginated[UserOut])
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(User).options(*_user_options())

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    users = result.unique().scalars().all()

    items = []
    for u in users:
        role = None
        if u.role_id is not None:
            role = await db.get(Role, u.role_id)
        items.append(UserOut(
            id=u.id,
            nom=u.obj.nom,
            tuser=u.tuser,
            role=RoleRef(id=role.id, valeur=role.valeur) if role else None,
            org_id=u.org_id,
            org_nom=u.org.obj.nom if u.org and u.org.obj else None,
            est_actif=u.est_actif,
            auth_uid=u.auth_uid,
        ))

    return Paginated(items=items, total=total, page=page, per_page=per_page)


# ─── GET /user/{id} ───────────────────────────────────────

@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    user, role, org = await _load_user_with_role(db, user_id)
    return UserOut(
        id=user.id,
        nom=user.obj.nom,
        tuser=user.tuser,
        role=RoleRef(id=role.id, valeur=role.valeur) if role else None,
        org_id=user.org_id,
        org_nom=org.obj.nom if org and org.obj else None,
        est_actif=user.est_actif,
        auth_uid=user.auth_uid,
    )


# ─── POST /user ───────────────────────────────────────────

@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Vérifier que le TUSER existe
    tuser = await db.get(Tuser, body.tuser_id)
    if tuser is None:
        raise HTTPException(status_code=400, detail="TUSER introuvable")

    # Vérifier que la CLA existe
    cla = await db.get(Cla, body.cla_id)
    if cla is None:
        raise HTTPException(status_code=400, detail="CLA introuvable")

    # Vérifier le role si fourni
    if body.role_id is not None:
        role = await db.get(Role, body.role_id)
        if role is None:
            raise HTTPException(status_code=400, detail="ROLE introuvable")

    # Vérifier l'org si fournie
    if body.org_id is not None:
        org = await db.get(Org, body.org_id)
        if org is None:
            raise HTTPException(status_code=400, detail="ORG introuvable")

    # Créer l'OBJ
    obj = Obj(
        nom=body.nom,
        cla_id=body.cla_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(obj)
    await db.flush()

    # Hasher le mot de passe si fourni
    password_hash = None
    if body.password:
        import bcrypt
        password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    # Créer l'User
    new_user = User(
        obj_id=obj.id,
        tuser_id=body.tuser_id,
        role_id=body.role_id,
        org_id=body.org_id,
        auth_uid=body.auth_uid,
        password_hash=password_hash,
        est_actif=True,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(new_user)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un utilisateur avec cet auth_uid existe déjà")

    await write_log(db, user_id=current_user.id, operation="INSERT",
                    table_name="user", entite_id=new_user.id,
                    apres={"nom": body.nom, "tuser_id": body.tuser_id,
                           "role_id": body.role_id, "org_id": body.org_id})
    await db.commit()

    user_out, role_obj, org_obj = await _load_user_with_role(db, new_user.id)
    return UserOut(
        id=user_out.id,
        nom=user_out.obj.nom,
        tuser=user_out.tuser,
        role=RoleRef(id=role_obj.id, valeur=role_obj.valeur) if role_obj else None,
        org_id=user_out.org_id,
        org_nom=org_obj.obj.nom if org_obj and org_obj.obj else None,
        est_actif=user_out.est_actif,
        auth_uid=user_out.auth_uid,
    )


# ─── PUT /user/{id} ───────────────────────────────────────

@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(
        select(User).options(*_user_options()).where(User.id == user_id)
    )
    user = result.unique().scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    avant = {"role_id": user.role_id, "org_id": user.org_id, "est_actif": user.est_actif}

    if body.role_id is not None:
        role = await db.get(Role, body.role_id)
        if role is None:
            raise HTTPException(status_code=400, detail="ROLE introuvable")
        user.role_id = body.role_id

    if body.org_id is not None:
        org = await db.get(Org, body.org_id)
        if org is None:
            raise HTTPException(status_code=400, detail="ORG introuvable")
        user.org_id = body.org_id

    if body.est_actif is not None:
        user.est_actif = body.est_actif

    user.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="user", entite_id=user_id, avant=avant,
                    apres={"role_id": user.role_id, "org_id": user.org_id,
                           "est_actif": user.est_actif})
    await db.commit()

    user_out, role_obj, org_obj = await _load_user_with_role(db, user_id)
    return UserOut(
        id=user_out.id,
        nom=user_out.obj.nom,
        tuser=user_out.tuser,
        role=RoleRef(id=role_obj.id, valeur=role_obj.valeur) if role_obj else None,
        org_id=user_out.org_id,
        org_nom=org_obj.obj.nom if org_obj and org_obj.obj else None,
        est_actif=user_out.est_actif,
        auth_uid=user_out.auth_uid,
    )


# ─── POST /user/{id}/set-password ─────────────────────────

@router.post("/{user_id}/set-password", status_code=status.HTTP_204_NO_CONTENT)
async def set_user_password(
    user_id: int,
    body: SetPasswordBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Réinitialise le mot de passe d'un utilisateur (ADMIN seulement)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    import bcrypt
    user.password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="user", entite_id=user_id,
                    apres={"password_hash": "***"})
    await db.commit()


# ─── DELETE /user/{id} ────────────────────────────────────

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Désactive l'utilisateur (met est_actif=False). Ne supprime pas."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user.est_actif = False
    user.updated_by_id = current_user.id

    await write_log(db, user_id=current_user.id, operation="UPDATE",
                    table_name="user", entite_id=user_id,
                    avant={"est_actif": True},
                    apres={"est_actif": False})
    await db.commit()
