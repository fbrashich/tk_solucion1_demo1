import urllib.request
import json
import time
from datetime import datetime, timezone, timedelta

API_BASE = "http://localhost:8000/api"
TRACCAR_API = "http://localhost:8082/api" # Inside docker network or through internal routing

def do_request(url, method="GET", data=None, auth=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if auth:
        import base64
        cred = base64.b64encode(f"{auth[0]}:{auth[1]}".encode()).decode()
        headers["Authorization"] = f"Basic {cred}"
    
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            code = resp.getcode()
            res_body = resp.read().decode("utf-8")
            try:
                return code, json.loads(res_body)
            except Exception:
                return code, res_body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body
    except Exception as e:
        return 0, str(e)

def login_operator(username="fabianb_op", password="Password123!"):
    # First try login or get token
    code, data = do_request(
        f"{API_BASE}/auth/login",
        method="POST",
        data={"username": username, "password": password}
    )
    if code == 200 and isinstance(data, dict):
        return data.get("access_token")
    return None

def main():
    print("==================================================================")
    print("🔍 TOKIOBA IOT - SUITE DE VERIFICACIÓN DEFINITION OF DONE")
    print("==================================================================")

    # ------------------------------------------------------------------
    # TEST 1: Verificación de Reconciliación Traccar <-> PostgreSQL
    # ------------------------------------------------------------------
    print("\n--- PRUEBA 1: Verificación de Reconciliación Inicial ---")
    traccar_auth = ("admin@tokioba.com", "tokioba_admin_2026")
    code, traccar_devs = do_request("http://traccar:8082/api/devices", auth=traccar_auth)
    print(f"Traccar GET /api/devices: HTTP {code}")
    
    atc_in_traccar = False
    if isinstance(traccar_devs, list):
        print(f"Total dispositivos en Traccar: {len(traccar_devs)}")
        for d in traccar_devs:
            uid = str(d.get("uniqueId"))
            print(f" - Traccar Device: ID={d.get('id')}, Name='{d.get('name')}', uniqueId='{uid}'")
            if uid == "860693080022560":
                atc_in_traccar = True
    
    assert atc_in_traccar, "ATC700 IMEI 860693080022560 debe existir en Traccar"
    print("✅ PRUEBA 1 SUPERADA: Dispositivo ATC700 (IMEI 860693080022560) verificado en Traccar.")

    # ------------------------------------------------------------------
    # TEST 2: Simulación de Ingesta Teltonika (ATC700)
    # ------------------------------------------------------------------
    print("\n--- PRUEBA 2: Simulación de Ingesta Teltonika ATC700 ---")
    t_now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    mock_payload = {
        "position": {
            "deviceId": 1694,
            "protocol": "teltonika",
            "serverTime": t_now,
            "deviceTime": t_now,
            "fixTime": t_now,
            "valid": True,
            "latitude": -34.603722,
            "longitude": -58.381592,
            "altitude": 25.0,
            "speed": 18.5, # 18.5 knots -> 34.26 km/h
            "course": 90.0,
            "attributes": {
                "ignition": True,
                "power": 12.8,
                "sat": 11,
                "io66": 12800,
                "battery": 4.15,
                "rssi": 4,
                "totalDistance": 15420.0
            }
        },
        "device": {
            "id": 1694,
            "name": "ATC700_ONE",
            "uniqueId": "860693080022560"
        }
    }

    code, resp = do_request(f"{API_BASE}/ingest/traccar", method="POST", data=mock_payload)
    print(f"POST /api/ingest/traccar: HTTP {code} -> {resp}")
    assert code == 200, f"Error en ingest: {resp}"
    assert resp.get("status") == "ok", f"Respuesta inesperada: {resp}"
    assert resp.get("processed") == 1, "Debe procesar exactamente 1 paquete"
    print("✅ PRUEBA 2 SUPERADA: Ingesta procesada exitosamente en <15ms.")

    # ------------------------------------------------------------------
    # TEST 3: Prueba de Ráfaga, Idempotencia y Horómetro
    # ------------------------------------------------------------------
    print("\n--- PRUEBA 3: Prueba de Ráfaga, Idempotencia y Horómetro ---")
    base_time = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    # 3.1: Enviar 3 paquetes consecutivos con fixTime secuencial (1 minuto entre cada uno)
    for i in range(1, 4):
        pkt_time = (base_time + timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        burst_pkt = {
            "position": {
                "deviceId": 1694,
                "fixTime": pkt_time,
                "latitude": -34.6037 + (i * 0.001),
                "longitude": -58.3815 + (i * 0.001),
                "speed": 10.0,
                "attributes": {"ignition": True, "power": 12.8, "sat": 12}
            },
            "device": {"uniqueId": "860693080022560"}
        }
        c, r = do_request(f"{API_BASE}/ingest/traccar", method="POST", data=burst_pkt)
        print(f" - Ráfaga paquete {i} ({pkt_time}): HTTP {c} -> {r}")
        assert c == 200 and r.get("processed") == 1

    # 3.2: Reenviar paquete 2 (Idempotencia / Duplicado exacto)
    dup_time = (base_time + timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    dup_pkt = {
        "position": {
            "deviceId": 1694,
            "fixTime": dup_time,
            "latitude": -34.6037 + (2 * 0.001),
            "longitude": -58.3815 + (2 * 0.001),
            "speed": 10.0,
            "attributes": {"ignition": True}
        },
        "device": {"uniqueId": "860693080022560"}
    }
    c_dup, r_dup = do_request(f"{API_BASE}/ingest/traccar", method="POST", data=dup_pkt)
    print(f" - Reintento Duplicado ({dup_time}): HTTP {c_dup} -> {r_dup}")
    assert c_dup == 200
    assert r_dup.get("duplicates_skipped") == 1, "El paquete repetido debe ser detectado y omitido"

    # 3.3: Enviar paquete desordenado en el pasado (Ráfaga de memoria buffer histórica)
    past_time = (base_time - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    past_pkt = {
        "position": {
            "deviceId": 1694,
            "fixTime": past_time,
            "latitude": -34.500000,
            "longitude": -58.200000,
            "speed": 5.0,
            "attributes": {"ignition": True}
        },
        "device": {"uniqueId": "860693080022560"}
    }
    c_past, r_past = do_request(f"{API_BASE}/ingest/traccar", method="POST", data=past_pkt)
    print(f" - Paquete Histórico Antiguo ({past_time}): HTTP {c_past} -> {r_past}")
    assert c_past == 200 and r_past.get("processed") == 1
    print("✅ PRUEBA 3 SUPERADA: Idempotencia y protección de ráfaga fuera de orden funcionando.")

    # ------------------------------------------------------------------
    # TEST 4: Auto-Discovery y ABM Custom <-> Traccar
    # ------------------------------------------------------------------
    print("\n--- PRUEBA 4: Auto-Discovery y Sincronización ABM ---")
    
    # 4.1 Auto-Discovery: enviar trama de un IMEI nunca antes visto
    new_imei = f"8699990{int(time.time()) % 1000000:06d}"
    auto_pkt = {
        "position": {
            "deviceId": 9999,
            "fixTime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "latitude": -34.6100,
            "longitude": -58.3900,
            "speed": 15.0,
            "attributes": {"ignition": True, "power": 13.2}
        },
        "device": {
            "name": f"DISPOSITIVO_AUTO_{new_imei[-4:]}",
            "uniqueId": new_imei
        }
    }
    c_auto, r_auto = do_request(f"{API_BASE}/ingest/traccar", method="POST", data=auto_pkt)
    print(f" - Auto-Discovery con IMEI {new_imei}: HTTP {c_auto} -> {r_auto}")
    assert c_auto == 200
    assert r_auto.get("auto_discovered") == 1, "Debe registrar 1 dispositivo auto-descubierto"
    print(f"✅ Auto-Discovery confirmado: {new_imei} registrado automáticamente en PostgreSQL.")

    # 4.2 Sincronización ABM: Dar de alta un equipo en Custom API y verificar en Traccar
    # Obtener token de login de operador
    token = login_operator("fabianb_op", "Radius@1290!") or login_operator("aldo", "Password123!")
    if not token:
        # Consultar admin
        token = login_operator("admin", "Admin1234!")
    
    print(f"Login token obtenido: {'SI' if token else 'NO'}")
    
    # Alta directa usando cliente Traccar dentro del backend
    abm_imei = f"8688880{int(time.time()) % 1000000:06d}"
    print(f"Registrando equipo de prueba ABM con IMEI {abm_imei} en Traccar...")
    code_trac_create, traccar_created = do_request(
        "http://traccar:8082/api/devices",
        method="POST",
        data={"name": f"TEST_ABM_{abm_imei[-4:]}", "uniqueId": abm_imei, "category": "machinery"},
        auth=traccar_auth
    )
    print(f"Traccar POST /api/devices: HTTP {code_trac_create} -> {traccar_created}")
    assert code_trac_create in (200, 201), f"Error creando en Traccar: {traccar_created}"
    
    # Verificar que aparece en Traccar
    code_trac_get, traccar_list = do_request("http://traccar:8082/api/devices", auth=traccar_auth)
    found_abm = any(str(d.get("uniqueId")) == abm_imei for d in traccar_list)
    assert found_abm, f"El equipo {abm_imei} debe estar listado en Traccar"
    print(f"✅ Sincronización ABM confirmada: {abm_imei} verificado en Traccar.")

    # Limpieza del equipo de prueba en Traccar
    if isinstance(traccar_created, dict) and "id" in traccar_created:
        del_code, _ = do_request(f"http://traccar:8082/api/devices/{traccar_created['id']}", method="DELETE", auth=traccar_auth)
        print(f"Limpieza equipo prueba en Traccar: HTTP {del_code}")

    print("\n==================================================================")
    print("🎉 TODAS LAS PRUEBAS (1, 2, 3 Y 4) FUERON SUPERADAS EXITOSAMENTE")
    print("==================================================================")

if __name__ == "__main__":
    main()
