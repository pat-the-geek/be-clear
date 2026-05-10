from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyUrl
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Base de données
    DATABASE_URL: str

    # Meilisearch
    MEILISEARCH_URL: str = "http://localhost:7700"
    MEILISEARCH_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Ollama
    OLLAMA_URL: str = "http://100.72.122.51:11434"
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text"
    OLLAMA_EMBED_DIM: int = 768
    OLLAMA_LLM_MODEL: str = "qwen2.5:7b"

    # Sécurité
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8h

    # Fichiers
    MEDIA_PATH: str = "/media"
    OBSIDIAN_VAULT_PATH: str = "/vault"

    # URL publique du serveur (utilisée dans les rapports pour les liens d'images)
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Environnement
    ENV: str = "production"

    @property
    def is_dev(self) -> bool:
        return self.ENV == "development"


settings = Settings()
