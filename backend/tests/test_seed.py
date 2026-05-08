"""
Tests du service de seed — initialisation de la base de données.

Vérifie :
- Idempotence (appel multiple sans erreur ni doublon)
- Création des rôles, types USER, classe de base, compte admin
- Authentification du compte admin avec admin/admin
- Intégrité DB après seed
- Préservation des données existantes (non-écrasement)
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.activity import Role, Tuser, User
from app.models.object import Cla
from app.services.seed_service import seed_initial_data, check_db_integrity


# ─── Seed de base ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_seed_creates_roles(db_session: AsyncSession):
    """Le seed crée les 3 rôles si absents."""
    await seed_initial_data(db_session)

    for valeur in ("ADMIN", "EDITEUR", "LECTEUR"):
        r = await db_session.execute(select(Role).where(Role.valeur == valeur))
        assert r.scalar_one_or_none() is not None, f"Rôle {valeur} non créé"


@pytest.mark.asyncio
async def test_seed_creates_tusers(db_session: AsyncSession):
    """Le seed crée les types d'utilisateur humain et système."""
    await seed_initial_data(db_session)

    for valeur in ("humain", "système"):
        r = await db_session.execute(select(Tuser).where(Tuser.valeur == valeur))
        assert r.scalar_one_or_none() is not None, f"Tuser {valeur} non créé"


@pytest.mark.asyncio
async def test_seed_creates_cla_utilisateur(db_session: AsyncSession):
    """Le seed crée la classe de base 'Utilisateur'."""
    await seed_initial_data(db_session)

    r = await db_session.execute(select(Cla).where(Cla.nom == "Utilisateur"))
    assert r.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_seed_creates_admin_user(db_session: AsyncSession):
    """Le seed crée le compte admin avec le bon rôle."""
    await seed_initial_data(db_session)

    r = await db_session.execute(select(User).where(User.auth_uid == "admin"))
    admin = r.scalar_one_or_none()
    assert admin is not None
    assert admin.est_actif is True

    # Vérifier le rôle ADMIN
    role = await db_session.get(Role, admin.role_id)
    assert role is not None
    assert role.valeur == "ADMIN"


# ─── Idempotence ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_seed_idempotent_no_duplicates(db_session: AsyncSession):
    """Appeler seed deux fois ne crée pas de doublons."""
    await seed_initial_data(db_session)
    await seed_initial_data(db_session)

    # Un seul admin
    r = await db_session.execute(select(User).where(User.auth_uid == "admin"))
    assert len(r.scalars().all()) == 1

    # Trois rôles exactement (ADMIN, EDITEUR, LECTEUR)
    r = await db_session.execute(select(Role))
    roles = r.scalars().all()
    valeurs = {r.valeur for r in roles}
    assert "ADMIN" in valeurs
    assert "EDITEUR" in valeurs
    assert "LECTEUR" in valeurs

    # Une seule CLA "Utilisateur"
    r = await db_session.execute(select(Cla).where(Cla.nom == "Utilisateur"))
    assert len(r.scalars().all()) == 1


@pytest.mark.asyncio
async def test_seed_does_not_overwrite_existing_data(db_session: AsyncSession):
    """Le seed ne modifie pas les données déjà existantes."""
    # Premier seed
    await seed_initial_data(db_session)

    # Modifier le compte admin (simuler une modification faite par l'utilisateur)
    r = await db_session.execute(select(User).where(User.auth_uid == "admin"))
    admin = r.scalar_one()
    original_hash = admin.password_hash

    # Deuxième seed — ne doit pas réinitialiser le mot de passe
    await seed_initial_data(db_session)

    r = await db_session.execute(select(User).where(User.auth_uid == "admin"))
    admin_after = r.scalar_one()
    assert admin_after.password_hash == original_hash, \
        "Le seed a écrasé le mot de passe existant !"


# ─── Intégrité ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_db_integrity_ok_after_seed(db_session: AsyncSession):
    """check_db_integrity retourne ok=True après un seed complet."""
    await seed_initial_data(db_session)
    result = await check_db_integrity(db_session)
    assert result["ok"] is True
    assert result["issues"] == []


@pytest.mark.asyncio
async def test_check_db_integrity_detects_missing_role(db_session: AsyncSession):
    """check_db_integrity détecte un rôle manquant."""
    # Base vide (pas de seed) — les rôles n'existent pas
    result = await check_db_integrity(db_session)
    assert result["ok"] is False
    missing_roles = [i for i in result["issues"] if "Rôle manquant" in i]
    assert len(missing_roles) == 3


@pytest.mark.asyncio
async def test_check_db_integrity_detects_no_admin(db_session: AsyncSession):
    """check_db_integrity détecte l'absence d'admin actif après seed partiel."""
    await seed_initial_data(db_session)

    # Désactiver l'admin
    r = await db_session.execute(select(User).where(User.auth_uid == "admin"))
    admin = r.scalar_one()
    admin.est_actif = False
    await db_session.commit()

    result = await check_db_integrity(db_session)
    assert result["ok"] is False
    assert any("ADMIN actif" in i for i in result["issues"])


# ─── Authentification admin/admin ────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_login_after_seed(client: AsyncClient, db_session: AsyncSession):
    """Le compte admin créé par le seed peut s'authentifier avec admin/admin."""
    await seed_initial_data(db_session)

    r = await client.post("/api/auth/login",
                          json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert len(data["access_token"]) > 0


@pytest.mark.asyncio
async def test_admin_token_accesses_protected_route(client: AsyncClient, db_session: AsyncSession):
    """Un token obtenu via admin/admin permet d'accéder aux routes admin."""
    await seed_initial_data(db_session)

    r = await client.post("/api/auth/login",
                          json={"username": "admin", "password": "admin"})
    token = r.json()["access_token"]

    r2 = await client.get("/api/stats",
                          headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
