from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from app.core.config import settings

router = APIRouter()

class SystemVersionResponse(BaseModel):
    product: str
    version: str
    release_name: str
    release_stage: str
    build_date: str
    environment: str
    supported_protocols: List[str]

@router.get("/version", response_model=SystemVersionResponse)
def get_system_version():
    """
    Retorna la versión activa del producto según Semantic Versioning (SemVer 2.0.0),
    nombre clave de la release, entorno de ejecución y protocolos telemáticos compatibles.
    Endpoint público para trazabilidad y diagnóstico de clientes.
    """
    return {
        "product": "Tokioba Telematics Platform",
        "version": settings.VERSION,
        "release_name": settings.RELEASE_NAME,
        "release_stage": settings.RELEASE_STAGE,
        "build_date": settings.BUILD_DATE,
        "environment": settings.ENVIRONMENT,
        "supported_protocols": [
            "Teltonika FMC150 (Codec 8)",
            "Teltonika Codec 8 Extended",
            "Traccar Push Ingest API v2"
        ]
    }
