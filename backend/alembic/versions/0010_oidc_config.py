"""Ajout des champs OIDC à la table config.

Revision ID: 0010
Revises: 0009_eng_org_principale_env_principale
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('config', sa.Column('oidc_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('config', sa.Column('oidc_issuer_url', sa.String(length=500), nullable=True))
    op.add_column('config', sa.Column('oidc_client_id', sa.String(length=255), nullable=True))
    op.add_column('config', sa.Column('oidc_client_secret_chiffre', sa.Text(), nullable=True))
    op.add_column('config', sa.Column('oidc_scopes', sa.String(length=255), nullable=True,
                                       server_default="'openid email profile'"))
    op.add_column('config', sa.Column('oidc_allow_local_login', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('config', 'oidc_allow_local_login')
    op.drop_column('config', 'oidc_scopes')
    op.drop_column('config', 'oidc_client_secret_chiffre')
    op.drop_column('config', 'oidc_client_id')
    op.drop_column('config', 'oidc_issuer_url')
    op.drop_column('config', 'oidc_enabled')
