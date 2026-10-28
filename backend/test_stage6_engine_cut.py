"""
Suite de Pruebas Automatizadas del Sprint 2 (Release v0.6.0):
Comando Remoto de Inmovilización (Corte de Motor Seguro con Safety Interlock)
"""
import sys
import types
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
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

from app.models.models import Device, DeviceState, CommandAuditLog, User
from app.services.engine_cut_service import (
    verify_operator_auth,
    request_engine_cut,
    check_and_execute_pending_cut,
    cancel_pending_cut,
    MAX_SAFE_SPEED_KMH
)
from app.services.notification_dispatcher import format_telegram_engine_command


class TestEngineCutSafetyInterlock(unittest.IsolatedAsyncioTestCase):
    """Pruebas unitarias de la lógica de inmovilización y Safety Interlock"""

    def setUp(self):
        # Hash válido de bcrypt de 60 caracteres (passlib compatible)
        valid_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew.dF3g6rQvD28Ty"
        self.user_a = User(id=1, username="fabianb@tokioba.com", hashed_password=valid_hash, role="operator")
        self.user_b = User(id=2, username="attacker@other.com", hashed_password=valid_hash, role="operator")
        self.admin = User(id=99, username="admin@tokioba.com", hashed_password=valid_hash, role="admin")

        self.device = Device(
            device_id="DEV_FMC150_01",
            name="Scania R450",
            user_id=1,
            security_pin="7788",
            traccar_unique_id="DEV_FMC150_01"
        )
        self.device_state = DeviceState(device_id="DEV_FMC150_01", last_speed=45.0, immobilizer_status="NORMAL")

    def test_verify_operator_auth_with_pin(self):
        """Validación de PIN de 4 dígitos configurado en el vehículo"""
        self.assertTrue(verify_operator_auth(self.user_a, self.device, "7788"))
        self.assertFalse(verify_operator_auth(self.user_a, self.device, "0000"))
        self.assertFalse(verify_operator_auth(self.user_a, self.device, ""))

    @patch("app.services.engine_cut_service.pwd_context.verify")
    def test_verify_operator_auth_with_account_password(self, mock_pwd_verify):
        """Validación de contraseña maestra de la cuenta de usuario"""
        mock_pwd_verify.return_value = True
        device_no_pin = Device(device_id="DEV_02", name="Hilux", user_id=1, security_pin=None)
        self.assertTrue(verify_operator_auth(self.user_a, device_no_pin, "MyMasterPassword"))

    @patch("app.services.engine_cut_service.dispatch_engine_command")
    async def test_safety_interlock_blocks_moving_vehicle(self, mock_dispatch):
        """TC-INTERLOCK-01: Velocidad 45.0 km/h (> 5.0 km/h) encola como QUEUED_SAFE_STOP"""
        self.device_state.last_speed = 45.0

        mock_db = AsyncMock()
        mock_scalars_dev = MagicMock()
        mock_scalars_dev.first.return_value = self.device
        mock_exec_dev = MagicMock()
        mock_exec_dev.scalars.return_value = mock_scalars_dev

        mock_scalars_state = MagicMock()
        mock_scalars_state.first.return_value = self.device_state
        mock_exec_state = MagicMock()
        mock_exec_state.scalars.return_value = mock_scalars_state

        mock_db.execute.side_effect = [mock_exec_dev, mock_exec_state]

        res = await request_engine_cut(
            db=mock_db,
            user=self.user_a,
            device_id="DEV_FMC150_01",
            action="CUT",
            pin_or_password="7788",
            notes="Prueba de encolado en movimiento"
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "QUEUED_SAFE_STOP")
        self.assertEqual(self.device_state.immobilizer_status, "PENDING_CUT")
        self.assertIn("en movimiento", res["message"].lower())
        mock_dispatch.assert_called_once()

    @patch("app.services.engine_cut_service.traccar_client.find_device_by_unique_id", new_callable=AsyncMock)
    @patch("app.services.engine_cut_service.traccar_client.send_device_command", new_callable=AsyncMock)
    @patch("app.services.engine_cut_service.dispatch_engine_command")
    async def test_immediate_cut_when_stopped(self, mock_dispatch, mock_send_cmd, mock_find_dev):
        """TC-INTERLOCK-02: Velocidad 2.0 km/h (<= 5.0 km/h) ejecuta corte inmediatamente"""
        self.device_state.last_speed = 2.0
        mock_find_dev.return_value = {"id": 12, "name": "Scania R450"}
        mock_send_cmd.return_value = {"success": True, "data": {"id": 105}}

        mock_db = AsyncMock()
        mock_scalars_dev = MagicMock()
        mock_scalars_dev.first.return_value = self.device
        mock_exec_dev = MagicMock()
        mock_exec_dev.scalars.return_value = mock_scalars_dev

        mock_scalars_state = MagicMock()
        mock_scalars_state.first.return_value = self.device_state
        mock_exec_state = MagicMock()
        mock_exec_state.scalars.return_value = mock_scalars_state

        mock_db.execute.side_effect = [mock_exec_dev, mock_exec_state]

        res = await request_engine_cut(
            db=mock_db,
            user=self.user_a,
            device_id="DEV_FMC150_01",
            action="CUT",
            pin_or_password="7788"
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "EXECUTED")
        self.assertEqual(self.device_state.immobilizer_status, "IMMOBILIZED")
        mock_send_cmd.assert_called_once_with(12, "setdigout 1")

    @patch("app.services.engine_cut_service.traccar_client.find_device_by_unique_id", new_callable=AsyncMock)
    @patch("app.services.engine_cut_service.traccar_client.send_device_command", new_callable=AsyncMock)
    @patch("app.services.engine_cut_service.dispatch_engine_command")
    async def test_deferred_cut_on_vehicle_stop(self, mock_dispatch, mock_send_cmd, mock_find_dev):
        """TC-INTERLOCK-03: check_and_execute_pending_cut ejecuta corte cuando la velocidad baja a <= 5 km/h"""
        mock_find_dev.return_value = {"id": 12, "name": "Scania R450"}
        mock_send_cmd.return_value = {"success": True, "data": {"id": 106}}

        # Si velocidad es 30 km/h, no hace nada
        mock_db = AsyncMock()
        res_fast = await check_and_execute_pending_cut(mock_db, "DEV_FMC150_01", "Scania R450", 30.0)
        self.assertIsNone(res_fast)

        # Si velocidad es 1.5 km/h y hay comando pendiente
        pending_cmd = CommandAuditLog(id=88, user_id=1, device_id="DEV_FMC150_01", command_type="CUT_ENGINE", action="CUT", status="PENDING_SAFE_STOP")
        
        mock_scalars_cmd = MagicMock()
        mock_scalars_cmd.first.return_value = pending_cmd
        mock_exec_cmd = MagicMock()
        mock_exec_cmd.scalars.return_value = mock_scalars_cmd

        mock_scalars_state = MagicMock()
        mock_scalars_state.first.return_value = self.device_state
        mock_exec_state = MagicMock()
        mock_exec_state.scalars.return_value = mock_scalars_state

        mock_db.execute.side_effect = [mock_exec_cmd, mock_exec_state]
        mock_db.get.side_effect = lambda model, pk: self.device if pk == "DEV_FMC150_01" else self.user_a

        res_stop = await check_and_execute_pending_cut(mock_db, "DEV_FMC150_01", "Scania R450", 1.5)
        self.assertIsNotNone(res_stop)
        self.assertEqual(res_stop.status, "EXECUTED")
        self.assertEqual(res_stop.speed_at_execution_kmh, 1.5)
        self.assertEqual(self.device_state.immobilizer_status, "IMMOBILIZED")
        mock_send_cmd.assert_called_once_with(12, "setdigout 1")

    @patch("app.services.engine_cut_service.traccar_client.find_device_by_unique_id", new_callable=AsyncMock)
    @patch("app.services.engine_cut_service.traccar_client.send_device_command", new_callable=AsyncMock)
    @patch("app.services.engine_cut_service.dispatch_engine_command")
    async def test_restore_engine(self, mock_dispatch, mock_send_cmd, mock_find_dev):
        """TC-RESTORE-01: Restablecimiento de motor ejecuta setdigout 0 y resetea estado a NORMAL"""
        mock_find_dev.return_value = {"id": 12, "name": "Scania R450"}
        mock_send_cmd.return_value = {"success": True, "data": {}}
        self.device_state.immobilizer_status = "IMMOBILIZED"

        mock_db = AsyncMock()
        mock_scalars_dev = MagicMock()
        mock_scalars_dev.first.return_value = self.device
        mock_exec_dev = MagicMock()
        mock_exec_dev.scalars.return_value = mock_scalars_dev

        mock_scalars_state = MagicMock()
        mock_scalars_state.first.return_value = self.device_state
        mock_exec_state = MagicMock()
        mock_exec_state.scalars.return_value = mock_scalars_state

        mock_db.execute.side_effect = [mock_exec_dev, mock_exec_state]

        res = await request_engine_cut(
            db=mock_db,
            user=self.user_a,
            device_id="DEV_FMC150_01",
            action="RESTORE",
            pin_or_password="7788"
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "EXECUTED")
        self.assertEqual(self.device_state.immobilizer_status, "NORMAL")
        mock_send_cmd.assert_called_once_with(12, "setdigout 0")

    async def test_unauthorized_device_access_raises_404(self):
        """TC-IDOR-01: Operador B intentando acceder a dispositivo de Operador A recibe 404"""
        mock_db = AsyncMock()
        mock_scalars_dev = MagicMock()
        mock_scalars_dev.first.return_value = None # No autorizado / no encontrado
        mock_exec_dev = MagicMock()
        mock_exec_dev.scalars.return_value = mock_scalars_dev
        mock_db.execute.return_value = mock_exec_dev

        with self.assertRaises(HTTPException) as ctx:
            await request_engine_cut(
                db=mock_db,
                user=self.user_b,
                device_id="DEV_FMC150_01",
                action="CUT",
                pin_or_password="7788"
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_wrong_pin_raises_403(self):
        """TC-AUTH-01: PIN incorrecto levanta 403 Forbidden"""
        mock_db = AsyncMock()
        mock_scalars_dev = MagicMock()
        mock_scalars_dev.first.return_value = self.device
        mock_exec_dev = MagicMock()
        mock_exec_dev.scalars.return_value = mock_scalars_dev
        mock_db.execute.return_value = mock_exec_dev

        with self.assertRaises(HTTPException) as ctx:
            await request_engine_cut(
                db=mock_db,
                user=self.user_a,
                device_id="DEV_FMC150_01",
                action="CUT",
                pin_or_password="9999_WRONG"
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_telegram_engine_formatting(self):
        """Verifica formato de notificaciones de Telegram para corte y restablecimiento"""
        msg_cut = format_telegram_engine_command("CUT", "EXECUTED", "Scania R450", "DEV_FMC150_01", "fabianb@tokioba.com", 0.0)
        self.assertIn("🛑", msg_cut)
        self.assertIn("INMOVILIZADOR REMOTO ACTIVADO", msg_cut)
        self.assertIn("Scania R450", msg_cut)

        msg_queue = format_telegram_engine_command("CUT", "QUEUED_SAFE_STOP", "Scania R450", "DEV_FMC150_01", "fabianb@tokioba.com", 65.4)
        self.assertIn("⏳", msg_queue)
        self.assertIn("SAFETY INTERLOCK", msg_queue)
        self.assertIn("65.4 km/h", msg_queue)

        msg_restore = format_telegram_engine_command("RESTORE", "EXECUTED", "Scania R450", "DEV_FMC150_01", "fabianb@tokioba.com", 0.0)
        self.assertIn("🟢", msg_restore)
        self.assertIn("MOTOR RESTABLECIDO", msg_restore)


if __name__ == "__main__":
    unittest.main()
