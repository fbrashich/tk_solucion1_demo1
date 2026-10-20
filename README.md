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

### Arquitectura y Puertos de Servicio (Gateway Router en Puerto 80)
La plataforma opera con un **Gateway Router Nginx en el puerto 80** que expone una única entrada exterior y permite elegir mediante un selector visual y cookie (`iot_target`) qué consola visualizar:
- **Selector Visual de Plataformas:** [http://localhost/selector](http://localhost/selector)
- **Plataforma Propia IoT (React + FastAPI):** Escucha internamente en el puerto `8081` (o vía cookie `iot_target=custom`).
- **Consola Traccar:** Escucha internamente en el puerto `8082` (o vía cookie `iot_target=traccar`).
- **Ingesta Telemática Directa (Listener Global Traccar):**
  - **Puerto 5027 (TCP/UDP):** Decodificador para trackers Teltonika (ATC700, FMC920, FMB920).
  - **Puerto 5055 (HTTP):** Decodificador para clientes OsmAnd / FindMy.
- **Backend FastAPI:** Escucha en el puerto `8000` (`http://localhost:8000/api` y `/docs`).
- **Seguridad DB:** PostgreSQL opera exclusivamente en la red interna de Docker (`telemetry_db:5432`).

### Credenciales de Acceso
El script de inicialización crea automáticamente cuentas listas para usar:
1. **Super Administrador:**
   - **Usuario:** `admin` | **Contraseña:** `admin123`
   - *Capacidades:* Control total, gestión de cuentas de operadores, asignación y exportación de telemetría.
2. **Operadores Industriales:**
   - **Usuario:** `fabianb_op` / `aldo` | **Contraseña:** `Password123!`
   - *Capacidades:* Monitoreo en vivo de equipos, mapas de flota, horómetros, registro de eventos y exportación de datos.

### Capacidades y Blindajes Telemáticos
- **Ingesta Unificada Traccar -> FastAPI (`POST /api/ingest/traccar`):**
  - Traccar decodifica las tramas de hardware y las reenvía vía HTTP JSON por la red interna de Docker hacia FastAPI.
  - Cola de reintentos en memoria activa (`forward.retry.enable=true`) para proteger la telemetría ante reinicios o actualizaciones de FastAPI.
- **Emparejamiento Estricto por IMEI (`uniqueId`):**
  - Vinculación unívoca por IMEI (ej. ATC700 `860693080022560`), independizándose de IDs autoincrementales internos.
- **Auto-Discovery:**
  - Si Traccar recibe datos de un nuevo tracker, FastAPI lo crea automáticamente en PostgreSQL y registra su telemetría al instante.
- **Blindaje de Ráfagas e Idempotencia:**
  - Idempotencia por `device_id + fixTime` para evitar paquetes duplicados.
  - Protección de horas de motor: cálculo estricto de deltas solo cuando `fixTime > last_updated` y la ignición está activa, evitando deltas negativos por paquetes desordenados.
  - Preservación de la última posición en tiempo real ante ráfagas de memoria históricas.
- **Decodificación Extendida de IO Elements Teltonika:**
  - Ignición (`io239`/`io1`), Movimiento (`io240`), Batería del vehículo (`power`/`io66`), Batería interna (`battery`/`io67`), Odómetro (`totalDistance`/`io16`), Satélites (`sat`), Señal GSM (`rssi`) y conversión de velocidad a km/h (`speed * 1.852`).
  - Guardado íntegro del JSON en `raw_data` con metadata `normalized`.
- **Sincronización ABM Bidireccional:**
  - Cualquier alta, modificación o baja de equipo en la plataforma Custom se propaga automáticamente a Traccar vía REST API.
  - Al iniciar FastAPI (`lifespan`), una rutina en segundo plano reconcilia ambos catálogos.
- **Suite de Pruebas Automatizadas:**
  - `python scripts/run_dod_verification.py` valida automáticamente los 4 requerimientos del Definition of Done.

---

## Despliegue con Túnel Inverso Zrok 2 en Docker (URL Fija Reservada)

La plataforma integra el servicio **Zrok 2** directamente en Docker Compose con un nombre reservado permanente:

* **URL Pública Fija**: [https://iot-web-portal.shares.zrok.io](https://iot-web-portal.shares.zrok.io)
* **Arranque 100% Automático**: Se inicia junto con toda la plataforma al levantar Docker:
  ```bash
  docker compose up -d
  ```
  *(El contenedor `telemetry_zrok` monta la configuración de tu entorno y se conecta de forma desatendida).*

* **Ver estado o registros del túnel**:
  ```bash
  docker logs telemetry_zrok
  ```

### 2. Cómo remover la pantalla de advertencia inicial (Página Interstitial de Zrok 2)
En las versiones recientes de Zrok 2, los enlaces públicos muestran una pantalla de cortesía anti-phishing antes de redirigir al sitio web. Para eliminarla:

1. **Para usuarios y navegadores web (Recomendado):**
   - Ingresa al portal de Zrok en [https://api.zrok.io](https://api.zrok.io).
   - En la configuración de tu cuenta, asocia una tarjeta para verificarla (el costo es de **$0 USD** para cuentas gratuitas).
   - Una vez verificada la cuenta, Zrok **desactiva automáticamente la pantalla de advertencia** para todos los enlaces públicos que crees.
2. **Para consumo programático (APIs / Postman / cURL / Scripts):**
   - Agrega el encabezado HTTP:
     ```http
     skip_zrok_interstitial: true
     ```
     Las herramientas que envíen este encabezado omiten inmediatamente la pantalla de espera.


