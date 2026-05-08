#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# be.CLEAR — Entrypoint Docker (backend)
#
# 1. Attendre que PostgreSQL soit prêt (max 60 s)
# 2. Appliquer les migrations Alembic (idempotent)
# 3. Démarrer uvicorn — le seed BDD s'exécute dans le lifespan FastAPI
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── Attente PostgreSQL (check TCP via Python — pas de dépendance système) ───
echo "[entrypoint] Attente de PostgreSQL (${PGHOST:-db}:${PGPORT:-5432})..."
ELAPSED=0
until python3 - <<EOF 2>/dev/null
import socket, sys
try:
    s = socket.create_connection(("${PGHOST:-db}", int("${PGPORT:-5432}")), timeout=1)
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
EOF
do
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
