# Glossaire du domaine — be.CLEAR

## Partie "Activité"

### ORG — Organisation
Entité utilisatrice de l'application. Une ORG représente toute organisation qui pilote des interactions avec son environnement.

- Typée par exactement 1 **TORG** à la fois (peut changer dans le temps)
- Possède 0..n **USER**
- Reliée à exactement 1 **OBJ**
- Porte les métadonnées système (`created_at`, `updated_at`, `created_by`, `updated_by`)

---

### ENV — Environnement
Entité représentant l'environnement avec lequel une ORG interagit. Un ENV est externe à l'ORG.

- Typé par exactement 1 **TENV** à la fois (peut changer dans le temps)
- Relié à exactement 1 **OBJ**
- Porte les métadonnées système

---

### ENG — Engagement
Interaction formelle entre 1..n ORG et 1..n ENV. C'est l'unité centrale de pilotage de l'activité.

- Typé par exactement 1 **TENG**
- Composé de 1..n **EVENT** séquentiels, ordonnés par `date_heure_prevue`
- Possède quatre dates : `date_début`, `date_début_prévue`, `date_fin`, `date_fin_prévue`
- La `date_fin_prévue` et l'état d'accomplissement sont calculés à partir des EVENTs
- Visualisable sous forme de diagramme de Gantt (Mermaid)
- Relié à exactement 1 **OBJ**
- Porte les métadonnées système

---

### EVENT — Évènement
Unité atomique d'un ENG. Représente une action ou un fait survenu dans le cadre d'un engagement.

