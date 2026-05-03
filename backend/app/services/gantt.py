"""Service Gantt — recalcule date_fin_prevue, accomplissement et gantt_mermaid d'un ENG."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.activity import Eng, Event


# ─── Conversion unité → timedelta ────────────────────────────

def _to_timedelta(valeur: float, unite: str) -> timedelta:
    """Convertit une durée (valeur + unité) en timedelta."""
    unite = (unite or "").lower()
    if unite == "secondes":
        return timedelta(seconds=valeur)
    elif unite == "minutes":
        return timedelta(minutes=valeur)
    elif unite == "heures":
        return timedelta(hours=valeur)
    elif unite == "jours":
        return timedelta(days=valeur)
    elif unite == "mois":
        return timedelta(days=valeur * 30)
    # Unité inconnue → 0
    return timedelta(0)


def _to_minutes(valeur: float, unite: str) -> int:
    """Convertit une durée en minutes (entier, minimum 1) pour Mermaid."""
    unite = (unite or "").lower()
    if unite == "secondes":
        minutes = valeur / 60
    elif unite == "minutes":
        minutes = valeur
    elif unite == "heures":
        minutes = valeur * 60
    elif unite == "jours":
        minutes = valeur * 1440
    elif unite == "mois":
        minutes = valeur * 43200
    else:
        minutes = 1
    return max(1, int(minutes))


# ─── Recalcul principal ───────────────────────────────────────

async def recalculate_eng(db: AsyncSession, eng_id: int) -> None:
    """
    Recalcule pour l'ENG donné :
      - date_fin_prevue  (date_heure_prevue du dernier EVENT + durée de son TEVENT)
      - accomplissement  (% d'EVENTs avec date_heure_reelle renseignée)
      - gantt_mermaid    (diagramme Mermaid gantt)

    Met à jour la ligne ENG en base puis fait un flush (le commit est géré par l'appelant).
    """
    # Charger l'ENG avec son OBJ (pour le nom) et ses EVENTs avec leur TEVENT
    eng_result = await db.execute(
        select(Eng)
        .options(
            joinedload(Eng.obj),
            joinedload(Eng.events).joinedload(Event.tevent),
            joinedload(Eng.events).joinedload(Event.obj),
        )
        .where(Eng.id == eng_id)
    )
    eng = eng_result.unique().scalar_one_or_none()
    if eng is None:
        return

    # Trier les EVENTs par date_heure_prevue (la relation est déjà ordonnée,
    # mais on s'assure aussi côté Python pour la robustesse)
    events = sorted(
        [e for e in eng.events if e.date_heure_prevue is not None],
        key=lambda e: e.date_heure_prevue,
    )

    total = len(events)

    # ── Calcul accomplissement ────────────────
    if total == 0:
        accomplissement = 0.0
    else:
        accomplis = sum(1 for e in events if e.date_heure_reelle is not None)
        accomplissement = round(accomplis / total * 100, 2)

    # ── Calcul date_fin_prevue ────────────────
    date_fin_prevue = None
    if events:
        dernier = events[-1]
        tevent = dernier.tevent
        if (
            tevent is not None
            and tevent.duree_prevue_valeur is not None
            and tevent.duree_prevue_unite is not None
        ):
            delta = _to_timedelta(
                float(tevent.duree_prevue_valeur),
                tevent.duree_prevue_unite,
            )
            date_fin_prevue = dernier.date_heure_prevue + delta
        else:
            date_fin_prevue = dernier.date_heure_prevue

    # ── Génération diagramme Mermaid ──────────
    nom_eng = eng.obj.nom if eng.obj else f"ENG {eng_id}"

    lines = [
        "gantt",
        f"    title {nom_eng}",
        "    dateFormat YYYY-MM-DD HH:mm",
        "    section Évènements",
    ]

    for event in events:
        tevent = event.tevent
        nom_event = event.obj.nom if event.obj else f"EVENT {event.id}"
        date_iso = event.date_heure_prevue.strftime("%Y-%m-%d %H:%M")

        if (
            tevent is not None
            and tevent.duree_prevue_valeur is not None
            and tevent.duree_prevue_unite is not None
        ):
            duree_min = _to_minutes(
                float(tevent.duree_prevue_valeur),
                tevent.duree_prevue_unite,
            )
        else:
            duree_min = 60  # valeur par défaut : 1 heure

        lines.append(f"    {nom_event} : {date_iso}, {duree_min}min")

    gantt_mermaid = "\n".join(lines)

    # ── Mise à jour de l'ENG ──────────────────
    eng.date_fin_prevue = date_fin_prevue
    eng.accomplissement = accomplissement
    eng.gantt_mermaid = gantt_mermaid

    await db.flush()
