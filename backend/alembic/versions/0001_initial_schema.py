"""Initial schema — toutes les tables be.CLEAR

Revision ID: 0001
Revises:
Create Date: 2026-05-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extensions PostgreSQL ───────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # ── role ────────────────────────────────────────────────
    op.create_table(
        "role",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("valeur", sa.String(20), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
        sa.CheckConstraint("valeur IN ('ADMIN','EDITEUR','LECTEUR')", name="ck_role_valeur"),
    )

    # ── tuser ───────────────────────────────────────────────
    op.create_table(
        "tuser",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("valeur", sa.String(50), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
    )

    # ── cla ─────────────────────────────────────────────────
    op.create_table(
        "cla",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(255), nullable=False, unique=True),
        sa.Column("comportement", sa.Text, nullable=True),
        sa.Column("visuel_type", sa.String(10), nullable=True),
        sa.Column("visuel_valeur", sa.String(500), nullable=True),
        sa.Column("super_classe_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="SET NULL"), nullable=True),
        sa.Column("props_resolues", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
    )

    # ── prop ────────────────────────────────────────────────
    op.create_table(
        "prop",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("cla_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nom", sa.String(255), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("valeurs_liste", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
        sa.UniqueConstraint("cla_id", "nom", name="uq_prop_cla_nom"),
    )

    # ── torg ────────────────────────────────────────────────
    op.create_table(
        "torg",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(255), nullable=False),
        sa.Column("cla_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("torg.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("chemin", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
    )

    # ── tenv ────────────────────────────────────────────────
    op.create_table(
        "tenv",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(255), nullable=False),
        sa.Column("cla_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("tenv.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("chemin", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
    )

    # ── teng ────────────────────────────────────────────────
    op.create_table(
        "teng",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(255), nullable=False, unique=True),
        sa.Column("cla_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
    )

    # ── tevent ──────────────────────────────────────────────
    op.create_table(
        "tevent",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(255), nullable=False, unique=True),
        sa.Column("cla_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("duree_prevue_valeur", sa.Numeric(10, 3), nullable=True),
        sa.Column("duree_prevue_unite", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
        sa.CheckConstraint(
            "duree_prevue_unite IN ('secondes','minutes','heures','jours','mois')",
            name="ck_tevent_unite",
        ),
    )

    # ── obj ─────────────────────────────────────────────────
    op.create_table(
        "obj",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("uid", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("nom", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("cla_id", sa.Integer, sa.ForeignKey("cla.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("search_vector", postgresql.TSVECTOR, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, nullable=True),
        sa.Column("updated_by_id", sa.Integer, nullable=True),
    )
    op.create_index("ix_obj_search_vector", "obj", ["search_vector"], postgresql_using="gin")

    # ── user ────────────────────────────────────────────────
    # org_id nullable ici — FK ajoutée après création de org
    op.create_table(
        "user",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tuser_id", sa.Integer, sa.ForeignKey("tuser.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("role_id", sa.Integer, sa.ForeignKey("role.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("org_id", sa.Integer, nullable=True),   # FK ajoutée après
        sa.Column("auth_uid", sa.String(500), nullable=True, unique=True),
        sa.Column("est_actif", sa.Boolean, nullable=False, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )

    # ── org ─────────────────────────────────────────────────
    op.create_table(
        "org",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("torg_id", sa.Integer, sa.ForeignKey("torg.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )

    # FK user.org_id → org (ajout différé)
    op.create_foreign_key("fk_user_org", "user", "org", ["org_id"], ["id"], ondelete="SET NULL")

    # ── org_torg_history ─────────────────────────────────────
    op.create_table(
        "org_torg_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("org.id", ondelete="CASCADE"), nullable=False),
        sa.Column("torg_id", sa.Integer, sa.ForeignKey("torg.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("changed_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── env ─────────────────────────────────────────────────
    op.create_table(
        "env",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tenv_id", sa.Integer, sa.ForeignKey("tenv.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )

    # ── env_tenv_history ─────────────────────────────────────
    op.create_table(
        "env_tenv_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("env_id", sa.Integer, sa.ForeignKey("env.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenv_id", sa.Integer, sa.ForeignKey("tenv.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("changed_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── eng ─────────────────────────────────────────────────
    op.create_table(
        "eng",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("teng_id", sa.Integer, sa.ForeignKey("teng.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("date_debut", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_debut_prevue", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_fin", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_fin_prevue", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accomplissement", sa.Numeric(5, 2), nullable=True),
        sa.Column("gantt_mermaid", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )

    # ── eng_org / eng_env (many-to-many) ─────────────────────
    op.create_table(
        "eng_org",
        sa.Column("eng_id", sa.Integer, sa.ForeignKey("eng.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("org.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "eng_env",
        sa.Column("eng_id", sa.Integer, sa.ForeignKey("eng.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("env_id", sa.Integer, sa.ForeignKey("env.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── event ────────────────────────────────────────────────
    op.create_table(
        "event",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("eng_id", sa.Integer, sa.ForeignKey("eng.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tevent_id", sa.Integer, sa.ForeignKey("tevent.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("date_heure_prevue", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_heure_reelle", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_event_eng_prevue", "event", ["eng_id", "date_heure_prevue"])

    # ── value ────────────────────────────────────────────────
    op.create_table(
        "value",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prop_id", sa.Integer, sa.ForeignKey("prop.id", ondelete="CASCADE"), nullable=False),
        sa.Column("valeur_texte", sa.Text, nullable=True),
        sa.Column("valeur_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valeur_nombre", sa.Numeric(20, 6), nullable=True),
        sa.Column("valeur_bool", sa.Boolean, nullable=True),
        sa.Column("valeur_json", postgresql.JSONB, nullable=True),
        sa.Column("valeur_ref_obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("obj_id", "prop_id", name="uq_value_obj_prop"),
    )
    op.execute(
        "CREATE INDEX ix_value_texte_trgm ON value USING gin (valeur_texte gin_trgm_ops)"
    )

    # ── img ──────────────────────────────────────────────────
    op.create_table(
        "img",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chemin", sa.String(1000), nullable=False),
        sa.Column("nom_original", sa.String(500), nullable=True),
        sa.Column("est_principale", sa.Boolean, nullable=False, default=False),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_img_principale ON img (obj_id) WHERE est_principale = true"
    )

    # ── doc ──────────────────────────────────────────────────
    op.create_table(
        "doc",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chemin", sa.String(1000), nullable=False),
        sa.Column("nom_original", sa.String(500), nullable=False),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("taille_octets", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.CheckConstraint("format IN ('markdown', 'office')", name="ck_doc_format"),
    )

    # ── embedding (pgvector) ─────────────────────────────────
    op.create_table(
        "embedding",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obj_id", sa.Integer, sa.ForeignKey("obj.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("ALTER TABLE embedding ADD COLUMN vecteur vector(1536)")
    op.execute("CREATE INDEX ix_embedding_vecteur ON embedding USING hnsw (vecteur vector_cosine_ops)")

    # ── config (singleton) ───────────────────────────────────
    op.create_table(
        "config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("obsidian_vault_path", sa.String(1000), nullable=True),
        sa.Column("ollama_url", sa.String(500), nullable=True),
        sa.Column("ollama_modele", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.CheckConstraint("id = 1", name="ck_config_singleton"),
    )

    # ── llm_config ───────────────────────────────────────────
    op.create_table(
        "llm_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nom", sa.String(255), nullable=False, unique=True),
        sa.Column("fournisseur", sa.String(100), nullable=False),
        sa.Column("modele", sa.String(255), nullable=False),
        sa.Column("api_key_chiffree", sa.Text, nullable=True),
        sa.Column("est_actif", sa.Boolean, nullable=False, default=True),
        sa.Column("parametres", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )

    # ── api_token ────────────────────────────────────────────
    op.create_table(
        "api_token",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(500), nullable=False, unique=True),
        sa.Column("nom", sa.String(255), nullable=True),
        sa.Column("expire_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("est_actif", sa.Boolean, nullable=False, default=True),
        sa.Column("derniere_utilisation", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── log ──────────────────────────────────────────────────
    op.create_table(
        "log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("horodatage", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("operation", sa.String(10), nullable=False),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("entite_id", sa.Integer, nullable=True),
        sa.Column("avant", postgresql.JSONB, nullable=True),
        sa.Column("apres", postgresql.JSONB, nullable=True),
        sa.CheckConstraint("operation IN ('INSERT','UPDATE','DELETE')", name="ck_log_operation"),
    )
    op.create_index("ix_log_horodatage", "log", ["horodatage"])
    op.create_index("ix_log_table_entite", "log", ["table_name", "entite_id"])

    # ── Données initiales ────────────────────────────────────
    op.execute("""
        INSERT INTO role (id, valeur, created_at, updated_at)
        VALUES
            (1, 'ADMIN',   NOW(), NOW()),
            (2, 'EDITEUR', NOW(), NOW()),
            (3, 'LECTEUR', NOW(), NOW())
    """)
    op.execute("""
        INSERT INTO tuser (id, valeur, created_at, updated_at)
        VALUES
            (1, 'humain',  NOW(), NOW()),
            (2, 'système', NOW(), NOW()),
            (3, 'cron',    NOW(), NOW()),
            (4, 'IA',      NOW(), NOW())
    """)
    op.execute("""
        INSERT INTO config (id, ollama_url, ollama_modele, created_at, updated_at)
        VALUES (1, 'http://100.72.122.51:11434', 'qwen2.5:7b', NOW(), NOW())
    """)


def downgrade() -> None:
    for table in [
        "log", "api_token", "llm_config", "config",
        "embedding", "doc", "img", "value",
        "event", "eng_env", "eng_org", "eng",
        "env_tenv_history", "env",
        "org_torg_history", "org",
        "user", "obj",
        "tevent", "teng", "tenv", "torg",
        "prop", "cla",
        "tuser", "role",
    ]:
        op.drop_table(table)
    op.execute("DROP EXTENSION IF EXISTS vector")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
