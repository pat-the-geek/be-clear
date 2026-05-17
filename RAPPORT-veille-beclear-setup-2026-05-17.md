# Rapport de paramétrage — Module Veille informationnelle be.CLEAR

**Projet :** be.CLEAR × WUDD.ai
**Date :** 2026-05-17
**Réf. spec :** `spec-veille-beclear-wuddai-v1.2.md` / `prompt-claudecode-beclear.md`
**Accès utilisé :** API REST FastAPI (`http://localhost:8000`) — le serveur MCP `beclear:` n'était pas connecté dans l'environnement Claude Code ; bascule sur l'API REST directe (auth JWT, compte `admin`, rôle ADMIN).
**Mode :** paramétrage seul (aucune modification de code, aucune donnée existante supprimée).

---

## Résultats diagnostic (étape 0)

- [x] **Santé serveur** : `GET /health` → `{"status":"ok","version":"0.1.0"}`. Containers Docker `beclear-db-1` (PostgreSQL, *healthy*) et `beclear-search-1` (Meilisearch, *healthy*) opérationnels ; API répond donc PostgreSQL connecté ; réindexation Meilisearch testée OK (`POST /api/search/reindex` → `{"reindexed":7}`).
- [x] **Filtrage PROP via search : NON supporté (structuré) / partiellement (plein-texte).**
  - La forme de la spec `GET /api/search?entity_type=eng&prop=watch_entity&val=test` renvoie **HTTP 422** : le paramètre `q` (≥ 2 car.) est **obligatoire**, et `prop`/`val` ne sont **pas** des paramètres reconnus (ignorés silencieusement par FastAPI).
  - `GET /api/search` n'expose qu'une recherche **plein-texte Meilisearch** sur `q`, filtrable seulement par `entity_type` (`org|env|eng|event`). L'index contient `nom` + `description` + `values_text` (concaténation des `valeur_texte`). Après réindexation, une recherche `q=Donald Trump&entity_type=eng` retrouve bien l'ENG #1 — mais via plein-texte, **pas** via un filtre structuré `PROP = valeur`.
  - Aucun endpoint (`/api/search`, `/api/eng`, `/api/event`) n'offre de filtre structuré par valeur de PROP. Filtres structurés disponibles : `/api/eng?teng_id=`, `/api/event?eng_id=&tevent_id=&accompli=&date_from=&date_to=`.
- [x] **PROP dans payload `create_event` : ACCEPTÉES dans le POST initial** (aucun PATCH nécessaire).
  - Le payload réel n'est **pas** `props={"IMPACT":"faible"}` (dict nommé) mais un tableau structuré `values: [{ "prop_id": <int>, "valeur_texte": "..." }, ...]` (schéma `ValueIn`). Pour les PROP de type `LISTE`/`TEXTE`/`URL`, la valeur va dans `valeur_texte`.
  - Preuve concrète : EVENT #1 créé en un seul POST avec ses 4 PROP communes — relu via `GET /api/event/1` : `IMPACT=majeur, VALENCE=négatif, TEMPORALITE=ponctuel, CONFIANCE=vérifié`. ✅
  - `PUT /api/event/{id}` et `PUT /api/eng/{id}` acceptent aussi `values: [...]` (upsert par `prop_id`) pour une mise à jour post-création.
