"""Ressources MCP (beclear://) et gabarits de prompts."""
from __future__ import annotations


def register_resources(mcp) -> None:  # noqa: ANN001
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload, selectinload

    from app.mcp.db import AsyncSession
    from app.models.activity import Eng, Env, Org
    from app.models.object import Obj, Value

    # ─────────────────────────────────────────────────────────
    # RESSOURCES
    # ─────────────────────────────────────────────────────────

    @mcp.resource("beclear://orgs")
    async def resource_list_orgs() -> str:
        """Répertoire de toutes les organisations enregistrées dans be.CLEAR."""
        async with AsyncSession() as db:
            result = await db.execute(
                select(Org)
                .options(joinedload(Org.obj), joinedload(Org.torg))
                .join(Org.obj)
                .order_by(Obj.nom)
            )
            orgs = result.unique().scalars().all()
        lines = ["# Organisations be.CLEAR\n"]
        for org in orgs:
            torg = org.torg.nom if org.torg else "N/A"
            lines.append(f"- **#{org.id}** {org.obj.nom} _{torg}_")
        return "\n".join(lines)

    @mcp.resource("beclear://org/{org_id}")
    async def resource_get_org(org_id: str) -> str:
        """Fiche complète d'une ORG (propriétés, ENGs)."""
        async with AsyncSession() as db:
            result = await db.execute(
                select(Org)
                .options(
                    joinedload(Org.obj).options(
                        selectinload(Obj.values).joinedload(Value.prop),
                    ),
                    joinedload(Org.torg),
                    selectinload(Org.engs).options(
                        joinedload(Eng.obj),
                        joinedload(Eng.teng),
                    ),
                )
                .where(Org.id == int(org_id))
            )
            org = result.unique().scalar_one_or_none()

        if org is None:
            return f"ORG #{org_id} introuvable."

        lines = [f"# ORG : {org.obj.nom} (#{org.id})\n"]
        lines.append(f"**Type :** {org.torg.nom if org.torg else 'N/A'}")
        if org.obj.description:
            lines.append(f"\n{org.obj.description}")
        vals = [v for v in org.obj.values if v.prop]
        if vals:
            lines.append("\n| Propriété | Valeur |\n|---|---|")
            for v in vals:
                val = v.valeur_texte or str(v.valeur_nombre or v.valeur_bool or "")
                lines.append(f"| {v.prop.nom} | {val} |")
        if org.engs:
            lines.append(f"\n## Engagements ({len(org.engs)})")
            for eng in org.engs:
                acc = eng.accomplissement or 0
                lines.append(
                    f"- #{eng.id} {eng.obj.nom} — {eng.teng.nom if eng.teng else '?'} — {acc:.0f}%"
                )
        return "\n".join(lines)

    @mcp.resource("beclear://eng/{eng_id}/gantt")
    async def resource_eng_gantt(eng_id: str) -> str:
        """Diagramme Gantt Mermaid d'un ENG."""
        async with AsyncSession() as db:
            result = await db.execute(
                select(Eng)
                .options(joinedload(Eng.obj))
                .where(Eng.id == int(eng_id))
            )
            eng = result.unique().scalar_one_or_none()

        if eng is None:
            return f"ENG #{eng_id} introuvable."
        if not eng.gantt_mermaid:
            return f"ENG #{eng_id} « {eng.obj.nom} » — aucun Gantt (pas d'EVENTs)."
        return f"# Gantt — {eng.obj.nom}\n\n```mermaid\n{eng.gantt_mermaid}\n```"

    @mcp.resource("beclear://envs")
    async def resource_list_envs() -> str:
        """Répertoire de tous les environnements enregistrés dans be.CLEAR."""
        async with AsyncSession() as db:
            result = await db.execute(
                select(Env)
                .options(joinedload(Env.obj), joinedload(Env.tenv))
                .join(Env.obj)
                .order_by(Obj.nom)
            )
            envs = result.unique().scalars().all()
        lines = ["# Environnements be.CLEAR\n"]
        for env in envs:
            tenv = env.tenv.nom if env.tenv else "N/A"
            lines.append(f"- **#{env.id}** {env.obj.nom} _{tenv}_")
        return "\n".join(lines)

    # ─────────────────────────────────────────────────────────
    # PROMPTS
    # ─────────────────────────────────────────────────────────

    @mcp.prompt()
    def briefing_org(org_nom: str) -> str:
        """Prépare un briefing complet avant une réunion avec une organisation."""
        return (
            f"Prépare-moi un briefing avant une réunion avec l'organisation « {org_nom} ».\n\n"
            "Étapes :\n"
            "1. Utilise l'outil `list_orgs` pour trouver l'ID de cette ORG.\n"
            "2. Récupère sa fiche complète avec `get_org`.\n"
            "3. Liste ses engagements actifs avec `list_engs` (filtre org_id).\n"
            "4. Récupère les EVENTs à venir avec `list_events_due`.\n\n"
            "Synthétise en une note de briefing structurée : contexte de l'organisation, "
            "engagements actifs, prochains jalons, points d'attention."
        )

    @mcp.prompt()
    def avancement_eng(eng_id: str) -> str:
        """Rapport d'état d'avancement d'un engagement."""
        return (
            f"Génère un rapport d'état d'avancement pour l'ENG #{eng_id}.\n\n"
            "Utilise l'outil `get_eng` pour récupérer toutes les informations.\n\n"
            "Le rapport doit inclure :\n"
            "- Taux d'accomplissement global\n"
            "- Liste des EVENTs accomplis avec leur date réelle\n"
            "- Liste des EVENTs en attente avec leur date prévue\n"
            "- EVENTs en retard (date prévue dépassée)\n"
            "- Estimation de la date de fin réelle vs prévue\n"
            "- Diagramme Gantt si disponible\n"
            "- Recommandations si des EVENTs sont en retard"
        )

    @mcp.prompt()
    def jalons_semaine(date_debut: str = "") -> str:
        """Liste des jalons prévus cette semaine."""
        periode = f"à partir du {date_debut}" if date_debut else "cette semaine"
        return (
            f"Quels sont les jalons prévus {periode} ?\n\n"
            f"Utilise l'outil `list_events_due` avec date_debut='{date_debut or ''}' "
            "pour récupérer les EVENTs de la semaine.\n\n"
            "Présente-les de façon claire :\n"
            "- Groupés par jour\n"
            "- Distingue ✅ accomplis et ⏳ en attente\n"
            "- Indique l'ENG parent de chaque EVENT\n"
            "- Signale les EVENTs déjà en retard avec `get_overdue_events`"
        )

    @mcp.prompt()
    def engs_en_retard(org_nom: str = "", seuil_jours: str = "7") -> str:
        """Détecte les engagements en retard ou à risque."""
        filtre = f"pour l'organisation « {org_nom} »" if org_nom else "pour toutes les organisations"
        return (
            f"Identifie les engagements en retard ou à risque {filtre}.\n\n"
            "Étapes :\n"
            f"1. {'Trouve l\'ID de l\'ORG avec `list_orgs`, puis ' if org_nom else ''}"
            "Utilise `get_overdue_events` pour les EVENTs déjà en retard.\n"
            f"2. Utilise `list_engs` pour identifier les ENGs dont le taux d'accomplissement "
            f"stagne depuis plus de {seuil_jours} jours.\n\n"
            "Présente un tableau de criticité avec :\n"
            "- ENG concerné\n"
            "- Nombre d'EVENTs en retard\n"
            "- Retard maximum (en jours)\n"
            "- Niveau de risque : 🔴 critique / 🟠 élevé / 🟡 modéré"
        )

    @mcp.prompt()
    def historique_interactions(org_nom: str, env_nom: str, n_mois: str = "6") -> str:
        """Résume les interactions entre une ORG et un ENV sur une période."""
        return (
            f"Résume les interactions entre « {org_nom} » et « {env_nom} » "
            f"sur les {n_mois} derniers mois.\n\n"
            "Étapes :\n"
            "1. Trouve les IDs avec `list_orgs` et `search` (entity_type=env).\n"
            "2. Utilise `list_engs` filtrés par org_id et env_id.\n"
            "3. Pour chaque ENG trouvé, récupère les détails avec `get_eng`.\n\n"
            "Synthèse attendue :\n"
            "- Nombre total d'ENGs sur la période\n"
            "- ENGs actifs vs clos\n"
            "- EVENTs marquants\n"
            "- Taux d'accomplissement moyen\n"
            "- Régularité des interactions (fréquence)\n"
            "- Tendance : en hausse, stable, en baisse ?"
        )

    @mcp.prompt()
    def onboarding_eng(org_nom: str, env_nom: str, type_eng: str = "") -> str:
        """Guide la création d'un nouvel engagement entre une ORG et un ENV."""
        type_hint = f" de type « {type_eng} »" if type_eng else ""
        return (
            f"Aide-moi à créer un nouvel engagement{type_hint} "
            f"entre « {org_nom} » et « {env_nom} ».\n\n"
            "Étapes :\n"
            "1. Utilise `list_orgs` et `search` pour trouver les IDs.\n"
            "2. Consulte les ENGs précédents avec `list_engs` pour référence.\n"
            "3. Propose un plan d'ENGs avec des EVENTs logiques et une chronologie cohérente.\n"
            "4. Pour chaque EVENT suggéré, utilise `create_event` après validation.\n\n"
            "Avant de créer quoi que ce soit, présente le plan complet et attends ma confirmation."
        )

    @mcp.prompt()
    def rapport_activite_org(org_nom: str, date_debut: str, date_fin: str) -> str:
        """Génère un rapport d'activité complet pour une ORG sur une période."""
        return (
            f"Génère le rapport d'activité de l'organisation « {org_nom} » "
            f"pour la période du {date_debut} au {date_fin}.\n\n"
            "Étapes :\n"
            "1. Trouve l'ORG avec `list_orgs` puis sa fiche avec `get_org`.\n"
            "2. Récupère ses ENGs avec `list_engs` filtrés par org_id.\n"
            "3. Pour les ENGs actifs sur la période, récupère les EVENTs avec `get_eng`.\n\n"
            "Format du rapport (Markdown) :\n"
            "- En-tête : ORG, période, date de génération\n"
            "- Présentation de l'organisation\n"
            "- Synthèse chiffrée (nb ENGs, taux accompli moyen)\n"
            "- Détail de chaque ENG avec ses EVENTs marquants\n"
            "- Conclusion et perspectives\n\n"
            "Le rapport doit être prêt à exporter vers Obsidian."
        )

    @mcp.prompt()
    def comparaison_orgs(org_nom_1: str, org_nom_2: str, n_mois: str = "3") -> str:
        """Compare l'activité de deux organisations sur une période."""
        return (
            f"Compare l'activité de « {org_nom_1} » et « {org_nom_2} » "
            f"sur les {n_mois} derniers mois.\n\n"
            "Pour chaque organisation :\n"
            "1. Utilise `list_orgs` pour trouver les IDs.\n"
            "2. Récupère les ENGs avec `list_engs`.\n"
            "3. Calcule les métriques : nb ENGs, taux d'accomplissement, types d'ENV fréquentées.\n\n"
            "Présente un tableau comparatif :\n"
            "| Métrique | {org_nom_1} | {org_nom_2} |\n"
            "|---|---|---|\n"
            "Et une conclusion sur les différences notables."
        )

    @mcp.prompt()
    def suivi_env(env_nom: str) -> str:
        """Vue transversale des ORGs actives avec un environnement donné."""
        return (
            f"Donne-moi une vue d'ensemble des organisations actives "
            f"avec l'environnement « {env_nom} ».\n\n"
            "Étapes :\n"
            "1. Trouve l'ENV avec `search` (entity_type=env).\n"
            "2. Liste les ENGs liés avec `list_engs` (filtre env_id, status=actif).\n"
            "3. Pour chaque ENG, récupère le prochain EVENT avec `list_events_due`.\n\n"
            "Présente :\n"
            "- Liste des ORGs en interaction active avec cet ENV\n"
            "- Date du dernier EVENT accompli par ORG\n"
            "- Prochain jalon prévu par ORG\n"
            "- ORGs sans activité récente (à relancer ?)"
        )

    @mcp.prompt()
    def diagnostic_obj(entity_type: str, nom: str) -> str:
        """Évalue la complétude de la fiche d'une entité."""
        return (
            f"Évalue la complétude de la fiche {entity_type.upper()} « {nom} ».\n\n"
            "Étapes :\n"
            f"1. Utilise `search` (entity_type={entity_type}, query='{nom}') pour trouver l'ID.\n"
            f"2. Récupère la fiche avec `get_{entity_type}` (ou `get_eng` pour ENG).\n\n"
            "Vérifie :\n"
            "- Toutes les PROPs ont-elles une VALUE renseignée ?\n"
            "- La description est-elle rédigée (non vide) ?\n"
            "- Y a-t-il une image principale ?\n"
            "- Les dates sont-elles cohérentes ?\n\n"
            "Retourne un score de complétude en % et la liste des champs manquants "
            "avec des suggestions de contenu."
        )
