import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.config import settings
from app.services.traccar_sync import synchronizer

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar sincronizador de Traccar en segundo plano
    sync_task = asyncio.create_task(synchronizer.run_loop())
    yield
    # Detener sincronizador limpiamente
    synchronizer.stop()
    sync_task.cancel()
    try:
        await sync_task
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
