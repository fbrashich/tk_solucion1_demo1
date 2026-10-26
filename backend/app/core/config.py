import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Telemetry IoT API"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/telemetry"
    # Clave criptográfica robusta de 256 bits (reemplazable por variable de entorno SECRET_KEY)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "b3a8c1f9e2d4057698a7b6c5d4e3f2a10987654321fedcba0123456789abcdef")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120 # 2 horas (Estándar seguro para turnos operativos)

    # Configuración de integración con Traccar API
    TRACCAR_API_URL: str = os.getenv("TRACCAR_API_URL", os.getenv("TRACCAR_URL", "http://traccar:8082")).rstrip("/")
    TRACCAR_USER: str = os.getenv("TRACCAR_USER", os.getenv("TRACCAR_EMAIL", "admin@tokioba.com"))
    TRACCAR_PASSWORD: str = os.getenv("TRACCAR_PASSWORD", "tokioba_admin_2026")

    # Versionado del Producto (Semantic Versioning 2.0.0)
    VERSION: str = "0.5.0-dev"
    RELEASE_NAME: str = "Geofencing & Alerts Dispatcher"
    RELEASE_STAGE: str = "development"
    BUILD_DATE: str = "2026-10-25T21:50:00Z"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Para poder tomar variables de entorno del sistema automáticamente
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
# Normalizar TRACCAR_API_URL para que siempre incluya /api
if not settings.TRACCAR_API_URL.endswith("/api"):
    settings.TRACCAR_API_URL = f"{settings.TRACCAR_API_URL}/api"
