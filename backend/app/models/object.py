"""
Partie Objet : CLA, PROP, OBJ, VALUE, IMG, DOC
"""
from __future__ import annotations
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Integer, String, Text, Boolean, Numeric, DateTime,
    ForeignKey, UniqueConstraint, CheckConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import AuditMixin

if TYPE_CHECKING:
    from app.models.activity import Org, Env, Eng, Event, User


class Cla(Base, AuditMixin):
    """Classe — définit le schéma de PROP d'un OBJ."""
    __tablename__ = "cla"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    comportement: Mapped[Optional[str]] = mapped_column(Text)           # Markdown
    visuel_type: Mapped[Optional[str]] = mapped_column(String(10))      # 'icone' | 'image'
    visuel_valeur: Mapped[Optional[str]] = mapped_column(String(500))   # nom icône ou chemin image

    # Héritage simple
    super_classe_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("cla.id", ondelete="SET NULL"), nullable=True
    )

    # Relations
    super_classe: Mapped[Optional["Cla"]] = relationship("Cla", remote_side="Cla.id", back_populates="sous_classes")
    sous_classes: Mapped[list["Cla"]] = relationship("Cla", back_populates="super_classe")
    props: Mapped[list["Prop"]] = relationship("Prop", back_populates="cla", cascade="all, delete-orphan")
    objets: Mapped[list["Obj"]] = relationship("Obj", back_populates="cla")

    # Dénormalisation : liste des PROP résolues (propres + héritées) en cache
    props_resolues: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Dénormalisation : liste de tous les IDs de sous-classes (soi inclus) — pour filtrage récursif
    sous_classes_ids: Mapped[Optional[list]] = mapped_column(JSONB, default=list, server_default="[]")


class Prop(Base, AuditMixin):
    """Propriété d'une CLA."""
    __tablename__ = "prop"

    TYPES = (
        "DATE", "HEURE", "DATETIME", "DUREE",
        "TEXTE", "MARKDOWN",
        "ENTIER", "DECIMAL", "MONTANT", "POURCENTAGE",
        "BOOLEEN", "LISTE",
        "URL", "EMAIL", "TELEPHONE",
        "REFERENCE", "COORDONNEES",
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cla_id: Mapped[int] = mapped_column(Integer, ForeignKey("cla.id", ondelete="CASCADE"), nullable=False)
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Pour type LISTE : valeurs possibles en JSON ["v1","v2",...]
    valeurs_liste: Mapped[Optional[list]] = mapped_column(JSONB)

    cla: Mapped["Cla"] = relationship("Cla", back_populates="props")
    values: Mapped[list["Value"]] = relationship("Value", back_populates="prop", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("cla_id", "nom", name="uq_prop_cla_nom"),
        CheckConstraint(f"type IN {tuple(TYPES)}", name="ck_prop_type"),
    )


class Obj(Base, AuditMixin):
    """Instance — chaque ORG/ENV/ENG/EVENT/USER est relié à 1 OBJ."""
    __tablename__ = "obj"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    nom: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)  # Markdown
    cla_id: Mapped[int] = mapped_column(Integer, ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False)

    # Dénormalisation full-text
    search_vector: Mapped[Optional[object]] = mapped_column(TSVECTOR)

    cla: Mapped["Cla"] = relationship("Cla", back_populates="objets")
    values: Mapped[list["Value"]] = relationship("Value", back_populates="obj", cascade="all, delete-orphan", foreign_keys="[Value.obj_id]")
    images: Mapped[list["Img"]] = relationship("Img", back_populates="obj", cascade="all, delete-orphan")
    documents: Mapped[list["Doc"]] = relationship("Doc", back_populates="obj", cascade="all, delete-orphan")
    embedding: Mapped[Optional["Embedding"]] = relationship("Embedding", back_populates="obj", uselist=False, cascade="all, delete-orphan")
    # Audit : utilisateurs créateur / modificateur (chargement explicite requis)
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys="[Obj.created_by_id]", lazy="raise")
    updated_by: Mapped[Optional["User"]] = relationship("User", foreign_keys="[Obj.updated_by_id]", lazy="raise")

    __table_args__ = (
        Index("ix_obj_search_vector", "search_vector", postgresql_using="gin"),
    )


class Value(Base, AuditMixin):
    """Valeur d'une PROP pour un OBJ — colonnes typées (Option C)."""
    __tablename__ = "value"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False)
    prop_id: Mapped[int] = mapped_column(Integer, ForeignKey("prop.id", ondelete="CASCADE"), nullable=False)

    # Colonnes typées — une seule renseignée selon le type de PROP
    valeur_texte: Mapped[Optional[str]] = mapped_column(Text)           # TEXTE, MARKDOWN, URL, EMAIL, TELEPHONE, LISTE
    valeur_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # DATE, HEURE, DATETIME
    valeur_nombre: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6))          # ENTIER, DECIMAL, POURCENTAGE
    valeur_bool: Mapped[Optional[bool]] = mapped_column(Boolean)                      # BOOLEEN
    valeur_json: Mapped[Optional[dict]] = mapped_column(JSONB)                        # MONTANT, DUREE, COORDONNEES
    valeur_ref_obj_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("obj.id", ondelete="SET NULL"))  # REFERENCE

    obj: Mapped["Obj"] = relationship("Obj", back_populates="values", foreign_keys=[obj_id])
    prop: Mapped["Prop"] = relationship("Prop", back_populates="values")
    ref_obj: Mapped[Optional["Obj"]] = relationship("Obj", foreign_keys=[valeur_ref_obj_id])

    __table_args__ = (
        UniqueConstraint("obj_id", "prop_id", name="uq_value_obj_prop"),
        Index("ix_value_texte_trgm", "valeur_texte", postgresql_using="gin",
              postgresql_ops={"valeur_texte": "gin_trgm_ops"}),
    )


class Img(Base, AuditMixin):
    """Image attachée à un OBJ."""
    __tablename__ = "img"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False)
    chemin: Mapped[str] = mapped_column(String(1000), nullable=False)
    nom_original: Mapped[Optional[str]] = mapped_column(String(500))
    est_principale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100))

    obj: Mapped["Obj"] = relationship("Obj", back_populates="images")

    __table_args__ = (
        # RF-17 : 1 seule image principale par OBJ (enforced en application + index partiel)
        Index("uq_img_principale", "obj_id", unique=True,
              postgresql_where="est_principale = true"),
    )


class Doc(Base, AuditMixin):
    """Document attaché à un OBJ."""
    __tablename__ = "doc"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False)
    chemin: Mapped[str] = mapped_column(String(1000), nullable=False)
    nom_original: Mapped[str] = mapped_column(String(500), nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False)  # 'markdown' | 'office'
    taille_octets: Mapped[Optional[int]] = mapped_column(Integer)

    obj: Mapped["Obj"] = relationship("Obj", back_populates="documents")

    __table_args__ = (
        CheckConstraint("format IN ('markdown', 'office')", name="ck_doc_format"),
    )


class Embedding(Base):
    """Vecteur pgvector pour le RAG (Terminal IA)."""
    __tablename__ = "embedding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True)
    # pgvector — déclaré en texte pour éviter la dépendance circulaire à l'import
    # La colonne réelle est VECTOR(1536), gérée via Alembic
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    obj: Mapped["Obj"] = relationship("Obj", back_populates="embedding")
