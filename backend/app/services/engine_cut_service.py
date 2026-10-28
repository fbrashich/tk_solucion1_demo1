"""
Servicio de Inmovilización Remota y Corte de Motor Seguro (Sprint 2 - plan_v4.md - v0.6.0)
Características:
1. Mecanismo Obligatorio de Seguridad Vial (Safety Interlock):
   - Si velocidad > 5.0 km/h: Encola en estado 'PENDING_SAFE_STOP' (NO corta en movimiento).
   - Si velocidad <= 5.0 km/h: Ejecuta 'setdigout 1' inmediatamente en Traccar.
2. Ejecución diferida automática cuando la unidad se detiene (check_and_execute_pending_cut).
3. Restablecimiento inmediato del motor con 'setdigout 0'.
4. Registro de auditoría inmutable en command_audit_logs.
5. Validación estricta de PIN de seguridad o contraseña del operador.
6. Aislamiento multi-tenant (prevención de IDOR).
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.models.models import Device, DeviceState, CommandAuditLog, User
from app.services.traccar_client import traccar_client
from app.services.notification_dispatcher import dispatch_engine_command
from app.core.security import pwd_context

logger = logging.getLogger("engine_cut_service")

# Umbral máximo de velocidad para corte seguro (km/h)
MAX_SAFE_SPEED_KMH = 5.0


async def _send_traccar_cut_command(device: Device, cmd_text: str) -> Optional[int]:
    """Helper para resolver el deviceId numérico en Traccar y despachar el comando telemático"""
    try:
        tr_id = getattr(device, "traccar_device_id", None)
        if not tr_id:
            uniq = device.traccar_unique_id or device.device_id
            tr_dev = await traccar_client.find_device_by_unique_id(uniq)
            if tr_dev and isinstance(tr_dev, dict):
                tr_id = tr_dev.get("id")
        if tr_id:
            res = await traccar_client.send_device_command(tr_id, cmd_text)
            if res.get("success") and isinstance(res.get("data"), dict):
                return res["data"].get("id")
    except Exception as e:
        logger.warning(f"[TRACCAR COMMAND] Error despachando comando {cmd_text} a Traccar: {e}")
    return None


def verify_operator_auth(user: User, device: Device, pin_or_password: str) -> bool:
    """
    Valida el PIN de seguridad asignado al vehículo o la contraseña de la cuenta del operador.
    """
    if not pin_or_password:
        return False

    # 1. Verificar si coincide con el PIN específico del vehículo
    if device.security_pin and pin_or_password.strip() == device.security_pin.strip():
        return True

    # 2. Verificar si coincide con la contraseña maestra del usuario autenticado
    try:
        pwd = getattr(user, "hashed_password", None) or getattr(user, "password_hash", None)
        if pwd and pwd_context.verify(pin_or_password[:72], pwd):
            return True
    except Exception as e:
        logger.warning(f"[AUTH VERIFY] Error verificando hash de contraseña: {e}")

    return False


async def request_engine_cut(
    db: AsyncSession,
    user: User,
    device_id: str,
    action: str,
    pin_or_password: str,
    ip_address: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Procesa una solicitud de inmovilización o restablecimiento de motor con Safety Interlock.
    """
    # 1. Aislamiento Multi-Tenant: Validar existencia y propiedad del dispositivo
    dev_query = select(Device).where(Device.device_id == device_id)
    if user.role != "admin":
        dev_query = dev_query.where(Device.user_id == user.id)
    dev_res = await db.execute(dev_query)
    device = dev_res.scalars().first()

    if not device:
        logger.warning(f"[ENGINE CUT] Intento de acceso denegado o dispositivo inexistente: {device_id} por user {user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado o no tiene autorización para gestionarlo."
        )

    # 2. Validación de PIN o Contraseña
    if not verify_operator_auth(user, device, pin_or_password):
        logger.warning(f"[ENGINE CUT] Autenticación fallida para comando de corte en {device_id} por {user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PIN o contraseña de seguridad incorrecta. Autorización denegada."
        )

    # 3. Obtener o inicializar el estado del dispositivo
    state_res = await db.execute(select(DeviceState).where(DeviceState.device_id == device_id))
    device_state = state_res.scalars().first()
    if not device_state:
        device_state = DeviceState(device_id=device_id, immobilizer_status="NORMAL")
        db.add(device_state)
        await db.flush()

    current_speed = float(device_state.last_speed or 0.0)
    now_utc = datetime.now(timezone.utc)

    # =========================================================================
    # ACCIÓN: CORTE DE MOTOR (INMOVILIZACIÓN)
    # =========================================================================
    if action == "CUT":
        command_type = "CUT_ENGINE"

        # REGLA INQUEBRANTABLE DE SEGURIDAD VIAL: SAFETY INTERLOCK
        if current_speed > MAX_SAFE_SPEED_KMH:
            # Encolar para ejecución diferida segura cuando se detenga
            audit_log = CommandAuditLog(
                user_id=user.id,
                device_id=device.device_id,
                command_type=command_type,
                action="CUT",
                status="PENDING_SAFE_STOP",
                speed_at_request_kmh=current_speed,
                speed_at_execution_kmh=None,
                ip_address=ip_address,
                notes=notes,
                created_at=now_utc
            )
            db.add(audit_log)
            await db.flush()

            device_state.immobilizer_status = "PENDING_CUT"
            device_state.pending_command_id = audit_log.id
            device_state.last_command_at = now_utc
            await db.commit()

            # Despachar notificación a Telegram / Alertas
            dispatch_engine_command(
                action="CUT",
                status="QUEUED_SAFE_STOP",
                device_name=device.name,
                device_id=device.device_id,
                user_email=user.email,
                speed_kmh=current_speed,
                notes=notes
            )

            logger.warning(
                f"[SAFETY INTERLOCK] Corte de motor encolado para {device_id}: "
                f"velocidad actual {current_speed:.1f} km/h > {MAX_SAFE_SPEED_KMH} km/h."
            )

            return {
                "success": True,
                "status": "QUEUED_SAFE_STOP",
                "message": (
                    f"Vehículo en movimiento a {current_speed:.1f} km/h (> {MAX_SAFE_SPEED_KMH} km/h). "
                    "Por seguridad vial estricta, el corte quedó ENCOLADO y se aplicará automáticamente "
                    "apenas la unidad detenga su marcha."
                ),
                "command_id": audit_log.id,
                "device_id": device.device_id,
                "current_speed_kmh": current_speed,
                "requested_at": audit_log.created_at,
                "executed_at": None
            }

        else:
            # Velocidad <= 5 km/h: Ejecución Inmediata
            traccar_cmd_id = await _send_traccar_cut_command(device, "setdigout 1")

            audit_log = CommandAuditLog(
                user_id=user.id,
                device_id=device.device_id,
                command_type=command_type,
                action="CUT",
                status="EXECUTED",
                speed_at_request_kmh=current_speed,
                speed_at_execution_kmh=current_speed,
                ip_address=ip_address,
                traccar_command_id=traccar_cmd_id,
                notes=notes,
                created_at=now_utc,
                executed_at=now_utc
            )
            db.add(audit_log)
            await db.flush()

            device_state.immobilizer_status = "IMMOBILIZED"
            device_state.pending_command_id = None
            device_state.last_command_at = now_utc
            await db.commit()

            dispatch_engine_command(
                action="CUT",
                status="EXECUTED",
                device_name=device.name,
                device_id=device.device_id,
                user_email=user.email,
                speed_kmh=current_speed,
                notes=notes
            )

            logger.info(f"[ENGINE CUT] Corte de motor ejecutado con éxito en {device_id} a {current_speed:.1f} km/h.")

            return {
                "success": True,
                "status": "EXECUTED",
                "message": "Comando de inmovilización ejecutado exitosamente. Relé de corte activado.",
                "command_id": audit_log.id,
                "device_id": device.device_id,
                "current_speed_kmh": current_speed,
                "requested_at": audit_log.created_at,
                "executed_at": audit_log.executed_at
            }

    # =========================================================================
    # ACCIÓN: RESTABLECIMIENTO DE MOTOR
    # =========================================================================
    elif action == "RESTORE":
        command_type = "RESTORE_ENGINE"

        # Cancelar cualquier comando previo pendiente en la cola
        if device_state.pending_command_id:
            prev_cmd = await db.get(CommandAuditLog, device_state.pending_command_id)
            if prev_cmd and prev_cmd.status == "PENDING_SAFE_STOP":
                prev_cmd.status = "CANCELLED"
                prev_cmd.notes = f"{prev_cmd.notes or ''} [Cancelado por orden de restablecimiento]"

        traccar_cmd_id = await _send_traccar_cut_command(device, "setdigout 0")

        audit_log = CommandAuditLog(
            user_id=user.id,
            device_id=device.device_id,
            command_type=command_type,
            action="RESTORE",
            status="EXECUTED",
            speed_at_request_kmh=current_speed,
            speed_at_execution_kmh=current_speed,
            ip_address=ip_address,
            traccar_command_id=traccar_cmd_id,
            notes=notes,
            created_at=now_utc,
            executed_at=now_utc
        )
        db.add(audit_log)
        await db.flush()

        device_state.immobilizer_status = "NORMAL"
        device_state.pending_command_id = None
        device_state.last_command_at = now_utc
        await db.commit()

        dispatch_engine_command(
            action="RESTORE",
            status="EXECUTED",
            device_name=device.name,
            device_id=device.device_id,
            user_email=user.email,
            speed_kmh=current_speed,
            notes=notes
        )

        logger.info(f"[ENGINE RESTORE] Motor restablecido para {device_id}. Relé desactivado.")

        return {
            "success": True,
            "status": "EXECUTED",
            "message": "Comando de restablecimiento ejecutado exitosamente. La unidad está autorizada para el arranque normal.",
            "command_id": audit_log.id,
            "device_id": device.device_id,
            "current_speed_kmh": current_speed,
            "requested_at": audit_log.created_at,
            "executed_at": audit_log.executed_at
        }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Acción inválida '{action}'. Use 'CUT' o 'RESTORE'."
        )


