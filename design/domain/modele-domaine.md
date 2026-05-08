# Modèle de domaine — be.CLEAR

## Vue d'ensemble

Le domaine est organisé en deux parties complémentaires :
- **Activité** : les entités métier (ORG, ENV, ENG, EVENT, USER) et leurs types
- **Objet** : le système de description générique inspiré de l'OOP (OBJ, CLA, PROP, VALUE)

Chaque entité de la partie Activité est reliée à un OBJ de la partie Objet. Le TYPE de l'entité détermine sa CLA, donc ses PROP disponibles, son comportement et son visuel.

---

## Diagramme 1 — Partie Activité

```mermaid
erDiagram
    ORG }|--|{ ENG : "participe à"
    ENV }|--|{ ENG : "impliqué dans"
    ENG ||--|{ EVENT : "composé de"
    ORG ||--|{ USER : "possède"

    ORG }|--|| TORG : "typée par"
    ENV }|--|| TENV : "typée par"
    ENG }|--|| TENG : "typé par"
    EVENT }|--|| TEVENT : "typé par"
    USER }|--|| TUSER : "de nature"
    USER }|--|| ROLE : "a"
    TENG ||--o{ TENG_TEVENT_TEMPLATE : "séquence auto"
    TENG_TEVENT_TEMPLATE }|--|| TEVENT : "référence"

    ORG {
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    ENV {
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    ENG {
        datetime date_debut
        datetime date_debut_prevue
        datetime date_fin
        datetime date_fin_prevue
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    EVENT {
        datetime date_heure_prevue
        datetime date_heure_reelle
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    TEVENT {
        number duree_prevue_valeur
        string duree_prevue_unite
    }
    USER {
        string auth_externe
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    ROLE {
        string valeur "ADMIN | EDITEUR | LECTEUR"
    }
    TUSER {
        string valeur "humain | système | cron | IA | ..."
    }
```

---

## Diagramme 2 — Partie Objet

```mermaid
erDiagram
    OBJ }|--|| CLA : "instance de"
    CLA ||--o{ PROP : "possède"
    CLA }o--o| CLA : "hérite de (super-classe)"
    OBJ ||--o{ VALUE : "a"
    VALUE }|--|| PROP : "valorise"
    OBJ ||--o{ IMG : "a"
    OBJ ||--o{ DOC : "a"

    OBJ {
        uuid uid
        string nom
        markdown description
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    CLA {
        markdown comportement
        string visuel "icône ou image"
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    PROP {
        string nom
        string type "DATE | TEXTE | ENTIER | DECIMAL | MONTANT | BOOLEEN | LISTE | URL | EMAIL | TELEPHONE | REFERENCE | COORDONNEES | HEURE | DATETIME | DUREE | MARKDOWN | POURCENTAGE"
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    VALUE {
        string valeur
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    IMG {
        boolean principale
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
    DOC {
        string format "markdown | office"
        datetime created_at
        datetime updated_at
        ref created_by
        ref updated_by
    }
```

---

## Diagramme 3 — Lien Activité ↔ Objet

```mermaid
erDiagram
    ORG ||--|| OBJ : "décrit par"
    ENV ||--|| OBJ : "décrit par"
    ENG ||--|| OBJ : "décrit par"
    EVENT ||--|| OBJ : "décrit par"
    USER ||--|| OBJ : "décrit par"

    TORG }|--|| CLA : "appartient à"
    TENV }|--|| CLA : "appartient à"
    TENG }|--|| CLA : "appartient à"
    TEVENT }|--|| CLA : "appartient à"
```

---

## Diagramme 4 — Hiérarchie des CLA

```mermaid
classDiagram
    class CLA {
        +String nom
        +Markdown comportement
        +String visuel
        +PROP[] proprietes_propres
        +CLA superClasse
    }
    class PROP {
        +String nom
        +TypePROP type
    }
    class OBJ {
        +UUID uid
        +String nom
        +Markdown description
        +VALUE[] valeurs
        +IMG[] images
        +DOC[] documents
    }

    CLA <|-- CLA : héritage simple
    CLA "1" *-- "0..*" PROP : possède
    OBJ "*" --> "1" CLA : instance de
    OBJ "1" *-- "0..*" VALUE : a
    OBJ "1" *-- "0..*" IMG : a
    OBJ "1" *-- "0..*" DOC : a
```

---

## Règles de gestion

| # | Règle |
|---|-------|
| R01 | Un ENG implique 1..n ORG et 1..n ENV |
| R02 | Un EVENT appartient à exactement 1 ENG |
| R03 | Les EVENTs d'un ENG sont ordonnés par `date_heure_prevue` |
| R04 | `date_heure_prevue` du 1er EVENT ne peut pas être antérieure à `date_début` de l'ENG |
| R05 | À la création d'un EVENT, le système suggère `date_heure_prevue` = `date_heure_prevue précédent EVENT` + `durée TEVENT précédent` |
| R05b | Un EVENT est accompli quand `date_heure_reelle` est renseignée |
| R06 | Chaque ORG, ENV, ENG, EVENT et USER est relié à exactement 1 OBJ |
| R07 | Un OBJ appartient à exactement 1 CLA |
| R08 | Une CLA hérite d'au plus 1 super-classe (héritage simple) |
| R09 | Un OBJ a exactement 1 VALUE par PROP (propres + héritées) de sa CLA |
| R10 | Un OBJ peut avoir 0..n IMG dont exactement 1 désignée image principale |
| R11 | Une ORG peut changer de TORG dans le temps (historique conservé dans `org_torg_history`) |
| R11b | Un ENV peut changer de TENV dans le temps (historique conservé dans `env_tenv_history`) |
| R12 | Un USER humain appartient à exactement 1 ORG et possède 1 ROLE |
| R13 | Les USER non-humains sont hors système de ROLE et agissent avec droits ADMIN |
| R14 | Toute opération (création, modification, suppression) est tracée dans le LOG |
| R15 | Une sous-classe hérite du visuel de sa super-classe par défaut, mais peut le surcharger |
