import asyncio
import logging
import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from sqlalchemy.future import select
from sqlalchemy import desc

from app.db import AsyncSessionLocal
from app.models.models import Device, TelemetryEvent, DeviceState

logger = logging.getLogger("traccar_sync")
logging.basicConfig(level=logging.INFO)

TRACCAR_URL = os.getenv("TRACCAR_URL", "https://demo4.traccar.org").rstrip("/")
TRACCAR_EMAIL = os.getenv("TRACCAR_EMAIL", "fabianb@tokioba.com")
TRACCAR_PASSWORD = os.getenv("TRACCAR_PASSWORD", "Radius@1290!")
TRACCAR_TOKEN = os.getenv("TRACCAR_TOKEN", "")
SYNC_INTERVAL = int(os.getenv("TRACCAR_SYNC_INTERVAL", "5"))

def parse_iso_datetime(dt_str: str) -> datetime:
    if not dt_str:
        return datetime.now(timezone.utc)
    try:
        clean_str = dt_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)

class TraccarSynchronizer:
    def __init__(self):
        self.cookie_jar = urllib.request.HTTPCookieProcessor()
        self.opener = urllib.request.build_opener(self.cookie_jar)
        self.device_map: dict[int, str] = {} # traccar_dev_id -> uniqueId (IMEI)
        self.device_name_map: dict[int, str] = {}
        self.is_running = False

    def _sync_request(self, path: str, method: str = "GET", data: dict = None) -> tuple[int, any]:
        url = f"{TRACCAR_URL}{path}"
        headers = {
            "User-Agent": "TK-Telemetry-Sync/1.0",
            "Accept": "application/json"
        }
        encoded_data = None
        if data is not None:
            encoded_data = urllib.parse.urlencode(data).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"

        req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=10) as resp:
                status_code = resp.getcode()
                body = resp.read().decode("utf-8")
                try:
                    parsed_json = json.loads(body)
                except Exception:
                    parsed_json = body
                return status_code, parsed_json
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", errors="ignore")
        except Exception as e:
            logger.error(f"[TRACCAR SYNC] Error de red hacia {url}: {e}")
            return 0, None

    async def authenticate(self) -> bool:
        def do_auth():
            return self._sync_request(
                "/api/session",
                method="POST",
                data={"email": TRACCAR_EMAIL, "password": TRACCAR_PASSWORD}
            )

        status, body = await asyncio.to_thread(do_auth)
        if status == 200:
            logger.info(f"[TRACCAR SYNC] Autenticación exitosa en {TRACCAR_URL} con usuario {TRACCAR_EMAIL}")
            return True
        else:
            logger.error(f"[TRACCAR SYNC] Error de autenticación (HTTP {status}): {body}")
            return False

    async def refresh_devices(self) -> bool:
        def do_get_devices():
            return self._sync_request("/api/devices")

        status, devices = await asyncio.to_thread(do_get_devices)
        if status == 401:
            if await self.authenticate():
                status, devices = await asyncio.to_thread(do_get_devices)
            else:
                return False

        if status == 200 and isinstance(devices, list):
            self.device_map = {d["id"]: str(d["uniqueId"]) for d in devices if "id" in d and "uniqueId" in d}
            self.device_name_map = {d["id"]: d.get("name", "Desconocido") for d in devices if "id" in d}
            logger.info(f"[TRACCAR SYNC] Dispositivos sincronizados desde Traccar: {self.device_map}")
            return True
        else:
            logger.warning(f"[TRACCAR SYNC] No se pudo obtener lista de dispositivos: HTTP {status}")
            return False

    async def sync_positions(self):
        def do_get_positions():
            return self._sync_request("/api/positions")

        status, positions = await asyncio.to_thread(do_get_positions)
        if status == 401:
            if await self.authenticate():
                status, positions = await asyncio.to_thread(do_get_positions)
            else:
                return

        if status != 200 or not isinstance(positions, list):
            return

        async with AsyncSessionLocal() as db:
            for pos in positions:
                traccar_dev_id = pos.get("deviceId")
                unique_id = self.device_map.get(traccar_dev_id)
                if not unique_id:
                    continue

                # Buscar en nuestro catálogo por traccar_unique_id o device_id
                dev_query = await db.execute(
                    select(Device).where(
                        (Device.traccar_unique_id == unique_id) | (Device.device_id == unique_id)
                    )
                )
                local_device = dev_query.scalars().first()
                if not local_device:
                    continue

                # Extraer datos telemáticos
                lat = float(pos.get("latitude", 0.0))
                lon = float(pos.get("longitude", 0.0))
                speed = float(pos.get("speed", 0.0))
                altitude = float(pos.get("altitude", 0.0))
                course = float(pos.get("course", 0.0))
                attrs = pos.get("attributes", {}) or {}

                # Detección de ignición para Teltonika
                ignition = bool(attrs.get("ignition", attrs.get("motion", False)))

                fix_time = parse_iso_datetime(pos.get("fixTime") or pos.get("deviceTime") or pos.get("serverTime"))

                # Verificar si ya guardamos este evento exacto
                last_ev_query = await db.execute(
                    select(TelemetryEvent)
                    .where(TelemetryEvent.device_id == local_device.device_id)
                    .order_by(desc(TelemetryEvent.timestamp))
                    .limit(1)
                )
                last_event = last_ev_query.scalars().first()

                if last_event and last_event.timestamp == fix_time:
                    continue

                # Horómetro
                delta_hours = 0.0
                if last_event:
                    delta_seconds = (fix_time - last_event.timestamp.astimezone(timezone.utc)).total_seconds()
                    if delta_seconds > 0 and last_event.ignition_state and delta_seconds <= 86400:
                        delta_hours = delta_seconds / 3600.0

                # 1. Registrar TelemetryEvent guardando 100% de la carga de Traccar (raw_data)
                new_event = TelemetryEvent(
                    device_id=local_device.device_id,
                    latitude=lat,
                    longitude=lon,
                    ignition_state=ignition,
                    speed=speed,
                    altitude=altitude,
                    course=course,
                    timestamp=fix_time,
                    raw_data=pos
                )
                db.add(new_event)

                # 2. Actualizar DeviceState consolidado
                state_query = await db.execute(
                    select(DeviceState).where(DeviceState.device_id == local_device.device_id)
                )
                dev_state = state_query.scalars().first()

                if not dev_state:
                    dev_state = DeviceState(
                        device_id=local_device.device_id,
                        engine_hours=delta_hours,
                        last_ignition_state=ignition,
                        last_ignition_on_time=fix_time if ignition else None,
                        last_updated=fix_time,
                        last_latitude=lat,
                        last_longitude=lon,
                        last_speed=speed,
                        last_raw_data=pos
                    )
                    db.add(dev_state)
                else:
                    dev_state.engine_hours += delta_hours
                    dev_state.last_ignition_state = ignition
                    if ignition:
                        dev_state.last_ignition_on_time = fix_time
                    else:
                        dev_state.last_ignition_on_time = None
                    dev_state.last_updated = fix_time
                    dev_state.last_latitude = lat
                    dev_state.last_longitude = lon
                    dev_state.last_speed = speed
                    dev_state.last_raw_data = pos

                await db.commit()
                logger.info(
                    f"[TRACCAR SYNC] Telemetría guardada para {local_device.name} ({unique_id}): "
                    f"Lat={lat}, Lon={lon}, Speed={speed} km/h, Ignición={ignition}, Batería={attrs.get('battery')}"
                )

    async def run_loop(self):
        self.is_running = True
        logger.info("[TRACCAR SYNC] Iniciando sincronizador de Traccar...")
        authenticated = await self.authenticate()
        if authenticated:
            await self.refresh_devices()

        device_refresh_counter = 0

        while self.is_running:
            try:
                device_refresh_counter += 1
                if device_refresh_counter >= 12:
                    device_refresh_counter = 0
                    await self.refresh_devices()

                await self.sync_positions()
            except Exception as e:
                logger.error(f"[TRACCAR SYNC] Error en ciclo: {e}")

            await asyncio.sleep(SYNC_INTERVAL)

    def stop(self):
        self.is_running = False

synchronizer = TraccarSynchronizer()
