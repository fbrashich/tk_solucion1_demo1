import time
import json
import math
import datetime
import urllib.request
import urllib.error

API_URL = "http://localhost:3000/api/ingest"

# Dispositivos de la flota a simular en paralelo
DEVICES = [
    {
        "device_id": "MESA_01",
        "name": "Mesa Vibratoria Principal",
        "lat_base": -31.5300,
        "lon_base": -68.5200,
        "cycle_period": 25,
        "on_cycles": 20
    },
    {
        "device_id": "MESA_02",
        "name": "Mesa Clasificadora 02",
        "lat_base": -31.5420,
        "lon_base": -68.5350,
        "cycle_period": 20,
        "on_cycles": 14
    }
]

print("=" * 60)
print("INICIANDO SIMULADOR IOT MULTI-DISPOSITIVO")
print(f"Apuntando a: {API_URL} (Proxy Nginx)")
print(f"Equipos simulados: {', '.join([d['device_id'] for d in DEVICES])}")
print("=" * 60)

def send_payload(payload):
    try:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            API_URL,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.getcode() == 200
    except Exception as e:
        return False

step = 0
try:
    while True:
        now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        for dev in DEVICES:
            lat_offset = math.sin((step + (hash(dev['device_id']) % 10)) / 10.0) * 0.008
            lon_offset = math.cos((step + (hash(dev['device_id']) % 10)) / 10.0) * 0.008
            
            ignition = (step % dev["cycle_period"]) < dev["on_cycles"]

            payload = {
                "device_id": dev["device_id"],
                "lat": dev["lat_base"] + lat_offset,
                "lon": dev["lon_base"] + lon_offset,
                "ignition": ignition,
                "timestamp": now_utc
            }

            ok = send_payload(payload)
            status_tag = "ON " if ignition else "OFF"
            result_tag = "OK" if ok else "ERR"
            print(f"[{step}] {dev['device_id']} ({status_tag}) -> {result_tag} | GPS: {payload['lat']:.4f}, {payload['lon']:.4f}")

        step += 1
        time.sleep(5)

except KeyboardInterrupt:
    print("\nSimulador multi-dispositivo detenido.")
