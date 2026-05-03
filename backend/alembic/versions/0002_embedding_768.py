"""Passe le vecteur d'embedding de 1536 à 768 dimensions (nomic-embed-text)."""
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE embedding DROP COLUMN IF EXISTS vecteur")
    op.execute("DROP INDEX IF EXISTS ix_embedding_vecteur")
    op.execute("ALTER TABLE embedding ADD COLUMN vecteur vector(768)")
    op.execute(
        "CREATE INDEX ix_embedding_vecteur ON embedding "
        "USING hnsw (vecteur vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade():
    op.execute("ALTER TABLE embedding DROP COLUMN IF EXISTS vecteur")
    op.execute("DROP INDEX IF EXISTS ix_embedding_vecteur")
    op.execute("ALTER TABLE embedding ADD COLUMN vecteur vector(1536)")
    op.execute("CREATE INDEX ix_embedding_vecteur ON embedding USING hnsw (vecteur vector_cosine_ops)")
