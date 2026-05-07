"""
Tests du service de chiffrement Fernet (crypto_service).
"""
import pytest
from app.services.crypto_service import encrypt_secret, decrypt_secret


def test_encrypt_decrypt_roundtrip():
    """Chiffrer puis déchiffrer retourne la valeur originale."""
    plain = "sk-test-api-key-1234567890"
    cipher = encrypt_secret(plain)
    assert cipher != plain
    assert decrypt_secret(cipher) == plain


def test_encrypt_produces_different_tokens():
    """Deux chiffrements de la même valeur donnent des tokens différents (IV aléatoire)."""
    plain = "same-secret"
    cipher1 = encrypt_secret(plain)
    cipher2 = encrypt_secret(plain)
    assert cipher1 != cipher2
    # Mais les deux se déchiffrent correctement
    assert decrypt_secret(cipher1) == plain
    assert decrypt_secret(cipher2) == plain


def test_decrypt_plaintext_backward_compat():
    """Une valeur non-Fernet (ancienne clé en clair) est retournée telle quelle."""
    plain_legacy = "old-plain-key"
    result = decrypt_secret(plain_legacy)
    assert result == plain_legacy


def test_encrypt_empty_string():
    """Chiffrement d'une chaîne vide."""
    cipher = encrypt_secret("")
    assert decrypt_secret(cipher) == ""


def test_encrypt_unicode():
    """Chiffrement d'une clé unicode."""
    plain = "clé-api-unicode-éàü-🔑"
    assert decrypt_secret(encrypt_secret(plain)) == plain
