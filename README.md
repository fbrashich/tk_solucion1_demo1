# Telemetría IoT Custom (Mesa Vibratoria)

## Propósito del Proyecto
Este proyecto consiste en el desarrollo de una plataforma web de telemetría IoT desde cero, orientada a microservicios y completamente contenerizada. El objetivo principal es recibir, almacenar y visualizar datos provenientes de un nodo IoT basado en ESP32 (incluyendo Latitud, Longitud y Estado de Ignición).

La plataforma proporciona un dashboard de "fricción cero" diseñado para usuarios finales no técnicos, permitiéndoles monitorizar de forma sencilla y en tiempo real:
- El estado de la conexión de sus dispositivos (ej. operativo o apagado).
- La ubicación geográfica actual en un mapa interactivo.
- El acumulado de horas de motor de los equipos.
- Un registro histórico (log) de los eventos recibidos.

## Tecnologías Utilizadas
- **Backend:** Python 3.11+, FastAPI (Asíncrono), Pydantic.
- **Base de Datos:** PostgreSQL 15+, SQLAlchemy 2.0 (Async).
- **Frontend:** React 18 (Vite), Tailwind CSS, React-Leaflet.
- **Infraestructura:** Docker, Docker Compose.

## Inicialización
Para ejecutar el proyecto, asegúrese de tener Docker y Docker Compose instalados, y ejecute en la raíz:
```bash
docker compose up --build
```

### Accesos y Servicios
Una vez que los contenedores estén levantados:
- **Frontend (Dashboard):** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:8000](http://localhost:8000)
- **Documentación Swagger / OpenAPI:** [http://localhost:8000/docs](http://localhost:8000/docs)

### Credenciales de Acceso
El script de inicialización crea automáticamente un usuario administrador predeterminado:
- **Usuario:** `admin`
- **Contraseña:** `admin123`

### Simulador IoT (Dispositivo Virtual para Demo)
Para enviar telemetría en tiempo real desde una consola local mientras el dashboard está abierto:
```bash
python demo_device.py
```
*(Utiliza la librería estándar de Python `urllib`, sin requerir instalación previa de dependencias externas)*.
El simulador enviará coordenadas y estados de ignición del dispositivo `MESA_01` cada 5 segundos al endpoint `/api/ingest`.

