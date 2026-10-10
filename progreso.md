# Progreso del Proyecto: Telemetría IoT Custom

Este documento funciona como un registro del avance del proyecto y de las decisiones técnicas adoptadas en su implementación.

## 📋 Checklist de Tareas (Checkpoints)

### 1. Documentación Inicial
- [x] Actualizar `README.md` con el propósito del proyecto.
- [x] Crear `progreso.md` con checklist y bitácora técnica.

### 2. Backend (FastAPI + PostgreSQL)
- [x] Configurar estructura del proyecto Backend.
- [x] Implementar Modelos de Base de Datos (SQLAlchemy Async).
  - [x] Tabla `Users`
  - [x] Tabla `TelemetryEvents`
  - [x] Tabla/Cálculo `DeviceState`
- [x] Implementar Autenticación JWT y endpoint `/api/auth/login`.
- [x] Implementar Ingesta de Datos (`POST /api/ingest`).
- [x] Implementar Endpoints de Lectura (Estado y Logs del dispositivo).
- [x] Script de inicialización (`init_db.py`) con usuario admin por defecto.

### 3. Frontend (React SPA)
- [x] Inicializar proyecto React 18 con Vite.
- [x] Configurar Tailwind CSS, React-Leaflet y Lucide-React.
- [x] Desarrollar Vista de Login y gestión del JWT.
- [x] Desarrollar Vista del Dashboard.
  - [x] Integración del Mapa interactivo.
  - [x] Indicador de estado y cálculo de Horas de Motor.
  - [x] Tabla/Lista del histórico de eventos.
- [x] Implementar actualización de datos (Polling cada 15 segundos).

### 4. Infraestructura e Integración
- [x] Crear `Dockerfile` para el Backend.
- [x] Crear `Dockerfile` para el Frontend (con Nginx).
- [x] Crear `docker-compose.yml` para orquestar `db`, `api` y `web`.

### 5. Simulador IoT (Bonus para Demo)
- [x] Desarrollar un script en Python que envíe datos simulados a la API.

---

## 📓 Bitácora Técnica de Decisiones

### Decisiones Arquitectónicas y de Implementación:
- **[Inicial]**: Inicialización de la documentación base. Se definen las metas generales acorde al `initial_prompt_demo1.md`.
- **[Backend]**: Se optó por usar `asyncpg` como driver asíncrono para PostgreSQL. Se crearon los modelos `User`, `TelemetryEvent` y `DeviceState`. El `DeviceState` sirve para evitar calcular las horas de motor consultando todo el histórico; en su lugar, se actualiza de forma incremental en cada petición al endpoint `/api/ingest`.
- **[Frontend]**: Se implementó una Single Page Application con React 18, React-Router-Dom y Tailwind CSS (@tailwindcss/postcss). El estado de autenticación (JWT) se mantiene en un contexto global (`AuthContext`) apoyado en `localStorage`. El dashboard incluye un mapa Leaflet, un cálculo de estado derivado del estatus y los logs, y se actualiza de forma automática cada 15 segundos mediante *polling*.
- **[Infraestructura]**: Se diseñó la orquestación en `docker-compose.yml` utilizando Nginx para servir el Frontend y `init_db.py` antes de levantar `uvicorn` en el Backend. Se expusieron los puertos 3000 para web y 8000 para API.
- **[Simulador]**: Se programó `demo_device.py` para generar datos y enviarlos a `/api/ingest`, facilitando así las pruebas locales del Dashboard en tiempo real, modificando dinámicamente posición e ignición para apreciar las funcionalidades de la SPA.

--------------------------------------------------------------------
- **[ 10/10/2026 14:54 Nuevas modificaciones ]**
--------------------------------------------------------------------
- **[Resolución de Bug Docker]**: Se resolvió el error de build en Vite/Rolldown migrando la imagen base de `frontend/Dockerfile` a `node:22-alpine`, dado que las librerías modernas de bundling requieren `node:util.styleText` (disponible desde Node 20.12+). Se añadió manejo de reintentos asíncronos en `init_db.py` para evitar caídas prematuras por sincronía con PostgreSQL.
- **[Simulador Standalone]**: Se refactorizó `demo_device.py` reemplazando la dependencia externa `requests` por la librería estándar (`urllib.request` y `json`), permitiendo ejecutar la simulación de telemetría de forma inmediata con cualquier instalación de Python 3 sin necesidad de `pip install`.
- **[Rediseño UI/UX Industrial]**: Se reestructuró la configuración de Tailwind CSS v4 (`@import "tailwindcss";`), se añadieron fuentes modernas de Google Fonts (*Plus Jakarta Sans* y *JetBrains Mono*) y se rediseñaron integralmente las vistas de Login y Dashboard:
  - *Login*: Tarjeta glassmorphism, efectos de iluminación ambiental, botón de autocompletado demo (`admin`/`admin123`) y validaciones visuales.
