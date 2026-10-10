import urllib.request
import urllib.parse
import json

BASE_URL = "http://localhost:3000/api"

def post_form(url, data):
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=encoded, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def get_json(url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def post_json(url, data, token=None):
    encoded = json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=encoded, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def delete_req(url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="DELETE")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def main():
    print("=== TEST 1: Admin Login ===")
    admin_auth = post_form(f"{BASE_URL}/auth/login", {"username": "admin", "password": "admin123"})
    admin_token = admin_auth["access_token"]
    print("Admin logged in successfully.")

    print("\n=== TEST 2: Admin Devices (Must be 0) ===")
    admin_devs = get_json(f"{BASE_URL}/devices", admin_token)
    print(f"Dispositivos que ve el Admin: {len(admin_devs)}")
    assert len(admin_devs) == 0, f"Error: Admin no debería ver dispositivos, vio {len(admin_devs)}"

    print("\n=== TEST 3: Admin Users List with Devices Count ===")
    users = get_json(f"{BASE_URL}/admin/users", admin_token)
    for u in users:
        print(f" - Usuario: {u['username']} | Rol: {u['role']} | Dispositivos Asociados: {u['devices_count']}")

    print("\n=== TEST 4: Operator Login (aldo) ===")
    aldo_auth = post_form(f"{BASE_URL}/auth/login", {"username": "aldo", "password": "aldo123"})
    aldo_token = aldo_auth["access_token"]
    print("Aldo logged in successfully.")

    print("\n=== TEST 5: Aldo Devices List ===")
    aldo_devs = get_json(f"{BASE_URL}/devices", aldo_token)
    print(f"Dispositivos de Aldo: {len(aldo_devs)}")
    for d in aldo_devs:
        print(f" - [{d['device_id']}] {d['name']} | Traccar IMEI: {d.get('traccar_unique_id')} | Modelo: {d.get('traccar_model')}")

    print("\n=== TEST 6: Operator creates new device with Traccar fields ===")
    new_dev = post_json(f"{BASE_URL}/devices", {
        "device_id": "MESA_03",
        "name": "Mesa Concentradora Lavado 03",
        "type": "Mesa Vibratoria",
        "description": "Sector C - Molienda",
        "traccar_unique_id": "868204030100004",
        "traccar_model": "Teltonika FMB920",
        "sim_phone": "+5491155550004",
        "category": "machinery"
    }, aldo_token)
    print(f"Nuevo equipo creado: {new_dev['device_id']} ({new_dev['name']})")

    users_after_create = get_json(f"{BASE_URL}/admin/users", admin_token)
    for u in users_after_create:
        if u["username"] == "aldo":
            print(f"Nuevo conteo de Aldo en panel admin: {u['devices_count']} dispositivos")

    print("\n=== TEST 7: Operator deletes the new device ===")
    del_res = delete_req(f"{BASE_URL}/devices/MESA_03", aldo_token)
    print(f"Resultado de eliminación: {del_res}")

    users_after_delete = get_json(f"{BASE_URL}/admin/users", admin_token)
    for u in users_after_delete:
        if u["username"] == "aldo":
            print(f"Conteo final de Aldo tras eliminar: {u['devices_count']} dispositivos")

    print("\n TODOS LOS TESTS PASARON EXITOSAMENTE!")

if __name__ == "__main__":
    main()
