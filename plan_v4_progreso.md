# Registro de Progreso y Ejecución - Plan v4 (Commercial Release)
## Plataforma Tokioba Telematics & Fleet IoT

Este documento audita y certifica la implementación de los Sprints técnicos y comerciales definidos en [plan_v4.md](file:///d:/TK_DEMO1/tk_solucion1_demo1/plan_v4.md).

---

## Estado General de los Sprints

| Sprint | Versión | Alcance Principal | Estado | Cobertura de Tests |
| :---: | :---: | :--- | :---: | :---: |
| **Sprint 1** | **`v0.5.0`** | **Geocercas Inteligentes, Despachador Telegram y Control Horario** | 🟢 **100% COMPLETADO** | 12 Tests (PASS) |
| **Sprint 2** | **`v0.6.0`** | Reportes Ejecutivos en PDF Corporativo y Corte de Motor Remoto Seguro | ⏳ Pendiente | En backlog |
| **Sprint 3** | **`v1.0.0`** | Telemetría de Combustible, Pentesting Exhaustivo y Lanzamiento GA | ⏳ Pendiente | En backlog |

---

## 1. Detalle de Implementación: Sprint 1 (`v0.5.0`)

### 1.1 Módulo de Geocercas Inteligentes y Control de Permanencia
* **Modelos Relacionales ([`models.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/models/models.py)):**
  - `Geofence`: `id`, `user_id`, `name`, `description`, `type` (`POLYGON`, `CIRCLE`), `center_lat`, `center_lon`, `radius_meters`, `polygon_vertices` (JSONB con lista de vértices `[[lat, lon], ...]`), `color`, `speed_limit_kmh`, `is_active`, `created_at`.
  - `GeofenceEvent`: `id`, `geofence_id`, `device_id`, `event_type` (`ENTER`, `EXIT`, `OVERSPEED`), `timestamp`, `latitude`, `longitude`, `speed_kmh`, `duration_inside_seconds`.
* **Migraciones DDL Idempotentes ([`init_db.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/init_db.py)):**
  - Creación de tablas `geofences` y `geofence_events` con índices `idx_geofences_user`, `idx_geofence_events_device_time` y `idx_geofence_events_geofence`.
* **Algoritmos Geodésicos y Topológicos ([`geofence_engine.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/geofence_engine.py)):**
  - **Ray-Casting Algorithm:** Algoritmo en Python puro para determinar contención de coordenadas en polígonos complejos sin requerir PostGIS ni dependencias C. Tiempo de ejecución $< 1.5\ \mu\text{s}$ por chequeo.
  - **Fórmula de Haversine:** Para cálculo ortodrómico en geocercas circulares.
  - **Filtro Anti-Jitter (Debouncing):** Memoria de estado por `(device_id, geofence_id)` que exige al menos 2 posiciones consecutivas estables para consolidar transiciones `ENTER` o `EXIT`, evitando falsas alarmas por deriva o ruido GPS.
  - **Cálculo de Permanencia:** Al registrar `EXIT`, calcula automáticamente la duración total dentro en segundos.
* **Integración en Ingesta de Telemetría ([`ingest.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/api/ingest.py)):**
  - Invocación automática de `evaluate_geofences_for_device` tras cada posición telemática procesada.
* **API REST Segura ([`geofences.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/api/geofences.py)):**
  - `GET /api/geofences`: Listado con conteo en tiempo real de unidades adentro.
  - `POST /api/geofences`: Creación con validación de geometrías.
  - `PUT /api/geofences/{id}`: Modificación con aislamiento Anti-IDOR.
  - `DELETE /api/geofences/{id}`: Eliminación en cascada.
  - `GET /api/geofences/{id}/events`: Historial de ingresos, egresos y excesos de velocidad.
  - `GET /api/devices/{device_id}/geofence-events`: Eventos por vehículo.
* **Frontend UI ([`GeofenceManagerModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/GeofenceManagerModal.jsx) y [`Dashboard.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/pages/Dashboard.jsx)):**
  - Diseñador visual con Leaflet: clic sobre el mapa para fijar centro y regular radio (círculo) o colocar vértices con opción de deshacer (polígono).
  - Visualización en tiempo real de las geocercas activas sobre el mapa principal del Dashboard con colores personalizados y popups informativos.
  - Botón con contador de geocercas activas en la barra de navegación.
  - **Comportamiento de Posicionamiento Inteligente del Mapa al Crear Geocerca:**
    - **Modo Dispositivo Individual:** Al abrir el diseñador con un vehículo seleccionado (ej: *Van Operarios*), el mapa centra automáticamente sobre las coordenadas GPS del dispositivo con zoom 15, marcador con pulso radar cian, HUD con nombre/coordenadas y botón *"Fijar centro en vehículo"*.
    - **Modo Flota Completa:** Al abrir el diseñador con *"Toda la Flota"* seleccionada, el mapa detecta y posiciona automáticamente en la ubicación geográfica aproximada de la IP pública del usuario conectado (vía `/api/client-ip-location` / `ipwho.is`), fijando el centro en la ciudad/región del usuario (ej: Olivos / Buenos Aires), marcador de brújula azul con halo pulsante, HUD *"Flota Completa • Ubicación IP: <Ciudad>"*, y botón *"Fijar centro en tu ubicación IP"*.
  - **Tarjeta Dinámica 'Zona Operativa':**
    - En la vista global de flota (`isFleetView` / todos los dispositivos simultáneos), la tarjeta se oculta completamente del DOM y la grilla de métricas se adapta automáticamente a 3 columnas (`lg:grid-cols-3`).
    - En la vista de dispositivo individual, la tarjeta reporta en tiempo real el nombre de la zona operativa en la que se ubica la unidad (evaluada geométricamente mediante Ray-Casting y Haversine), su indicador visual de color y estado *"Dentro de zona"*, o bien *"Fuera de Zona Delimitada"* con opción directa de centrado en mapa.

### 1.2 Despachador Multicanal de Alertas a Telegram ([`notification_dispatcher.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/notification_dispatcher.py))
* Integración directa con **Telegram Bot API** (`https://api.telegram.org/bot<token>/sendMessage`).
* Despacho asíncrono no bloqueante (`asyncio.create_task` en executor separado) para no penalizar la latencia del pipeline de ingesta ($< 800\text{ ms}$).
* Plantillas HTML enriquecidas con emojis contextuales:
  - 🚨 `ALERTA CRÍTICA` (Corte de energía, batería crítica, remolque/grúa).
  - 📍 `INGRESO A ZONA SEGURA` / 📤 `EGRESO DE ZONA SEGURA` (con tiempo de permanencia).
  - ⛔ `EXCESO DE VELOCIDAD EN ZONA` (con velocidad registrada).
  - 🌙 `ACTIVIDAD FUERA DE HORARIO OPERATIVO`.
  - Enlace directo al Dashboard en cada mensaje.

### 1.3 Control de Horarios Operativos ([`alert_engine.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/alert_engine.py))
* Atributos de configuración añadidos a `Device`: `work_schedule_enabled`, `work_schedule_start`, `work_schedule_end`, `allowed_weekdays`.
* Nueva regla operativa: si `work_schedule_enabled == True` y `ignition == True` fuera del rango de horas o en días no laborables, se genera automáticamente la alerta `UNAUTHORIZED_SCHEDULE` (severidad `WARNING`), se persiste en BD, se emite vía SSE y se despacha a Telegram.

---

## 2. Resultados de las Pruebas Automatizadas

Se ejecutó la suite consolidada de pruebas unitarias sobre el backend:
1. `test_stage2_states_and_calibration.py`: 8 tests (100% PASS)
2. `test_stage3_trips_and_playback.py`: 3 tests (100% PASS)
3. `test_stage4_alerts_and_maintenance.py`: 14 tests (100% PASS)
4. `test_version_and_security_spec.py`: 11 tests (100% PASS)
5. `test_stage5_geofences_and_notifications.py`: 12 tests (100% PASS)

> **Total Consolidado:** **48 pruebas unitarias aprobadas al 100%** en 0.036 segundos.

---

## 3. Despliegue y Certificación en Servidor de Producción (Raspberry Pi 4B - `172.16.22.2`)

* **Identificación del Servidor:**
  - IP LAN: `172.16.22.2` (acceso SSH vía clave `id_ed25519_tokioba`, usuario `iot_admin_srv`).
  - Almacenamiento: Repositorio en SSD de alta velocidad `/mnt/ssd/tokioba-iot`.
* **Causa Raíz Diagnosticada de la Ausencia del Botón Geocercas:**
  - El volumen de Nginx `telemetry_web` montaba estáticamente `/mnt/ssd/tokioba-iot/frontend/dist` compilado el 21 de octubre (hace 5 días).
  - La tarjeta SD (`/dev/mmcblk0p2`) se encontraba al 96% de capacidad por caché acumulada de compilaciones anteriores (`docker builder`), lo que provocaba errores `no space left on device` al ejecutar comandos de snapshot.
* **Soluciones y Acciones Aplicadas:**
  1. `docker builder prune -a -f`: Liberación de 907 MB en la tarjeta SD de la Pi.
  2. Construcción de la imagen actualizada `tokioba-iot-api:latest` (`v0.5.0-dev`).
  3. Compilación optimizada del frontend (`vite build`) en contenedor `node:22-alpine` generando el nuevo bundle de producción (`dist/assets/index-1YbNCHdX.js`).
  4. Migraciones DDL aplicadas en `telemetry_db` (creación de tablas `geofences`, `geofence_events` e índices).
  5. Contenedores reiniciados y operativos: `telemetry_api`, `telemetry_web`, `telemetry_gateway`, `telemetry_traccar`, `telemetry_db`.
* **Verificación Web Simulada en Vivo:**
  - Login exitoso con credenciales `fabianb@tokioba.com` / `fabian123`.
  - Botón **`Geocercas`** presente y destacado en la barra de navegación superior.
  - Botón **`+ Geocercas`** visible en el encabezado de la tarjeta del mapa (`Mapa de Toda la Flota`).
  - Tarjeta *"Zona Operativa"* correctamente oculta en la vista global (`Toda la Flota`) según especificación.
  - Apertura y renderizado completo del modal *"Gestor de Geocercas Inteligentes"* con diseñador Leaflet sin marcas de agua.
  - **Centrado Automático por Vehículo Verificado:** Al seleccionar *Van Operarios* (`FMC150_331`), el modal centra en sus coordenadas exactas (`-34.5496, -58.4948`), zoom 15, con marcador cian de radar y HUD contextual.
  - **Centrado Automático por IP del Usuario Verificado:** Al seleccionar *Toda la Flota*, el modal consulta la IP pública del usuario (`190.225.66.150`), centrando en su ubicación aproximada (Olivos / Buenos Aires, `-34.5087, -58.4802`), zoom 13, con marcador de brújula azul y HUD informativo.

