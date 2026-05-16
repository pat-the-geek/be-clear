#!/usr/bin/env bash
# be.CLEAR - Full Docker restore
# Default source: latest folder in /Volumes/USB1/be.CLEAR-Backup
set -euo pipefail

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

INSTANCE="beclear"
ENV_FILE=".env"
SOURCE_BASE="/Volumes/USB1/be.CLEAR-Backup"
SOURCE_DIR=""
RESTORE_REDIS=true
AUTO_CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    --instance=*) INSTANCE="${arg#*=}" ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    --source-base=*) SOURCE_BASE="${arg#*=}" ;;
    --source-dir=*) SOURCE_DIR="${arg#*=}" ;;
    --no-redis) RESTORE_REDIS=false ;;
    --yes) AUTO_CONFIRM=true ;;
    --help|-h)
      echo "Usage: $0 [--instance=NOM] [--env-file=FICHIER] [--source-base=CHEMIN] [--source-dir=CHEMIN] [--no-redis] [--yes]"
      echo ""
      echo "  --instance=NOM        Docker compose project name (default: beclear)"
      echo "  --env-file=FICHIER    Env file to load (default: .env)"
      echo "  --source-base=CHEMIN  Backup root (default: /Volumes/USB1/be.CLEAR-Backup)"
      echo "  --source-dir=CHEMIN   Specific backup directory to restore"
      echo "  --no-redis            Skip Redis volume restore"
      echo "  --yes                 Skip confirmation prompt"
      exit 0
      ;;
    *) warn "Unknown argument ignored: $arg" ;;
  esac
done

command -v docker >/dev/null 2>&1 || error "Docker is required."
docker compose version >/dev/null 2>&1 || error "docker compose plugin is required."
[ -f "$ENV_FILE" ] || error "Missing env file: $ENV_FILE"
[ -d "$SOURCE_BASE" ] || error "Missing backup root: $SOURCE_BASE"

if [ -z "$SOURCE_DIR" ]; then
  SOURCE_DIR="$(ls -td "${SOURCE_BASE}"/beclear_full_* 2>/dev/null | head -1 || true)"
fi
[ -n "$SOURCE_DIR" ] || error "No backup folder found under: $SOURCE_BASE"
[ -d "$SOURCE_DIR" ] || error "Backup folder not found: $SOURCE_DIR"

REQUIRED_FILES=(postgres_data.dump postgres_globals.sql vol_media.tar.gz vol_meilisearch.tar.gz)
for f in "${REQUIRED_FILES[@]}"; do
  [ -f "${SOURCE_DIR}/${f}" ] || error "Missing backup file: ${SOURCE_DIR}/${f}"
done

if $RESTORE_REDIS; then
  [ -f "${SOURCE_DIR}/vol_redis.tar.gz" ] || error "Missing backup file: ${SOURCE_DIR}/vol_redis.tar.gz"
fi

set -o allexport
# shellcheck source=.env
source "$ENV_FILE"
set +o allexport

: "${POSTGRES_USER:?POSTGRES_USER missing in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB missing in $ENV_FILE}"

DC="docker compose -p ${INSTANCE} --env-file ${ENV_FILE}"

echo ""
warn "This will overwrite current data for instance: ${INSTANCE}"
echo "  - PostgreSQL database: ${POSTGRES_DB}"
echo "  - Docker volume: ${INSTANCE}_vol_media"
echo "  - Docker volume: ${INSTANCE}_vol_meilisearch"
if $RESTORE_REDIS; then
  echo "  - Docker volume: ${INSTANCE}_vol_redis"
fi
echo "  - Backup source: ${SOURCE_DIR}"
echo ""

if ! $AUTO_CONFIRM; then
  read -r -p "Confirm restore? type OUI to continue: " confirm
  [ "$confirm" = "OUI" ] || error "Restore cancelled by user."
fi

info "Stopping services"
$DC down --remove-orphans

info "Ensuring volumes exist"
docker volume create "${INSTANCE}_vol_media" >/dev/null
docker volume create "${INSTANCE}_vol_meilisearch" >/dev/null
if $RESTORE_REDIS; then
  docker volume create "${INSTANCE}_vol_redis" >/dev/null
fi

info "Restoring media volume"
docker run --rm -v "${INSTANCE}_vol_media:/to" -v "${SOURCE_DIR}:/from" alpine \
  sh -c 'rm -rf /to/* /to/.[!.]* /to/..?* 2>/dev/null || true; tar xzf /from/vol_media.tar.gz -C /to'

info "Restoring Meilisearch volume"
docker run --rm -v "${INSTANCE}_vol_meilisearch:/to" -v "${SOURCE_DIR}:/from" alpine \
  sh -c 'rm -rf /to/* /to/.[!.]* /to/..?* 2>/dev/null || true; tar xzf /from/vol_meilisearch.tar.gz -C /to'

if $RESTORE_REDIS; then
  info "Restoring Redis volume"
  docker run --rm -v "${INSTANCE}_vol_redis:/to" -v "${SOURCE_DIR}:/from" alpine \
    sh -c 'rm -rf /to/* /to/.[!.]* /to/..?* 2>/dev/null || true; tar xzf /from/vol_redis.tar.gz -C /to'
else
  warn "Redis restore skipped"
fi

info "Starting database service"
$DC up -d db

info "Waiting for PostgreSQL (max 60s)"
ELAPSED=0
until $DC exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ "$ELAPSED" -ge 60 ]; then
    error "PostgreSQL not ready after 60s"
  fi
done

info "Restoring PostgreSQL globals (roles/login)"
$DC exec -T db psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=0 < "${SOURCE_DIR}/postgres_globals.sql"

info "Resetting public schema"
$DC exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

info "Restoring PostgreSQL data"
$DC exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "${SOURCE_DIR}/postgres_data.dump"

info "Starting full stack"
$DC up -d

success "Restore complete"
echo "Source: ${SOURCE_DIR}"
$DC ps
