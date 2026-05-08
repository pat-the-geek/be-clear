"""Tests templates TENG/TEVENT et auto-création d'EVENTs à la création d'un ENG."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_user, get_token,
    create_teng, create_tevent, create_torg, create_tenv,
)


@pytest.fixture
async def tmpl_fixtures(db_session: AsyncSession):
    """Fixture complète : ADMIN + TENG + 2 TEVENTs + TORG/ORG + TENV/ENV."""
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_tmpl")
    cla = await create_cla(db_session, "ClaTmpl")
    user = await create_user(db_session, auth_uid="admin_tmpl",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)

    teng = await create_teng(db_session, "TengTmpl", cla.id)
    tv1 = await create_tevent(db_session, "TV-A", cla.id, duree_valeur=2.0, duree_unite="heures")
    tv2 = await create_tevent(db_session, "TV-B", cla.id, duree_valeur=1.0, duree_unite="jours")

    torg = await create_torg(db_session, "TorgTmpl", cla.id)
    tenv = await create_tenv(db_session, "TenvTmpl", cla.id)
    await db_session.commit()

    token = await get_token(user)
    h = {"Authorization": f"Bearer {token}"}

    return {
        "headers": h,
        "cla_id": cla.id,
        "teng_id": teng.id,
        "tv1_id": tv1.id,
        "tv2_id": tv2.id,
        "torg_id": torg.id,
        "tenv_id": tenv.id,
    }


async def _create_org_env(client: AsyncClient, f: dict) -> tuple[int, int]:
    """Crée un ORG et un ENV via l'API — retourne (org_id, env_id)."""
    h = f["headers"]
    r = await client.post("/api/org", json={"nom": "OrgTmpl", "torg_id": f["torg_id"],
                                            "cla_id": f["cla_id"], "values": []}, headers=h)
    assert r.status_code == 201
    org_id = r.json()["id"]

    r = await client.post("/api/env", json={"nom": "EnvTmpl", "tenv_id": f["tenv_id"],
                                            "cla_id": f["cla_id"], "values": []}, headers=h)
    assert r.status_code == 201
    env_id = r.json()["id"]
    return org_id, env_id


# ─── GET templates ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_templates_empty(client: AsyncClient, tmpl_fixtures):
    """Un TENG sans template retourne une liste vide."""
    r = await client.get(f"/api/teng/{tmpl_fixtures['teng_id']}/templates",
                         headers=tmpl_fixtures["headers"])
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_templates_requires_auth(client: AsyncClient, tmpl_fixtures):
    r = await client.get(f"/api/teng/{tmpl_fixtures['teng_id']}/templates")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_templates_teng_404(client: AsyncClient, tmpl_fixtures):
    r = await client.get("/api/teng/999999/templates", headers=tmpl_fixtures["headers"])
    assert r.status_code == 404


