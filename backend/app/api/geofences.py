"""
Router de Gestión de Geocercas Inteligentes y Eventos (Sprint 1 - plan_v4.md)
Seguridad:
- Aislamiento estricto Multi-Tenant (Anti-IDOR): cada usuario solo administra y visualiza sus propias geocercas.
- Validación de polígonos cerrados (>= 3 vértices) y círculos válidos.
"""
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, and_

from app.db import get_db
from app.models.models import Geofence, GeofenceEvent, Device, DeviceState, User
from app.schemas.schemas import (
    GeofenceCreate,
    GeofenceUpdate,
    GeofenceResponse,
    GeofenceEventResponse
)
from app.api.deps import get_current_user as get_current_active_user
from app.services.geofence_engine import is_inside_geofence

logger = logging.getLogger("geofences")
router = APIRouter()


@router.get("/geofences", response_model=List[GeofenceResponse])
async def list_geofences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista todas las geocercas configuradas para la empresa/cuenta del usuario autenticado.
    Calcula en tiempo real la cantidad de vehículos actualmente dentro de cada zona.
    """
    # Consulta aislada por multi-tenancy
    query = select(Geofence).where(Geofence.user_id == current_user.id).order_by(Geofence.name)
    result = await db.execute(query)
    geofences = result.scalars().all()

    # Obtener últimas posiciones de los dispositivos del usuario para calcular presencia
    dev_states_res = await db.execute(
        select(DeviceState)
        .join(Device, Device.device_id == DeviceState.device_id)
        .where(Device.user_id == current_user.id)
    )
    device_states = dev_states_res.scalars().all()

    response_list = []
    for gf in geofences:
        # Contar cuántos equipos están dentro
        inside_count = 0
        for ds in device_states:
            if ds.last_latitude is not None and ds.last_longitude is not None:
                if is_inside_geofence(ds.last_latitude, ds.last_longitude, gf):
                    inside_count += 1

        gf_dict = {
            "id": gf.id,
            "user_id": gf.user_id,
            "name": gf.name,
            "description": gf.description,
            "type": gf.type,
            "center_lat": gf.center_lat,
            "center_lon": gf.center_lon,
            "radius_meters": gf.radius_meters,
            "polygon_vertices": gf.polygon_vertices,
            "color": gf.color,
            "speed_limit_kmh": gf.speed_limit_kmh,
            "is_active": gf.is_active,
            "created_at": gf.created_at,
            "active_devices_inside": inside_count
        }
        response_list.append(gf_dict)

    return response_list


@router.post("/geofences", response_model=GeofenceResponse, status_code=status.HTTP_201_CREATED)
async def create_geofence(
    payload: GeofenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Crea una nueva geocerca poligonal o circular para el usuario autenticado.
    Valida geometrías y límites.
    """
    if payload.type == "POLYGON":
        if not payload.polygon_vertices or len(payload.polygon_vertices) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Una geocerca poligonal debe tener al menos 3 vértices de coordenadas [lat, lon]."
            )
    elif payload.type == "CIRCLE":
        if payload.center_lat is None or payload.center_lon is None or (payload.radius_meters or 0) <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Una geocerca circular requiere latitud de centro, longitud de centro y radio en metros mayor a 0."
            )

    geofence = Geofence(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        type=payload.type,
        center_lat=payload.center_lat,
        center_lon=payload.center_lon,
        radius_meters=payload.radius_meters,
        polygon_vertices=payload.polygon_vertices,
        color=payload.color or "#06b6d4",
        speed_limit_kmh=payload.speed_limit_kmh,
        is_active=payload.is_active
    )
    db.add(geofence)
    await db.commit()
    await db.refresh(geofence)

    return geofence


