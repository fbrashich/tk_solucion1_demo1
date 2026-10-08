from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Telemetry IoT API"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/telemetry"
    SECRET_KEY: str = "your-super-secret-key-for-jwt-signing"  # En prod usar .env
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 días

    # Para poder tomar variables de entorno del sistema automáticamente
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
