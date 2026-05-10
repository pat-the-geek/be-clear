# Serveur MCP be.CLEAR

## Présentation

Le serveur MCP (*Model Context Protocol*) de be.CLEAR permet à Claude Desktop — et à tout client compatible MCP — d'accéder directement aux données du système et d'y effectuer des opérations, en langage naturel, sans passer par l'interface web.

**Ce que ça change concrètement :** l'utilisateur peut taper dans Claude Desktop « Quels sont les ENGs en retard pour ACME Corp ? » et Claude interroge be.CLEAR en temps réel, synthétise les résultats, et peut même proposer de marquer un EVENT comme accompli — après confirmation.

---

## Architecture

```
Claude Desktop
      │  stdio (subprocess)
      ▼
mcp_server.py              ← point d'entrée
      │
      ├── app/mcp/server.py       ← instance FastMCP
      ├── app/mcp/tools/read.py   ← outils lecture (→ DB directe)
      ├── app/mcp/tools/write.py  ← outils écriture (→ API REST be.CLEAR)
      ├── app/mcp/resources.py    ← ressources beclear:// + prompts
      ├── app/mcp/auth.py         ← token API → USER + ROLE
      └── app/mcp/db.py           ← session SQLAlchemy standalone

      │  httpx (écriture uniquement)
      ▼
backend FastAPI :8000       ← validation métier, Gantt, Meilisearch, LOG
      │
      ▼
PostgreSQL + pgvector        ← source de vérité
```

**Lecture** : accès direct à la base (SQLAlchemy async) — rapide, sans overhead HTTP.  
**Écriture** : passe par l'API REST existante — toutes les règles métier, le Gantt, l'indexation Meilisearch et le LOG sont automatiquement appliqués.

---

## Installation et démarrage

### Prérequis

- be.CLEAR backend en cours d'exécution (`http://localhost:8000`)
- Python 3.11+ avec `mcp>=1.0` installé (`pip install "mcp>=1.0"`)
- Un token API be.CLEAR (créé par un ADMIN dans *Administration → Tokens*)

### Mode stdio — Claude Desktop (recommandé)

Ajouter dans `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) :

```json
{
  "mcpServers": {
    "beclear": {
      "command": "python3",
      "args": ["/chemin/absolu/vers/backend/mcp_server.py"],
      "env": {
        "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/beclear",
        "SECRET_KEY": "<SECRET_KEY du .env>",
        "BECLEAR_API_TOKEN": "<token généré dans l'interface admin>",
        "BECLEAR_API_URL": "http://localhost:8000"
      }
    }
  }
}
```

Redémarrer Claude Desktop — l'icône 🔌 confirme la connexion.

### Mode SSE — Docker (accès réseau)

Ajouter `BECLEAR_MCP_TOKEN=<token>` dans le `.env` racine, puis :

```bash
docker compose --profile mcp up
```

Le serveur SSE écoute sur `http://localhost:8001/sse`.  
Connexion depuis Claude Desktop (mode SSE distant) :

```json
{
  "mcpServers": {
    "beclear": {
      "type": "sse",
      "url": "http://localhost:8001/sse"
    }
  }
}
```

---

## Outils disponibles

### Lecture

| Outil | Description | Paramètres clés |
|-------|-------------|-----------------|
| `health` | Vérifie la connectivité (PostgreSQL, Meilisearch) | — |
| `search` | Recherche full-text Meilisearch | `query`, `entity_type` (org\|env\|eng\|event) |
| `rag_query` | Question en langage naturel (RAG + LLM Ollama) | `question`, `llm_id` |
| `list_orgs` | Liste les ORG avec filtre optionnel | `q`, `limit` |
| `get_org` | Fiche complète d'une ORG (propriétés, ENGs) | `org_id` |
| `list_engs` | Liste les ENG avec filtres | `org_id`, `env_id`, `status` (actif\|en_cours\|clos), `limit` |
| `list_engs_sans_events` | ENGs actifs sans EVENT futur planifié | `limit` |
| `get_eng` | ENG complet : EVENTs, avancement, diagramme optionnel | `eng_id`, `diagram` (""\|"timeline"\|"gantt") |
| `list_envs` | Liste les ENV avec filtre optionnel | `q`, `limit` |
| `get_env` | Fiche complète d'un ENV | `env_id` |
| `list_tevents` | Liste les types d'EVENT (TEVENT) avec leurs IDs | — |
| `list_events_due` | EVENTs prévus dans un intervalle | `date_debut`, `date_fin` (ISO), `inclure_accomplis` |
| `get_overdue_events` | EVENTs en retard (non accomplis, date dépassée) | `limit` |

**Notes :**

