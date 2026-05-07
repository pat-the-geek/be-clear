"""Chiffrement symétrique des secrets au repos (clés API LLM).

La clé Fernet est dérivée du SECRET_KEY applicatif via SHA-256 — pas besoin
d'une variable d'environnement supplémentaire.

Backward-compat : si decrypt_secret() reçoit une valeur qui n'est pas du
Fernet valide (ancienne clé stockée en clair), elle la retourne telle quelle.
"""
from __future__ import annotations
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    from app.config import settings
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: str) -> str:
    """Chiffre une chaîne et retourne le token Fernet (str)."""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(cipher: str) -> str:
    """Déchiffre un token Fernet. Retourne la valeur brute si ce n'est pas du Fernet (backward-compat)."""
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except (InvalidToken, Exception):
        return cipher
