import logging
from typing import Any, List, Tuple, Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, or_

from app.db import get_db
from app.models.models import TelemetryEvent, DeviceState, Device, User
from app.schemas.schemas import IngestPayload
from app.services.live_stream import live_manager

logger = logging.getLogger("ingest")
router = APIRouter()

def ensure_utc(dt: datetime) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def parse_iso_datetime(dt_val: Any) -> datetime:
    if isinstance(dt_val, datetime):
        return ensure_utc(dt_val)
    if not dt_val:
        return datetime.now(timezone.utc)
    try:
        clean_str = str(dt_val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        return ensure_utc(dt)
    except Exception:
        return datetime.now(timezone.utc)

def extract_traccar_items(payload: Any) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    """
    Normaliza el payload recibido desde Traccar hacia una lista de tuplas (position, device_info).
    Soporta formato unitario {"position": {...}, "device": {...}},
    formato por lote {"positions": [...], "devices": [...]},
    listas directas o posiciones simples.
    """
    items: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []

    if isinstance(payload, list):
        for elem in payload:
            items.extend(extract_traccar_items(elem))
    elif isinstance(payload, dict):
        if "positions" in payload and isinstance(payload["positions"], list):
            device_info = payload.get("device", {}) or {}
            devices_list = payload.get("devices", [])
            devices_map = {d.get("id"): d for d in devices_list if isinstance(d, dict) and "id" in d}
            for pos in payload["positions"]:
                dev = device_info or devices_map.get(pos.get("deviceId"), {})
                items.append((pos, dev))
        elif "position" in payload and isinstance(payload["position"], dict):
            items.append((payload["position"], payload.get("device", {}) or {}))
        elif "latitude" in payload or "fixTime" in payload or "deviceId" in payload:
            items.append((payload, payload.get("device", {}) or {}))

    return items

# ==============================================================================
# ENDPOINT DE INGESTA UNIFICADA TRACCAR -> FASTAPI
# ==============================================================================
@router.post("/traccar", status_code=status.HTTP_200_OK)
async def ingest_traccar(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Recepción en tiempo real de telemetría reenviada por Traccar (PositionForwarderJson).
    Blindajes operativos implementados:
    1. Emparejamiento estricto por IMEI (uniqueId) y Auto-Discovery si el equipo no existía en PostgreSQL.
    2. Manejo de ráfagas de memoria GPS: Idempotencia por (device_id + fixTime) y cálculo seguro de horómetro
       (solo suma tiempo si fixTime > last_updated, sin deltas negativos ni sobreescrituras desordenadas).
    3. Extracción completa de parámetros IO de Teltonika (ignición io239/io1, voltaje io66, batería io67, etc.)
       y persistencia total del JSON en raw_data / last_raw_data.
    4. Conversión de velocidad de nudos (knots) a km/h (speed * 1.852).
    """
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"[TRACCAR INGEST] Payload JSON inválido o corrupto: {e}")
        return {"status": "error", "detail": "JSON inválido"}

    items = extract_traccar_items(body)
    if not items:
        return {"status": "ok", "processed": 0, "message": "Sin posiciones para procesar"}

    processed_count = 0
    duplicate_count = 0
    created_devices_count = 0

    # Cache de operador por defecto para auto-discovery
    default_operator_id: Optional[int] = None

    for pos, dev in items:
        # A. Extracción de Identificador Único (IMEI / uniqueId)
        attrs = pos.get("attributes", {}) or {}
        unique_id = (
            dev.get("uniqueId") or 
            pos.get("uniqueId") or 
            attrs.get("uniqueId") or 
            attrs.get("imei") or 
            pos.get("deviceId")
        )

        if not unique_id:
            logger.warning(f"[TRACCAR INGEST] Se omitió posición sin identificador único: {pos}")
            continue

        clean_unique_id = str(unique_id).strip()

        # B. Emparejamiento en Base de Datos (Buscar por traccar_unique_id o device_id)
        dev_res = await db.execute(
            select(Device).where(
                or_(
                    Device.traccar_unique_id == clean_unique_id,
                    Device.device_id == clean_unique_id
                )
            )
        )
        local_device = dev_res.scalars().first()

        # Auto-Discovery: si fue aceptado por Traccar pero no está en PostgreSQL, crearlo formalmente
        if not local_device:
            if default_operator_id is None:
                user_res = await db.execute(
                    select(User.id).where(User.role == "operator", User.is_active == True).order_by(User.id)
                )
                default_operator_id = user_res.scalars().first()

            dev_name = dev.get("name") or f"Dispositivo {clean_unique_id}"
            dev_model = dev.get("model") or "Teltonika"
            dev_type = "ATC700" if "atc" in dev_name.lower() or "atc" in dev_model.lower() else "Teltonika GPS"

            local_device = Device(
                device_id=clean_unique_id,
                name=dev_name,
                type=dev_type,
                traccar_unique_id=clean_unique_id,
                traccar_model=dev_model,
                sim_phone=dev.get("phone"),
                category=dev.get("category") or "machinery",
                is_active=True,
                user_id=default_operator_id
            )
            db.add(local_device)
            await db.flush()
            created_devices_count += 1
            logger.info(f"[TRACCAR INGEST] Auto-Discovery: Creado dispositivo {dev_name} ({clean_unique_id}) en PostgreSQL.")

        # C. Timestamp Real del GPS (fixTime prioritario)
        fix_time = parse_iso_datetime(pos.get("fixTime") or pos.get("deviceTime") or pos.get("serverTime"))
        server_time_str = pos.get("serverTime")

        # D. Idempotencia y Blindaje de Duplicados
        dup_check = await db.execute(
            select(TelemetryEvent.id).where(
                TelemetryEvent.device_id == local_device.device_id,
                TelemetryEvent.timestamp == fix_time
            )
        )
        if dup_check.scalars().first():
            duplicate_count += 1
            continue

        # E. Coordenadas y Conversión de Velocidad (nudos a km/h)
        lat = float(pos.get("latitude", 0.0) or 0.0)
        lon = float(pos.get("longitude", 0.0) or 0.0)
        altitude = float(pos.get("altitude", 0.0) or 0.0)
        course = float(pos.get("course", 0.0) or 0.0)
        speed_raw = float(pos.get("speed", 0.0) or 0.0)
        # Conversión de knots a km/h: 1 nudo = 1.852 km/h
        speed_kmh = round(speed_raw * 1.852, 2)

        # F. Extracción de Parámetros Teltonika / IO Elements
        # 1. Ignición (contacto/motor)
        ignition = bool(
            attrs.get("ignition") is True or
            attrs.get("io239") == 1 or
            attrs.get("io1") == 1 or
            attrs.get("motion") is True
        )

        # 2. Movimiento
        motion = bool(attrs.get("motion") is True or attrs.get("io240") == 1)

        # 3. Voltaje de batería del vehículo (Power / ext_voltage / io66)
        power_val: Optional[float] = None
        if attrs.get("power") is not None:
            power_val = round(float(attrs["power"]), 2)
        elif attrs.get("ext_voltage") is not None:
            power_val = round(float(attrs["ext_voltage"]), 2)
        elif attrs.get("io66") is not None:
            raw_mv = float(attrs["io66"])
            power_val = round(raw_mv / 1000.0, 2) if raw_mv > 50 else round(raw_mv, 2)

        # 4. Batería interna de respaldo (batteryLevel / battery / io67)
        battery_val: Optional[float] = None
        if attrs.get("batteryLevel") is not None:
            battery_val = round(float(attrs["batteryLevel"]), 2)
        elif attrs.get("battery") is not None:
            battery_val = round(float(attrs["battery"]), 2)
        elif attrs.get("io67") is not None:
            raw_bat = float(attrs["io67"])
            battery_val = round(raw_bat / 1000.0, 2) if raw_bat > 50 else round(raw_bat, 2)

        # 5. Odómetro y Horómetro reportados
        total_dist = attrs.get("totalDistance") or attrs.get("distance") or attrs.get("io16")
        reported_hours = attrs.get("hours") or attrs.get("io243")

        # 6. Calidad de señal (satélites y rssi)
        sat = attrs.get("sat") or attrs.get("io21")
        rssi = attrs.get("rssi") or attrs.get("io22")

        # Construir payload enriquecido para raw_data conservando 100% de los datos
        enriched_raw = dict(pos)
        enriched_raw["speed_kmh"] = speed_kmh
        enriched_raw["device_uniqueId"] = clean_unique_id
        enriched_raw["device_name"] = local_device.name
        enriched_raw["normalized"] = {
            "ignition": ignition,
            "motion": motion,
            "power": power_val,
            "battery": battery_val,
            "totalDistance": total_dist,
            "hours": reported_hours,
            "sat": sat,
            "rssi": rssi,
            "serverTime": server_time_str
        }

        # G. Manejo de Ráfagas de Buffer y Protección de Horómetro
        state_res = await db.execute(
            select(DeviceState).where(DeviceState.device_id == local_device.device_id)
        )
        device_state = state_res.scalars().first()

        is_newer = False
        delta_hours = 0.0

        if not device_state or device_state.last_updated is None:
            is_newer = True
        else:
            last_updated_utc = ensure_utc(device_state.last_updated)
            if fix_time > last_updated_utc:
                is_newer = True
                delta_seconds = (fix_time - last_updated_utc).total_seconds()
                # Solo acumula horas de motor si el tiempo avanzó, la ignición está activa y el delta <= 24hs
                if delta_seconds > 0 and (ignition or device_state.last_ignition_state) and delta_seconds <= 86400:
                    delta_hours = delta_seconds / 3600.0
            else:
                # Paquete histórico/desordenado: no sumar al horómetro consolidado ni alterar última posición
                is_newer = False

        # Registrar evento de telemetría histórico o en tiempo real
        new_event = TelemetryEvent(
            device_id=local_device.device_id,
            latitude=lat,
            longitude=lon,
            ignition_state=ignition,
            speed=speed_kmh,
            altitude=altitude,
            course=course,
            timestamp=fix_time,
            raw_data=enriched_raw
        )
        db.add(new_event)

        # Actualizar DeviceState solo si el paquete es cronológicamente más reciente
        if not device_state:
            device_state = DeviceState(
                device_id=local_device.device_id,
                engine_hours=delta_hours,
                last_ignition_state=ignition,
                last_ignition_on_time=fix_time if ignition else None,
                last_updated=fix_time,
                last_latitude=lat,
                last_longitude=lon,
                last_speed=speed_kmh,
                last_raw_data=enriched_raw
            )
            db.add(device_state)
        elif is_newer:
            device_state.engine_hours += delta_hours
            device_state.last_ignition_state = ignition
            if ignition:
                if not device_state.last_ignition_on_time:
                    device_state.last_ignition_on_time = fix_time
            else:
                device_state.last_ignition_on_time = None
            device_state.last_updated = fix_time
            device_state.last_latitude = lat
            device_state.last_longitude = lon
            device_state.last_speed = speed_kmh
            device_state.last_raw_data = enriched_raw

        processed_count += 1

        # Emitir al Live Stream en tiempo real
        try:
            await live_manager.broadcast({
                "id": f"ingest_{local_device.device_id}_{int(fix_time.timestamp())}",
                "timestamp": fix_time.strftime("%Y-%m-%d %H:%M:%S"),
                "kind": "GPS_FIX",
                "channel": str(pos.get("protocol", "teltonika")).upper(),
                "socket_id": "FORWARDER",
                "imei": clean_unique_id,
                "message": f"Posición {local_device.name} ({clean_unique_id}): Lat={lat:.5f}, Lon={lon:.5f}, Vel={speed_kmh} km/h, Bat={battery_val or 'N/A'}",
                "details": {
                    "device_id": local_device.device_id,
                    "device_name": local_device.name,
                    "imei": clean_unique_id,
                    "latitude": lat,
                    "longitude": lon,
                    "speed_kmh": speed_kmh,
                    "ignition": ignition,
                    "motion": motion,
                    "power_voltage": power_val,
                    "battery_voltage": battery_val,
                    "satellites": sat,
                    "signal_rssi": rssi,
                    "total_distance_km": round(total_dist / 1000.0, 1) if total_dist else None,
                    "engine_hours": round(device_state.engine_hours, 2) if device_state else 0.0,
                    "protocol": pos.get("protocol", "teltonika")
                },
                "raw": enriched_raw
            })
        except Exception as e:
            logger.warning(f"[INGEST] Error emitiendo a live stream: {e}")

    await db.commit()
    return {
        "status": "ok",
        "processed": processed_count,
        "duplicates_skipped": duplicate_count,
        "auto_discovered": created_devices_count
    }


# ==============================================================================
# ENDPOINT DE INGESTA MANUAL / DIRECTA
# ==============================================================================
@router.post("")
async def ingest_data(payload: IngestPayload, db: AsyncSession = Depends(get_db)):
    event_timestamp = ensure_utc(payload.timestamp) if payload.timestamp else datetime.now(timezone.utc)

    prev_result = await db.execute(
        select(TelemetryEvent)
        .where(TelemetryEvent.device_id == payload.device_id)
        .order_by(desc(TelemetryEvent.timestamp))
        .limit(1)
    )
    prev_event = prev_result.scalars().first()

    delta_hours = 0.0
    if prev_event:
        prev_timestamp = ensure_utc(prev_event.timestamp)
        delta_seconds = (event_timestamp - prev_timestamp).total_seconds()
        if delta_seconds > 0 and prev_event.ignition_state and delta_seconds <= 86400:
            delta_hours = delta_seconds / 3600.0

    new_event = TelemetryEvent(
        device_id=payload.device_id,
        latitude=payload.lat,
        longitude=payload.lon,
        ignition_state=payload.ignition,
        timestamp=event_timestamp,
        speed=payload.speed,
        altitude=payload.altitude,
        course=payload.course,
        raw_data=payload.raw_data
    )
    db.add(new_event)

    state_result = await db.execute(
        select(DeviceState).where(DeviceState.device_id == payload.device_id)
    )
    device_state = state_result.scalars().first()

    if not device_state:
        device_state = DeviceState(
            device_id=payload.device_id,
            engine_hours=delta_hours,
            last_ignition_state=payload.ignition,
            last_ignition_on_time=event_timestamp if payload.ignition else None,
            last_updated=event_timestamp,
            last_latitude=payload.lat,
            last_longitude=payload.lon,
            last_speed=payload.speed,
            last_raw_data=payload.raw_data
        )
        db.add(device_state)
    else:
        device_state.engine_hours += delta_hours
        device_state.last_ignition_state = payload.ignition
        if payload.ignition:
            device_state.last_ignition_on_time = event_timestamp
        else:
            device_state.last_ignition_on_time = None
        device_state.last_updated = event_timestamp
        device_state.last_latitude = payload.lat
        device_state.last_longitude = payload.lon
        device_state.last_speed = payload.speed
        device_state.last_raw_data = payload.raw_data

    await db.commit()
    return {
        "status": "ok",
        "accumulated_delta_hours": delta_hours,
        "total_engine_hours": round(device_state.engine_hours, 4)
    }
