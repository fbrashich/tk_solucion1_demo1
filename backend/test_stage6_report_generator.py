"""
Suite de Pruebas Automatizadas del Sprint 2 (Release v0.6.0):
Generador de Reportes Ejecutivos en PDF Corporativo (ReportLab)
"""
import sys
import types
import unittest
import io
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, AsyncMock
from sqlalchemy.orm import declarative_base

# Aislamiento para entorno host sin driver asíncrono
db_m = types.ModuleType('app.db')
db_m.Base = declarative_base()
db_m.get_db = MagicMock()
sys.modules['app.db'] = db_m
sys.modules.pop('app.models', None)
sys.modules.pop('app.models.models', None)
sys.modules['greenlet'] = MagicMock()
sys.modules['pydantic_settings'] = MagicMock()
sys.modules['sqlalchemy.ext.asyncio'] = MagicMock()

from app.models.models import Device, DeviceState, VehicleTrip, VehicleAlert, MaintenancePlan, User
from app.services.report_generator import generate_executive_pdf_report


class TestExecutiveReportGenerator(unittest.IsolatedAsyncioTestCase):
    """Pruebas del Generador de Reportes PDF con ReportLab"""

    def setUp(self):
        self.user = User(id=1, username="gerencia@transporte-tokioba.com", hashed_password="$2b$12$sample", role="operator")
        self.empty_user = User(id=99, username="sin_vehiculos@tokioba.com", hashed_password="$2b$12$sample", role="operator")

        self.dev1 = Device(device_id="DEV_01", name="Scania R450", category="Pesado", user_id=1, odometer_offset_km=100000.0, engine_hours_offset=3000.0)
        self.dev2 = Device(device_id="DEV_02", name="Toyota Hilux", category="Liviano", user_id=1)
        self.state1 = DeviceState(device_id="DEV_01", calibrated_odometer_km=102500.0, engine_hours=3120.5, total_idling_hours=14.2, external_power=14.1, last_ignition_state=True, immobilizer_status="NORMAL")
        self.state2 = DeviceState(device_id="DEV_02", calibrated_odometer_km=45000.0, engine_hours=1200.0, total_idling_hours=3.5, external_power=11.5, last_ignition_state=False, immobilizer_status="NORMAL")

        now = datetime.now(timezone.utc)
        self.trips = [
            VehicleTrip(id=1, device_id="DEV_01", start_time=now - timedelta(days=2), duration_seconds=7200, distance_km=120.5, max_speed_kmh=88.0, avg_speed_kmh=60.0, idling_seconds=1200, is_closed=True),
            VehicleTrip(id=2, device_id="DEV_02", start_time=now - timedelta(days=1), duration_seconds=3600, distance_km=45.0, max_speed_kmh=70.0, avg_speed_kmh=45.0, idling_seconds=300, is_closed=True)
        ]
        self.alerts = [
            VehicleAlert(id=1, device_id="DEV_01", alert_type="UNAUTHORIZED_SCHEDULE", severity="WARNING", timestamp=now - timedelta(days=3), message="Uso fuera de horario"),
            VehicleAlert(id=2, device_id="DEV_02", alert_type="CRITICAL_BATTERY", severity="CRITICAL", timestamp=now - timedelta(hours=2), message="Batería 11.5V crítica")
        ]
        self.plans = [
            MaintenancePlan(id=1, device_id="DEV_01", title="Cambio de Aceite 10k", service_type="KM", interval_value=10000.0, last_service_value=100000.0, next_service_value=110000.0)
        ]

    def _setup_mock_db(self, devices, states, trips, alerts, plans):
        mock_db = AsyncMock()

        def make_exec_res(items):
            m = MagicMock()
            s = MagicMock()
            s.all.return_value = items
            m.scalars.return_value = s
            return m

        mock_db.execute.side_effect = [
            make_exec_res(devices), # 1. select Device
            make_exec_res(states),  # 2. select DeviceState
            make_exec_res(trips),   # 3. select VehicleTrip
            make_exec_res(alerts),  # 4. select VehicleAlert
            make_exec_res(plans)    # 5. select MaintenancePlan
        ]
        return mock_db

    async def test_generate_single_device_pdf(self):
        """TC-REP-01: Generación de reporte PDF para una sola unidad con KPIs, Viajes y Alertas"""
        mock_db = self._setup_mock_db([self.dev1], [self.state1], [self.trips[0]], [self.alerts[0]], self.plans)

        pdf_stream = await generate_executive_pdf_report(
            db=mock_db,
            user=self.user,
            device_id="DEV_01"
        )

        self.assertIsInstance(pdf_stream, io.BytesIO)
        content = pdf_stream.getvalue()
        self.assertGreater(len(content), 1000)
        # Firma de archivo PDF válida
        self.assertTrue(content.startswith(b"%PDF-"))

    async def test_generate_consolidated_fleet_pdf(self):
        """TC-REP-02: Generación de reporte PDF consolidado para toda la flota"""
        mock_db = self._setup_mock_db([self.dev1, self.dev2], [self.state1, self.state2], self.trips, self.alerts, self.plans)

        pdf_stream = await generate_executive_pdf_report(
            db=mock_db,
            user=self.user,
            device_id="all"
        )

        self.assertIsInstance(pdf_stream, io.BytesIO)
        content = pdf_stream.getvalue()
        self.assertGreater(len(content), 1500)
        self.assertTrue(content.startswith(b"%PDF-"))

    async def test_empty_trips_and_alerts_graceful(self):
        """TC-REP-03: Período sin viajes ni alertas produce PDF corporativo limpio sin fallar"""
        mock_db = self._setup_mock_db([self.dev1], [self.state1], [], [], [])

        pdf_stream = await generate_executive_pdf_report(
            db=mock_db,
            user=self.user,
            device_id="DEV_01"
        )

        content = pdf_stream.getvalue()
        self.assertTrue(content.startswith(b"%PDF-"))

    async def test_user_without_devices_raises_error(self):
        """TC-REP-04: Usuario sin vehículos autorizados levanta ValueError limpio"""
        mock_db = self._setup_mock_db([], [], [], [], [])

        with self.assertRaises(ValueError) as ctx:
            await generate_executive_pdf_report(
                db=mock_db,
                user=self.empty_user,
                device_id="all"
            )
        self.assertIn("No se encontraron dispositivos", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
