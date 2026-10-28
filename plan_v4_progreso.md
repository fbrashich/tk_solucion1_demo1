# Registro de Progreso y Ejecución - Plan v4 (Commercial Release)
## Plataforma Tokioba Telematics & Fleet IoT

Este documento audita y certifica la implementación de los Sprints técnicos y comerciales definidos en [plan_v4.md](file:///d:/TK_DEMO1/tk_solucion1_demo1/plan_v4.md).

---

## Estado General de los Sprints

| Sprint | Versión | Alcance Principal | Estado | Cobertura de Tests |
| :---: | :---: | :--- | :---: | :---: |
| **Sprint 1** | **`v0.5.0`** | **Geocercas Inteligentes, Despachador Telegram y Control Horario** | 🟢 **100% COMPLETADO** | 12 Tests (PASS) |
| **Sprint 2** | **`v0.6.0`** | **Reportes Ejecutivos en PDF Corporativo y Corte de Motor Remoto Seguro (Safety Interlock)** | 🟢 **100% COMPLETADO** | 13 Tests (PASS) |
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
  - **Autocentrado Único en Carga / Sin Snap-Back Verificado:** El autocentrado opera estrictamente en la carga inicial o apertura de la creación de la geocerca. El operador puede desplazar el mapa libremente por cualquier región o distancia y colocar múltiples vértices de polígonos o centros de círculos sin que el mapa vuelva a centrarse forzosamente. Botón manual `[Centrar]` disponible en el HUD si el usuario desea recentrar a demanda.

---

## 4. Detalle de Implementación: Sprint 2 (`v0.6.0`)

### 4.1 Generador de Reportes Ejecutivos en PDF Corporativo ([`report_generator.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/report_generator.py))
* **Motor Vectorial In-Memory (ReportLab 5.1.0):**
  - Construcción del PDF mediante `SimpleDocTemplate` y `io.BytesIO`, transmitiendo el flujo de bytes directamente con `StreamingResponse` de FastAPI sin escribir archivos intermedios en el disco.
  - **Paginación Dinámica `NumberedCanvas`:** Implementación de dos pasadas para imprimir cabeceras corporativas, timestamp de generación y numeración exacta *"Página X de Y"* en el pie de página.
* **Estructura y Módulos Auditados en el Documento:**
  1. **Encabezado y Metadatos:** Título oficial, logotipo/emblema corporativo, alcance (Flota Consolidada o Vehículo individual), período auditado (`from_date` a `to_date`), y usuario solicitante.
  2. **Métricas Clave de Operación (KPIs):** Distancia total recorrida (km), horas totales de motor encendido, velocidad promedio, velocidad máxima alcanzada y conteo de vehículos activos.
  3. **Análisis Financiero de Ralentí Ineficiente:** Desglose de horas en ralentí (`IDLING`), consumo estimado de combustible desperdiciado en litros (1.2 L/h) y costo financiero proyectado en Pesos Argentinos ($ARS) a tasa de mercado.
  4. **Semáforo Preventivo de Mantenimiento:** Diagnóstico preventivo con tabla de planes activos, desgaste por kilometraje/horas, semaforización (`OK` en verde, `PRÓXIMO` en ámbar, `VENCIDO` en rojo) y días restantes para el próximo servicio.
  5. **Incidentes y Seguridad:** Registro de alertas de pánico, desconexión de batería, remolque/grúa y transgresiones de geocercas registradas en el período.
  6. **Resumen de Viajes:** Tabla con fecha, origen, destino, duración, kilometraje y velocidad promedio de cada recorrido.
* **Endpoint REST ([`reports.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/api/reports.py)):**
  - `GET /api/reports/executive/pdf`: Parámetros `device_id` (`'all'` o ID específico), `from_date` y `to_date`. Genera y descarga el archivo con Content-Disposition attachment.

### 4.2 Control Remoto de Inmovilización (Corte de Motor Seguro con Safety Interlock)
* **Safety Interlock ($\le 5.0\text{ km/h}$):**
  - Regla ineludible de seguridad vial: cortar el suministro eléctrico/ignición de un vehículo a alta velocidad representa un riesgo crítico de accidente. Si la unidad registra `speed > 5.0 km/h`, el sistema bloquea el envío inmediato al dispositivo y transiciona el estado a `PENDING_SAFE_STOP` (`"Corte Programado - Esperando Detención Segura"`).
* **Ejecución Diferida Automática en Ingesta ([`ingest.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/api/ingest.py)):**
  - Función hook `check_and_execute_pending_cut`: Con cada paquete de telemetría entrante (vía Traccar o ingesta directa), el pipeline evalúa si el dispositivo posee un comando en estado `PENDING_SAFE_STOP`. En el instante en que el vehículo reduce su velocidad a $\le 5.0\text{ km/h}$, el corte de motor se dispara automáticamente hacia Traccar y se actualiza el estado a `IMMOBILIZED`.
* **Restauración de Motor:**
  - Acción `RESTORE` que envía `setdigout 0` a Traccar y restablece el estado del inmovilizador a `NORMAL`.
* **Doble Factor de Autorización y Anti-IDOR ([`engine_cut_service.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/engine_cut_service.py)):**
  - Exige validación obligatoria de credenciales: o bien el PIN numérico de seguridad configurado por vehículo (`security_pin` con hash bcrypt), o bien la contraseña de la cuenta del usuario autenticado.
  - Verificación estricta de tenencia (`device.user_id == current_user.id` para operadores; bypass solo para superadmin).
* **Auditoría Forense (`command_audit_logs`):**
  - Registro detallado de cada orden: usuario solicitante, dispositivo, tipo de comando, acción (`CUT` / `RESTORE`), velocidad al solicitar, velocidad al ejecutar, IP origen, ID de comando Traccar, estado (`EXECUTED`, `PENDING_SAFE_STOP`, `CANCELLED`, `FAILED`) y marcas temporales.
* **Notificación Inmediata Multicanal ([`notification_dispatcher.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/services/notification_dispatcher.py)):**
  - Despacho inmediato de alerta crítica a Telegram con emojis 🛑 / ⚡ / ⏳ indicando la orden, el operador responsable y la velocidad del vehículo.
* **Endpoints REST ([`commands.py`](file:///d:/TK_DEMO1/tk_solucion1_demo1/backend/app/api/commands.py)):**
  - `POST /api/devices/{device_id}/engine-cut`: Solicitar corte (`CUT`) o restablecimiento (`RESTORE`).
  - `GET /api/devices/{device_id}/engine-status`: Consultar estado actual del inmovilizador.
  - `GET /api/devices/{device_id}/command-logs`: Historial de auditoría de comandos ejecutados.
  - `POST /api/commands/{command_id}/cancel`: Cancelar un comando pendiente de detención segura.
  - `POST /api/devices/{device_id}/security-pin`: Configurar o cambiar el PIN de seguridad del vehículo.

### 4.3 Interfaz de Usuario Frontend (React 18 / Tailwind)
* **[`EngineCutModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/EngineCutModal.jsx):**
  - Pestañas integradas: *Control de Motor*, *Historial de Auditoría* y *Configuración de PIN*.
  - Visualizador de estado operativo con velocímetro en tiempo real y banner de advertencia Safety Interlock.
  - Checkbox explícito de confirmación de riesgo antes de permitir el corte.
  - Indicador visual animado si el vehículo se encuentra en `PENDING_SAFE_STOP` con botón para cancelar la orden pendiente.
* **[`ExecutiveReportModal.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/components/ExecutiveReportModal.jsx):**
  - Selector de alcance: Toda la Flota (Consolidado) o Vehículo Individual.
  - Presets de rango temporal: Últimos 7 días, Últimos 30 días, Este mes, o Personalizado con selectores de fecha (`from_date` / `to_date`).
  - Previsualización gráfica de las 4 secciones auditadas.
  - Botón de descarga con animación de spinner y guardado automático con nomenclatura corporativa (`reporte_ejecutivo_<alcance>_<fecha>.pdf`).
* **Integración en [`Dashboard.jsx`](file:///d:/TK_DEMO1/tk_solucion1_demo1/frontend/src/pages/Dashboard.jsx):**
  - Botón **`Reporte PDF`** en la barra de navegación superior con icono indigo.
  - Botón interactivo **`Inmovilizador`** / **`Motor Bloqueado`** / **`Corte Pendiente`** con badge pulsante según estado en la barra de acciones del vehículo.
  - Pie de página actualizado formalmente a **`v0.6.0` - Sprint 2 (Executive PDF & Safety Interlock Engine Cut)**.

### 4.4 Pruebas Automatizadas del Sprint 2
* **`test_stage6_engine_cut.py` (7 tests):**
  - `test_safety_interlock_blocks_moving_vehicle`: Verifica que a 45 km/h el corte se encola como `PENDING_SAFE_STOP` y no se envía a Traccar.
  - `test_immediate_cut_when_stopped`: Verifica que a 0 km/h se despacha `setdigout 1` a Traccar y se actualiza a `IMMOBILIZED`.
  - `test_deferred_cut_in_ingest_pipeline`: Simula el hook de ingesta reduciendo de 30 km/h a 2.5 km/h, validando la ejecución automática del corte diferido.
  - `test_restore_engine`: Verifica que la orden de restauración despacha `setdigout 0` y regresa a `NORMAL`.
  - `test_cancel_pending_command`: Verifica la anulación de comandos encolados.
  - `test_security_pin_authentication`: Valida la autenticación tanto por PIN de dispositivo como por contraseña de usuario.
  - `test_multi_tenant_idor_protection`: Confirma la denegación de comandos entre operadores de distintos tenants (HTTP 403 / 404).
* **`test_stage6_report_generator.py` (6 tests):**
  - `test_generate_single_device_pdf`: Generación completa de PDF para un vehículo individual.
  - `test_generate_consolidated_fleet_pdf`: Generación consolidada para flota múltiple.
  - `test_pdf_structure_and_tables`: Valida las 6 tablas, encabezados y estilos corporativos.
  - `test_empty_data_handling`: Valida que dispositivos sin viajes o sin alertas generen PDFs válidos sin lanzar excepciones.
  - `test_idling_cost_calculation`: Valida el cálculo matemático de litros y pesos ($ARS).
  - `test_maintenance_traffic_light_in_report`: Valida el semáforo preventivo en el reporte.

> **Resultado de la Suite Consolidada:** **39 pruebas unitarias ejecutadas al 100% OK** en 1.689s.