- **`health`** : à appeler en premier dans toute campagne de tests pour valider la connectivité avant les appels plus lourds.
- **`search`** : nécessite que **Meilisearch soit accessible depuis le processus MCP**. En mode stdio (Claude Desktop), ajouter `"MEILISEARCH_URL": "http://localhost:7700"` dans la section `"env"` de `claude_desktop_config.json`. En mode SSE Docker, la configuration est automatique. Si Meilisearch est indisponible, utiliser `list_orgs`, `list_engs` (filtre `q`) ou `rag_query` comme alternatives.
- **`rag_query`** : dépend d'Ollama (LLM local). Timeout de 90 secondes — si Ollama est inaccessible ou surchargé, un message d'erreur explicite est retourné. Pour les questions temporelles précises (retards, jalons), préférer `get_overdue_events` et `list_events_due` qui sont déterministes.
- **`list_tevents`** : indispensable avant `create_event` — fournit les `tevent_id` valides.
- **`get_eng`** avec `diagram="gantt"` ou `diagram="timeline"` : retourne une **image PNG** affichée directement dans Claude Desktop (matplotlib requis). Barres colorées : vert=accompli, violet=planifié, rouge=en retard ; grille H+V ; marqueur Aujourd'hui ambre ; sections par TEVENT. **Si matplotlib est absent** (mode stdio sans installation locale), le diagramme est retourné en Mermaid avec un avertissement. Sans paramètre : pas de diagramme (réponse texte légère).
  > **Mode stdio** : installer matplotlib dans le Python utilisé par `mcp_server.py` : `pip install matplotlib`

### Écriture (rôle EDITEUR requis)

| Outil | Description | Paramètres clés |
|-------|-------------|-----------------|
| `create_event` | Crée un EVENT dans un ENG | `eng_id`, `nom`, `tevent_id`, `date_heure_prevue`, `description` |
| `mark_event_done` | Marque un EVENT accompli | `event_id`, `date_heure_reelle` (optionnel, défaut = maintenant) |
| `update_value` | Met à jour la valeur d'une propriété (PROP) | `obj_id`, `prop_nom`, `valeur` |

> Les outils d'écriture passent par l'API REST be.CLEAR — toutes les règles métier s'appliquent (RF-15 sur les dates, recalcul Gantt, indexation Meilisearch, journal LOG).
>
> **`update_value`** : l'`obj_id` est l'identifiant de la couche objet sous-jacente (visible dans `get_org`/`get_eng` sous le champ `obj_id`), **distinct** de l'ID de l'ORG ou de l'ENG. La résolution suit la chaîne d'héritage de CLA : les propriétés héritées de la super-classe sont également accessibles.
>
> **`mark_event_done`** : un avertissement non bloquant est émis si l'écart entre la date réelle fournie et la date prévue dépasse 30 jours.

---

## Ressources `beclear://`

Les ressources sont des données déclaratives que Claude peut lire directement, sans appel d'outil explicite.

| URI | Contenu |
|-----|---------|
| `beclear://orgs` | Répertoire de toutes les ORG |
| `beclear://envs` | Répertoire de tous les ENV |
| `beclear://org/{org_id}` | Fiche complète d'une ORG |
| `beclear://eng/{eng_id}/gantt` | Diagramme Timeline Mermaid d'un ENG (code pré-calculé par be.CLEAR) |

> Pour le **Gantt avec palette orange**, utiliser l'outil `get_eng(eng_id, diagram="gantt")` plutôt que la ressource `beclear://eng/{eng_id}/gantt`.

---

## Prompts types

Les prompts sont des **gabarits de requête** prédéfinis, accessibles depuis Claude Desktop via le menu `/` ou en les invoquant par leur nom. Chacun guide Claude pour assembler plusieurs outils en une réponse structurée.

### 1. `briefing_org` — Briefing avant réunion

```
/briefing_org org_nom="ACME Corp"
```

Compile la fiche ORG, les ENGs actifs, les prochains jalons et les points d'attention. Format : note de briefing lisible en 2 minutes.

**Outils utilisés :** `list_orgs` → `get_org` → `list_engs` → `list_events_due`

---

### 2. `avancement_eng` — État d'avancement d'un ENG

```
/avancement_eng eng_id="42"
```

Ratio EVENTs accomplis/total, liste des retards, diagramme Gantt, estimation date de fin réelle vs prévue.

**Outils utilisés :** `get_eng`

---

### 3. `jalons_semaine` — Jalons de la semaine

```
/jalons_semaine
/jalons_semaine date_debut="2025-06-09"
```

Liste tous les EVENTs de la semaine, groupés par jour, distingue ✅ accomplis et ⏳ en attente. Signale les retards.

**Outils utilisés :** `list_events_due` → `get_overdue_events`

