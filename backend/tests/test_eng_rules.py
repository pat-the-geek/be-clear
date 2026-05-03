"""
Tests des règles métier RF-12 sur les ENG.
RF-12 : un ENG doit être lié à au moins 1 ORG et 1 ENV.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_torg, create_tenv,
    create_user, get_token,
)
from app.models.activity import Teng
from app.models.object import Cla


@pytest.fixture
async def eng_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_eng")
    cla = await create_cla(db_session, "ClaEng")

    # TENG
    teng = Teng(nom="TypeEng", cla_id=cla.id)
    db_session.add(teng)
    await db_session.flush()

    user = await create_user(
        db_session,
        auth_uid="editeur_eng",
        tuser_id=tuser.id,
        role_id=role.id,
        cla_id=cla.id,
    )
    await db_session.commit()
    token = await get_token(user)
    return {"token": token, "teng_id": teng.id, "cla_id": cla.id}


@pytest.mark.asyncio
async def test_eng_requires_at_least_one_org(client: AsyncClient, eng_fixtures):
    """POST /api/eng sans org_ids → 400 (RF-12)."""
    payload = {
        "nom": "Eng sans ORG",
        "teng_id": eng_fixtures["teng_id"],
        "cla_id": eng_fixtures["cla_id"],
        "org_ids": [],
        "env_ids": [999],
        "values": [],
    }
    response = await client.post(
        "/api/eng",
        json=payload,
        headers={"Authorization": f"Bearer {eng_fixtures['token']}"},
    )
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_eng_requires_at_least_one_env(client: AsyncClient, eng_fixtures):
    """POST /api/eng sans env_ids → 400 (RF-12)."""
    payload = {
        "nom": "Eng sans ENV",
        "teng_id": eng_fixtures["teng_id"],
        "cla_id": eng_fixtures["cla_id"],
        "org_ids": [999],
        "env_ids": [],
        "values": [],
    }
    response = await client.post(
        "/api/eng",
        json=payload,
        headers={"Authorization": f"Bearer {eng_fixtures['token']}"},
    )
    assert response.status_code in (400, 422)
