import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, and_

from app.db import get_db
from app.models.models import MaintenancePlan, MaintenanceLog, Device, DeviceState, User
from app.schemas.schemas import (
    MaintenancePlanCreate,
    MaintenancePlanUpdate,
    MaintenancePlanResponse,
    MaintenanceRecordServiceRequest,
    MaintenanceLogResponse
)
from app.api.deps import get_current_user

logger = logging.getLogger("maintenance")
router = APIRouter()

async def get_current_metrics_map(db: AsyncSession, device_ids: List[str]):
    """
    Obtiene el odómetro calibrado y horas de motor para cada equipo.
    """
    dev_states_res = await db.execute(select(DeviceState).where(DeviceState.device_id.in_(device_ids)))
    states = {s.device_id: s for s in dev_states_res.scalars().all()}

    dev_res = await db.execute(select(Device).where(Device.device_id.in_(device_ids)))
    devices = {d.device_id: d for d in dev_res.scalars().all()}

    metrics = {}
    for dev_id in device_ids:
        dev_obj = devices.get(dev_id)
        dev_state = states.get(dev_id)

        # Odómetro calibrado
        odo_km = 0.0
        if dev_state and dev_state.calibrated_odometer_km:
            odo_km = dev_state.calibrated_odometer_km
        elif dev_obj:
            odo_km = dev_obj.odometer_offset_km or 0.0

        # Horas calibradas
        base_hs = dev_state.engine_hours if dev_state else 0.0
        offset_hs = dev_obj.engine_hours_offset if dev_obj else 0.0
        calibrated_hs = round(base_hs + offset_hs, 2)

        metrics[dev_id] = {
            "odometer_km": odo_km,
            "engine_hours": calibrated_hs
        }
    return metrics

def build_plan_response(plan: MaintenancePlan, current_val: float) -> MaintenancePlanResponse:
    span = plan.next_service_value - plan.last_service_value
    progress = 0.0
    if span > 0:
        progress = min(100.0, max(0.0, ((current_val - plan.last_service_value) / span) * 100.0))

    remaining = round(plan.next_service_value - current_val, 1)
    unit = "km" if plan.service_type == "KM" else "hs"

    if remaining <= 0:
        plan_status = "OVERDUE"
        status_label = f"Service Vencido por {abs(remaining)} {unit}"
        status_color = "rose"
    elif (plan.service_type == "KM" and remaining < 1000) or (plan.service_type == "HOURS" and remaining < 30):
        plan_status = "WARNING"
        status_label = f"Próximo a vencer ({remaining} {unit} restantes)"
        status_color = "amber"
    else:
        plan_status = "OK"
        status_label = f"Normal ({remaining} {unit} restantes)"
        status_color = "emerald"

    resp = MaintenancePlanResponse.from_orm(plan)
    resp.current_vehicle_value = current_val
    resp.remaining_value = remaining
    resp.progress_percentage = round(progress, 1)
    resp.status = plan_status
    resp.status_label = status_label
    resp.status_color = status_color
    return resp

