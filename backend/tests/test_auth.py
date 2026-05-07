"""
Tests d'authentification — connexion, token JWT et ApiToken Bearer.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Un utilisateur inconnu → 401."""
    response = await client.post(
        "/api/auth/login",
        json={"username": "utilisateur_inexistant", "password": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient):
    """Utilisateur totalement inconnu → 401."""
    response = await client.post(
        "/api/auth/login",
        json={"username": "nobody@example.com", "password": "secret"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_no_token(client: AsyncClient):
    """Accès à une route protégée sans token → 401."""
    response = await client.get("/api/org")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_valid_user(client: AsyncClient, db_session: AsyncSession):
    """Utilisateur existant avec bon mot de passe → 200 + token."""
    import bcrypt

    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_auth")
    cla = await create_cla(db_session, "ClaAuth")
    user = await create_user(
        db_session,
        auth_uid="testlogin",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    user.password_hash = bcrypt.hashpw(b"monmotdepasse", bcrypt.gensalt()).decode()
    await db_session.commit()

    response = await client.post(
        "/api/auth/login",
        json={"username": "testlogin", "password": "monmotdepasse"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password_existing_user(client: AsyncClient, db_session: AsyncSession):
    """Utilisateur existant mais mauvais mot de passe → 401."""
    import bcrypt

    role = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_pw")
    cla = await create_cla(db_session, "ClaPw")
    user = await create_user(
        db_session,
        auth_uid="pwuser",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    user.password_hash = bcrypt.hashpw(b"bonmotdepasse", bcrypt.gensalt()).decode()
    await db_session.commit()

    response = await client.post(
        "/api/auth/login",
        json={"username": "pwuser", "password": "mauvaismdp"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_jwt_token_grants_access(client: AsyncClient, db_session: AsyncSession):
    """Un token JWT valide permet d'accéder aux routes protégées."""
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_jwt")
    cla = await create_cla(db_session, "ClaJwt")
    user = await create_user(
        db_session,
        auth_uid="jwtuser",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    await db_session.commit()
    token = await get_token(user)

    response = await client.get(
        "/api/org",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_api_token_grants_access(client: AsyncClient, db_session: AsyncSession):
    """Un ApiToken Bearer valide permet d'accéder aux routes protégées."""
    import secrets
    import hashlib

    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_apitoken")
    cla = await create_cla(db_session, "ClaApiToken")
    user = await create_user(
        db_session,
        auth_uid="apitokenuser",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    await db_session.commit()

    # Créer un ApiToken directement en DB
    from app.models.system import ApiToken
    plain_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    api_token = ApiToken(
        user_id=user.id,
        token_hash=token_hash,
        nom="Test token",
        est_actif=True,
    )
    db_session.add(api_token)
    await db_session.commit()

    response = await client.get(
        "/api/org",
        headers={"Authorization": f"Bearer {plain_token}"},
    )
    assert response.status_code == 200
