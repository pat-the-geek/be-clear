"""
Partie Activité : TORG, TENV, TENG, TEVENT, TUSER, ROLE,
                  ORG, ENV, ENG, EVENT, USER et tables de liaison
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Integer, String, Text, Boolean, Numeric, DateTime,
    ForeignKey, UniqueConstraint, CheckConstraint, Index, Table, Column
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import AuditMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.object import Obj, Cla


# ─────────────────────────────────────────────
# TYPES (listes / arborescences)
# ─────────────────────────────────────────────

class Torg(Base, AuditMixin):
    """Type d'Organisation — arborescence."""
    __tablename__ = "torg"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    cla_id: Mapped[int] = mapped_column(Integer, ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("torg.id", ondelete="RESTRICT"), nullable=True)
    chemin: Mapped[Optional[str]] = mapped_column(Text)  # ex: "/1/4/7/" dénormalisé

    cla: Mapped["Cla"] = relationship("Cla")
    parent: Mapped[Optional["Torg"]] = relationship("Torg", remote_side="Torg.id", back_populates="enfants")
    enfants: Mapped[list["Torg"]] = relationship("Torg", back_populates="parent")
    orgs: Mapped[list["Org"]] = relationship("Org", back_populates="torg")


class Tenv(Base, AuditMixin):
    """Type d'Environnement — arborescence."""
    __tablename__ = "tenv"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    cla_id: Mapped[int] = mapped_column(Integer, ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("tenv.id", ondelete="RESTRICT"), nullable=True)
    chemin: Mapped[Optional[str]] = mapped_column(Text)

    cla: Mapped["Cla"] = relationship("Cla")
    parent: Mapped[Optional["Tenv"]] = relationship("Tenv", remote_side="Tenv.id", back_populates="enfants")
    enfants: Mapped[list["Tenv"]] = relationship("Tenv", back_populates="parent")
    envs: Mapped[list["Env"]] = relationship("Env", back_populates="tenv")


class Teng(Base, AuditMixin):
    """Type d'Engagement — liste plate."""
    __tablename__ = "teng"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    cla_id: Mapped[int] = mapped_column(Integer, ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False)

    cla: Mapped["Cla"] = relationship("Cla")
    engs: Mapped[list["Eng"]] = relationship("Eng", back_populates="teng")
    tevent_templates: Mapped[list["TengTeventTemplate"]] = relationship(
        "TengTeventTemplate", back_populates="teng",
        cascade="all, delete-orphan",
        order_by="TengTeventTemplate.ordre",
    )


class Tevent(Base, AuditMixin):
    """Type d'Évènement — liste plate — porte la durée prévue par défaut."""
    __tablename__ = "tevent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    cla_id: Mapped[int] = mapped_column(Integer, ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False)
    duree_prevue_valeur: Mapped[Optional[float]] = mapped_column(Numeric(10, 3))
    duree_prevue_unite: Mapped[Optional[str]] = mapped_column(String(20))  # secondes|minutes|heures|jours|mois

    cla: Mapped["Cla"] = relationship("Cla")
    events: Mapped[list["Event"]] = relationship("Event", back_populates="tevent")

    __table_args__ = (
        CheckConstraint(
            "duree_prevue_unite IN ('secondes','minutes','heures','jours','mois')",
            name="ck_tevent_unite"
        ),
    )


class TengTeventTemplate(Base, AuditMixin):
    """Template d'EVENTs pour un TENG — liste ordonnée de TEVENT à créer automatiquement."""
    __tablename__ = "teng_tevent_template"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    teng_id: Mapped[int] = mapped_column(Integer, ForeignKey("teng.id", ondelete="CASCADE"), nullable=False)
    tevent_id: Mapped[int] = mapped_column(Integer, ForeignKey("tevent.id", ondelete="CASCADE"), nullable=False)
    ordre: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    teng: Mapped["Teng"] = relationship("Teng", back_populates="tevent_templates")
    tevent: Mapped["Tevent"] = relationship("Tevent")

    __table_args__ = (
        UniqueConstraint("teng_id", "ordre", name="uq_teng_template_ordre"),
    )


