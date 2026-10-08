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
docker-compose up --build
```
