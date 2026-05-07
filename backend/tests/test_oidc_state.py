"""
Tests unitaires du state HMAC OIDC.
Pas de DB ni de serveur HTTP — pur calcul cryptographique.
"""
import time
import pytest

from app.services.oidc_service import create_state, verify_state

SECRET = "test-secret-key-oidc-32chars-ok!"


def test_create_state_format():
    """Le state a exactement 3 parties séparées par ':'."""
    state = create_state(SECRET)
    parts = state.split(":")
    assert len(parts) == 3
    ts, nonce, sig = parts
    assert ts.isdigit()
    assert len(nonce) == 32
    assert len(sig) == 64  # sha256 hex


def test_verify_state_valid():
    """Un state fraîchement créé est accepté."""
    state = create_state(SECRET)
    assert verify_state(state, SECRET) is True


def test_verify_state_wrong_secret():
    """Un state vérifié avec un mauvais secret est rejeté."""
    state = create_state(SECRET)
    assert verify_state(state, "wrong-secret") is False


def test_verify_state_tampered_sig():
    """Modifier la signature invalide le state."""
    state = create_state(SECRET)
    ts, nonce, sig = state.split(":")
    tampered = f"{ts}:{nonce}:{sig[:-4]}FFFF"
    assert verify_state(tampered, SECRET) is False


def test_verify_state_tampered_nonce():
    """Modifier le nonce invalide la signature."""
    state = create_state(SECRET)
    ts, nonce, sig = state.split(":")
    assert verify_state(f"{ts}:aaaa{nonce[4:]}:{sig}", SECRET) is False


def test_verify_state_expired():
    """Un state dont le timestamp est trop ancien est rejeté."""
    old_ts = str(int(time.time()) - 700)  # 700s > max_age par défaut (600s)
    import hmac as _hmac, hashlib
    sig = _hmac.new(SECRET.encode(), f"{old_ts}:anonce".encode(), hashlib.sha256).hexdigest()
    state = f"{old_ts}:anonce:{sig}"
    assert verify_state(state, SECRET, max_age=600) is False


def test_verify_state_malformed():
    """Un state sans le bon format est rejeté sans exception."""
    assert verify_state("", SECRET) is False
    assert verify_state("only:two", SECRET) is False
    assert verify_state("a:b:c:d", SECRET) is False
