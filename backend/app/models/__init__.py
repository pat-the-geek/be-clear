"""
Registre centralisé des modèles SQLAlchemy.
Importer ce module garantit que tous les modèles sont connus d'Alembic.
"""
from app.models.object import Cla, Prop, Obj, Value, Img, Doc, Embedding
from app.models.activity import (
    Torg, Tenv, Teng, Tevent, Tuser, Role,
    Org, OrgTorgHistory,
    Env, EnvTenvHistory,
    Eng, Event, User,
    eng_org, eng_env,
)
from app.models.system import Config, LlmConfig, ApiToken, Log

__all__ = [
    # Partie Objet
    "Cla", "Prop", "Obj", "Value", "Img", "Doc", "Embedding",
    # Types
    "Torg", "Tenv", "Teng", "Tevent", "Tuser", "Role",
    # Entités
    "Org", "OrgTorgHistory",
    "Env", "EnvTenvHistory",
    "Eng", "Event", "User",
    "eng_org", "eng_env",
    # Système
    "Config", "LlmConfig", "ApiToken", "Log",
]
