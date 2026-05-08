# Architecture système — be.CLEAR

## Vue d'ensemble

be.CLEAR suit une architecture **client-serveur découplée** :
- Un frontend SPA (Single Page Application) communique exclusivement via l'API REST
- Un backend expose l'API REST et orchestre tous les services
- Les services tiers (base de données, recherche, cache, LLM) sont isolés dans leurs propres containers Docker

---

## Diagramme 1 — Composants système

```mermaid
graph TB
    subgraph CLIENT["Client"]
        FE["Frontend\nReact 19 + Vite + TypeScript"]
    end

    subgraph BACKEND["Backend"]
        API["API REST\nFastAPI (Python)"]
        RAG["Moteur RAG\nLlamaIndex"]
        RPT["Générateur RPT\nMarkdown"]
        AUTH["Authentification\nJWT + OAuth/LDAP"]
    end

    subgraph SERVICES["Services"]
        DB["Base de données\nPostgreSQL + pgvector"]
        SEARCH["Recherche full-text\nMeilisearch"]
        CACHE["Cache\nRedis"]
    end

    subgraph LLM["LLM"]
        OLLAMA["LLM local\nOllama (partagé)"]
        REMOTE["LLM distants\nClaude / OpenAI / ..."]
    end

    subgraph EXTERNAL["Systèmes externes"]
        AUTHPROV["Annuaire auth\nLDAP / OAuth"]
        FS["Filesystem\nutilisateur"]
        OBSIDIAN["Vault Obsidian"]
        COMPANION["Applications\ncompagnon / scripts"]
    end

    FE -- "REST/JSON HTTPS" --> API
    COMPANION -- "REST/JSON + Token" --> API

    API --> DB
    API --> SEARCH
    API --> CACHE
    API --> AUTH
    AUTH --> AUTHPROV

    API --> RAG
    RAG --> DB
    RAG --> OLLAMA
    RAG --> REMOTE

    API --> RPT
    RPT --> FS
    RPT --> OBSIDIAN
```

---

## Diagramme 2 — Déploiement Docker

be.CLEAR est **multi-instance** : plusieurs instances peuvent tourner en parallèle sur la même machine. Chaque instance est déployée avec `./deploy.sh --instance=<nom>`, qui passe `-p <nom>` à Docker Compose — containers, volumes et réseau sont préfixés automatiquement par ce nom.

```mermaid
graph TB
    subgraph INST1["Instance be-clear-1 (projet Docker : be-clear-1)"]
        FE1["frontend\n:FRONTEND_PORT"]
        BE1["backend\n:BACKEND_PORT"]
        DB1["db\n:POSTGRES_PORT"]
        S1["search\n:MEILI_PORT"]
        C1["cache\n:REDIS_PORT"]
    end

    subgraph INST2["Instance be-clear-2 (projet Docker : be-clear-2)"]
        FE2["frontend\n:FRONTEND_PORT"]
        BE2["backend\n:BACKEND_PORT"]
        DB2["db\n:POSTGRES_PORT"]
        S2["search\n:MEILI_PORT"]
        C2["cache\n:REDIS_PORT"]
    end

    subgraph SHARED["Services partagés (hôte)"]
        OLLAMA["ollama\n:11434"]
    end

    FE1 --> BE1 --> DB1
    BE1 --> S1
    BE1 --> C1
    BE1 --> OLLAMA

    FE2 --> BE2 --> DB2
    BE2 --> S2
    BE2 --> C2
    BE2 --> OLLAMA
```

> Chaque instance a son propre fichier `.env.<nom>` définissant des ports uniques sur l'hôte. Les communications internes (backend → db, backend → search, etc.) utilisent les noms de service Docker et ne dépendent pas des ports hôte.

