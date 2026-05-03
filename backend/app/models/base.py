"""
Mixins communs à tous les modèles be.CLEAR.
"""
from datetime import datetime, timezone
from sqlalchemy import Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, declared_attr


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Champs created_at / updated_at automatiques."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class AuditMixin(TimestampMixin):
    """Champs d'audit : who created / updated."""
    @declared_attr
    def created_by_id(cls) -> Mapped[int | None]:
        return mapped_column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)

    @declared_attr
    def updated_by_id(cls) -> Mapped[int | None]:
        return mapped_column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
