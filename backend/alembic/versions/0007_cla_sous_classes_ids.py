"""Ajoute cla.sous_classes_ids (JSONB) et calcule les valeurs initiales."""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Ajouter la colonne ─────────────────────────────────
    op.add_column(
        'cla',
        sa.Column('sous_classes_ids', sa.dialects.postgresql.JSONB, nullable=True,
                  server_default='[]'),
    )

    # ── 2. Calculer les valeurs initiales via SQL récursif ────
    # Pour chaque CLA, sous_classes_ids = soi + tous les descendants (any depth)
    op.execute("""
        WITH RECURSIVE descendants AS (
            -- Cas de base : chaque CLA est son propre descendant
            SELECT id AS root_id, id AS descendant_id
            FROM cla

            UNION ALL

            -- Récursion : les enfants des descendants
            SELECT d.root_id, c.id
            FROM cla c
            JOIN descendants d ON c.super_classe_id = d.descendant_id
        )
        UPDATE cla
        SET sous_classes_ids = (
            SELECT jsonb_agg(DISTINCT descendant_id ORDER BY descendant_id)
            FROM descendants
            WHERE root_id = cla.id
        )
    """)


def downgrade():
    op.drop_column('cla', 'sous_classes_ids')
