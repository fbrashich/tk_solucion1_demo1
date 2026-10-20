import logging
import time
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
        self._last_reconcile_time: float = 0.0


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

    async def get_devices(self, all_devices: bool = True) -> List[Dict[str, Any]]:
        """Obtiene todos los dispositivos registrados en Traccar (con all=true para incluir todos los usuarios)."""
        url = f"{self.base_url}/devices"
        params = {"all": "true"} if all_devices else {}
        try:
            async with self._get_client() as client:
                resp = await client.get("/devices", params=params)
                if resp.status_code == 200:
                    return resp.json()
                elif resp.status_code == 401:
                    logger.error(f"[TRACCAR API] Error de autenticación (401) en {url} con usuario {self.username}")
                else:
                    logger.warning(f"[TRACCAR API] GET /devices retornó HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"[TRACCAR API] Error de conexión al consultar dispositivos ({url}): {e}")
        return []

    async def get_users(self) -> List[Dict[str, Any]]:
        """Obtiene la lista de usuarios registrados en Traccar."""
        try:
            async with self._get_client() as client:
                resp = await client.get("/users")
                if resp.status_code == 200:
                    return resp.json()
                logger.warning(f"[TRACCAR API] GET /users retornó HTTP {resp.status_code}")
        except Exception as e:
            logger.error(f"[TRACCAR API] Error consultando usuarios de Traccar: {e}")
        return []

    async def get_user_devices(self, traccar_user_id: int) -> List[Dict[str, Any]]:
        """Obtiene dispositivos asignados a un usuario específico en Traccar."""
        try:
            async with self._get_client() as client:
                resp = await client.get("/devices", params={"userId": traccar_user_id})
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.error(f"[TRACCAR API] Error consultando equipos del usuario Traccar {traccar_user_id}: {e}")
        return []

    async def link_device_to_user(self, traccar_user_id: int, traccar_device_id: int) -> bool:
        """Asocia un dispositivo a un usuario en Traccar mediante la API de permisos."""
        try:
            async with self._get_client() as client:
                resp = await client.post("/permissions", json={"userId": traccar_user_id, "deviceId": traccar_device_id})
                return resp.status_code in (200, 204)
        except Exception as e:
            logger.error(f"[TRACCAR API] Error vinculando device {traccar_device_id} a user {traccar_user_id}: {e}")
        return False

    async def find_device_by_unique_id(self, unique_id: str) -> Optional[Dict[str, Any]]:
        """Busca un dispositivo por uniqueId (IMEI) en Traccar."""
        clean_uid = str(unique_id).strip()
        devices = await self.get_devices(all_devices=True)
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
        category: Optional[str] = "machinery",
        owner_email: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Crea un nuevo dispositivo en Traccar y lo asocia al usuario si se especifica."""
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
                    dev_id = created.get("id")
                    logger.info(f"[TRACCAR API] Dispositivo '{name}' ({clean_uid}) creado en Traccar exitosamente (ID: {dev_id})")
                    # Vincular al admin siempre
                    if dev_id:
                        await self.link_device_to_user(1, dev_id)
                        # Si se especificó un email propietario, vincularlo también
                        if owner_email:
                            t_users = await self.get_users()
                            for tu in t_users:
                                u_email = (tu.get("email") or tu.get("login") or "").strip().lower()
                                if u_email == owner_email.strip().lower():
                                    await self.link_device_to_user(tu["id"], dev_id)
                                    logger.info(f"[TRACCAR API] Dispositivo {clean_uid} vinculado al usuario Traccar {owner_email} (ID: {tu['id']})")
                                    break
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
        category: Optional[str] = "machinery",
        owner_email: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Garantiza que el dispositivo exista en Traccar por uniqueId (IMEI)."""
        existing = await self.find_device_by_unique_id(unique_id)
        if existing:
            return existing
        return await self.create_device(
            name=name, 
            unique_id=unique_id, 
            model=model, 
            phone=phone, 
            category=category,
            owner_email=owner_email
        )

    async def reconcile_devices(self, db: AsyncSession, force: bool = False) -> Dict[str, Any]:
        """
        Reconciliación bidireccional inteligente entre Traccar y PostgreSQL:
        1. Consulta Traccar GET /devices?all=true (obtiene todos los equipos de todos los usuarios).
        2. Consulta Traccar GET /users y mapea qué equipo pertenece a qué usuario (ej. fabianb@tokioba.com).
        3. Para equipos en Traccar no existentes en PostgreSQL (ej. ATC700):
           los da de alta en PostgreSQL vinculándolos directamente a la cuenta del operador dueño.
        4. Si el equipo ya existía en PostgreSQL pero con un user_id diferente, corrige la propiedad.
        5. Para equipos en PostgreSQL no existentes en Traccar:
           los da de alta en Traccar y los vincula a la cuenta correspondiente.
        """
        stats = {
            "traccar_total": 0,
            "postgres_total": 0,
            "imported_to_postgres": 0,
            "exported_to_traccar": 0,
            "linked": 0
        }

        now_ts = time.time()
        if not force and (now_ts - self._last_reconcile_time) < 5.0:
            return stats
        self._last_reconcile_time = now_ts

        # 1. Obtener todos los dispositivos de Traccar (con all=true)
        traccar_devs = await self.get_devices(all_devices=True)

        stats["traccar_total"] = len(traccar_devs)
        if not traccar_devs and not settings.TRACCAR_API_URL:
            logger.warning("[TRACCAR RECONCILE] No se pudo conectar a la API de Traccar o no hay dispositivos.")
            return stats

        # 2. Mapear usuarios de Traccar y qué dispositivos le pertenecen a cada uno
        traccar_users = await self.get_users()
        device_to_owner_email: Dict[str, str] = {}
        for tu in traccar_users:
            tu_id = tu.get("id")
            tu_email = (tu.get("email") or tu.get("login") or "").strip().lower()
            if tu_id and tu_email and tu_email != "admin@tokioba.com":
                u_devs = await self.get_user_devices(tu_id)
                for ud in u_devs:
                    u_uid = str(ud.get("uniqueId", "")).strip()
                    if u_uid:
                        device_to_owner_email[u_uid] = tu_email

        # 3. Mapear dispositivos de Traccar por uniqueId limpio
        traccar_by_uid: Dict[str, Dict[str, Any]] = {}
        for td in traccar_devs:
            uid = str(td.get("uniqueId", "")).strip()
            if uid:
                traccar_by_uid[uid] = td

        # 4. Consultar dispositivos locales de PostgreSQL
        res = await db.execute(select(Device))
        local_devs = res.scalars().all()
        stats["postgres_total"] = len(local_devs)

        # Mapear locales por traccar_unique_id y device_id
        local_by_uid: Dict[str, Device] = {}
        for ld in local_devs:
            if ld.traccar_unique_id:
                local_by_uid[str(ld.traccar_unique_id).strip()] = ld
            local_by_uid[str(ld.device_id).strip()] = ld

        # 5. Consultar usuarios locales en PostgreSQL para asociar correctamente por email/username
        user_res = await db.execute(select(User))
        local_users = user_res.scalars().all()
        local_users_by_email: Dict[str, User] = {u.username.strip().lower(): u for u in local_users}

        # Operador por defecto de respaldo
        op_res = await db.execute(
            select(User).where(User.role == "operator", User.is_active == True).order_by(User.id)
        )
        default_operator = op_res.scalars().first()
        default_user_id = default_operator.id if default_operator else None

        # 6. Traccar -> PostgreSQL: Asegurar que todo equipo en Traccar esté en PostgreSQL con su dueño
        for uid, td in traccar_by_uid.items():
            owner_email = device_to_owner_email.get(uid)
            target_user = local_users_by_email.get(owner_email) if owner_email else None
            assigned_user_id = target_user.id if target_user else default_user_id

            if uid not in local_by_uid:
                dev_name = td.get("name") or f"Dispositivo_{uid}"
                clean_dev_id = str(uid)
                new_dev = Device(
                    device_id=clean_dev_id,
                    name=dev_name,
                    type="ATC700" if "atc" in dev_name.lower() or "atc" in str(td.get("model", "")).lower() else "Teltonika GPS",
                    traccar_unique_id=uid,
                    traccar_model=td.get("model") or "Teltonika ATC700",
                    sim_phone=td.get("phone"),
                    category=td.get("category") or "machinery",
                    is_active=True,
                    user_id=assigned_user_id
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
                logger.info(f"[TRACCAR RECONCILE] Dispositivo Traccar '{dev_name}' (IMEI {uid}) importado a PostgreSQL para usuario '{owner_email or assigned_user_id}'.")
            else:
                existing = local_by_uid[uid]
                if not existing.traccar_unique_id:
                    existing.traccar_unique_id = uid
                    stats["linked"] += 1
                    logger.info(f"[TRACCAR RECONCILE] Dispositivo local {existing.device_id} enlazado con IMEI {uid}.")

                # Si el usuario en Traccar es un operador específico y en PostgreSQL estaba asignado a otro, corregir
                if target_user and existing.user_id != target_user.id:
                    existing.user_id = target_user.id
                    logger.info(f"[TRACCAR RECONCILE] Reasignado equipo {existing.device_id} al usuario {target_user.username}")

            # Vincular en Traccar al administrador por seguridad
            t_id = td.get("id")
            if t_id:
                await self.link_device_to_user(1, t_id)

        # 7. PostgreSQL -> Traccar: Exportar equipos locales faltantes hacia Traccar
        for ld in local_devs:
            target_uid = str(ld.traccar_unique_id or ld.device_id).strip()
            if target_uid and target_uid not in traccar_by_uid:
                owner_user = next((u for u in local_users if u.id == ld.user_id), None)
                owner_email = owner_user.username if owner_user else None
                logger.info(f"[TRACCAR RECONCILE] Exportando equipo local '{ld.name}' ({target_uid}) hacia Traccar...")
                created = await self.create_device(
                    name=ld.name,
                    unique_id=target_uid,
                    model=ld.traccar_model,
                    phone=ld.sim_phone,
                    category=ld.category,
                    owner_email=owner_email
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
