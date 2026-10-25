import asyncio
import urllib.request
import json
import base64
from sqlalchemy.future import select
from sqlalchemy import text, delete

from app.db import AsyncSessionLocal
from app.models.models import Device, DeviceState, TelemetryEvent, User
from app.services.traccar_client import traccar_client

TRACCAR_URL = "http://traccar:8082"
AUTH_CRED = base64.b64encode(b"admin@tokioba.com:tokioba_admin_2026").decode("ascii")

def traccar_request(endpoint: str, method: str = "GET", payload: dict = None):
    url = f"{TRACCAR_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload else None
    headers = {
        "Authorization": f"Basic {AUTH_CRED}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return e.code, body
    except Exception as e:
        return 0, str(e)

async def main():
    print("=== PASO 1: TRACCAR - OBTENER ESTADO ACTUAL ===")
    status, devs = traccar_request("/api/devices?all=true")
    print(f"Traccar total devices ({len(devs)}):")
    for d in devs:
        print(f"  ID: {d.get('id')}, Name: {d.get('name')}, IMEI: {d.get('uniqueId')}")

    status, users = traccar_request("/api/users")
    print(f"Traccar users:")
    fabian_traccar_id = None
    for u in users:
        print(f"  ID: {u.get('id')}, Email: {u.get('email')}, Name: {u.get('name')}")
        if (u.get("email") or "").strip().lower() == "fabianb@tokioba.com":
            fabian_traccar_id = u.get("id")

    print(f"Traccar Fabian User ID: {fabian_traccar_id}")

    # 1. Eliminar de Traccar todos los dispositivos excepto 863238073460331
    print("\n=== PASO 2: TRACCAR - ELIMINAR DISPOSITIVOS NO DESEADOS ===")
    keep_traccar_device_id = None
    for d in devs:
        uid = str(d.get("uniqueId")).strip()
        dev_id = d.get("id")
        if uid == "863238073460331":
            keep_traccar_device_id = dev_id
            print(f"-> CONSERVAR dispositivo Traccar: ID={dev_id}, Name='{d.get('name')}', IMEI={uid}")
        else:
            print(f"-> ELIMINANDO dispositivo Traccar: ID={dev_id}, Name='{d.get('name')}', IMEI={uid}...")
            del_status, del_resp = traccar_request(f"/api/devices/{dev_id}", method="DELETE")
            print(f"   Resultado DELETE: HTTP {del_status}")

    # 2. Vincular 863238073460331 a fabianb@tokioba.com en Traccar
    print("\n=== PASO 3: TRACCAR - VINCULAR A fabianb@tokioba.com ===")
    if keep_traccar_device_id and fabian_traccar_id:
        perm_status, perm_resp = traccar_request(
            "/api/permissions",
            method="POST",
            payload={"userId": fabian_traccar_id, "deviceId": keep_traccar_device_id}
        )
        print(f"Vinculación en Traccar de dispositivo {keep_traccar_device_id} con usuario {fabian_traccar_id}: HTTP {perm_status}")
    else:
        print(f"ALERTA: keep_traccar_device_id={keep_traccar_device_id}, fabian_traccar_id={fabian_traccar_id}")

    # 3. Base de Datos Custom (PostgreSQL)
    print("\n=== PASO 4: CUSTOM (POSTGRESQL) - ACTUALIZAR Y PURGAR ===")
    async with AsyncSessionLocal() as session:
        # Buscar usuario fabianb@tokioba.com
        user_res = await session.execute(select(User).where(User.username == "fabianb@tokioba.com"))
        fabian_pg_user = user_res.scalars().first()
        if not fabian_pg_user:
            print("ERROR: Usuario 'fabianb@tokioba.com' no encontrado en PostgreSQL!")
            return
        print(f"Usuario PostgreSQL 'fabianb@tokioba.com' encontrado: ID={fabian_pg_user.id}")

        # Buscar todos los dispositivos en PostgreSQL
        dev_res = await session.execute(select(Device))
        all_pg_devs = dev_res.scalars().all()
        
        dev_to_keep = None
        devs_to_remove = []

        for dev in all_pg_devs:
            clean_uid = str(dev.traccar_unique_id or dev.device_id).strip()
            if clean_uid == "863238073460331" or dev.traccar_unique_id == "863238073460331":
                dev_to_keep = dev
            else:
                devs_to_remove.append(dev)

        if dev_to_keep:
            print(f"-> CONSERVAR y ACTUALIZAR dispositivo Custom ID={dev_to_keep.id}, device_id={dev_to_keep.device_id}")
            dev_to_keep.name = "Van  Operarios"
            dev_to_keep.user_id = fabian_pg_user.id
            dev_to_keep.traccar_unique_id = "863238073460331"
            dev_to_keep.traccar_model = "Teltonika FMC150"
            dev_to_keep.is_active = True
            print(f"   Dispositivo reasignado a {fabian_pg_user.username} (user_id={fabian_pg_user.id}) con nombre '{dev_to_keep.name}'")
        else:
            print("-> Dispositivo 863238073460331 no encontrado en Postgres. Creándolo...")
            dev_to_keep = Device(
                device_id="FMC150_331",
                name="Van  Operarios",
                type="Teltonika GPS",
                description="Unidad de Transporte de Operarios (FMC150)",
                is_active=True,
                user_id=fabian_pg_user.id,
                traccar_unique_id="863238073460331",
                traccar_model="Teltonika FMC150",
                category="car"
            )
            session.add(dev_to_keep)

        # Purgar dispositivos removidos
        for dev in devs_to_remove:
            print(f"-> ELIMINANDO dispositivo Custom ID={dev.id}, device_id={dev.device_id}, name='{dev.name}', IMEI={dev.traccar_unique_id}")
            # Limpiar eventos y estados asociados
            await session.execute(delete(TelemetryEvent).where(TelemetryEvent.device_id == dev.device_id))
            await session.execute(delete(DeviceState).where(DeviceState.device_id == dev.device_id))
            await session.delete(dev)

        await session.commit()
        print("Cambios en PostgreSQL guardados exitosamente.")

    print("\n=== PASO 5: FORZAR RECONCILIACIÓN Y VALIDACIÓN FINAL ===")
    async with AsyncSessionLocal() as session:
        stats = await traccar_client.reconcile_devices(session, force=True)
        print(f"Reconciliación stats: {stats}")

        # Validar dispositivos en Postgres
        res_after = await session.execute(select(Device))
        final_devs = res_after.scalars().all()
        print(f"\nDispositivos finales en Custom (PostgreSQL) ({len(final_devs)}):")
        for d in final_devs:
            u_res = await session.execute(select(User).where(User.id == d.user_id))
            owner = u_res.scalars().first()
            owner_name = owner.username if owner else "Sin dueño"
            print(f"  Device ID: {d.device_id} | Name: '{d.name}' | IMEI: {d.traccar_unique_id} | Owner: {owner_name} (ID {d.user_id}) | Active: {d.is_active}")

    # Validar dispositivos en Traccar
    status, devs_after = traccar_request("/api/devices?all=true")
    print(f"\nDispositivos finales en TRACCAR ({len(devs_after)}):")
    for d in devs_after:
        print(f"  ID: {d.get('id')} | Name: '{d.get('name')}' | IMEI: {d.get('uniqueId')}")

    if fabian_traccar_id:
        status, fab_devs = traccar_request(f"/api/devices?userId={fabian_traccar_id}")
        print(f"\nDispositivos asignados a fabianb@tokioba.com en TRACCAR ({len(fab_devs)}):")
        for d in fab_devs:
            print(f"  ID: {d.get('id')} | Name: '{d.get('name')}' | IMEI: {d.get('uniqueId')}")

if __name__ == "__main__":
    asyncio.run(main())
