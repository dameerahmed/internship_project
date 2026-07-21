import logging
from pathlib import Path
from typing import Optional
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    RABBITMQ_URL: str
    REDIS_URL: str
    DATABASE_URL: str
    SECRET_KEY: str

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False

    SYSTEM_PUBLIC_KEY: Optional[str] = None
    SYSTEM_PRIVATE_KEY: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


def load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        logging.error("Configuration validation failed! Check your .env types.")
        logging.error(e.errors())
        raise SystemExit(1)
    except Exception as e:
        logging.error(f"Failed to load settings: {e}")
        raise SystemExit(1)


# Global settings object to import across your app
settings = load_settings()
