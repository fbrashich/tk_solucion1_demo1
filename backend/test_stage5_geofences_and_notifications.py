"""
Suite de Pruebas Automatizadas de Sprint 1 (Release v0.5.0):
Geocercas Inteligentes, Control de Permanencia, Despachador de Alertas Telegram y Control Horario
"""
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

# Configuración de mocks de infraestructura para entornos host
for mod in [
    'sqlalchemy', 'sqlalchemy.orm', 'sqlalchemy.ext', 'pydantic_settings',
    'sqlalchemy.ext.asyncio', 'sqlalchemy.future', 'sqlalchemy.sql', 'fastapi',
    'app.models', 'app.models.models', 'app.services.live_stream', 'app.services.live_manager'
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

from app.services.geofence_engine import (
    haversine_distance_meters,
    point_in_circle,
    point_in_polygon,
    is_inside_geofence,
    _device_geofence_memory
)
from app.services.alert_engine import evaluate_alert_rules
from app.services.notification_dispatcher import (
    format_telegram_alert,
    format_telegram_geofence,
    format_telegram_schedule_violation
)


class MockGeofence:
    def __init__(self, id, name, type, center_lat=None, center_lon=None, radius_meters=None, polygon_vertices=None, speed_limit_kmh=None):
        self.id = id
        self.name = name
        self.type = type
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.radius_meters = radius_meters
        self.polygon_vertices = polygon_vertices
        self.speed_limit_kmh = speed_limit_kmh
        self.is_active = True


class TestGeofenceAlgorithms(unittest.TestCase):
    """Pruebas de precisión para algoritmos geodésicos y de contención topológica"""

    def test_haversine_distance(self):
        """Distancia entre dos puntos conocidos en San Juan (aprox 1.11 km entre décimas de latitud)"""
        lat1, lon1 = -31.5300, -68.5300
        lat2, lon2 = -31.5400, -68.5300
        dist = haversine_distance_meters(lat1, lon1, lat2, lon2)
        # 1 grado de latitud ~ 111.1 km => 0.01 grado ~ 1111 metros
        self.assertAlmostEqual(dist, 1111.9, delta=10.0)

    def test_point_in_circle(self):
        """Punto dentro y fuera de un círculo geográfico de 500 metros"""
        center_lat, center_lon = -31.5375, -68.5364 # Plaza 25 de Mayo, San Juan
        radius = 500.0

        # Punto a ~100m al norte
        self.assertTrue(point_in_circle(-31.5366, -68.5364, center_lat, center_lon, radius))
        # Punto a ~1.5km al sur
        self.assertFalse(point_in_circle(-31.5510, -68.5364, center_lat, center_lon, radius))

    def test_point_in_polygon_convex(self):
        """Punto dentro y fuera de un polígono rectangular"""
        polygon = [
            [-31.5300, -68.5400],
            [-31.5300, -68.5200],
            [-31.5500, -68.5200],
            [-31.5500, -68.5400]
        ]
        # Centro
        self.assertTrue(point_in_polygon(-31.5400, -68.5300, polygon))
        # Fuera al Este
        self.assertFalse(point_in_polygon(-31.5400, -68.5100, polygon))
        # Fuera al Norte
        self.assertFalse(point_in_polygon(-31.5200, -68.5300, polygon))

    def test_point_in_polygon_complex_concave(self):
        """Polígono no convexo en forma de L"""
        polygon_l = [
            [0.0, 0.0],
            [3.0, 0.0],
            [3.0, 1.0],
            [1.0, 1.0],
            [1.0, 3.0],
            [0.0, 3.0]
        ]
        # Punto en la base de la L
        self.assertTrue(point_in_polygon(2.0, 0.5, polygon_l))
        # Punto en el brazo vertical de la L
        self.assertTrue(point_in_polygon(0.5, 2.0, polygon_l))
        # Punto en el hueco de la L (debe ser False)
        self.assertFalse(point_in_polygon(2.5, 2.5, polygon_l))

    def test_is_inside_geofence_dispatch(self):
        """Evalúa un mock de Geofence tanto para CIRCLE como POLYGON"""
        circle_gf = MockGeofence(1, "Base Central", "CIRCLE", center_lat=-31.5, center_lon=-68.5, radius_meters=1000.0)
        poly_gf = MockGeofence(2, "Obrador Norte", "POLYGON", polygon_vertices=[
            [-31.0, -68.0], [-31.0, -67.0], [-32.0, -67.0], [-32.0, -68.0]
        ])

        self.assertTrue(is_inside_geofence(-31.501, -68.501, circle_gf))
        self.assertTrue(is_inside_geofence(-31.5, -67.5, poly_gf))
        self.assertFalse(is_inside_geofence(-33.0, -67.5, poly_gf))


class TestWorkScheduleAlertRules(unittest.TestCase):
    """Pruebas del control de horarios operativos y días permitidos (Anti-Uso Personal)"""

    def setUp(self):
        self.device_id = "FMC150_331"

    def test_unauthorized_night_use(self):
        """Uso a las 23:30 hs con horario permitido de 07:00 a 19:00 debe disparar UNAUTHORIZED_SCHEDULE"""
        # Miércoles a las 23:30 UTC
        night_time = datetime(2026, 10, 28, 23, 30, tzinfo=timezone.utc)
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=13.8,
            ignition=True,
            speed_kmh=45.0,
            motion=True,
            timestamp=night_time,
            work_schedule_enabled=True,
            work_schedule_start="07:00",
            work_schedule_end="19:00",
            allowed_weekdays="0,1,2,3,4"
        )
        types = [a["alert_type"] for a in alerts]
        self.assertIn("UNAUTHORIZED_SCHEDULE", types)
        sched_alert = next(a for a in alerts if a["alert_type"] == "UNAUTHORIZED_SCHEDULE")
        self.assertIn("fuera de horario", sched_alert["message"])

    def test_authorized_day_use(self):
        """Uso a las 11:30 hs de un Miércoles NO debe generar alerta de horario"""
        day_time = datetime(2026, 10, 28, 11, 30, tzinfo=timezone.utc)
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=13.8,
            ignition=True,
            speed_kmh=45.0,
            motion=True,
            timestamp=day_time,
            work_schedule_enabled=True,
            work_schedule_start="07:00",
            work_schedule_end="19:00",
            allowed_weekdays="0,1,2,3,4"
        )
        types = [a["alert_type"] for a in alerts]
        self.assertNotIn("UNAUTHORIZED_SCHEDULE", types)

    def test_unauthorized_sunday_use(self):
        """Uso un Domingo (weekday 6) con días permitidos 0..4 debe disparar alerta por día no laborable"""
        # Domingo 25 de Octubre 2026 a las 12:00
        sunday_time = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=13.8,
            ignition=True,
            speed_kmh=30.0,
            motion=True,
            timestamp=sunday_time,
            work_schedule_enabled=True,
            work_schedule_start="07:00",
            work_schedule_end="19:00",
            allowed_weekdays="0,1,2,3,4" # Solo Lun a Vie
        )
        types = [a["alert_type"] for a in alerts]
        self.assertIn("UNAUTHORIZED_SCHEDULE", types)
        sched_alert = next(a for a in alerts if a["alert_type"] == "UNAUTHORIZED_SCHEDULE")
        self.assertIn("día no laborable", sched_alert["message"])

    def test_schedule_disabled_no_alert(self):
        """Si work_schedule_enabled es False, nunca dispara alerta aunque sea domingo a la noche"""
        sunday_night = datetime(2026, 10, 25, 23, 50, tzinfo=timezone.utc)
        alerts = evaluate_alert_rules(
            device_id=self.device_id,
            power_voltage=13.8,
            ignition=True,
            speed_kmh=30.0,
            motion=True,
            timestamp=sunday_night,
            work_schedule_enabled=False # Desactivado
        )
        types = [a["alert_type"] for a in alerts]
        self.assertNotIn("UNAUTHORIZED_SCHEDULE", types)


