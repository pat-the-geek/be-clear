#!/usr/bin/env bash
# be.CLEAR - Full Docker backup
# Default destination: /Volumes/USB1/be.CLEAR-Backup
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
DEST_BASE="/Volumes/USB1/be.CLEAR-Backup"
INCLUDE_REDIS=true

for arg in "$@"; do
  case "$arg" in
    --instance=*) INSTANCE="${arg#*=}" ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    --dest=*) DEST_BASE="${arg#*=}" ;;
    --no-redis) INCLUDE_REDIS=false ;;
    --help|-h)
      echo "Usage: $0 [--instance=NOM] [--env-file=FICHIER] [--dest=CHEMIN] [--no-redis]"
      echo ""
      echo "  --instance=NOM      Docker compose project name (default: beclear)"
      echo "  --env-file=FICHIER  Env file to load (default: .env)"
      echo "  --dest=CHEMIN       Backup root destination (default: /Volumes/USB1/be.CLEAR-Backup)"
      echo "  --no-redis          Skip Redis volume archive"
      exit 0
      ;;
    *) warn "Unknown argument ignored: $arg" ;;
  esac
done

command -v docker >/dev/null 2>&1 || error "Docker is required."
docker compose version >/dev/null 2>&1 || error "docker compose plugin is required."
[ -f "$ENV_FILE" ] || error "Missing env file: $ENV_FILE"
[ -d "$DEST_BASE" ] || error "Destination does not exist: $DEST_BASE"

set -o allexport
# shellcheck source=.env
source "$ENV_FILE"
set +o allexport

: "${POSTGRES_USER:?POSTGRES_USER missing in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB missing in $ENV_FILE}"

TS="$(date +%Y%m%d_%H%M%S)"
DEST_DIR="${DEST_BASE}/beclear_full_${TS}"
mkdir -p "$DEST_DIR"

DC="docker compose -p ${INSTANCE} --env-file ${ENV_FILE}"

info "Saving runtime config"
cp "$ENV_FILE" "${DEST_DIR}/.env.backup"

info "Dumping PostgreSQL data"
$DC exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "${DEST_DIR}/postgres_data.dump"

info "Dumping PostgreSQL globals (roles/login)"
$DC exec -T db pg_dumpall -U "$POSTGRES_USER" --globals-only > "${DEST_DIR}/postgres_globals.sql"

info "Archiving media volume"
docker run --rm -v "${INSTANCE}_vol_media:/from" -v "${DEST_DIR}:/to" alpine \
  sh -c 'cd /from && tar czf /to/vol_media.tar.gz .'

info "Archiving Meilisearch volume"
docker run --rm -v "${INSTANCE}_vol_meilisearch:/from" -v "${DEST_DIR}:/to" alpine \
  sh -c 'cd /from && tar czf /to/vol_meilisearch.tar.gz .'

if $INCLUDE_REDIS; then
  info "Archiving Redis volume"
  docker run --rm -v "${INSTANCE}_vol_redis:/from" -v "${DEST_DIR}:/to" alpine \
    sh -c 'cd /from && tar czf /to/vol_redis.tar.gz .'
else
  warn "Redis archive skipped"
fi

success "Backup complete"
echo "Destination: ${DEST_DIR}"
ls -lh "${DEST_DIR}"
