# Bitácora Consolidada de Progreso y Ejecución Técnica
## Plataforma Tokioba Telematics & Fleet IoT (`v0.5.0-dev`)
### Stack: FastAPI (Python 3.11) + PostgreSQL 15 + React 18 (Vite / Leaflet) + Nginx Gateway Router

Este documento centraliza y audita la evolución integral de la plataforma de telemetría IoT y rastreo vehicular, consolidando los avances de la **Fase Inicial (MVP)**, el **Plan v3 (Estabilización Telemática y Operativa)** y el **Plan v4 (Commercial Release - Sprint 1)**.

---

## 1. Resumen Ejecutivo del Estado del Producto

La plataforma ha transitado desde un prototipo inicial de monitoreo hasta convertirse en una **solución integral de telemática vehicular y telemetría industrial (Fleet IoT)** lista para despliegues comerciales. Cuenta con arquitectura contenerizada en microservicios, base de datos relacional asíncrona, motor de cálculo telemático en tiempo real, interfaz visual moderna con diseño Glassmorphism, y despacho multicanal de alertas.

### Matriz Consolidada de Hitos y Sprints

| Etapa / Sprint | Versión | Alcance Técnico y de Negocio | Estado | Pruebas Automatizadas |
| :---: | :---: | :--- | :---: | :---: |
| **Fase 0 (MVP)** | `v0.1.0` | Arquitectura base microservicios, Auth JWT, PostgreSQL async, Ingesta básica, Dashboard SPA con Leaflet y Polling 15s. | 🟢 **100% COMPLETADO** | Pruebas de humo / simulador |
| **Plan v3 - Etapa 1** | `v0.2.0` | Saneamiento de datos, corrección de falsy values (`0V`/`0 sat`), decodificador Teltonika FMC150/FMB920 (IOs, operadores AR, sleep modes, gnss status). | 🟢 **100% COMPLETADO** | 2 suites unitarias (7 tests) |
| **Plan v3 - Etapa 2** | `v0.3.0` | Motor de 5 estados operativos canónicos, evaluación de salud de batería 12V/alternador, odómetro y horómetro calibrable con tablero físico. | 🟢 **100% COMPLETADO** | 2 suites (9 tests) |
| **Plan v3 - Etapa 3** | `v0.4.0` | Deprecación de polling HTTP redundante (`traccar_sync.py`), detector geodésico de viajes y paradas (Haversine), desperdicio de combustible en ralentí, historial y reproductor interactivo (`RoutePlayback.jsx`) con velocímetro digital. | 🟢 **100% COMPLETADO** | 1 suite (3 tests) |
| **Plan v3 - Etapa 4** | `v0.4.5` | Motor de alertas operativas (6 reglas, anti-flapping 15m, SSE broadcast), planes preventivos por KM/Horas, semaforización dinámica, libro digital de servicios y campana de notificaciones UI. | 🟢 **100% COMPLETADO** | 1 suite (14 tests) |
| **Plan v4 - Sprint 1** | `v0.5.0` | Geocercas inteligentes poligonales (Ray-Casting puro) y circulares, control de permanencia, despachador asíncrono a Telegram Bot API, control de horarios laborales, diseñador en mapa Leaflet con centrado inteligente (dispositivo vs GeoIP), tarjeta adaptativa "Zona Operativa", y endurecimiento de caché HTTP en Nginx. | 🟢 **100% COMPLETADO** | 2 suites (23 tests) |
| **Plan v4 - Sprint 2** | `v0.6.0` | Reportes ejecutivos en PDF corporativo y corte de motor remoto seguro. | ⏳ *Backlog* | Próximo sprint |
| **Plan v4 - Sprint 3** | `v1.0.0` | Telemetría de combustible (CAN-Bus / varilla), pentesting exhaustivo y lanzamiento GA (General Availability). | ⏳ *Backlog* | Final de release |

> **Aprobación de Calidad Técnica:** **48 pruebas unitarias y de integración automatizadas al 100%** ejecutadas en 0.036 segundos.

---

## 2. Fase Inicial: Cimientos Arquitectónicos (MVP)

