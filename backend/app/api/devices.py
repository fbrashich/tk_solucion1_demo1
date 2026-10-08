from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from typing import List
from datetime import datetime, timezone, timedelta

from app.db import get_db
from app.models.models import TelemetryEvent, DeviceState, User
from app.schemas.schemas import DeviceStatusResponse, TelemetryEventResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.get("/{device_id}/status", response_model=DeviceStatusResponse)
async def get_device_status(device_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Estado del device
    result_state = await db.execute(select(DeviceState).where(DeviceState.device_id == device_id))
    device_state = result_state.scalars().first()

    if not device_state:
        raise HTTPException(status_code=404, detail="Device not found")

    # Última ubicación conocida (último evento de este device_id)
    result_event = await db.execute(
        select(TelemetryEvent)
        .where(TelemetryEvent.device_id == device_id)
        .order_by(desc(TelemetryEvent.timestamp))
        .limit(1)
    )
    last_event = result_event.scalars().first()

    # Determinar status conectado/desconectado. Asumimos desconectado si pasaron más de 5 minutos sin reportar.
    now = datetime.now(timezone.utc)
    status_str = "desconectado"
    if device_state.last_updated and (now - device_state.last_updated) < timedelta(minutes=5):
        status_str = "conectado"

    return DeviceStatusResponse(
        device_id=device_state.device_id,
        status=status_str,
        last_lat=last_event.latitude if last_event else None,
        last_lon=last_event.longitude if last_event else None,
        engine_hours=round(device_state.engine_hours, 2),
        last_updated=device_state.last_updated
    )

@router.get("/{device_id}/logs", response_model=List[TelemetryEventResponse])
async def get_device_logs(device_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(TelemetryEvent)
        .where(TelemetryEvent.device_id == device_id)
        .order_by(desc(TelemetryEvent.timestamp))
        .limit(50)
    )
    events = result.scalars().all()
    return events
