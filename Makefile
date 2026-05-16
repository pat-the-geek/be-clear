.PHONY: help up down restart logs build test lint backup restore

# ─── Variables ───────────────────────────────────────────────────────────────

COMPOSE = docker compose
BACKEND = $(COMPOSE) exec backend

# ─── Aide ────────────────────────────────────────────────────────────────────

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── Docker Compose ───────────────────────────────────────────────────────────

up: ## Démarre tous les services (build si nécessaire)
	@if [ ! -f .env ]; then \
		echo "⚠️  Fichier .env manquant — copie depuis .env.example…"; \
		cp .env.example .env; \
		echo "✏️  Éditez .env avant de relancer (mots de passe, clés…)"; \
		exit 1; \
	fi
	$(COMPOSE) up --build -d
	@echo ""
	@echo "✅  be.CLEAR démarré :"
	@echo "   Frontend  →  http://localhost:$${FRONTEND_PORT:-3000}"
	@echo "   Backend   →  http://localhost:$${BACKEND_PORT:-8000}/docs"
	@echo "   MCP       →  http://localhost:$${MCP_PORT:-8001}/sse"
	@echo "   Search    →  http://localhost:$${MEILI_PORT:-7700}"

down: ## Arrête tous les services
	$(COMPOSE) down

restart: ## Redémarre tous les services
	$(COMPOSE) restart

build: ## Rebuild les images sans démarrer
	$(COMPOSE) build

logs: ## Suit les logs de tous les services
	$(COMPOSE) logs -f

logs-back: ## Suit les logs du backend uniquement
	$(COMPOSE) logs -f backend

logs-front: ## Suit les logs du frontend uniquement
	$(COMPOSE) logs -f frontend

logs-mcp: ## Suit les logs du serveur MCP uniquement
	$(COMPOSE) logs -f mcp

# ─── Base de données ──────────────────────────────────────────────────────────

migrate: ## Lance les migrations Alembic
	$(BACKEND) alembic upgrade head

migration: ## Génère une nouvelle migration (MSG="description")
	$(BACKEND) alembic revision --autogenerate -m "$(MSG)"

psql: ## Ouvre un shell PostgreSQL
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-beclear} -d $${POSTGRES_DB:-beclear}

# ─── Tests ───────────────────────────────────────────────────────────────────

test: ## Lance les tests backend (pytest)
	cd backend && python -m pytest tests/ -v

test-watch: ## Lance les tests en mode watch
	cd backend && python -m pytest tests/ -v --tb=short -f

# ─── Qualité de code ─────────────────────────────────────────────────────────

lint: ## Vérifie le code Python (ruff)
	cd backend && python -m ruff check app/

format: ## Formate le code Python (ruff)
	cd backend && python -m ruff format app/

typecheck: ## Vérifie les types TypeScript
	cd frontend && npm run typecheck 2>/dev/null || npx tsc --noEmit

# ─── Meilisearch ─────────────────────────────────────────────────────────────

search-setup: ## Crée l'index Meilisearch et configure les searchableAttributes
	@curl -s -X POST http://localhost:7700/indexes \
		-H 'Content-Type: application/json' \
		-H "Authorization: Bearer $$(grep MEILISEARCH_MASTER_KEY .env | cut -d= -f2)" \
		-d '{"uid":"objets","primaryKey":"id"}' | python3 -m json.tool
	@curl -s -X PATCH http://localhost:7700/indexes/objets/settings \
		-H 'Content-Type: application/json' \
		-H "Authorization: Bearer $$(grep MEILISEARCH_MASTER_KEY .env | cut -d= -f2)" \
		-d '{"searchableAttributes":["nom","description","values_text","cla_nom"],"filterableAttributes":["entity_type","cla_nom"]}' | python3 -m json.tool
	@echo "✅  Index Meilisearch configuré"

# ─── Nettoyage ───────────────────────────────────────────────────────────────

clean: ## Supprime les containers et volumes (⚠️ efface les données)
	$(COMPOSE) down -v --remove-orphans

backup: ## Sauvegarde complete vers /Volumes/USB1/be.CLEAR-Backup
	bash ./backup.sh

restore: ## Restaure depuis USB1 (optionnel: make restore SRC=/chemin/backup)
	bash ./restore.sh $(if $(SRC),--source-dir=$(SRC),)
