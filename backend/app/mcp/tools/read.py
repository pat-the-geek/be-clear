"""Outils MCP en lecture — search, RAG, fiches entités, jalons."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone


def _sanitize_mermaid(text: str) -> str:
    """Retourne une chaîne compatible Mermaid : sans accents, emojis ni caractères spéciaux."""
    import re
    import unicodedata
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(c for c in normalized if not unicodedata.combining(c))
    clean = re.sub(r"[^\x20-\x7E]", " ", ascii_text)
    clean = re.sub(r"[:#,;{}\[\]]", " ", clean)
    return re.sub(r" +", " ", clean).strip()


def _build_gantt_mermaid(eng_nom: str, events: list, now_date_str: str) -> str:
    """Génère le code Mermaid Gantt avec palette orange depuis une liste d'EVENTs.

    Durée minimale de 3 jours par barre pour la lisibilité.
    Double guillemets dans le bloc init pour conformité JSON5.
    """
    from collections import defaultdict
    from datetime import date as _date, timedelta as _td

    MIN_DAYS = 3

    colors = ["#f97316", "#fb923c", "#ea580c", "#fdba74", "#c2410c", "#fed7aa", "#9a3412", "#ffedd5"]
    cscales = ", ".join(f'"cScale{i}": "{c}"' for i, c in enumerate(colors))

    lines = [
        f'%%{{init: {{"theme": "base", "themeVariables": {{{cscales}}}}}}}%%',
        "gantt",
        f"    title {_sanitize_mermaid(eng_nom)}",
        "    dateFormat YYYY-MM-DD",
        "    axisFormat %d/%m",
        "    todayMarker on",
    ]

    by_tevent: dict[str, list] = defaultdict(list)
    for ev in sorted(events, key=lambda e: e.get("date_prevue") or "9999"):
        by_tevent[ev["tevent_nom"]].append(ev)

    for section, evs in by_tevent.items():
        lines.append(f"    section {_sanitize_mermaid(section)}")
        for ev in evs:
            dp = ev.get("date_prevue")
            if not dp:
                continue
            start_date = _date.fromisoformat(dp[:10])
            done = ev.get("done", False)
            dr = ev.get("date_reelle")

            if done and dr:
                end_date = _date.fromisoformat(dr[:10])
                # enforce minimum bar width
                if (end_date - start_date).days < MIN_DAYS:
                    end_date = start_date + _td(days=MIN_DAYS)
            else:
                end_date = start_date + _td(days=MIN_DAYS)

            start = start_date.isoformat()
            end = end_date.isoformat()

            if done:
                status = "done, "
            elif start < now_date_str:
                status = "crit, "
            else:
                status = ""

            safe_nom = _sanitize_mermaid(ev["nom"])
            lines.append(f"    {safe_nom} :{status}ev{ev['id']}, {start}, {end}")

    return "\n".join(lines)


def register_read_tools(mcp) -> None:  # noqa: ANN001
    from sqlalchemy import select, text
    from sqlalchemy.orm import joinedload, selectinload

    from app.mcp.auth import get_mcp_user
    from sqlalchemy import or_
    from app.mcp.db import AsyncSession, _engine
    from app.models.activity import Eng, Env, Event, Org, Tevent, Torg, Tenv, eng_env, eng_org
    from app.models.object import Cla, Obj, Value
    from app.services import rag_service, search_service

    # ── Outil : health ────────────────────────────────────────

    @mcp.tool()
    async def health() -> str:
        """Vérifie que le serveur MCP be.CLEAR est opérationnel et teste la connectivité aux backends.

        Appeler en premier dans toute campagne de test pour valider que le serveur
        répond avant de lancer des appels plus lourds.
        """
        now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
        lines = [f"## be.CLEAR MCP — Health check\n**Horodatage :** {now}\n"]

        # Ping PostgreSQL
        try:
            async with asyncio.timeout(5):
                async with AsyncSession() as db:
                    await db.execute(text("SELECT 1"))
            lines.append("- ✅ **PostgreSQL** — connecté")
        except TimeoutError:
            lines.append("- ❌ **PostgreSQL** — timeout (> 5 s)")
        except Exception as exc:
            lines.append(f"- ❌ **PostgreSQL** — {exc}")

        # Ping Meilisearch
        from app.config import settings as _s
        meili_url = _s.MEILISEARCH_URL
        try:
            async with asyncio.timeout(5):
                await search_service.search_objs("health", offset=0, limit=1)
            lines.append(f"- ✅ **Meilisearch** — connecté (`{meili_url}`)")
        except TimeoutError:
            lines.append(f"- ❌ **Meilisearch** — timeout (> 5 s) — URL : `{meili_url}`")
        except Exception as exc:
            lines.append(
                f"- ❌ **Meilisearch** — indisponible (`{meili_url}`)\n"
                f"  → En mode stdio, définissez `MEILISEARCH_URL=http://localhost:7700` "
                "dans `claude_desktop_config.json` si Meilisearch tourne sur la machine hôte."
            )

        lines.append("\nSi tous les backends sont ✅, le serveur est prêt pour la campagne de tests.")
        return "\n".join(lines)

    # ── Helpers formatage ─────────────────────────────────────

    def _dt(dt: datetime | None) -> str:
        if dt is None:
            return "—"
        return dt.strftime("%d/%m/%Y %H:%M")

    def _values_md(values) -> str:
        rows = [v for v in values if v.prop]
        if not rows:
            return ""
        lines = ["\n## Propriétés\n| Propriété | Valeur |", "|---|---|"]
        for v in rows:
            val = (
                v.valeur_texte
                or (str(v.valeur_nombre) if v.valeur_nombre is not None else None)
                or (str(v.valeur_bool) if v.valeur_bool is not None else None)
                or (_dt(v.valeur_date) if v.valeur_date else None)
                or ""
            )
            lines.append(f"| {v.prop.nom} | {val} |")
        return "\n".join(lines)

    # ── Outil : search ────────────────────────────────────────

    @mcp.tool()
    async def search(query: str, entity_type: str = "") -> str:
        """Recherche full-text dans be.CLEAR via Meilisearch.

        ⚠️ Prérequis : Meilisearch doit être accessible depuis le processus MCP.
        En mode stdio (Claude Desktop), définissez MEILISEARCH_URL=http://localhost:7700
        dans la section "env" de claude_desktop_config.json et assurez-vous que le
        port 7700 est ouvert sur la machine hôte.
        En mode SSE (Docker), la configuration est automatique.
        Si Meilisearch est indisponible, utilisez `list_orgs`, `list_engs` (filtrage
        textuel via paramètre `q`) ou `rag_query` comme alternatives.

        Args:
            query: Texte à rechercher (min 2 caractères).
            entity_type: Filtrer par type : org | env | eng | event. Vide = tous.
        """
        if len(query.strip()) < 2:
            return "La requête doit comporter au moins 2 caractères."
        filter_expr = (
            f'entity_type = "{entity_type}"'
            if entity_type in ("org", "env", "eng", "event")
            else None
        )
        try:
            result = await search_service.search_objs(
                query, offset=0, limit=20, filter_expr=filter_expr
            )
        except Exception:
            return (
                "⚠️ Le moteur de recherche full-text (Meilisearch) est temporairement "
                "indisponible. Alternatives : utilisez `list_orgs`, `list_engs` ou "
                "`rag_query` pour interroger les données."
            )
        hits = [h for h in result.get("hits", []) if h.get("entity_id")]
        if not hits:
            return f"Aucun résultat pour « {query} »."
        total = result.get("estimated_total_hits", len(hits))
        lines = [f"## Résultats pour « {query} » ({total} trouvé(s))\n"]
        for h in hits:
            typ = h.get("entity_type", "?").upper()
            eid = h.get("entity_id")
            nom = h.get("nom", "?")
            cla = h.get("cla_nom", "")
            lines.append(f"- **[{typ} #{eid}]** {nom} _{cla}_")
        return "\n".join(lines)

    # ── Outil : rag_query ─────────────────────────────────────

    @mcp.tool()
    async def rag_query(question: str, llm_id: int = 0) -> str:
        """Requête en langage naturel (RAG) sur toutes les données be.CLEAR.

        Pour les questions sur les retards ou jalons, préférez `get_overdue_events`
        et `list_events_due` qui retournent des données déterministes fiables.

        Args:
            question: Question en français sur les données du système.
            llm_id: ID du LLM à utiliser (0 = auto, laisse be.CLEAR choisir).
        """
        try:
            async with asyncio.timeout(90):
                async with AsyncSession() as db:
                    user = await get_mcp_user(db)
                    result = await rag_service.rag_query(
                        db=db,
                        question=question,
                        user_id=user.id,
                        llm_id=llm_id if llm_id else None,
                    )
        except TimeoutError:
            return (
                "⏱️ Délai dépassé (90 s) — Ollama est inaccessible ou surchargé. "
                "Réessayez dans quelques minutes, ou utilisez les outils déterministes "
                "(`get_overdue_events`, `list_events_due`, `list_engs`…) qui ne dépendent pas du LLM."
            )
        answer = result.get("answer", "Pas de réponse générée.")
        sources = result.get("sources", [])
        if sources:
            answer += "\n\n**Sources :**\n"
            for s in sources:
                answer += f"- [{s['entity_type'].upper()} #{s['entity_id']}] {s['nom']}\n"
        return answer

    # ── Outil : list_tevents ─────────────────────────────────

    @mcp.tool()
    async def list_tevents() -> str:
        """Liste tous les types d'EVENT (TEVENT) disponibles avec leurs IDs.

        Indispensable avant d'appeler create_event : retourne les tevent_id valides
        à passer en paramètre.
        """
        async with AsyncSession() as db:
            result = await db.execute(
                select(Tevent).options(joinedload(Tevent.cla)).order_by(Tevent.nom)
            )
            tevents = result.unique().scalars().all()

        if not tevents:
            return "Aucun TEVENT trouvé."
        lines = ["## Types d'EVENT (TEVENT)\n", "| ID | Nom | Classe | Durée par défaut |", "|---|---|---|---|"]
        for t in tevents:
            duree = ""
            if t.duree_prevue_valeur is not None:
                duree = f"{t.duree_prevue_valeur:g} {t.duree_prevue_unite or ''}"
            cla_nom = t.cla.nom if t.cla else str(t.cla_id)
            lines.append(f"| {t.id} | {t.nom} | {cla_nom} | {duree} |")
        return "\n".join(lines)

    # ── Outil : list_orgs ─────────────────────────────────────

    @mcp.tool()
    async def list_orgs(q: str = "", limit: int = 30) -> str:
        """Liste les organisations (ORG) enregistrées dans be.CLEAR.

        Args:
            q: Filtre textuel sur le nom de l'ORG ou sur son type (TORG).
               Exemple : q="Formation" retourne les ORG de type "Secteur Formation…".
               Pour une recherche full-text élargie (description, propriétés, autres entités),
               utiliser l'outil `search` à la place.
            limit: Nombre maximum de résultats (défaut 30).
        """
        async with AsyncSession() as db:
            stmt = (
                select(Org)
                .options(joinedload(Org.obj), joinedload(Org.torg))
                .join(Org.obj)
            )
            if q:
                torg_match = Org.torg_id.in_(
                    select(Torg.id).where(Torg.nom.ilike(f"%{q}%"))
                )
                stmt = stmt.where(or_(Obj.nom.ilike(f"%{q}%"), torg_match))
            stmt = stmt.order_by(Obj.nom).limit(limit)
            orgs = (await db.execute(stmt)).unique().scalars().all()

        if not orgs:
            return "Aucune ORG trouvée."
        lines = [f"## Organisations ({len(orgs)} résultat(s))\n"]
        for org in orgs:
            torg = org.torg.nom if org.torg else "N/A"
            lines.append(f"- **#{org.id}** — {org.obj.nom} _{torg}_")
        return "\n".join(lines)

    # ── Outil : get_org ───────────────────────────────────────

    @mcp.tool()
    async def get_org(org_id: int) -> str:
        """Récupère la fiche complète d'une ORG avec ses propriétés et ses ENGs.

        Args:
            org_id: Identifiant numérique de l'ORG.
        """
        async with AsyncSession() as db:
            result = await db.execute(
                select(Org)
                .options(
                    joinedload(Org.obj).options(
                        selectinload(Obj.values).joinedload(Value.prop),
                        selectinload(Obj.images),
                    ),
                    joinedload(Org.torg),
                    selectinload(Org.engs).options(
                        joinedload(Eng.obj),
                        joinedload(Eng.teng),
                    ),
                )
                .where(Org.id == org_id)
            )
            org = result.unique().scalar_one_or_none()

        if org is None:
            return f"ORG #{org_id} introuvable."

        lines = [f"# ORG : {org.obj.nom}\n"]
        lines.append(
            f"**ID :** {org.id} | **obj_id :** {org.obj_id} | "
            f"**Type :** {org.torg.nom if org.torg else 'N/A'}"
        )
        if org.obj.description:
            lines.append(f"\n## Description\n{org.obj.description}")
        lines.append(_values_md(org.obj.values))
        if org.engs:
            lines.append(f"\n## Engagements ({len(org.engs)})")
            for eng in org.engs:
                acc = eng.accomplissement or 0
                teng = eng.teng.nom if eng.teng else "?"
                if eng.date_fin:
                    etat = "🔴 Clos"
                elif acc >= 100:
                    etat = "⚠️ Actif (100%)"
                else:
                    etat = "🟢 Actif"
                lines.append(f"- **#{eng.id}** {eng.obj.nom} | {teng} | {acc:.0f}% | {etat}")
        return "\n".join(lines)

    # ── Outil : list_engs ─────────────────────────────────────

    @mcp.tool()
    async def list_engs(
        org_id: int = 0,
        env_id: int = 0,
        status: str = "",
        limit: int = 20,
    ) -> str:
        """Liste les engagements (ENG) avec filtres optionnels.

        Args:
            org_id: Filtrer par ORG (0 = tous).
            env_id: Filtrer par ENV (0 = tous).
            status: Filtre d'état —
                actif    = non clos (date_fin absente), inclut les ENG à 100% non encore fermés ;
                en_cours = actif ET avancement < 100% (vraiment en cours) ;
                clos     = date_fin renseignée ;
                vide     = tous.
            limit: Nombre maximum de résultats.
        """
        async with AsyncSession() as db:
            # Étape 1 : IDs distincts + tri — SELECT DISTINCT (id, nom) évite
            # le conflit PostgreSQL "ORDER BY expressions must appear in select list"
            # causé par le double alias obj/obj_1 généré par joinedload + join explicite.
            id_stmt = select(Eng.id, Obj.nom).distinct().join(Eng.obj)
            if org_id:
                id_stmt = id_stmt.join(
                    eng_org, Eng.id == eng_org.c.eng_id
                ).where(eng_org.c.org_id == org_id)
            if env_id:
                id_stmt = id_stmt.join(
                    eng_env, Eng.id == eng_env.c.eng_id
                ).where(eng_env.c.env_id == env_id)
            if status in ("actif", "en_cours"):
                id_stmt = id_stmt.where(Eng.date_fin.is_(None))
                if status == "en_cours":
                    id_stmt = id_stmt.where(
                        (Eng.accomplissement.is_(None)) | (Eng.accomplissement < 100)
                    )
            elif status == "clos":
                id_stmt = id_stmt.where(Eng.date_fin.is_not(None))
            id_stmt = id_stmt.order_by(Obj.nom).limit(limit)
            ids = [row[0] for row in (await db.execute(id_stmt)).all()]

            if not ids:
                return "Aucun ENG trouvé."

            # Étape 2 : chargement complet sans DISTINCT — ORDER BY libre
            stmt = (
                select(Eng)
                .options(
                    joinedload(Eng.obj),
                    joinedload(Eng.teng),
                    selectinload(Eng.orgs).joinedload(Org.obj),
                )
                .where(Eng.id.in_(ids))
                .join(Eng.obj)
                .order_by(Obj.nom)
            )
            engs = (await db.execute(stmt)).unique().scalars().all()

        lines = [f"## Engagements ({len(engs)} résultat(s))\n"]
        for eng in engs:
            acc = eng.accomplissement or 0
            orgs_str = ", ".join(o.obj.nom for o in eng.orgs) if eng.orgs else "?"
            teng = eng.teng.nom if eng.teng else "?"
            if eng.date_fin:
                etat = "🔴 Clos"
            elif acc >= 100:
                # Accompli mais non clos — mérite attention
                etat = "⚠️ Actif (100%)"
            else:
                etat = "🟢 Actif"
            lines.append(
                f"- **#{eng.id}** {eng.obj.nom} | {teng} | {orgs_str} | {acc:.0f}% | {etat}"
            )
        return "\n".join(lines)

    # ── Outil : list_engs_sans_events ─────────────────────────

    @mcp.tool()
    async def list_engs_sans_events(limit: int = 20) -> str:
        """Liste les ENGs actifs qui n'ont aucun EVENT futur non accompli.

        Utile pour identifier les engagements en cours sans jalonnement visible —
        zone grise de pilotage : actif sur le papier mais sans prochaine étape planifiée.

        Args:
            limit: Nombre maximum de résultats (défaut 20).
        """
        now = datetime.now(timezone.utc)
        async with AsyncSession() as db:
            # Sous-requête : IDs d'ENGs qui ont au moins un EVENT futur non accompli
            engs_avec_event = (
                select(Event.eng_id)
                .where(
                    Event.date_heure_prevue > now,
                    Event.date_heure_reelle.is_(None),
                )
                .scalar_subquery()
            )
            stmt = (
                select(Eng)
                .options(
                    joinedload(Eng.obj),
                    joinedload(Eng.teng),
                    selectinload(Eng.orgs).joinedload(Org.obj),
                )
                .join(Eng.obj)
                .where(
                    Eng.date_fin.is_(None),           # actif
                    Eng.id.not_in(engs_avec_event),   # sans EVENT futur
                )
                .order_by(Obj.nom)
                .limit(limit)
            )
            engs = (await db.execute(stmt)).unique().scalars().all()

        if not engs:
            return "✅ Tous les ENGs actifs ont au moins un EVENT futur planifié."
        lines = [
            f"## ENGs actifs sans EVENT futur planifié ({len(engs)})\n",
            "_Ces engagements sont actifs mais n'ont aucune prochaine étape visible._\n",
        ]
        for eng in engs:
            acc = eng.accomplissement or 0
            orgs_str = ", ".join(o.obj.nom for o in eng.orgs) if eng.orgs else "?"
            teng = eng.teng.nom if eng.teng else "?"
            etat = "⚠️ Actif (100%)" if acc >= 100 else "🟢 Actif"
            lines.append(f"- **#{eng.id}** {eng.obj.nom} | {teng} | {orgs_str} | {acc:.0f}% | {etat}")
        return "\n".join(lines)

    # ── Outil : get_eng ───────────────────────────────────────

    @mcp.tool()
    async def get_eng(eng_id: int, diagram: str = "") -> str:
        """Récupère un ENG complet : EVENTs, avancement, diagramme Mermaid optionnel.

        Args:
            eng_id: Identifiant numérique de l'ENG.
            diagram: Type de diagramme à inclure :
                ""         → pas de diagramme (défaut) ;
                "timeline" → diagramme Timeline généré par be.CLEAR ;
                "gantt"    → diagramme Gantt avec palette orange.
        """
        async with AsyncSession() as db:
            result = await db.execute(
                select(Eng)
                .options(
                    joinedload(Eng.obj).options(
                        joinedload(Obj.cla).options(selectinload(Cla.props)),
                        selectinload(Obj.values).joinedload(Value.prop),
                    ),
                    joinedload(Eng.teng),
                    selectinload(Eng.orgs).joinedload(Org.obj),
                    selectinload(Eng.envs).joinedload(Env.obj),
                    selectinload(Eng.events).options(
                        joinedload(Event.obj),
                        joinedload(Event.tevent),
                    ),
                )
                .where(Eng.id == eng_id)
            )
            eng = result.unique().scalar_one_or_none()

            # Collect all props through inheritance chain
            all_props: list = []
            if eng and eng.obj and eng.obj.cla:
                cla = eng.obj.cla
                all_props.extend(cla.props)
                parent_id = cla.super_classe_id
                depth = 0
                while parent_id and depth < 5:
                    pr = await db.execute(
                        select(Cla).options(selectinload(Cla.props)).where(Cla.id == parent_id)
                    )
                    parent_cla = pr.scalar_one_or_none()
                    if not parent_cla:
                        break
                    all_props.extend(parent_cla.props)
                    parent_id = parent_cla.super_classe_id
                    depth += 1

        if eng is None:
            return f"ENG #{eng_id} introuvable."

        acc = eng.accomplissement or 0
        lines = [f"# ENG : {eng.obj.nom}\n"]
        cla_nom = eng.obj.cla.nom if eng.obj.cla else "N/A"
        lines.append(
            f"**ID :** {eng.id} | **obj_id :** {eng.obj_id} | "
            f"**Type :** {eng.teng.nom if eng.teng else 'N/A'} "
            f"| **Classe :** {cla_nom} "
            f"| **Avancement :** {acc:.0f}%"
        )
        if eng.orgs:
            lines.append("**ORG(s) :** " + ", ".join(o.obj.nom for o in eng.orgs))
        if eng.envs:
            lines.append("**ENV(s) :** " + ", ".join(e.obj.nom for e in eng.envs))

        date_parts = []
        if eng.date_debut:
            date_parts.append(f"Début : {eng.date_debut.strftime('%d/%m/%Y')}")
        if eng.date_fin_prevue:
            date_parts.append(f"Fin prévue : {eng.date_fin_prevue.strftime('%d/%m/%Y')}")
        if eng.date_fin:
            date_parts.append(f"Fin réelle : {eng.date_fin.strftime('%d/%m/%Y')}")
        if date_parts:
            lines.append(" | ".join(date_parts))

        if eng.obj.description:
            lines.append(f"\n## Description\n{eng.obj.description}")
        lines.append(_values_md(eng.obj.values))

        # Show available PROPs not yet set (to guide update_value usage)
        set_prop_ids = {v.prop_id for v in eng.obj.values}
        unset_props = [p for p in all_props if p.id not in set_prop_ids]
        if unset_props:
            lines.append(
                "\n_Propriétés disponibles (non renseignées) : "
                + ", ".join(f"**{p.nom}**" for p in unset_props)
                + "_"
            )

        # EVENTs triés par date prévue
        events_sorted = sorted(
            eng.events,
            key=lambda e: e.date_heure_prevue or datetime.min.replace(tzinfo=timezone.utc),
        )
        if events_sorted:
            lines.append(f"\n## Évènements ({len(events_sorted)})")
            for ev in events_sorted:
                icon = "✅" if ev.date_heure_reelle else "⏳"
                nom = ev.obj.nom if ev.obj else f"EVENT #{ev.id}"
                dt_p = _dt(ev.date_heure_prevue)
                dt_r = _dt(ev.date_heure_reelle)
                tv = ev.tevent.nom if ev.tevent else "?"
                lines.append(
                    f"- {icon} **#{ev.id}** {nom} _{tv}_ — prévu {dt_p} / réel {dt_r}"
                )

        if diagram == "timeline":
            if eng.gantt_mermaid:
                lines.append(f"\n## Diagramme Timeline\n```mermaid\n{eng.gantt_mermaid}\n```")
            else:
                lines.append("\n_Aucun diagramme Timeline disponible pour cet ENG._")
        elif diagram == "gantt":
            ev_list = [
                {
                    "id": ev.id,
                    "nom": ev.obj.nom if ev.obj else f"EVENT {ev.id}",
                    "tevent_nom": ev.tevent.nom if ev.tevent else "Évènements",
                    "date_prevue": ev.date_heure_prevue.isoformat() if ev.date_heure_prevue else None,
                    "date_reelle": ev.date_heure_reelle.isoformat() if ev.date_heure_reelle else None,
                    "done": ev.date_heure_reelle is not None,
                }
                for ev in eng.events
            ]
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            gantt_code = _build_gantt_mermaid(eng.obj.nom, ev_list, now_str)
            lines.append(f"\n## Diagramme Gantt\n```mermaid\n{gantt_code}\n```")
        elif eng.gantt_mermaid:
            lines.append(f"\n## Gantt\n```mermaid\n{eng.gantt_mermaid}\n```")

        return "\n".join(lines)

    # ── Outil : list_envs ────────────────────────────────────

    @mcp.tool()
    async def list_envs(q: str = "", limit: int = 30) -> str:
        """Liste les environnements (ENV) enregistrés dans be.CLEAR.

        Args:
            q: Filtre textuel sur le nom de l'ENV ou sur son type (TENV).
               Pour une recherche full-text élargie, utiliser l'outil `search`.
            limit: Nombre maximum de résultats (défaut 30).
        """
        async with AsyncSession() as db:
            stmt = (
                select(Env)
                .options(joinedload(Env.obj), joinedload(Env.tenv))
                .join(Env.obj)
            )
            if q:
                tenv_match = Env.tenv_id.in_(
                    select(Tenv.id).where(Tenv.nom.ilike(f"%{q}%"))
                )
                stmt = stmt.where(or_(Obj.nom.ilike(f"%{q}%"), tenv_match))
            stmt = stmt.order_by(Obj.nom).limit(limit)
            envs = (await db.execute(stmt)).unique().scalars().all()

        if not envs:
            return "Aucun ENV trouvé."
        lines = [f"## Environnements ({len(envs)} résultat(s))\n"]
        for env in envs:
            tenv = env.tenv.nom if env.tenv else "N/A"
            lines.append(f"- **#{env.id}** — {env.obj.nom} _{tenv}_")
        return "\n".join(lines)

    # ── Outil : get_env ───────────────────────────────────────

    @mcp.tool()
    async def get_env(env_id: int) -> str:
        """Récupère la fiche complète d'un ENV.

        Args:
            env_id: Identifiant numérique de l'ENV.
        """
        async with AsyncSession() as db:
            result = await db.execute(
                select(Env)
                .options(
                    joinedload(Env.obj).options(
                        selectinload(Obj.values).joinedload(Value.prop),
                        selectinload(Obj.images),
                    ),
                    joinedload(Env.tenv),
                    selectinload(Env.engs).joinedload(Eng.obj),
                )
                .where(Env.id == env_id)
            )
            env = result.unique().scalar_one_or_none()

        if env is None:
            return f"ENV #{env_id} introuvable."

        lines = [f"# ENV : {env.obj.nom}\n"]
        lines.append(f"**ID :** {env.id} | **Type :** {env.tenv.nom if env.tenv else 'N/A'}")
        if env.obj.description:
            lines.append(f"\n## Description\n{env.obj.description}")
        lines.append(_values_md(env.obj.values))
        if env.engs:
            lines.append(f"\n## Engagements ({len(env.engs)})")
            for eng in env.engs:
                acc = eng.accomplissement or 0
                lines.append(f"- **#{eng.id}** {eng.obj.nom} — {acc:.0f}%")
        return "\n".join(lines)

    # ── Outil : list_events_due ───────────────────────────────

    @mcp.tool()
    async def list_events_due(
        date_debut: str = "",
        date_fin: str = "",
        inclure_accomplis: bool = False,
    ) -> str:
        """Liste les EVENTs prévus dans un intervalle de dates.

        Par défaut, ne retourne que les EVENTs non encore accomplis (usage prospectif :
        « qu'est-ce qui m'attend cette semaine ? »). Passer inclure_accomplis=true pour
        voir aussi les EVENTs déjà réalisés dans la fenêtre.

        Args:
            date_debut: Date ISO de début (ex: 2025-06-01). Défaut = aujourd'hui.
            date_fin: Date ISO de fin (ex: 2025-06-07). Défaut = date_debut + 7 jours.
            inclure_accomplis: Si true, inclut les EVENTs déjà marqués accomplis. Défaut false.
        """
        now = datetime.now(timezone.utc)

        dt_from = (
            datetime.fromisoformat(date_debut)
            if date_debut
            else now.replace(hour=0, minute=0, second=0, microsecond=0)
        )
        if dt_from.tzinfo is None:
            dt_from = dt_from.replace(tzinfo=timezone.utc)

        dt_to = (
            datetime.fromisoformat(date_fin)
            if date_fin
            else dt_from + timedelta(days=7)
        )
        if dt_to.tzinfo is None:
            dt_to = dt_to.replace(tzinfo=timezone.utc)

        if dt_to < dt_from:
            return (
                f"Fenêtre temporelle invalide : date_fin ({dt_to.strftime('%d/%m/%Y')}) "
                f"est antérieure à date_debut ({dt_from.strftime('%d/%m/%Y')}). "
                "Inversez les deux dates."
            )

        async with AsyncSession() as db:
            where_base = [
                Event.date_heure_prevue >= dt_from,
                Event.date_heure_prevue <= dt_to,
            ]
            if not inclure_accomplis:
                where_base.append(Event.date_heure_reelle.is_(None))
            result = await db.execute(
                select(Event)
                .options(
                    joinedload(Event.obj),
                    joinedload(Event.tevent),
                    joinedload(Event.eng).joinedload(Eng.obj),
                )
                .where(*where_base)
                .order_by(Event.date_heure_prevue)
            )
            events = result.unique().scalars().all()

            # Compte les accomplis dans la fenêtre si on les a exclus
            accomplis_count = 0
            if not inclure_accomplis:
                r2 = await db.execute(
                    select(Event.id)
                    .where(
                        Event.date_heure_prevue >= dt_from,
                        Event.date_heure_prevue <= dt_to,
                        Event.date_heure_reelle.is_not(None),
                    )
                )
                accomplis_count = len(r2.fetchall())

        label = "" if inclure_accomplis else " (non accomplis)"
        if not events:
            base = (
                f"Aucun EVENT{label} prévu du {dt_from.strftime('%d/%m/%Y')} "
                f"au {dt_to.strftime('%d/%m/%Y')}."
            )
            if accomplis_count:
                base += (
                    f" ({accomplis_count} EVENT{'s' if accomplis_count > 1 else ''} accompli{'s' if accomplis_count > 1 else ''} "
                    "dans cette fenêtre — passez `inclure_accomplis=true` pour les voir.)"
                )
            return base
        lines = [
            f"## EVENTs{label} du {dt_from.strftime('%d/%m/%Y')} "
            f"au {dt_to.strftime('%d/%m/%Y')} ({len(events)})\n"
        ]
        for ev in events:
            icon = "✅" if ev.date_heure_reelle else "⏳"
            nom = ev.obj.nom if ev.obj else f"EVENT #{ev.id}"
            eng_nom = ev.eng.obj.nom if ev.eng and ev.eng.obj else "?"
            dt = _dt(ev.date_heure_prevue)
            lines.append(f"- {icon} **{dt}** — {nom} _(ENG #{ev.eng_id}: {eng_nom})_")
        return "\n".join(lines)

    # ── Outil : get_overdue_events ────────────────────────────

    @mcp.tool()
    async def get_overdue_events(limit: int = 30) -> str:
        """Liste les EVENTs en retard : date prévue dépassée et non accomplis.

        Args:
            limit: Nombre maximum de résultats (défaut 30).
        """
        now = datetime.now(timezone.utc)
        async with AsyncSession() as db:
            result = await db.execute(
                select(Event)
                .options(
                    joinedload(Event.obj),
                    joinedload(Event.tevent),
                    joinedload(Event.eng).joinedload(Eng.obj),
                )
                .where(
                    Event.date_heure_reelle.is_(None),
                    Event.date_heure_prevue < now,
                )
                .order_by(Event.date_heure_prevue)
                .limit(limit)
            )
            events = result.unique().scalars().all()

        if not events:
            return "Aucun EVENT en retard. 🎉"
        lines = [f"## EVENTs en retard ({len(events)})\n"]
        for ev in events:
            nom = ev.obj.nom if ev.obj else f"EVENT #{ev.id}"
            eng_nom = ev.eng.obj.nom if ev.eng and ev.eng.obj else "?"
            dt = _dt(ev.date_heure_prevue)
            retard = (now - ev.date_heure_prevue).days if ev.date_heure_prevue else 0
            lines.append(
                f"- 🔴 **#{ev.id}** {nom} | ENG #{ev.eng_id} {eng_nom} "
                f"| prévu {dt} (J+{retard})"
            )
        return "\n".join(lines)
