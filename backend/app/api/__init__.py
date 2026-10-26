from fastapi import APIRouter
from app.api import auth, ingest, devices, admin, live, alerts, maintenance

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(live.router, prefix="/live", tags=["live"])
api_router.include_router(alerts.router, prefix="", tags=["alerts"])
api_router.include_router(maintenance.router, prefix="", tags=["maintenance"])
