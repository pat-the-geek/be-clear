"""
Helpers partagés entre les tests : création de fixtures DB et obtention de tokens.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.jwt import create_access_token
from app.models.activity import Role, Tuser, User, Torg, Tenv, Org, Teng, Tevent
from app.models.object import Cla, Obj


async def create_role(db: AsyncSession, valeur: str = "ADMIN") -> Role:
    role = Role(valeur=valeur)
    db.add(role)
    await db.flush()
    return role


async def create_tuser(db: AsyncSession, valeur: str = "humain") -> Tuser:
    tuser = Tuser(valeur=valeur)
    db.add(tuser)
    await db.flush()
    return tuser


async def create_cla(db: AsyncSession, nom: str = "ClaTest") -> Cla:
    cla = Cla(nom=nom)
    db.add(cla)
    await db.flush()
    return cla


async def create_torg(db: AsyncSession, nom: str, cla_id: int) -> Torg:
    torg = Torg(nom=nom, cla_id=cla_id)
    db.add(torg)
    await db.flush()
    return torg


async def create_tenv(db: AsyncSession, nom: str, cla_id: int) -> Tenv:
    tenv = Tenv(nom=nom, cla_id=cla_id)
    db.add(tenv)
    await db.flush()
    return tenv


async def create_user(
    db: AsyncSession,
    auth_uid: str,
    tuser_id: int,
    role_id: int | None,
    cla_id: int,
) -> User:
    obj = Obj(
        nom=f"User_{auth_uid}",
        uid=uuid.uuid4(),
        cla_id=cla_id,
    )
    db.add(obj)
    await db.flush()

    user = User(
        obj_id=obj.id,
        tuser_id=tuser_id,
        role_id=role_id,
        auth_uid=auth_uid,
        est_actif=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_teng(db: AsyncSession, nom: str, cla_id: int) -> Teng:
    teng = Teng(nom=nom, cla_id=cla_id)
    db.add(teng)
    await db.flush()
    return teng


async def create_tevent(
    db: AsyncSession, nom: str, cla_id: int,
    duree_valeur: float = 1.0, duree_unite: str = "heures"
) -> Tevent:
    tevent = Tevent(nom=nom, cla_id=cla_id,
                    duree_prevue_valeur=duree_valeur, duree_prevue_unite=duree_unite)
    db.add(tevent)
    await db.flush()
    return tevent


async def get_token(user: User) -> str:
    return create_access_token(user.id)