### Variables d'environnement clés

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | backend | URL PostgreSQL (réseau interne) |
| `MEILISEARCH_URL` | backend | URL Meilisearch (réseau interne) |
| `REDIS_URL` | backend | URL Redis (réseau interne) |
| `OLLAMA_URL` | backend | URL instance Ollama partagée |
| `SECRET_KEY` | backend | Clé de signature JWT |
| `OBSIDIAN_VAULT_PATH` | backend | Chemin du vault Obsidian (volume monté) |
| `MEDIA_PATH` | backend | Répertoire de stockage images/docs |
| `PUBLIC_BASE_URL` | backend | URL publique du backend (rapports RPT) |
| `VITE_API_URL` | frontend | URL du backend appelé depuis le navigateur |
| `FRONTEND_PORT` | hôte | Port exposé du frontend (défaut : 3000) |
| `BACKEND_PORT` | hôte | Port exposé du backend (défaut : 8000) |
| `MEILI_PORT` | hôte | Port exposé de Meilisearch (défaut : 7700) |
| `REDIS_PORT` | hôte | Port exposé de Redis (défaut : 6379) |
| `POSTGRES_PORT` | hôte | Port exposé de PostgreSQL (défaut : 5432) |

---

## Initialisation automatique (Bootstrap)

Au démarrage de chaque instance, l'entrypoint du backend exécute automatiquement les étapes suivantes :

```mermaid
flowchart TD
    A([Démarrage container]) --> B{PostgreSQL\nprêt ?}
    B -- non / attente TCP --> B
    B -- oui --> C[alembic upgrade head\nmigrations idempotentes]
    C --> D[Démarrage uvicorn\nFastAPI lifespan]
    D --> E[seed_initial_data]
    E --> F{Rôles ADMIN\nEDITEUR LECTEUR\nexistent ?}
    F -- non --> G[Créer les rôles]
    F -- oui --> H
    G --> H{Types USER\nexistent ?}
    H -- non --> I[Créer humain / système]
    H -- oui --> J
    I --> J{CLA Utilisateur\nexiste ?}
    J -- non --> K[Créer CLA de base]
    J -- oui --> L
    K --> L{USER admin\nexiste ?}
    L -- non --> M[Créer admin/admin\nhash bcrypt]
    L -- oui --> N([Démarrage complet])
    M --> N
```

Le seed est **strictement idempotent** : chaque entité est créée uniquement si elle est absente. Les données existantes ne sont jamais modifiées. Ce comportement garantit qu'un redémarrage ou une mise à jour de l'instance ne casse pas une base déjà en production.

---

## Diagramme 3 — Flux d'authentification

```mermaid
sequenceDiagram
    actor U as USER humain
    participant FE as Frontend
    participant API as Backend API
    participant AUTH as Auth module
    participant AUTHPROV as Annuaire externe
    participant DB as PostgreSQL
    participant CACHE as Redis

    U->>FE: Saisie identifiants
    FE->>API: POST /auth/login
    API->>AUTHPROV: Vérification identité
    AUTHPROV-->>API: Identité confirmée
    API->>DB: Charger USER (auth_uid)
    DB-->>API: USER + ROLE + ORG
    API->>CACHE: Stocker session (JWT TTL)
    API-->>FE: JWT token
    FE->>FE: Stocker token (localStorage)
    FE-->>U: Redirection vers panel personnel
```

---

## Diagramme 4 — Flux CRUD standard

```mermaid
sequenceDiagram
    actor U as USER
    participant FE as Frontend
    participant API as Backend API
    participant CACHE as Redis
    participant DB as PostgreSQL
    participant SEARCH as Meilisearch

    U->>FE: Action (créer / modifier)
    FE->>API: POST/PUT /api/[entité] + JWT
    API->>API: Vérifier JWT + ROLE
    API->>DB: Écriture (INSERT/UPDATE)
    API->>DB: INSERT dans LOG
    API->>CACHE: Invalider cache concerné
    API->>SEARCH: Mettre à jour index full-text
    API-->>FE: 200 OK + données
    FE-->>U: Mise à jour interface
```

---

## Diagramme 5 — Flux RAG (Terminal IA)

```mermaid
sequenceDiagram
    actor U as USER
    participant FE as Frontend
    participant API as Backend API
    participant RAG as Moteur RAG (LlamaIndex)
    participant DB as PostgreSQL + pgvector
    participant LLM as LLM (local ou distant)

    U->>FE: Saisie question langage naturel
    FE->>API: POST /api/rag/query + JWT
    API->>API: Vérifier droits USER
    API->>RAG: Transmettre question + contexte USER
    RAG->>DB: Embedding de la question (pgvector)
    DB-->>RAG: Chunks pertinents (données structurées)
    RAG->>LLM: Prompt = question + chunks
    LLM-->>RAG: Réponse générée
    RAG-->>API: Réponse + sources référencées
    API-->>FE: Réponse JSON
    FE-->>U: Affichage réponse + sources
```

