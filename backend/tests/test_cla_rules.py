"""
Tests des règles métier sur les CLA.
RF-02 : suppression bloquée si OBJ rattachés
RF-03 : cycle d'héritage interdit
RF-04 : suppression d'une CLA rend les sous-classes racines
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import create_role, create_tuser, create_cla, create_user, get_token


@pytest.fixture
async def admin_token(db_session: AsyncSession) -> str:
    role = await create_role(db_session, "ADMIN")
    tuser = await create_tuser(db_session, "humain_cla")
    cla = await create_cla(db_session, "ClaSeed")
    user = await create_user(db_session, auth_uid="admin_cla", tuser_id=tuser.id, role_id=role.id, cla_id=cla.id)
    await db_session.commit()
    return await get_token(user)


@pytest.mark.asyncio
async def test_rf03_self_cycle(client: AsyncClient, admin_token: str):
    """RF-03 : une CLA ne peut pas être sa propre super-classe."""
    r = await client.post("/api/cla", json={"nom": "ClaA"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201
    cla_id = r.json()["id"]

    r2 = await client.put(
        f"/api/cla/{cla_id}",
        json={"super_classe_id": cla_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 400
    assert "RF-03" in r2.json()["detail"]


@pytest.mark.asyncio
async def test_rf03_indirect_cycle(client: AsyncClient, admin_token: str):
    """RF-03 : A→B→C ne peut pas pointer C→A (cycle indirect)."""
    r1 = await client.post("/api/cla", json={"nom": "ClaX"}, headers={"Authorization": f"Bearer {admin_token}"})
    r2 = await client.post("/api/cla", json={"nom": "ClaY", "super_classe_id": r1.json()["id"]}, headers={"Authorization": f"Bearer {admin_token}"})
    r3 = await client.post("/api/cla", json={"nom": "ClaZ", "super_classe_id": r2.json()["id"]}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 201

    # Tenter de faire pointer X (racine) vers Z (feuille) — crée un cycle
    r4 = await client.put(
        f"/api/cla/{r1.json()['id']}",
        json={"super_classe_id": r3.json()["id"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r4.status_code == 400
    assert "RF-03" in r4.json()["detail"]


@pytest.mark.asyncio
async def test_rf03_valid_hierarchy(client: AsyncClient, admin_token: str):
    """RF-03 : une hiérarchie valide est acceptée."""
    r1 = await client.post("/api/cla", json={"nom": "Parent"}, headers={"Authorization": f"Bearer {admin_token}"})
    r2 = await client.post(
        "/api/cla",
        json={"nom": "Enfant", "super_classe_id": r1.json()["id"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 201
    assert r2.json()["super_classe_id"] == r1.json()["id"]


@pytest.mark.asyncio
async def test_rf02_cannot_delete_cla_with_obj(client: AsyncClient, admin_token: str):
    """RF-02 : suppression bloquée si des OBJ sont rattachés."""
    # La CLA 'ClaSeed' créée dans la fixture est utilisée par l'OBJ du user admin_cla
    # Récupérer son id
    r = await client.get("/api/cla", headers={"Authorization": f"Bearer {admin_token}"})
    clas = r.json()
    seed = next(c for c in clas if c["nom"] == "ClaSeed")

    r2 = await client.delete(f"/api/cla/{seed['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 409
    assert "RF-02" in r2.json()["detail"]
