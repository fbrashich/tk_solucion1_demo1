import asyncio
import json
import logging
import os
import re
from typing import AsyncGenerator, Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger("live_stream")

TRACCAR_LOG_PATH = os.getenv("TRACCAR_LOG_PATH", "/opt/traccar/logs/tracker-server.log")

class LiveStreamManager:
    def __init__(self):
        self._subscribers: List[asyncio.Queue] = []
        self._recent_events: List[Dict[str, Any]] = []
        self._max_recent = 200
        self._tail_task: Optional[asyncio.Task] = None
        self._last_file_pos = 0

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._subscribers:
            self._subscribers.remove(q)

    async def broadcast(self, event: Dict[str, Any]):
        # Guardar en buffer circular de recientes
        self._recent_events.append(event)
        if len(self._recent_events) > self._max_recent:
            self._recent_events.pop(0)

        # Enviar a todos los suscriptores conectados
        dead = []
        for q in self._subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
            except Exception:
                dead.append(q)
        for d in dead:
            self.unsubscribe(d)

    def get_recent(self, limit: int = 50, filter_text: Optional[str] = None) -> List[Dict[str, Any]]:
        events = list(self._recent_events)
        if filter_text:
            ft = filter_text.strip().lower()
            events = [
                e for e in events 
                if ft in json.dumps(e).lower()
            ]
        return events[-limit:]

    def parse_log_line(self, line: str) -> Optional[Dict[str, Any]]:
        line = line.strip()
        if not line or len(line) < 20:
            return None

        # Ejemplo formato Traccar: 2026-10-21 16:46:08  INFO: [Uc5dc98cd: teltonika < 172.18.0.1] 006d...
        time_part = line[:19]
        rest = line[20:].strip()

        kind = "INFO"
        channel = "SYSTEM"
        socket_id = ""
        imei = None
        message = rest
        details = {}

        if "INFO: [" in rest:
            match = re.search(r"INFO:\s*\[([^\]]+)\]\s*(.*)", rest)
            if match:
                tag = match.group(1).strip()
                content = match.group(2).strip()

                # Tag contiene [Txxxxxxxx: teltonika < 10.9.0.1]
                parts = tag.split(":")
                socket_id = parts[0].strip()
                if socket_id.startswith("T"):
                    channel = "TCP"
                elif socket_id.startswith("U"):
                    channel = "UDP"

                if "<" in tag:
                    # Paquete entrante
                    kind = "RAW_IN"
                    source_ip = tag.split("<")[-1].strip()
                    message = f"Trama cruda recibida ({len(content)//2} bytes) desde {source_ip}"
                    details = {"hex": content, "source": source_ip, "channel": channel}
                    # Verificar si contiene IMEI Teltonika estándar (3836...)
                    imei_match = re.search(r"000f([0-9a-fA-F]{30})", content)
                    if imei_match:
                        try:
                            imei_str = bytes.fromhex(imei_match.group(1)).decode('ascii', errors='ignore')
                            if imei_str.isdigit() and len(imei_str) == 15:
                                imei = imei_str
                                kind = "HANDSHAKE"
                                message = f"Handshake Teltonika IMEI: {imei} ({channel})"
                        except Exception:
                            pass
                    elif "3836" in content:
                        # Buscar patrón de IMEI que empiece con 86 (hex 3836)
                        sub_idx = content.find("3836")
                        if sub_idx >= 0 and len(content) >= sub_idx + 30:
                            candidate_hex = content[sub_idx:sub_idx+30]
                            try:
                                candidate = bytes.fromhex(candidate_hex).decode('ascii', errors='ignore')
                                if candidate.isdigit() and len(candidate) == 15:
                                    imei = candidate
                            except Exception:
                                pass

                elif ">" in tag:
                    kind = "ACK_OUT"
                    dest_ip = tag.split(">")[-1].strip()
                    message = f"ACK enviado hacia {dest_ip}: {content}"
                    details = {"hex": content, "dest": dest_ip, "channel": channel}
                elif content.startswith("connected"):
                    kind = "CONNECTED"
                    message = f"Socket {channel} abierto ({socket_id})"
                elif content.startswith("disconnected"):
                    kind = "DISCONNECTED"
                    message = f"Socket {channel} cerrado ({socket_id})"
                elif content.startswith("timed out"):
                    kind = "TIMEOUT"
                    message = f"Socket {channel} tiempo de espera agotado ({socket_id})"
                elif content.startswith("id:"):
                    # Posición decodificada
                    kind = "GPS_FIX"
                    message = f"Posición GPS: {content}"
                    id_match = re.search(r"id:\s*([0-9]+)", content)
                    if id_match:
                        imei = id_match.group(1)
                    lat_match = re.search(r"lat:\s*([-\d\.]+)", content)
                    lon_match = re.search(r"lon:\s*([-\d\.]+)", content)
                    speed_match = re.search(r"speed:\s*([-\d\.]+)", content)
                    details = {
                        "imei": imei,
                        "latitude": float(lat_match.group(1)) if lat_match else None,
                        "longitude": float(lon_match.group(1)) if lon_match else None,
                        "speed_knots": float(speed_match.group(1)) if speed_match else 0.0,
                        "speed_kmh": round(float(speed_match.group(1)) * 1.852, 1) if speed_match else 0.0,
                    }
                else:
                    message = f"[{socket_id}] {content}"

        elif "Event id:" in rest:
            kind = "EVENT"
            ev_match = re.search(r"Event id:\s*([0-9]+),\s*time:\s*([^,]+),\s*type:\s*([^,]+)", rest)
            if ev_match:
                imei = ev_match.group(1)
                ev_type = ev_match.group(3).strip()
                message = f"Evento '{ev_type}' para dispositivo {imei}"
                details = {"imei": imei, "event_type": ev_type}

        return {
            "id": f"{time_part}_{hash(line) & 0xffffff}",
            "timestamp": time_part,
            "kind": kind,
            "channel": channel,
            "socket_id": socket_id,
            "imei": imei,
            "message": message,
            "details": details,
            "raw": line
        }

    async def _tail_loop(self):
        logger.info(f"[LIVE STREAM] Iniciando monitoreo de archivo {TRACCAR_LOG_PATH}...")
        
        # Esperar hasta que el archivo exista
        while not os.path.exists(TRACCAR_LOG_PATH):
            await asyncio.sleep(3.0)

        try:
            with open(TRACCAR_LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
                # Cargar las últimas líneas iniciales
                f.seek(0, os.SEEK_END)
                size = f.tell()
                # Leer últimos 30 KB iniciales
                read_size = min(size, 30720)
                f.seek(size - read_size, os.SEEK_SET)
                initial_lines = f.readlines()
                for l in initial_lines[-60:]:
                    parsed = self.parse_log_line(l)
                    if parsed:
                        self._recent_events.append(parsed)
                if len(self._recent_events) > self._max_recent:
                    self._recent_events = self._recent_events[-self._max_recent:]

                # Ciclo continuo de tailing
                while True:
                    line = f.readline()
                    if line:
                        parsed = self.parse_log_line(line)
                        if parsed:
                            await self.broadcast(parsed)
                    else:
                        # Si no hay nuevas líneas, pausar brevemente
                        await asyncio.sleep(0.4)
        except asyncio.CancelledError:
            logger.info("[LIVE STREAM] Monitoreo de archivo cancelado.")
        except Exception as e:
            logger.error(f"[LIVE STREAM] Error en tail_loop: {e}")

    def start(self):
        if self._tail_task is None or self._tail_task.done():
            self._tail_task = asyncio.create_task(self._tail_loop())

    def stop(self):
        if self._tail_task and not self._tail_task.done():
            self._tail_task.cancel()

live_manager = LiveStreamManager()
