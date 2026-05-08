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

        Args:
            eng_id: ID de l'ENG auquel rattacher l'EVENT.
            nom: Nom de l'EVENT.
            tevent_id: ID du type d'EVENT (TEVENT).
            date_heure_prevue: Date et heure prévues au format ISO (ex: 2025-06-15T09:00:00).
            description: Description optionnelle (Markdown).
            cla_id: ID de la classe (0 = récupéré automatiquement depuis le TEVENT).
        """
        # Résolution automatique du cla_id depuis le TEVENT
        if not cla_id:
            from sqlalchemy import select
            from app.models.activity import Tevent as TEvent
            async with AsyncSession() as db:
                tevent = await db.get(TEvent, tevent_id)
                if tevent is None:
                    return f"TEVENT #{tevent_id} introuvable — impossible de résoudre cla_id."
                cla_id = tevent.cla_id or 0

        if not cla_id:
            return "cla_id introuvable — spécifiez-le explicitement."

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

        if resp.status_code == 201:
            data = resp.json()
            return (
                f"✅ EVENT **#{data['id']}** « {nom} » créé dans ENG #{eng_id}.\n"
                f"Date prévue : {date_heure_prevue}"
            )
        if resp.status_code == 403:
            return "Accès refusé : rôle EDITEUR ou ADMIN requis."
        return f"Erreur {resp.status_code} : {resp.text}"

    # ── Outil : mark_event_done ───────────────────────────────

    @mcp.tool()
    async def mark_event_done(event_id: int, date_heure_reelle: str = "") -> str:
        """Marque un EVENT comme accompli en renseignant sa date réelle (requiert EDITEUR).

        Args:
            event_id: ID de l'EVENT à marquer accompli.
            date_heure_reelle: Date et heure réelles au format ISO. Défaut = maintenant.
        """
        from datetime import datetime, timezone

        dt = date_heure_reelle or datetime.now(timezone.utc).isoformat()

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                f"{BECLEAR_API_URL}/api/event/{event_id}",
                headers=_headers(),
                json={"date_heure_reelle": dt},
            )

        if resp.status_code == 200:
            return f"✅ EVENT #{event_id} marqué accompli le {dt}."
        if resp.status_code == 404:
            return f"EVENT #{event_id} introuvable."
        if resp.status_code == 403:
            return "Accès refusé : rôle EDITEUR ou ADMIN requis."
        return f"Erreur {resp.status_code} : {resp.text}"

    # ── Outil : update_value ──────────────────────────────────

    @mcp.tool()
    async def update_value(obj_id: int, prop_nom: str, valeur: str) -> str:
        """Met à jour la valeur texte d'une propriété (PROP) d'un OBJ (requiert EDITEUR).

        Args:
            obj_id: ID de l'OBJ à modifier.
            prop_nom: Nom exact de la PROP (sensible à la casse ignorée).
            valeur: Nouvelle valeur texte.
        """
        from sqlalchemy import select
        from sqlalchemy.orm import joinedload, selectinload

        from app.models.object import Cla, Obj, Value
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
                return f"OBJ #{obj_id} introuvable."

            all_props = obj.cla.props if obj.cla else []
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
