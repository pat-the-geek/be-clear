# be.CLEAR — Documentation de conception

<img src="frontend/public/favicon.svg" alt="be.CLEAR icon" width="80" />

## Présentation

**be.CLEAR** est une application qui permet à toute organisation (**ORG**) de déterminer et de piloter ses interactions avec son environnement (**ENV**).

Ces interactions sont formalisées sous forme d'**engagements** (**ENG**) — chaque ENG représente une relation concrète entre une ou plusieurs ORG et un ou plusieurs ENV, planifiée dans le temps et décomposée en étapes séquentielles appelées évènements (**EVENT**).

be.CLEAR offre ainsi une vision complète du cycle de vie des interactions : de la définition des acteurs (ORG) et de leurs contextes (ENV) jusqu'au suivi opérationnel des engagements (ENG) et de leurs jalons (EVENT), avec un tableau de bord de progression de type Gantt.

## Structure du projet

```
be.CLEAR/
├── docker-compose.yml      # Orchestration des services
├── .env.example            # Variables d'environnement (modèle)
├── .gitignore
├── backend/                # FastAPI (Python)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               # React 19 + Vite + TypeScript
│   ├── Dockerfile
│   └── nginx.conf
└── design/                 # Documents de conception
    ├── domain/             # Modèle de domaine, glossaire, concepts clés
    ├── architecture/       # Architecture système, composants, flux
    ├── data/               # Modèle de données, entités, relations
    ├── functional/         # Spécifications fonctionnelles, user stories
    └── ux/                 # Parcours utilisateur, wireframes descriptifs
```

## Démarrage rapide

```bash
# 1. Copier les variables d'environnement
cp .env.example .env
# Éditer .env avec les valeurs réelles

# 2. Démarrer tous les services
docker compose up --build

# 3. Accès
#    Frontend  →  http://localhost:3000
#    Backend   →  http://localhost:8000
#    API docs  →  http://localhost:8000/docs
```

## État d'implémentation

### Fonctionnalités implémentées

