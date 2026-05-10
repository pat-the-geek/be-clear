"""Service ENG — recalcule date_fin_prevue, accomplissement et gantt_mermaid (Timeline) d'un ENG."""
from datetime import datetime, timedelta, timezone

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

    lines = ["timeline", f"    title {_sanitize(nom_eng)}"]

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


# ─── Génération Gantt PNG (matplotlib) ───────────────────────

def generate_gantt_png(eng_nom: str, events: list, now: datetime) -> bytes:
    """Génère un diagramme Gantt JPEG via matplotlib.

    events: liste de dicts {id, nom, tevent_nom, date_prevue (ISO), date_reelle (ISO), done}
    Retourne les bytes JPEG.
    """
    import io
    from collections import defaultdict
    from datetime import datetime as _dt, timedelta as _td

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.switch_backend("Agg")
    import matplotlib.dates as mdates
    import matplotlib.patches as mpatches
    from matplotlib.dates import date2num

    C_DONE   = "#22c55e"
    C_PLAN   = "#7c3aed"
    C_LATE   = "#f87171"
    C_TODAY  = "#f59e0b"
    C_SEC_BG = "#ede9fe"
    C_SEC_FG = "#5b21b6"
    C_GRID   = "#e5e7eb"
    C_TEXT   = "#374151"

    now_plain = now.replace(tzinfo=None)
    MIN_BAR   = 3

    sorted_evs = sorted(events, key=lambda e: e.get("date_prevue") or "9999")
    by_sec: dict = defaultdict(list)
    for ev in sorted_evs:
        by_sec[ev["tevent_nom"]].append(ev)

    rows: list[tuple] = []
    for sec_name, sec_evs in by_sec.items():
        rows.append(("section", sec_name, None))
        for ev in sec_evs:
            rows.append(("event", ev["nom"], ev))

    n = len(rows)
    if n == 0:
        fig, ax = plt.subplots(figsize=(10, 3))
        ax.text(0.5, 0.5, "Aucun évènement", ha="center", va="center",
                fontsize=12, color="#6b7280", transform=ax.transAxes)
        ax.axis("off")
        ax.set_title(eng_nom, fontsize=12, fontweight="bold")
        buf = io.BytesIO()
        fig.savefig(buf, format="jpeg", bbox_inches="tight", facecolor="white",
                    pil_kwargs={"quality": 85})
        plt.close(fig)
        buf.seek(0)
        return buf.read()

    all_dates: list[_dt] = []
    for ev in sorted_evs:
        dp, dr = ev.get("date_prevue"), ev.get("date_reelle")
        if dp:
            all_dates.append(_dt.fromisoformat(dp[:10]))
        if dr:
            all_dates.append(_dt.fromisoformat(dr[:10]))
    if not all_dates:
        all_dates = [now_plain]

    d_min, d_max = min(all_dates), max(all_dates)
    span_d = max((d_max - d_min).days, 7)
    pad_d  = max(int(span_d * 0.08), 3)
    chart_s = d_min - _td(days=pad_d)
    chart_e = d_max + _td(days=pad_d * 2)

    fig_h = max(4, n * 0.48 + 2.0)
    fig, ax = plt.subplots(figsize=(14, fig_h), dpi=96)
    ax.set_facecolor("#ffffff")
    fig.patch.set_facecolor("#ffffff")

    yticks, ylabels = [], []

    for i, (rtype, label, ev) in enumerate(rows):
        y = n - i
        if rtype == "section":
            ax.axhspan(y - 0.45, y + 0.45, color=C_SEC_BG, zorder=1, linewidth=0)
            yticks.append(y)
            ylabels.append(f"  {label}")
        else:
            ax.axhline(y - 0.45, color=C_GRID, lw=0.5, zorder=0)
            yticks.append(y)
            ylabels.append(f"  {label}")
            dp = ev.get("date_prevue")
            dr = ev.get("date_reelle")
            done = ev.get("done", False)
            if not dp:
                continue
            s = _dt.fromisoformat(dp[:10])
            if done and dr:
                e = _dt.fromisoformat(dr[:10])
                if (e - s).days < MIN_BAR:
                    e = s + _td(days=MIN_BAR)
            else:
                e = s + _td(days=MIN_BAR)
            late  = not done and s < now_plain
            color = C_DONE if done else (C_LATE if late else C_PLAN)
            ax.barh(y, date2num(e) - date2num(s), left=date2num(s),
                    height=0.5, color=color, alpha=0.88, zorder=2, linewidth=0)

    if chart_s <= now_plain <= chart_e:
        ax.axvline(date2num(now_plain), color=C_TODAY, lw=2, zorder=5, alpha=0.95)
        ax.text(now_plain, n + 0.7, "Auj.", ha="center", va="top",
                fontsize=7.5, color=C_TODAY, fontweight="bold", zorder=6)

    ax.set_xlim(date2num(chart_s), date2num(chart_e))
    ax.set_ylim(0.3, n + 1.2)
    ax.xaxis_date()

    span_total = (chart_e - chart_s).days
    if span_total > 90:
        ax.xaxis.set_major_locator(mdates.MonthLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    elif span_total > 21:
        ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=0))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m"))
    else:
        ax.xaxis.set_major_locator(mdates.DayLocator())
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m"))

    ax.xaxis.grid(True, color=C_GRID, lw=0.6, zorder=0)
    plt.setp(ax.xaxis.get_majorticklabels(), rotation=35, ha="right", fontsize=8)

    ax.set_yticks(yticks)
    ax.set_yticklabels(ylabels, fontsize=8.5)
    for tick, (rtype, *_) in zip(ax.get_yticklabels(), rows):
        tick.set_color(C_SEC_FG if rtype == "section" else C_TEXT)
        tick.set_fontweight("bold" if rtype == "section" else "normal")

    ax.set_title(eng_nom, fontsize=12, fontweight="bold", color="#111827", pad=8, loc="left")

    patches = [
        mpatches.Patch(color=C_DONE, label="Accompli"),
        mpatches.Patch(color=C_PLAN, label="Planifié"),
        mpatches.Patch(color=C_LATE, label="En retard"),
    ]
    ax.legend(handles=patches, loc="lower right", fontsize=8,
              framealpha=0.9, edgecolor=C_GRID, ncol=3)

    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(C_GRID)

    fig.tight_layout(pad=1.5)
    buf = io.BytesIO()
    fig.savefig(buf, format="jpeg", bbox_inches="tight",
                facecolor="white", dpi=96, pil_kwargs={"quality": 85, "optimize": True})
    plt.close(fig)
    buf.seek(0)
    return buf.read()