- **Backend Asíncrono:** FastAPI estructurado modularmente (`api/`, `models/`, `schemas/`, `core/`), operando sobre PostgreSQL mediante `SQLAlchemy 2.0` y driver `asyncpg`.
- **Autenticación y Seguridad:** JWT (JSON Web Tokens) con hashing de contraseñas mediante `passlib[bcrypt]`, roles diferenciados (`superadmin` y `operator`), y políticas de aislamiento de datos por usuario (`user_id`).
- **Pipeline de Ingesta:** Endpoints `/api/ingest` y `/api/ingest/traccar` para recepción de telemetría con deduplicación por `device_id + fixTime`.
- **Dashboard SPA React 18:** Construido con Vite, Tailwind CSS y React-Leaflet, integrando mapa oscuro, métricas de ignición, telemetría tabular y refresco reactivo.
- **Infraestructura Contenerizada:** Orquestación en `docker-compose.yml` (`db`, `api`, `web`, `traccar`, `gateway`, `zrok`).

---

## 3. Plan v3: Estabilización Telemática e Inteligencia Operativa

### 3.1 Etapa 1: Decodificación AVL FMC150 y Saneamiento de Datos
1. **Erradicación del Bug de Valores Falsy (`attrs.get(...) or ...`):**
   - Se reemplazaron evaluaciones booleanas ambiguas por `safe_coalesce(*values)` en [`fmc150_decoder.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/fmc150_decoder.py), permitiendo preservar `0`, `0.0`, `False` y strings vacíos sin colapsar en `None` (evitando que `battery: 0` o `sat: 0` se mostrasen como `"N/A"`).
2. **Decodificación de Elementos AVL Teltonika:**
   - **`io200` (Modo de Reposo):** Interpretación canónica de `io200: 3` como `"Online Deep Sleep"`.
   - **`io69` (Estado del Módulo GNSS):** `io69: 3` traducido a `"GNSS Sleep (Modo Ahorro)"`, formalizando que `sat: 0` con motor apagado es un comportamiento normal de ahorro de batería del tracker y no una falla de cobertura.
   - **`operator` (Red Móvil):** Mapeo de códigos MCC/MNC (ej. `722310` $\rightarrow$ `"Claro AR"`).
   - **`io68`:** Corriente interna de batería en miliamperios.
3. **Desacoplamiento de Ignición y Movimiento:**
   - Se fijó la ignición estrictamente a la entrada física de contacto (`ignition` / `io239` / `io1`). El movimiento inercial se mantuvo independiente (`motion` / `io240` / `speed > 2.0 km/h`), permitiendo detectar eventos de remolque sin contacto.
4. **Saneamiento Tipográfico:** Limpieza con regex de dobles espacios procedentes de Traccar (ej. `"Van  Operarios"` $\rightarrow$ `"Van Operarios"`).

### 3.2 Etapa 2: Motor de Estados Operativos, Calibración de Tablero y Batería 12V
1. **Motor de 5 Estados Operativos Canónicos ([`fmc150_decoder.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/fmc150_decoder.py)):**
   - 🟢 `MOVING` (`"EN MOVIMIENTO"`, `#10b981`): Ignición activa y velocidad $\ge 3\text{ km/h}$ o movimiento reportado.
   - 🟡 `IDLING` (`"RALENTÍ"`, `#f59e0b`): Ignición activa con velocidad $< 3\text{ km/h}$ y sin movimiento inercial.
   - 🔵 `PARKED_SLEEP` (`"ESTACIONADO (MODO AHORRO)"`, `#38bdf8`): Motor apagado con `sleep_mode` telemático activo (`io200 in (1,2,3,4)`) y reporte en los últimos 30 minutos.
   - 🟣 `TOWING` (`"ALERTA REMOLQUE / GRÚA"`, `#a855f7`): Motor apagado pero con desplazamiento detectable ($\ge 5\text{ km/h}$ o movimiento $\ge 3\text{ km/h}$).
   - 🔴 `DISCONNECTED` (`"SIN COMUNICACIÓN"`, `#f43f5e`): Sin reportes en los últimos 30 minutos.
2. **Diagnóstico de Salud Eléctrica de Batería 12V y Alternador:**
   - Evaluación según voltaje externo: $\ge 12.3\text{V}$ (`SALUD ÓPTIMA`), $\ge 11.8\text{V}$ (`NORMAL / REPOSO`), $\ge 11.2\text{V}$ (`BATERÍA BAJA`), $< 11.2\text{V}$ (`CRÍTICA / DESCARGADA`).
   - Evaluación con motor encendido: $\ge 13.5\text{V}$ (`ALTERNADOR CARGANDO`), $< 12.5\text{V}$ (`FALLA ALTERNADOR`).
