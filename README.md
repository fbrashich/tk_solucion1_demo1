# Tokioba Telematics & Fleet IoT Platform (`v0.6.0`)
## Plataforma Integral de Telemetría Industrial, Rastreo Vehicular y Gestión de Flotas

Tokioba Telematics es una plataforma web integral, modular y completamente contenerizada en microservicios, diseñada para la adquisición, procesamiento en tiempo real, análisis operativo y visualización de flotas de vehículos y maquinaria industrial (incluyendo nodos IoT basados en ESP32 y localizadores GPS profesionales Teltonika FMC150, FMB920 y FMC920).

La solución combina un **backend reactivo de alto rendimiento (FastAPI + PostgreSQL)** con una **interfaz de usuario moderna tipo Single Page Application (React 18 + Tailwind CSS + Leaflet)**, brindando monitoreo telemático en tiempo real, alertas multicanal vía Telegram, detección de viajes, planes de mantenimiento preventivo y geocercas inteligentes con cero fricción técnica para el operador.

---

## 🚀 Capacidades Destacadas de la Plataforma

### 1. Monitoreo en Tiempo Real y Motor de Estados Operativos
- **5 Estados Operativos Canónicos:** Clasificación automática del estado de cada unidad evaluando ignición, velocidad inercial, modos de reposo y actividad telemática:
  * 🟢 **EN MOVIMIENTO (`MOVING`):** Ignición activa y velocidad $\ge 3\text{ km/h}$ o movimiento detectado.
  * 🟡 **RALENTÍ (`IDLING`):** Motor encendido con el vehículo detenido, acumulando tiempo y costo de combustible desperdiciado.
  * 🔵 **ESTACIONADO EN MODO AHORRO (`PARKED_SLEEP`):** Motor apagado con el tracker en modo de suspensión telemática (`Deep Sleep` / `Online Deep Sleep`).
  * 🟣 **ALERTA REMOLQUE / GRÚA (`TOWING`):** Detección inercial de movimiento con el motor apagado (acarreo o intento de robo).
  * 🔴 **SIN COMUNICACIÓN (`DISCONNECTED`):** Alerta ante la pérdida de enlace telemático por más de 30 minutos.
- **Balizas Radar Dinámicas:** Marcadores en el mapa Leaflet con halos pulsantes codificados por color según el estado operativo en tiempo real.

### 2. Salud de Batería 12V y Diagnóstico de Alternador
- Evaluación continua del voltaje de la batería principal del vehículo:
  * `SALUD ÓPTIMA` ($\ge 12.3\text{V}$), `NORMAL / REPOSO` ($\ge 11.8\text{V}$), `BATERÍA BAJA` ($\ge 11.2\text{V}$) y `CRÍTICA / DESCARGADA` ($< 11.2\text{V}$).
- Diagnóstico automático del alternador al encender el motor: detección de carga adecuada ($\ge 13.5\text{V}$) o advertencia de falla del sistema de carga ($< 12.5\text{V}$).
- Lectura de batería interna de respaldo del tracker en voltios y miliamperios.

### 3. Calibración de Tablero Físico (Odómetro y Horómetro)
- Sincronización exacta con el tablero físico del vehículo mediante offsets calibrables (`odometer_offset_km`, `engine_hours_offset`).
- Modal interactivo con cálculo automático del offset ingresando la lectura actual del odómetro físico.

### 4. Detección Automática de Viajes, Paradas y Desperdicio de Combustible
- Apertura automática de viaje al detectar ignición y cierre al apagar el motor.
- Cálculo de distancias ortodrómicas geodésicas (Haversine) con filtrado de saltos espurios.
- Registro de velocidad máxima, velocidad promedio y tiempo acumulado en ralentí.
- Estimación económica de combustible desperdiciado en paradas con motor encendido ($1.5\text{ L/h}$).
- **Historial de Viajes:** Filtros rápidos (*Hoy*, *Ayer*, *Últimos 7 días*, *Todos*) con métricas consolidadas de la flota.