| Module | Fonctionnalité | Backend | Frontend |
|--------|----------------|:-------:|:--------:|
| **Auth** | Connexion JWT (login/logout) | ✅ | ✅ |
| **Auth** | API publique — clé API (Bearer token externe) | ✅ | ✅ profil |
| **Panel** | Panel personnel (OBJ créés par l'utilisateur) | ✅ | ✅ |
| **Admin** | Gestion CLA + PROP (création, modification, suppression) | ✅ | ✅ |
| **Admin** | Gestion TORG, TENV, TENG, TEVENT | ✅ | ✅ |
| **Admin** | Gestion des utilisateurs (USER) | ✅ | ✅ |
| **Admin** | Configuration globale (Obsidian, Ollama, LLM distants) | ✅ | ✅ |
| **Admin** | Journal LOG (consultation, filtres) | ✅ | ✅ |
| **Admin** | Réindexation Meilisearch | ✅ | ✅ |
| **ORG** | CRUD complet + navigation TORG → ORG | ✅ | ✅ |
| **ORG** | Détail : description, propriétés, images, documents, ENG, EVENT, graphe, RPT, timeline | ✅ | ✅ |
| **ENV** | CRUD complet + navigation TENV → ENV | ✅ | ✅ |
| **ENV** | Détail : description, propriétés, images, documents, ENG, EVENT, calendrier, RPT, timeline | ✅ | ✅ |
| **ENG** | CRUD complet + filtres (statut, TENG, ORG, ENV, recherche) | ✅ | ✅ |
| **ENG** | Détail : Gantt Mermaid, accomplissement, ORG/ENV liées, EVENTs, images, documents, timeline | ✅ | ✅ |
| **ENG** | Duplication d'engagement | ✅ | ✅ |
| **EVENT** | CRUD complet + calendrier + vue liste | ✅ | ✅ |
| **EVENT** | Détail : dates prévues/effectives, propriétés, images, documents, timeline | ✅ | ✅ |
| **IMG** | Upload, suppression, désignation image principale | ✅ | ✅ |
| **DOC** | Upload, téléchargement, suppression | ✅ | ✅ |
| **Recherche** | Full-text Meilisearch (ORG, ENV, ENG, EVENT) avec highlight et filtres | ✅ | ✅ |
| **Graphe** | Visualisation force-directed globale + par ORG/ENV | ✅ | ✅ |
| **Terminal IA** | RAG : embedding pgvector + génération LLM (Ollama, OpenAI, Anthropic) | ✅ | ✅ |
| **RPT** | Rapport Markdown ORG et ENV — téléchargement ou export filesystem/Obsidian | ✅ | ✅ |

### Travaux restants

| Priorité | Sujet | Description |
|----------|-------|-------------|
| 🔶 Moyen | **Auth externe** | F01 prévoit LDAP/OAuth — actuellement login direct (username/password) sans annuaire externe |
| ✅ Fait | **Graphe global** | Vue globale ORG↔ENG↔ENV avec filtres par type, recherche de nœud et optimisation N+1 (selectinload) |
| ✅ Fait | **Tests automatisés** | Suite pytest-asyncio (SQLite in-memory) : 26 tests — auth (JWT + ApiToken), CRUD ORG/ENV, règles métier RF-12/RF-15, crypto |
| ✅ Fait | **Pagination côté serveur** | Vérifiée : ORG, ENV, ENG, EVENT ont tous un `page`/`per_page` côté serveur |
| ✅ Fait | **Chiffrement clés LLM** | Chiffrement Fernet (AES-128-CBC) au repos — clé dérivée du SECRET_KEY |

## Documents produits

| Document | Type | Statut |
|----------|------|--------|
| [Glossaire du domaine](design/domain/glossaire.md) | Domaine | ✅ Rédigé |
| [Modèle de domaine](design/domain/modele-domaine.md) | Domaine | ✅ Rédigé |
| [Modèle de données](design/data/modele-donnees.md) | Données | ✅ Rédigé |
| [Spécifications fonctionnelles](design/functional/specifications-fonctionnelles.md) | Fonctionnel | ✅ Rédigé |
| [Architecture système](design/architecture/architecture-systeme.md) | Architecture | ✅ Rédigé |
| [Terminal IA — Architecture RAG](design/architecture/terminal-ia-rag.md) | Architecture | ✅ Rédigé |
| [UX / GUI](design/ux/ux-gui.md) | UX | ✅ Rédigé |

## Fonctionnalités transverses

### Navigation et accès aux données

| Fonctionnalité | Description |
|----------------|-------------|
| **Panel personnel** | Accès rapide aux OBJ créés par le USER connecté |
| **Navigation TORG → ORG** | Parcours de l'arborescence des types d'ORG avec leurs ORG |
| **Navigation TENV → ENV** | Parcours de l'arborescence des types d'ENV avec leurs ENV |
| **Recherche full-text** | Recherche sur les champs textuels des OBJ (nom, description, VALUE de type TEXTE/MARKDOWN) — DOC exclus |

### API — Web Services

| Élément | Description |
|---------|-------------|
| **Format** | REST (JSON) |
| **Sécurité** | Authentification par token / clé API |
| **Périmètre** | CRUD complet sur toutes les entités du domaine |
| **Permissions** | Respecte les ROLE du USER associé au token |
| **Usage** | Scripts externes, applications compagnon |

### Terminal IA

| Élément | Description |
|---------|-------------|
| **Type** | Interface RAG (Retrieval-Augmented Generation) |
| **Usage** | Requêtes en langage naturel sur les données du système |
| **Périmètre RAG** | Données structurées uniquement (ORG, ENV, ENG, EVENT, OBJ, VALUE, PROP...) — DOC et IMG exclus |

### CONFIG — Configuration globale de l'application

| Paramètre | Description |
|-----------|-------------|
| **Vault Obsidian** | Chemin vers le coffre pour l'export RPT |
| **LLM distants** | 0..n fournisseurs configurables (Claude, OpenAI, etc.) — traitements complexes |
| **LLM local** | 0..1 modèle local — traitements légers, économie de tokens |

### RPT — Rapport d'activité

| Élément | Description |
|---------|-------------|
| **Portée** | Générable pour chaque ORG ou ENV |
| **Contenu** | Activité de l'entité : ENGs et EVENTs associés avec leurs données et les images (IMG) de chaque élément |
| **Format** | Markdown |
| **Déclenchement** | À la demande uniquement (manuel) |
| **Stockage externe** | Filesystem local ou coffre Obsidian (vault) — connexion configurée au niveau de l'application |

## Contraintes architecturales

| Contrainte | Description |
|-----------|-------------|
| **Performance** | La vitesse d'accès est primordiale. Des dénormalisations ciblées seront envisagées lors de la conception du modèle de données pour les chemins d'accès critiques, malgré la structure normalisée. |
| **Déploiement** | Docker — chaque service containerisé. Docker Compose pour l'orchestration locale. Compatible Kubernetes pour la montée en charge. |
| **Portabilité** | Stack 100% open source, auto-hébergeable, aucune dépendance à un cloud provider spécifique. |

## Concepts fondamentaux

### Partie "Activité"

| Concept | Description |
|---------|-------------|
| **ORG** | Organisation utilisatrice — typée par 1 TORG à la fois (peut changer dans le temps) — possède 0..n USER |
| **ENV** | Environnement de l'ORG — typé par 1 TENV à la fois (peut changer dans le temps) |
| **ENG** | Engagement — interaction entre 1..n ORG et 1..n ENV — typé par 1 TENG — dates début/fin prévues et effectives — composé de 1..n EVENT séquentiels — état d'accomplissement et date de fin prévue calculés à partir des EVENTs — visualisable en diagramme Gantt Mermaid |
| **EVENT** | Unité atomique d'un ENG — typé par 1 TEVENT — appartient à exactement 1 ENG — possède une `date_heure` (détermine l'ordre) — durée prévue par défaut héritée du TEVENT — date suggérée automatiquement à la création |
| **USER** | Acteur du système — typé par 1 TUSER (nature) — possède 1 ROLE (permission) — relié à 1 OBJ — USER humain : rattaché à 1 ORG + 1 identifiant auth externe — USER non-humain : sans ORG |
| **TUSER** | Type d'USER — liste plate — nature : humain, système, cron, IA... — classificateur uniquement, pas de CLA associée |
| **ROLE** | Niveau de permission des USER humains : ADMIN, EDITEUR, LECTEUR — USER non-humains hors système de ROLE, agissent en ADMIN, tracés dans LOG |
| **TORG** | Type d'ORG — arborescence hiérarchique — tout nœud valide — appartient à 1 CLA |
| **TENV** | Type d'ENV — arborescence hiérarchique — tout nœud valide — appartient à 1 CLA |
| **TENG** | Type d'ENG — liste plate — appartient à 1 CLA |
| **TEVENT** | Type d'EVENT — liste plate — appartient à 1 CLA — porte la durée prévue par défaut (valeur + unité : secondes, minutes, heures, jours, mois...) |