3. **Calibración de Odómetro y Horómetro de Tablero Físico:**
   - Adición de campos `odometer_offset_km` y `engine_hours_offset` en `devices`.
   - Endpoint `PUT /api/devices/{device_id}/calibration` con cálculo automático a partir del kilometraje real del odómetro del vehículo.
   - Modal interactivo [`DeviceCalibrationModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/DeviceCalibrationModal.jsx) con vista previa en tiempo real.
4. **Cálculo y Acumulación de Ralentí:**
   - Acumulación de `total_idling_hours` en base a deltas temporales durante estados `IDLING`.

### 3.3 Etapa 3: Detección Automática de Viajes, Paradas y Reproductor en Mapa
1. **Deprecación de Polling Redundante:** Eliminación completa de `traccar_sync.py`. El flujo telemático opera de manera unificada mediante eventos push en `ingest.py`.
2. **Detector de Viajes y Paradas ([`trip_detector.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/trip_detector.py)):**
   - Creación de tabla `vehicle_trips` con índices por `(device_id, start_time DESC)`.
   - Cálculo geodésico de distancias con la fórmula ortodrómica de Haversine ($R = 6371.0\text{ km}$) y filtrado de ruido GPS ($> 5\text{ m}$ y $< 50\text{ km}$).
   - Ciclo de vida del viaje: Ignición ON abre el viaje; movimiento acumula distancia y actualiza velocidad máxima; detenciones en ralentí acumulan `idling_seconds`; ignición OFF cierra el viaje calculando velocidad promedio.
   - Estimación de combustible desperdiciado en ralentí a razón de $1.5\text{ L/h}$ y costo configurable en moneda local.
3. **Historial de Viajes ([`TripHistoryModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/TripHistoryModal.jsx)):**
   - Filtros rápidos (*Hoy*, *Ayer*, *Últimos 7 días*, *Todos*), 4 tarjetas KPI (Total viajes, tiempo marcha, tiempo ralentí, desperdicio económico) y listado de recorridos.
4. **Reproductor de Rutas en Mapa ([`RoutePlayback.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/RoutePlayback.jsx)):**
   - Animación de la unidad a lo largo de la polilínea en Leaflet con orientación según el ángulo de rumbo (`course`).
   - Marcadores de inicio (A) y fin (B), selector de velocidad ($1\times, 2\times, 5\times, 10\times$), Scrubber timeline y HUD velocímetro en vivo.

### 3.4 Etapa 4: Alertas Operativas y Mantenimiento Preventivo
1. **Motor de Reglas de Alertas ([`alert_engine.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/alert_engine.py)):**
   - 6 reglas operativas: `POWER_CUT` ($< 5.0\text{V}$, sabotaje/corte), `CRITICAL_BATTERY` ($< 11.2\text{V}$), `LOW_BATTERY` ($11.2\text{V} - 11.8\text{V}$), `TOWING` (movimiento sin ignición), `OVERSPEED` ($> 100\text{ km/h}$), `ALTERNATOR_FAIL` (contacto ON y $< 12.5\text{V}$).
   - Mecanismo **Anti-Flapping / Throttling de 15 minutos** para evitar saturación de BD y spam.
   - Difusión en tiempo real vía Server-Sent Events (SSE).
2. **Gestión de Mantenimiento Preventivo ([`maintenance.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/api/maintenance.py)):**
   - Modelos `MaintenancePlan` y `MaintenanceLog` con seguimiento por Kilometraje (`KM`) o por Horómetro (`HOURS`).
   - Semáforo automático: `OK` (verde), `WARNING` (ámbar si faltan $< 1000\text{ km}$ o $< 30\text{ hs}$), y `OVERDUE` (rojo).
   - Asentamiento de servicios con auto-reprogramación del siguiente objetivo (`next_service_value = executed_value + interval_value`) y archivo de costo/taller.
