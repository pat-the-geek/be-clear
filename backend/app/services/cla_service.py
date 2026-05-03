"""
Service CLA — maintenance des dénormalisations.

refresh_sous_classes(db, cla_id)
    Recalcule `sous_classes_ids` pour la CLA donnée et tous ses ancêtres.
    À appeler après chaque INSERT ou UPDATE sur cla.

    Exemple :
        CLA "Organisation" (id=1)
        ├─ "Développement" (id=10)  ← sous_classes_ids = [10]
        ├─ "Formation"     (id=12)  ← [12, 24, 25]
        │   ├─ "Formation de groupe"     (id=24)
        │   └─ "Formation individuelle"  (id=25)
        └─ ...

    "Organisation".sous_classes_ids = [1, 10, 12, 24, 25, ...]
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.object import Cla


async def refresh_sous_classes(db: AsyncSession, cla_id: int) -> None:
    """Recalcule sous_classes_ids pour cla_id et tous ses ancêtres."""

    # ── 1. Charger toutes les CLAs en mémoire (table petite, ≤ quelques centaines) ──
    result = await db.execute(select(Cla))
    all_clas: list[Cla] = result.scalars().all()
    cla_map: dict[int, Cla] = {c.id: c for c in all_clas}

    # ── 2. Calcul récursif : descendants de cid (soi inclus) ─────────────────────
    def descendants(cid: int) -> list[int]:
        ids = [cid]
        for c in all_clas:
            if c.super_classe_id == cid:
                ids.extend(descendants(c.id))
        return ids

    # ── 3. Remonter la chaîne d'ancêtres depuis cla_id ───────────────────────────
    def ancestors(cid: int) -> list[int]:
        result: list[int] = []
        current = cla_map.get(cid)
        while current and current.super_classe_id is not None:
            result.append(current.super_classe_id)
            current = cla_map.get(current.super_classe_id)
        return result

    # ── 4. Mettre à jour cla_id + tous ses ancêtres ──────────────────────────────
    to_update = {cla_id} | set(ancestors(cla_id))
    for cid in to_update:
        cla = cla_map.get(cid)
        if cla is not None:
            cla.sous_classes_ids = descendants(cid)

    await db.flush()


async def refresh_all_sous_classes(db: AsyncSession) -> None:
    """Recalcule sous_classes_ids pour toutes les CLAs racines (sans super-classe)."""
    result = await db.execute(select(Cla).where(Cla.super_classe_id.is_(None)))
    roots = result.scalars().all()
    for root in roots:
        await refresh_sous_classes(db, root.id)
