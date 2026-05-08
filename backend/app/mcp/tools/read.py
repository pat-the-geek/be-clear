"""Outils MCP en lecture — search, RAG, fiches entités, jalons."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def register_read_tools(mcp) -> None:  # noqa: ANN001
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload, selectinload

    from app.mcp.auth import get_mcp_user
    from app.mcp.db import AsyncSession
    from app.models.activity import Eng, Env, Event, Org, eng_env, eng_org
    from app.models.object import Obj, Value
    from app.services import rag_service, search_service

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
        result = await search_service.search_objs(
            query, offset=0, limit=20, filter_expr=filter_expr
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

        Args:
            question: Question en français sur les données du système.
            llm_id: ID du LLM à utiliser (0 = auto, laisse be.CLEAR choisir).
        """
        async with AsyncSession() as db:
            user = await get_mcp_user(db)
            result = await rag_service.rag_query(
                db=db,
                question=question,
                user_id=user.id,
                llm_id=llm_id if llm_id else None,
            )
        answer = result.get("answer", "Pas de réponse générée.")
        sources = result.get("sources", [])
        if sources:
            answer += "\n\n**Sources :**\n"
            for s in sources:
                answer += f"- [{s['entity_type'].upper()} #{s['entity_id']}] {s['nom']}\n"
        return answer

    # ── Outil : list_orgs ─────────────────────────────────────

    @mcp.tool()
    async def list_orgs(q: str = "", limit: int = 30) -> str:
        """Liste les organisations (ORG) enregistrées dans be.CLEAR.

        Args:
            q: Filtre textuel sur le nom (optionnel).
            limit: Nombre maximum de résultats (défaut 30).
        """
        async with AsyncSession() as db:
            stmt = (
                select(Org)
                .options(joinedload(Org.obj), joinedload(Org.torg))
                .join(Org.obj)
            )
            if q:
                stmt = stmt.where(Obj.nom.ilike(f"%{q}%"))
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
        lines.append(f"**ID :** {org.id} | **Type :** {org.torg.nom if org.torg else 'N/A'}")
        if org.obj.description:
            lines.append(f"\n## Description\n{org.obj.description}")
        lines.append(_values_md(org.obj.values))
        if org.engs:
            lines.append(f"\n## Engagements ({len(org.engs)})")
            for eng in org.engs:
                acc = eng.accomplissement or 0
                teng = eng.teng.nom if eng.teng else "?"
                lines.append(f"- **#{eng.id}** {eng.obj.nom} | {teng} | {acc:.0f}%")
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
            status: actif | clos | vide pour tous.
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
            if status == "actif":
                id_stmt = id_stmt.where(Eng.date_fin.is_(None))
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
            etat = "🔴 Clos" if eng.date_fin else "🟢 Actif"
            lines.append(
                f"- **#{eng.id}** {eng.obj.nom} | {teng} | {orgs_str} | {acc:.0f}% | {etat}"
            )
        return "\n".join(lines)

    # ── Outil : get_eng ───────────────────────────────────────

    @mcp.tool()
    async def get_eng(eng_id: int) -> str:
        """Récupère un ENG complet : EVENTs, avancement, diagramme Gantt.

        Args:
            eng_id: Identifiant numérique de l'ENG.
        """
        async with AsyncSession() as db:
            result = await db.execute(
                select(Eng)
                .options(
                    joinedload(Eng.obj).options(
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

        if eng is None:
            return f"ENG #{eng_id} introuvable."

        acc = eng.accomplissement or 0
        lines = [f"# ENG : {eng.obj.nom}\n"]
        lines.append(
            f"**ID :** {eng.id} | **Type :** {eng.teng.nom if eng.teng else 'N/A'} "
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

        if eng.gantt_mermaid:
            lines.append(f"\n## Gantt\n```mermaid\n{eng.gantt_mermaid}\n```")

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
    async def list_events_due(date_debut: str = "", date_fin: str = "") -> str:
        """Liste les EVENTs prévus dans un intervalle de dates (accomplis et non accomplis).

        Args:
            date_debut: Date ISO de début (ex: 2025-06-01). Défaut = aujourd'hui.
            date_fin: Date ISO de fin (ex: 2025-06-07). Défaut = date_debut + 7 jours.
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

        async with AsyncSession() as db:
            result = await db.execute(
                select(Event)
                .options(
                    joinedload(Event.obj),
                    joinedload(Event.tevent),
                    joinedload(Event.eng).joinedload(Eng.obj),
                )
                .where(
                    Event.date_heure_prevue >= dt_from,
                    Event.date_heure_prevue <= dt_to,
                )
                .order_by(Event.date_heure_prevue)
            )
            events = result.unique().scalars().all()

        if not events:
            return (
                f"Aucun EVENT prévu du {dt_from.strftime('%d/%m/%Y')} "
                f"au {dt_to.strftime('%d/%m/%Y')}."
            )
        lines = [
            f"## EVENTs du {dt_from.strftime('%d/%m/%Y')} "
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