- **[Corrección de Capas de Mapa (Sin API Key)]**: Se sustituyeron los mosaicos de CARTO (que requerían API key) por OpenStreetMap con filtro CSS oscuro calibrado nativo, añadiendo además capa satelital Esri y estándar sin restricciones de clave.
--------------------------------------------------------------------
- **[ 10/10/2026 Refactor Fullstack: Lógica, Red Unificada y UX Móvil para Aldo ]**
--------------------------------------------------------------------
- **[Corrección de Lógica de Estado (Bug Ignition ON vs APAGADO)]**:
  - Se eliminó la divergencia entre el indicador de ignición y el estado operativo general.
  - En `backend/app/api/devices.py` y `schemas.py`, el estado se deriva canónicamente bajo UTC estricto (`datetime.timezone.utc`):
    - `OPERANDO` (Verde): si `ignition == true` y el reporte ocurrió dentro de los últimos 5 minutos.
    - `DETENIDA` (Ámbar): si `ignition == false` dentro del rango de reporte (<= 10 min).
    - `SIN COMUNICACIÓN`: si el último reporte excede los 10 minutos respecto a `now(timezone.utc)`.
- **[Cálculo de Horómetro Robusto]**:
  - En `backend/app/api/ingest.py`, se refactorizó la ingesta para que el cálculo acumulativo del horómetro se base exclusivamente en el delta de tiempo físico entre eventos consecutivos (`event.timestamp - prev_event.timestamp`), desacoplándolo del momento de recepción HTTP en el servidor.
- **[Seguridad en Docker Compose]**:
  - Se eliminó la exposición del puerto `5432:5432` de PostgreSQL hacia el host. La base de datos ahora reside de forma segura en la red interna de Docker (`telemetry_net`), accesible únicamente por el contenedor `telemetry_api`.
