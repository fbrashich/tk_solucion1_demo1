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

class TestStage2StatesAndCalibration(unittest.TestCase):

    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.recent_time = self.now - timedelta(minutes=2)
        self.stale_time = self.now - timedelta(minutes=45)

    def test_status_parked_sleep_fmc150(self):
        """
        Criterio 1: Van Operarios con ignition=False, io200=3 (Online Deep Sleep)
        y reporte reciente debe retornar 'PARKED_SLEEP' / 'ESTACIONADO (MODO AHORRO)'.
        """
        code, label, color = determine_operating_status(
            ignition=False,
            speed_kmh=0.0,
            motion=False,
            sleep_mode=3, # Online Deep Sleep
            last_fix_time=self.recent_time,
            now_utc=self.now
        )
        self.assertEqual(code, "PARKED_SLEEP")
        self.assertEqual(label, "ESTACIONADO (MODO AHORRO)")
        self.assertEqual(color, "#38bdf8")

    def test_status_idling(self):
        """
        Criterio 5: Vehículo con contacto encendido (ignition=True), detenido (speed=0, motion=False).
        Debe clasificar en 'IDLING' / 'RALENTÍ'.
        """
        code, label, color = determine_operating_status(
            ignition=True,
            speed_kmh=0.0,
            motion=False,
            sleep_mode=0,
            last_fix_time=self.recent_time,
            now_utc=self.now
        )
        self.assertEqual(code, "IDLING")
        self.assertEqual(label, "RALENTÍ")
        self.assertEqual(color, "#f59e0b")

    def test_status_moving(self):
        """
        Vehículo con motor en marcha y velocidad > 3 km/h o movimiento activo.
        Debe clasificar en 'MOVING' / 'EN MOVIMIENTO'.
        """
        code, label, color = determine_operating_status(
            ignition=True,
            speed_kmh=35.5,
            motion=True,
            sleep_mode=0,
            last_fix_time=self.recent_time,
            now_utc=self.now
        )
        self.assertEqual(code, "MOVING")
        self.assertEqual(label, "EN MOVIMIENTO")
        self.assertEqual(color, "#10b981")

    def test_status_towing(self):
        """
        Vehículo con motor apagado pero desplazándose a más de 5 km/h (Grúa o Remolque no autorizado).
        Debe clasificar en 'TOWING' / 'ALERTA REMOLQUE / GRÚA'.
        """
        code, label, color = determine_operating_status(
            ignition=False,
            speed_kmh=15.0,
            motion=True,
            sleep_mode=0,
            last_fix_time=self.recent_time,
            now_utc=self.now
        )
        self.assertEqual(code, "TOWING")
        self.assertEqual(label, "ALERTA REMOLQUE / GRÚA")
        self.assertEqual(color, "#a855f7")

    def test_status_disconnected(self):
        """
        Dispositivo sin reportar posición por más de 30 minutos.
        Debe clasificar en 'DISCONNECTED' / 'SIN COMUNICACIÓN'.
        """
        code, label, color = determine_operating_status(
            ignition=False,
            speed_kmh=0.0,
            motion=False,
            sleep_mode=3,
            last_fix_time=self.stale_time,
            now_utc=self.now
        )
        self.assertEqual(code, "DISCONNECTED")
        self.assertEqual(label, "SIN COMUNICACIÓN")
        self.assertEqual(color, "#f43f5e")

    def test_battery_health_evaluation(self):
        """
        Criterio 3: Evaluación de la salud de batería y alternador según voltaje de alimentación.
        """
        # Reposo con batería óptima (12.45V)
        health, color = evaluate_battery_health(12.45, ignition=False)
        self.assertEqual(health, "SALUD ÓPTIMA")
        self.assertEqual(color, "emerald")

        # Reposo normal (12.1V)
        health, color = evaluate_battery_health(12.1, ignition=False)
        self.assertEqual(health, "NORMAL / REPOSO")
        self.assertEqual(color, "blue")

        # Advertencia de batería baja (< 11.8V)
        health, color = evaluate_battery_health(11.5, ignition=False)
        self.assertEqual(health, "BATERÍA BAJA")
        self.assertEqual(color, "amber")

        # Batería crítica o descargada (< 11.2V)
        health, color = evaluate_battery_health(10.9, ignition=False)
        self.assertEqual(health, "CRÍTICA / DESCARGADA")
        self.assertEqual(color, "rose")

        # Alternador cargando correctamente con motor en marcha (>= 13.5V)
        health, color = evaluate_battery_health(14.2, ignition=True)
        self.assertEqual(health, "ALTERNADOR CARGANDO")
        self.assertEqual(color, "emerald")

        # Falla de alternador con motor encendido (< 12.5V)
        health, color = evaluate_battery_health(12.2, ignition=True)
        self.assertEqual(health, "FALLA ALTERNADOR")
        self.assertEqual(color, "amber")

    def test_odometer_calibration_math(self):
        """
        Criterio 2: Si el GPS reporta 14.397,78 km y el operador calibra con 120.000 km de tablero,
        el odómetro calibrado final debe ser 134.397,78 km.
        """
        total_distance_m = 14397775.444186496
        gps_virtual_km = round(total_distance_m / 1000.0, 2) # 14397.78 km
        self.assertAlmostEqual(gps_virtual_km, 14397.78, places=2)

        # 1. Calibración directa por offset
        offset_km = 120000.0
        calibrated_odometer_km = round(offset_km + gps_virtual_km, 2)
        self.assertEqual(calibrated_odometer_km, 134397.78)

        # 2. Calibración por ingreso del tablero físico actual (ej. 134397.78 km)
        input_dashboard_km = 134397.78
        calculated_offset = max(0.0, round(input_dashboard_km - gps_virtual_km, 2))
        self.assertEqual(calculated_offset, 120000.0)

    def test_engine_hours_calibration_math(self):
        """
        Cálculo de calibración de horómetro acumulado + offset de tablero físico.
        """
        tracked_engine_hours = 45.25 # Horas registradas por telemetría de ignición
        hours_offset = 1200.0 # Horas previas del motor en tablero
        calibrated_hours = round(tracked_engine_hours + hours_offset, 2)
        self.assertEqual(calibrated_hours, 1245.25)

        # Calibración automática ingresando el tablero actual (1245.25 hs)
        input_dashboard_hours = 1245.25
        calc_offset = max(0.0, round(input_dashboard_hours - tracked_engine_hours, 2))
        self.assertEqual(calc_offset, 1200.0)

if __name__ == '__main__':
    unittest.main()
