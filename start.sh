#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# be.CLEAR — Démarrage rapide (usage quotidien, sans rebuild)
# Pour le premier déploiement ou une mise à jour : ./deploy.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▸${RESET} $*"; }
success() { echo -e "${GREEN}✓${RESET} $*"; }
warn()    { echo -e "${YELLOW}!${RESET} $*"; }
error()   { echo -e "${RED}✗${RESET} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}be.CLEAR — Démarrage${RESET}"
echo "──────────────────────────────────────"

# ─── Prérequis ───────────────────────────────────────────────

command -v docker &>/dev/null \
  || error "Docker n'est pas installé ou pas dans le PATH."

docker compose version &>/dev/null \
  || error "Plugin 'docker compose' (v2) requis."

# ─── Docker daemon ───────────────────────────────────────────

if ! docker info &>/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    info "Docker Desktop non démarré — lancement en cours..."
    open -a Docker
    elapsed=0
    until docker info &>/dev/null 2>&1; do
      sleep 3; elapsed=$((elapsed + 3))
      echo -n "."
      [ $elapsed -ge 60 ] && { echo ""; error "Docker Desktop ne démarre pas après 60s."; }
    done
    echo ""
    success "Docker Desktop prêt"
  else
    error "Docker daemon non démarré. Lancez-le avec : sudo systemctl start docker"
  fi
fi

[ -f .env ] || error "Fichier .env introuvable — lancez d'abord ./deploy.sh"

# ─── Démarrage ───────────────────────────────────────────────

info "Démarrage des services..."
docker compose up -d

# ─── Vérification santé ──────────────────────────────────────

info "Vérification des services (max 30s)..."

check_ready() {
  local name="$1" url="$2" elapsed=0
  until curl -sf "$url" &>/dev/null; do
    sleep 2; elapsed=$((elapsed + 2))
    [ $elapsed -ge 30 ] && { warn "$name ne répond pas après 30s — vérifiez : docker compose logs $name"; return 1; }
  done
  success "$name opérationnel"
}

check_ready "backend"  "http://localhost:8000/docs"
check_ready "frontend" "http://localhost:3000"

# ─── Résumé ──────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}be.CLEAR est démarré${RESET}"
echo "──────────────────────────────────────"
echo -e "  Application  ${CYAN}http://localhost:3000${RESET}"
echo -e "  API / Swagger  ${CYAN}http://localhost:8000/docs${RESET}"
echo -e "  Meilisearch  ${CYAN}http://localhost:7700${RESET}"
echo ""
echo "  Logs : docker compose logs -f"
echo "  Stop : ./stop.sh"
echo ""