- Appartient à exactement 1 **ENG**
- Typé par exactement 1 **TEVENT**
- Possède `date_heure_prevue` (planifiée) et `date_heure_reelle` (effective, NULL jusqu'à réalisation)
- L'ordre dans l'ENG est déterminé par `date_heure_prevue`
- Sa durée prévue par défaut est héritée de son **TEVENT** (valeur + unité)
- À la création, le système suggère `date_heure_prevue` = `date_heure_prevue du précédent EVENT` + `durée du TEVENT précédent`
- **Règle de cohérence** : `date_heure_prevue` du 1er EVENT ne peut pas être antérieure à `date_début` de l'ENG
- Un EVENT est considéré **accompli** lorsque `date_heure_reelle` est renseignée
- Relié à exactement 1 **OBJ**
- Porte les métadonnées système

---

### USER — Utilisateur / Acteur
Tout acteur interagissant avec le système, humain ou automatisé.

- Typé par exactement 1 **TUSER** (nature)
- Les USER humains possèdent 1 **ROLE** (permission) et sont rattachés à exactement 1 **ORG**
- Les USER humains sont reliés à 1 identifiant technique externe (annuaire auth : LDAP, OAuth...)
- Les USER non-humains (système, cron, IA...) ne sont pas rattachés à une ORG, sont hors système de ROLE et agissent avec les droits ADMIN
- Relié à exactement 1 **OBJ**
- Toutes les actions des USER (humains et non-humains) sont tracées dans le **LOG**
- Porte les métadonnées système

---

### ROLE — Rôle
Niveau de permission d'un USER humain. Liste fixe à 3 valeurs.

| Valeur | Permissions |
|--------|-------------|
| **ADMIN** | Modifie les classes (CLA, PROP), les types (TORG, TENV, TENG, TEVENT), la configuration (CONFIG) |
| **EDITEUR** | Crée et modifie les objets (ORG, ENV, ENG, EVENT, VALUE...) |
| **LECTEUR** | Accès en lecture seule |

---

### TORG — Type d'Organisation
Classification hiérarchique des ORG. Structure arborescente (dossiers et feuilles).

- Tout nœud de l'arbre peut accueillir une ORG (pas uniquement les feuilles)
- Appartient à exactement 1 **CLA** (détermine les PROP/VALUE des ORG de ce type)
- Hérite du comportement et du visuel de sa CLA
- Porte les métadonnées système

---

### TENV — Type d'Environnement
Classification hiérarchique des ENV. Structure arborescente identique à TORG.

- Tout nœud de l'arbre peut accueillir un ENV
- Appartient à exactement 1 **CLA**
- Hérite du comportement et du visuel de sa CLA
- Porte les métadonnées système

---

### TENG — Type d'Engagement
Classification des ENG. Liste plate (pas de hiérarchie).

- Appartient à exactement 1 **CLA**
- Porte les métadonnées système

---

### TEVENT — Type d'Évènement
Classification des EVENT. Liste plate.

- Appartient à exactement 1 **CLA**
- Porte la **durée prévue par défaut** d'un EVENT de ce type (valeur + unité : secondes, minutes, heures, jours, mois...)
- Porte les métadonnées système

---

### TUSER — Type d'Utilisateur
Classification de la nature d'un USER. Liste plate. Exemples : humain, système, cron, IA.

- Classificateur de nature uniquement — n'appartient pas à une CLA
- Détermine si le USER est rattaché à une ORG et soumis au système de ROLE
- Porte les métadonnées système

---

## Partie "Objet"

> **Fondement** : OOP classique. CLA = classe, OBJ = instance, PROP = attribut, VALUE = valeur d'attribut.

---

### OBJ — Objet
Instance associée à chaque entité du domaine. Porte l'identité, les données descriptives et les valeurs des propriétés de l'entité.

Chaque **ORG**, **ENG**, **ENV**, **EVENT** et **USER** est relié à exactement 1 OBJ.

**Champs système de OBJ :**

| Champ | Type | Description |
|-------|------|-------------|
| `uid` | UUID | Identifiant universel unique |
| `nom` | String | Nom de l'objet |
| `description` | Markdown | Description libre |
| `created_at` | DateTime | Date de création |
| `updated_at` | DateTime | Date de dernière modification |
| `created_by` | USER | Acteur créateur |
| `updated_by` | USER | Acteur modificateur |

L'OBJ peut également avoir :
- 0..n **IMG** (dont 1 désignée comme image principale)
- 0..n **DOC**
- 1 **VALUE** par **PROP** de sa **CLA** (propres + héritées)

---

### CLA — Classe
Définit le schéma (PROP) d'un OBJ. Inspirée de la notion de classe en OOP.

- Possède 0..n **PROP** propres (0 PROP = étiquette typologique pure)
- Peut hériter d'au plus 1 super-classe CLA (héritage simple)
- Une sous-classe hérite de toutes les PROP de sa super-classe (et de toute la chaîne)
- Possède un **texte de comportement** (Markdown)
- Possède un **visuel** : icône ou image — hérité de la super-classe par défaut, surchargeable
- Porte les métadonnées système

---

### PROP — Propriété
Attribut défini sur une CLA. Hérité par toutes les sous-classes.

- Possède un **type de données** parmi :

| Type | Description |
|------|-------------|
| `DATE` | Date calendaire |
| `HEURE` | Heure du jour |
| `DATETIME` | Date + heure |
| `DUREE` | Durée (valeur + unité) |
| `TEXTE` | Texte libre court |
| `MARKDOWN` | Texte riche formaté en Markdown |
| `ENTIER` | Nombre entier |
| `DECIMAL` | Nombre décimal |
| `MONTANT` | Valeur monétaire (avec devise) |
| `POURCENTAGE` | Valeur entre 0 et 100 |
| `BOOLEEN` | Vrai / Faux |
| `LISTE` | Valeur tirée d'une liste à choix prédéfinie |
| `URL` | Lien web |
| `EMAIL` | Adresse email |
| `TELEPHONE` | Numéro de téléphone |
| `REFERENCE` | Référence vers un autre OBJ du système |
| `COORDONNEES` | Coordonnées géographiques (latitude / longitude) |

- Porte les métadonnées système

---

### VALUE — Valeur
Valeur d'une PROP pour un OBJ donné.

- Exactement 1 VALUE par PROP (propre ou héritée) par OBJ
- Le type de la VALUE est déterminé par le type de sa PROP
- Porte les métadonnées système

---

### IMG — Image
Image attachée à un OBJ.

- Un OBJ peut avoir 0..n IMG
- L'une d'elles est désignée comme **image principale**
- Porte les métadonnées système

---

### DOC — Document
Document attaché à un OBJ.

- Un OBJ peut avoir 0..n DOC
- Format préférentiel : Markdown
- Formats acceptés : Microsoft Office (Word, Excel, PowerPoint...)
- Porte les métadonnées système

---

## Système

---

### LOG — Journal des opérations
Enregistre toutes les opérations (création, modification, suppression) effectuées sur tous les éléments du système par tous les acteurs (USER humains et non-humains).

Permet de retracer l'historique complet, y compris des éléments supprimés qui n'existent plus dans le système.

---

### RPT — Rapport d'activité
Rapport Markdown généré à la demande pour une ORG ou un ENV.

- **Contenu** : activité de l'entité — ENGs et EVENTs associés, données, images (IMG) de chaque élément
- **Déclenchement** : manuel uniquement
- **Destinations** : filesystem local ou coffre Obsidian (vault)

---

### CONFIG — Configuration globale
Paramètres globaux de l'application.

- Chemin vers le vault Obsidian
- 0..n LLM distants (Claude, OpenAI, etc.)
- 0..1 LLM local (Ollama — instance partageable entre applications)
