"""Serveur MCP be.CLEAR — instance FastMCP principale."""
from mcp.server.fastmcp import FastMCP

from app.mcp.resources import register_resources
from app.mcp.tools.read import register_read_tools
from app.mcp.tools.write import register_write_tools

mcp = FastMCP(
    name="be.CLEAR",
    instructions=(
        "Tu es connecté à be.CLEAR, un système de gestion des interactions "
        "entre organisations (ORG) et environnements (ENV) via des engagements (ENG) "
        "et des évènements (EVENT).\n\n"
        "Réponds toujours en français. "
        "Pour les opérations d'écriture (create_event, mark_event_done, update_value), "
        "présente le plan et demande confirmation avant d'agir."
    ),
)

register_read_tools(mcp)
register_write_tools(mcp)
register_resources(mcp)
