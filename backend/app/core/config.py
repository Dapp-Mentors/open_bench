from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database — no default, will raise at startup if not set
    DATABASE_URL: str

    # CORS — frontend origin
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Ollama / local model runner
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"

    # Generic OpenAI-compatible endpoint (optional)
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()