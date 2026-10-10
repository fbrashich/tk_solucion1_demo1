from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from datetime import datetime, timezone

from app.db import get_db
from app.models.models import TelemetryEvent, DeviceState, Device
from app.schemas.schemas import IngestPayload

router = APIRouter()

def ensure_utc(dt: datetime) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

@router.post("")
async def ingest_data(payload: IngestPayload, db: AsyncSession = Depends(get_db)):
    # 1. Determinar timestamp físico del evento actual (UTC estricto)
    event_timestamp = ensure_utc(payload.timestamp) if payload.timestamp else datetime.now(timezone.utc)

    # 2. Consultar el evento previo de este dispositivo para calcular delta físico
    prev_result = await db.execute(
        select(TelemetryEvent)
        .where(TelemetryEvent.device_id == payload.device_id)
        .order_by(desc(TelemetryEvent.timestamp))
        .limit(1)
    )
    prev_event = prev_result.scalars().first()

    # 3. Cálculo de horómetro robusto: delta físico (event.timestamp - prev_event.timestamp)
    delta_hours = 0.0
    if prev_event:
        prev_timestamp = ensure_utc(prev_event.timestamp)
        delta_seconds = (event_timestamp - prev_timestamp).total_seconds()
        
        # Se acumula tiempo de operación si el intervalo avanzó y la ignición previa estaba activa
        if delta_seconds > 0 and prev_event.ignition_state:
            # Límite de seguridad: máximo 24 hs de delta continuo en un solo reporte
            if delta_seconds <= 86400:
                delta_hours = delta_seconds / 3600.0

    # 4. Registrar nuevo evento de telemetría con su marca temporal física
    new_event = TelemetryEvent(
        device_id=payload.device_id,
        latitude=payload.lat,
        longitude=payload.lon,
        ignition_state=payload.ignition,
        timestamp=event_timestamp
    )
    db.add(new_event)

    # 4b. No crear dispositivos huérfanos sin dueño en la ingesta pública
    # Los dispositivos deben ser dados de alta formalmente por el operador cliente correspondiente.
    # Si el equipo no está en el catálogo, se guardan sus eventos de telemetría y estado técnico
    # para que cuando el operador lo dé de alta (por Device ID o Traccar Unique ID) herede sus datos.

    # 5. Actualizar estado consolidado del dispositivo
    state_result = await db.execute(
        select(DeviceState).where(DeviceState.device_id == payload.device_id)
    )
    device_state = state_result.scalars().first()

    if not device_state:
        # Primer reporte del dispositivo
        device_state = DeviceState(
            device_id=payload.device_id,
            engine_hours=delta_hours,
            last_ignition_state=payload.ignition,
            last_ignition_on_time=event_timestamp if payload.ignition else None,
            last_updated=event_timestamp
        )
        db.add(device_state)
    else:
        # Acumular delta calculado exclusivamente por marcas temporales físicas
        device_state.engine_hours += delta_hours
        device_state.last_ignition_state = payload.ignition
        if payload.ignition:
            device_state.last_ignition_on_time = event_timestamp
        else:
            device_state.last_ignition_on_time = None
        device_state.last_updated = event_timestamp

    await db.commit()
    return {
        "status": "ok",
        "accumulated_delta_hours": delta_hours,
        "total_engine_hours": round(device_state.engine_hours, 4)
    }
