"""
Tests upload/suppression images et documents — POST/PUT/DELETE /api/media/obj/{id}/...

Les fichiers sont écrits dans MEDIA_PATH=/tmp/beclear_test_media (défini en conftest).
Meilisearch est hors scope : index_obj/delete_obj sont mockés.
"""
import io
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token

# PNG 1×1 pixel minimaliste valide
MINIMAL_PNG = (
    b'\x89PNG\r\n\x1a\n'
    b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x02\x00\x00\x00\x90wS\xde'
    b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N'
    b'\x00\x00\x00\x00IEND\xaeB`\x82'
)
MINIMAL_MARKDOWN = b"# Test\n\nContenu de test."


@pytest.fixture
async def media_fixtures(db_session: AsyncSession, client: AsyncClient, monkeypatch):
    """Crée un admin ÉDITEUR, un lecteur, un OBJ via ORG et mocke Meilisearch."""

    async def noop(*args, **kwargs):
        pass

    monkeypatch.setattr("app.services.search_service.index_obj", noop)
    monkeypatch.setattr("app.services.search_service.delete_obj", noop)

    role_admin = await create_role(db_session, "ADMIN")
    role_lecteur = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_media_test")
    cla = await create_cla(db_session, "ClaMediaTest")
    admin = await create_user(db_session, auth_uid="admin_media_test",
                              tuser_id=tuser.id, role_id=role_admin.id, cla_id=cla.id)
    lecteur = await create_user(db_session, auth_uid="lecteur_media_test",
                                tuser_id=tuser.id, role_id=role_lecteur.id, cla_id=cla.id)
    await db_session.commit()

    h_admin = {"Authorization": f"Bearer {await get_token(admin)}"}
    h_lecteur = {"Authorization": f"Bearer {await get_token(lecteur)}"}

    # Créer un TORG et une ORG pour avoir un OBJ
    r = await client.post("/api/torg", json={"nom": "TorgMedia", "cla_id": cla.id},
                          headers=h_admin)
    torg_id = r.json()["id"]
    r = await client.post("/api/org", json={"nom": "OrgMedia", "torg_id": torg_id,
                                            "cla_id": cla.id, "values": []}, headers=h_admin)
    assert r.status_code == 201
    org_data = r.json()
    obj_id = org_data["obj"]["id"]

    return {
        "h_admin": h_admin,
        "h_lecteur": h_lecteur,
        "obj_id": obj_id,
        "org_id": org_data["id"],
    }


