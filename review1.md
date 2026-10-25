# Tarea: Auditoría de `plan_v2.md`, Análisis de Payload Real (`FMC150_331`) y Generación de `plan_v3.md` (Exclusivo Plataforma Custom)

## 1. Objetivo
Ya estamos recibiendo telemetría real en nuestra plataforma desde un dispositivo **Teltonika FMC150** (`device_name: "Van Operarios"`, IMEI `863238073460331`).
Necesito que inspecciones exhaustivamente el archivo `plan_v2.md` actual y el código fuente de nuestra **Plataforma Custom** (FastAPI + PostgreSQL + React/Leaflet), analices el payload JSON real que estamos recibiendo, evalúes las necesidades reales de los clientes finales de plataformas de gestión de flotas/activos, y generes el nuevo documento maestro **`plan_v3.md`**.

> **IMPORTANTE:** Todo el análisis, arquitectura y hoja de ruta de `plan_v3.md` debe enfocarse **exclusivamente en nuestra Plataforma Custom** (dejando a Traccar únicamente como motor silencioso de ingesta en segundo plano).

---

## 2. Insumo Técnico: Payload JSON Real Recibido (`FMC150_331`)
Utiliza esta trama real recibida en producción como base empírica para el análisis:

```json
{
  "id": 0,
  "attributes": {
    "priority": 0,
    "sat": 0,
    "event": 0,
    "ignition": false,
    "motion": false,
    "rssi": 5,
    "io200": 3,
    "io69": 3,
    "power": 12.447,
    "battery": 0,
    "io68": 0,
    "operator": 722310,
    "odometer": 35500,
    "distance": 0,
    "totalDistance": 14397775.444186496
  },
  "deviceId": 1307,
  "protocol": "teltonika",
  "serverTime": "2026-10-25T21:10:59.242+00:00",
  "deviceTime": "2026-10-25T21:10:23.000+00:00",
  "fixTime": "2026-10-25T21:10:23.000+00:00",
  "valid": false,
  "latitude": -34.5496566,
  "longitude": -58.4948666,
  "altitude": 0,
  "speed": 0,
  "course": 0,
  "address": null,
  "accuracy": 0,
  "network": null,
  "geofenceIds": null,
  "speed_kmh": 0,
  "device_uniqueId": "863238073460331",
  "device_name": "Van  Operarios",
  "normalized": {
    "ignition": false,
    "motion": false,
    "power": 12.45,
    "battery": 0,
    "totalDistance": 14397775.444186496,
    "hours": null,
    "sat": null,
    "rssi": 5,
    "serverTime": "2026-10-25T21:10:59.242+00:00"
  }
}
```

## 3. Pasos de Análisis Previo a la Redacción
Antes de escribir `plan_v3.md`, ejecuta las siguientes revisiones en el repositorio:

1. **Evaluación de `plan_v2.md` y Estado del Código:**
   - Lee `plan_v2.md` completo y compáralo con el estado real del backend (`FastAPI`) y frontend (`React`).
   - Identifica qué puntos de `plan_v2.md` ya están cumplidos, cuáles están a mitad de camino y cuáles quedaron obsoletos o pendientes.
2. **Auditoría Técnica del Payload `FMC150_331`:**
   - **Bug de Falsy Values (`sat: 0` -> `null`):** En `attributes.sat` llega `0`, pero en `normalized.sat` se transforma en `null` (probablemente por usar `or None` en lugar de `is not None`). Verifica en el código dónde más ocurre esto (ej. `battery: 0`, `speed: 0`, `course: 0`).
   - **Interpretación de Códigos AVL Teltonika FMC150:**
     - `io200: 3` = Modo *Online Deep Sleep* activo.
     - `io69: 3` = Módulo GNSS apagado por ahorro de energía (lo cual explica `valid: false` y `sat: 0` cuando `ignition: false`).
     - `io68: 0` = Corriente de batería interna (mA).
     - `operator: 722310` = Operador móvil (MCC 722 Argentina, MNC 310 Claro).
   - **Discrepancia de Odómetros y Horómetro Nulo:**
     - `attributes.odometer` (`35500` m) vs `attributes.totalDistance` (`14397775.44` m).
     - `normalized.hours` llega en `null`, requiriendo que nuestra plataforma Custom calcule y persista las horas de motor de forma autónoma cuando `ignition: true`.
   - **Saneamiento de Strings:** Observa que `device_name` tiene doble espacio (`"Van  Operarios"`).

