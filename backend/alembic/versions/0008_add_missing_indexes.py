"""add missing indexes for query optimization

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-02
"""
from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    # ── Filtrage principal : ORG par type, ENV par type ─────────────────
    op.create_index('ix_org_torg_id',  'org',  ['torg_id'])
    op.create_index('ix_env_tenv_id',  'env',  ['tenv_id'])

    # ── Arborescences types ──────────────────────────────────────────────
    op.create_index('ix_torg_parent_id', 'torg', ['parent_id'])
    op.create_index('ix_tenv_parent_id', 'tenv', ['parent_id'])

    # ── Héritage de classes ──────────────────────────────────────────────
    op.create_index('ix_cla_super_classe_id', 'cla', ['super_classe_id'])

    # ── Panel "mes objets" ───────────────────────────────────────────────
    op.create_index('ix_obj_created_by_id', 'obj', ['created_by_id'])

    # ── Tri alphabétique sur le nom ──────────────────────────────────────
    op.execute("CREATE INDEX ix_obj_nom ON obj (nom text_pattern_ops)")

    # ── Chargement des médias / docs d'un OBJ ───────────────────────────
    op.create_index('ix_img_obj_id', 'img', ['obj_id'])
    op.create_index('ix_doc_obj_id', 'doc', ['obj_id'])

    # ── Valeurs d'un OBJ (lookup inverse : obj_id en tête) ──────────────
    # L'unique existant est (prop_id, obj_id) — inefficace pour "tous les
    # values d'un obj". On ajoute un index non-unique sur obj_id seul.
    op.create_index('ix_value_obj_id', 'value', ['obj_id'])

    # ── Engagements : lookup inverse via les tables de jonction ─────────
    # PK existante : (org_id, eng_id) — on ajoute eng_id seul pour trouver
    # toutes les orgs d'un engagement et vice-versa.
    op.create_index('ix_eng_org_eng_id', 'eng_org', ['eng_id'])
    op.create_index('ix_eng_env_eng_id', 'eng_env', ['eng_id'])

    # ── Événements d'un engagement (eng_id déjà en position 2 du composite)
    # L'index ix_event_eng_prevue couvre (date_heure_prevue, eng_id) ce qui
    # n'est pas efficace pour filtrer par eng_id seul → index dédié.
    op.create_index('ix_event_eng_id', 'event', ['eng_id'])


def downgrade():
    op.drop_index('ix_event_eng_id',       table_name='event')
    op.drop_index('ix_eng_env_eng_id',     table_name='eng_env')
    op.drop_index('ix_eng_org_eng_id',     table_name='eng_org')
    op.drop_index('ix_value_obj_id',       table_name='value')
    op.drop_index('ix_doc_obj_id',         table_name='doc')
    op.drop_index('ix_img_obj_id',         table_name='img')
    op.execute("DROP INDEX IF EXISTS ix_obj_nom")
    op.drop_index('ix_obj_created_by_id',  table_name='obj')
    op.drop_index('ix_cla_super_classe_id', table_name='cla')
    op.drop_index('ix_tenv_parent_id',     table_name='tenv')
    op.drop_index('ix_torg_parent_id',     table_name='torg')
    op.drop_index('ix_env_tenv_id',        table_name='env')
    op.drop_index('ix_org_torg_id',        table_name='org')