class Tuser(Base, AuditMixin):
    """Type d'Utilisateur — liste plate (classificateur de nature uniquement)."""
    __tablename__ = "tuser"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    valeur: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    # ex: 'humain', 'système', 'cron', 'IA'

    users: Mapped[list["User"]] = relationship("User", back_populates="tuser", foreign_keys="[User.tuser_id]")


class Role(Base, AuditMixin):
    """Rôle d'un USER humain."""
    __tablename__ = "role"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    valeur: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    # ADMIN | EDITEUR | LECTEUR

    __table_args__ = (
        CheckConstraint("valeur IN ('ADMIN','EDITEUR','LECTEUR')", name="ck_role_valeur"),
    )


# ─────────────────────────────────────────────
# TABLES DE LIAISON (many-to-many)
# ─────────────────────────────────────────────

eng_org = Table(
    "eng_org",
    Base.metadata,
    Column("eng_id", Integer, ForeignKey("eng.id", ondelete="CASCADE"), primary_key=True),
    Column("org_id", Integer, ForeignKey("org.id", ondelete="CASCADE"), primary_key=True),
)

eng_env = Table(
    "eng_env",
    Base.metadata,
    Column("eng_id", Integer, ForeignKey("eng.id", ondelete="CASCADE"), primary_key=True),
    Column("env_id", Integer, ForeignKey("env.id", ondelete="CASCADE"), primary_key=True),
)


# ─────────────────────────────────────────────
# ENTITÉS MÉTIER
# ─────────────────────────────────────────────

class Org(Base, AuditMixin):
    """Organisation."""
    __tablename__ = "org"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True)
    torg_id: Mapped[int] = mapped_column(Integer, ForeignKey("torg.id", ondelete="RESTRICT"), nullable=False)

    obj: Mapped["Obj"] = relationship("Obj")
    torg: Mapped["Torg"] = relationship("Torg", back_populates="orgs")
    users: Mapped[list["User"]] = relationship("User", back_populates="org", foreign_keys="[User.org_id]")
    engs: Mapped[list["Eng"]] = relationship("Eng", secondary=eng_org, back_populates="orgs")
    torg_history: Mapped[list["OrgTorgHistory"]] = relationship("OrgTorgHistory", back_populates="org", cascade="all, delete-orphan")


class OrgTorgHistory(Base, TimestampMixin):
    """Historique des changements de TORG d'une ORG."""
    __tablename__ = "org_torg_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("org.id", ondelete="CASCADE"), nullable=False)
    torg_id: Mapped[int] = mapped_column(Integer, ForeignKey("torg.id", ondelete="RESTRICT"), nullable=False)
    date_debut: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    date_fin: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    changed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("user.id", ondelete="SET NULL"))

    org: Mapped["Org"] = relationship("Org", back_populates="torg_history")
    torg: Mapped["Torg"] = relationship("Torg")


class Env(Base, AuditMixin):
    """Environnement."""
    __tablename__ = "env"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True)
    tenv_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenv.id", ondelete="RESTRICT"), nullable=False)

    obj: Mapped["Obj"] = relationship("Obj")
    tenv: Mapped["Tenv"] = relationship("Tenv", back_populates="envs")
    engs: Mapped[list["Eng"]] = relationship("Eng", secondary=eng_env, back_populates="envs")
    tenv_history: Mapped[list["EnvTenvHistory"]] = relationship("EnvTenvHistory", back_populates="env", cascade="all, delete-orphan")


class EnvTenvHistory(Base, TimestampMixin):
    """Historique des changements de TENV d'un ENV."""
    __tablename__ = "env_tenv_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    env_id: Mapped[int] = mapped_column(Integer, ForeignKey("env.id", ondelete="CASCADE"), nullable=False)
    tenv_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenv.id", ondelete="RESTRICT"), nullable=False)
    date_debut: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    date_fin: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    changed_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("user.id", ondelete="SET NULL"))

    env: Mapped["Env"] = relationship("Env", back_populates="tenv_history")
    tenv: Mapped["Tenv"] = relationship("Tenv")


