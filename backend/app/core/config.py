from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str

    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    # Model used for task instruction embeddings (similarity check)
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text:latest"

    # ── OpenAI ────────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # ── DeepSeek (direct API) ─────────────────────────────────────────────────
    # Get your key at https://platform.deepseek.com/
    # Models: deepseek-chat (V3), deepseek-reasoner (R1)
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"

    # ── OpenRouter ────────────────────────────────────────────────────────────
    # Get your key at https://openrouter.ai/keys
    # Allows access to DeepSeek, Llama, Mistral, Gemini, etc. via one API key.
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # ── Default provider / model ──────────────────────────────────────────────
    # Used for quality checks, agent quality, and the easiness prefilter.
    # Override with DEFAULT_PROVIDER=openrouter / DEFAULT_MODEL_ID=<slug>
    DEFAULT_PROVIDER: str = "deepseek"
    DEFAULT_MODEL_ID: str = "deepseek-v4-flash"

    # ── Difficulty probe model ────────────────────────────────────────────────
    # The difficulty probe uses a stronger frontier model than the easiness
    # prefilter. Override DIFFICULTY_MODEL_ID in .env to swap models without
    # touching code. Provider is shared with DEFAULT_PROVIDER.
    DIFFICULTY_MODEL_ID: str = "deepseek-v4-pro"

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
        """Return the base URL for the given provider (or the default)."""
        p = (provider or self.DEFAULT_PROVIDER).lower()
        if p == "deepseek":
            return self.DEEPSEEK_BASE_URL
        if p == "openrouter":
            return self.OPENROUTER_BASE_URL
        return self.OPENAI_BASE_URL

    def llm_api_key(self, provider: str | None = None) -> str:
        """Return the API key for the given provider (or the default)."""
        p = (provider or self.DEFAULT_PROVIDER).lower()
        if p == "deepseek":
            return self.DEEPSEEK_API_KEY
        if p == "openrouter":
            return self.OPENROUTER_API_KEY
        return self.OPENAI_API_KEY


settings = Settings()