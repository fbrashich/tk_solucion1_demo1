"""
Endpoints para Inmovilizador y Control Remoto de Comandos (Sprint 2 - plan_v4.md - v0.6.0)
Rutas:
- POST /api/devices/{device_id}/engine-cut (Corte o Restablecimiento de Motor con Safety Interlock)
- GET  /api/devices/{device_id}/engine-status (Estado actual del inmovilizador y velocidad)
- GET  /api/devices/{device_id}/command-logs (Historial inmutable de auditoría)
- POST /api/commands/{command_id}/cancel (Cancelar comando encolado pendiente)
- POST /api/devices/{device_id}/security-pin (Configuración de PIN de seguridad del vehículo)
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db import get_db
from app.models.models import User, Device, DeviceState
from app.api.deps import get_current_user
from app.schemas.schemas import (
    EngineCutRequest,
    EngineCutResponse,
    CommandAuditLogResponse,
    SetSecurityPinRequest
)
from app.services.engine_cut_service import (
    request_engine_cut,
    cancel_pending_cut,
    get_device_command_history,
    set_device_security_pin
)

logger = logging.getLogger("commands_api")
router = APIRouter()


@router.post("/devices/{device_id}/engine-cut", response_model=EngineCutResponse)
async def execute_engine_cut(
    device_id: str,
    payload: EngineCutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Solicita el corte ('CUT') o restablecimiento ('RESTORE') de motor para un vehículo.
    Implementa el mecanismo Safety Interlock: si la velocidad > 5 km/h, el comando queda
    encolado en estado 'PENDING_SAFE_STOP' y solo se ejecuta al detenerse la unidad.
    """
    client_ip = request.client.host if request.client else None
    return await request_engine_cut(
        db=db,
        user=current_user,
        device_id=device_id,
        action=payload.action,
        pin_or_password=payload.pin_or_password,
        ip_address=client_ip,
        notes=payload.notes
    )


@router.get("/devices/{device_id}/engine-status")
async def get_engine_status(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna el estado en tiempo real del inmovilizador y velocidad reportada.
    """
    dev_query = select(Device).where(Device.device_id == device_id)
    if current_user.role != "admin":
        dev_query = dev_query.where(Device.user_id == current_user.id)
    dev_res = await db.execute(dev_query)
    device = dev_res.scalars().first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado o no autorizado."
        )

    state_res = await db.execute(select(DeviceState).where(DeviceState.device_id == device_id))
    dev_state = state_res.scalars().first()

    return {
        "device_id": device_id,
        "name": device.name,
        "has_security_pin": bool(device.security_pin),
        "immobilizer_status": dev_state.immobilizer_status if dev_state else "NORMAL",
        "pending_command_id": dev_state.pending_command_id if dev_state else None,
        "last_command_at": dev_state.last_command_at if dev_state else None,
        "current_speed_kmh": dev_state.last_speed if dev_state else 0.0,
        "last_updated": dev_state.last_updated if dev_state else None
    }


@router.get("/devices/{device_id}/command-logs", response_model=List[CommandAuditLogResponse])
async def list_command_logs(
    device_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Consulta la auditoría inmutable de comandos emitidos para este vehículo.
    """
    return await get_device_command_history(
        db=db,
        user=current_user,
        device_id=device_id,
        limit=limit
    )


@router.post("/commands/{command_id}/cancel")
async def cancel_command(
    command_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancela un comando de corte encolado en 'PENDING_SAFE_STOP'.
    """
    return await cancel_pending_cut(
        db=db,
        user=current_user,
        command_id=command_id
    )


@router.post("/devices/{device_id}/security-pin")
async def update_security_pin(
    device_id: str,
    payload: SetSecurityPinRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Configura o actualiza el PIN de seguridad de 4 a 8 dígitos asignado al vehículo.
    """
    return await set_device_security_pin(
        db=db,
        user=current_user,
        device_id=device_id,
        current_password=payload.current_password,
        new_pin=payload.new_pin
    )