class Eng(Base, AuditMixin):
    """Engagement — interaction entre 1..n ORG et 1..n ENV."""
    __tablename__ = "eng"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True)
    teng_id: Mapped[int] = mapped_column(Integer, ForeignKey("teng.id", ondelete="RESTRICT"), nullable=False)

    date_debut: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_debut_prevue: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_fin: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    date_fin_prevue: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # calculé

    # Dénormalisation calculée depuis les EVENTs
    accomplissement: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))  # 0.00 → 100.00
    gantt_mermaid: Mapped[Optional[str]] = mapped_column(Text)               # diagramme généré

    org_principale_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("org.id", ondelete="SET NULL"), nullable=True)
    env_principale_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("env.id", ondelete="SET NULL"), nullable=True)

    obj: Mapped["Obj"] = relationship("Obj")
    teng: Mapped["Teng"] = relationship("Teng", back_populates="engs")
    orgs: Mapped[list["Org"]] = relationship("Org", secondary=eng_org, back_populates="engs")
    envs: Mapped[list["Env"]] = relationship("Env", secondary=eng_env, back_populates="engs")
    org_principale: Mapped[Optional["Org"]] = relationship("Org", foreign_keys=[org_principale_id])
    env_principale: Mapped[Optional["Env"]] = relationship("Env", foreign_keys=[env_principale_id])
    events: Mapped[list["Event"]] = relationship(
        "Event", back_populates="eng",
        cascade="all, delete-orphan",
        order_by="Event.date_heure_prevue"
    )


class Event(Base, AuditMixin):
    """Évènement — unité atomique d'un ENG."""
    __tablename__ = "event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True)
    eng_id: Mapped[int] = mapped_column(Integer, ForeignKey("eng.id", ondelete="CASCADE"), nullable=False)
    tevent_id: Mapped[int] = mapped_column(Integer, ForeignKey("tevent.id", ondelete="RESTRICT"), nullable=False)

    date_heure_prevue: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    date_heure_reelle: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))  # NULL = non accompli

    obj: Mapped["Obj"] = relationship("Obj")
    eng: Mapped["Eng"] = relationship("Eng", back_populates="events")
    tevent: Mapped["Tevent"] = relationship("Tevent", back_populates="events")

    __table_args__ = (
        Index("ix_event_eng_prevue", "eng_id", "date_heure_prevue"),
    )

    __mapper_args__ = {"confirm_deleted_rows": False}

    @property
    def est_accompli(self) -> bool:
        return self.date_heure_reelle is not None


class User(Base, AuditMixin):
    """Utilisateur du système."""
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    obj_id: Mapped[int] = mapped_column(Integer, ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True)
    tuser_id: Mapped[int] = mapped_column(Integer, ForeignKey("tuser.id", ondelete="RESTRICT"), nullable=False)
    role_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("role.id", ondelete="RESTRICT"), nullable=True)
    org_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("org.id", ondelete="SET NULL"), nullable=True)

    # Identifiant technique externe (LDAP, OAuth...)
    auth_uid: Mapped[Optional[str]] = mapped_column(String(500), unique=True)
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    est_actif: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    obj: Mapped["Obj"] = relationship("Obj", foreign_keys="[User.obj_id]")
    tuser: Mapped["Tuser"] = relationship("Tuser", back_populates="users", foreign_keys="[User.tuser_id]")
    role: Mapped[Optional["Role"]] = relationship("Role", foreign_keys="[User.role_id]")
    org: Mapped[Optional["Org"]] = relationship("Org", back_populates="users", foreign_keys="[User.org_id]")

    @property
    def nom(self) -> str:
        """Nom de l'utilisateur — extrait de son OBJ identité."""
        return self.obj.nom if self.obj else ""
