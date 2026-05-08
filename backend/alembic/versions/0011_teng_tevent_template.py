"""teng_tevent_template — liste ordonnée de TEVENT pour un TENG

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'teng_tevent_template',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('teng_id', sa.Integer(), sa.ForeignKey('teng.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tevent_id', sa.Integer(), sa.ForeignKey('tevent.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ordre', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('teng_id', 'ordre', name='uq_teng_template_ordre'),
    )
    op.create_index('ix_teng_tevent_template_teng', 'teng_tevent_template', ['teng_id'])


def downgrade() -> None:
    op.drop_index('ix_teng_tevent_template_teng', 'teng_tevent_template')
    op.drop_table('teng_tevent_template')
