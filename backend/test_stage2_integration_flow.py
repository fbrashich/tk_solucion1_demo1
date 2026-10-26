import sys
import os
import unittest
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.fmc150_decoder import (
    determine_operating_status,
    evaluate_battery_health,
    decode_fmc150_telemetry
)

class MockDevice:
    def __init__(self, device_id, name, user_id=1, odometer_offset_km=0.0, engine_hours_offset=0.0):
        self.device_id = device_id
        self.name = name
        self.user_id = user_id
        self.odometer_offset_km = odometer_offset_km
        self.engine_hours_offset = engine_hours_offset

class MockDeviceState:
    def __init__(self, device_id):
        self.device_id = device_id
        self.engine_hours = 0.0
        self.last_ignition_state = False
        self.last_updated = None
        self.last_speed = 0.0
        self.last_raw_data = None
        self.external_power = None
        self.internal_battery = None
        self.sleep_mode = None
        self.gnss_status = None
        self.network_operator = None
        self.operating_status = "DISCONNECTED"
        self.calibrated_odometer_km = 0.0
        self.total_idling_hours = 0.0
        self.last_idling_start = None

class TestStage2IntegrationFlow(unittest.TestCase):

    def test_end_to_end_ingest_and_calibration(self):
        # 1. Crear equipo y estado inicial
        device = MockDevice("863238073460331", "Van Operarios", odometer_offset_km=0.0, engine_hours_offset=0.0)
        state = MockDeviceState(device.device_id)

        # 2. Ingesta de trama real de Van Operarios estacionada en Modo Ahorro
        t1 = datetime(2026, 10, 25, 21, 10, 23, tzinfo=timezone.utc)
        payload_attrs = {
            "sat": 0,
            "ignition": False,
            "motion": False,
            "rssi": 5,
            "io200": 3, # Online Deep Sleep
            "io69": 3,  # GNSS Sleep
            "power": 12.447,
            "battery": 0,
            "operator": 722310,
            "totalDistance": 14397775.444186496
        }

        decoded = decode_fmc150_telemetry(payload_attrs)
        speed_kmh = 0.0
        ignition = False
        motion = False
        sleep_mode = decoded["sleep_mode"]
        total_dist_m = decoded["total_distance_m"]
        gps_km = round(total_dist_m / 1000.0, 2) # 14397.78 km

        # Simular lógica de ingest.py
        op_code, op_label, op_color = determine_operating_status(
            ignition=ignition,
            speed_kmh=speed_kmh,
            motion=motion,
            sleep_mode=sleep_mode,
            last_fix_time=t1,
            now_utc=t1 + timedelta(seconds=10) # 10s después del reporte
        )

        state.last_updated = t1
        state.operating_status = op_code
        state.calibrated_odometer_km = round(device.odometer_offset_km + gps_km, 2)
        state.external_power = decoded["external_power"]

        self.assertEqual(state.operating_status, "PARKED_SLEEP")
        self.assertEqual(op_label, "ESTACIONADO (MODO AHORRO)")
        self.assertEqual(state.calibrated_odometer_km, 14397.78)

        # 3. Simular Calibración por el Operador:
        # El operador ingresa que su odómetro de tablero marca 134.397,78 km
        target_dashboard_km = 134397.78
        calculated_offset = max(0.0, round(target_dashboard_km - gps_km, 2))
        device.odometer_offset_km = calculated_offset
        self.assertEqual(device.odometer_offset_km, 120000.0)

        # El operador ingresa que su tablero marca 1.245,25 horas de motor
        target_dashboard_hs = 1245.25
        device.engine_hours_offset = max(0.0, round(target_dashboard_hs - state.engine_hours, 2))
        self.assertEqual(device.engine_hours_offset, 1245.25)

        # Recalcular métricas consolidadas
        state.calibrated_odometer_km = round(device.odometer_offset_km + gps_km, 2)
        calibrated_hours = round(state.engine_hours + device.engine_hours_offset, 2)

        self.assertEqual(state.calibrated_odometer_km, 134397.78)
        self.assertEqual(calibrated_hours, 1245.25)

        # 4. Simular ignición y ralentí continuo durante 120 segundos
        t2 = t1 + timedelta(minutes=5) # Arranca 5 min después
        state.last_updated = t2
        t3 = t2 + timedelta(seconds=120) # 120s de ralentí continuo

        delta_sec = (t3 - t2).total_seconds()
        idling_delta_hs = round(delta_sec / 3600.0, 4)
        state.engine_hours += idling_delta_hs
        state.total_idling_hours += idling_delta_hs

        op_code_idling, op_label_idling, _ = determine_operating_status(
            ignition=True,
            speed_kmh=0.0,
            motion=False,
            sleep_mode=0,
            last_fix_time=t3,
            now_utc=t3
        )

        self.assertEqual(op_code_idling, "IDLING")
        self.assertEqual(op_label_idling, "RALENTÍ")
        self.assertAlmostEqual(state.total_idling_hours, 0.0333, places=3)
        self.assertAlmostEqual(state.engine_hours, 0.0333, places=3)
        self.assertAlmostEqual(state.engine_hours + device.engine_hours_offset, 1245.2833, places=3)

if __name__ == '__main__':
    unittest.main()
