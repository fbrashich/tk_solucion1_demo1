import logging
import httpx
from typing import Optional, List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_

from app.core.config import settings
from app.models.models import Device, DeviceState, User

logger = logging.getLogger("traccar_client")

class TraccarClient:
    def __init__(self):
        self.base_url = settings.TRACCAR_API_URL.rstrip("/")
        self.username = settings.TRACCAR_USER
        self.password = settings.TRACCAR_PASSWORD
        self._auth = (self.username, self.password)

    def _get_client(self, timeout: float = 8.0) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            auth=self._auth,
            headers={
                "User-Agent": "TK-FastAPI-TraccarClient/1.0",
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            timeout=timeout
        )

    async def get_devices(self) -> List[Dict[str, Any]]:
        """Obtiene todos los dispositivos registrados en Traccar."""
        url = f"{self.base_url}/devices"
        try:
            async with self._get_client() as client:
                resp = await client.get("/devices")
                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 401:
                    logger.error(f"[TRACCAR API] Error de autenticación (401) en {url} con usuario {self.username}")
                else:
                    logger.warning(f"[TRACCAR API] GET /devices retornó HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"[TRACCAR API] Error de conexión al consultar dispositivos ({url}): {e}")
        return []

    async def find_device_by_unique_id(self, unique_id: str) -> Optional[Dict[str, Any]]:
        """Busca un dispositivo por uniqueId (IMEI) en Traccar."""
        clean_uid = str(unique_id).strip()
        devices = await self.get_devices()
        for d in devices:
            if str(d.get("uniqueId")).strip() == clean_uid:
                return d
        return None

    async def create_device(
        self,
        name: str,
        unique_id: str,
        model: Optional[str] = None,
        phone: Optional[str] = None,
        category: Optional[str] = "machinery"
    ) -> Optional[Dict[str, Any]]:
        """Crea un nuevo dispositivo en Traccar."""
        clean_uid = str(unique_id).strip()
        payload = {
            "name": name.strip(),
            "uniqueId": clean_uid,
            "category": category or "machinery"
        }
        if model:
            payload["model"] = model.strip()
        if phone:
            payload["phone"] = phone.strip()

        try:
            async with self._get_client() as client:
                resp = await client.post("/devices", json=payload)
                if resp.status_code in (200, 201):
                    created = resp.json()
                    logger.info(f"[TRACCAR API] Dispositivo '{name}' ({clean_uid}) creado en Traccar exitosamente (ID: {created.get('id')})")
                    return created
                else:
                    logger.warning(f"[TRACCAR API] Error al crear dispositivo en Traccar (HTTP {resp.status_code}): {resp.text}")
        except Exception as e:
            logger.error(f"[TRACCAR API] Error de conexión al crear dispositivo ({clean_uid}): {e}")
        return None

    async def update_device(
        self,
        traccar_id: int,
        name: str,
        unique_id: str,
        model: Optional[str] = None,
        phone: Optional[str] = None,
        category: Optional[str] = "machinery"
    ) -> Optional[Dict[str, Any]]:
        """Actualiza un dispositivo existente en Traccar por su ID numérico."""
        payload = {
            "id": traccar_id,
            "name": name.strip(),
            "uniqueId": str(unique_id).strip(),
            "category": category or "machinery"
        }
        if model:
            payload["model"] = model.strip()
        if phone:
            payload["phone"] = phone.strip()

        try:
            async with self._get_client() as client:
                resp = await client.put(f"/devices/{traccar_id}", json=payload)
                if resp.status_code == 200:
                    updated = resp.json()
                    logger.info(f"[TRACCAR API] Dispositivo ID {traccar_id} ({unique_id}) actualizado en Traccar")
                    return updated
                else:
                    logger.warning(f"[TRACCAR API] Error al actualizar dispositivo ID {traccar_id} (HTTP {resp.status_code}): {resp.text}")
        except Exception as e:
            logger.error(f"[TRACCAR API] Error de conexión al actualizar dispositivo ID {traccar_id}: {e}")
        return None

    async def delete_device(self, traccar_id: int) -> bool:
        """Elimina un dispositivo de Traccar por su ID numérico."""
        try:
            async with self._get_client() as client:
                resp = await client.delete(f"/devices/{traccar_id}")
                if resp.status_code in (200, 204):
                    logger.info(f"[TRACCAR API] Dispositivo ID {traccar_id} eliminado de Traccar")
                    return True
                else:
                    logger.warning(f"[TRACCAR API] Error al eliminar dispositivo ID {traccar_id} (HTTP {resp.status_code}): {resp.text}")
        except Exception as e:
            logger.error(f"[TRACCAR API] Error de conexión al eliminar dispositivo ID {traccar_id}: {e}")
        return False

    async def delete_device_by_unique_id(self, unique_id: str) -> bool:
        """Busca y elimina un dispositivo de Traccar por su uniqueId (IMEI)."""
        dev = await self.find_device_by_unique_id(unique_id)
        if dev and "id" in dev:
            return await self.delete_device(dev["id"])
        return False

    async def find_or_create_device(
        self,
        unique_id: str,
        name: str,
        model: Optional[str] = None,
        phone: Optional[str] = None,
        category: Optional[str] = "machinery"
    ) -> Optional[Dict[str, Any]]:
        """Garantiza que el dispositivo exista en Traccar por uniqueId (IMEI)."""
        existing = await self.find_device_by_unique_id(unique_id)
        if existing:
            return existing
        return await self.create_device(name=name, unique_id=unique_id, model=model, phone=phone, category=category)

    async def reconcile_devices(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Reconciliación bidireccional entre Traccar y PostgreSQL:
        1. Consulta Traccar GET /devices.
        2. Consulta dispositivos en PostgreSQL.
        3. Para equipos en Traccar no existentes en PostgreSQL (ej. ATC700 recién conectado):
           los da de alta en PostgreSQL vinculándolos al operador principal.
        4. Para equipos en PostgreSQL con IMEI no existentes en Traccar:
           los da de alta en Traccar para que el puerto 5027/5055 no los rechace.
        """
        stats = {
            "traccar_total": 0,
            "postgres_total": 0,
            "imported_to_postgres": 0,
            "exported_to_traccar": 0,
            "linked": 0
        }

        traccar_devs = await self.get_devices()
        stats["traccar_total"] = len(traccar_devs)
        if not traccar_devs and not settings.TRACCAR_API_URL:
            logger.warning("[TRACCAR RECONCILE] No se pudo conectar a la API de Traccar o no hay dispositivos.")
            return stats

        # Mapear dispositivos de Traccar por uniqueId limpio
        traccar_by_uid: Dict[str, Dict[str, Any]] = {}
        for td in traccar_devs:
            uid = str(td.get("uniqueId", "")).strip()
            if uid:
                traccar_by_uid[uid] = td

        # Consultar dispositivos locales de PostgreSQL
        res = await db.execute(select(Device))
        local_devs = res.scalars().all()
        stats["postgres_total"] = len(local_devs)

        # Mapear locales por traccar_unique_id y device_id
        local_by_uid: Dict[str, Device] = {}
        for ld in local_devs:
            if ld.traccar_unique_id:
                local_by_uid[str(ld.traccar_unique_id).strip()] = ld
            local_by_uid[str(ld.device_id).strip()] = ld

        # Obtener operador por defecto para asociar equipos descubiertos en Traccar
        user_res = await db.execute(
            select(User).where(User.role == "operator", User.is_active == True).order_by(User.id)
        )
        default_operator = user_res.scalars().first()
        default_user_id = default_operator.id if default_operator else None

        # 1. Traccar -> PostgreSQL: Asegurar que todo equipo en Traccar esté en PostgreSQL
        for uid, td in traccar_by_uid.items():
            if uid not in local_by_uid:
                dev_name = td.get("name") or f"Dispositivo_{uid}"
                clean_dev_id = str(uid)
                # Crear en PostgreSQL
                new_dev = Device(
                    device_id=clean_dev_id,
                    name=dev_name,
                    type="ATC700" if "atc" in dev_name.lower() or "atc" in str(td.get("model", "")).lower() else "Teltonika GPS",
                    traccar_unique_id=uid,
                    traccar_model=td.get("model") or "Teltonika",
                    sim_phone=td.get("phone"),
                    category=td.get("category") or "machinery",
                    is_active=True,
                    user_id=default_user_id
                )
                db.add(new_dev)
                await db.flush()

                # Crear estado inicial
                state = DeviceState(
                    device_id=clean_dev_id,
                    engine_hours=0.0,
                    last_ignition_state=False
                )
                db.add(state)
                local_by_uid[uid] = new_dev
                local_by_uid[clean_dev_id] = new_dev
                stats["imported_to_postgres"] += 1
                logger.info(f"[TRACCAR RECONCILE] Dispositivo Traccar {dev_name} (IMEI {uid}) importado a PostgreSQL.")
            else:
                # Ya existe: verificar que traccar_unique_id esté asignado
                existing = local_by_uid[uid]
                if not existing.traccar_unique_id:
                    existing.traccar_unique_id = uid
                    stats["linked"] += 1
                    logger.info(f"[TRACCAR RECONCILE] Dispositivo local {existing.device_id} enlazado con IMEI {uid}.")

        # 2. PostgreSQL -> Traccar: Asegurar que los equipos locales con IMEI existan en Traccar
        for ld in local_devs:
            target_uid = str(ld.traccar_unique_id or ld.device_id).strip()
            # Si parece un IMEI o identificador numérico/alfanumérico y no está en Traccar
            if target_uid and target_uid not in traccar_by_uid:
                logger.info(f"[TRACCAR RECONCILE] Exportando equipo local '{ld.name}' ({target_uid}) hacia Traccar...")
                created = await self.create_device(
                    name=ld.name,
                    unique_id=target_uid,
                    model=ld.traccar_model,
                    phone=ld.sim_phone,
                    category=ld.category
                )
                if created:
                    traccar_by_uid[target_uid] = created
                    stats["exported_to_traccar"] += 1

        await db.commit()
        logger.info(
            f"[TRACCAR RECONCILE] Reconciliación completada: Traccar={stats['traccar_total']}, "
            f"PG={stats['postgres_total']}, Importados={stats['imported_to_postgres']}, "
            f"Exportados={stats['exported_to_traccar']}, Enlazados={stats['linked']}"
        )
        return stats

traccar_client = TraccarClient()
