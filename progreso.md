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
