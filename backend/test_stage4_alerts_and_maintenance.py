"""
Suite de Pruebas Automatizadas de la Etapa 4:
Alertas Operativas en Tiempo Real y Planes de Mantenimiento Preventivo
"""
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

# Configuración de mocks para dependencias de infraestructura en entornos locales sin dependencias externas
for mod in [
    'sqlalchemy', 'sqlalchemy.orm', 'sqlalchemy.ext', 'pydantic_settings', 'app.core.config',
    'sqlalchemy.ext.asyncio', 'sqlalchemy.future', 'sqlalchemy.sql',
    'app.models', 'app.models.models', 'app.services.live_stream', 'app.services.live_manager'
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

from app.services.alert_engine import evaluate_alert_rules

class TestAlertEngineRules(unittest.TestCase):
    """Pruebas del motor de reglas de alertas de telemetría automotriz y maquinaria"""

    def setUp(self):
        self.device_id = "863238073460331" # Van Operarios FMC150
        self.now = datetime.now(timezone.utc)

    def test_power_cut_critical(self):
        """Voltaje externo < 5.0 V debe disparar alerta CRITICAL de POWER_CUT (corte o sabotaje de borne)"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=3.8,
            ignition=False,
            speed_kmh=0.0,
            motion=False,
            timestamp=self.now
        )
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert_type"], "POWER_CUT")
        self.assertEqual(alerts[0]["severity"], "CRITICAL")
        self.assertEqual(alerts[0]["value"], 3.8)

    def test_critical_battery(self):
        """Voltaje externo entre 5.0 y 11.2 V debe disparar alerta CRITICAL de CRITICAL_BATTERY"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=10.9,
            ignition=False,
            speed_kmh=0.0,
            motion=False,
            timestamp=self.now
        )
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert_type"], "CRITICAL_BATTERY")
        self.assertEqual(alerts[0]["severity"], "CRITICAL")
        self.assertEqual(alerts[0]["value"], 10.9)

    def test_low_battery_warning(self):
        """Voltaje externo entre 11.2 y 11.8 V debe disparar alerta WARNING de LOW_BATTERY"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=11.5,
            ignition=False,
            speed_kmh=0.0,
            motion=False,
            timestamp=self.now
        )
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert_type"], "LOW_BATTERY")
        self.assertEqual(alerts[0]["severity"], "WARNING")
        self.assertEqual(alerts[0]["value"], 11.5)

    def test_healthy_battery_no_alert(self):
        """Batería en rango normal (ej 12.6V en reposo) no debe generar alertas de batería"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=12.6,
            ignition=False,
            speed_kmh=0.0,
            motion=False,
            timestamp=self.now
        )
        battery_alerts = [a for a in alerts if "BATTERY" in a["alert_type"] or "POWER" in a["alert_type"]]
        self.assertEqual(len(battery_alerts), 0)

    def test_alternator_failure_warning(self):
        """Con contacto encendido pero voltaje < 12.5V (ej 11.9V), debe advertir falla de alternador"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=11.9,
            ignition=True,
            speed_kmh=45.0,
            motion=True,
            timestamp=self.now
        )
        types = [a["alert_type"] for a in alerts]
        self.assertIn("ALTERNATOR_FAIL", types)
        alt_alert = next(a for a in alerts if a["alert_type"] == "ALTERNATOR_FAIL")
        self.assertEqual(alt_alert["severity"], "WARNING")
        self.assertEqual(alt_alert["value"], 11.9)

    def test_alternator_charging_healthy(self):
        """Con alternador cargando normalmente (14.2V), no debe disparar alerta de alternador"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=14.2,
            ignition=True,
            speed_kmh=50.0,
            motion=True,
            timestamp=self.now
        )
        self.assertEqual(len(alerts), 0)

    def test_towing_crane_alert(self):
        """Desplazamiento no autorizado (speed >= 5 km/h) con contacto apagado dispara TOWING"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=12.5,
            ignition=False,
            speed_kmh=18.5,
            motion=True,
            timestamp=self.now
        )
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert_type"], "TOWING")
        self.assertEqual(alerts[0]["severity"], "CRITICAL")
        self.assertEqual(alerts[0]["value"], 18.5)

    def test_overspeed_warning(self):
        """Velocidad por encima del límite operativo (100 km/h) dispara alerta OVERSPEED"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=14.1,
            ignition=True,
            speed_kmh=118.0,
            motion=True,
            timestamp=self.now,
            speed_limit_kmh=100.0
        )
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert_type"], "OVERSPEED")
        self.assertEqual(alerts[0]["severity"], "WARNING")
        self.assertEqual(alerts[0]["value"], 118.0)

    def test_multiple_simultaneous_alerts(self):
        """Combinación de exceso de velocidad + falla de alternador deben capturarse simultáneamente"""
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=11.6, # Carga deficiente (< 12.5V con contacto) y batería baja (< 11.8V)
            ignition=True,
            speed_kmh=120.0,    # Exceso de velocidad
            motion=True,
            timestamp=self.now,
            speed_limit_kmh=100.0
        )
        types = [a["alert_type"] for a in alerts]
        self.assertIn("OVERSPEED", types)
        self.assertIn("ALTERNATOR_FAIL", types)
        self.assertIn("LOW_BATTERY", types)


