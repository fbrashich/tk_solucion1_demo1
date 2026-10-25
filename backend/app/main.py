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

async def run_periodic_reconciliation():
    """
    Rutina en segundo plano de reconciliación continua Traccar <-> PostgreSQL:
    1. Ejecuta intentos de inicio rápido hasta que Traccar y PostgreSQL estén operativos.
    2. Continúa ejecutándose periódicamente cada 15 segundos para sincronizar en tiempo
       real cualquier dispositivo dado de alta directamente en la interfaz de Traccar.
    """
    logger.info("[STARTUP] Programando reconciliación inicial Traccar <-> PostgreSQL...")
    # Margen inicial con reintentos para permitir inicialización de Traccar
    for attempt in range(1, 4):
        await asyncio.sleep(3.0)
        try:
            async with AsyncSessionLocal() as db:
                stats = await traccar_client.reconcile_devices(db)
                logger.info(f"[STARTUP] Reconciliación inicial completada exitosamente en intento {attempt}: {stats}")
                break
        except Exception as e:
            logger.warning(f"[STARTUP] Intento {attempt} de reconciliación falló ({e}). Reintentando...")

    # Bucle periódico permanente
    while True:
        try:
            await asyncio.sleep(15.0)
            async with AsyncSessionLocal() as db:
                await traccar_client.reconcile_devices(db)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[PERIODIC SYNC] Error en ciclo periódico de reconciliación Traccar: {e}")

from app.services.live_stream import live_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar reconciliación continua de dispositivos Traccar en segundo plano
    reconcile_task = asyncio.create_task(run_periodic_reconciliation())
    # Iniciar monitoreo del log en tiempo real de Traccar
    live_manager.start()
    yield
    # Limpieza ordenada en apagado
    live_manager.stop()
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
