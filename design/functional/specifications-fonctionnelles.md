# Spécifications fonctionnelles — be.CLEAR

## Conventions

- **Acteurs** : `ADMIN`, `EDITEUR`, `LECTEUR`, `SYSTÈME` (non-humain)
- **Format des règles** : RF-XXX (Règle Fonctionnelle)
- Toute opération d'écriture est tracée dans le **LOG**

---

## Module 1 — Authentification et accès

### F01 — Connexion
**Acteurs** : tous les USER humains

- L'utilisateur s'authentifie via un annuaire externe (LDAP, OAuth...)
- Le système récupère l'identité et charge le USER correspondant
- Le ROLE et l'ORG de rattachement sont chargés en session
- RF-01 : un USER sans ROLE valide ne peut pas accéder à l'application

### F02 — Panel personnel
**Acteurs** : `EDITEUR`, `ADMIN`, `LECTEUR`

- À la connexion, le USER accède à son panel personnel
- Le panel affiche les OBJ créés par ce USER (`created_by = USER courant`)
- Chaque OBJ est affiché avec son nom, son image principale (IMG), sa CLA et son entité parente (ORG, ENV, ENG, EVENT)
- Accès direct à chaque élément depuis le panel

---

## Module 2 — Configuration et administration

### F03 — Gestion des Classes (CLA)
**Acteurs** : `ADMIN`

- Créer une CLA avec : nom, comportement (Markdown), visuel (icône ou image)
- Associer une super-classe à une CLA (héritage simple)
- Modifier une CLA existante
- Supprimer une CLA (tracé dans LOG)
- RF-02 : une CLA ne peut être supprimée si des OBJ lui sont rattachés
- RF-03 : une CLA ne peut pas être sa propre super-classe (cycle interdit)
- RF-04 : la suppression d'une CLA supprime la relation d'héritage des sous-classes (elles deviennent racines)

### F04 — Gestion des Propriétés (PROP)
**Acteurs** : `ADMIN`

- Ajouter une PROP à une CLA : nom, type
- Pour le type `LISTE` : définir les valeurs possibles
- Modifier le nom d'une PROP (le type ne peut pas être modifié après création)
- Supprimer une PROP d'une CLA (tracé dans LOG)
- RF-05 : la suppression d'une PROP supprime toutes les VALUE associées

### F05 — Gestion des Types d'Organisation (TORG)
**Acteurs** : `ADMIN`

- Créer un nœud TORG dans l'arborescence : nom, CLA associée, nœud parent
- Déplacer un nœud dans l'arborescence (le chemin dénormalisé est mis à jour)
- Modifier un nœud (nom, CLA)
- Supprimer un nœud (tracé dans LOG)
- RF-06 : un nœud ne peut être supprimé si des ORG lui sont rattachées
- RF-07 : la suppression d'un nœud parent est bloquée si des nœuds enfants existent

### F06 — Gestion des Types d'Environnement (TENV)
**Acteurs** : `ADMIN`

Identique à F05, appliqué aux ENV.

### F07 — Gestion des Types d'Engagement (TENG)
**Acteurs** : `ADMIN`

- Créer un TENG : nom, CLA associée
- Modifier, supprimer (tracé dans LOG)
- RF-08 : un TENG ne peut être supprimé si des ENG lui sont rattachés

### F08 — Gestion des Types d'Évènement (TEVENT)
**Acteurs** : `ADMIN`

- Créer un TEVENT : nom, CLA associée, durée prévue par défaut (valeur + unité)
- Modifier, supprimer (tracé dans LOG)
- RF-09 : un TEVENT ne peut être supprimé si des EVENT lui sont rattachés

### F09 — Configuration globale (CONFIG)
**Acteurs** : `ADMIN`

- Configurer le chemin du vault Obsidian
- Ajouter / modifier / supprimer des LLM distants (nom, fournisseur, clé API, modèle)
- Configurer le LLM local (URL Ollama, modèle)
- RF-10 : la configuration est unique et globale à l'application

---

## Module 3 — Gestion des Organisations (ORG)

### F10 — Créer une Organisation
**Acteurs** : `ADMIN`, `EDITEUR`

