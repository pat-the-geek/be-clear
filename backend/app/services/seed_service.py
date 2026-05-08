"""
Seed de démarrage — initialise la base de données avec les éléments indispensables.

Idempotent : chaque étape vérifie l'existence avant de créer.
Appelé au démarrage de chaque instance Docker via le lifespan FastAPI.

Éléments créés si absents :
  1. Rôles          : ADMIN, EDITEUR, LECTEUR
  2. Types USER      : humain, système
  3. Classe de base  : Cla "Utilisateur" (pour l'OBJ des comptes)
  4. Compte admin    : auth_uid="admin", mot de passe="admin" (rôle ADMIN)
"""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.activity import Role, Tuser, User
from app.models.object import Cla, Obj

logger = logging.getLogger("beclear.seed")


# ─── Vérification d'intégrité ─────────────────────────────────

async def check_db_integrity(db: AsyncSession) -> dict:
    """
    Vérifie que la base contient les éléments indispensables.
    Retourne un dict {"ok": bool, "issues": [str]}.
    """
    issues = []

    # Rôles obligatoires
    for valeur in ("ADMIN", "EDITEUR", "LECTEUR"):
        r = await db.execute(select(Role).where(Role.valeur == valeur))
        if r.scalar_one_or_none() is None:
            issues.append(f"Rôle manquant : {valeur}")

    # Au moins un ADMIN actif
    admin_role = await db.execute(select(Role).where(Role.valeur == "ADMIN"))
    role = admin_role.scalar_one_or_none()
    if role:
        admin_user = await db.execute(
            select(User).where(User.role_id == role.id, User.est_actif == True)  # noqa: E712
        )
        if admin_user.scalar_one_or_none() is None:
            issues.append("Aucun utilisateur ADMIN actif")

    # Types USER de base
    for valeur in ("humain", "système"):
        r = await db.execute(select(Tuser).where(Tuser.valeur == valeur))
        if r.scalar_one_or_none() is None:
            issues.append(f"Type utilisateur manquant : {valeur}")

    return {"ok": len(issues) == 0, "issues": issues}


# ─── Seed ─────────────────────────────────────────────────────

async def seed_initial_data(db: AsyncSession) -> None:
    """
    Crée les données de démarrage si elles sont absentes.
    Idempotent — sûr à appeler plusieurs fois ou depuis plusieurs instances.
    """
    created: list[str] = []

    # ── 1. Rôles ──────────────────────────────────────────────
    roles: dict[str, Role] = {}
    for valeur in ("ADMIN", "EDITEUR", "LECTEUR"):
        r = await db.execute(select(Role).where(Role.valeur == valeur))
        role = r.scalar_one_or_none()
        if role is None:
            role = Role(valeur=valeur)
            db.add(role)
            await db.flush()
            created.append(f"Role:{valeur}")
        roles[valeur] = role

    # ── 2. Types d'utilisateur ────────────────────────────────
    tusers: dict[str, Tuser] = {}
    for valeur in ("humain", "système"):
        r = await db.execute(select(Tuser).where(Tuser.valeur == valeur))
        tuser = r.scalar_one_or_none()
        if tuser is None:
            tuser = Tuser(valeur=valeur)
            db.add(tuser)
            await db.flush()
            created.append(f"Tuser:{valeur}")
        tusers[valeur] = tuser

    # ── 3. Classe de base pour les comptes utilisateurs ───────
    r = await db.execute(select(Cla).where(Cla.nom == "Utilisateur"))
    cla_user = r.scalar_one_or_none()
    if cla_user is None:
        cla_user = Cla(
            nom="Utilisateur",
            visuel_type="icone",
            visuel_valeur="user",
        )
        db.add(cla_user)
        await db.flush()
        created.append("Cla:Utilisateur")

    # ── 4. Compte administrateur ──────────────────────────────
    r = await db.execute(select(User).where(User.auth_uid == "admin"))
    admin_user = r.scalar_one_or_none()

    if admin_user is None:
        import bcrypt
        password_hash = bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode()

        obj_admin = Obj(
            uid=uuid.uuid4(),
            nom="Administrateur",
            cla_id=cla_user.id,
        )
        db.add(obj_admin)
        await db.flush()

        admin_user = User(
            obj_id=obj_admin.id,
            tuser_id=tusers["humain"].id,
            role_id=roles["ADMIN"].id,
            auth_uid="admin",
            password_hash=password_hash,
            est_actif=True,
        )
        db.add(admin_user)
        await db.flush()

        # Rétro-remplir les champs d'audit (l'admin se crée lui-même)
        obj_admin.created_by_id = admin_user.id
        obj_admin.updated_by_id = admin_user.id
        admin_user.created_by_id = admin_user.id
        admin_user.updated_by_id = admin_user.id

        created.append("User:admin")

    await db.commit()

    # ── Rapport ───────────────────────────────────────────────
    if created:
        logger.info("Seed — éléments créés : %s", ", ".join(created))
    else:
        logger.info("Seed — base déjà initialisée, rien à créer.")

    # Vérification finale
    integrity = await check_db_integrity(db)
    if not integrity["ok"]:
        for issue in integrity["issues"]:
            logger.warning("Intégrité DB — %s", issue)
    else:
        logger.info("Intégrité DB — OK")
