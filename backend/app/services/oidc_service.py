"""Service OIDC — découverte, génération d'URL d'autorisation, échange de code."""
from __future__ import annotations
import hashlib
import hmac
import secrets
import time
import logging
import httpx

logger = logging.getLogger("beclear.oidc")

# Cache mémoire de la découverte (TTL 1h)
_discovery_cache: dict[str, tuple[dict, float]] = {}
_DISCOVERY_TTL = 3600.0


async def get_discovery(issuer_url: str) -> dict:
    """Récupère et met en cache le document de découverte OIDC."""
    now = time.monotonic()
    if issuer_url in _discovery_cache:
        doc, ts = _discovery_cache[issuer_url]
        if now - ts < _DISCOVERY_TTL:
            return doc

    url = issuer_url.rstrip("/") + "/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        doc = resp.json()

    _discovery_cache[issuer_url] = (doc, now)
    return doc


def create_state(secret_key: str) -> str:
    """Génère un state signé HMAC : `{ts}:{nonce}:{sig}` (max-age 10 min)."""
    nonce = secrets.token_hex(16)
    ts = str(int(time.time()))
    sig = hmac.new(secret_key.encode(), f"{ts}:{nonce}".encode(), hashlib.sha256).hexdigest()
    return f"{ts}:{nonce}:{sig}"


def verify_state(state: str, secret_key: str, max_age: int = 600) -> bool:
    """Vérifie la signature HMAC et l'expiry du state."""
    try:
        parts = state.split(":", 2)
        if len(parts) != 3:
            return False
        ts, nonce, sig = parts
        expected = hmac.new(secret_key.encode(), f"{ts}:{nonce}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        if int(time.time()) - int(ts) > max_age:
            return False
        return True
    except Exception:
        return False


async def build_authorize_url(
    issuer_url: str,
    client_id: str,
    redirect_uri: str,
    scopes: str,
    state: str,
) -> str:
    """Construit l'URL d'autorisation OIDC."""
    doc = await get_discovery(issuer_url)
    auth_endpoint = doc["authorization_endpoint"]

    from urllib.parse import urlencode
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
    }
    return f"{auth_endpoint}?{urlencode(params)}"


async def exchange_code(
    issuer_url: str,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
) -> dict:
    """Échange le code contre des tokens et retourne les claims userinfo."""
    doc = await get_discovery(issuer_url)
    token_endpoint = doc["token_endpoint"]
    userinfo_endpoint = doc.get("userinfo_endpoint")

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Échange code → tokens
        resp = await client.post(token_endpoint, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        })
        resp.raise_for_status()
        tokens = resp.json()

        access_token = tokens.get("access_token")
        if not access_token:
            raise ValueError("Pas d'access_token dans la réponse provider")

        # Userinfo
        if userinfo_endpoint:
            ui_resp = await client.get(
                userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            ui_resp.raise_for_status()
            return ui_resp.json()

        # Fallback : décoder l'id_token (sans vérification de signature)
        id_token = tokens.get("id_token", "")
        if id_token:
            import base64, json as _json
            payload = id_token.split(".")[1]
            padding = 4 - len(payload) % 4
            payload += "=" * padding
            return _json.loads(base64.urlsafe_b64decode(payload))

        raise ValueError("Impossible de récupérer les informations utilisateur")
