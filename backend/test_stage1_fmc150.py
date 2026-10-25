import sys
import os
import unittest

# Asegurar path de backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.fmc150_decoder import (
    decode_fmc150_telemetry,
    sanitize_string_spaces,
    decode_operator,
    decode_sleep_mode,
    decode_gnss_status,
    safe_coalesce
)
from app.schemas.schemas import DeviceStatusResponse, TelemetryEventResponse

# Payload real recibido desde Van Operarios (IMEI 863238073460331)
REAL_PAYLOAD_FMC150_331 = {
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

class TestStage1FMC150(unittest.TestCase):

    def test_safe_coalesce_falsy_preservation(self):
        """Verifica que safe_coalesce preserve valores 0, 0.0, False y no los convierta en None."""
        self.assertEqual(safe_coalesce(0, None), 0)
        self.assertEqual(safe_coalesce(None, 0), 0)
        self.assertEqual(safe_coalesce(0.0, 12.5), 0.0)
        self.assertEqual(safe_coalesce(False, True), False)
        self.assertIsNone(safe_coalesce(None, None))

    def test_sanitize_string_spaces(self):
        """Verifica que se eliminen dobles espacios y espacios en extremos."""
        self.assertEqual(sanitize_string_spaces("Van  Operarios"), "Van Operarios")
        self.assertEqual(sanitize_string_spaces("  Teltonika   FMC150   GPS  "), "Teltonika FMC150 GPS")
        self.assertIsNone(sanitize_string_spaces(None))

    def test_decode_operator_argentina(self):
        """Verifica la decodificación de MCC 722 y MNCs de Argentina."""
        name, code = decode_operator(722310)
        self.assertEqual(name, "Claro AR")
        self.assertEqual(code, "722310")

        name_mov, _ = decode_operator("722320")
        self.assertEqual(name_mov, "Movistar AR")

        name_per, _ = decode_operator(722341)
        self.assertEqual(name_per, "Personal AR")

    def test_decode_sleep_mode(self):
        """Verifica la decodificación de io200 (Modo Online Deep Sleep)."""
        mode, desc = decode_sleep_mode(3)
        self.assertEqual(mode, 3)
        self.assertEqual(desc, "Online Deep Sleep")

    def test_decode_gnss_status(self):
        """Verifica la decodificación de io69 (GNSS Sleep / Ahorro Energía)."""
        status, desc = decode_gnss_status(3)
        self.assertEqual(status, 3)
        self.assertEqual(desc, "GNSS Sleep (Modo Ahorro)")

    def test_decode_real_payload_fmc150(self):
        """Auditoría completa sobre los atributos reales de la Van Operarios."""
        attrs = REAL_PAYLOAD_FMC150_331["attributes"]
        decoded = decode_fmc150_telemetry(attrs)

        # 1. Anti-Falsy Bug: Satélites debe ser 0 entero, NUNCA None / null
        self.assertIsNotNone(decoded["satellites"])
        self.assertEqual(decoded["satellites"], 0)

        # 2. Batería interna debe ser 0.00, NUNCA None
        self.assertIsNotNone(decoded["internal_battery"])
        self.assertEqual(decoded["internal_battery"], 0.0)

        # 3. Voltaje de batería del vehículo (Power 12.447 V -> 12.45 V)
        self.assertIsNotNone(decoded["external_power"])
        self.assertEqual(decoded["external_power"], 12.45)

        # 4. Modo Online Deep Sleep (io200: 3)
        self.assertEqual(decoded["sleep_mode"], 3)
        self.assertEqual(decoded["sleep_mode_desc"], "Online Deep Sleep")

        # 5. Estado GNSS Sleep (io69: 3)
        self.assertEqual(decoded["gnss_status"], 3)
        self.assertEqual(decoded["gnss_status_desc"], "GNSS Sleep (Modo Ahorro)")

        # 6. Red Celular (722310 -> Claro AR)
        self.assertEqual(decoded["network_operator_name"], "Claro AR")
        self.assertEqual(decoded["network_operator_code"], "722310")

        # 7. Corriente (io68: 0 mA)
        self.assertEqual(decoded["battery_current_ma"], 0)

        # 8. Odómetro y Horómetro
        self.assertEqual(decoded["reported_odometer_m"], 35500.0)
        self.assertAlmostEqual(decoded["total_distance_m"], 14397775.44, places=2)
        self.assertIsNone(decoded["reported_hours"])

    def test_schemas_acceptance(self):
        """Valida que los schemas de FastAPI acepten los nuevos campos de Etapa 1."""
        status_resp = DeviceStatusResponse(
            device_id="863238073460331",
            name="Van Operarios",
            type="Teltonika GPS",
            status="DETENIDA",
            ignition=False,
            last_lat=-34.5496566,
            last_lon=-58.4948666,
            engine_hours=0.0,
            last_speed=0.0,
            external_power=12.45,
            internal_battery=0.0,
            sleep_mode=3,
            gnss_status=3,
            network_operator="Claro AR"
        )
        self.assertEqual(status_resp.external_power, 12.45)
        self.assertEqual(status_resp.internal_battery, 0.0)
        self.assertEqual(status_resp.network_operator, "Claro AR")

if __name__ == "__main__":
    unittest.main()