# ─── Images ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_image_ok(client: AsyncClient, media_fixtures):
    """Upload d'une image PNG valide → 201 avec les champs ImgOut."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/images",
        files={"file": ("test.png", io.BytesIO(MINIMAL_PNG), "image/png")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"] > 0
    assert data["est_principale"] is True
    assert "chemin" in data
    assert data["mime_type"] == "image/png"


@pytest.mark.asyncio
async def test_upload_image_invalid_mime(client: AsyncClient, media_fixtures):
    """Upload d'un fichier avec MIME non supporté → 400."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/images",
        files={"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 400
    assert "non support" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_upload_image_obj_not_found(client: AsyncClient, media_fixtures):
    """OBJ inexistant → 404."""
    r = await client.post(
        "/api/media/obj/999999/images",
        files={"file": ("test.png", io.BytesIO(MINIMAL_PNG), "image/png")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_upload_image_requires_editeur(client: AsyncClient, media_fixtures):
    """Un LECTEUR ne peut pas uploader une image."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/images",
        files={"file": ("test.png", io.BytesIO(MINIMAL_PNG), "image/png")},
        headers=media_fixtures["h_lecteur"],
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_first_image_becomes_principale(client: AsyncClient, media_fixtures):
    """La première image uploadée est automatiquement désignée comme principale."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/images",
        files={"file": ("img1.png", io.BytesIO(MINIMAL_PNG), "image/png")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 201
    assert r.json()["est_principale"] is True


@pytest.mark.asyncio
async def test_set_principale_switches_flag(client: AsyncClient, media_fixtures):
    """PUT .../principale change l'image principale."""
    obj_id = media_fixtures["obj_id"]
    h = media_fixtures["h_admin"]

    # Upload deux images
    r1 = await client.post(f"/api/media/obj/{obj_id}/images",
                           files={"file": ("img1.png", io.BytesIO(MINIMAL_PNG), "image/png")},
                           headers=h)
    r2 = await client.post(f"/api/media/obj/{obj_id}/images",
                           files={"file": ("img2.png", io.BytesIO(MINIMAL_PNG), "image/png")},
                           headers=h)
    img1_id = r1.json()["id"]
    img2_id = r2.json()["id"]

    # img1 est principale (première uploadée)
    assert r1.json()["est_principale"] is True

    # Changer la principale vers img2
    r = await client.put(f"/api/media/obj/{obj_id}/images/{img2_id}/principale", headers=h)
    assert r.status_code == 200
    assert r.json()["est_principale"] is True
    assert r.json()["id"] == img2_id


@pytest.mark.asyncio
async def test_delete_image_ok(client: AsyncClient, media_fixtures):
    """DELETE image → 204."""
    obj_id = media_fixtures["obj_id"]
    h = media_fixtures["h_admin"]

    r = await client.post(f"/api/media/obj/{obj_id}/images",
                          files={"file": ("del.png", io.BytesIO(MINIMAL_PNG), "image/png")},
                          headers=h)
    img_id = r.json()["id"]

    r2 = await client.delete(f"/api/media/obj/{obj_id}/images/{img_id}", headers=h)
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_delete_image_promotes_next(client: AsyncClient, media_fixtures):
    """Supprimer la principale → la suivante devient principale."""
    obj_id = media_fixtures["obj_id"]
    h = media_fixtures["h_admin"]

    r1 = await client.post(f"/api/media/obj/{obj_id}/images",
                           files={"file": ("p1.png", io.BytesIO(MINIMAL_PNG), "image/png")},
                           headers=h)
    r2 = await client.post(f"/api/media/obj/{obj_id}/images",
                           files={"file": ("p2.png", io.BytesIO(MINIMAL_PNG), "image/png")},
                           headers=h)
    img1_id = r1.json()["id"]
    img2_id = r2.json()["id"]

    # Supprimer la principale (img1)
    await client.delete(f"/api/media/obj/{obj_id}/images/{img1_id}", headers=h)

    # Récupérer l'ORG → vérifier que img2 est maintenant principale
    r_org = await client.get(f"/api/org/{media_fixtures['org_id']}", headers=h)
    images = r_org.json()["obj"]["images"]
    principales = [i for i in images if i["est_principale"]]
    assert len(principales) == 1
    assert principales[0]["id"] == img2_id


@pytest.mark.asyncio
async def test_delete_image_not_found(client: AsyncClient, media_fixtures):
    """Supprimer une image inexistante → 404."""
    obj_id = media_fixtures["obj_id"]
    r = await client.delete(f"/api/media/obj/{obj_id}/images/999999",
                            headers=media_fixtures["h_admin"])
    assert r.status_code == 404


# ─── Documents ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_document_markdown_ok(client: AsyncClient, media_fixtures):
    """Upload d'un document Markdown → 201 avec format='markdown'."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/documents",
        files={"file": ("rapport.md", io.BytesIO(MINIMAL_MARKDOWN), "text/markdown")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["format"] == "markdown"
    assert data["nom_original"] == "rapport.md"
    assert data["taille_octets"] == len(MINIMAL_MARKDOWN)


@pytest.mark.asyncio
async def test_upload_document_invalid_format(client: AsyncClient, media_fixtures):
    """Upload d'un format non supporté → 400."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/documents",
        files={"file": ("script.py", io.BytesIO(b"print('hello')"), "text/x-python")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 400
    assert "non support" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_upload_document_obj_not_found(client: AsyncClient, media_fixtures):
    """OBJ inexistant → 404."""
    r = await client.post(
        "/api/media/obj/999999/documents",
        files={"file": ("doc.md", io.BytesIO(MINIMAL_MARKDOWN), "text/markdown")},
        headers=media_fixtures["h_admin"],
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_document_ok(client: AsyncClient, media_fixtures):
    """DELETE document → 204."""
    obj_id = media_fixtures["obj_id"]
    h = media_fixtures["h_admin"]

    r = await client.post(
        f"/api/media/obj/{obj_id}/documents",
        files={"file": ("to_delete.md", io.BytesIO(MINIMAL_MARKDOWN), "text/markdown")},
        headers=h,
    )
    doc_id = r.json()["id"]

    r2 = await client.delete(f"/api/media/obj/{obj_id}/documents/{doc_id}", headers=h)
    assert r2.status_code == 204


@pytest.mark.asyncio
async def test_delete_document_not_found(client: AsyncClient, media_fixtures):
    """Supprimer un document inexistant → 404."""
    obj_id = media_fixtures["obj_id"]
    r = await client.delete(f"/api/media/obj/{obj_id}/documents/999999",
                            headers=media_fixtures["h_admin"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_upload_document_requires_editeur(client: AsyncClient, media_fixtures):
    """Un LECTEUR ne peut pas uploader un document."""
    obj_id = media_fixtures["obj_id"]
    r = await client.post(
        f"/api/media/obj/{obj_id}/documents",
        files={"file": ("doc.md", io.BytesIO(MINIMAL_MARKDOWN), "text/markdown")},
        headers=media_fixtures["h_lecteur"],
    )
    assert r.status_code == 403