### Partie "Objet"

| Concept | Description |
|---------|-------------|
| **OBJ** | Instance — chaque ORG, ENG, ENV, EVENT et USER est relié à exactement 1 OBJ — porte les VALUE pour toutes les PROP (propres + héritées) de sa CLA — peut avoir 0..n IMG et 0..n DOC |
| **IMG** | Image attachée à un OBJ — 0..n par OBJ — 1 désignée comme image principale |
| **DOC** | Document attaché à un OBJ — 0..n par OBJ — format Markdown (préférentiel) ou Microsoft Office |
| **CLA** | Classe — définit un schéma de PROP — peut hériter d'une super-classe — possède 0..n PROP propres (0 PROP = étiquette typologique pure) — possède un texte de comportement (Markdown) et un visuel (icône ou image) |
| **PROP** | Attribut d'une CLA — hérité par les sous-classes |
| **VALUE** | Valeur d'une PROP pour un OBJ — exactement 1 VALUE par PROP (propre ou héritée) par OBJ |

> **Fondement** : OOP classique — CLA = classe, OBJ = instance, PROP = attribut, VALUE = valeur d'attribut, avec héritage de PROP entre CLA (super-classe → sous-classe).
>
> **Principe de schéma dynamique** : le TYPE d'une entité détermine sa CLA, donc l'ensemble des PROP disponibles, le comportement (Markdown) et le visuel (icône ou image). Les types (TORG, TENV, TENG, TEVENT, TUSER) n'ont pas de visuel propre — ils héritent de celui de leur CLA. L'OBJ porte les VALUE concrètes.

### Métadonnées système

| Champ | OBJ | Tous les autres éléments |
|-------|-----|--------------------------|
| `uid` (UUID universel) | oui | non |
| `nom` (chaîne) | oui | non |
| `description` (Markdown) | oui | non |
| `created_at` | oui | oui |
| `updated_at` | oui | oui |
| `created_by` (USER) | oui | oui |
| `updated_by` (USER) | oui | oui |

### LOG — Journal des opérations

Toutes les opérations (création, modification, suppression) sur tous les éléments du système sont enregistrées dans un journal **LOG**. Permet de retracer l'historique complet, y compris des éléments supprimés.
