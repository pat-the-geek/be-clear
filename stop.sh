#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# be.CLEAR — Arrêt des services
# Les données (volumes) sont conservées.
# Pour tout supprimer : docker compose down -v
# ─────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▸${RESET} $*"; }
success() { echo -e "${GREEN}✓${RESET} $*"; }
error()   { echo -e "${RED}✗${RESET} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}be.CLEAR — Arrêt${RESET}"
echo "──────────────────────────────────────"

command -v docker &>/dev/null \
  || error "Docker n'est pas dans le PATH."

docker info &>/dev/null 2>&1 \
  || error "Docker daemon non démarré."

info "Arrêt des services..."
docker compose down

echo ""
success "Services arrêtés. Les données sont conservées."
echo ""
echo "  Relancer   : ./start.sh"
echo "  Déployer   : ./deploy.sh"
echo "  Tout supprimer (données incluses) : docker compose down -v"
echo ""
