import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.fmc150_decoder import (
    decode_fmc150_telemetry,
    sanitize_string_spaces,
    decode_operator,
    decode_sleep_mode,
    decode_gnss_status,
    safe_coalesce
)

REAL_PAYLOAD_ATTRS = {
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
}

class TestFMC150Decoder(unittest.TestCase):

    def test_safe_coalesce(self):
        self.assertEqual(safe_coalesce(0, None), 0)
        self.assertEqual(safe_coalesce(None, 0), 0)
        self.assertEqual(safe_coalesce(0.0, 12.5), 0.0)
        self.assertEqual(safe_coalesce(False, True), False)
        self.assertEqual(safe_coalesce("", "fallback"), "")
        self.assertIsNone(safe_coalesce(None, None))

    def test_sanitize_spaces(self):
        self.assertEqual(sanitize_string_spaces("Van  Operarios"), "Van Operarios")
        self.assertEqual(sanitize_string_spaces("   Van   Operarios   FMC150   "), "Van Operarios FMC150")

    def test_operator_decoding(self):
        name, code = decode_operator(722310)
        self.assertEqual(name, "Claro AR")
        self.assertEqual(code, "722310")

        name, code = decode_operator("722320")
        self.assertEqual(name, "Movistar AR")
        self.assertEqual(code, "722320")

        name, code = decode_operator("722341")
        self.assertEqual(name, "Personal AR")
        self.assertEqual(code, "722341")

    def test_sleep_mode_decoding(self):
        mode, desc = decode_sleep_mode(3)
        self.assertEqual(mode, 3)
        self.assertEqual(desc, "Online Deep Sleep")

        mode, desc = decode_sleep_mode(0)
        self.assertEqual(mode, 0)
        self.assertEqual(desc, "Normal")

    def test_gnss_status_decoding(self):
        status, desc = decode_gnss_status(3)
        self.assertEqual(status, 3)
        self.assertEqual(desc, "GNSS Sleep (Modo Ahorro)")

    def test_real_payload_fmc150_decoding(self):
        decoded = decode_fmc150_telemetry(REAL_PAYLOAD_ATTRS)

        # 1. Anti-Falsy: sat 0 debe ser 0 entero y NUNCA None
        self.assertIsNotNone(decoded["satellites"])
        self.assertEqual(decoded["satellites"], 0)

        # 2. Anti-Falsy: battery 0 debe ser 0.0 y NUNCA None
        self.assertIsNotNone(decoded["internal_battery"])
        self.assertEqual(decoded["internal_battery"], 0.0)

        # 3. External Power 12.447 -> 12.45
        self.assertEqual(decoded["external_power"], 12.45)

        # 4. Sleep Mode io200 = 3
        self.assertEqual(decoded["sleep_mode"], 3)
        self.assertEqual(decoded["sleep_mode_desc"], "Online Deep Sleep")

        # 5. GNSS Status io69 = 3
        self.assertEqual(decoded["gnss_status"], 3)
        self.assertEqual(decoded["gnss_status_desc"], "GNSS Sleep (Modo Ahorro)")

        # 6. Operador 722310
        self.assertEqual(decoded["network_operator_name"], "Claro AR")
        self.assertEqual(decoded["network_operator_code"], "722310")

        # 7. Odómetro y totalDistance
        self.assertEqual(decoded["reported_odometer_m"], 35500.0)
        self.assertAlmostEqual(decoded["total_distance_m"], 14397775.44, places=2)
        self.assertIsNone(decoded["reported_hours"])
        self.assertEqual(decoded["battery_current_ma"], 0)

if __name__ == "__main__":
    unittest.main()