# ─── POST templates ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_template_ok(client: AsyncClient, tmpl_fixtures):
    """Ajout d'un premier template → ordre 0."""
    r = await client.post(
        f"/api/teng/{tmpl_fixtures['teng_id']}/templates",
        json={"tevent_id": tmpl_fixtures["tv1_id"]},
        headers=tmpl_fixtures["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["teng_id"] == tmpl_fixtures["teng_id"]
    assert data["tevent_id"] == tmpl_fixtures["tv1_id"]
    assert data["ordre"] == 0
    assert data["tevent_nom"] == "TV-A"
    assert data["tevent_duree_valeur"] == 2.0
    assert data["tevent_duree_unite"] == "heures"


@pytest.mark.asyncio
async def test_add_template_ordre_increments(client: AsyncClient, tmpl_fixtures):
    """Le deuxième template ajouté reçoit l'ordre 1."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    r1 = await client.post(f"/api/teng/{teng_id}/templates",
                           json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)
    assert r1.status_code == 201
    r2 = await client.post(f"/api/teng/{teng_id}/templates",
                           json={"tevent_id": tmpl_fixtures["tv2_id"]}, headers=h)
    assert r2.status_code == 201
    assert r2.json()["ordre"] == 1


@pytest.mark.asyncio
async def test_add_template_requires_admin(client: AsyncClient, db_session: AsyncSession,
                                           tmpl_fixtures):
    """Un non-ADMIN ne peut pas ajouter un template."""
    role = await create_role(db_session, "LECTEUR")
    tuser = await create_tuser(db_session, "humain_tmpl_lect")
    cla_id = tmpl_fixtures["cla_id"]
    cla = await create_cla(db_session, "ClaLecteur2")
    user = await create_user(db_session, auth_uid="lecteur_tmpl",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)

    r = await client.post(
        f"/api/teng/{tmpl_fixtures['teng_id']}/templates",
        json={"tevent_id": tmpl_fixtures["tv1_id"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_add_template_unknown_tevent(client: AsyncClient, tmpl_fixtures):
    r = await client.post(
        f"/api/teng/{tmpl_fixtures['teng_id']}/templates",
        json={"tevent_id": 999999},
        headers=tmpl_fixtures["headers"],
    )
    assert r.status_code == 400


# ─── DELETE templates ────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_template_ok(client: AsyncClient, tmpl_fixtures):
    """Suppression d'un template et vérification que la liste est vide ensuite."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    r = await client.post(f"/api/teng/{teng_id}/templates",
                          json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)
    assert r.status_code == 201
    tmpl_id = r.json()["id"]

    r = await client.delete(f"/api/teng/{teng_id}/templates/{tmpl_id}", headers=h)
    assert r.status_code == 204

    r = await client.get(f"/api/teng/{teng_id}/templates", headers=h)
    assert r.json() == []


@pytest.mark.asyncio
async def test_delete_template_renumbers(client: AsyncClient, tmpl_fixtures):
    """Après suppression du premier template, l'ordre du restant est renommé à 0."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    r1 = await client.post(f"/api/teng/{teng_id}/templates",
                           json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)
    r2 = await client.post(f"/api/teng/{teng_id}/templates",
                           json={"tevent_id": tmpl_fixtures["tv2_id"]}, headers=h)
    assert r1.status_code == r2.status_code == 201
    first_id = r1.json()["id"]

    # Supprimer le premier (ordre 0)
    await client.delete(f"/api/teng/{teng_id}/templates/{first_id}", headers=h)

    r = await client.get(f"/api/teng/{teng_id}/templates", headers=h)
    assert r.status_code == 200
    remaining = r.json()
    assert len(remaining) == 1
    assert remaining[0]["ordre"] == 0
    assert remaining[0]["tevent_id"] == tmpl_fixtures["tv2_id"]


@pytest.mark.asyncio
async def test_delete_template_404(client: AsyncClient, tmpl_fixtures):
    r = await client.delete(
        f"/api/teng/{tmpl_fixtures['teng_id']}/templates/999999",
        headers=tmpl_fixtures["headers"],
    )
    assert r.status_code == 404


# ─── PUT reorder ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reorder_templates(client: AsyncClient, tmpl_fixtures):
    """Inversion de l'ordre des deux templates."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    r1 = await client.post(f"/api/teng/{teng_id}/templates",
                           json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)
    r2 = await client.post(f"/api/teng/{teng_id}/templates",
                           json={"tevent_id": tmpl_fixtures["tv2_id"]}, headers=h)
    assert r1.status_code == r2.status_code == 201
    id1 = r1.json()["id"]
    id2 = r2.json()["id"]

    # Inverser : [id2, id1]
    r = await client.put(f"/api/teng/{teng_id}/templates/reorder",
                         json={"ordre": [id2, id1]}, headers=h)
    assert r.status_code == 200
    result = r.json()
    assert result[0]["id"] == id2
    assert result[0]["ordre"] == 0
    assert result[1]["id"] == id1
    assert result[1]["ordre"] == 1


