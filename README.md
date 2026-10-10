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

### Accesos y Servicios (Tráfico Unificado en Puerto 3000)
Una vez que los contenedores estén levantados, **todo el tráfico está unificado a través del proxy reverso Nginx en el puerto 3000**, ideal para despliegues con túneles inversos (Zrok, ngrok, Cloudflare Tunnels):
- **Dashboard Web (SPA Industrial):** [http://localhost:3000](http://localhost:3000)
- **API Backend (Proxy Reverso):** [http://localhost:3000/api](http://localhost:3000/api)
- **Documentación Swagger / OpenAPI:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **Seguridad DB:** La base de datos PostgreSQL **no** expone puertos hacia el host; opera exclusivamente en la red interna de Docker comunicada con el servicio `api`.

### Credenciales de Acceso
El script de inicialización crea automáticamente dos cuentas listas para usar:
1. **Super Administrador:**
   - **Usuario:** `admin` | **Contraseña:** `admin123`
   - *Capacidades:* Control total, acceso al panel de gestión de cuentas (alta/baja de usuarios), alta/baja/modificación de maquinaria y exportación de telemetría.
2. **Operador Industrial (Aldo):**
   - **Usuario:** `aldo` | **Contraseña:** `aldo123`
   - *Capacidades:* Monitoreo en vivo de equipos, mapas de flota, horómetros, registro de eventos y exportación de datos.

### Nuevas Funcionalidades Implementadas
- **Visualización Multidispositivo en el Mismo Mapa:**
  - Selector desplegable en la barra superior para alternar entre la vista de **Toda la Flota** o un equipo específico (`MESA_01`, `MESA_02`, `PALA_01`, etc.).
  - En la vista de flota, el mapa renderiza simultáneamente las balizas de todos los equipos con su color según el estado operativo (`OPERANDO` verde, `DETENIDA` ámbar, `SIN COMUNICACIÓN` rojo).
- **CRUD de Dispositivos (Alta, Baja y Modificación):**
  - Registro de nuevos equipos de planta con código de hardware, nombre legible, tipo de maquinaria y sector.
  - Modificación de metadatos y baja de equipos.
- **Panel de Super Administrador:**
  - Ventana modal de administración accesible con un clic para cuentas de rol `admin`.
  - Permite dar de alta nuevos operadores, suspender/activar cuentas, asignar permisos y resetear accesos.
- **Exportación de Datos a CSV:**
  - Descarga instantánea de reportes de telemetría históricos en formato `.csv` con marcas temporales UTC, estados de ignición y coordenadas GPS.
- **Simulador Multi-Dispositivo:**
  - `python demo_device.py` transmite en vivo y en paralelo para múltiples máquinas (`MESA_01` y `MESA_02`), permitiendo observar el movimiento sincronizado y el comportamiento en el mapa.
- **Aislamiento Multi-Tenant Estricto (Privacidad de Clientes):**
  - Cada dispositivo está asociado a nivel relacional en PostgreSQL a su cuenta de operador (`devices.user_id = users.id`).
  - Cada operador únicamente tiene visibilidad y acceso a su propia maquinaria y telemetría.
  - El Super Administrador supervisa cuentas y volumen de equipos sin acceso a la telemetría privada.
  - Para nuevos operadores sin equipos asignados (ej. `demo1`), la interfaz muestra un espacio inicial con botón de alta.

---

## Despliegue con Túnel Inverso Zrok en Docker

La plataforma incluye soporte nativo para ejecutar **Zrok** como servicio dentro de Docker Compose sin necesidad de abrir consolas manuales adicionales.

### 1. Iniciar Zrok automáticamente con Docker Compose
Si ya tienes `zrok` habilitado en tu máquina host (`~/.zrok2` en Windows/Linux):
```bash
docker compose --profile zrok up -d
```
Docker Compose montará tu sesión de zrok y compartirá automáticamente `http://web:80` en segundo plano.

Para ver la URL pública generada por Zrok:
```bash
docker compose logs zrok
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


