"""Ajoute password_hash sur user et seed l'utilisateur admin par défaut."""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    # ── Colonne password_hash ─────────────────────────────────
    op.add_column(
        'user',
        sa.Column('password_hash', sa.Text, nullable=True),
    )

    # ── Seed : utilisateur admin ──────────────────────────────
    # Hash bcrypt de 'admin' (12 rounds) — pré-calculé pour éviter la dépendance à passlib
    admin_hash = '$2b$12$FcXIg.c/hLwWEdmTSJ2EEOkeo2NUU/S2oNrCZ0hffSgVg80wDIjAW'

    # 1. Créer une CLA de base si elle n'existe pas (id=1)
    op.execute("""
        INSERT INTO cla (nom, created_at, updated_at)
        SELECT 'Utilisateur', NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM cla WHERE id = 1)
    """)

    # 2. Créer l'OBJ pour l'utilisateur admin
    op.execute("""
        INSERT INTO obj (nom, description, uid, cla_id, created_at, updated_at)
        VALUES (
            'Administrateur',
            'Compte administrateur par défaut',
            gen_random_uuid(),
            (SELECT id FROM cla ORDER BY id LIMIT 1),
            NOW(),
            NOW()
        )
    """)

    # 3. Créer l'utilisateur admin
    #    role_id=1 (ADMIN), tuser_id=1 (humain), auth_uid='admin'
    op.execute(f"""
        INSERT INTO "user" (
            obj_id, tuser_id, role_id,
            auth_uid, password_hash, est_actif,
            created_at, updated_at
        )
        VALUES (
            (SELECT id FROM obj WHERE nom = 'Administrateur' ORDER BY id DESC LIMIT 1),
            1,
            1,
            'admin',
            '{admin_hash}',
            true,
            NOW(),
            NOW()
        )
    """)


def downgrade():
    op.execute('DELETE FROM "user" WHERE auth_uid = \'admin\'')
    op.execute("""
        DELETE FROM obj WHERE nom = 'Administrateur'
        AND id NOT IN (SELECT obj_id FROM "user")
    """)
    op.drop_column('user', 'password_hash')
