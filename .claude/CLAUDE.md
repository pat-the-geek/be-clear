# be.CLEAR — Contexte Claude

## Phase actuelle
Développement actif (implémentation en cours)

## Règles de développement frontend

### Images — recadrage intelligent
**TOUJOURS** utiliser le composant `SmartImage` (`src/components/shared/SmartImage.tsx`) à la place d'un `<img>` standard pour afficher des images uploadées par les utilisateurs (photos de personnes, logos…).

`SmartImage` utilise **smartcrop.js** pour détecter automatiquement la zone d'intérêt (visage, sujet principal) et applique le bon `object-position` CSS. Le résultat est mis en cache par URL pour ne calculer qu'une seule fois par image.

```tsx
import SmartImage from '@/components/shared/SmartImage'

// Toujours spécifier cropWidth/cropHeight = dimensions d'affichage réelles
<SmartImage
  src={imgUrl(img.chemin)}
  alt={img.nom_original ?? ''}
  className="w-full h-32 object-cover rounded-lg"
  cropWidth={300}   // largeur de la vignette en px
  cropHeight={128}  // hauteur de la vignette en px
/>
```

Pour les URLs d'images uploadées, utiliser `imgUrl(chemin)` de `@/components/shared/ImageManager` :
```tsx
import { imgUrl } from '@/components/shared/ImageManager'
// imgUrl('42/abc123.jpg') → '/api/media/files/42/abc123.jpg'
```

## Stack technique

| Couche | Technologie | Notes |
|--------|-------------|-------|
| **Frontend** | React 19 + Vite + TypeScript | SPA, écosystème riche |
| **Backend** | FastAPI (Python) | Intégration IA/RAG, génère Swagger/OpenAPI automatiquement |
| **Base de données** | PostgreSQL + pgvector | Gros volumes, JSONB, vecteurs pour le RAG |
| **Recherche full-text** | Meilisearch | Open source, ultra-rapide |
| **LLM local** | Ollama | Validé par l'utilisateur dans d'autres projets Docker — instance partageable entre applications |
| **RAG framework** | LlamaIndex | Python natif, compatible FastAPI + Ollama |
| **ORM** | SQLAlchemy + Alembic | Migrations, Python |
| **Cache** | Redis | Performance, sessions |
| **API** | REST/JSON | Générée par FastAPI, documentée via Swagger |
| **Déploiement** | Docker + Docker Compose | Kubernetes compatible pour la montée en charge |

## Contraintes architecturales

- **Performance** : malgré la structure normalisée (OOP, héritage, schéma dynamique), la vitesse d'accès est primordiale. Des dénormalisations ciblées de la base de données seront envisagées lors de la conception du modèle de données pour les chemins d'accès critiques.
- **Déploiement** : Docker — chaque service est containerisé. Docker Compose pour l'orchestration locale et les environnements simples. Compatible Kubernetes pour les déploiements à plus grande échelle.
- **Portabilité** : aucune dépendance à un cloud provider spécifique — stack 100% open source auto-hébergeable.
- **Ollama** : instance partagée entre applications — référencée comme service externe dans le Docker Compose de be.CLEAR (pas de container dédié).

## Fonctionnalités transverses

### Terminal IA
- Interface de requêtage de type **RAG** (Retrieval-Augmented Generation) sur les données du système
- Permet aux utilisateurs d'interroger le système en langage naturel
- Périmètre RAG : **données structurées uniquement** (ORG, ENV, ENG, EVENT, OBJ, VALUE, PROP...) — DOC et IMG exclus

### API — Web Services
- Le système expose une **API publique** permettant à des scripts externes et applications compagnon d'interagir avec le système
- Sécurisée par authentification (token / clé API)
- Couvre l'ensemble des opérations CRUD sur les entités du domaine
- Respecte les ROLE et permissions du USER associé au token
- Format : **REST** (JSON) — standard, universel, facile à consommer depuis n'importe quel langage ou outil

