from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="MEAL_PLANNER_", extra="ignore")
    database_url: str = "postgresql+psycopg://meal_planner:meal_planner@localhost:5432/meal_planner"
    jwt_secret: SecretStr = SecretStr("development-only-change-me-at-least-32-chars")
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    invitation_days: int = 7
    cookie_secure: bool = False
    refresh_cookie_name: str = "meal_planner_refresh"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