### 5. Reproductor Interactivo de Recorridos (Route Playback)
- Visualización animada del recorrido sobre el mapa Leaflet con orientación dinámica del vehículo según el rumbo (`course`).
- Controles de reproducción interactiva: Play / Pause, selector de velocidad ($1\times, 2\times, 5\times, 10\times$), Scrubber timeline y HUD flotante con velocímetro digital.

### 6. Geocercas Inteligentes y Control de Permanencia
- **Geometrías Poligonales y Circulares:** Diseñador visual sobre mapa Leaflet.
- **Ray-Casting Algorithm en Python puro:** Evaluación de contención de coordenadas en $< 1.5\ \mu\text{s}$ sin requerir la extensión PostGIS ni bibliotecas C externas.
- **Filtro Anti-Jitter (Debouncing):** Exige posiciones consecutivas estables para validar eventos `ENTER` o `EXIT`, evitando falsas alarmas por ruido GPS.
- **Control de Permanencia:** Cálculo automático del tiempo exacto transcurrido dentro del recinto.
- **Posicionamiento Inteligente del Diseñador:**
  * Al seleccionar un vehículo individual, el mapa centra automáticamente en sus coordenadas con zoom 15 y botón *"Fijar centro en vehículo"*.
  * Al visualizar la flota completa, el sistema consulta la IP pública del usuario mediante GeoIP, centrando el mapa en su ciudad o región aproximada con zoom 13.
  * **Autocentrado único:** Centra una sola vez en la carga inicial, permitiendo navegación y zoom completamente libres sin snap-back forzado.
- **Tarjeta Adaptativa 'Zona Operativa':** Reporta en vivo la geocerca donde se encuentra el vehículo activo y se oculta automáticamente en la vista de flota general.

### 7. Alertas Operativas y Despachador Multicanal a Telegram
- **6 Reglas Canónicas:** Corte de alimentación externa (`POWER_CUT`), batería crítica (`CRITICAL_BATTERY`), batería baja (`LOW_BATTERY`), remolque no autorizado (`TOWING`), exceso de velocidad (`OVERSPEED`) y falla de alternador (`ALTERNATOR_FAIL`).
- **Mecanismo Anti-Flapping:** Supresión de repeticiones de 15 minutos para evitar saturación de notificaciones.
- **Campana de Alertas en UI:** Badge interactivo con pulso de radar, detalle cronológico y resolución en un clic.
- **Despacho Asíncrono a Telegram:** Envío instantáneo no bloqueante mediante Telegram Bot API con plantillas HTML y enlaces directos a la plataforma.

### 8. Control de Horarios Laborales
- Configuración de horarios de trabajo autorizados y días hábiles por vehículo.
- Disparo automático de la alerta `UNAUTHORIZED_SCHEDULE` ante encendidos de motor fuera de la jornada laboral establecida.

### 9. Planes de Mantenimiento Preventivo
- Programas preventivos configurables por Odómetro (`KM`) o por Horómetro (`HOURS`).
- Semáforo dinámico de estado: `OK` (verde), `WARNING` (amarillo, service próximo a vencer) y `OVERDUE` (rojo, service excedido).
- Registro de servicios realizados con taller mecánico, costo económico y **auto-reprogramación automática del próximo objetivo**.
- Libro digital auditado de intervenciones mecánicas.

### 10. Generador de Reportes Ejecutivos en PDF Corporativo (`v0.6.0`)
- **Generación Vectorial In-Memory (ReportLab 5.1.0):** Flujo de bytes transmitido vía `io.BytesIO` directamente en `StreamingResponse` de FastAPI sin tocar disco.
- **Paginación Dinámica `NumberedCanvas`:** Formato A4 oficial con membrete corporativo, metadatos y foliado *"Página X de Y"*.
- **Módulos Auditados en el Documento:**
  * **KPIs Consolidados:** Kilómetros recorridos, horas motor, velocidad promedio y velocidad máxima.
  * **Análisis Financiero de Ralentí:** Litros desperdiciados en detenciones con motor encendido ($1.2\text{ L/h}$) y costo económico en Pesos Argentinos ($ARS).
  * **Semáforo Preventivo:** Estado de planes de service, avance porcentual y días restantes.
  * **Seguridad e Incidentes:** Alertas críticas, corte de batería, grúa y excesos de velocidad.
  * **Resumen de Viajes:** Tabla cronológica detallada de recorridos realizados en el período.
