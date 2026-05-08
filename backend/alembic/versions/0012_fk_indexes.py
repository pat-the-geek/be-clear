"""Index sur les FK sans couverture : value.prop_id et obj.cla_id

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-08
"""
from alembic import op

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade():
    # value.prop_id — FK sans index autonome.
    # La contrainte uq_value_obj_prop (obj_id, prop_id) couvre les requêtes
    # filtrées par obj_id, mais pas les scans par prop_id seul (ex. : CASCADE
    # DELETE sur prop → séquentialite de toute la table value sans cet index).
    op.create_index('ix_value_prop_id', 'value', ['prop_id'])

    # obj.cla_id — FK sans index autonome.
    # Utilisé par joinedload(Obj.cla) côté inverse (ex. : suppression d'une CLA
    # → scan obj pour prop cascade), et pour les requêtes futures filtrant par
    # classe.
    op.create_index('ix_obj_cla_id', 'obj', ['cla_id'])


def downgrade():
    op.drop_index('ix_obj_cla_id', table_name='obj')
    op.drop_index('ix_value_prop_id', table_name='value')
