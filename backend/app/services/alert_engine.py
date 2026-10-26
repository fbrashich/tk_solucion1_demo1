import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, and_

from app.models.models import VehicleAlert
from app.services.live_stream import live_manager

logger = logging.getLogger("alert_engine")

THROTTLE_MINUTES = 15.0

def evaluate_alert_rules(
    device_id: str,
    power_voltage: Optional[float],
    ignition: bool,
    speed_kmh: float,
    motion: bool,
    timestamp: datetime,
    speed_limit_kmh: float = 100.0
) -> List[Dict[str, Any]]:
    """
    Motor de reglas síncrono para evaluar condiciones anómalas de telemetría.
    Retorna lista de alertas candidatas a ser persistidas.
    """
    candidates: List[Dict[str, Any]] = []

    # Regla 1: Corte de alimentación principal o sabotaje de borne (< 5.0 V)
    if power_voltage is not None and power_voltage < 5.0:
        candidates.append({
            "device_id": device_id,
            "alert_type": "POWER_CUT",
            "severity": "CRITICAL",
            "message": f"Corte de alimentación externa detectado ({power_voltage:.2f} V). Posible sabotaje o desconexión de borne.",
            "value": round(power_voltage, 2),
            "timestamp": timestamp
        })

    # Regla 2: Batería descargada crítica (< 11.2 V)
    elif power_voltage is not None and power_voltage < 11.2:
        candidates.append({
            "device_id": device_id,
            "alert_type": "CRITICAL_BATTERY",
            "severity": "CRITICAL",
            "message": f"Batería crítica descargada ({power_voltage:.2f} V). Riesgo inminente de no arranque.",
            "value": round(power_voltage, 2),
            "timestamp": timestamp
        })

    # Regla 3: Batería de vehículo baja (< 11.8 V)
    elif power_voltage is not None and power_voltage < 11.8:
        candidates.append({
            "device_id": device_id,
            "alert_type": "LOW_BATTERY",
            "severity": "WARNING",
            "message": f"Batería de vehículo baja ({power_voltage:.2f} V). Verificar antes de próxima salida.",
            "value": round(power_voltage, 2),
            "timestamp": timestamp
        })

    # Regla 4: Alerta de remolque o grúa (movimiento con motor apagado)
    if not ignition and (speed_kmh >= 5.0 or (motion and speed_kmh >= 3.0)):
        candidates.append({
            "device_id": device_id,
            "alert_type": "TOWING",
            "severity": "CRITICAL",
            "message": f"Alerta de remolque o grúa: Desplazamiento no autorizado detectado ({speed_kmh:.1f} km/h) con motor apagado.",
            "value": round(speed_kmh, 1),
            "timestamp": timestamp
        })

    # Regla 5: Exceso de velocidad por encima del límite operativo
    if speed_kmh > speed_limit_kmh:
        candidates.append({
            "device_id": device_id,
            "alert_type": "OVERSPEED",
            "severity": "WARNING",
            "message": f"Exceso de velocidad: {speed_kmh:.1f} km/h (Límite operativo: {speed_limit_kmh:.0f} km/h).",
            "value": round(speed_kmh, 1),
            "timestamp": timestamp
        })

    # Regla 6: Falla de alternador (motor encendido pero no carga)
    if ignition and power_voltage is not None and power_voltage < 12.5 and power_voltage >= 5.0:
        candidates.append({
            "device_id": device_id,
            "alert_type": "ALTERNATOR_FAIL",
            "severity": "WARNING",
            "message": f"Falla de alternador: Motor en marcha pero voltaje de carga deficiente ({power_voltage:.2f} V).",
            "value": round(power_voltage, 2),
            "timestamp": timestamp
        })

    return candidates

async def process_and_persist_alerts(
    db: AsyncSession,
    device_id: str,
    power_voltage: Optional[float],
    ignition: bool,
    speed_kmh: float,
    motion: bool,
    timestamp: datetime,
    speed_limit_kmh: float = 100.0
) -> List[VehicleAlert]:
    """
    Evalúa candidatos, aplica anti-flapping (throttle de 15 min),
    persiste en base de datos y emite broadcast en tiempo real.
    """
    candidates = evaluate_alert_rules(
        device_id=device_id,
        power_voltage=power_voltage,
        ignition=ignition,
        speed_kmh=speed_kmh,
        motion=motion,
        timestamp=timestamp,
        speed_limit_kmh=speed_limit_kmh
    )

    if not candidates:
        return []

    created_alerts: List[VehicleAlert] = []
    throttle_threshold = timestamp - timedelta(minutes=THROTTLE_MINUTES)

    for item in candidates:
        # Verificar si ya existe una alerta activa o reciente del mismo tipo
        check_q = select(VehicleAlert).where(
            and_(
                VehicleAlert.device_id == device_id,
                VehicleAlert.alert_type == item["alert_type"],
                VehicleAlert.resolved == False,
                VehicleAlert.timestamp >= throttle_threshold
            )
        ).order_by(desc(VehicleAlert.timestamp)).limit(1)

        res = await db.execute(check_q)
        recent_active = res.scalars().first()

        if recent_active:
            # Throttle activo: omitir duplicado consecutivo
            continue

        alert = VehicleAlert(
            device_id=device_id,
            alert_type=item["alert_type"],
            severity=item["severity"],
            timestamp=item["timestamp"],
            message=item["message"],
            value=item["value"],
            resolved=False
        )
        db.add(alert)
        created_alerts.append(alert)

        # Broadcast SSE en tiempo real
        try:
            await live_manager.broadcast({
                "id": f"alert_{device_id}_{int(timestamp.timestamp())}_{item['alert_type']}",
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "kind": "ALERT",
                "severity": item["severity"],
                "imei": device_id,
                "message": f"🚨 [{item['severity']}] {device_id}: {item['message']}",
                "details": {
                    "device_id": device_id,
                    "alert_type": item["alert_type"],
                    "severity": item["severity"],
                    "value": item["value"]
                }
            })
        except Exception as e:
            logger.warning(f"Error emitiendo broadcast de alerta {item['alert_type']}: {e}")

    if created_alerts:
        logger.info(f"[ALERTS] Creadas {len(created_alerts)} alertas operativas para {device_id}")

    return created_alerts
