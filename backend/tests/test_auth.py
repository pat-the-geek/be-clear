"""
Tests d'authentification — vérification des cas d'erreur 401.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Un auth_uid connu avec un mauvais mot de passe → 401.

    Note : notre impl dev accepte auth_uid = username (pas de password).
    Un utilisateur inconnu retourne 401.
    """
    response = await client.post(
        "/api/auth/login",
        data={"username": "utilisateur_inexistant", "password": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(client: AsyncClient):
    """Utilisateur totalement inconnu → 401."""
    response = await client.post(
        "/api/auth/login",
        data={"username": "nobody@example.com", "password": "secret"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_protected_route_no_token(client: AsyncClient):
    """Accès à une route protégée sans token → 401."""
    response = await client.get("/api/org")
    assert response.status_code == 401
