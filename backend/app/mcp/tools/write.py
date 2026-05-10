"""Outils MCP en écriture — create_event, mark_event_done, update_value."""
from __future__ import annotations


def register_write_tools(mcp) -> None:  # noqa: ANN001
    import httpx

    from app.mcp.auth import BECLEAR_API_TOKEN, BECLEAR_API_URL, get_mcp_user, is_editeur
    from app.mcp.db import AsyncSession

    def _headers() -> dict[str, str]:
        return {"Authorization": f"Bearer {BECLEAR_API_TOKEN}"}

    # ── Outil : create_event ──────────────────────────────────

    @mcp.tool()
    async def create_event(
        eng_id: int,
        nom: str,
        tevent_id: int,
        date_heure_prevue: str,
        description: str = "",
        cla_id: int = 0,
    ) -> str:
        """Crée un EVENT dans un ENG (requiert rôle EDITEUR ou ADMIN).

        Avant d'appeler cet outil, utilisez list_tevents pour connaître les tevent_id valides.

        Args:
            eng_id: ID de l'ENG auquel rattacher l'EVENT.
            nom: Nom de l'EVENT.
            tevent_id: ID du type d'EVENT (TEVENT). Voir list_tevents.
            date_heure_prevue: Date et heure prévues au format ISO (ex: 2025-06-15T09:00:00).
            description: Description optionnelle (Markdown).
            cla_id: ID de la classe (0 = récupéré automatiquement depuis le TEVENT).
        """
        from sqlalchemy import select
        from app.models.activity import Event, Tevent as TEvent
        from app.models.object import Obj

        # Résolution automatique du cla_id depuis le TEVENT
        if not cla_id:
            async with AsyncSession() as db:
                tevent = await db.get(TEvent, tevent_id)
                if tevent is None:
                    return f"TEVENT #{tevent_id} introuvable — impossible de résoudre cla_id."
                cla_id = tevent.cla_id or 0

        if not cla_id:
            return "cla_id introuvable — spécifiez-le explicitement."

        # Détection de doublon : même nom + même tevent_id sur le même ENG
        async with AsyncSession() as db:
            dup = await db.execute(
                select(Event.id)
                .join(Event.obj)
                .where(
                    Event.eng_id == eng_id,
                    Event.tevent_id == tevent_id,
                    Obj.nom == nom,
                )
            )
            existing = dup.scalar_one_or_none()
            if existing:
                return (
                    f"⚠️ Un EVENT identique existe déjà (EVENT #{existing} — même nom, "
                    f"même type, même ENG). Vérifiez avant de créer un doublon."
                )

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{BECLEAR_API_URL}/api/event",
                headers=_headers(),
                json={
                    "eng_id": eng_id,
                    "nom": nom,
                    "tevent_id": tevent_id,
                    "date_heure_prevue": date_heure_prevue,
                    "description": description or None,
                    "cla_id": cla_id,
                    "values": [],
                },
            )

        if resp.status_code != 201:
            if resp.status_code == 403:
                return "Accès refusé : rôle EDITEUR ou ADMIN requis."
            return f"Erreur {resp.status_code} : {resp.text}"

        data = resp.json()
        event_id = data["id"]

        # Indexation RAG + Meilisearch du nouvel EVENT
        try:
            from app.services.embedding_service import build_embed_text, upsert_embedding
            from app.services.search_service import index_obj
            async with AsyncSession() as db:
                ev_obj = await db.execute(
                    select(Event).join(Event.obj).where(Event.id == event_id)
                )
                ev = ev_obj.scalar_one_or_none()
                if ev and ev.obj_id:
                    embed_str = build_embed_text(nom, description or None, [], "event")
                    await upsert_embedding(db, ev.obj_id, embed_str)
                    await db.commit()
                    await index_obj(
                        obj_id=ev.obj_id, entity_id=event_id,
                        nom=nom, description=description or None, values_text=[],
                        entity_type="event", cla_nom="event",
                    )
        except Exception:
            pass  # L'indexation est best-effort — la création a réussi

        return (
            f"✅ EVENT **#{event_id}** « {nom} » créé dans ENG #{eng_id}.\n"
            f"Date prévue : {date_heure_prevue}"
        )

    # ── Outil : mark_event_done ───────────────────────────────

    @mcp.tool()
    async def mark_event_done(event_id: int, date_heure_reelle: str = "") -> str:
        """Marque un EVENT comme accompli en renseignant sa date réelle (requiert EDITEUR).

        Args:
            event_id: ID de l'EVENT à marquer accompli.
            date_heure_reelle: Date et heure réelles au format ISO. Défaut = maintenant.
        """
        from datetime import datetime, timezone
        from sqlalchemy import select
        from app.models.activity import Event

        dt_str = date_heure_reelle or datetime.now(timezone.utc).isoformat()

        # Avertissement si l'écart date réelle / date prévue dépasse 30 jours
        warning = ""
        try:
            async with AsyncSession() as db:
                ev = await db.scalar(
                    select(Event).where(Event.id == event_id)
                )
                if ev and ev.date_heure_prevue:
                    dt_reelle = datetime.fromisoformat(dt_str)
                    if dt_reelle.tzinfo is None:
                        dt_reelle = dt_reelle.replace(tzinfo=timezone.utc)
                    delta = abs((dt_reelle - ev.date_heure_prevue).days)
                    if delta > 30:
                        sens = "avant" if dt_reelle < ev.date_heure_prevue else "après"
                        warning = (
                            f"\n⚠️ Écart temporel important : date réelle {delta} jours "
                            f"{sens} la date prévue ({ev.date_heure_prevue.strftime('%d/%m/%Y')})."
                        )
        except Exception:
            pass

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"{BECLEAR_API_URL}/api/event/{event_id}",
                headers=_headers(),
                json={"date_heure_reelle": dt_str},
            )

        if resp.status_code == 200:
            return f"✅ EVENT #{event_id} marqué accompli le {dt_str}.{warning}"
        if resp.status_code == 404:
            return f"EVENT #{event_id} introuvable."
        if resp.status_code == 403:
            return "Accès refusé : rôle EDITEUR ou ADMIN requis."
        return f"Erreur {resp.status_code} : {resp.text}"

    # ── Outil : update_value ──────────────────────────────────

    @mcp.tool()
    async def update_value(obj_id: int, prop_nom: str, valeur: str) -> str:
        """Met à jour la valeur texte d'une propriété (PROP) d'un OBJ (requiert EDITEUR).

        L'obj_id n'est pas l'ID de l'ORG ou de l'ENG — c'est l'identifiant de la couche
        objet sous-jacente. Il est visible dans la réponse de get_org (champ "obj_id")
        et get_eng (champ "obj_id").

        Args:
            obj_id: ID de l'OBJ à modifier (visible dans get_org / get_eng sous "obj_id").
            prop_nom: Nom exact de la PROP (sensible à la casse ignorée).
            valeur: Nouvelle valeur texte.
        """
        from sqlalchemy import select
        from sqlalchemy.orm import joinedload, selectinload

        from app.models.object import Cla, Obj, Prop, Value
        from app.services.log import write_log

        async with AsyncSession() as db:
            user = await get_mcp_user(db)
            if not is_editeur(user):
                return "Accès refusé : rôle EDITEUR ou ADMIN requis."

            result = await db.execute(
                select(Obj)
                .options(
                    joinedload(Obj.cla).options(selectinload(Cla.props)),
                    selectinload(Obj.values).joinedload(Value.prop),
                )
                .where(Obj.id == obj_id)
            )
            obj = result.unique().scalar_one_or_none()
            if obj is None:
                return (
                    f"OBJ #{obj_id} introuvable. "
                    "Rappel : l'obj_id est distinct de l'ID de l'ORG/ENG — "
                    "utilisez get_org ou get_eng pour obtenir le bon obj_id."
                )

            # Collect props from the full inheritance chain (CLA + all ancestors)
            async def _resolve_props(cla: Cla) -> list[Prop]:
                collected: list[Prop] = list(cla.props)
                if cla.super_classe_id:
                    parent_result = await db.execute(
                        select(Cla).options(selectinload(Cla.props)).where(Cla.id == cla.super_classe_id)
                    )
                    parent = parent_result.scalar_one_or_none()
                    if parent:
                        collected.extend(await _resolve_props(parent))
                return collected

            all_props = await _resolve_props(obj.cla) if obj.cla else []
            prop = next(
                (p for p in all_props if p.nom.lower() == prop_nom.lower()), None
            )
            if prop is None:
                dispo = ", ".join(p.nom for p in all_props) or "aucune"
                return f"PROP « {prop_nom} » introuvable sur cet OBJ. Disponibles : {dispo}"

            value = next((v for v in obj.values if v.prop_id == prop.id), None)
            if value is None:
                value = Value(
                    obj_id=obj_id,
                    prop_id=prop.id,
                    created_by_id=user.id,
                    updated_by_id=user.id,
                )
                db.add(value)

            avant = value.valeur_texte
            value.valeur_texte = valeur
            value.updated_by_id = user.id
            obj.updated_by_id = user.id

            await write_log(
                db,
                user_id=user.id,
                operation="UPDATE",
                table_name="value",
                entite_id=obj_id,
                avant={"prop": prop_nom, "valeur": avant},
                apres={"prop": prop_nom, "valeur": valeur},
            )
            await db.commit()

        return f"✅ PROP « {prop.nom} » de OBJ #{obj_id} → « {valeur} »."
