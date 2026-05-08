#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# be.CLEAR — Script de build et déploiement Docker
# Usage : ./deploy.sh [--no-migrate] [--no-search-setup] [--clean]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERR]${RESET}   $*" >&2; exit 1; }

# ─── Arguments ───────────────────────────────────────────────────────────────
DO_MIGRATE=true
DO_SEARCH=true
DO_CLEAN=false

for arg in "$@"; do
  case $arg in
    --no-migrate)     DO_MIGRATE=false ;;
    --no-search-setup) DO_SEARCH=false ;;
    --clean)          DO_CLEAN=true ;;
    --help|-h)
      echo "Usage: $0 [--no-migrate] [--no-search-setup] [--clean]"
      echo ""
      echo "  --no-migrate       Ne pas lancer les migrations Alembic"
      echo "  --no-search-setup  Ne pas (re)configurer l'index Meilisearch"
      echo "  --clean            Supprimer les anciens containers/volumes avant de démarrer"
      exit 0
      ;;
    *) warn "Argument inconnu : $arg (ignoré)" ;;
  esac
done

# ─── Prérequis ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}be.CLEAR — Déploiement Docker${RESET}"
echo "─────────────────────────────────────────────"

command -v docker &>/dev/null      || error "Docker n'est pas installé ou pas dans le PATH."
docker compose version &>/dev/null || error "Le plugin 'docker compose' (v2) est requis."

# ─── Fichier .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    warn ".env absent — copie depuis .env.example"
    cp .env.example .env
    error "Éditez .env (mots de passe, clés JWT…) puis relancez le script."
  else
    error "Fichier .env introuvable et .env.example absent."
  fi
fi
success ".env trouvé"

# Charge les variables pour pouvoir les lire dans le script
set -o allexport
# shellcheck source=.env
source .env
set +o allexport

# Vérification des variables critiques
REQUIRED_VARS=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB MEILISEARCH_MASTER_KEY SECRET_KEY)
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ] || [[ "$val" == changeme* ]]; then
    error "Variable $var non définie ou toujours à la valeur par défaut dans .env."
  fi
done
success "Variables d'environnement validées"

# ─── Nettoyage optionnel ──────────────────────────────────────────────────────
if $DO_CLEAN; then
  warn "Option --clean : suppression des containers et volumes existants..."
  read -r -p "  Confirmer la suppression des données ? [o/N] " confirm
  if [[ "$confirm" =~ ^[oO]$ ]]; then
    docker compose down -v --remove-orphans
    success "Nettoyage effectué"
  else
    info "Nettoyage annulé"
  fi
fi

# ─── Build des images ─────────────────────────────────────────────────────────
info "Build des images Docker..."
docker compose build --parallel
success "Images construites"

# ─── Démarrage des services ───────────────────────────────────────────────────
info "Démarrage des services..."
docker compose up -d
success "Services démarrés"

# ─── Attente que le backend soit prêt ────────────────────────────────────────
info "Attente du backend (max 60s)..."
BACKEND_URL="http://localhost:8000/docs"
ELAPSED=0
until curl -sf "$BACKEND_URL" &>/dev/null; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [ $ELAPSED -ge 60 ]; then
    warn "Le backend ne répond pas après 60s — consultez les logs :"
    warn "  docker compose logs backend"
    break
  fi
  echo -n "."
done
echo ""
if curl -sf "$BACKEND_URL" &>/dev/null; then
  success "Backend opérationnel"
fi

# ─── Migrations Alembic ───────────────────────────────────────────────────────
# Note : les migrations sont exécutées automatiquement par l'entrypoint du container
# backend au démarrage. Cette étape force une exécution supplémentaire si demandé.
if $DO_MIGRATE; then
  info "Vérification des migrations Alembic..."
  docker compose exec -T backend alembic upgrade head
  success "Migrations vérifiées"
fi

# ─── Configuration Meilisearch ────────────────────────────────────────────────
if $DO_SEARCH; then
  info "Configuration de l'index Meilisearch..."
  MEILI_URL="http://localhost:7700"
  MEILI_KEY="$MEILISEARCH_MASTER_KEY"

  # Attente que Meilisearch soit prêt
  ELAPSED=0
  until curl -sf "$MEILI_URL/health" &>/dev/null; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    [ $ELAPSED -ge 30 ] && error "Meilisearch ne répond pas après 30s."
  done

  # Création de l'index (idempotent — ignore 409)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MEILI_URL/indexes" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $MEILI_KEY" \
    -d '{"uid":"objets","primaryKey":"id"}')
  [ "$HTTP_CODE" == "202" ] || [ "$HTTP_CODE" == "409" ] \
    || warn "Création de l'index — code HTTP inattendu : $HTTP_CODE"

  # Configuration des attributs
  curl -sf -X PATCH "$MEILI_URL/indexes/objets/settings" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $MEILI_KEY" \
    -d '{
      "searchableAttributes": ["nom","description","values_text","cla_nom"],
      "filterableAttributes": ["entity_type","cla_nom"]
    }' > /dev/null
  success "Index Meilisearch configuré"
fi

# ─── Résumé ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Deploiement termine avec succes !${RESET}"
echo "─────────────────────────────────────────────"
echo -e "  Frontend   ${CYAN}http://localhost:3000${RESET}"
echo -e "  Backend    ${CYAN}http://localhost:8000/docs${RESET}"
echo -e "  Recherche  ${CYAN}http://localhost:7700${RESET}"
echo ""
echo "  Logs        : docker compose logs -f"
echo "  Arret       : docker compose down"
echo "  Migration   : docker compose exec backend alembic upgrade head"
echo ""