### CONFIG — Configuration globale de l'application
- Chemin vers le vault Obsidian (pour l'export RPT)
- Configuration des **LLM distants** (0..n) : Claude, OpenAI, et autres fournisseurs — utilisés pour les traitements IA complexes
- Configuration d'un **LLM local** (0..1) : pour les traitements légers et l'économie de tokens

### Navigation et accès aux données
- **Panel personnel** : chaque USER accède rapidement aux OBJ qu'il a créés (`created_by`)
- **Navigation TORG → ORG** : parcours de l'arborescence des types d'ORG avec les ORG rattachées
- **Navigation TENV → ENV** : parcours de l'arborescence des types d'ENV avec les ENV rattachées
- **Recherche full-text** : recherche sur les champs textuels des OBJ (nom, description, VALUE de type TEXTE/MARKDOWN) — DOC exclus

### RPT — Rapport d'activité
- Génération d'un rapport Markdown pour chaque **ORG** ou **ENV**
- Contenu : présentation de l'activité de l'entité — ENGs et EVENTs associés, avec leurs données et les images (IMG) de chaque élément
- Format de sortie : Markdown
- **Déclenchement** : à la demande uniquement (manuel) — pas de cron pour éviter la surcharge en fichiers
- Destinations de stockage externe :
  - **Filesystem** : répertoire local de l'utilisateur
  - **Obsidian** : coffre Obsidian (vault) — connexion configurée au niveau de l'application (config globale)

## Règles de travail
- Tous les documents sont en **Markdown + Mermaid**
- Stockés dans `/design/{domain,architecture,data,functional,ux}/`
- Le `README.md` à la racine sert d'index : mettre à jour la table "Documents produits" à chaque nouveau fichier
- Langue : français

## Domaine

### Partie "Activité"
- **ORG** : organisation utilisatrice — typée par 1 TORG (exactement 1 à la fois, peut changer dans le temps) — TORG structuré en arborescence (tous niveaux valides) — possède 0..n USER
- **ENV** : environnement de l'ORG — typé par 1 TENV (exactement 1 à la fois, peut changer dans le temps) — TENV structuré en arborescence (tous niveaux valides)
- **ENG** (Engagement) : interaction entre 1..n ORG et 1..n ENV — typé par 1 TENG (liste plate) — possède une date de début, date de début prévue, date de fin et date de fin prévue — composé de 1..n EVENT séquentiels — date de fin prévue et état d'accomplissement calculés à partir des EVENTs (comme un Gantt) — visualisable en diagramme de Gantt Mermaid
- **EVENT** : unité atomique d'un ENG — typé par 1 TEVENT — appartient à exactement 1 ENG — possède `date_heure_prevue` et `date_heure_reelle` (distinction prévu vs effectif) — l'ordre dans l'ENG est déterminé par `date_heure_prevue` — sa durée prévue par défaut est portée par son TEVENT (unité variable : secondes, minutes, heures, jours, mois...) — lors de la création, le système suggère `date_heure_prevue` = `date_heure_prevue du précédent EVENT` + `durée du TEVENT précédent` — **règle de cohérence** : `date_heure_prevue` du 1er EVENT ne peut pas être antérieure à `date_début` de l'ENG — un EVENT est considéré accompli quand `date_heure_reelle` est renseignée
- **USER** : acteur du système — typé par 1 TUSER (nature) — possède 1 ROLE (permission) — relié à 1 OBJ (identité domaine) — les USER de type humain appartiennent à exactement 1 ORG, les autres types (système, cron, IA...) n'ont pas d'ORG — les USER humains sont reliés à 1 identifiant technique externe (annuaire auth : LDAP, OAuth...)
- **ROLE** : niveau de permission d'un USER humain — liste plate à 3 valeurs : ADMIN (modifie CLA, PROP, types, CONFIG), EDITEUR (crée et modifie les objets), LECTEUR (lecture seule) — les USER non-humains (système, cron, IA...) sont hors système de ROLE mais agissent avec les droits ADMIN — leurs actions sont tracées dans le LOG

### Types
- **TORG** : type d'ORG — structure arborescente — tout niveau valide — appartient à 1 CLA (détermine les PROP/VALUE des ORG de ce type)
- **TENV** : type d'ENV — structure arborescente — tout niveau valide — appartient à 1 CLA (détermine les PROP/VALUE des ENV de ce type)
- **TENG** : type d'ENG — liste plate — appartient à 1 CLA (détermine les PROP/VALUE des ENG de ce type)
- **TEVENT** : type d'EVENT — liste plate — appartient à 1 CLA — porte la **durée prévue par défaut** d'un EVENT de ce type (valeur + unité : secondes, minutes, heures, jours, mois...)
- **TUSER** : type d'USER — liste plate — ex : humain, système, cron, IA... — n'appartient pas à une CLA (classificateur de nature uniquement, pas de schéma de données associé)

> **Principe** : le TYPE d'une entité détermine sa CLA, donc ses PROP disponibles, son comportement (texte Markdown) et son visuel (icône ou image). Les types (TORG, TENV, TENG, TEVENT, TUSER) n'ont pas de visuel propre — ils héritent de celui de leur CLA. L'OBJ de l'entité porte les VALUE concrètes.

### Partie "Objet" — inspirée de l'OOP classique
- **OBJ** : instance — chaque ORG, ENG, ENV, EVENT et USER est relié à exactement 1 OBJ — porte les VALUE pour toutes les PROP héritées et propres de sa CLA — peut avoir 0..n IMG (dont 1 image principale) et 0..n DOC
- **CLA** : classe — un OBJ appartient à exactement 1 CLA — possède 0..n PROP propres — peut hériter d'une super-classe (CLA parente) et en recevoir les PROP par héritage — possède un texte de comportement (Markdown) et un visuel : soit une icône, soit une image
- **PROP** : attribut d'une CLA — hérité par les sous-classes
- **VALUE** : valeur d'une PROP pour un OBJ — exactement 1 VALUE par PROP (propre ou héritée) par OBJ
- **IMG** : image attachée à un OBJ — un OBJ peut avoir 0..n IMG — l'une d'elles est désignée comme image principale
- **DOC** : document attaché à un OBJ — un OBJ peut avoir 0..n DOC — format préférentiel Markdown, formats Microsoft Office acceptés

#### Héritage
- Héritage **simple** : une CLA appartient à au plus 1 super-classe
- Une sous-classe hérite de toutes les PROP de sa super-classe (et de toute la chaîne d'héritage)
- Une sous-classe peut ajouter ses propres PROP
- Un OBJ d'une sous-classe a des VALUE pour toutes les PROP (héritées + propres)
- Une sous-classe hérite du visuel (icône ou image) de sa super-classe **par défaut**, mais peut définir le sien

### Métadonnées système

#### Champs de OBJ
- `uid` : identifiant universel unique (UUID)
- `nom` : chaîne de caractères
- `description` : texte en Markdown
- `created_at` : date de création
- `updated_at` : date de dernière modification
- `created_by` : USER créateur
- `updated_by` : USER modificateur

#### Champs de tous les autres éléments (CLA, PROP, TORG, TENV, TENG, TEVENT, ORG, ENG, ENV, EVENT, USER...)
- `created_at` : date de création
- `updated_at` : date de dernière modification
- `created_by` : USER créateur
- `updated_by` : USER modificateur

#### LOG — Journal des opérations
- Enregistre toutes les opérations (création, modification, suppression) sur tous les éléments du système
- Permet de retracer l'historique complet, y compris des éléments supprimés (qui n'existent plus dans le système)