class TestTelegramNotificationFormatting(unittest.TestCase):
    """Pruebas de generación y formateo de mensajes para Telegram Bot API"""

    def test_format_critical_alert(self):
        """Verifica que la plantilla de alerta crítica contenga etiquetas HTML y emojis correctos"""
        msg = format_telegram_alert(
            alert_type="POWER_CUT",
            severity="CRITICAL",
            device_name="Van Operarios",
            device_id="FMC150_331",
            message="Corte de alimentación externa detectado.",
            value=4.12
        )
        self.assertIn("🚨", msg)
        self.assertIn("Van Operarios", msg)
        self.assertIn("CRITICAL", msg)
        self.assertIn("4.12", msg)
        self.assertIn("href=", msg)

    def test_format_geofence_events(self):
        """Verifica formato de mensajes de ingreso, egreso con permanencia y exceso de velocidad"""
        enter_msg = format_telegram_geofence("ENTER", "Cantera Rawson", "Van Operarios", "FMC150_331", speed_kmh=25.0)
        self.assertIn("INGRESO A ZONA SEGURA", enter_msg)
        self.assertIn("Cantera Rawson", enter_msg)

        exit_msg = format_telegram_geofence("EXIT", "Cantera Rawson", "Van Operarios", "FMC150_331", speed_kmh=30.0, duration_seconds=5400)
        self.assertIn("EGRESO DE ZONA SEGURA", exit_msg)
        self.assertIn("1h 30m", exit_msg)

        overspeed_msg = format_telegram_geofence("OVERSPEED", "Zona Urbana", "Van Operarios", "FMC150_331", speed_kmh=75.5)
        self.assertIn("EXCESO DE VELOCIDAD", overspeed_msg)
        self.assertIn("75.5 km/h", overspeed_msg)

    def test_format_schedule_violation(self):
        """Verifica formato de alerta por uso fuera de horario"""
        viol_msg = format_telegram_schedule_violation("Van Operarios", "FMC150_331", "Vehículo encendido a las 23:45 hs en día domingo.")
        self.assertIn("🌙", viol_msg)
        self.assertIn("ACTIVIDAD FUERA DE HORARIO", viol_msg)
        self.assertIn("23:45", viol_msg)


if __name__ == "__main__":
    unittest.main()
