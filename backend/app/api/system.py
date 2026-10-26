import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Optional
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

class ClientLocationResponse(BaseModel):
    ip: str
    latitude: float
    longitude: float
    city: Optional[str] = "Desconocido"
    region: Optional[str] = ""
    country: Optional[str] = "Argentina"
    source: str = "geoip"

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

@router.get("/client-ip-location", response_model=ClientLocationResponse)
async def get_client_ip_location(request: Request):
    """
    Resuelve la ubicación geográfica aproximada según la IP pública del cliente o de la conexión.
    Utilizado por el módulo de Geocercas cuando se visualiza la flota completa.
    """
    # 1. Obtener IP del cliente desde cabeceras de proxy inverso
    client_ip = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for")
    if client_ip and "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else ""

    is_private = not client_ip or client_ip.startswith((
        "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "172.3", "192.168.", "127.", "::1", "fe80:"
    ))

    target_url = f"https://ipwho.is/{client_ip}" if (client_ip and not is_private) else "https://ipwho.is/"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(target_url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") is not False and data.get("latitude") and data.get("longitude"):
                    return {
                        "ip": data.get("ip", client_ip or "auto"),
                        "latitude": float(data.get("latitude")),
                        "longitude": float(data.get("longitude")),
                        "city": data.get("city", "Desconocido"),
                        "region": data.get("region", ""),
                        "country": data.get("country", "Argentina"),
                        "source": "ipwhois"
                    }
    except Exception:
        pass

    # Fallback predeterminado (Buenos Aires, Argentina)
    return {
        "ip": client_ip or "127.0.0.1",
        "latitude": -34.6037,
        "longitude": -58.3816,
        "city": "Buenos Aires",
        "region": "CABA",
        "country": "Argentina",
        "source": "fallback"
    }