@router.put("/geofences/{geofence_id}", response_model=GeofenceResponse)
async def update_geofence(
    geofence_id: int,
    payload: GeofenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Actualiza propiedades de una geocerca existente con validación Anti-IDOR.
    """
    res = await db.execute(
        select(Geofence).where(Geofence.id == geofence_id, Geofence.user_id == current_user.id)
    )
    geofence = res.scalars().first()
    if not geofence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geocerca no encontrada o no pertenece a tu cuenta."
        )

    if payload.name is not None:
        geofence.name = payload.name
    if payload.description is not None:
        geofence.description = payload.description
    if payload.type is not None:
        geofence.type = payload.type
    if payload.center_lat is not None:
        geofence.center_lat = payload.center_lat
    if payload.center_lon is not None:
        geofence.center_lon = payload.center_lon
    if payload.radius_meters is not None:
        geofence.radius_meters = payload.radius_meters
    if payload.polygon_vertices is not None:
        geofence.polygon_vertices = payload.polygon_vertices
    if payload.color is not None:
        geofence.color = payload.color
    if payload.speed_limit_kmh is not None:
        geofence.speed_limit_kmh = payload.speed_limit_kmh
    if payload.is_active is not None:
        geofence.is_active = payload.is_active

    await db.commit()
    await db.refresh(geofence)
    return geofence


@router.delete("/geofences/{geofence_id}")
async def delete_geofence(
    geofence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Elimina una geocerca y sus eventos históricos en cascada.
    """
    res = await db.execute(
        select(Geofence).where(Geofence.id == geofence_id, Geofence.user_id == current_user.id)
    )
    geofence = res.scalars().first()
    if not geofence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geocerca no encontrada o no pertenece a tu cuenta."
        )

    await db.delete(geofence)
    await db.commit()
    return {"status": "ok", "message": f"Geocerca '{geofence.name}' eliminada exitosamente."}


@router.get("/geofences/{geofence_id}/events", response_model=List[GeofenceEventResponse])
async def list_geofence_events(
    geofence_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna el historial de eventos (ingresos, egresos y excesos de velocidad) de una geocerca.
    """
    # Validar pertenencia de la geocerca
    gf_res = await db.execute(
        select(Geofence).where(Geofence.id == geofence_id, Geofence.user_id == current_user.id)
    )
    geofence = gf_res.scalars().first()
    if not geofence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Geocerca no encontrada o no pertenece a tu cuenta."
        )

    query = (
        select(GeofenceEvent)
        .where(GeofenceEvent.geofence_id == geofence_id)
        .order_by(desc(GeofenceEvent.timestamp))
        .limit(limit)
    )
    result = await db.execute(query)
    events = result.scalars().all()

    return [
        {
            "id": evt.id,
            "geofence_id": evt.geofence_id,
            "device_id": evt.device_id,
            "event_type": evt.event_type,
            "timestamp": evt.timestamp,
            "latitude": evt.latitude,
            "longitude": evt.longitude,
            "speed_kmh": evt.speed_kmh,
            "duration_inside_seconds": evt.duration_inside_seconds,
            "geofence_name": geofence.name
        }
        for evt in events
    ]


@router.get("/devices/{device_id}/geofence-events", response_model=List[GeofenceEventResponse])
async def list_device_geofence_events(
    device_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna los eventos de geocerca registrados para un vehículo específico con aislamiento Anti-IDOR.
    """
    dev_res = await db.execute(
        select(Device).where(Device.device_id == device_id, Device.user_id == current_user.id)
    )
    device = dev_res.scalars().first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado o no pertenece a tu cuenta."
        )

    query = (
        select(GeofenceEvent, Geofence.name.label("geofence_name"))
        .join(Geofence, Geofence.id == GeofenceEvent.geofence_id)
        .where(GeofenceEvent.device_id == device_id)
        .order_by(desc(GeofenceEvent.timestamp))
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": evt.id,
            "geofence_id": evt.geofence_id,
            "device_id": evt.device_id,
            "event_type": evt.event_type,
            "timestamp": evt.timestamp,
            "latitude": evt.latitude,
            "longitude": evt.longitude,
            "speed_kmh": evt.speed_kmh,
            "duration_inside_seconds": evt.duration_inside_seconds,
            "geofence_name": gf_name
        }
        for evt, gf_name in rows
    ]