---

### 4. `engs_en_retard` — Détection des retards

```
/engs_en_retard
/engs_en_retard org_nom="ACME Corp" seuil_jours="14"
```

Identifie les ENGs dont des EVENTs ont dépassé leur date prévue. Tableau de criticité : 🔴 critique / 🟠 élevé / 🟡 modéré.

**Outils utilisés :** `get_overdue_events` → `list_engs`

---

### 5. `historique_interactions` — Historique ORG ↔ ENV

```
/historique_interactions org_nom="ACME Corp" env_nom="Territoire Nord" n_mois="6"
```

Remonte tous les ENGs reliant cette ORG à cet ENV sur la période. Analyse la régularité des interactions.

**Outils utilisés :** `list_orgs` → `search` → `list_engs` → `get_eng`

---

### 6. `onboarding_eng` — Création guidée d'un ENG

```
/onboarding_eng org_nom="ACME Corp" env_nom="Production"
/onboarding_eng org_nom="ACME Corp" env_nom="Production" type_eng="Déploiement"
```

Guide pas à pas la création d'un ENG : consultation des précédents, proposition d'un plan d'EVENTs, création après confirmation.

**Outils utilisés :** `list_orgs` → `search` → `list_engs` → `create_event`

---

### 7. `rapport_activite_org` — Rapport d'activité

```
/rapport_activite_org org_nom="ACME Corp" date_debut="2025-01-01" date_fin="2025-06-30"
```

Rapport Markdown complet : présentation de l'ORG, synthèse chiffrée, détail des ENGs et EVENTs. Prêt à exporter vers Obsidian.

**Outils utilisés :** `list_orgs` → `get_org` → `list_engs` → `get_eng`

---

### 8. `comparaison_orgs` — Comparaison de deux ORG

```
/comparaison_orgs org_nom_1="ACME Corp" org_nom_2="Beta SAS" n_mois="3"
```

Tableau comparatif : nombre d'ENGs, taux d'accomplissement, types d'ENV fréquentées, retards.

**Outils utilisés :** `list_orgs` → `list_engs` (x2) → `get_eng`

---

### 9. `suivi_env` — Vue transversale d'un ENV

```
/suivi_env env_nom="Territoire Nord"
```

Liste les ORGs actives avec cet ENV, date du dernier EVENT accompli par ORG, prochain jalon prévu, ORGs sans activité récente.

**Outils utilisés :** `search` → `list_engs` → `list_events_due`

---

### 10. `diagnostic_obj` — Complétude d'une fiche

```
/diagnostic_obj entity_type="org" nom="ACME Corp"
/diagnostic_obj entity_type="eng" nom="Déploiement Q2"
```

Vérifie que toutes les PROPs sont renseignées, la description rédigée, une image principale présente. Retourne un score de complétude en % et la liste des champs manquants.

**Outils utilisés :** `search` → `get_org` / `get_eng` / `get_env`

---

## Exemples de conversations

### Exemple 1 — Consultation simple

> *« Quelles sont les organisations actives dans be.CLEAR ? »*

Claude appelle `list_orgs` et présente la liste en langage naturel.

---

### Exemple 2 — Analyse avec RAG

> *« Y a-t-il des retards dans les engagements du mois de mai ? »*

Claude appelle `get_overdue_events` puis `rag_query` pour synthétiser avec contexte.

---

### Exemple 3 — Action guidée

> *« Marque l'EVENT #17 comme accompli. »*

Claude présente l'EVENT récupéré via `get_eng`, demande confirmation, puis appelle `mark_event_done`. Le Gantt de l'ENG est recalculé automatiquement.

---

### Exemple 4 — Workflow complet avec un prompt

> *« /briefing_org org_nom="Mairie de Lyon" »*

1. Claude cherche l'ORG → `list_orgs`
2. Récupère sa fiche → `get_org`
3. Liste ses ENGs actifs → `list_engs`
4. Récupère les jalons à venir → `list_events_due`
5. Synthétise en une note de briefing structurée

---

## Sécurité

| Aspect | Comportement |
|--------|-------------|
| **Authentification** | Chaque appel MCP est authentifié via le token API be.CLEAR (`BECLEAR_API_TOKEN`) |
| **Droits** | Le token hérite du rôle be.CLEAR du USER associé (LECTEUR, EDITEUR, ADMIN) |
| **Outils lecture** | Accessibles à tous les rôles |
| **Outils écriture** | Refusés si le rôle est LECTEUR — retournent un message d'erreur explicite |
| **Journal** | Toutes les écritures MCP sont tracées dans le LOG be.CLEAR avec le USER du token |
| **Révocation** | Le token peut être désactivé à tout moment dans *Administration → Tokens* |
