import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.fmc150_decoder import decode_fmc150_telemetry, sanitize_string_spaces

# Insumo real recibido desde Van Operarios (IMEI 863238073460331)
RAW_INGEST_PAYLOAD = {
  "id": 0,
  "attributes": {
    "priority": 0,
    "sat": 0,
    "event": 0,
    "ignition": False,
    "motion": False,
    "rssi": 5,
    "io200": 3,
    "io69": 3,
    "power": 12.447,
    "battery": 0,
    "io68": 0,
    "operator": 722310,
    "odometer": 35500,
    "distance": 0,
    "totalDistance": 14397775.444186496
  },
  "deviceId": 1307,
  "protocol": "teltonika",
  "serverTime": "2026-10-25T21:10:59.242+00:00",
  "deviceTime": "2026-10-25T21:10:23.000+00:00",
  "fixTime": "2026-10-25T21:10:23.000+00:00",
  "valid": False,
  "latitude": -34.5496566,
  "longitude": -58.4948666,
  "altitude": 0,
  "speed": 0,
  "course": 0,
  "address": None,
  "accuracy": 0,
  "network": None,
  "geofenceIds": None,
  "speed_kmh": 0,
  "device_uniqueId": "863238073460331",
  "device_name": "Van  Operarios"
}

def extract_traccar_items(payload):
    items = []
    if isinstance(payload, list):
        for elem in payload:
            items.extend(extract_traccar_items(elem))
    elif isinstance(payload, dict):
        if "positions" in payload and isinstance(payload["positions"], list):
            device_info = payload.get("device", {}) or {}
            devices_list = payload.get("devices", [])
            devices_map = {d.get("id"): d for d in devices_list if isinstance(d, dict) and "id" in d}
            for pos in payload["positions"]:
                dev = device_info or devices_map.get(pos.get("deviceId"), {})
                items.append((pos, dev))
        elif "position" in payload and isinstance(payload["position"], dict):
            items.append((payload["position"], payload.get("device", {}) or {}))
        elif "latitude" in payload or "fixTime" in payload or "deviceId" in payload:
            items.append((payload, payload.get("device", {}) or {}))
    return items

class TestFMC150IngestFlow(unittest.TestCase):

    def test_extract_items_and_normalization(self):
        # 1. Extracción de items
        items = extract_traccar_items(RAW_INGEST_PAYLOAD)
        self.assertEqual(len(items), 1)
        pos, dev = items[0]

        attrs = pos.get("attributes", {})

        # 2. Decodificación con FMC150 decoder
        decoded_fmc = decode_fmc150_telemetry(attrs)

        # 3. Saneamiento de nombre de dispositivo (elimina doble espacio)
        raw_name = dev.get("name") or pos.get("device_name") or "Desconocido"
        clean_name = sanitize_string_spaces(raw_name)
        self.assertEqual(clean_name, "Van Operarios")

        # 4. Construcción del payload normalizado según lógica de ingest_traccar
        speed_raw = float(pos.get("speed", 0.0) or 0.0)
        speed_kmh = round(speed_raw * 1.852, 2)
        ignition = bool(attrs.get("ignition") is True or attrs.get("io239") == 1 or attrs.get("io1") == 1)
        motion = bool(attrs.get("motion") is True or attrs.get("io240") == 1 or speed_kmh > 2.0)

        normalized = {
            "ignition": ignition,
            "motion": motion,
            "power": decoded_fmc["external_power"],
            "battery": decoded_fmc["internal_battery"],
            "totalDistance": decoded_fmc["total_distance_m"],
            "odometer": decoded_fmc["reported_odometer_m"],
            "hours": decoded_fmc["reported_hours"],
            "sat": decoded_fmc["satellites"],
            "rssi": decoded_fmc["rssi"],
            "sleep_mode": decoded_fmc["sleep_mode"],
            "sleep_mode_desc": decoded_fmc["sleep_mode_desc"],
            "gnss_status": decoded_fmc["gnss_status"],
            "gnss_status_desc": decoded_fmc["gnss_status_desc"],
            "network_operator": decoded_fmc["network_operator_name"],
            "operator_code": decoded_fmc["network_operator_code"],
            "serverTime": pos.get("serverTime")
        }

        # Verificación estricta de Criterios de Aceptación Etapa 1:
        # Criterio 1: sat debe ser 0 entero (NO null ni None)
        self.assertIs(type(normalized["sat"]), int)
        self.assertEqual(normalized["sat"], 0)

        # Criterio 2: battery debe ser 0.00 y power 12.45
        self.assertEqual(normalized["battery"], 0.0)
        self.assertEqual(normalized["power"], 12.45)

        # Criterio 3: network_operator debe resolverse a 'Claro AR'
        self.assertEqual(normalized["network_operator"], "Claro AR")

        # Criterio 4: sleep_mode debe ser 3 y 'Online Deep Sleep'
        self.assertEqual(normalized["sleep_mode"], 3)
        self.assertEqual(normalized["sleep_mode_desc"], "Online Deep Sleep")

        # Criterio 5: gnss_status debe ser 3 y 'GNSS Sleep (Modo Ahorro)'
        self.assertEqual(normalized["gnss_status"], 3)
        self.assertEqual(normalized["gnss_status_desc"], "GNSS Sleep (Modo Ahorro)")

        # Criterio 6: Odómetro y odómetro acumulado diferenciados
        self.assertEqual(normalized["odometer"], 35500.0)
        self.assertAlmostEqual(normalized["totalDistance"], 14397775.44, places=2)

        # Criterio 7: Formateo de cadena Live Stream (sin bug de Bat=N/A)
        bat_val = normalized["battery"]
        power_val = normalized["power"]
        sat_val = normalized["sat"]
        op_val = normalized["network_operator"]

        bat_str = f"{bat_val:.2f}V" if bat_val is not None else "N/A"
        power_str = f"{power_val:.2f}V" if power_val is not None else "N/A"
        sat_str = str(sat_val) if sat_val is not None else "0"
        red_str = op_val or "N/A"

        log_msg = f"Posición {clean_name} ({pos['device_uniqueId']}): Lat={pos['latitude']:.5f}, Lon={pos['longitude']:.5f}, Vel={speed_kmh} km/h, Bat={bat_str}, Power={power_str}, Sat={sat_str}, Red={red_str}"
        self.assertIn("Bat=0.00V", log_msg)
        self.assertIn("Power=12.45V", log_msg)
        self.assertIn("Sat=0", log_msg)
        self.assertIn("Red=Claro AR", log_msg)
        self.assertNotIn("Bat=N/A", log_msg)

if __name__ == "__main__":
    unittest.main()
