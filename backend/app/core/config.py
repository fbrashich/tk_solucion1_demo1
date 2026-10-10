import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Telemetry IoT API"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/telemetry"
    # Clave criptográfica robusta de 256 bits (reemplazable por variable de entorno SECRET_KEY)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "b3a8c1f9e2d4057698a7b6c5d4e3f2a10987654321fedcba0123456789abcdef")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120 # 2 horas (Estándar seguro para turnos operativos)

    # Para poder tomar variables de entorno del sistema automáticamente
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
