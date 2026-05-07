"""
Tests RF-11 — historique des changements de TORG (ORG) et TENV (ENV).

RF-11 : chaque changement de type d'une entité est tracé dans la table
d'historique correspondante (org_torg_history / env_tenv_history).
"""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from tests.helpers import (
    create_role, create_tuser, create_cla, create_torg, create_tenv,
    create_user, get_token,
)
from app.models.activity import OrgTorgHistory, EnvTenvHistory


# ─── Fixtures communes ────────────────────────────────────────

@pytest.fixture
async def rf11_setup(db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_rf11")
    cla = await create_cla(db_session, "ClaRf11")
    torg1 = await create_torg(db_session, "TorgRf11_A", cla.id)
    torg2 = await create_torg(db_session, "TorgRf11_B", cla.id)
    tenv1 = await create_tenv(db_session, "TenvRf11_A", cla.id)
    tenv2 = await create_tenv(db_session, "TenvRf11_B", cla.id)
    user = await create_user(db_session, auth_uid="editeur_rf11",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    token = await get_token(user)
    return {
        "token": token,
        "cla_id": cla.id,
        "torg1_id": torg1.id,
        "torg2_id": torg2.id,
        "tenv1_id": tenv1.id,
        "tenv2_id": tenv2.id,
    }


# ─── Tests ORG ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rf11_org_create_inserts_history(
    client: AsyncClient, db_session: AsyncSession, rf11_setup
):
    """La création d'une ORG insère une entrée initiale dans org_torg_history."""
    payload = {
        "nom": "OrgHistTest",
        "torg_id": rf11_setup["torg1_id"],
        "cla_id": rf11_setup["cla_id"],
        "values": [],
    }
    r = await client.post("/api/org", json=payload,
                          headers={"Authorization": f"Bearer {rf11_setup['token']}"})
    assert r.status_code == 201
    org_id = r.json()["id"]

    rows = (await db_session.execute(
        select(OrgTorgHistory).where(OrgTorgHistory.org_id == org_id)
    )).scalars().all()

    assert len(rows) == 1
    assert rows[0].torg_id == rf11_setup["torg1_id"]
    assert rows[0].date_fin is None


@pytest.mark.asyncio
async def test_rf11_org_torg_change_closes_and_creates(
    client: AsyncClient, db_session: AsyncSession, rf11_setup
):
    """Changer le TORG d'une ORG ferme l'entrée courante et en crée une nouvelle."""
    payload = {
        "nom": "OrgHistChange",
        "torg_id": rf11_setup["torg1_id"],
        "cla_id": rf11_setup["cla_id"],
        "values": [],
    }
    r = await client.post("/api/org", json=payload,
                          headers={"Authorization": f"Bearer {rf11_setup['token']}"})
    assert r.status_code == 201
    org_id = r.json()["id"]

    r2 = await client.put(
        f"/api/org/{org_id}",
        json={"torg_id": rf11_setup["torg2_id"]},
        headers={"Authorization": f"Bearer {rf11_setup['token']}"},
    )
    assert r2.status_code == 200

    # Refresh session pour lire les nouvelles lignes
    await db_session.rollback()
    rows = (await db_session.execute(
        select(OrgTorgHistory)
        .where(OrgTorgHistory.org_id == org_id)
        .order_by(OrgTorgHistory.id)
    )).scalars().all()

    assert len(rows) == 2
    assert rows[0].torg_id == rf11_setup["torg1_id"]
    assert rows[0].date_fin is not None
    assert rows[1].torg_id == rf11_setup["torg2_id"]
    assert rows[1].date_fin is None


@pytest.mark.asyncio
async def test_rf11_org_no_torg_change_no_new_history(
    client: AsyncClient, db_session: AsyncSession, rf11_setup
):
    """Modifier le nom d'une ORG sans changer le TORG ne crée pas de nouvelle entrée."""
    payload = {
        "nom": "OrgHistNoChange",
        "torg_id": rf11_setup["torg1_id"],
        "cla_id": rf11_setup["cla_id"],
        "values": [],
    }
    r = await client.post("/api/org", json=payload,
                          headers={"Authorization": f"Bearer {rf11_setup['token']}"})
    assert r.status_code == 201
    org_id = r.json()["id"]

    await client.put(
        f"/api/org/{org_id}",
        json={"nom": "OrgHistNoChange — renommée"},
        headers={"Authorization": f"Bearer {rf11_setup['token']}"},
    )

    await db_session.rollback()
    rows = (await db_session.execute(
        select(OrgTorgHistory).where(OrgTorgHistory.org_id == org_id)
    )).scalars().all()

    assert len(rows) == 1
    assert rows[0].date_fin is None


# ─── Tests ENV ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rf11_env_create_inserts_history(
    client: AsyncClient, db_session: AsyncSession, rf11_setup
):
    """La création d'un ENV insère une entrée initiale dans env_tenv_history."""
    payload = {
        "nom": "EnvHistTest",
        "tenv_id": rf11_setup["tenv1_id"],
        "cla_id": rf11_setup["cla_id"],
        "values": [],
    }
    r = await client.post("/api/env", json=payload,
                          headers={"Authorization": f"Bearer {rf11_setup['token']}"})
    assert r.status_code == 201
    env_id = r.json()["id"]

    rows = (await db_session.execute(
        select(EnvTenvHistory).where(EnvTenvHistory.env_id == env_id)
    )).scalars().all()

    assert len(rows) == 1
    assert rows[0].tenv_id == rf11_setup["tenv1_id"]
    assert rows[0].date_fin is None


@pytest.mark.asyncio
async def test_rf11_env_tenv_change_closes_and_creates(
    client: AsyncClient, db_session: AsyncSession, rf11_setup
):
    """Changer le TENV d'un ENV ferme l'entrée courante et en crée une nouvelle."""
    payload = {
        "nom": "EnvHistChange",
        "tenv_id": rf11_setup["tenv1_id"],
        "cla_id": rf11_setup["cla_id"],
        "values": [],
    }
    r = await client.post("/api/env", json=payload,
                          headers={"Authorization": f"Bearer {rf11_setup['token']}"})
    assert r.status_code == 201
    env_id = r.json()["id"]

    r2 = await client.put(
        f"/api/env/{env_id}",
        json={"tenv_id": rf11_setup["tenv2_id"]},
        headers={"Authorization": f"Bearer {rf11_setup['token']}"},
    )
    assert r2.status_code == 200

    await db_session.rollback()
    rows = (await db_session.execute(
        select(EnvTenvHistory)
        .where(EnvTenvHistory.env_id == env_id)
        .order_by(EnvTenvHistory.id)
    )).scalars().all()

    assert len(rows) == 2
    assert rows[0].tenv_id == rf11_setup["tenv1_id"]
    assert rows[0].date_fin is not None
    assert rows[1].tenv_id == rf11_setup["tenv2_id"]
    assert rows[1].date_fin is None
