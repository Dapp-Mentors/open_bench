from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str

    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    # Model used for task instruction embeddings (similarity check)
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text:latest"

    # ── OpenRouter (sole LLM provider) ───────────────────────────────────────
    # Get your key at https://openrouter.ai/keys
    # All LLM calls go through OpenRouter — supports DeepSeek, Claude, GPT,
    # Gemini, Llama, Mistral, and hundreds more via a single API key.
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Where uploaded task ZIPs land (mounted shared volume)
    UPLOADS_DIR: str = "/uploads"

    # ── Sia Storage ────────────────────────────────────────────────────────────
    SIA_MODE: str = "auto"                      # "auto" or "demo"
    SIA_INDEXER_URL: str = "https://sia.storage"
    SIA_APP_ID: str = ""
    SIA_APP_NAME: str = "OpenBench"
    SIA_APP_SERVICE_URL: str = "http://localhost:8000"
    SIA_KEY_PATH: str = "/app/data/appkey.hex"
    SIA_PHRASE_PATH: str = "/app/data/phrase.enc"

    class Config:
        env_file = ".env"
        extra = "ignore"

    # ── Derived helpers ───────────────────────────────────────────────────────

    def llm_base_url(self, provider: str | None = None) -> str:
        """Return the OpenRouter base URL (sole provider)."""
        return self.OPENROUTER_BASE_URL

    def llm_api_key(self, provider: str | None = None) -> str:
        """Return the OpenRouter API key (sole provider)."""
        return self.OPENROUTER_API_KEY


settings = Settings()
