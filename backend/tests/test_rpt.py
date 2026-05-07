"""
Tests du service RPT — génération de rapports Markdown pour ORG et ENV.
"""
import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import (
    create_role, create_tuser, create_cla, create_torg, create_tenv,
    create_teng, create_tevent, create_user, get_token,
)
from app.models.activity import Org, Env, Eng, Event
from app.models.object import Obj
from app.services.rpt_service import generate_org_report, generate_env_report


@pytest.fixture
async def rpt_fixtures(db_session: AsyncSession):
    role = await create_role(db_session, "EDITEUR")
    tuser = await create_tuser(db_session, "humain_rpt")
    cla = await create_cla(db_session, "ClaRpt")
    torg = await create_torg(db_session, "TorgRpt", cla.id)
    tenv = await create_tenv(db_session, "TenvRpt", cla.id)
    teng = await create_teng(db_session, "TengRpt", cla.id)
    tevent = await create_tevent(db_session, "TeventRpt", cla.id)
    user = await create_user(db_session, auth_uid="editeur_rpt",
                             tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)

    # ORG
    obj_org = Obj(nom="Acme RPT", uid=uuid.uuid4(), cla_id=cla.id,
                  description="Description de l'organisation.")
    db_session.add(obj_org)
    await db_session.flush()
    org = Org(obj_id=obj_org.id, torg_id=torg.id)
    db_session.add(org)
    await db_session.flush()

    # ENV
    obj_env = Obj(nom="Prod RPT", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_env)
    await db_session.flush()
    env = Env(obj_id=obj_env.id, tenv_id=tenv.id)
    db_session.add(env)
    await db_session.flush()

    # ENG lié à l'ORG et à l'ENV
    obj_eng = Obj(nom="Engagement RPT", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_eng)
    await db_session.flush()
    eng = Eng(obj_id=obj_eng.id, teng_id=teng.id,
              date_debut=datetime(2026, 1, 1, tzinfo=timezone.utc))
    eng.orgs = [org]
    eng.envs = [env]
    db_session.add(eng)
    await db_session.flush()

    # EVENT
    obj_ev = Obj(nom="Réunion RPT", uid=uuid.uuid4(), cla_id=cla.id)
    db_session.add(obj_ev)
    await db_session.flush()
    event = Event(
        obj_id=obj_ev.id,
        eng_id=eng.id,
        tevent_id=tevent.id,
        date_heure_prevue=datetime(2026, 1, 15, 9, 0, tzinfo=timezone.utc),
    )
    db_session.add(event)
    await db_session.flush()

    await db_session.commit()
    return {"org_id": org.id, "env_id": env.id}


# ─── Tests ORG ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rpt_org_returns_markdown(db_session: AsyncSession, rpt_fixtures):
    """generate_org_report retourne du Markdown non vide contenant le nom de l'ORG."""
    content = await generate_org_report(db_session, rpt_fixtures["org_id"])
    assert isinstance(content, str)
    assert len(content) > 0
    assert "Acme RPT" in content


@pytest.mark.asyncio
async def test_rpt_org_contains_eng(db_session: AsyncSession, rpt_fixtures):
    """Le rapport ORG mentionne l'ENG associé."""
    content = await generate_org_report(db_session, rpt_fixtures["org_id"])
    assert "Engagement RPT" in content


@pytest.mark.asyncio
async def test_rpt_org_contains_event(db_session: AsyncSession, rpt_fixtures):
    """Le rapport ORG mentionne l'EVENT de l'ENG."""
    content = await generate_org_report(db_session, rpt_fixtures["org_id"])
    assert "Réunion RPT" in content


@pytest.mark.asyncio
async def test_rpt_org_not_found_raises(db_session: AsyncSession):
    """generate_org_report lève ValueError si l'ORG n'existe pas."""
    with pytest.raises(ValueError, match="999999"):
        await generate_org_report(db_session, 999999)


# ─── Tests ENV ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rpt_env_returns_markdown(db_session: AsyncSession, rpt_fixtures):
    """generate_env_report retourne du Markdown non vide contenant le nom de l'ENV."""
    content = await generate_env_report(db_session, rpt_fixtures["env_id"])
    assert isinstance(content, str)
    assert len(content) > 0
    assert "Prod RPT" in content


@pytest.mark.asyncio
async def test_rpt_env_contains_eng(db_session: AsyncSession, rpt_fixtures):
    """Le rapport ENV mentionne l'ENG associé."""
    content = await generate_env_report(db_session, rpt_fixtures["env_id"])
    assert "Engagement RPT" in content


@pytest.mark.asyncio
async def test_rpt_env_not_found_raises(db_session: AsyncSession):
    """generate_env_report lève ValueError si l'ENV n'existe pas."""
    with pytest.raises(ValueError, match="999999"):
        await generate_env_report(db_session, 999999)
