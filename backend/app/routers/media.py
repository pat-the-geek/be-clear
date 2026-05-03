"""
Media — upload et gestion des images attachées aux OBJ.
  POST   /api/media/obj/{obj_id}/images                      → upload une image
  PUT    /api/media/obj/{obj_id}/images/{img_id}/principale  → définit comme principale
  DELETE /api/media/obj/{obj_id}/images/{img_id}             → supprime une image
"""
from __future__ import annotations
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.auth.dependencies import get_current_user, require_editeur
from app.models.activity import User
from app.models.object import Obj, Img

router = APIRouter()

ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
}
MAX_SIZE = 10 * 1024 * 1024  # 10 Mo


# ─── Schéma de sortie enrichi ─────────────────────────────────

class ImgOut(BaseModel):
    id: int
    chemin: str
    nom_original: str | None = None
    est_principale: bool
    mime_type: str | None = None
    model_config = {"from_attributes": True}


# ─── Helpers ──────────────────────────────────────────────────

def _img_dir(obj_id: int) -> Path:
    p = Path(settings.MEDIA_PATH) / str(obj_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


# ─── POST /obj/{obj_id}/images ────────────────────────────────

@router.post("/obj/{obj_id}/images", response_model=ImgOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    obj_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    """Upload une image et l'attache à un OBJ."""
    obj = await db.get(Obj, obj_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="OBJ introuvable")

    # Vérification du type MIME
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non supporté : {mime}. Formats acceptés : JPEG, PNG, GIF, WebP, SVG.",
        )

    # Lecture du contenu (max 10 Mo)
    content = await file.read(MAX_SIZE + 1)
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (maximum 10 Mo)")

    # Extension depuis le nom original
    original_name = file.filename or "image"
    ext = Path(original_name).suffix.lower()
    if not ext:
        ext_map = {
            "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
            "image/webp": ".webp", "image/svg+xml": ".svg",
        }
        ext = ext_map.get(mime, ".jpg")

    filename = f"{uuid.uuid4().hex}{ext}"
    dest = _img_dir(obj_id) / filename
    dest.write_bytes(content)

    # chemin relatif stocké en DB (ex: "42/abc123.jpg")
    chemin = f"{obj_id}/{filename}"

    # Première image → principale automatiquement
    count_result = await db.execute(select(Img).where(Img.obj_id == obj_id))
    est_principale = len(count_result.scalars().all()) == 0

    img = Img(
        obj_id=obj_id,
        chemin=chemin,
        nom_original=original_name,
        est_principale=est_principale,
        mime_type=mime,
    )
    db.add(img)
    await db.commit()
    await db.refresh(img)
    return img


# ─── PUT /obj/{obj_id}/images/{img_id}/principale ─────────────

@router.put("/obj/{obj_id}/images/{img_id}/principale", response_model=ImgOut)
async def set_principale(
    obj_id: int,
    img_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    """Désigne une image comme image principale de l'OBJ."""
    result = await db.execute(select(Img).where(Img.obj_id == obj_id))
    all_imgs = result.scalars().all()

    target = next((i for i in all_imgs if i.id == img_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Image introuvable")

    # Retirer le flag sur toutes, puis le poser sur la cible
    for i in all_imgs:
        i.est_principale = False
    target.est_principale = True

    await db.commit()
    await db.refresh(target)
    return target


# ─── DELETE /obj/{obj_id}/images/{img_id} ─────────────────────

@router.delete("/obj/{obj_id}/images/{img_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    obj_id: int,
    img_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editeur),
):
    """Supprime une image (fichier + entrée DB)."""
    result = await db.execute(select(Img).where(Img.obj_id == obj_id, Img.id == img_id))
    img = result.scalar_one_or_none()
    if img is None:
        raise HTTPException(status_code=404, detail="Image introuvable")

    # Suppression du fichier physique
    file_path = Path(settings.MEDIA_PATH) / img.chemin
    if file_path.exists():
        file_path.unlink()

    was_principale = img.est_principale
    await db.delete(img)
    await db.flush()

    # Si on supprimait la principale → promouvoir une autre
    if was_principale:
        result2 = await db.execute(select(Img).where(Img.obj_id == obj_id).limit(1))
        next_img = result2.scalar_one_or_none()
        if next_img:
            next_img.est_principale = True

    await db.commit()