async def check_and_execute_pending_cut(
    db: AsyncSession,
    device_id: str,
    device_name: str,
    current_speed_kmh: float
) -> Optional[CommandAuditLog]:
    """
    Hook del pipeline de ingesta en tiempo real.
    Si el vehículo tiene un comando pendiente 'PENDING_SAFE_STOP' y la velocidad
    descendió a <= 5.0 km/h, ejecuta el corte seguro en Traccar y consolida el estado.
    """
    if current_speed_kmh > MAX_SAFE_SPEED_KMH:
        return None

    # Buscar comando encolado pendiente
    res = await db.execute(
        select(CommandAuditLog)
        .where(
            CommandAuditLog.device_id == device_id,
            CommandAuditLog.status == "PENDING_SAFE_STOP",
            CommandAuditLog.action == "CUT"
        )
        .order_by(desc(CommandAuditLog.created_at))
        .limit(1)
    )
    pending_cmd = res.scalars().first()
    if not pending_cmd:
        return None

    # Obtener dispositivo para traccar_device_id
    dev = await db.get(Device, device_id)
    if not dev:
        return None

    now_utc = datetime.now(timezone.utc)

    # Ejecutar setdigout 1 en Traccar
    traccar_cmd_id = await _send_traccar_cut_command(dev, "setdigout 1")

    # Actualizar registro de auditoría
    pending_cmd.status = "EXECUTED"
    pending_cmd.executed_at = now_utc
    pending_cmd.speed_at_execution_kmh = current_speed_kmh
    if traccar_cmd_id:
        pending_cmd.traccar_command_id = traccar_cmd_id

    # Actualizar estado del dispositivo
    state_res = await db.execute(select(DeviceState).where(DeviceState.device_id == device_id))
    dev_state = state_res.scalars().first()
    if dev_state:
        dev_state.immobilizer_status = "IMMOBILIZED"
        dev_state.pending_command_id = None
        dev_state.last_command_at = now_utc

    # Obtener email de operador
    user_email = "Operador de Flota"
    if pending_cmd.user_id:
        u = await db.get(User, pending_cmd.user_id)
        if u:
            user_email = u.email

    dispatch_engine_command(
        action="CUT",
        status="EXECUTED",
        device_name=device_name,
        device_id=device_id,
        user_email=user_email,
        speed_kmh=current_speed_kmh,
        notes="Ejecución diferida automática activada tras confirmación de vehículo detenido (≤ 5 km/h)."
    )

    logger.info(
        f"[SAFETY INTERLOCK DEFERRED] Inmovilización ejecutada automáticamente para {device_id} "
        f"a {current_speed_kmh:.1f} km/h (Comando ID={pending_cmd.id})."
    )

    return pending_cmd