- [x] **TEVENT préexistants confirmés (5)** : `Validation` (#1, cla 17) · `Réunion de lancement` (#2, cla 18) · `Livraison` (#3, cla 19) · `Clôture` (#4, cla 20) · `Point d'avancement` (#5, cla 21) — tous sous-classes de la CLA `Événement` (#5). Aucune CLA `Événement informationnel` préexistante.

---

## Paramétrage réalisé

- [x] **CLA `Événement informationnel` créée — ID : 41** (parent = CLA `Événement` #5).
  8 PROP communes créées :

  | PROP | prop_id | Type be.CLEAR | Valeurs liste |
  |---|---|---|---|
  | `IMPACT` | 1 | LISTE | faible, modéré, majeur, critique |
  | `VALENCE` | 2 | LISTE | positif, négatif, neutre, ambigu |
  | `TEMPORALITE` | 3 | LISTE | ponctuel, processus, tendance, signal_faible |
  | `CONFIANCE` | 4 | LISTE | vérifié, probable, douteux, désinformation |
  | `SOURCE` | 5 | TEXTE | — |
  | `URL` | 6 | URL | — |
  | `wudd_article_id` | 7 | TEXTE | — |
  | `wudd_url` | 8 | URL | — |

- [x] **21 TEVENT créés** — chaque TEVENT = sous-classe CLA de `Événement informationnel` (#41), héritant des 8 PROP communes, + PROP spécifiques. Durée = `duree_prevue_valeur` en `jours`.

  **Table de correspondance `code → tevent_id` (à transmettre au prompt Claude Workflow) :**

  | Code | tevent_id | cla_id | Libellé | Durée (j) | PROP spécifiques (prop_id) |
  |---|---|---|---|---|---|
  | `DECISION` | **6** | 42 | Décision politique ou juridique | 3 | juridiction#9 (TEXTE), portee#10 (LISTE: local/national/international) |
  | `ELECTION` | **7** | 43 | Élection / référendum | 1 | juridiction#11 (TEXTE), portee#12 (LISTE) |
  | `NOMINATION` | **8** | 44 | Nomination / destitution | 1 | portee#13 (LISTE) |
  | `ACCORD` | **9** | 45 | Accord / traité / convention | 3 | juridiction#14 (TEXTE), portee#15 (LISTE) |
  | `SANCTION` | **10** | 46 | Sanction / embargo | 3 | juridiction#16 (TEXTE), portee#17 (LISTE) |
  | `ATTENTAT` | **11** | 47 | Attentat / acte terroriste | 2 | victimes#18 (LISTE: aucune/matérielles/humaines) |
  | `CONFLIT` | **12** | 48 | Conflit armé / offensive | 7 | victimes#19 (LISTE), statut_crise#20 (LISTE: en_cours/contenu/résolu) |
  | `CATASTROPHE` | **13** | 49 | Catastrophe naturelle ou industrielle | 7 | victimes#21 (LISTE), statut_crise#22 (LISTE) |
  | `INCIDENT` | **14** | 50 | Accident / incident technique | 2 | victimes#23 (LISTE), statut_crise#24 (LISTE) |
  | `CRISE` | **15** | 51 | Crise institutionnelle ou sociale | 14 | statut_crise#25 (LISTE) |
  | `DECOUVERTE` | **16** | 52 | Découverte / publication scientifique | 3 | domaine#26 (TEXTE) |
  | `LANCEMENT` | **17** | 53 | Lancement produit / service / loi | 3 | domaine#27 (TEXTE) |
  | `BREVET` | **18** | 54 | Dépôt ou litige IP | 3 | domaine#28 (TEXTE), acteurs#29 (TEXTE) |
  | `NAISSANCE` | **19** | 55 | Création — personne, org, concept | 1 | — |
  | `MORT` | **20** | 56 | Décès / dissolution / fermeture | 1 | — |
  | `COMMEMORATION` | **21** | 57 | Anniversaire / commémoration | 0 | — |
  | `MOBILISATION` | **22** | 58 | Grève / manifestation / pétition | 7 | portee#30 (LISTE) |
  | `TRANSACTION` | **23** | 59 | Fusion / acquisition / OPA | 3 | montant#31 (TEXTE), acteurs#32 (TEXTE) |
  | `INDICATEUR` | **24** | 60 | Publication d'un indicateur économique | 1 | domaine#33 (TEXTE), acteurs#34 (TEXTE) |
  | `RETOURNEMENT` | **25** | 61 | Correction ou inversion de narrative | 1 | event_ref#35 (TEXTE — event_id be.CLEAR corrigé) |
  | `NEUTRE` | **26** | 62 | Fait observable sans valence claire | 0 | — |

- [x] **3 PROP ajoutées au TENG `Veille informationnelle`** (TENG #5 → CLA #39) — ✅ :

  | PROP | prop_id | Type |
  |---|---|---|
  | `watch_entity` | 36 | TEXTE |
  | `contexte_editorial` | 37 | TEXTE |
  | `date_fin_prevue_justification` | 38 | TEXTE |

- [x] **PROP renseignées sur ENG #1 (Trump)** — ✅ (`PUT /api/eng/1` → HTTP 200) :
  - `watch_entity` = `Donald Trump`
  - `contexte_editorial` = `Veille sur le 2ème mandat présidentiel de Donald Trump`
  - `date_fin_prevue_justification` = `Fin de mandat présidentiel — janvier 2029 + rebondissements`

- [x] **2 EVENTs de test créés sur ENG #1 — IDs : 1, 2** (HTTP 201, vérifiés via `GET /api/eng/1`) — **puis supprimés** (nettoyage demandé, cf. dernière section) :
  - **EVENT #1** — `DECISION — TEST tarifs douaniers acier — 2026-05-17` · tevent 6 · `IMPACT=majeur, VALENCE=négatif, TEMPORALITE=ponctuel, CONFIANCE=vérifié` → `DELETE` HTTP 204 ✅
  - **EVENT #2** — `NEUTRE — TEST déclaration presse quotidienne — 2026-05-17` · tevent 26 · `IMPACT=faible, VALENCE=neutre, TEMPORALITE=ponctuel, CONFIANCE=probable` → `DELETE` HTTP 204 ✅
  - Preuve « PROP dans payload `create_event` » (étape 0d) capturée avant suppression : valeurs relues via `GET /api/event/{1,2}` conformes.

- [x] **EVENT borne créé sur ENG #1 — ID : 3** (à conserver — jalon fonctionnel, **pas** une donnée de test) :
  - **EVENT #3** — `Borne de veille — horizon fin de mandat présidentiel (31/12/2028)` · tevent 26 (NEUTRE, durée 0) · `date_heure_prevue = 2028-12-31T00:00:00`
  - Effet : `recalculate_eng` pose **`date_fin_prevue` de l'ENG #1 = 2028-12-31** ; `date_fin` reste `null` (ENG non clos, statut correct). Choix concepteur validé (`date_fin_prevue` étant un champ calculé non saisissable via l'API — cf. *Anomalies §7*).

> **Note — relation template TENG↔TEVENT non peuplée (volontaire).** Les 21 TEVENT n'ont **pas** été ajoutés à `teng_tevent_template` du TENG « Veille informationnelle ». Un ajout avait été testé puis **annulé** (décision concepteur) : cette relation déclenche l'auto-instanciation de 21 EVENTs vides à chaque création d'ENG de veille, comportement non souhaité ici — les EVENTs sont créés à la demande par le pipeline Claude Workflow à partir des articles. Les 21 TEVENT restent pleinement utilisables via `POST /api/event` (cf. payload type plus bas).

---

## Anomalies rencontrées

1. **Serveur MCP `beclear:` non branché côté agent** (outils absents) → paramétrage fait en REST direct (JWT admin). Le container `beclear-mcp-1` **tourne et est opérationnel** : SSE `http://localhost:8001/sse` → HTTP 200, `MCP_TRANSPORT=sse`, `BECLEAR_API_URL=http://backend:8000` (réseau Docker interne).

   **Vérification de parité PROP MCP vs REST (point 2) — NON à parité :**
   - **`create_event` (MCP) n'accepte AUCUNE PROP** : signature `create_event(eng_id, nom, tevent_id, date_heure_prevue, description="", cla_id=0)` — le corps POST vers `/api/event` force `"values": []`. Impossible de poser IMPACT/VALENCE/wudd_* à la création via MCP (le REST, lui, accepte `values:[…]` dans le même appel).
   - **Avantage MCP** : `cla_id=0` est auto-résolu depuis `tevent_id` (`tevent.cla_id`) → le pipeline n'a besoin que du `tevent_id`. Garde-fou anti-doublon : refus si même `nom`+`tevent_id`+`eng`.
   - **PROP à poser ensuite via `update_value(obj_id, prop_nom, valeur)`** : clé = **`prop_nom`** (nom, casse ignorée) et non `prop_id` ; résolution sur **toute la chaîne d'héritage** (les 8 PROP communes héritées de `Événement informationnel` sont donc accessibles) ; écrit **uniquement `valeur_texte`** (OK : toutes les PROP veille sont LISTE/TEXTE/URL).
   - **Verrou bloquant côté MCP** : `update_value` exige l'**`obj_id`** (≠ id EVENT). Or `create_event` (MCP) ne retourne que `EVENT #<id>` (pas d'`obj_id`), il n'existe **aucun outil MCP `get_event`/`list_events`**, et `get_eng` n'expose pas l'`obj_id` par EVENT. ⇒ **via MCP seul, impossible de récupérer l'`obj_id` d'un EVENT fraîchement créé pour lui poser ses PROP.** (Poser des PROP sur un **ENG** via MCP fonctionne : `get_eng` expose l'`obj_id` de l'ENG.)
   - **`search` (MCP)** : même Meilisearch plein-texte, param `query` (≠ `q`), pas de filtre PROP structuré — parité confirmée *sur la limitation*.
   - **Aucun outil d'écriture CLA/PROP/TEVENT/TENG en MCP** (seulement `create_event`, `mark_event_done`, `update_value`) → les étapes 1‑3 ne pouvaient de toute façon se faire qu'en REST.
   - **Conclusion** : pour créer des EVENTs de veille **avec PROP**, le pipeline Claude Workflow **doit utiliser le REST** (`POST /api/event` atomique). Le MCP convient pour lecture/triage (`search`, `get_eng`, `get_overdue_events`, `rag_query`), pose de PROP **au niveau ENG** (`update_value`), et `mark_event_done`.
2. **Notion d'« Obligatoire » des PROP non implémentée dans le modèle.** Le modèle `Prop` n'a aucun champ `obligatoire/required` ; `PropCreate` n'accepte que `nom`, `type`, `valeurs_liste`. Les colonnes « Obligatoire » de la spec (oui / recommandé / auto) **ne sont pas applicables** côté schéma — la contrainte de présence devra être garantie par le pipeline Claude Workflow lors de la création des EVENTs (validation applicative), pas par be.CLEAR.
3. **Aucun filtrage structuré par PROP** sur toute l'API (cf. étape 0). Impact pipeline : impossible de faire `GET …?prop=watch_entity&val=Donald Trump`. Voir contournements ci-dessous.
4. **`create_event` ignore la cohérence PROP/CLA** : l'endpoint insère les `Value` selon `prop_id` sans vérifier que la PROP appartient à la CLA de l'EVENT. Bénin ici (on passe les `prop_id` hérités corrects), mais le pipeline doit fournir des `prop_id` exacts (table ci-dessus) — un `prop_id` erroné créerait une VALUE orpheline silencieuse.
5. **`type` d'une PROP non modifiable après création** (`PUT /cla/{id}/prop/{prop_id}` ne change que le `nom`). Toute correction de type implique suppression/recréation de la PROP (cascade sur les VALUE).
6. **Nommage CLA/TEVENT = libellé spec** (le code `DECISION`… n'est porté que par la table de correspondance, pas stocké dans be.CLEAR — `Cla.nom` est unique global). Le mapping `code → tevent_id` est donc la clé d'intégration à conserver côté Claude Workflow.
7. **`date_fin_prevue` de l'ENG est un champ CALCULÉ, non saisissable via l'API.** `EngUpdate` ne l'expose pas ; `recalculate_eng` le réécrit à chaque création/modif/suppression d'EVENT comme `date_heure_prevue du dernier EVENT (+ durée de son TEVENT)` — sans EVENT → `null`. Conséquence pipeline : ne jamais écrire ce champ « en dur » (serait écrasé). Pour ancrer un horizon, créer un **EVENT borne** à la date voulue. ➜ **Traité pour l'ENG #1** : EVENT borne #3 au 31/12/2028 (NEUTRE, durée 0) → `date_fin_prevue` = 2028-12-31, `date_fin` reste `null` (ENG non clos). La PROP `date_fin_prevue_justification` reste renseignée.

---

## Points à transmettre au prompt Claude Workflow

- **Capacité filtrage PROP :** *aucun filtre structuré par PROP*. Pour retrouver l'ENG d'une entité surveillée à partir de `watch_entity` :
  - **Recommandé :** `GET /api/eng?teng_id=5&per_page=500` (liste tous les ENG de TENG « Veille informationnelle »), puis pour chaque ENG `GET /api/eng/{id}` et matcher `obj.values` où `prop_id=36` (`watch_entity`) — comparaison **casse exacte** côté pipeline.
  - **Alternative plein-texte :** `GET /api/search?q=<entité>&entity_type=eng` (après `POST /api/search/reindex` si des VALUE ont changé) — fonctionne mais approximatif (plein-texte, pas exact).
- **Mécanisme création PROP (POST ou PATCH) :** **POST** — `POST /api/event` accepte directement `values: [{prop_id, valeur_texte}]` dans le payload de création (aucun PATCH requis). Mise à jour ultérieure possible via `PUT /api/event/{id}` (même structure `values`, upsert par `prop_id`).
- **Payload type `create_event` (REST) :**
  ```json
  POST /api/event
  {
    "eng_id": 1,
    "tevent_id": 6,
    "cla_id": 42,
    "nom": "…",
    "date_heure_prevue": "2026-05-17T09:00:00",
    "values": [
      {"prop_id": 1, "valeur_texte": "majeur"},
      {"prop_id": 2, "valeur_texte": "négatif"},
      {"prop_id": 7, "valeur_texte": "<wudd_article_id>"},
      {"prop_id": 8, "valeur_texte": "<wudd_url>"}
    ]
  }
  ```
  Contraintes : `cla_id` **obligatoire** = `cla_id` du TEVENT choisi (colonne du tableau) ; `date_heure_prevue` ≥ `date_debut` de l'ENG (RF-15, ENG #1 = 2026-05-16) ; auth JWT, rôle ≥ EDITEUR.
- **prop_id des 8 PROP communes (héritées par les 21 TEVENT) :** IMPACT=1, VALENCE=2, TEMPORALITE=3, CONFIANCE=4, SOURCE=5, URL=6, wudd_article_id=7, wudd_url=8.
- **IDs des 21 TEVENT créés (`code → tevent_id` / `cla_id`) :** voir table « Paramétrage réalisé » ci-dessus. À utiliser tels quels : `tevent_id` ∈ [6..26], `cla_id` ∈ [42..62].
- **PROP du TENG Veille (sur ENG, prop_id) :** watch_entity=36, contexte_editorial=37, date_fin_prevue_justification=38 — mises via `PUT /api/eng/{id}` `values`.
- **Auth :** `POST /api/auth/login {"username":"admin","password":"admin"}` → `access_token` ; header `Authorization: Bearer <token>`. (Compte admin par défaut — à durcir avant production.)
- **Obligation des PROP :** non gérée par be.CLEAR → le pipeline doit garantir lui-même IMPACT/VALENCE/TEMPORALITE/CONFIANCE pour chaque EVENT.
- **Canal d'intégration : REST recommandé, pas MCP.** Le serveur MCP `beclear:` ne permet pas de créer un EVENT avec ses PROP (`create_event` force `values:[]`, et l'`obj_id` du nouvel EVENT n'est récupérable par aucun outil MCP → `update_value` inopérant sur un EVENT neuf). Utiliser `POST /api/event` (REST, PROP atomiques). MCP réservé au triage/lecture, à `mark_event_done`, et à `update_value` sur les PROP **d'ENG** uniquement. Détail complet en *Anomalies rencontrées §1*.

---

## Nettoyage ultérieur

**Déjà nettoyé** (suppression effectuée à la demande) :

- ~~EVENT #1 — `DECISION — TEST tarifs douaniers acier — 2026-05-17`~~ → supprimé (`DELETE /api/event/1` HTTP 204)
- ~~EVENT #2 — `NEUTRE — TEST déclaration presse quotidienne — 2026-05-17`~~ → supprimé (`DELETE /api/event/2` HTTP 204)

**À CONSERVER (ne pas supprimer)** :

- **EVENT #3** sur ENG #1 — `Borne de veille — horizon fin de mandat présidentiel (31/12/2028)` : jalon fonctionnel qui ancre `date_fin_prevue` de l'ENG #1. Le supprimer ferait repasser `date_fin_prevue` à `null`.
- Les 3 VALUE de l'ENG #1 (`watch_entity`, `contexte_editorial`, `date_fin_prevue_justification`) — paramétrage réel (étape 4.1).
- Toutes les CLA / PROP / TEVENT (#41, sous-classes 42→62, TEVENT 6→26, PROP communes/spécifiques, PROP TENG 36→38) — paramétrage permanent.