@router.get("/devices/{device_id}/maintenance", response_model=List[MaintenancePlanResponse])
async def list_maintenance_plans(
    device_id: str,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista todos los planes de mantenimiento configurados con estado semaforizado en tiempo real.
    """
    if current_user.role == "admin":
        return []

    dev_query = select(Device.device_id).where(Device.user_id == current_user.id)
    auth_res = await db.execute(dev_query)
    authorized_dev_ids = auth_res.scalars().all()

    if not authorized_dev_ids:
        return []

    target_dev_ids = authorized_dev_ids if device_id == "all" else [device_id]
    if device_id != "all" and device_id not in authorized_dev_ids:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver el mantenimiento de este equipo")

    query = select(MaintenancePlan).where(MaintenancePlan.device_id.in_(target_dev_ids))
    if active_only:
        query = query.where(MaintenancePlan.is_active == True)
    query = query.order_by(MaintenancePlan.created_at.desc())

    result = await db.execute(query)
    plans = result.scalars().all()

    metrics_map = await get_current_metrics_map(db, target_dev_ids)
    responses: List[MaintenancePlanResponse] = []

    for p in plans:
        m = metrics_map.get(p.device_id, {"odometer_km": 0.0, "engine_hours": 0.0})
        cur_val = m["odometer_km"] if p.service_type == "KM" else m["engine_hours"]
        responses.append(build_plan_response(p, cur_val))

    return responses

@router.post("/devices/{device_id}/maintenance", response_model=MaintenancePlanResponse, status_code=status.HTTP_201_CREATED)
async def create_maintenance_plan(
    device_id: str,
    payload: MaintenancePlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Crea un nuevo plan de mantenimiento preventivo para un equipo específico.
    """
    dev_res = await db.execute(select(Device).where(Device.device_id == device_id))
    device = dev_res.scalars().first()

    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    if current_user.role != "admin" and device.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos sobre este equipo")

    metrics_map = await get_current_metrics_map(db, [device_id])
    cur_metrics = metrics_map.get(device_id, {"odometer_km": 0.0, "engine_hours": 0.0})
    cur_val = cur_metrics["odometer_km"] if payload.service_type == "KM" else cur_metrics["engine_hours"]

    # Si last_service_value es 0, inicializar con el valor actual del vehículo
    last_val = payload.last_service_value if payload.last_service_value > 0 else cur_val
    next_val = payload.next_service_value if payload.next_service_value is not None else (last_val + payload.interval_value)

    plan = MaintenancePlan(
        device_id=device_id,
        title=payload.title,
        service_type=payload.service_type,
        interval_value=payload.interval_value,
        last_service_value=last_val,
        next_service_value=next_val,
        due_date=payload.due_date,
        notes=payload.notes,
        is_active=payload.is_active
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)

    logger.info(f"[MAINTENANCE] Creado plan '{plan.title}' para {device_id} (Intervalo: {plan.interval_value} {plan.service_type})")
    return build_plan_response(plan, cur_val)

@router.post("/maintenance/{plan_id}/record", response_model=MaintenancePlanResponse)
async def record_service_performed(
    plan_id: int,
    payload: MaintenanceRecordServiceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Registra que un service fue ejecutado (asentando taller, costo y fecha),
    y avanza automáticamente el contador del próximo objetivo al siguiente ciclo.
    """
    res = await db.execute(select(MaintenancePlan).where(MaintenancePlan.id == plan_id))
    plan = res.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de mantenimiento no encontrado")

    dev_res = await db.execute(select(Device).where(Device.device_id == plan.device_id))
    device = dev_res.scalars().first()
    if current_user.role != "admin" and (not device or device.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permisos sobre este plan")

    metrics_map = await get_current_metrics_map(db, [plan.device_id])
    cur_metrics = metrics_map.get(plan.device_id, {"odometer_km": 0.0, "engine_hours": 0.0})
    cur_val = cur_metrics["odometer_km"] if plan.service_type == "KM" else cur_metrics["engine_hours"]

    exec_val = payload.executed_value if payload.executed_value is not None else cur_val

    # Crear registro histórico de service ejecutado
    log_entry = MaintenanceLog(
        plan_id=plan.id,
        device_id=plan.device_id,
        executed_at=datetime.now(timezone.utc),
        executed_value=exec_val,
        workshop=payload.workshop,
        cost=payload.cost or 0.0,
        notes=payload.notes
    )
    db.add(log_entry)

    # Avanzar plan al siguiente ciclo
    plan.last_service_value = exec_val
    plan.next_service_value = exec_val + plan.interval_value

    await db.commit()
    await db.refresh(plan)

    logger.info(f"[MAINTENANCE] Service registrado para plan {plan_id} ({plan.title}) en {exec_val}. Próximo objetivo: {plan.next_service_value}")
    return build_plan_response(plan, cur_val)

@router.delete("/maintenance/{plan_id}")
async def delete_maintenance_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Elimina un plan de mantenimiento.
    """
    res = await db.execute(select(MaintenancePlan).where(MaintenancePlan.id == plan_id))
    plan = res.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de mantenimiento no encontrado")

    dev_res = await db.execute(select(Device).where(Device.device_id == plan.device_id))
    device = dev_res.scalars().first()
    if current_user.role != "admin" and (not device or device.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permisos sobre este plan")

    await db.delete(plan)
    await db.commit()
    return {"status": "ok", "message": f"Plan '{plan.title}' eliminado correctamente"}

@router.get("/devices/{device_id}/maintenance/logs", response_model=List[MaintenanceLogResponse])
async def list_maintenance_logs(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista el historial de servicios ejecutados (bitácora de taller y costos).
    """
    if current_user.role == "admin":
        return []

    dev_query = select(Device.device_id).where(Device.user_id == current_user.id)
    auth_res = await db.execute(dev_query)
    authorized_dev_ids = auth_res.scalars().all()

    if not authorized_dev_ids:
        return []

    target_dev_ids = authorized_dev_ids if device_id == "all" else [device_id]
    if device_id != "all" and device_id not in authorized_dev_ids:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver el historial de este equipo")

    query = (
        select(MaintenanceLog)
        .where(MaintenanceLog.device_id.in_(target_dev_ids))
        .order_by(MaintenanceLog.executed_at.desc())
    )
    result = await db.execute(query)
    logs = result.scalars().all()
    return logs
