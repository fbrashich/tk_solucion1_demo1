import time
import requests
import random
import math

API_URL = "http://localhost:8000/api/ingest"
DEVICE_ID = "MESA_01"

# Iniciar cerca de San Juan, Argentina (-31.53, -68.52)
LAT_START = -31.53
LON_START = -68.52

print(f"Iniciando simulador IoT para el dispositivo: {DEVICE_ID}")
print(f"Apuntando a: {API_URL}")
print("-" * 40)

def generate_payload(step):
    # Simular un movimiento en círculo o espiral pequeña
    lat_offset = math.sin(step / 10.0) * 0.01
    lon_offset = math.cos(step / 10.0) * 0.01

    # Simular encendido durante 20 ciclos, luego apagado por 5 ciclos
    ignition = (step % 25) < 20

    return {
        "device_id": DEVICE_ID,
        "lat": LAT_START + lat_offset,
        "lon": LON_START + lon_offset,
        "ignition": ignition
    }

step = 0
try:
    while True:
        payload = generate_payload(step)
        print(f"[{step}] Enviando: {payload}")

        try:
            response = requests.post(API_URL, json=payload)
            if response.status_code == 200:
                print(" -> OK")
            else:
                print(f" -> ERROR: {response.status_code} - {response.text}")
        except Exception as e:
            print(f" -> ERROR CONEXION: {e}")

        step += 1
        # Esperar 5 segundos entre reportes para generar data rápido en la demo
        time.sleep(5)

except KeyboardInterrupt:
    print("\nSimulador detenido.")
