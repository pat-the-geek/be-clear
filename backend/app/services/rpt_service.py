"""
Service RPT — génère un rapport Markdown pour une ORG ou un ENV.
Contenu : fiche OBJ, ENG associés, EVENTs, images référencées.
Destinations : filesystem local ou vault Obsidian (chemin monté).
"""
from __future__ import annotations
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.config import settings
from app.models.activity import Org, Env, Eng, Event, Teng
from app.models.object import Obj, Value, Img, Doc


# ─── Helpers Markdown ────────────────────────────────────────

def _md_header(level: int, text: str) -> str:
    return f"{'#' * level} {text}\n\n"


def _md_prop_table(values: list[Value]) -> str:
    if not values:
        return ""
    rows = ["| Propriété | Valeur |", "|---|---|"]
    for v in values:
        nom = v.prop.nom if v.prop else "?"
        val = (
            v.valeur_texte or
            str(v.valeur_nombre) if v.valeur_nombre is not None else
            str(v.valeur_bool) if v.valeur_bool is not None else
            str(v.valeur_json) if v.valeur_json else
            str(v.valeur_date) if v.valeur_date else
            "—"
        )
        rows.append(f"| {nom} | {val} |")
    return "\n".join(rows) + "\n\n"


def _md_image(img: Img) -> str:
    return f"![{img.nom_original or 'image'}]({img.chemin})\n\n"


# ─── Génération du rapport ────────────────────────────────────

async def generate_org_report(db: AsyncSession, org_id: int) -> str:
    result = await db.execute(
        select(Org)
        .options(
            joinedload(Org.torg),
            joinedload(Org.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
                selectinload(Obj.documents),
            ),
            selectinload(Org.engs).options(
                joinedload(Eng.teng),
                joinedload(Eng.obj).options(
                    joinedload(Obj.cla),
                    selectinload(Obj.values).joinedload(Value.prop),
                    selectinload(Obj.images),
                ),
                selectinload(Eng.events).options(
                    joinedload(Event.tevent),
                    joinedload(Event.obj).options(
                        joinedload(Obj.cla),
                        selectinload(Obj.values).joinedload(Value.prop),
                        selectinload(Obj.images),
                    ),
                ),
            ),
        )
        .where(Org.id == org_id)
    )
    org = result.unique().scalar_one_or_none()
    if org is None:
        raise ValueError(f"ORG {org_id} introuvable")

    return _build_org_md(org)


async def generate_env_report(db: AsyncSession, env_id: int) -> str:
    result = await db.execute(
        select(Env)
        .options(
            joinedload(Env.tenv),
            joinedload(Env.obj).options(
                joinedload(Obj.cla),
                selectinload(Obj.values).joinedload(Value.prop),
                selectinload(Obj.images),
                selectinload(Obj.documents),
            ),
            selectinload(Env.engs).options(
                joinedload(Eng.teng),
                joinedload(Eng.obj).options(
                    joinedload(Obj.cla),
                    selectinload(Obj.values).joinedload(Value.prop),
                    selectinload(Obj.images),
                ),
                selectinload(Eng.events).options(
                    joinedload(Event.tevent),
                    joinedload(Event.obj).options(
                        joinedload(Obj.cla),
                        selectinload(Obj.values).joinedload(Value.prop),
                        selectinload(Obj.images),
                    ),
                ),
            ),
        )
        .where(Env.id == env_id)
    )
    env = result.unique().scalar_one_or_none()
    if env is None:
        raise ValueError(f"ENV {env_id} introuvable")

    return _build_env_md(env)


# ─── Builders Markdown ───────────────────────────────────────

def _build_obj_section(obj: Obj, type_label: str, type_nom: str) -> str:
    md = ""
    md += f"**Type** : {type_nom}  \n"
    md += f"**Classe** : {obj.cla.nom if obj.cla else '—'}  \n\n"

    # Images
    for img in obj.images:
        md += _md_image(img)

    # Description
    if obj.description:
        md += obj.description + "\n\n"

    # Propriétés
    if obj.values:
        md += _md_header(3, "Propriétés")
        md += _md_prop_table(obj.values)

    return md


def _build_eng_section(eng: Eng) -> str:
    md = _md_header(2, eng.obj.nom if eng.obj else f"ENG {eng.id}")
    md += _build_obj_section(eng.obj, "Engagement", eng.teng.nom if eng.teng else "—")

    # Dates
    md += "| | Prévu | Réel |\n|---|---|---|\n"
    md += f"| Début | {eng.date_debut_prevue or '—'} | {eng.date_debut or '—'} |\n"
    md += f"| Fin   | {eng.date_fin_prevue or '—'} | {eng.date_fin or '—'} |\n\n"

    if eng.accomplissement is not None:
        md += f"**Accomplissement** : {eng.accomplissement} %\n\n"

    # Gantt
    if eng.gantt_mermaid:
        md += "```mermaid\n" + eng.gantt_mermaid + "\n```\n\n"

    # Évènements
    events = sorted(
        [e for e in eng.events if e.date_heure_prevue],
        key=lambda e: e.date_heure_prevue,
    )
    if events:
        md += _md_header(3, "Évènements")
        for ev in events:
            nom = ev.obj.nom if ev.obj else f"EVENT {ev.id}"
            accompli = "✅" if ev.date_heure_reelle else "⏳"
            md += f"- {accompli} **{nom}**  \n"
            md += f"  Prévu : {ev.date_heure_prevue}  \n"
            if ev.date_heure_reelle:
                md += f"  Réalisé : {ev.date_heure_reelle}  \n"
            # Images de l'EVENT
            for img in (ev.obj.images if ev.obj else []):
                md += "  " + _md_image(img)
        md += "\n"

    return md


def _build_org_md(org: Org) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    md = _md_header(1, f"Rapport ORG — {org.obj.nom}")
    md += f"*Généré le {now}*\n\n---\n\n"
    md += _build_obj_section(org.obj, "Organisation", org.torg.nom if org.torg else "—")
    if org.engs:
        md += _md_header(2, "Engagements")
        for eng in org.engs:
            md += _build_eng_section(eng)
    return md


def _build_env_md(env: Env) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    md = _md_header(1, f"Rapport ENV — {env.obj.nom}")
    md += f"*Généré le {now}*\n\n---\n\n"
    md += _build_obj_section(env.obj, "Environnement", env.tenv.nom if env.tenv else "—")
    if env.engs:
        md += _md_header(2, "Engagements")
        for eng in env.engs:
            md += _build_eng_section(eng)
    return md


# ─── Écriture du fichier ─────────────────────────────────────

def save_report(content: str, entity_type: str, nom: str, destination: str) -> str:
    """
    Écrit le rapport sur le filesystem ou dans le vault Obsidian.
    Retourne le chemin du fichier créé.
    destination : 'filesystem' | 'obsidian'
    """
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    safe_nom = "".join(c if c.isalnum() or c in "-_" else "_" for c in nom)
    filename = f"{entity_type}-{safe_nom}-{date_str}.md"

    if destination == "obsidian":
        base = Path(settings.OBSIDIAN_VAULT_PATH)
    else:
        base = Path(settings.MEDIA_PATH) / "rapports"

    base.mkdir(parents=True, exist_ok=True)
    filepath = base / filename
    filepath.write_text(content, encoding="utf-8")
    return str(filepath)
