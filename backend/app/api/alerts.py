import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, and_

from app.db import get_db
from app.models.models import VehicleAlert, Device, User
from app.schemas.schemas import VehicleAlertResponse, AlertResolveRequest
from app.api.deps import get_current_user

logger = logging.getLogger("alerts")
router = APIRouter()

@router.get("/devices/{device_id}/alerts", response_model=List[VehicleAlertResponse])
async def get_device_alerts(
    device_id: str,
    resolved: Optional[bool] = False,
    severity: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna la lista de alertas telemáticas asociadas al equipo o a toda la flota del operador.
    Multi-tenancy estricto: solo accesible por el propietario de los dispositivos.
    """
    if current_user.role == "admin":
        return []

    # Obtener dispositivos autorizados para este operador
    dev_query = select(Device.device_id).where(Device.user_id == current_user.id)
    auth_devs_res = await db.execute(dev_query)
    authorized_dev_ids = auth_devs_res.scalars().all()

    if not authorized_dev_ids:
        return []

    query = select(VehicleAlert)

    if device_id != "all":
        if device_id not in authorized_dev_ids:
            raise HTTPException(status_code=403, detail="No tienes permisos para ver alertas de este equipo")
        query = query.where(VehicleAlert.device_id == device_id)
    else:
        query = query.where(VehicleAlert.device_id.in_(authorized_dev_ids))

    if resolved is not None:
        query = query.where(VehicleAlert.resolved == resolved)

    if severity is not None:
        query = query.where(VehicleAlert.severity == severity.upper())

    query = query.order_by(desc(VehicleAlert.timestamp)).limit(limit)
    result = await db.execute(query)
    alerts = result.scalars().all()
    return alerts

@router.put("/alerts/{alert_id}/resolve", response_model=VehicleAlertResponse)
async def resolve_alert(
    alert_id: int,
    payload: AlertResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Marca una alerta operativa como resuelta por el operador responsable.
    """
    res = await db.execute(select(VehicleAlert).where(VehicleAlert.id == alert_id))
    alert = res.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")

    # Validar permisos sobre el dispositivo emisor
    dev_res = await db.execute(select(Device).where(Device.device_id == alert.device_id))
    device = dev_res.scalars().first()

    if current_user.role != "admin" and (not device or device.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permisos para resolver esta alerta")

    alert.resolved = True
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = current_user.username
    if payload.notes:
        alert.message = f"{alert.message} | Resuelto: {payload.notes.strip()}"

    await db.commit()
    await db.refresh(alert)
    logger.info(f"[ALERTS] Alerta {alert_id} ({alert.alert_type}) resuelta por {current_user.username}")
    return alert