- **Modal Interactivo en Frontend:** Selector de alcance (flota consolidada o unidad específica), presets temporales (*7 días*, *30 días*, *mes actual*, *personalizado*) y descarga automática.

### 11. Inmovilización Remota Segura (Corte de Motor con Safety Interlock) (`v0.6.0`)
- **Safety Interlock ($\le 5.0\text{ km/h}$):** Bloqueo estricto de corte de motor si el vehículo se desplaza a velocidad mayor a $5.0\text{ km/h}$. En tal situación, el comando pasa a `PENDING_SAFE_STOP` evitando accidentes viales.
- **Ejecución Diferida Automática en Ingesta:** El pipeline de telemetría evalúa la velocidad en cada paquete entrante y ejecuta el corte a Traccar (`setdigout 1`) automáticamente tan pronto el vehículo se detiene de forma segura.
- **Restauración de Motor:** Envío de `setdigout 0` y retorno al estado `NORMAL`.
- **Doble Factor de Autorización y Anti-IDOR:** Validación obligatoria mediante PIN de seguridad numérico por vehículo o contraseña de la cuenta del operador.
- **Auditoría Forense (`command_audit_logs`):** Registro de IP solicitante, usuario, dispositivo, velocidades y marcas de tiempo.
- **Notificación Multicanal:** Alerta crítica inmediata a Telegram con emojis 🛑 / ⚡.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Backend** | Python 3.11+, FastAPI (Asíncrono), Pydantic v2, SQLAlchemy 2.0 (Async), AsyncPG, ReportLab 5.1.0 (PDF Engine), Telegram Bot API. |
| **Base de Datos** | PostgreSQL 15+ con índices optimizados para series temporales y eventos telemáticos. |
| **Frontend** | React 18, Vite, Tailwind CSS, Leaflet, React-Leaflet, Lucide React. |
| **Gateway & Proxy** | Nginx Alpine con enrutamiento por cookie, soporte WebSockets, limitación de tasa y cabeceras anti-caché estrictas. |
| **Protocolos Hardware** | Traccar Core 5027 (TCP/UDP) para Teltonika FMC150/FMB920/FMC920, OsmAnd 5055 (HTTP). |
| **Infraestructura** | Docker, Docker Compose, Zrok 2 (túnel público seguro permanente). |

---

## 🌐 Arquitectura de Red y Puertos (Gateway Router en Puerto 80)

La plataforma centraliza todo el tráfico exterior a través de un **Gateway Router Nginx en el puerto 80**, permitiendo alternar mediante una cookie (`iot_target`) entre las consolas disponibles:

```
                          [ Internet / LAN (Puerto 80) ]
                                        │
                             ┌──────────┴──────────┐
                             ▼                     ▼
                  [ HTTP:80 / Gateway ]    [ TCP:5027 Traccar ]
                             │                     │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
 [ /selector ]      [ iot_target=custom ]  [ iot_target=traccar ]
 Selector Visual    Plataforma Tokioba     Consola Traccar
                     (React + FastAPI)      (Puerto 8082)
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
         [ web:8081 Nginx ]     [ api:8000 FastAPI ]
                  │                     │
                  └──────────┬──────────┘
                             ▼
                    [ db:5432 Postgres ]
```

