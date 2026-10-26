"""
Motor de Procesamiento y Detección Automática de Viajes y Paradas (Etapa 3)
Determina inicio, trayecto, acumulación de distancia/ralentí y cierre de viajes según el ciclo de ignición.
"""
import math
import logging
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.models import VehicleTrip

logger = logging.getLogger("trip_detector")

def haversine_distance_km(lat1: Optional[float], lon1: Optional[float], lat2: Optional[float], lon2: Optional[float]) -> float:
    """
    Calcula la distancia geodésica ortodrómica en kilómetros entre dos coordenadas GPS (WGS84).
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0.0
    if lat1 == lat2 and lon1 == lon2:
        return 0.0

    # Radio de la Tierra en kilómetros
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return R * c

async def process_position_for_trips(
    db: AsyncSession,
    device_id: str,
    latitude: Optional[float],
    longitude: Optional[float],
    speed_kmh: float,
    ignition: bool,
    motion: bool,
    timestamp: datetime
) -> Optional[VehicleTrip]:
    """
    Evalúa la posición entrante de un dispositivo y actualiza o crea el viaje correspondiente.
    Retorna la instancia de VehicleTrip modificada o creada (si aplica).
    """
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    # Buscar viaje abierto actualmente para este dispositivo
    query = (
        select(VehicleTrip)
        .where(VehicleTrip.device_id == device_id, VehicleTrip.is_closed == False)
        .order_by(VehicleTrip.start_time.desc())
        .limit(1)
    )
    result = await db.execute(query)
    open_trip = result.scalars().first()

    if ignition:
        # Caso 1: Motor encendido pero NO hay viaje abierto -> Abrir nuevo viaje
        if not open_trip:
            new_trip = VehicleTrip(
                device_id=device_id,
                start_time=timestamp,
                end_time=timestamp,
                duration_seconds=0,
                distance_km=0.0,
                max_speed_kmh=round(speed_kmh, 1),
                avg_speed_kmh=round(speed_kmh, 1),
                idling_seconds=0,
                start_latitude=latitude,
                start_longitude=longitude,
                end_latitude=latitude,
                end_longitude=longitude,
                is_closed=False
            )
            db.add(new_trip)
            await db.flush()
            logger.info(f"[TRIP] Nuevo viaje iniciado para '{device_id}' a las {timestamp.isoformat()}")
            return new_trip

        # Caso 2: Motor encendido con viaje ya abierto -> Acumular trayecto y métricas
        else:
            prev_lat = open_trip.end_latitude
            prev_lon = open_trip.end_longitude
            delta_km = haversine_distance_km(prev_lat, prev_lon, latitude, longitude)

            # Filtro de salto GPS espurio (ej. salto mayor a 50 km en un solo reporte)
            if delta_km > 0.005 and delta_km < 50.0:
                open_trip.distance_km = round(open_trip.distance_km + delta_km, 3)

            # Actualizar velocidad máxima
            if speed_kmh > open_trip.max_speed_kmh:
                open_trip.max_speed_kmh = round(speed_kmh, 1)

            # Acumular ralentí si el vehículo está detenido con motor en marcha
            if open_trip.end_time:
                time_delta = (timestamp - open_trip.end_time).total_seconds()
                if time_delta > 0 and (speed_kmh < 3.0 and not motion):
                    open_trip.idling_seconds += int(time_delta)

            # Actualizar punto final y duración
            open_trip.end_time = timestamp
            if latitude is not None and longitude is not None:
                open_trip.end_latitude = latitude
                open_trip.end_longitude = longitude

            duration = max(0, int((timestamp - open_trip.start_time).total_seconds()))
            open_trip.duration_seconds = duration

            if duration > 10 and open_trip.distance_km > 0.05:
                hours = duration / 3600.0
                open_trip.avg_speed_kmh = round(open_trip.distance_km / hours, 1)

            return open_trip

    else:
        # Caso 3: Motor apagado con viaje abierto -> Cerrar viaje
        if open_trip:
            open_trip.end_time = timestamp
            if latitude is not None and longitude is not None:
                open_trip.end_latitude = latitude
                open_trip.end_longitude = longitude

            duration = max(0, int((timestamp - open_trip.start_time).total_seconds()))
            open_trip.duration_seconds = duration
            open_trip.is_closed = True

            if duration > 10 and open_trip.distance_km > 0.05:
                hours = duration / 3600.0
                open_trip.avg_speed_kmh = round(open_trip.distance_km / hours, 1)

            logger.info(
                f"[TRIP] Viaje cerrado para '{device_id}'. "
                f"Duración: {open_trip.duration_seconds}s, "
                f"Distancia: {open_trip.distance_km}km, "
                f"Ralentí: {open_trip.idling_seconds}s, "
                f"Max Vel: {open_trip.max_speed_kmh}km/h"
            )
            return open_trip

    return None
