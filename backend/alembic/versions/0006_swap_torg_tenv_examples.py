"""Corrige les exemples : TORG = Développement/Formation/Production/Recette,
TENV = Client/Partenaire/Fournisseur/Interne.

Idempotente : fonctionne depuis l'état produit par 0005 (installation fraîche)
ou depuis un état déjà partiellement corrigé manuellement.
"""
from alembic import op

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Vider TORG et TENV (ON CONFLICT RESTRICT → supprimer d'abord) ─────
    op.execute("DELETE FROM torg")
    op.execute("DELETE FROM tenv")

    # ── 2. Résoudre le conflit de nom "Formation" côté TENG ───────────────────
    #   Après 0005, TENG "Formation" peut pointer vers une CLA "Formation"
    #   qui n'est pas forcément sous Engagement (collision globale sur cla.nom).
    #   On force l'existence d'une CLA dédiée "Formation Engagement" sous
    #   Engagement puis on rattache explicitement TENG "Formation" à cette CLA.
    op.execute("""
        UPDATE cla
        SET nom = 'Formation Engagement', updated_at = NOW()
        WHERE nom = 'Formation'
          AND super_classe_id = (SELECT id FROM cla WHERE nom = 'Engagement')
    """)
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT 'Formation Engagement',
               (SELECT id FROM cla WHERE nom = 'Engagement'),
               NOW(), NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM cla WHERE nom = 'Formation Engagement'
        )
    """)
    op.execute("""
        UPDATE teng
        SET cla_id = (
            SELECT id FROM cla
            WHERE nom = 'Formation Engagement'
              AND super_classe_id = (SELECT id FROM cla WHERE nom = 'Engagement')
        )
        WHERE nom = 'Formation'
    """)

    # ── 3. Repositionner les CLAs des exemples (sans suppression destructive) ─
    #   On évite DELETE pour ne pas casser si ces CLAs sont encore référencées
    #   (cas réel : FK de teng/obj/... en base partiellement migrée).
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom,
               (SELECT id FROM cla WHERE nom = 'Organisation'),
               NOW(), NOW()
        FROM (VALUES
            ('Développement'),
            ('Formation'),
            ('Production'),
            ('Recette')
        ) AS t(nom)
        ON CONFLICT (nom)
        DO UPDATE SET
            super_classe_id = EXCLUDED.super_classe_id,
            updated_at = NOW()
    """)

    # ── 4. TORG ───────────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO torg (nom, cla_id, created_at, updated_at)
        SELECT t.nom, c.id, NOW(), NOW()
        FROM (VALUES
            ('Développement'),
            ('Formation'),
            ('Production'),
            ('Recette')
        ) AS t(nom)
        JOIN cla c ON c.nom = t.nom
        WHERE NOT EXISTS (SELECT 1 FROM torg WHERE torg.nom = t.nom)
    """)

    # ── 5. CLAs TENV (sous-classes d'Environnement) ───────────────────────────
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom,
               (SELECT id FROM cla WHERE nom = 'Environnement'),
               NOW(), NOW()
        FROM (VALUES
            ('Client'),
            ('Partenaire'),
            ('Fournisseur'),
            ('Interne')
        ) AS t(nom)
        ON CONFLICT (nom)
        DO UPDATE SET
            super_classe_id = EXCLUDED.super_classe_id,
            updated_at = NOW()
    """)

    # ── 6. TENV ───────────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO tenv (nom, cla_id, created_at, updated_at)
        SELECT t.nom, c.id, NOW(), NOW()
        FROM (VALUES
            ('Client'),
            ('Partenaire'),
            ('Fournisseur'),
            ('Interne')
        ) AS t(nom)
        JOIN cla c ON c.nom = t.nom
        WHERE NOT EXISTS (SELECT 1 FROM tenv WHERE tenv.nom = t.nom)
    """)


def downgrade():
    # Vider TORG et TENV corrects
    op.execute("DELETE FROM torg")
    op.execute("DELETE FROM tenv")

    # Supprimer les sous-CLAs d'Organisation et Environnement
    op.execute("""
        DELETE FROM cla
        WHERE super_classe_id IN (
            SELECT id FROM cla WHERE nom IN ('Organisation', 'Environnement')
        )
    """)

    # Remettre "Formation Engagement" → "Formation" (CLA de TENG)
    op.execute("""
        UPDATE cla
        SET nom = 'Formation', updated_at = NOW()
        WHERE nom = 'Formation Engagement'
          AND super_classe_id = (SELECT id FROM cla WHERE nom = 'Engagement')
    """)

    # Recréer l'état 0005 (TORG = Client/Partenaire/Fournisseur/Interne)
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom,
               (SELECT id FROM cla WHERE nom = 'Organisation'),
               NOW(), NOW()
        FROM (VALUES
            ('Client'), ('Partenaire'), ('Fournisseur'), ('Interne')
        ) AS t(nom)
        ON CONFLICT (nom) DO NOTHING
    """)
    op.execute("""
        INSERT INTO torg (nom, cla_id, created_at, updated_at)
        SELECT t.nom, c.id, NOW(), NOW()
        FROM (VALUES
            ('Client'), ('Partenaire'), ('Fournisseur'), ('Interne')
        ) AS t(nom)
        JOIN cla c ON c.nom = t.nom
        WHERE NOT EXISTS (SELECT 1 FROM torg WHERE torg.nom = t.nom)
    """)

    # Recréer l'état 0005 (TENV = Production/Recette/Développement/Formation)
    op.execute("""
        INSERT INTO cla (nom, super_classe_id, created_at, updated_at)
        SELECT t.nom,
               (SELECT id FROM cla WHERE nom = 'Environnement'),
               NOW(), NOW()
        FROM (VALUES
            ('Production'), ('Recette'), ('Développement'), ('Formation')
        ) AS t(nom)
        ON CONFLICT (nom) DO NOTHING
    """)
    op.execute("""
        INSERT INTO tenv (nom, cla_id, created_at, updated_at)
        SELECT t.nom, c.id, NOW(), NOW()
        FROM (VALUES
            ('Production'), ('Recette'), ('Développement'), ('Formation')
        ) AS t(nom)
        JOIN cla c ON c.nom = t.nom
        WHERE NOT EXISTS (SELECT 1 FROM tenv WHERE tenv.nom = t.nom)
    """)
