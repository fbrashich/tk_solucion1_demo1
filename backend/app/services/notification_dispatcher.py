"""
Servicio de Despacho Multicanal de Notificaciones (Sprint 1 - plan_v4.md)
Canales:
1. Telegram Bot API (Canal Primario de Alta Prioridad, latencia < 800ms, costo $0 USD)
2. Registro de Auditoría Local / Syslog
"""
import os
import logging
import asyncio
import urllib.request
import urllib.parse
import json
from datetime import datetime, timezone

logger = logging.getLogger("notification_dispatcher")

# Credenciales de Telegram (Variables de entorno con fallback configurable)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
DASHBOARD_PUBLIC_URL = os.getenv("DASHBOARD_PUBLIC_URL", "http://localhost:5173")


def format_telegram_alert(alert_type: str, severity: str, device_name: str, device_id: str, message: str, value: float = None) -> str:
    """Genera plantilla HTML enriquecida con emojis para alertas de telemetría"""
    emoji = "🚨" if severity == "CRITICAL" else "⚠️"
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")

    val_str = f"\n<b>Valor Registrado:</b> <code>{value}</code>" if value is not None else ""

    html = (
        f"{emoji} <b>ALERTA DE SEGURIDAD - {severity}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Vehículo:</b> {device_name} (<code>{device_id}</code>)\n"
        f"<b>Tipo:</b> <code>{alert_type}</code>\n"
        f"<b>Detalle:</b> {message}{val_str}\n"
        f"<b>Fecha/Hora:</b> {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🔗 <a href=\"{DASHBOARD_PUBLIC_URL}/?device={device_id}\">Ver en Plataforma</a>"
    )
    return html


def format_telegram_geofence(event_type: str, geofence_name: str, device_name: str, device_id: str, speed_kmh: float = 0.0, duration_seconds: int = None) -> str:
    """Genera plantilla HTML para eventos de geocercas (Ingreso, Egreso, Exceso de Velocidad)"""
    if event_type == "ENTER":
        emoji = "📍"
        titulo = "INGRESO A ZONA SEGURA"
        extra = ""
    elif event_type == "EXIT":
        emoji = "📤"
        titulo = "EGRESO DE ZONA SEGURA"
        if duration_seconds is not None:
            mins = duration_seconds // 60
            hrs = mins // 60
            rem_mins = mins % 60
            tiempo_str = f"{hrs}h {rem_mins}m" if hrs > 0 else f"{mins} min"
            extra = f"\n<b>Tiempo de Permanencia:</b> {tiempo_str}"
        else:
            extra = ""
    elif event_type == "OVERSPEED":
        emoji = "⛔"
        titulo = "EXCESO DE VELOCIDAD EN ZONA"
        extra = f"\n<b>Velocidad Registrada:</b> {speed_kmh:.1f} km/h"
    else:
        emoji = "🔔"
        titulo = f"EVENTO GEOCERCA ({event_type})"
        extra = ""

    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")

    html = (
        f"{emoji} <b>CONTROL DE GEOCERCAS - {titulo}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Zona:</b> {geofence_name}\n"
        f"<b>Vehículo:</b> {device_name} (<code>{device_id}</code>)\n"
        f"<b>Velocidad:</b> {speed_kmh:.1f} km/h{extra}\n"
        f"<b>Fecha/Hora:</b> {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🔗 <a href=\"{DASHBOARD_PUBLIC_URL}/?device={device_id}\">Ver Mapa en Vivo</a>"
    )
    return html


def format_telegram_schedule_violation(device_name: str, device_id: str, message: str) -> str:
    """Genera plantilla HTML para alertas de uso no autorizado fuera de horario"""
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")
    html = (
        f"🌙 <b>ALERTA: ACTIVIDAD FUERA DE HORARIO OPERATIVO</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Vehículo:</b> {device_name} (<code>{device_id}</code>)\n"
        f"<b>Detalle:</b> {message}\n"
        f"<b>Fecha/Hora:</b> {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🔗 <a href=\"{DASHBOARD_PUBLIC_URL}/?device={device_id}\">Auditar Recorrido</a>"
    )
    return html