---

### Sección 4: Mejoras a Agregar (Valor Real para Clientes y Usuarios Finales)
Diseña las funcionalidades que los dueños de flotas, jefes de operaciones y usuarios no técnicos realmente valoran en una plataforma Custom moderna, aprovechando los datos que ya entrega el `FMC150_331`:
1. **Estados Operativos Inteligentes (Semántica de Negocio en vez de datos crudos):**
   - Traducir combinaciones técnicas a estados claros en UI:
     - 🟢 **En Movimiento** (`ignition: true`, `motion: true`, `speed_kmh > 0`).
     - 🟡 **Ralentí / Motor Encendido Detenido** (`ignition: true`, `motion: false`, `speed_kmh == 0`) -> *Clave para control de combustible*.
     - 🔵 **Estacionado (Modo Ahorro / Online)** (`ignition: false`, `io200: 3`, reporte reciente) -> *Evita que el cliente piense que el GPS no anda cuando `valid: false`*.
     - 🔴 **Sin Reporte / Desconectado** (`now - serverTime > umbral`).
2. **Salud Eléctrica del Vehículo y Alertas Preventivas:**
   - Monitoreo de batería del vehículo (`power: 12.45V`): alerta de batería baja (`< 11.8V` apagado), validación de alternador cargando (`> 13.5V` con motor encendido) y alerta de desconexión/sabotaje de alimentación (`power == 0` o caída brusca + paso a `battery` interna).
3. **Odómetro y Horómetro Calibrables (Tablero Real):**
   - Posibilidad de configurar un `odometer_offset` y `engine_hours_offset` por vehículo para que el kilometraje y las horas que muestra nuestra plataforma Custom coincidan exactamente con el tablero físico de la "Van Operarios".
4. **Módulo de Viajes, Paradas y Replay de Recorridos:**
   - Detección automática de viajes (Inicio de contacto `ignition: true` -> Fin de contacto `ignition: false`) con resumen de km recorridos, tiempo en marcha, tiempo en ralentí y velocidad máxima.
5. **Mantenimiento Preventivo por Km u Horas de Motor:**
   - Alertas simples (ej. "Faltan 450 km o 12 hs de motor para cambio de aceite/service").
6. **Diagnóstico de Conectividad Transparente:**
   - Mostrar operador decodificado (`722310` -> `Claro AR`), nivel de señal celular (`rssi: 5/5`) y estado del módulo GPS (`io69`).

### Sección 5: Etapas de Integración (Roadmap de Implementación en la Plataforma Custom)
Organiza la ejecución en **4 Etapas incrementales, claras y verificables** (pensadas para ejecutar ticket por ticket con Antigravity):
- **Etapa 1: Saneamiento de Datos, Bugfixes de Normalización y Decodificación FMC150** (Backend FastAPI + DB).
- **Etapa 2: Motor de Estados Operativos, Odómetro/Horómetro Calibrable y Salud de Batería** (Backend + UI Cards/Mapa).
- **Etapa 3: Limpieza de Redundancias API y Detección de Viajes/Paradas + Ralentí** (Backend + Historial en React).
- **Etapa 4: Alertas Operativas, Mantenimiento Preventivo y Experiencia de Usuario Final**.

*(Para cada etapa, incluye: Objetivo, Archivos a modificar en el repo, Criterios de Aceptación y Pruebas de Validación).*

---

## 5. Entregable
1. Crea y guarda el archivo `plan_v3.md` completo en el repositorio.
2. Muéstrame en el chat un resumen ejecutivo de lo que encontraste en `plan_v2.md` y cómo quedaron estructuradas las 4 etapas en `plan_v3.md`.
