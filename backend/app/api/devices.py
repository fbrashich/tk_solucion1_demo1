import csv
import io
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from app.db import get_db
from app.models.models import TelemetryEvent, DeviceState, Device, User
from app.schemas.schemas import (
    DeviceStatusResponse, 
    TelemetryEventResponse,
    DeviceResponse,
    DeviceCreate,
    DeviceUpdate,
    FleetSummaryResponse
)
from app.api.deps import get_current_user, get_current_admin

router = APIRouter()

def ensure_utc(dt: datetime) -> datetime:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def calculate_status(last_event: Optional[TelemetryEvent], last_updated: Optional[datetime], now: datetime):
    if not last_event:
        return "SIN COMUNICACIÓN", False, ensure_utc(last_updated)
    
    last_dt = ensure_utc(last_event.timestamp)
    diff_seconds = (now - last_dt).total_seconds()
    if diff_seconds < 0:
        diff_seconds = 0.0
    diff_minutes = diff_seconds / 60.0

    ignition_val = bool(last_event.ignition_state)

    if diff_minutes > 10.0:
        status_str = "SIN COMUNICACIÓN"
    elif ignition_val and diff_minutes <= 5.0:
        status_str = "OPERANDO"
    else:
        status_str = "DETENIDA"

    return status_str, ignition_val, last_dt

# ==========================================
# 1. CRUD DE DISPOSITIVOS
# ==========================================

@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Device)
    if not include_inactive:
        query = query.where(Device.is_active == True)
    query = query.order_by(Device.device_id)
    
    result = await db.execute(query)
    devices = result.scalars().all()
    return devices

