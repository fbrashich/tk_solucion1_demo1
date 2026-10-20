import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.config import settings
from app.db import AsyncSessionLocal
from app.services.traccar_client import traccar_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main")

async def run_startup_reconciliation():
    """
    Rutina no bloqueante de reconciliación en arranque:
    Espera brevemente a que los contenedores Traccar y PostgreSQL estén operativos,
    y asegura que todos los equipos existentes en Traccar (ej. ATC700) queden reflejados
    y vinculados por uniqueId (IMEI) en PostgreSQL y viceversa.
    """
    logger.info("[STARTUP] Programando reconciliación inicial Traccar <-> PostgreSQL...")
    # Margen breve para permitir que la API de Traccar complete su inicialización en Docker
    for attempt in range(1, 4):
        await asyncio.sleep(3.0)
        try:
            async with AsyncSessionLocal() as db:
                stats = await traccar_client.reconcile_devices(db)
                logger.info(f"[STARTUP] Reconciliación completada exitosamente en intento {attempt}: {stats}")
                break
        except Exception as e:
            logger.warning(f"[STARTUP] Intento {attempt} de reconciliación falló ({e}). Reintentando...")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar reconciliación de dispositivos Traccar en segundo plano sin bloquear el arranque de FastAPI
    reconcile_task = asyncio.create_task(run_startup_reconciliation())
    yield
    # Limpieza en apagado
    if not reconcile_task.done():
        reconcile_task.cancel()
        try:
            await reconcile_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# CORS: Permitir origen local y túneles seguros de zrok.io, bloqueando orígenes no autorizados
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|.*\.zrok\.io)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def root():
    return {"message": "Welcome to Telemetry IoT API"}