def _send_telegram_sync(text: str, parse_mode: str = "HTML") -> bool:
    """Transmite de manera sincrónica el payload HTTP a Telegram Bot API"""
    token = TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = TELEGRAM_CHAT_ID or os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        logger.debug("[TELEGRAM DISPATCH] No configurado TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID. Mensaje omitido.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            if resp.status == 200:
                logger.info(f"[TELEGRAM DISPATCH] Notificación enviada con éxito a chat_id={chat_id}")
                return True
            else:
                logger.warning(f"[TELEGRAM DISPATCH] Respuesta no esperada: HTTP {resp.status}")
                return False
    except Exception as e:
        logger.warning(f"[TELEGRAM DISPATCH] Error de comunicación con Telegram API: {e}")
        return False


async def async_dispatch_telegram(text: str):
    """Envoltura asíncrona no bloqueante ejecutada en el loop de eventos"""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, _send_telegram_sync, text)
    except Exception as e:
        logger.warning(f"[ASYNC TELEGRAM] Fallo en despacho asíncrono: {e}")


def dispatch_alert(alert_type: str, severity: str, device_name: str, device_id: str, message: str, value: float = None):
    """Punto de entrada para despachar alertas operativas"""
    html = format_telegram_alert(alert_type, severity, device_name, device_id, message, value)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(async_dispatch_telegram(html))
    except RuntimeError:
        # Si no hay loop en ejecución (ej: scripts sincrónicos de prueba), enviar o registrar
        _send_telegram_sync(html)


def dispatch_geofence_event(event_type: str, geofence_name: str, device_name: str, device_id: str, speed_kmh: float = 0.0, duration_seconds: int = None):
    """Punto de entrada para despachar eventos de geocercas"""
    html = format_telegram_geofence(event_type, geofence_name, device_name, device_id, speed_kmh, duration_seconds)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(async_dispatch_telegram(html))
    except RuntimeError:
        _send_telegram_sync(html)


def dispatch_schedule_alert(device_name: str, device_id: str, message: str):
    """Punto de entrada para despachar alertas de uso no autorizado fuera de horario"""
    html = format_telegram_schedule_violation(device_name, device_id, message)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(async_dispatch_telegram(html))
    except RuntimeError:
        _send_telegram_sync(html)


def format_telegram_engine_command(action: str, status: str, device_name: str, device_id: str, user_email: str, speed_kmh: float = None, notes: str = None) -> str:
    """Genera plantilla HTML para comandos de inmovilización y restablecimiento de motor"""
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")

    if action == "CUT":
        if status == "EXECUTED":
            emoji = "🛑"
            title = "INMOVILIZADOR REMOTO ACTIVADO"
            desc = "El motor ha sido cortado exitosamente vía relé Dout1."
        elif status == "QUEUED_SAFE_STOP":
            emoji = "⏳"
            title = "SAFETY INTERLOCK: CORTE ENCOLADO"
            desc = f"Vehículo en movimiento ({speed_kmh:.1f} km/h). El corte se ejecutará de forma segura cuando la velocidad baje a ≤ 5.0 km/h."
        else:
            emoji = "⚠️"
            title = f"INMOVILIZADOR: ESTADO {status}"
            desc = f"Operación de corte con estado {status}."
    else: # RESTORE
        emoji = "🟢"
        title = "MOTOR RESTABLECIDO"
        desc = "La salida digital Dout1 ha sido desactivada. La unidad está autorizada para el arranque normal."

    notes_str = f"\n<b>Notas:</b> {notes}" if notes else ""
    spd_str = f"\n<b>Velocidad al Momento:</b> {speed_kmh:.1f} km/h" if speed_kmh is not None else ""

    html = (
        f"{emoji} <b>SEGURIDAD ANTI-ROBO - {title}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Vehículo:</b> {device_name} (<code>{device_id}</code>)\n"
        f"<b>Operador:</b> {user_email}\n"
        f"<b>Detalle:</b> {desc}{spd_str}{notes_str}\n"
        f"<b>Fecha/Hora:</b> {now_str}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🔗 <a href=\"{DASHBOARD_PUBLIC_URL}/?device={device_id}\">Ver en Plataforma</a>"
    )
    return html


def dispatch_engine_command(action: str, status: str, device_name: str, device_id: str, user_email: str, speed_kmh: float = None, notes: str = None):
    """Punto de entrada para despachar notificaciones de corte/restablecimiento de motor"""
    html = format_telegram_engine_command(action, status, device_name, device_id, user_email, speed_kmh, notes)
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(async_dispatch_telegram(html))
    except RuntimeError:
        _send_telegram_sync(html)