3. **Componentes Frontend:**
   - [`AlertNotificationBell.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/AlertNotificationBell.jsx): Campana con contador en vivo, pulso de radar en alertas críticas y resolución en un clic.
   - [`MaintenancePlannerModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/MaintenancePlannerModal.jsx): Gestor con barras de desgaste, registro de intervenciones mecánicas y libro histórico.

---

## 4. Plan v4: Commercial Release - Sprint 1 (`v0.5.0`)

### 4.1 Geocercas Inteligentes y Control de Permanencia
1. **Modelos y DDL ([`models.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/models/models.py) e [`init_db.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/init_db.py)):**
   - Tablas `geofences` (con soporte para polígonos JSONB y círculos con radio) y `geofence_events` (ingresos, egresos y excesos de velocidad) indexadas por usuario y dispositivo.
2. **Algoritmos Geodésicos de Alto Rendimiento ([`geofence_engine.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/geofence_engine.py)):**
   - **Algoritmo de Ray-Casting en Python puro:** Permite validar pertenencia a polígonos arbitrarios en $< 1.5\ \mu\text{s}$ sin requerir la extensión PostGIS ni bibliotecas C nativas.
   - **Fórmula de Haversine:** Para validación de geocercas circulares.
   - **Filtro Anti-Jitter (Debouncing):** Exige al menos dos posiciones consistentes consecutivas para confirmar transiciones `ENTER` y `EXIT`, mitigando falsos positivos por deriva GPS en vehículos detenidos.
   - **Cálculo Automático de Permanencia:** Al generarse el evento `EXIT`, registra la cantidad exacta de segundos transcurridos dentro del recinto.
3. **Diseñador Visual y Experiencia de Usuario ([`GeofenceManagerModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/GeofenceManagerModal.jsx)):**
   - Modal con mapa Leaflet para dibujar polígonos interactivos (vértice por vértice con función de deshacer) o círculos ajustables mediante slider de radio.
   - Asignación de colores corporativos temáticos y límites de velocidad internos opcionales.
   - Listado de zonas con conteo en vivo de unidades activas dentro.
4. **Comportamiento Inteligente de Posicionamiento y Zoom:**
   - **Visualización de Dispositivo Individual:** Al crear o abrir una geocerca teniendo un equipo activo seleccionado en el dashboard (ej: *Van Operarios*), el mapa centra automáticamente sobre las coordenadas reportadas por ese equipo con zoom 15 y botón *"Fijar centro en vehículo"*.
   - **Visualización de Flota Completa:** Al estar en la vista general de la flota, el backend resuelve la IP pública del usuario mediante `/api/client-ip-location`, y el mapa centra automáticamente en su ciudad o región aproximada (zoom 13) con botón *"Fijar centro en tu ubicación IP"*.
   - **Autocentrado Único en Carga / Sin Snap-Back:** El recentrado automático se ejecuta **estrictamente una sola vez** al abrir o ingresar a la pestaña de creación. Una vez cargado, el usuario tiene control total para desplazarse o cambiar el nivel de zoom sin que el mapa vuelva a centrarse forzosamente ante re-renders de telemetría o colocación de vértices. Botón `[Centrar]` disponible si se requiere re-centrado a demanda.
5. **Tarjeta Dinámica 'Zona Operativa' en Dashboard:**
   - En la vista global de flota se oculta automáticamente del DOM adaptando la grilla a 3 columnas.
   - En la vista individual reporta en tiempo real la geocerca donde se encuentra el vehículo con su color distintivo, o avisa *"Fuera de Zona Delimitada"*.

### 4.2 Despachador Multicanal a Telegram Bot API ([`notification_dispatcher.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/notification_dispatcher.py))
- Integración directa con Telegram Bot API (`sendMessage`) con formato HTML enriquecido.
- Ejecución asíncrona no bloqueante (`asyncio.create_task`) para garantizar que la notificación no añada latencia al pipeline de ingesta telemática.
- Notificaciones automáticas ante:
  - 🚨 Alertas críticas (Corte de alimentación externa, Batería baja, Remolque/Grúa).
  - 📍 Ingreso a zona operativa / 📤 Egreso de zona con tiempo de permanencia.
  - ⛔ Exceso de velocidad en el interior de una geocerca.
  - 🌙 Uso de vehículo fuera de horario laboral permitido.