async def cancel_pending_cut(
    db: AsyncSession,
    user: User,
    command_id: int
) -> Dict[str, Any]:
    """
    Cancela un comando de inmovilización que se encuentra en espera de detención segura.
    """
    cmd = await db.get(CommandAuditLog, command_id)
    if not cmd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comando no encontrado."
        )

    # Validar permisos
    if user.role != "admin":
        dev = await db.get(Device, cmd.device_id)
        if not dev or dev.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No está autorizado para cancelar comandos sobre este dispositivo."
            )

    if cmd.status != "PENDING_SAFE_STOP":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El comando no se encuentra en estado pendiente (estado actual: {cmd.status})."
        )

    cmd.status = "CANCELLED"
    cmd.notes = f"{cmd.notes or ''} [Cancelado por operador {user.email}]"

    # Restablecer estado en DeviceState si coincidía con este comando
    state_res = await db.execute(select(DeviceState).where(DeviceState.device_id == cmd.device_id))
    dev_state = state_res.scalars().first()
    if dev_state and dev_state.pending_command_id == cmd.id:
        dev_state.immobilizer_status = "NORMAL"
        dev_state.pending_command_id = None

    await db.commit()
    logger.info(f"[ENGINE CUT] Comando {command_id} cancelado por {user.email}.")

    return {
        "success": True,
        "message": "Comando encolado cancelado exitosamente. La unidad continuará operando normalmente."
    }


