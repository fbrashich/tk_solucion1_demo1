import urllib.request
import urllib.parse
import json

BASE_URL = "http://localhost:8000/api"

def main():
    print("=== TEST 1: LOGIN OPERADOR (aldo) ===")
    login_data = urllib.parse.urlencode({"username": "aldo", "password": "aldo123"}).encode()
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read().decode())
        token = tokens["access_token"]
        print("Login OK. Token recibido.")

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    print("\n=== TEST 2: LISTAR DISPOSITIVOS DEL OPERADOR ===")
    req = urllib.request.Request(f"{BASE_URL}/devices", headers=headers)
    with urllib.request.urlopen(req) as resp:
        devs = json.loads(resp.read().decode())
        print(f"Total dispositivos: {len(devs)}")
        for d in devs:
            print(f" - [{d['device_id']}] {d['name']} | IMEI: {d.get('traccar_unique_id')} | Modelo: {d.get('traccar_model')}")

    print("\n=== TEST 3: ESTADO DEL TELTONIKA ATC700 (ATC700_01) ===")
    req = urllib.request.Request(f"{BASE_URL}/devices/ATC700_01/status", headers=headers)
    with urllib.request.urlopen(req) as resp:
        status = json.loads(resp.read().decode())
        print("Estado:", status["status"])
        print("Coordenadas:", status["last_lat"], status["last_lon"])
        print("Velocidad:", status["last_speed"], "km/h")
        print("Horómetro:", status["engine_hours"], "hs")
        raw = status.get("raw_data") or {}
        print("Raw Data presente:", bool(raw))
        print("Atributos:", raw.get("attributes"))

    print("\n=== TEST 4: HISTORIAL DE EVENTOS / LOGS ===")
    req = urllib.request.Request(f"{BASE_URL}/devices/ATC700_01/logs?limit=5", headers=headers)
    with urllib.request.urlopen(req) as resp:
        logs = json.loads(resp.read().decode())
        print(f"Total logs: {len(logs)}")
        for l in logs:
            print(f" - Evento #{l['id']}: Time={l['timestamp']} Lat={l['latitude']} Lon={l['longitude']} Speed={l.get('speed')} RawData={bool(l.get('raw_data'))}")

    print("\n=== TODOS LOS TESTS PASARON EXITOSAMENTE ===")

if __name__ == "__main__":
    main()
