"""
Modèles système : CONFIG, LlmConfig, ApiToken, Log
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import AuditMixin, TimestampMixin


class Config(Base, AuditMixin):
    """Configuration globale de l'application (singleton)."""
    __tablename__ = "config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obsidian_vault_path: Mapped[Optional[str]] = mapped_column(String(1000))
    ollama_url: Mapped[Optional[str]] = mapped_column(String(500))
    ollama_modele: Mapped[Optional[str]] = mapped_column(String(255))

    # Auth externe OIDC
    oidc_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    oidc_issuer_url: Mapped[Optional[str]] = mapped_column(String(500))
    oidc_client_id: Mapped[Optional[str]] = mapped_column(String(255))
    oidc_client_secret_chiffre: Mapped[Optional[str]] = mapped_column(Text)
    oidc_scopes: Mapped[Optional[str]] = mapped_column(String(255), default="openid email profile")
    oidc_allow_local_login: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")

    __table_args__ = (
        CheckConstraint("id = 1", name="ck_config_singleton"),
    )


class LlmConfig(Base, AuditMixin):
    """LLM distant configuré (0..n)."""
    __tablename__ = "llm_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    fournisseur: Mapped[str] = mapped_column(String(100), nullable=False)  # 'anthropic' | 'openai' | ...
    modele: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key_chiffree: Mapped[Optional[str]] = mapped_column(Text)   # chiffrée au repos
    est_actif: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    parametres: Mapped[Optional[dict]] = mapped_column(JSONB)        # température, max_tokens, etc.


class ApiToken(Base, TimestampMixin):
    """Token d'API pour les applications compagnon."""
    __tablename__ = "api_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)  # jamais le token en clair
    nom: Mapped[Optional[str]] = mapped_column(String(255))
    expire_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    est_actif: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    derniere_utilisation: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Log(Base):
    """Journal de toutes les opérations (création, modification, suppression)."""
    __tablename__ = "log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    horodatage: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("user.id", ondelete="SET NULL"))
    operation: Mapped[str] = mapped_column(String(10), nullable=False)   # INSERT | UPDATE | DELETE
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    entite_id: Mapped[Optional[int]] = mapped_column(Integer)
    avant: Mapped[Optional[dict]] = mapped_column(JSONB)                 # état avant modification
    apres: Mapped[Optional[dict]] = mapped_column(JSONB)                 # état après modification

    __table_args__ = (
        CheckConstraint("operation IN ('INSERT','UPDATE','DELETE')", name="ck_log_operation"),
    )
