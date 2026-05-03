"""Seed des types de base : CLA, TORG, TENV, TENG, TEVENT."""
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade():
    # ── CLAs de base ──────────────────────────────────────────
    op.execute("""
        INSERT INTO cla (nom, created_at, updated_at)
        VALUES
            ('Organisation', NOW(), NOW()),
            ('Environnement', NOW(), NOW()),
            ('Engagement',    NOW(), NOW()),
            ('Événement',     NOW(), NOW())
        ON CONFLICT (nom) DO NOTHING
    """)

    # ── TORG ──────────────────────────────────────────────────
    op.execute("""
        INSERT INTO torg (nom, cla_id, created_at, updated_at)
        SELECT nom, (SELECT id FROM cla WHERE nom = 'Organisation'), NOW(), NOW()
        FROM (VALUES
            ('Client'),
            ('Partenaire'),
            ('Fournisseur'),
            ('Interne')
        ) AS t(nom)
        WHERE NOT EXISTS (SELECT 1 FROM torg WHERE torg.nom = t.nom)
    """)

    # ── TENV ──────────────────────────────────────────────────
    op.execute("""
        INSERT INTO tenv (nom, cla_id, created_at, updated_at)
        SELECT nom, (SELECT id FROM cla WHERE nom = 'Environnement'), NOW(), NOW()
        FROM (VALUES
            ('Production'),
            ('Recette'),
            ('Développement'),
            ('Formation')
        ) AS t(nom)
        WHERE NOT EXISTS (SELECT 1 FROM tenv WHERE tenv.nom = t.nom)
    """)

    # ── TENG ──────────────────────────────────────────────────
    op.execute("""
        INSERT INTO teng (nom, cla_id, created_at, updated_at)
        SELECT nom, (SELECT id FROM cla WHERE nom = 'Engagement'), NOW(), NOW()
        FROM (VALUES
            ('Projet'),
            ('Support'),
            ('Formation'),
            ('Audit')
        ) AS t(nom)
        WHERE NOT EXISTS (SELECT 1 FROM teng WHERE teng.nom = t.nom)
    """)

    # ── TEVENT ────────────────────────────────────────────────
    op.execute("""
        INSERT INTO tevent (nom, cla_id, duree_prevue_valeur, duree_prevue_unite, created_at, updated_at)
        SELECT nom, (SELECT id FROM cla WHERE nom = 'Événement'), duree, unite, NOW(), NOW()
        FROM (VALUES
            ('Réunion de lancement',  2,   'heures'),
            ('Point d''avancement',   1,   'heures'),
            ('Livraison',             1,   'jours'),
            ('Validation',            2,   'heures'),
            ('Clôture',               1,   'heures')
        ) AS t(nom, duree, unite)
        WHERE NOT EXISTS (SELECT 1 FROM tevent WHERE tevent.nom = t.nom)
    """)


def downgrade():
    op.execute("DELETE FROM tevent WHERE nom IN ('Réunion de lancement','Point d''avancement','Livraison','Validation','Clôture')")
    op.execute("DELETE FROM teng WHERE nom IN ('Projet','Support','Formation','Audit')")
    op.execute("DELETE FROM tenv WHERE nom IN ('Production','Recette','Développement','Formation')")
    op.execute("DELETE FROM torg WHERE nom IN ('Client','Partenaire','Fournisseur','Interne')")
    op.execute("DELETE FROM cla WHERE nom IN ('Organisation','Environnement','Engagement','Événement')")