- **[Unificación de Red con Proxy Reverso Nginx]**:
  - Se eliminaron las llamadas directas a `localhost:8000` en el Frontend; ahora React utiliza rutas relativas (`/api/...`).
  - Se configuró `frontend/nginx.conf` como reverse proxy hacia `http://api:8000/api/` con headers estándar (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`), más proxys para `/docs` y `/openapi.json`.
  - Todo el tráfico queda centralizado en el puerto 3000, facilitando el despliegue con túneles inversos (ej. Zrok, ngrok o Cloudflare Tunnels).
- **[Rediseño UI/UX Industrial Móvil para Aldo]**:
  - Interfaz orientada a usuario no técnico (operador/planta):
    - Tarjeta principal de estado grande y sin ambigüedades (OPERANDO, DETENIDA, SIN COMUNICACIÓN).
    - Horómetro con desglose legible en horas y minutos (ej. "14 hs 28 min").
    - Diseño responsive táctil (botones >= 44px) con selector móvil rápido ("Estado & Mapa" / "Historial").
    - Marcador baliza en Leaflet con colores acordes al estado y filtros rápidos en la tabla de eventos.
- **[Simulador Actualizado]**:
  - `demo_device.py` ahora transmite marcas temporales físicas ISO en UTC y apunta al puerto unificado `http://localhost:3000/api/ingest`.

--------------------------------------------------------------------
- **[ 10/10/2026 Multidispositivo, Mapa de Flota, Super Admin y Export CSV ]**
--------------------------------------------------------------------
- **[CRUD de Dispositivos (Alta, Baja, Modificación)]**:
  - Se formalizó el modelo `Device` en `models.py` (`device_id`, `name`, `type`, `description`, `is_active`, `created_at`).
  - Endpoints REST en `devices.py`:
    - `GET /api/devices`: Listado de equipos registrados.
    - `POST /api/devices`: Alta de nuevo equipo.
    - `PUT /api/devices/{device_id}`: Modificación de nombre, tipo, descripción o estado.
    - `DELETE /api/devices/{device_id}`: Baja / eliminación de dispositivo.
    - Auto-registro en `ingest.py`: si un hardware transmite por primera vez, se añade automáticamente al inventario.
- **[Selector Desplegable y Visualización Multidispositivo en Mapa]**:
  - Se incorporó un selector desplegable en la barra de control para conmutar entre **"Toda la Flota"** o cualquier equipo específico (`MESA_01`, `MESA_02`, etc.).
  - **Visualización en el mismo mapa**: En la vista de flota, el mapa renderiza simultáneamente las balizas radar de **todos los dispositivos activos**, cada uno con su color de estado operativo (`OPERANDO` verde, `DETENIDA` ámbar, `SIN COMUNICACIÓN` rojo), popup con métricas y botón de enfoque directo.
  - Al seleccionar un equipo individual, se dibuja su trayectoria GPS (`Polyline`) y sus logs específicos.
- **[Dashboard de Super Admin]**:
  - Se incorporó la columna `role` (`admin` / `operator`) en el modelo `User`.
  - Componente `AdminPanelModal.jsx` accesible para administradores autenticados:
    - **Gestión de Cuentas**: Generar usuarios, definir contraseñas, asignar roles (Super Admin / Operador), suspender/activar cuentas y eliminar accesos.
    - **Gestión de Equipos**: Alta rápida de dispositivos, edición de metadatos de maquinaria y baja de equipos.
- **[Export de Datos Telemetría]**:
  - Endpoint `GET /api/devices/{device_id}/export?format=csv` con streaming de archivo CSV descargable.
  - Botón directo "Exportar CSV" en la cabecera y en el panel de eventos para descargar el histórico filtrado.
- **[Simulador Multi-Dispositivo]**:
  - `demo_device.py` ahora simula en paralelo telemetría para múltiples equipos de la flota (`MESA_01` y `MESA_02`), permitiendo observar en vivo el movimiento sincronizado y los cambios de estado en el mapa.
- **[Separación Estricta de Dashboard de Admin]**:
  - El usuario **Super Admin** (`admin`) posee un panel exclusivo (`AdminDashboard.jsx`) dedicado 100% a la gobernanza de cuentas y accesos.
  - El Administrador **NO ve ningún dispositivo ni mapas ni telemetría operativa** (el endpoint `GET /api/devices` retorna `[]` para admin).
  - La tabla de cuentas muestra para cada usuario:
    - Nombre de usuario y estado (Habilitado / Desactivado).
    - Rol (Administrador / Operador de Planta).
    - **Cantidad de dispositivos asociados** (`devices_count`), calculada y reflejada en tiempo real.
    - Acciones para generar nuevas cuentas, cambiar contraseñas, alternar estado o eliminar cuentas.
- **[Dashboard de Operador: Gestión de Maquinaria y Vinculación Traccar]**:
  - Se eliminó por completo el bloque redundante de "Acceso rápido:" que duplicaba la funcionalidad del selector desplegable.
  - El operador puede **dar de alta nuevos dispositivos** mediante el botón "+ Agregar Equipo":
    - Solicita datos operativos: Código/Alias (`device_id`), Nombre de máquina (`name`), Tipo de maquinaria (`type`), Ubicación (`description`).
    - **Campos de integración con TRACCAR**:
      - `traccar_unique_id`: IMEI o ID único del tracker GPS (15 dígitos).
      - `traccar_model`: Modelo del módem de telemetría (ej. Teltonika FMB920, Queclink GV300, Suntech, ESP32, OsmAnd).
      - `sim_phone`: N° de chip SIM instalado en el equipo.
      - `category`: Icono y categoría de maquinaria (machinery, tractor, truck, etc.).
    - Asocia automáticamente la máquina a la cuenta del operador autenticado (`user_id`).
  - El operador puede **eliminar dispositivos** directamente desde la vista del equipo con confirmación previa, eliminando también sus registros y actualizando la flota y el conteo del admin.
- **[Arquitectura e Integración con Traccar]**:
  - ¿Es Traccar una buena opción?: **Sí, excelente opción**, ya que Traccar es el estándar abierto líder que soporta más de 2.000 protocolos de hardware GPS (Teltonika, Queclink, Suntech, Coban, Concox, ESP32, etc.).
  - ¿Qué datos solicitar?: Con el **IMEI / Unique ID**, el **Modelo** y el **SIM**, el backend se conecta directamente a los eventos de Traccar (vía Webhook hacia `/api/telemetry/ingest` o consumiendo la API REST de Traccar).


