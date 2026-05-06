"""Router GRAPH — graphe de relations ORG ↔ ENG ↔ ENV."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload
from pydantic import BaseModel
from typing import Literal

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.activity import Org, Env, Eng, User, eng_org, eng_env

router = APIRouter()


class GraphNode(BaseModel):
    id: str
    type: Literal["org", "env", "eng"]
    nom: str
    entity_id: int
    degree: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


def _add_degree(nodes: dict[str, GraphNode], edges: list[GraphEdge]) -> None:
    for e in edges:
        if e.source in nodes:
            nodes[e.source].degree += 1
        if e.target in nodes:
            nodes[e.target].degree += 1


def _add_edge(edges: list[GraphEdge], src: str, tgt: str) -> None:
    if not any(x.source == src and x.target == tgt for x in edges):
        edges.append(GraphEdge(source=src, target=tgt))


@router.get("/org/{org_id}", response_model=GraphResponse)
async def graph_org(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Graphe de relations centré sur une ORG : ORG → ENG → (ORG | ENV)."""
    org_res = await db.execute(
        select(Org).options(joinedload(Org.obj)).where(Org.id == org_id)
    )
    org = org_res.unique().scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="ORG introuvable")

    eng_res = await db.execute(
        select(Eng)
        .join(eng_org, Eng.id == eng_org.c.eng_id)
        .where(eng_org.c.org_id == org_id)
        .options(
            joinedload(Eng.obj),
            selectinload(Eng.orgs).joinedload(Org.obj),
            selectinload(Eng.envs).joinedload(Env.obj),
        )
    )
    engs = eng_res.unique().scalars().all()

    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    nodes[f"org-{org.id}"] = GraphNode(id=f"org-{org.id}", type="org", nom=org.obj.nom, entity_id=org.id)

    for eng in engs:
        eid = f"eng-{eng.id}"
        if eid not in nodes:
            nodes[eid] = GraphNode(id=eid, type="eng", nom=eng.obj.nom, entity_id=eng.id)
        _add_edge(edges, f"org-{org.id}", eid)

        for o in eng.orgs:
            nid = f"org-{o.id}"
            if nid not in nodes:
                nodes[nid] = GraphNode(id=nid, type="org", nom=o.obj.nom, entity_id=o.id)
            if o.id != org.id:
                _add_edge(edges, nid, eid)

        for e in eng.envs:
            nid = f"env-{e.id}"
            if nid not in nodes:
                nodes[nid] = GraphNode(id=nid, type="env", nom=e.obj.nom, entity_id=e.id)
            _add_edge(edges, eid, nid)

    _add_degree(nodes, edges)
    return GraphResponse(nodes=list(nodes.values()), edges=edges)


@router.get("/env/{env_id}", response_model=GraphResponse)
async def graph_env(
    env_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Graphe de relations centré sur un ENV : ENV → ENG → (ORG | ENV)."""
    env_res = await db.execute(
        select(Env).options(joinedload(Env.obj)).where(Env.id == env_id)
    )
    env = env_res.unique().scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="ENV introuvable")

    eng_res = await db.execute(
        select(Eng)
        .join(eng_env, Eng.id == eng_env.c.eng_id)
        .where(eng_env.c.env_id == env_id)
        .options(
            joinedload(Eng.obj),
            selectinload(Eng.orgs).joinedload(Org.obj),
            selectinload(Eng.envs).joinedload(Env.obj),
        )
    )
    engs = eng_res.unique().scalars().all()

    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    nodes[f"env-{env.id}"] = GraphNode(id=f"env-{env.id}", type="env", nom=env.obj.nom, entity_id=env.id)

    for eng in engs:
        eid = f"eng-{eng.id}"
        if eid not in nodes:
            nodes[eid] = GraphNode(id=eid, type="eng", nom=eng.obj.nom, entity_id=eng.id)
        _add_edge(edges, f"env-{env.id}", eid)

        for o in eng.orgs:
            nid = f"org-{o.id}"
            if nid not in nodes:
                nodes[nid] = GraphNode(id=nid, type="org", nom=o.obj.nom, entity_id=o.id)
            _add_edge(edges, nid, eid)

        for e in eng.envs:
            nid = f"env-{e.id}"
            if nid not in nodes:
                nodes[nid] = GraphNode(id=nid, type="env", nom=e.obj.nom, entity_id=e.id)
            if e.id != env.id:
                _add_edge(edges, eid, nid)

    _add_degree(nodes, edges)
    return GraphResponse(nodes=list(nodes.values()), edges=edges)
