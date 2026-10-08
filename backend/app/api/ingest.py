from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timezone

from app.db import get_db
from app.models.models import TelemetryEvent, DeviceState
from app.schemas.schemas import IngestPayload

router = APIRouter()

@router.post("")
async def ingest_data(payload: IngestPayload, db: AsyncSession = Depends(get_db)):
    # 1. Registrar evento de telemetría
    new_event = TelemetryEvent(
        device_id=payload.device_id,
        latitude=payload.lat,
        longitude=payload.lon,
        ignition_state=payload.ignition,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(new_event)

    # 2. Actualizar estado del dispositivo
    result = await db.execute(select(DeviceState).where(DeviceState.device_id == payload.device_id))
    device_state = result.scalars().first()

    now = datetime.now(timezone.utc)

    if not device_state:
        # Primer reporte
        device_state = DeviceState(
            device_id=payload.device_id,
            engine_hours=0.0,
            last_ignition_state=payload.ignition,
            last_ignition_on_time=now if payload.ignition else None,
            last_updated=now
        )
        db.add(device_state)
    else:
        # Calcular horas si estaba encendido y sigue encendido, o si acaba de apagarse
        if device_state.last_ignition_state and device_state.last_ignition_on_time:
            time_diff = (now - device_state.last_ignition_on_time).total_seconds() / 3600.0
            device_state.engine_hours += time_diff

        # Actualizar variables de estado
        device_state.last_ignition_state = payload.ignition
        if payload.ignition:
            # Si sigue prendido o se prendió recién, actualizamos la hora base
            device_state.last_ignition_on_time = now
        else:
            # Se apagó
            device_state.last_ignition_on_time = None

        device_state.last_updated = now

    await db.commit()
    return {"status": "ok"}