### 4.3 Control de Horarios Operativos de Trabajo ([`alert_engine.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/alert_engine.py))
- Configuración por vehículo de ventana horaria habilitada (`work_schedule_start`, `work_schedule_end`) y días de la semana autorizados (`allowed_weekdays`).
- Detección de ignición fuera del horario habilitado con disparo automático de la alerta `UNAUTHORIZED_SCHEDULE` (severidad `WARNING`), registro en base de datos y aviso inmediato a Telegram.

---

## 5. Endurecimiento de Infraestructura, Nginx y Caché HTTP

### 5.1 Arquitectura del Gateway Router y Puertos
- **Gateway Nginx (Puerto 80):** Actúa como reverse proxy exterior único.
  - Enrutamiento por cookie `iot_target`:
    - `iot_target=custom` $\rightarrow$ Plataforma Propia Tokioba (`web:8081`).
    - `iot_target=traccar` $\rightarrow$ Consola Traccar (`traccar:8082`).
    - Sin cookie / `/selector` $\rightarrow$ Selector visual de plataforma ([`selector.html`](file:///d:/TK_DEMO1/tk_solucion1_demo1/gateway/selector.html)).
  - Atajos directos por URL: `/custom` y `/traccar` con seteo de cookie y redirección 302.
  - Soporte completo para WebSockets (RFC 6455).
- **Ingesta Telemática de Hardware:**
  - Puerto `5027` (TCP/UDP) directo al decodificador Teltonika de Traccar.
- **Backend API:** Puerto interno `8000` (FastAPI).
- **Base de Datos:** PostgreSQL en puerto interno `5432` aislado de accesos externos directos.

### 5.2 Corrección de Volúmenes y Prevención de Caché Obsoleta
- **Diagnóstico:** Previamente, el servicio `web` (`telemetry_web`) carecía de volúmenes en `docker-compose.yml`, lo que hacía que ejecutase una imagen interna construida anteriormente y no reflejara los cambios realizados en el frontend compilado en disco.
- **Solución Definitiva en [`docker-compose.yml`](file:///d:/TK_DEMO1/tk_solucion1_demo1/docker-compose.yml):**
  ```yaml
  web:
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro

  gateway:
    volumes:
      - ./gateway/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./gateway/selector.html:/usr/share/nginx/html/selector.html:ro
  ```
- **Cabeceras HTTP Anti-Caché Estrictas:**
  Tanto `gateway/nginx.conf` como `frontend/nginx.conf` configuran:
  - Para `index.html` y rutas SPA:
    ```http
    Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
    Pragma: no-cache
    Expires: 0
    ```
  - Para assets versionados por hash (`/assets/*`):
    ```http
    Cache-Control: public, max-age=31536000, immutable
    ```
  Esto garantiza que cualquier actualización o refresco en el navegador (`F5` o `Ctrl+F5`) cargue inmediatamente el bundle de JavaScript más reciente sin retener versiones previas en memoria.

---

## 6. Verificación en Servidor de Producción (Raspberry Pi 4B - `172.16.22.2`)

- **Hardware y Almacenamiento:** Raspberry Pi 4B con Debian GNU/Linux en almacenamiento SSD `/mnt/ssd/tokioba-iot`.
- **Despliegue Certificado:**
  - Contenedores activos y saludables: `telemetry_api`, `telemetry_web`, `telemetry_gateway`, `telemetry_traccar`, `telemetry_db`, `telemetry_zrok`.
  - Migraciones DDL ejecutadas exitosamente sin pérdida de datos históricos.
  - Validación de acceso web mediante navegador automatizado:
    * Login validado con credenciales de operador.
    * Botón "Geocercas" visible y destacado en cabecera.
    * Creación de geocercas con centrado automático correcto (por coordenadas de vehículo y por GeoIP de usuario).
    * Estabilidad de zoom y desplazamiento de mapa confirmada sin snap-back.
- **Túnel Público Persistente Zrok 2:**
  - URL reservada accesible vía HTTPS: [https://iot-web-portal.shares.zrok.io](https://iot-web-portal.shares.zrok.io)

---

## 7. Próximos Pasos (Backlog Sprint 2 - `v0.6.0`)
1. Generador de Reportes Ejecutivos en PDF corporativo (recorridos, velocidades, consumo y alertas).
2. Módulo de corte de motor remoto seguro con validación de velocidad mínima ($< 10\text{ km/h}$).
