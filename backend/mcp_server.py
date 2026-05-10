#!/usr/bin/env python3
"""
Point d'entrée du serveur MCP be.CLEAR.

Modes de transport (variable MCP_TRANSPORT) :
  stdio  — pour Claude Desktop (défaut)
  sse    — pour le service Docker (HTTP/SSE sur MCP_HOST:MCP_PORT)

Variables d'environnement requises :
  DATABASE_URL         — connexion PostgreSQL (ex: postgresql+asyncpg://...)
  BECLEAR_API_TOKEN    — token API be.CLEAR (créé dans l'interface admin)
  BECLEAR_API_URL      — URL du backend be.CLEAR (défaut: http://localhost:8000)

Variables optionnelles (mode SSE uniquement) :
  MCP_HOST             — interface d'écoute (défaut: 0.0.0.0)
  MCP_PORT             — port d'écoute (défaut: 8001)

Exemple Claude Desktop (~/.config/claude/claude_desktop_config.json) :
  {
    "mcpServers": {
      "beclear": {
        "command": "python",
        "args": ["/chemin/vers/backend/mcp_server.py"],
        "env": {
          "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/beclear",
          "BECLEAR_API_TOKEN": "votre-token-api",
          "BECLEAR_API_URL": "http://localhost:8000"
        }
      }
    }
  }
"""
import os
import sys

# S'assurer que le répertoire backend/ est dans sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.mcp.server import mcp  # noqa: E402 — import après ajout au path

if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "stdio")

    if transport == "sse":
        import uvicorn
        host = os.environ.get("MCP_HOST", "0.0.0.0")
        port = int(os.environ.get("MCP_PORT", "8001"))
        app = mcp.sse_app()
        uvicorn.run(app, host=host, port=port)
    else:
        mcp.run(transport="stdio")
