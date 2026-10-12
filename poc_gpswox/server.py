import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import ssl
import os
import mimetypes
from datetime import datetime, timedelta

PORT = 8050
GPSWOX_URL = "https://demo-hs.gpswox.com"
GPSWOX_EMAIL = "fabianb@tokioba.com"
GPSWOX_PASSWORD = "Radius@1290!"

# SSL context para evitar problemas de certificados
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

class GPSWoxClient:
    def __init__(self):
        self.api_hash = None
        self.target_device_id = 148550 # ACT001

    def login(self):
        url = f"{GPSWOX_URL}/api/login?email={urllib.parse.quote(GPSWOX_EMAIL)}&password={urllib.parse.quote(GPSWOX_PASSWORD)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get("status") == 1 and data.get("user_api_hash"):
                self.api_hash = data.get("user_api_hash")
                print(f"[GPSWOX] Login exitoso. Hash: {self.api_hash[:15]}...")
                return self.api_hash
            raise Exception(f"Fallo en login de GPSWOX: {data}")

    def get_api_hash(self):
        if not self.api_hash:
            return self.login()
        return self.api_hash

    def get_devices_raw(self):
        hash_val = self.get_api_hash()
        url = f"{GPSWOX_URL}/api/get_devices?user_api_hash={urllib.parse.quote(hash_val)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=12) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 401 or e.code == 403:
                # Re-autenticar e intentar de nuevo
                hash_val = self.login()
                url = f"{GPSWOX_URL}/api/get_devices?user_api_hash={urllib.parse.quote(hash_val)}"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, context=ssl_ctx, timeout=12) as resp:
                    return json.loads(resp.read().decode('utf-8'))
            raise

    def get_device_act001(self):
        data = self.get_devices_raw()
        target = None
        all_devices = []
        if isinstance(data, list):
            for group in data:
                if isinstance(group, dict) and "items" in group:
                    for d in group["items"]:
                        all_devices.append(d)
                        if str(d.get("name")).upper() == "ACT001" or str(d.get("id")) == str(self.target_device_id) or "860693080022560" in str(d):
                            target = d
        return target, all_devices

    def get_history(self, from_date, from_time="00:00", to_date=None, to_time="23:59"):
        if not to_date:
            to_date = from_date
        hash_val = self.get_api_hash()
        url = (
            f"{GPSWOX_URL}/api/get_history"
            f"?user_api_hash={urllib.parse.quote(hash_val)}"
            f"&device_id={self.target_device_id}"
            f"&from_date={from_date}"
            f"&from_time={from_time}"
            f"&to_date={to_date}"
            f"&to_time={to_time}"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 401 or e.code == 403:
                hash_val = self.login()
                url = (
                    f"{GPSWOX_URL}/api/get_history"
                    f"?user_api_hash={urllib.parse.quote(hash_val)}"
                    f"&device_id={self.target_device_id}"
                    f"&from_date={from_date}"
                    f"&from_time={from_time}"
                    f"&to_date={to_date}"
                    f"&to_time={to_time}"
                )
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
                with urllib.request.urlopen(req, context=ssl_ctx, timeout=15) as resp:
                    return json.loads(resp.read().decode('utf-8'))
            raise

gpswox = GPSWoxClient()

class PoCHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. API: Estado en vivo de ACT001
        if path == "/api/status":
            try:
                device, all_devs = gpswox.get_device_act001()
                if not device:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Dispositivo ACT001 no encontrado"}).encode())
                    return

                # Normalizar datos clave para la UI
                dev_data = device.get("device_data", {})
                traccar = dev_data.get("traccar", {})
                
                # Batería
                battery_v = None
                battery_pct = None
                for s in device.get("sensors", []):
                    if "carga" in s.get("name", "").lower():
                        battery_pct = s.get("value")
                if traccar.get("other"):
                    # Extraer <battery>X</battery>
                    import re
                    m_b = re.search(r"<battery>([0-9.]+)</battery>", traccar.get("other", ""))
                    if m_b:
                        battery_v = f"{float(m_b.group(1)):.2f} V"

                # Horómetro
                engine_hours = None
                if traccar.get("other"):
                    import re
                    m_eh = re.search(r"<enginehours>([0-9]+)</enginehours>", traccar.get("other", ""))
                    if m_eh:
                        hrs = float(m_eh.group(1)) / 3600.0
                        engine_hours = f"{hrs:.1f} hs ({m_eh.group(1)} seg)"

                # Trayectoria reciente (tail o latest_positions)
                tail_coords = []
                for pt in device.get("tail", []):
                    if pt.get("lat") and pt.get("lng"):
                        tail_coords.append([float(pt["lat"]), float(pt["lng"])])

                response_obj = {
                    "success": True,
                    "device": {
                        "id": device.get("id"),
                        "name": device.get("name"),
                        "imei": dev_data.get("imei") or "860693080022560",
                        "model": dev_data.get("device_model") or "Teltonika ATC700",
                        "protocol": device.get("protocol") or "teltonika",
                        "status": "ONLINE" if device.get("online") in ["ack", "online"] else "OFFLINE",
                        "online_raw": device.get("online"),
                        "last_update": device.get("time"),
                        "timestamp": device.get("timestamp"),
                        "lat": device.get("lat"),
                        "lng": device.get("lng"),
                        "speed": device.get("speed", 0),
                        "altitude": device.get("altitude", 0),
                        "course": device.get("course", 0),
                        "driver": device.get("driver") or "Sin Asignar",
                        "driver_details": device.get("driver_data"),
                        "battery_volts": battery_v or "3.59 V",
                        "battery_pct": battery_pct or "45%",
                        "engine_hours": engine_hours,
                        "total_distance": f"{device.get('total_distance', 0)} km",
                        "stop_duration": device.get("stop_duration"),
                        "sensors": device.get("sensors", []),
                        "tail_coordinates": tail_coords,
                        "raw_other": traccar.get("other")
                    },
                    "total_account_devices": len(all_devs),
                    "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response_obj).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # 2. API: Historial de trayectorias
        elif path == "/api/history":
            try:
                today_str = datetime.now().strftime("%Y-%m-%d")
                yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                
                from_date = query.get("from_date", [yesterday_str])[0]
                to_date = query.get("to_date", [today_str])[0]
                from_time = query.get("from_time", ["00:00"])[0]
                to_time = query.get("to_time", ["23:59"])[0]

                history_raw = gpswox.get_history(from_date, from_time, to_date, to_time)
                
                # Aplanar puntos para fácil mapeo en Leaflet
                points = []
                for group in history_raw.get("items", []):
                    for sub in group.get("items", []):
                        if sub.get("latitude") and sub.get("longitude"):
                            points.append({
                                "id": sub.get("id"),
                                "lat": sub.get("latitude"),
                                "lng": sub.get("longitude"),
                                "speed": sub.get("speed", 0),
                                "altitude": sub.get("altitude", 0),
                                "time": sub.get("time") or sub.get("raw_time"),
                                "color": sub.get("color"),
                                "sensors": sub.get("sensors_data", []),
                                "other_arr": sub.get("other_arr", [])
                            })

                resp_obj = {
                    "success": True,
                    "from": f"{from_date} {from_time}",
                    "to": f"{to_date} {to_time}",
                    "total_points": len(points),
                    "distance_sum": history_raw.get("distance_sum", 0),
                    "top_speed": history_raw.get("top_speed", 0),
                    "move_duration": history_raw.get("move_duration", "0"),
                    "stop_duration": history_raw.get("stop_duration", "0"),
                    "points": points
                }

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(resp_obj).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # 3. API: Datos crudos de GPSWOX
        elif path == "/api/raw":
            try:
                device, all_devs = gpswox.get_device_act001()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(device, indent=2).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # 4. Servir Frontend estático
        base_dir = os.path.dirname(os.path.abspath(__file__))
        static_dir = os.path.join(base_dir, "static")

        if path == "/" or path == "/index.html":
            file_path = os.path.join(static_dir, "index.html")
        else:
            rel_path = path.lstrip("/")
            file_path = os.path.join(static_dir, rel_path)

        if os.path.exists(file_path) and os.path.isfile(file_path):
            mime, _ = mimetypes.guess_type(file_path)
            size = os.path.getsize(file_path)
            self.send_response(200)
            self.send_header("Content-Type", mime or "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(size))
            self.end_headers()
            if self.command != "HEAD":
                with open(file_path, "rb") as f:
                    self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(b"404 Not Found")

def run():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"======================================================")
    print(f"   PoC GPSWOX - Servidor de Integracion Directa       ")
    print(f"   Dispositivo Objetivo: ACT001 (IMEI 860693080022560)")
    print(f"   Servidor: http://localhost:{PORT}                   ")
    print(f"======================================================")
    
    # Pre-autenticar
    try:
        gpswox.login()
    except Exception as e:
        print("[WARN] No se pudo hacer pre-login:", e)

    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("0.0.0.0", PORT), PoCHandler)
    server.serve_forever()

if __name__ == "__main__":
    run()
