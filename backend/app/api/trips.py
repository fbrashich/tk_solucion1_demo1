"""
Router de Gestión de Viajes, Recorridos y Reproducción Playback (Etapa 3)
Aislamiento multi-tenant por usuario y trazabilidad telemática punto a punto.
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, and_

from app.db import get_db
from app.models.models import Device, User, VehicleTrip, TelemetryEvent
from app.schemas.schemas import VehicleTripResponse, VehicleTripRouteResponse, TripPoint
from app.auth.auth import get_current_user

logger = logging.getLogger("trips_api")
router = APIRouter(tags=["Trips"])

# Estimador de combustible en ralentí: 1.5 litros/hora a un costo promedio de $1.150 ARS/litro
LITERS_PER_IDLE_HOUR = 1.5
COST_PER_LITER_ARS = 1150.0

def enrich_trip_response(trip: VehicleTrip) -> VehicleTripResponse:
    resp = VehicleTripResponse.from_orm(trip)
    idle_hours = (trip.idling_seconds or 0) / 3600.0
    fuel_wasted = idle_hours * LITERS_PER_IDLE_HOUR
    resp.idling_fuel_cost_est = round(fuel_wasted * COST_PER_LITER_ARS, 2)
    return resp

@router.get("/devices/{device_id}/trips", response_model=List[VehicleTripResponse])
async def list_device_trips(
    device_id: str,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene el listado cronológico de viajes realizados por el vehículo con filtro de fechas.
    Verifica aislamiento de flota por cuenta de usuario.
    """
    if current_user.role == "admin":
        return []

    dev_query = select(Device.device_id).where(Device.user_id == current_user.id)
    auth_res = await db.execute(dev_query)
    authorized_dev_ids = auth_res.scalars().all()

    if not authorized_dev_ids:
        return []

    if device_id != "all" and device_id not in authorized_dev_ids:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver los viajes de este equipo")

    target_dev_ids = authorized_dev_ids if device_id == "all" else [device_id]

    query = select(VehicleTrip).where(VehicleTrip.device_id.in_(target_dev_ids))

    if from_date:
        if from_date.tzinfo is None:
            from_date = from_date.replace(tzinfo=timezone.utc)
        query = query.where(VehicleTrip.start_time >= from_date)

    if to_date:
        if to_date.tzinfo is None:
            to_date = to_date.replace(tzinfo=timezone.utc)
        query = query.where(VehicleTrip.start_time <= to_date)

    query = query.order_by(VehicleTrip.start_time.desc()).limit(limit)

    result = await db.execute(query)
    trips = result.scalars().all()

    return [enrich_trip_response(t) for t in trips]

@router.get("/trips/{trip_id}/route", response_model=VehicleTripRouteResponse)
async def get_trip_route_points(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna la secuencia completa de coordenadas y telemetría de un viaje
    para reproducir la trayectoria en el mapa interactivo (Route Playback).
    """
    res = await db.execute(select(VehicleTrip).where(VehicleTrip.id == trip_id))
    trip = res.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    dev_res = await db.execute(select(Device).where(Device.device_id == trip.device_id))
    device = dev_res.scalars().first()
    if current_user.role != "admin" and (not device or device.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permisos para ver este viaje")

    end_t = trip.end_time or datetime.now(timezone.utc)

    # Buscar eventos de telemetría entre start_time y end_time
    ev_query = (
        select(TelemetryEvent)
        .where(
            TelemetryEvent.device_id == trip.device_id,
            TelemetryEvent.timestamp >= trip.start_time,
            TelemetryEvent.timestamp <= end_t
        )
        .order_by(TelemetryEvent.timestamp.asc())
    )
    ev_res = await db.execute(ev_query)
    events = ev_res.scalars().all()

    points: List[TripPoint] = []
    for ev in events:
        if ev.latitude and ev.longitude:
            points.append(TripPoint(
                latitude=ev.latitude,
                longitude=ev.longitude,
                speed=ev.speed or 0.0,
                course=ev.course or 0.0,
                altitude=ev.altitude,
                timestamp=ev.timestamp,
                ignition_state=ev.ignition_state
            ))

    return VehicleTripRouteResponse(
        trip=enrich_trip_response(trip),
        points=points,
        point_count=len(points)
    )

@router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Elimina un registro de viaje.
    """
    res = await db.execute(select(VehicleTrip).where(VehicleTrip.id == trip_id))
    trip = res.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    dev_res = await db.execute(select(Device).where(Device.device_id == trip.device_id))
    device = dev_res.scalars().first()
    if current_user.role != "admin" and (not device or device.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar este viaje")

    await db.delete(trip)
    await db.commit()
    logger.info(f"[TRIP] Viaje {trip_id} eliminado por usuario {current_user.username}")
    return None
