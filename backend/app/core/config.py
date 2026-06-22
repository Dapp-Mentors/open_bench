from pydantic_settings import BaseSettings
from typing import List, Optional
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text


class Settings(BaseSettings):
    DATABASE_URL: str

    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    # Model used for task instruction embeddings (similarity check)
    OLLAMA_EMBED_MODEL: str = "nomic-embed-text:latest"

    # ── OpenRouter (sole LLM provider) ───────────────────────────────────────
    # API key is read from the AppSettings table (set via setup wizard).
    # There is no .env fallback — the key must be configured through the UI.
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # Where uploaded task ZIPs land (mounted shared volume)
    UPLOADS_DIR: str = "/uploads"

    # ── Sia Storage ────────────────────────────────────────────────────────────
    # All Sia config is read from the AppSettings table (set via setup wizard).
    SIA_MODE: str = "auto"                      # "auto" or "demo"
    SIA_KEY_PATH: str = "/app/data/appkey.hex"
    SIA_PHRASE_PATH: str = "/app/data/phrase.enc"

    # Cached DB values so we avoid hitting the DB on every call
    _db_openrouter_key: Optional[str] = None
    _db_sia_indexer_url: Optional[str] = None
    _db_sia_app_id: Optional[str] = None
    _db_sia_app_name: Optional[str] = None
    _db_sia_app_description: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

    # ── Derived helpers ───────────────────────────────────────────────────────

    def llm_base_url(self, provider: str | None = None) -> str:
        """Return the OpenRouter base URL (sole provider)."""
        return self.OPENROUTER_BASE_URL

    def llm_api_key(self, provider: str | None = None) -> str:
        """Return the OpenRouter API key from the DB (set via setup wizard)."""
        if self._db_openrouter_key:
            return self._db_openrouter_key
        return ""

    def sia_indexer_url(self) -> str:
        """Return the Sia indexer URL from the DB (set via setup wizard)."""
        return self._db_sia_indexer_url or "https://sia.storage"

    def sia_app_id(self) -> str:
        """Return the Sia app ID from the DB (set via setup wizard)."""
        return self._db_sia_app_id or ""

    def sia_app_name(self) -> str:
        """Return the Sia app name from the DB (set via setup wizard)."""
        return self._db_sia_app_name or "OpenBench"

    def sia_app_description(self) -> str:
        """Return the Sia app description from the DB (set via setup wizard)."""
        return self._db_sia_app_description or ""

    async def load_db_settings(self) -> None:
        """Read all settings from the AppSettings table and cache them.

        Call this once at startup so all subsequent calls use cached values.
        """
        engine = create_async_engine(self.DATABASE_URL)
        try:
            async with engine.connect() as conn:
                row = (
                    await conn.execute(
                        text(
                            "SELECT \"openrouterKey\", \"siaIndexerUrl\", "
                            "\"siaAppId\", \"siaAppName\", \"siaAppDescription\" "
                            "FROM \"AppSettings\" WHERE id = 'default'"
                        )
                    )
                ).fetchone()
                if row:
                    if row[0]:
                        self._db_openrouter_key = row[0]
                        print(f"[Config] Loaded OpenRouter key from DB (prefix: {row[0][:8]}...)")
                    if row[1]:
                        self._db_sia_indexer_url = row[1]
                    if row[2]:
                        self._db_sia_app_id = row[2]
                    if row[3]:
                        self._db_sia_app_name = row[3]
                    if row[4]:
                        self._db_sia_app_description = row[4]
                else:
                    print("[Config] No AppSettings row found in DB")
        except Exception as exc:
            print(f"[Config] Failed to load settings from DB: {exc}")
        finally:
            await engine.dispose()


settings = Settings()