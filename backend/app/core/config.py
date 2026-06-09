from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str

    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"

    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # Where uploaded task ZIPs land (mounted shared volume)
    UPLOADS_DIR: str = "/uploads"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()