class TestMaintenanceCalculations(unittest.TestCase):
    """Pruebas de la lógica de cálculo semafórico y reprogramación automática de mantenimientos"""

    def calculate_plan_status(self, service_type: str, last_val: float, next_val: float, current_val: float):
        """Replica el algoritmo canónico de backend/app/api/maintenance.py"""
        span = next_val - last_val
        progress = 0.0
        if span > 0:
            progress = min(100.0, max(0.0, ((current_val - last_val) / span) * 100.0))

        remaining = round(next_val - current_val, 1)

        if remaining <= 0:
            status = "OVERDUE"
            color = "rose"
        elif (service_type == "KM" and remaining < 1000) or (service_type == "HOURS" and remaining < 30):
            status = "WARNING"
            color = "amber"
        else:
            status = "OK"
            color = "emerald"

        return {
            "progress": round(progress, 1),
            "remaining": remaining,
            "status": status,
            "color": color
        }

    def test_plan_km_status_ok(self):
        """Plan de 10.000 km con 8.000 km restantes debe estar en OK"""
        result = self.calculate_plan_status(
            service_type="KM",
            last_val=50000.0,
            next_val=60000.0,
            current_val=52000.0
        )
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["color"], "emerald")
        self.assertEqual(result["remaining"], 8000.0)
        self.assertEqual(result["progress"], 20.0)

    def test_plan_km_status_warning(self):
        """Plan de 10.000 km con menos de 1.000 km restantes (ej. 800 km) debe pasar a WARNING"""
        result = self.calculate_plan_status(
            service_type="KM",
            last_val=50000.0,
            next_val=60000.0,
            current_val=59200.0
        )
        self.assertEqual(result["status"], "WARNING")
        self.assertEqual(result["color"], "amber")
        self.assertEqual(result["remaining"], 800.0)
        self.assertEqual(result["progress"], 92.0)

    def test_plan_km_status_overdue(self):
        """Plan que superó el próximo objetivo debe pasar a OVERDUE"""
        result = self.calculate_plan_status(
            service_type="KM",
            last_val=50000.0,
            next_val=60000.0,
            current_val=60150.0
        )
        self.assertEqual(result["status"], "OVERDUE")
        self.assertEqual(result["color"], "rose")
        self.assertEqual(result["remaining"], -150.0)
        self.assertEqual(result["progress"], 100.0)

    def test_plan_hours_status_warning(self):
        """Plan de horómetro (intervalo 250 hs) con menos de 30 hs restantes debe estar en WARNING"""
        result = self.calculate_plan_status(
            service_type="HOURS",
            last_val=100.0,
            next_val=350.0,
            current_val=335.0
        )
        self.assertEqual(result["status"], "WARNING")
        self.assertEqual(result["remaining"], 15.0)

    def test_plan_service_record_and_auto_advance(self):
        """Al asentar un service realizado, el plan debe avanzar automáticamente el ciclo y resetear estado a OK"""
        interval = 10000.0
        executed_val = 60200.0 # Se realizó el service pasado 200 km
        
        # Simulación de reprogramación canónica
        new_last_val = executed_val
        new_next_val = executed_val + interval

        self.assertEqual(new_last_val, 60200.0)
        self.assertEqual(new_next_val, 70200.0)

        # Estado inmediatamente después del service
        result_after = self.calculate_plan_status(
            service_type="KM",
            last_val=new_last_val,
            next_val=new_next_val,
            current_val=executed_val
        )
        self.assertEqual(result_after["status"], "OK")
        self.assertEqual(result_after["color"], "emerald")
        self.assertEqual(result_after["remaining"], 10000.0)
        self.assertEqual(result_after["progress"], 0.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
