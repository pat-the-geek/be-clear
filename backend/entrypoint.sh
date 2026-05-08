#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# be.CLEAR — Entrypoint Docker (backend)
#
# 1. Attendre que PostgreSQL soit prêt (max 60 s)
# 2. Appliquer les migrations Alembic (idempotent)
# 3. Démarrer uvicorn — le seed BDD s'exécute dans le lifespan FastAPI
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── Attente PostgreSQL ──────────────────────────────────────────────────────
echo "[entrypoint] Attente de PostgreSQL..."
ELAPSED=0
until pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -q; do
    ELAPSED=$((ELAPSED + 2))
    if [ "$ELAPSED" -ge 60 ]; then
        echo "[entrypoint] PostgreSQL non disponible après 60s — abandon."
        exit 1
    fi
    sleep 2
done
echo "[entrypoint] PostgreSQL prêt."

# ── Migrations Alembic ─────────────────────────────────────────────────────
echo "[entrypoint] Application des migrations Alembic..."
alembic upgrade head
echo "[entrypoint] Migrations OK."

# ── Démarrage de l'application ─────────────────────────────────────────────
echo "[entrypoint] Démarrage de be.CLEAR backend..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
