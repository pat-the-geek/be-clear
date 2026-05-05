"""Service ENG — recalcule date_fin_prevue, accomplissement et gantt_mermaid (Timeline) d'un ENG."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.activity import Eng, Event


# ─── Conversion unité → timedelta ────────────────────────────

def _to_timedelta(valeur: float, unite: str) -> timedelta:
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
    return timedelta(0)


def _to_minutes(valeur: float, unite: str) -> int:
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


# ─── Helpers Timeline ─────────────────────────────────────────

_MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
         "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"]


def _sanitize(s: str) -> str:
    return (s or "").replace(":", " -").replace("\n", " ").strip()


_TIMELINE_INIT = (
    "%%{init: {'theme': 'base', 'themeVariables': {"
    "'cScale0': '#2563eb', 'cScale1': '#b45309', 'cScale2': '#7c3aed', 'cScale3': '#ea580c',"
    "'cScale4': '#1d4ed8', 'cScale5': '#92400e', 'cScale6': '#6d28d9', 'cScale7': '#c2410c',"
    "'cScale8': '#3b82f6', 'cScale9': '#d97706', 'cScale10': '#8b5cf6', 'cScale11': '#f97316',"
    "'cScaleLabel0': '#ffffff', 'cScaleLabel1': '#ffffff', 'cScaleLabel2': '#ffffff', 'cScaleLabel3': '#ffffff',"
    "'cScaleLabel4': '#ffffff', 'cScaleLabel5': '#ffffff', 'cScaleLabel6': '#ffffff', 'cScaleLabel7': '#ffffff',"
    "'cScaleLabel8': '#ffffff', 'cScaleLabel9': '#ffffff', 'cScaleLabel10': '#ffffff', 'cScaleLabel11': '#ffffff',"
    "'lineColor': '#000000', 'primaryBorderColor': '#000000',"
    "'titleColor': '#1e293b', 'edgeLabelBackground': '#f8fafc'"
    "}}}%%"
)


def _build_timeline(events: list, nom_eng: str) -> str:
    """Génère un diagramme Mermaid Timeline pour les EVENTs d'un ENG."""
    if not events:
        return ""

    # Amplitude temporelle → choix de la granularité
    delta_total = events[-1].date_heure_prevue - events[0].date_heure_prevue
    secs = delta_total.total_seconds()

    if secs > 3600 * 24 * 300:          # > ~10 mois → grouper par mois, section = année
        def key(dt):   return (dt.year, dt.month)
        def section(dt): return str(dt.year)
        def label(dt): return _MOIS[dt.month - 1]
    elif secs > 3600 * 24:              # > 1 jour → grouper par jour, section = mois/année
        def key(dt):   return (dt.year, dt.month, dt.day)
        def section(dt): return f"{_MOIS[dt.month - 1]} {dt.year}"
        def label(dt): return str(dt.day)
    else:                               # ≤ 1 jour → grouper par heure, section = date
        def key(dt):   return (dt.year, dt.month, dt.day, dt.hour)
        def section(dt): return dt.strftime("%d/%m/%Y")
        def label(dt): return dt.strftime("%Hh")

    lines = [_TIMELINE_INIT, "timeline", f"    title {_sanitize(nom_eng)}"]

    current_section = None
    current_key = None

    for event in events:
        dt = event.date_heure_prevue
        sec = section(dt)
        k = key(dt)
        lbl = label(dt)

        if sec != current_section:
            lines.append(f"    section {sec}")
            current_section = sec

        nom = _sanitize(event.obj.nom if event.obj else f"EVENT {event.id}")
        status = " ✓" if event.date_heure_reelle else ""
        entry = f"{nom}{status}"

        if k != current_key:
            lines.append(f"        {lbl} : {entry}")
            current_key = k
        else:
            lines.append(f"                : {entry}")

    return "\n".join(lines)


# ─── Recalcul principal ───────────────────────────────────────

async def recalculate_eng(db: AsyncSession, eng_id: int) -> None:
    """
    Recalcule pour l'ENG donné :
      - date_fin_prevue  (date_heure_prevue du dernier EVENT + durée de son TEVENT)
      - accomplissement  (% d'EVENTs avec date_heure_reelle renseignée)
      - gantt_mermaid    (diagramme Mermaid Timeline)

    Met à jour la ligne ENG en base puis fait un flush (le commit est géré par l'appelant).
    """
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

    events = sorted(
        [e for e in eng.events if e.date_heure_prevue is not None],
        key=lambda e: e.date_heure_prevue,
    )

    total = len(events)

    # ── Calcul accomplissement ────────────────
    accomplissement = 0.0
    if total > 0:
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
            delta = _to_timedelta(float(tevent.duree_prevue_valeur), tevent.duree_prevue_unite)
            date_fin_prevue = dernier.date_heure_prevue + delta
        else:
            date_fin_prevue = dernier.date_heure_prevue

    # ── Génération Timeline Mermaid ───────────
    nom_eng = eng.obj.nom if eng.obj else f"ENG {eng_id}"
    gantt_mermaid = _build_timeline(events, nom_eng)

    # ── Mise à jour de l'ENG ──────────────────
    eng.date_fin_prevue = date_fin_prevue
    eng.accomplissement = accomplissement
    eng.gantt_mermaid = gantt_mermaid

    await db.flush()