@pytest.mark.asyncio
async def test_reorder_unknown_template_id(client: AsyncClient, tmpl_fixtures):
    """Un ID inconnu dans le reorder retourne 400."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    r = await client.post(f"/api/teng/{teng_id}/templates",
                          json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)
    assert r.status_code == 201

    r = await client.put(f"/api/teng/{teng_id}/templates/reorder",
                         json={"ordre": [999999]}, headers=h)
    assert r.status_code == 400


# ─── ENG auto-création d'EVENTs ──────────────────────────────

@pytest.mark.asyncio
async def test_eng_create_auto_events_with_date_debut(client: AsyncClient, tmpl_fixtures):
    """Création d'un ENG avec date_debut → EVENTs créés automatiquement avec dates cascadées."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    # Ajouter 2 templates : TV-A (2h) puis TV-B (1j)
    await client.post(f"/api/teng/{teng_id}/templates",
                      json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)
    await client.post(f"/api/teng/{teng_id}/templates",
                      json={"tevent_id": tmpl_fixtures["tv2_id"]}, headers=h)

    org_id, env_id = await _create_org_env(client, tmpl_fixtures)

    r = await client.post("/api/eng", json={
        "nom": "EngAutoEvt",
        "teng_id": teng_id,
        "cla_id": tmpl_fixtures["cla_id"],
        "org_ids": [org_id],
        "env_ids": [env_id],
        "date_debut": "2026-06-01T08:00:00",
        "values": [],
    }, headers=h)
    assert r.status_code == 201
    data = r.json()
    events = data["events"]

    assert len(events) == 2
    # Premier event : date_debut = 2026-06-01T08:00:00
    assert events[0]["tevent_nom"] == "TV-A"
    assert events[0]["date_heure_prevue"].startswith("2026-06-01T08:00:00")
    # Deuxième event : +2h → 2026-06-01T10:00:00
    assert events[1]["tevent_nom"] == "TV-B"
    assert events[1]["date_heure_prevue"].startswith("2026-06-01T10:00:00")


@pytest.mark.asyncio
async def test_eng_create_auto_events_with_date_debut_prevue(client: AsyncClient, tmpl_fixtures):
    """Sans date_debut mais avec date_debut_prevue → les EVENTs utilisent date_debut_prevue."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    await client.post(f"/api/teng/{teng_id}/templates",
                      json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)

    org_id, env_id = await _create_org_env(client, tmpl_fixtures)

    r = await client.post("/api/eng", json={
        "nom": "EngAutoPrevue",
        "teng_id": teng_id,
        "cla_id": tmpl_fixtures["cla_id"],
        "org_ids": [org_id],
        "env_ids": [env_id],
        "date_debut_prevue": "2026-07-15T09:00:00",
        "values": [],
    }, headers=h)
    assert r.status_code == 201
    events = r.json()["events"]
    assert len(events) == 1
    assert events[0]["date_heure_prevue"].startswith("2026-07-15T09:00:00")


@pytest.mark.asyncio
async def test_eng_create_no_auto_events_without_date(client: AsyncClient, tmpl_fixtures):
    """Sans date_debut ni date_debut_prevue → aucun EVENT auto-créé même si des templates existent."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]

    await client.post(f"/api/teng/{teng_id}/templates",
                      json={"tevent_id": tmpl_fixtures["tv1_id"]}, headers=h)

    org_id, env_id = await _create_org_env(client, tmpl_fixtures)

    r = await client.post("/api/eng", json={
        "nom": "EngNoDate",
        "teng_id": teng_id,
        "cla_id": tmpl_fixtures["cla_id"],
        "org_ids": [org_id],
        "env_ids": [env_id],
        "values": [],
    }, headers=h)
    assert r.status_code == 201
    assert r.json()["events"] == []


@pytest.mark.asyncio
async def test_eng_create_no_templates_no_events(client: AsyncClient, tmpl_fixtures):
    """Un TENG sans templates → aucun EVENT auto-créé même avec date_debut."""
    h = tmpl_fixtures["headers"]
    teng_id = tmpl_fixtures["teng_id"]
    # Pas d'ajout de templates

    org_id, env_id = await _create_org_env(client, tmpl_fixtures)

    r = await client.post("/api/eng", json={
        "nom": "EngNoTmpl",
        "teng_id": teng_id,
        "cla_id": tmpl_fixtures["cla_id"],
        "org_ids": [org_id],
        "env_ids": [env_id],
        "date_debut": "2026-08-01T08:00:00",
        "values": [],
    }, headers=h)
    assert r.status_code == 201
    assert r.json()["events"] == []
