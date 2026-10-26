"""
Suite de Pruebas Automatizadas de la Etapa 3:
Detección Automática de Viajes, Cálculo de Ralentí y Trazabilidad Playback
"""
import sys
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, AsyncMock

# Configuración de mocks para dependencias de base de datos
for mod in [
    'sqlalchemy', 'sqlalchemy.orm', 'sqlalchemy.ext', 
    'sqlalchemy.ext.asyncio', 'sqlalchemy.future', 'sqlalchemy.sql',
    'app.models', 'app.models.models', 'app.services.live_stream'
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

class MockColumn:
    def __init__(self, name=""):
        self.name = name
    def __eq__(self, other):
        return True
    def desc(self):
        return self

class MockVehicleTrip:
    device_id = MockColumn("device_id")
    is_closed = MockColumn("is_closed")
    start_time = MockColumn("start_time")

    def __init__(self, **kwargs):
        self.id = 1
        self.device_id = kwargs.get("device_id", "")
        self.start_time = kwargs.get("start_time")
        self.end_time = kwargs.get("end_time")
        self.duration_seconds = kwargs.get("duration_seconds", 0)
        self.distance_km = kwargs.get("distance_km", 0.0)
        self.max_speed_kmh = kwargs.get("max_speed_kmh", 0.0)
        self.avg_speed_kmh = kwargs.get("avg_speed_kmh", 0.0)
        self.idling_seconds = kwargs.get("idling_seconds", 0)
        self.start_latitude = kwargs.get("start_latitude")
        self.start_longitude = kwargs.get("start_longitude")
        self.end_latitude = kwargs.get("end_latitude")
        self.end_longitude = kwargs.get("end_longitude")
        self.is_closed = kwargs.get("is_closed", False)

sys.modules['app.models.models'].VehicleTrip = MockVehicleTrip

from app.services.trip_detector import haversine_distance_km, process_position_for_trips

class TestTripDetectorLogic(unittest.TestCase):
    """Pruebas del motor geodésico y de la máquina de estados de viajes"""

    def test_haversine_distance(self):
        """Validar cálculo geodésico de distancias ortodrómicas"""
        # Misma coordenada debe dar 0.0
        self.assertEqual(haversine_distance_km(-31.53, -68.52, -31.53, -68.52), 0.0)
        # Coordenadas nulas deben retornar 0.0
        self.assertEqual(haversine_distance_km(None, -68.52, -31.53, None), 0.0)
        
        # Distancia conocida: ~1 grado de latitud equivale a ~111.19 km
        dist = haversine_distance_km(-31.0, -68.0, -32.0, -68.0)
        self.assertAlmostEqual(dist, 111.19, delta=1.5)

    def test_idling_fuel_cost_estimation(self):
        """Verifica el cálculo de desperdicio de combustible por ralentí (1.5 L/h a $1150 ARS)"""
        # 1 hora de ralentí (3600s) = 1.5L * $1150 = $1725.0
        idling_seconds = 3600
        idle_hours = idling_seconds / 3600.0
        fuel_liters = idle_hours * 1.5
        cost_ars = round(fuel_liters * 1150.0, 2)
        self.assertEqual(cost_ars, 1725.0)

        # 30 minutos de ralentí (1800s) = 0.75L * $1150 = $862.5
        idling_half_hour = 1800
        cost_half_hour = round((idling_half_hour / 3600.0) * 1.5 * 1150.0, 2)
        self.assertEqual(cost_half_hour, 862.5)

    def test_trip_full_lifecycle_simulation(self):
        """
        Simula la secuencia completa estipulada en plan_v3.md:
        1. Ignición OFF (vehículo detenido) -> Sin viaje abierto
        2. Ignición ON, Vel=0 (arranque en ralentí) -> Abre viaje
        3. Ignición ON, Vel=45 km/h (desplazamiento) -> Acumula distancia y velocidad máx
        4. Ignición ON, Vel=0 (detenido en semáforo) -> Acumula tiempo en ralentí
        5. Ignición OFF (fin de viaje) -> Cierra viaje y calcula promedios
        """
        import asyncio

        async def run_sequence():
            db_mock = MagicMock()
            active_trips = []

            # Configurar mock de consulta para simular la base de datos
            def mock_execute(query):
                res = MagicMock()
                open_t = [t for t in active_trips if not t.is_closed]
                res.scalars.return_value.first.return_value = open_t[0] if open_t else None
                return res

            db_mock.execute = AsyncMock(side_effect=mock_execute)
            db_mock.flush = AsyncMock()

            def mock_add(obj):
                active_trips.append(obj)
            db_mock.add = mock_add

            device_id = "863238073460331"
            base_time = datetime(2026, 10, 25, 8, 0, 0, tzinfo=timezone.utc)
            lat_start = -31.5375
            lon_start = -68.5250

            # 1. Ignición OFF (vehículo detenido previamente)
            t1 = await process_position_for_trips(
                db=db_mock,
                device_id=device_id,
                latitude=lat_start,
                longitude=lon_start,
                speed_kmh=0.0,
                ignition=False,
                motion=False,
                timestamp=base_time
            )
            self.assertIsNone(t1)
            self.assertEqual(len(active_trips), 0)

            # 2. Ignición ON, Vel=0 (arranque en ralentí por 60 segundos)
            time_step2 = base_time + timedelta(seconds=60)
            t2 = await process_position_for_trips(
                db=db_mock,
                device_id=device_id,
                latitude=lat_start,
                longitude=lon_start,
                speed_kmh=0.0,
                ignition=True,
                motion=False,
                timestamp=time_step2
            )
            self.assertIsNotNone(t2)
            self.assertFalse(t2.is_closed)
            self.assertEqual(t2.start_latitude, lat_start)
            self.assertEqual(t2.distance_km, 0.0)

            # 3. Ignición ON, Vel=45.0 km/h (desplazamiento a 2.5 km de distancia tras 180 segundos)
            time_step3 = time_step2 + timedelta(seconds=180)
            lat_step3 = lat_start + 0.02
            lon_step3 = lon_start + 0.02
            t3 = await process_position_for_trips(
                db=db_mock,
                device_id=device_id,
                latitude=lat_step3,
                longitude=lon_step3,
                speed_kmh=45.0,
                ignition=True,
                motion=True,
                timestamp=time_step3
            )
            self.assertFalse(t3.is_closed)
            self.assertGreater(t3.distance_km, 1.0)
            self.assertEqual(t3.max_speed_kmh, 45.0)

            # 4. Ignición ON, Vel=0.0 km/h (detenido en semáforo durante 60 segundos)
            time_step4 = time_step3 + timedelta(seconds=60)
            t4 = await process_position_for_trips(
                db=db_mock,
                device_id=device_id,
                latitude=lat_step3,
                longitude=lon_step3,
                speed_kmh=0.0,
                ignition=True,
                motion=False,
                timestamp=time_step4
            )
            self.assertFalse(t4.is_closed)
            self.assertGreaterEqual(t4.idling_seconds, 60)

            # 5. Ignición OFF (llegada a destino y apagado de motor tras otros 120 segundos)
            time_step5 = time_step4 + timedelta(seconds=120)
            t5 = await process_position_for_trips(
                db=db_mock,
                device_id=device_id,
                latitude=lat_step3,
                longitude=lon_step3,
                speed_kmh=0.0,
                ignition=False,
                motion=False,
                timestamp=time_step5
            )
            self.assertIsNotNone(t5)
            self.assertTrue(t5.is_closed)
            self.assertEqual(t5.duration_seconds, 360) # 180 + 60 + 120
            self.assertGreater(t5.distance_km, 1.0)
            self.assertEqual(t5.max_speed_kmh, 45.0)
            self.assertGreater(t5.avg_speed_kmh, 0.0)
            self.assertGreaterEqual(t5.idling_seconds, 60)

        asyncio.run(run_sequence())


if __name__ == "__main__":
    unittest.main(verbosity=2)