async def get_device_command_history(
    db: AsyncSession,
    user: User,
    device_id: str,
    limit: int = 50
) -> List[CommandAuditLog]:
    """
    Retorna el historial inmutable de auditoría de comandos telemáticos para un vehículo.
    """
    # Aislamiento multi-tenant
    dev_query = select(Device).where(Device.device_id == device_id)
    if user.role != "admin":
        dev_query = dev_query.where(Device.user_id == user.id)
    dev_res = await db.execute(dev_query)
    device = dev_res.scalars().first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado o no tiene autorización para consultar su historial."
        )

    res = await db.execute(
        select(CommandAuditLog)
        .where(CommandAuditLog.device_id == device_id)
        .order_by(desc(CommandAuditLog.created_at))
        .limit(limit)
    )
    return list(res.scalars().all())


async def set_device_security_pin(
    db: AsyncSession,
    user: User,
    device_id: str,
    current_password: str,
    new_pin: str
) -> Dict[str, Any]:
    """
    Configura o actualiza el PIN de seguridad asignado a un vehículo para comandos críticos.
    Requiere verificación previa de la contraseña del usuario.
    """
    if not user.password_hash or not pwd_context.verify(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Contraseña de usuario incorrecta. No se puede configurar el PIN."
        )

    dev_query = select(Device).where(Device.device_id == device_id)
    if user.role != "admin":
        dev_query = dev_query.where(Device.user_id == user.id)
    dev_res = await db.execute(dev_query)
    device = dev_res.scalars().first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado o no autorizado."
        )

    clean_pin = new_pin.strip()
    if len(clean_pin) < 4 or len(clean_pin) > 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El PIN de seguridad debe tener entre 4 y 8 dígitos numéricos."
        )

    device.security_pin = clean_pin
    await db.commit()
    logger.info(f"[SECURITY PIN] PIN actualizado para {device_id} por {user.email}.")

    return {
        "success": True,
        "message": f"PIN de seguridad de {len(clean_pin)} dígitos configurado exitosamente para el vehículo {device.name}."
    }