---

## Diagramme 6 — Flux Rapport d'activité (RPT)

```mermaid
sequenceDiagram
    actor U as USER
    participant FE as Frontend
    participant API as Backend API
    participant DB as PostgreSQL
    participant RPT as Générateur RPT
    participant DEST as Destination (FS ou Obsidian)

    U->>FE: Demande rapport (ORG ou ENV)
    FE->>API: POST /api/rpt/org/{id} ou /env/{id}
    API->>DB: Charger ORG/ENV + ENG + EVENT + IMG
    DB-->>API: Données complètes
    API->>RPT: Générer Markdown
    RPT->>RPT: Assembler contenu + images
    RPT-->>API: Fichier .md prêt
    API->>DEST: Écrire fichier [type]-[nom]-[date].md
    DEST-->>API: Confirmation
    API-->>FE: URL / chemin du fichier
    FE-->>U: Confirmation + lien de téléchargement
```

---

## Diagramme 7 — Flux recherche full-text

```mermaid
sequenceDiagram
    actor U as USER
    participant FE as Frontend
    participant API as Backend API
    participant SEARCH as Meilisearch

    U->>FE: Saisie requête
    FE->>API: GET /api/search?q=texte
    API->>SEARCH: Requête full-text
    SEARCH-->>API: Résultats triés par pertinence
    API->>API: Filtrer selon droits USER (ROLE)
    API-->>FE: Résultats JSON
    FE-->>U: Affichage résultats avec extraits
```

---

## Diagramme 8 — Flux calcul Gantt ENG

```mermaid
sequenceDiagram
    participant API as Backend API
    participant DB as PostgreSQL

    Note over API,DB: Déclenché à chaque CREATE/UPDATE/DELETE EVENT

    API->>DB: Charger tous les EVENTs de l'ENG (ordonnés par date_heure_prevue)
    DB-->>API: Liste EVENTs + durée TEVENT
    API->>API: Calculer date_fin_prevue\n= date_heure_prevue dernier EVENT + durée TEVENT
    API->>API: Calculer accomplissement\n= EVENTs (date_heure_reelle IS NOT NULL) / total × 100
    API->>DB: UPDATE eng SET date_fin_prevue, accomplissement
    API->>API: Générer diagramme Mermaid gantt
```

---

## Stratégie de cache (Redis)

| Données cachées | TTL | Invalidation |
|----------------|-----|--------------|
| Session JWT utilisateur | 8h | Déconnexion ou expiration |
| Arborescence TORG complète | 1h | Toute modification TORG |
| Arborescence TENV complète | 1h | Toute modification TENV |
| PROP résolues d'une CLA | 2h | Modification CLA ou PROP |
| Résultats recherche fréquents | 10min | Toute modification OBJ |

---

## Sécurité

| Mesure | Description |
|--------|-------------|
| **JWT** | Authentification stateless, token signé, TTL 8h |
| **HTTPS** | Chiffrement en transit (TLS) |
| **RBAC** | Toutes les routes API vérifient le ROLE du USER |
| **Rate limiting** | Protection contre les abus sur l'API publique |
| **API Token** | Applications compagnon utilisent un token dédié lié à un USER |
| **Isolation Docker** | Chaque service dans son réseau interne, seul le frontend est exposé |

---

## Scalabilité

L'architecture est conçue pour évoluer :

```mermaid
graph LR
    A["Docker Compose\n(développement / petite prod)"]
    B["Docker Swarm\n(moyenne charge)"]
    C["Kubernetes\n(grande charge)"]
    A --> B --> C
```

- **PostgreSQL** : réplication, read replicas pour les requêtes lourdes
- **Meilisearch** : scalable horizontalement
- **Backend FastAPI** : stateless — plusieurs instances derrière un load balancer
- **Redis** : cluster si nécessaire
