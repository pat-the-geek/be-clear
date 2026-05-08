#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# be.CLEAR — Script de build et déploiement Docker
#
# Usage : ./deploy.sh [--instance=NOM] [--no-migrate] [--no-search-setup] [--clean]
#
# Multi-instance : chaque instance est isolée (containers, volumes, réseau, ports).
#   ./deploy.sh --instance=be-clear-1   →  charge .env.be-clear-1
#   ./deploy.sh                          →  charge .env  (instance par défaut)
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
INSTANCE="beclear"
DO_MIGRATE=true
DO_SEARCH=true
DO_CLEAN=false

for arg in "$@"; do
  case $arg in
    --instance=*)       INSTANCE="${arg#*=}" ;;
    --no-migrate)       DO_MIGRATE=false ;;
    --no-search-setup)  DO_SEARCH=false ;;
    --clean)            DO_CLEAN=true ;;
    --help|-h)
      echo "Usage: $0 [--instance=NOM] [--no-migrate] [--no-search-setup] [--clean]"
      echo ""
      echo "  --instance=NOM     Nom de l'instance (défaut : beclear)"
      echo "                     Charge le fichier .env.NOM (ou .env si absent)"
      echo "  --no-migrate       Ne pas lancer les migrations Alembic"
      echo "  --no-search-setup  Ne pas (re)configurer l'index Meilisearch"
      echo "  --clean            Supprimer les anciens containers/volumes avant de démarrer"
      echo ""
      echo "Exemples :"
      echo "  $0                          # instance par défaut (beclear)"
      echo "  $0 --instance=be-clear-1    # instance nommée, charge .env.be-clear-1"
      echo "  $0 --instance=be-clear-2 --clean"
      exit 0
      ;;
    *) warn "Argument inconnu : $arg (ignoré)" ;;
  esac
done

# ─── Fichier .env de l'instance ──────────────────────────────────────────────
if [ "$INSTANCE" = "beclear" ]; then
  ENV_FILE=".env"
else
  ENV_FILE=".env.${INSTANCE}"
fi

# ─── En-tête ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}be.CLEAR — Déploiement Docker${RESET}"
echo -e "  Instance  : ${CYAN}${INSTANCE}${RESET}"
echo -e "  Env file  : ${CYAN}${ENV_FILE}${RESET}"
echo "─────────────────────────────────────────────"

# ─── Prérequis ───────────────────────────────────────────────────────────────
command -v docker &>/dev/null      || error "Docker n'est pas installé ou pas dans le PATH."
docker compose version &>/dev/null || error "Le plugin 'docker compose' (v2) est requis."

# ─── Fichier .env ────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  if [ -f .env.example ]; then
    warn "${ENV_FILE} absent — copie depuis .env.example"
    cp .env.example "$ENV_FILE"
    error "Éditez ${ENV_FILE} (mots de passe, clés JWT, ports…) puis relancez le script."
  else
    error "Fichier ${ENV_FILE} introuvable et .env.example absent."
  fi
fi
success "${ENV_FILE} trouvé"

# Charge les variables pour pouvoir les lire dans le script
set -o allexport
# shellcheck source=.env
source "$ENV_FILE"
set +o allexport

# Vérification des variables critiques
REQUIRED_VARS=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB MEILISEARCH_MASTER_KEY SECRET_KEY)
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ] || [[ "$val" == changeme* ]]; then
    error "Variable $var non définie ou toujours à la valeur par défaut dans ${ENV_FILE}."
  fi
done
success "Variables d'environnement validées"

# Ports effectifs (après lecture du .env)
F_PORT="${FRONTEND_PORT:-3000}"
B_PORT="${BACKEND_PORT:-8000}"
M_PORT="${MEILI_PORT:-7700}"

# ─── Alias docker compose avec projet + env file ─────────────────────────────
DC="docker compose -p ${INSTANCE} --env-file ${ENV_FILE}"

# ─── Nettoyage optionnel ──────────────────────────────────────────────────────
if $DO_CLEAN; then
  warn "Option --clean : suppression des containers et volumes de l'instance ${INSTANCE}..."
  read -r -p "  Confirmer la suppression des données ? [o/N] " confirm
  if [[ "$confirm" =~ ^[oO]$ ]]; then
    $DC down -v --remove-orphans
    success "Nettoyage effectué"
  else
    info "Nettoyage annulé"
  fi
fi

# ─── Build des images ─────────────────────────────────────────────────────────
info "Build des images Docker..."
$DC build --parallel
success "Images construites"

# ─── Démarrage des services ───────────────────────────────────────────────────
info "Démarrage des services..."
$DC up -d
success "Services démarrés"

# ─── Attente que le backend soit prêt ────────────────────────────────────────
info "Attente du backend (max 60s)..."
BACKEND_URL="http://localhost:${B_PORT}/docs"
ELAPSED=0
until curl -sf "$BACKEND_URL" &>/dev/null; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [ $ELAPSED -ge 60 ]; then
    warn "Le backend ne répond pas après 60s — consultez les logs :"
    warn "  $DC logs backend"
    break
  fi
  echo -n "."
done
echo ""
if curl -sf "$BACKEND_URL" &>/dev/null; then
  success "Backend opérationnel"
fi

# ─── Migrations Alembic ───────────────────────────────────────────────────────
if $DO_MIGRATE; then
  info "Vérification des migrations Alembic..."
  $DC exec -T backend alembic upgrade head
  success "Migrations vérifiées"
fi

# ─── Configuration Meilisearch ────────────────────────────────────────────────
if $DO_SEARCH; then
  info "Configuration de l'index Meilisearch..."
  MEILI_URL="http://localhost:${M_PORT}"
  MEILI_KEY="$MEILISEARCH_MASTER_KEY"

  ELAPSED=0
  until curl -sf "$MEILI_URL/health" &>/dev/null; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    [ $ELAPSED -ge 30 ] && error "Meilisearch ne répond pas après 30s."
  done

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MEILI_URL/indexes" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $MEILI_KEY" \
    -d '{"uid":"objets","primaryKey":"id"}')
  [ "$HTTP_CODE" == "202" ] || [ "$HTTP_CODE" == "409" ] \
    || warn "Création de l'index — code HTTP inattendu : $HTTP_CODE"

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
echo -e "${BOLD}${GREEN}Déploiement terminé avec succès !${RESET}"
echo "─────────────────────────────────────────────"
echo -e "  Instance   ${CYAN}${INSTANCE}${RESET}"
echo -e "  Frontend   ${CYAN}http://localhost:${F_PORT}${RESET}"
echo -e "  Backend    ${CYAN}http://localhost:${B_PORT}/docs${RESET}"
echo -e "  Recherche  ${CYAN}http://localhost:${M_PORT}${RESET}"
echo ""
echo "  Logs        : $DC logs -f"
echo "  Arrêt       : $DC down"
echo "  Migration   : $DC exec backend alembic upgrade head"
echo ""
