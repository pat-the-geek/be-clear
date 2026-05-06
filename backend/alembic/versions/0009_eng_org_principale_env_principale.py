"""add org_principale_id and env_principale_id to eng

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-06
"""
import sqlalchemy as sa
from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('eng', sa.Column('org_principale_id', sa.Integer(), nullable=True))
    op.add_column('eng', sa.Column('env_principale_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_eng_org_principale', 'eng', 'org',
        ['org_principale_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_eng_env_principale', 'eng', 'env',
        ['env_principale_id'], ['id'], ondelete='SET NULL'
    )


def downgrade():
    op.drop_constraint('fk_eng_env_principale', 'eng', type_='foreignkey')
    op.drop_constraint('fk_eng_org_principale', 'eng', type_='foreignkey')
    op.drop_column('eng', 'env_principale_id')
    op.drop_column('eng', 'org_principale_id')