- Sélectionner un TORG (tout nœud de l'arborescence)
- Saisir les champs de l'OBJ : nom, description (Markdown)
- Renseigner les VALUE pour chaque PROP de la CLA du TORG (propres + héritées)
- Ajouter des IMG (dont 1 principale) et des DOC
- RF-11 : le TORG sélectionné détermine les PROP disponibles

### F11 — Modifier une Organisation
**Acteurs** : `ADMIN`, `EDITEUR`

- Modifier les champs OBJ (nom, description)
- Modifier les VALUE
- Ajouter / supprimer des IMG et DOC
- Changer le TORG : l'historique est conservé dans `org_torg_history`, les VALUE incompatibles avec le nouveau TORG sont signalées

### F12 — Naviguer par TORG → ORG
**Acteurs** : tous

- Afficher l'arborescence des TORG
- Pour chaque nœud, afficher les ORG rattachées
- Développer / réduire les nœuds
- Accéder à une ORG depuis l'arborescence

### F13 — Consulter une Organisation
**Acteurs** : tous

- Fiche détaillée : OBJ (nom, description, images, documents), PROP/VALUE, TORG courant
- Liste des ENG auxquels cette ORG participe
- Liste des USER de cette ORG

---

## Module 4 — Gestion des Environnements (ENV)

### F14 — Créer un Environnement
**Acteurs** : `ADMIN`, `EDITEUR`

Identique à F10, appliqué aux ENV avec TENV.

### F15 — Modifier un Environnement
**Acteurs** : `ADMIN`, `EDITEUR`

Identique à F11, appliqué aux ENV.

### F16 — Naviguer par TENV → ENV
**Acteurs** : tous

Identique à F12, appliqué aux ENV.

### F17 — Consulter un Environnement
**Acteurs** : tous

- Fiche détaillée : OBJ, PROP/VALUE, TENV courant
- Liste des ENG impliquant cet ENV

---

## Module 5 — Gestion des Engagements (ENG)

### F18 — Créer un Engagement
**Acteurs** : `ADMIN`, `EDITEUR`

- Sélectionner un TENG
- Saisir les champs OBJ : nom, description
- Renseigner les VALUE (PROP du TENG)
- Associer 1..n ORG et 1..n ENV
- Saisir les dates : `date_début`, `date_début_prévue`
- RF-12 : au moins 1 ORG et 1 ENV doivent être associés

### F19 — Modifier un Engagement
**Acteurs** : `ADMIN`, `EDITEUR`

- Modifier les champs OBJ, VALUE, ORG associées, ENV associées, dates
- RF-13 : si la `date_début` est modifiée, le système vérifie la cohérence avec les EVENTs existants

### F20 — Consulter un Engagement
**Acteurs** : tous

- Fiche détaillée : OBJ, PROP/VALUE, ORG et ENV associées, dates
- Liste des EVENTs ordonnés par `date_heure_prevue`
- Affichage de l'état d'accomplissement (%)
- Diagramme de Gantt Mermaid généré dynamiquement

### F21 — Diagramme de Gantt
**Acteurs** : tous

Le système génère automatiquement un diagramme Mermaid de type `gantt` pour chaque ENG :

```
gantt
    title [Nom de l'ENG]
    dateFormat YYYY-MM-DD
    [EVENT 1] : [date_heure_prevue], [durée TEVENT]
    [EVENT 2] : [date_heure_prevue], [durée TEVENT]
    ...
```

- RF-14 : le Gantt est recalculé à chaque modification d'un EVENT

---

## Module 6 — Gestion des Évènements (EVENT)

### F22 — Créer un Évènement
**Acteurs** : `ADMIN`, `EDITEUR`

- Sélectionner un TEVENT
- Saisir les champs OBJ : nom, description
- Renseigner les VALUE (PROP du TEVENT)
- Saisir la `date_heure_prevue` : le système propose automatiquement `date_heure_prevue du dernier EVENT` + `durée du TEVENT du dernier EVENT`
- `date_heure_reelle` est laissée vide à la création (sera renseignée lors de la réalisation)
- RF-15 : `date_heure_prevue` du 1er EVENT ne peut pas être antérieure à `date_début` de l'ENG
- Après création, `date_fin_prevue` et `accomplissement` de l'ENG sont recalculés

### F23 — Modifier un Évènement
**Acteurs** : `ADMIN`, `EDITEUR`

- Modifier les champs OBJ, VALUE, `date_heure_prevue`, `date_heure_reelle`
- Renseigner `date_heure_reelle` marque l'EVENT comme **accompli**
- La modification de `date_heure_prevue` réordonne les EVENTs
- RF-16 : après modification, les règles de cohérence (RF-15) sont réévaluées
- L'ENG est recalculé après toute modification

### F24 — Consulter un Évènement
**Acteurs** : tous

- Fiche détaillée : OBJ, PROP/VALUE, TEVENT, `date_heure_prevue`, `date_heure_reelle`, durée prévue vs réelle

---

## Module 7 — Gestion des Utilisateurs (USER)

### F25 — Créer un Utilisateur
**Acteurs** : `ADMIN`

- Sélectionner un TUSER
- Pour USER humain : saisir nom (OBJ), rattacher à une ORG, assigner un ROLE, configurer l'identifiant auth externe
- Pour USER non-humain : saisir nom (OBJ), aucun ORG ni ROLE requis

### F26 — Modifier un Utilisateur
**Acteurs** : `ADMIN`

- Modifier le ROLE, l'ORG de rattachement, les informations OBJ

### F27 — Consulter un Utilisateur
**Acteurs** : `ADMIN`

- Fiche : OBJ, TUSER, ROLE, ORG de rattachement, historique des actions (LOG)

---

## Module 8 — Objets, Images et Documents

### F28 — Gestion des Images (IMG)
**Acteurs** : `ADMIN`, `EDITEUR`

- Uploader une ou plusieurs images sur un OBJ
- Désigner l'image principale
- RF-17 : un seul IMG peut être `est_principale = true` par OBJ à la fois

### F29 — Gestion des Documents (DOC)
**Acteurs** : `ADMIN`, `EDITEUR`

- Attacher un document (Markdown ou Office) à un OBJ
- Télécharger un document
- Supprimer un document (tracé dans LOG)

---

## Module 9 — Recherche et Navigation

### F30 — Recherche full-text
**Acteurs** : tous

- Saisir une requête textuelle
- Le système interroge le `search_vector` (nom + description + VALUE TEXTE/MARKDOWN)
- Résultats triés par pertinence
- Chaque résultat affiche : nom, type d'entité, CLA, extrait contextuel

### F31 — Navigation TORG → ORG
Voir F12.

### F32 — Navigation TENV → ENV
Voir F16.

---

## Module 10 — Terminal IA

### F33 — Requête RAG
**Acteurs** : tous

- L'utilisateur saisit une question en langage naturel
- Le système sélectionne le LLM configuré (local ou distant)
- Le RAG interroge les données structurées (ORG, ENV, ENG, EVENT, OBJ, VALUE, PROP)
- La réponse est affichée avec les sources référencées
- RF-18 : les DOC et IMG ne font pas partie du périmètre RAG
- RF-19 : le Terminal IA respecte les droits d'accès du USER connecté

### F34 — Sélection du LLM
**Acteurs** : `ADMIN`, `EDITEUR`, `LECTEUR`

- Sélectionner parmi les LLM configurés (distants ou local)
- Le LLM local (Ollama) est proposé en priorité pour les requêtes légères

---

## Module 11 — Rapport d'activité (RPT)

### F35 — Générer un rapport ORG
**Acteurs** : `ADMIN`, `EDITEUR`, `LECTEUR`

- Sélectionner une ORG
- Déclencher la génération (manuel)
- Le rapport Markdown inclut :
  - Fiche OBJ de l'ORG (nom, description, PROP/VALUE, images)
  - Liste des ENG de l'ORG avec leurs EVENTs
  - Images (IMG) de chaque élément

### F36 — Générer un rapport ENV
**Acteurs** : `ADMIN`, `EDITEUR`, `LECTEUR`

Identique à F35 pour un ENV.

### F37 — Exporter un rapport
**Acteurs** : `ADMIN`, `EDITEUR`, `LECTEUR`

- Choisir la destination : filesystem local ou vault Obsidian
- Le fichier est nommé automatiquement : `[type]-[nom]-[date].md`
- RF-20 : si le vault Obsidian n'est pas configuré, seul le filesystem est disponible

---

## Module 12 — API REST

### F38 — Authentification API
**Acteurs** : applications externes, scripts

- Chaque appel API est authentifié par token
- Le token est associé à un USER — les permissions ROLE s'appliquent

### F39 — Endpoints CRUD
**Acteurs** : applications externes selon ROLE

Le système expose des endpoints REST pour toutes les entités du domaine :

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/org` | Liste des ORG |
| GET | `/api/org/{id}` | Détail d'une ORG |
| POST | `/api/org` | Créer une ORG |
| PUT | `/api/org/{id}` | Modifier une ORG |
| DELETE | `/api/org/{id}` | Supprimer une ORG |
| GET | `/api/env` | Liste des ENV |
| GET | `/api/eng` | Liste des ENG |
| GET | `/api/eng/{id}/gantt` | Gantt Mermaid d'un ENG |
| GET | `/api/event` | Liste des EVENT |
| GET | `/api/search?q=` | Recherche full-text |
| POST | `/api/rpt/org/{id}` | Générer un rapport ORG |
| POST | `/api/rpt/env/{id}` | Générer un rapport ENV |
| GET | `/api/log` | Consultation du journal (ADMIN) |

> Documentation complète générée automatiquement par FastAPI (Swagger/OpenAPI).

---

## Module 13 — Journal des opérations (LOG)

### F40 — Consultation du LOG
**Acteurs** : `ADMIN`

- Filtrer par : table, entité, USER, période, type d'opération
- Afficher l'état avant/après pour chaque opération
- Permet de retracer l'historique complet y compris des éléments supprimés
