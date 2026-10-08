# Blueprint del Proyecto: Telemetría IoT Custom (Mesa Vibratoria)

## 1. Rol y Objetivo
Actúa como un Desarrollador Senior Full Stack y Arquitecto DevOps. Tu objetivo es generar el código completo y la infraestructura como código (IaC) para una plataforma web de telemetría IoT desde cero. La solución debe ser asíncrona, contenerizada y orientada a microservicios.

El sistema recibirá datos de un nodo IoT basado en ESP32 (Latitud, Longitud, Estado de Ignición) y los visualizará en un dashboard de "fricción cero" para un usuario final no técnico.

## 2. Stack Tecnológico (Estricto)
*   **Backend:** Python 3.11+ con FastAPI (Asíncrono, validación con Pydantic).
*   **Base de Datos:** PostgreSQL 15+.
*   **ORM:** SQLAlchemy 2.0 (Async) o SQLModel.
*   **Frontend:** React 18 (Vite), Tailwind CSS, React-Leaflet, Lucide-React.
*   **Infraestructura:** Docker y Docker Compose.

## 3. Arquitectura y Modelado de Datos
Genera los modelos de base de datos para manejar:
1.  **Users:** `id`, `username`, `hashed_password`, `is_active`.
2.  **TelemetryEvents:** `id`, `device_id`, `timestamp`, `latitude`, `longitude`, `ignition_state` (booleano).
3.  **DeviceState (Opcional/Calculado):** Para almacenar el acumulado de "horas de motor" calculadas a partir de las transiciones de `ignition_state`.

## 4. Requerimientos de la API (FastAPI)
Implementa los siguientes endpoints con manejo de errores y CORS habilitado:
*   `POST /api/auth/login`: Autenticación y generación de token JWT.
*   `POST /api/ingest`: Endpoint público (o protegido con API Key estática) para que el ESP32 envíe el payload JSON: `{"device_id": "MESA_01", "lat": -29.413, "lon": -66.856, "ignition": true}`.
*   `GET /api/devices/{device_id}/status`: Retorna el último estado conocido (conectado/desconectado, posición actual, horas de motor acumuladas). Requiere JWT.
*   `GET /api/devices/{device_id}/logs`: Retorna el historial de los últimos 50 eventos para la tabla del dashboard. Requiere JWT.

## 5. Requerimientos del Frontend (React SPA)
*   **Vista de Login:** Pantalla minimalista solicitando usuario y contraseña. Guarda el JWT en localStorage/sessionStorage.
*   **Vista de Dashboard (Pantalla Única):**
    *   Indicador visual gigante de Estado (Verde = Operativo, Rojo = Apagado).
    *   Contador de Horas de Motor.
    *   Mapa (Leaflet) centrado en la última ubicación.
    *   Tabla/Lista limpia con el log de los últimos eventos.
*   Implementar un *polling* ligero (cada 15 segundos) o WebSocket para mantener el dashboard actualizado sin refrescar la página.

## 6. Infraestructura y Dockerización (Paso a Paso)
Genera la estructura de archivos necesaria y los siguientes archivos de configuración para levantar el entorno de prueba de manera automática:

1.  **`/backend/Dockerfile`**: Basado en `python:3.11-slim`, instalando dependencias desde `requirements.txt` y exponiendo el puerto 8000. Ejecutar con Uvicorn.
2.  **`/frontend/Dockerfile`**: Basado en `node:18-alpine` para la etapa de build (Vite), y utilizando `nginx:alpine` para servir los estáticos en el puerto 80.
3.  **`docker-compose.yml`**: Orquestar tres servicios:
    *   `db`: Contenedor oficial de PostgreSQL. Incluye un volumen para persistencia de datos y las variables de entorno para usuario/contraseña/db.
    *   `api`: Contenedor del backend (depende de `db`). Pasa la `DATABASE_URL` por variable de entorno.
    *   `web`: Contenedor del frontend, mapeando el puerto 80 al 3000 de la máquina host.
4.  **Scripts de Inicialización:** Genera un script `init_db.py` (o usa Alembic) para crear las tablas automáticamente y poblar un usuario administrador por defecto (`admin` / `admin123`) al arrancar el contenedor de la API.

## 7. Entregables Esperados por el Agente
Crea el árbol de directorios completo, escribe el código de la API, el Frontend y los archivos Docker. Una vez generado, el sistema debe poder levantarse únicamente ejecutando `docker-compose up --build` en la raíz del proyecto.