@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    payload: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_id = payload.device_id.strip().upper()
    existing = await db.execute(select(Device).where(Device.device_id == clean_id))
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El identificador de dispositivo '{clean_id}' ya existe."
        )

    device = Device(
        device_id=clean_id,
        name=payload.name.strip(),
        type=payload.type.strip() if payload.type else "Mesa Vibratoria",
        description=payload.description,
        is_active=payload.is_active
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device

@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    if payload.name is not None:
        device.name = payload.name.strip()
    if payload.type is not None:
        device.type = payload.type.strip()
    if payload.description is not None:
        device.description = payload.description
    if payload.is_active is not None:
        device.is_active = payload.is_active

    await db.commit()
    await db.refresh(device)
    return device

@router.delete("/{device_id}")
async def delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    # Eliminación o desactivación
    await db.delete(device)
    await db.commit()
    return {"status": "ok", "message": f"Dispositivo '{device_id}' eliminado correctamente"}

# ==========================================
# 2. ESTADO GLOBAL / MULTI-DISPOSITIVO
# ==========================================

@router.get("/status/all", response_model=FleetSummaryResponse)
async def get_all_devices_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    
    # 1. Obtener todos los dispositivos registrados activos
    dev_res = await db.execute(select(Device).where(Device.is_active == True).order_by(Device.device_id))
    registered_devices = {d.device_id: d for d in dev_res.scalars().all()}

    # 2. Si no hay dispositivos registrados pero hay DeviceStates (retrocompatibilidad)
    if not registered_devices:
        states_res = await db.execute(select(DeviceState))
        for st in states_res.scalars().all():
            auto_dev = Device(
                device_id=st.device_id,
                name=f"Equipo {st.device_id}",
                type="Mesa Vibratoria",
                is_active=True
            )
            db.add(auto_dev)
            registered_devices[st.device_id] = auto_dev
        await db.commit()

    device_statuses: List[DeviceStatusResponse] = []
    total_hours = 0.0
    op_count = 0
    det_count = 0
    no_comm_count = 0

    for dev_id, dev_obj in registered_devices.items():
        # Consultar estado acumulado
        state_res = await db.execute(select(DeviceState).where(DeviceState.device_id == dev_id))
        dev_state = state_res.scalars().first()
        engine_hours = round(dev_state.engine_hours, 2) if dev_state else 0.0
        total_hours += engine_hours

        # Consultar último evento
        ev_res = await db.execute(
            select(TelemetryEvent)
            .where(TelemetryEvent.device_id == dev_id)
            .order_by(desc(TelemetryEvent.timestamp))
            .limit(1)
        )
        last_event = ev_res.scalars().first()

        status_str, ignition_val, last_dt = calculate_status(
            last_event, dev_state.last_updated if dev_state else None, now
        )

        if status_str == "OPERANDO":
            op_count += 1
        elif status_str == "DETENIDA":
            det_count += 1
        else:
            no_comm_count += 1

        device_statuses.append(DeviceStatusResponse(
            device_id=dev_id,
            name=dev_obj.name,
            type=dev_obj.type,
            status=status_str,
            ignition=ignition_val,
            last_lat=last_event.latitude if last_event else None,
            last_lon=last_event.longitude if last_event else None,
            engine_hours=engine_hours,
            last_updated=last_dt
        ))

    return FleetSummaryResponse(
        total_devices=len(registered_devices),
        operating_count=op_count,
        detained_count=det_count,
        no_comm_count=no_comm_count,
        total_engine_hours=round(total_hours, 2),
        devices=device_statuses
    )

# ==========================================
# 3. ESTADO INDIVIDUAL Y LOGS
# ==========================================

@router.get("/{device_id}/status", response_model=DeviceStatusResponse)
async def get_device_status(
    device_id: str, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    dev_res = await db.execute(select(Device).where(Device.device_id == device_id))
    device = dev_res.scalars().first()

    result_state = await db.execute(select(DeviceState).where(DeviceState.device_id == device_id))
    device_state = result_state.scalars().first()

    if not device_state and not device:
        raise HTTPException(status_code=404, detail=f"Dispositivo '{device_id}' no encontrado")

    result_event = await db.execute(
        select(TelemetryEvent)
        .where(TelemetryEvent.device_id == device_id)
        .order_by(desc(TelemetryEvent.timestamp))
        .limit(1)
    )
    last_event = result_event.scalars().first()

    now = datetime.now(timezone.utc)
    status_str, ignition_val, last_dt = calculate_status(
        last_event, 
        device_state.last_updated if device_state else None, 
        now
    )

    return DeviceStatusResponse(
        device_id=device_id,
        name=device.name if device else f"Equipo {device_id}",
        type=device.type if device else "Mesa Vibratoria",
        status=status_str,
        ignition=ignition_val,
        last_lat=last_event.latitude if last_event else None,
        last_lon=last_event.longitude if last_event else None,
        engine_hours=round(device_state.engine_hours, 2) if device_state else 0.0,
        last_updated=last_dt
    )

@router.get("/{device_id}/logs", response_model=List[TelemetryEventResponse])
async def get_device_logs(
    device_id: str, 
    limit: int = 50,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(TelemetryEvent)
    if device_id != "all":
        query = query.where(TelemetryEvent.device_id == device_id)
    query = query.order_by(desc(TelemetryEvent.timestamp)).limit(limit)

    result = await db.execute(query)
    events = result.scalars().all()
    return events

# ==========================================
# 4. EXPORT DE DATOS (CSV Y JSON)
# ==========================================

@router.get("/{device_id}/export")
async def export_device_telemetry(
    device_id: str,
    format: str = "csv",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(TelemetryEvent)
    if device_id != "all":
        query = query.where(TelemetryEvent.device_id == device_id)
    query = query.order_by(desc(TelemetryEvent.timestamp)).limit(5000)

    result = await db.execute(query)
    events = result.scalars().all()

    if format == "json":
        return [
            {
                "id": ev.id,
                "device_id": ev.device_id,
                "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
                "latitude": ev.latitude,
                "longitude": ev.longitude,
                "ignition_state": ev.ignition_state
            }
            for ev in events
        ]

    # Generación de CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID Evento",
        "Dispositivo",
        "Fecha Hora UTC",
        "Latitud",
        "Longitud",
        "Ignicion",
        "Estado Motor"
    ])

    for ev in events:
        utc_str = ev.timestamp.strftime("%Y-%m-%d %H:%M:%S") if ev.timestamp else ""
        ignition_str = "ON" if ev.ignition_state else "OFF"
        motor_str = "OPERANDO" if ev.ignition_state else "DETENIDA"
        writer.writerow([
            ev.id,
            ev.device_id,
            utc_str,
            f"{ev.latitude:.6f}",
            f"{ev.longitude:.6f}",
            ignition_str,
            motor_str
        ])

    output.seek(0)
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"telemetria_{device_id}_{now_str}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
