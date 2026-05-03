"""Corrige la hiérarchie CLA des TORG et TENV : chaque type reçoit sa propre sous-classe."""
from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    # ── Sous-CLAs pour chaque TORG ────────────────────────────
    # "Organisation" est la superclasse racine (id déjà en base)
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom, (SELECT id FROM cla WHERE nom = 'Organisation'), NOW(), NOW()
        FROM torg t
        WHERE NOT EXISTS (SELECT 1 FROM cla WHERE cla.nom = t.nom)
    """)

    # Chaque TORG pointe maintenant sur SA propre CLA
    op.execute("""
        UPDATE torg
        SET cla_id = (SELECT id FROM cla WHERE cla.nom = torg.nom)
        WHERE EXISTS (SELECT 1 FROM cla WHERE cla.nom = torg.nom)
    """)

    # ── Sous-CLAs pour chaque TENV ────────────────────────────
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom, (SELECT id FROM cla WHERE nom = 'Environnement'), NOW(), NOW()
        FROM tenv t
        WHERE NOT EXISTS (SELECT 1 FROM cla WHERE cla.nom = t.nom)
    """)

    op.execute("""
        UPDATE tenv
        SET cla_id = (SELECT id FROM cla WHERE cla.nom = tenv.nom)
        WHERE EXISTS (SELECT 1 FROM cla WHERE cla.nom = tenv.nom)
    """)

    # ── Sous-CLAs pour chaque TENG ────────────────────────────
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom, (SELECT id FROM cla WHERE nom = 'Engagement'), NOW(), NOW()
        FROM teng t
        WHERE NOT EXISTS (SELECT 1 FROM cla WHERE cla.nom = t.nom)
    """)

    op.execute("""
        UPDATE teng
        SET cla_id = (SELECT id FROM cla WHERE cla.nom = teng.nom)
        WHERE EXISTS (SELECT 1 FROM cla WHERE cla.nom = teng.nom)
    """)

    # ── Sous-CLAs pour chaque TEVENT ──────────────────────────
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom, (SELECT id FROM cla WHERE nom = 'Événement'), NOW(), NOW()
        FROM tevent t
        WHERE NOT EXISTS (SELECT 1 FROM cla WHERE cla.nom = t.nom)
    """)

    op.execute("""
        UPDATE tevent
        SET cla_id = (SELECT id FROM cla WHERE cla.nom = tevent.nom)
        WHERE EXISTS (SELECT 1 FROM cla WHERE cla.nom = tevent.nom)
    """)


def downgrade():
    # Remettre toutes les entités sur leurs CLAs racines
    op.execute("""
        UPDATE torg SET cla_id = (SELECT id FROM cla WHERE nom = 'Organisation')
    """)
    op.execute("""
        UPDATE tenv SET cla_id = (SELECT id FROM cla WHERE nom = 'Environnement')
    """)
    op.execute("""
        UPDATE teng SET cla_id = (SELECT id FROM cla WHERE nom = 'Engagement')
    """)
    op.execute("""
        UPDATE tevent SET cla_id = (SELECT id FROM cla WHERE nom = 'Événement')
    """)
    # Supprimer les sous-CLAs créées
    op.execute("""
        DELETE FROM cla WHERE super_classe_id IN (
            SELECT id FROM cla WHERE nom IN ('Organisation','Environnement','Engagement','Événement')
        )
        AND nom NOT IN ('Organisation','Environnement','Engagement','Événement','Utilisateur')
    """)