- **[http://localhost/selector](http://localhost/selector):** Selector visual interactivo para elegir la interfaz deseada.
- **[http://localhost/custom](http://localhost/custom) (o cookie `iot_target=custom`):** Acceso directo a la plataforma propia Tokioba IoT (React SPA en `web:8081`).
- **[http://localhost/traccar](http://localhost/traccar) (o cookie `iot_target=traccar`):** Acceso directo a la consola nativa de Traccar (`traccar:8082`).
- **Puerto 5027 (TCP/UDP):** Receptor telemático para hardware Teltonika.
- **Puerto 8000 (HTTP):** API REST FastAPI y documentación Swagger interactiva ([http://localhost:8000/docs](http://localhost:8000/docs)).
- **Puerto 5432:** PostgreSQL accesible exclusivamente en la red interna de Docker (`telemetry_db`).

---

## ⚡ Instalación y Puesta en Marcha

### Prerrequisitos
- Docker Engine $\ge 24.0$ y Docker Compose $\ge 2.20$.
- Git instalado en el sistema.

### 1. Clonar el Repositorio
```bash
git clone https://github.com/fbrashich/tk_solucion1_demo1.git
cd tk_solucion1_demo1
```

### 2. Configuración de Variables de Entorno
Copia o edita las credenciales en `.env` (o en `docker-compose.yml`):
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=telemetry
TRACCAR_API_URL=http://traccar:8082/api
TRACCAR_USER=admin@tokioba.com
TRACCAR_PASSWORD=tokioba_admin_2026
TELEGRAM_BOT_TOKEN=tu_token_de_telegram_opcional
TELEGRAM_CHAT_ID=tu_chat_id_opcional
```

### 3. Iniciar la Plataforma
Ejecuta el despliegue contenerizado:
```bash
docker compose up -d
```
El contenedor `api` aplicará automáticamente las migraciones DDL idempotentes (`init_db.py`) antes de iniciar el servidor web.

### 4. Acceder al Sistema
Abre tu navegador en:
```
http://localhost/custom
```
*(O accede vía la IP de tu servidor, ej: `http://172.16.22.2/custom`)*

---

## 🔐 Credenciales de Acceso por Defecto

| Rol de Usuario | Correo / Usuario | Contraseña | Capacidades |
| :--- | :--- | :--- | :--- |
| **Super Administrador** | `admin` / `admin@tokioba.com` | `admin123` | Control total, gestión de usuarios, asignación de equipos y parámetros de sistema. |
| **Operador de Flota** | `fabianb@tokioba.com` / `fabianb_op` | `fabian123` / `Password123!` | Monitoreo en vivo, geocercas, viajes, alertas, mantenimiento y calibración de tablero. |
| **Operador Industrial** | `aldo` | `Password123!` | Visualización telemática, control de horas de motor y exportación de datos. |

---

## 🧪 Auditoría y Ejecución de Pruebas Automatizadas

La plataforma cuenta con una suite integral de pruebas unitarias y de integración automatizadas:

Para ejecutar todas las pruebas en el entorno backend:
```bash
docker compose exec api python -m unittest discover -s . -p "test_*.py" -v
```

O bien directamente en el entorno de desarrollo:
```bash
cd backend
python -m unittest test_stage6_engine_cut.py
python -m unittest test_stage6_report_generator.py
python -m unittest test_stage5_geofences_and_notifications.py
python -m unittest test_stage4_alerts_and_maintenance.py
python -m unittest test_stage3_trips_and_playback.py
python -m unittest test_stage2_states_and_calibration.py
python -m unittest test_version_and_security_spec.py
```

---

## 🌍 Acceso Remoto Seguro con Zrok 2

La plataforma incluye integración nativa con el túnel público inverso **Zrok 2** configurado en `docker-compose.yml`:
* **URL Pública Fija:** [https://iot-web-portal.shares.zrok.io](https://iot-web-portal.shares.zrok.io)
* **Ver registros del túnel:**
  ```bash
  docker logs telemetry_zrok
  ```

---

## 📚 Documentación Técnica Detallada

Para consultar el registro cronológico completo de decisiones técnicas, arquitectura matemática, resolución de incidencias y detalles de implementación de cada etapa:
* 📄 **Bitácora Consolidada de Progreso:** [`progreso.md`](file:///d:/TK_DEMO1/tk_solucion1_demo1/progreso.md)
* 📋 **Especificación Comercial Plan v4:** [`plan_v4.md`](file:///d:/TK_DEMO1/tk_solucion1_demo1/plan_v4.md)
