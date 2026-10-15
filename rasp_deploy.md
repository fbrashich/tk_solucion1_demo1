# Guía de Despliegue en Raspberry Pi 4B (1 GB RAM, 64-bit)
## Plataforma IoT Tokioba con Docker y SSD 120 GB USB 3.0

Esta guía contiene el procedimiento optimizado para desplegar la plataforma telemática **Tokioba IoT** en una **Raspberry Pi 4 Model B (1 GB RAM)** utilizando un disco de estado sólido **SSD de 120 GB por USB 3.0**. 

Al contar con almacenamiento **SSD**, se eliminan los cuellos de botella de los discos mecánicos (tiempos de búsqueda, ruidos y alto consumo de corriente), logrando una velocidad de lectura/escritura superior a 300 MB/s, arranques en menos de 15 segundos y latencias casi nulas en PostgreSQL.

---

## 1. Arquitectura de Hardware Simplificada

Gracias al bajo consumo de corriente del SSD (menos de 2.5W), **no se requiere hub externo ni fuentes auxiliares**:

```
┌──────────────────────────────────────────────┐
│             Raspberry Pi 4B (1 GB)           │
│                                              │
│  [Puerto USB-C]       [Puerto USB 3.0 Azul]  │
└───────┬──────────────────────────┬───────────┘
        │                          │ (Datos + Energía directa)
        ▼                          ▼
┌──────────────────┐      ┌──────────────────────────┐
│  Fuente Oficial  │      │     SSD 120 GB USB 3.0   │
│  USB-C 5.1V / 3A │      │  (SO + Docker + Postgres)│
└──────────────────┘      └──────────────────────────┘
```

### Componentes:
1. **Raspberry Pi 4 Model B (1 GB RAM)**.
2. **Fuente oficial de alimentación:** USB-C 5.1V / 3.0A (15.3W).
3. **SSD de 120 GB (con cable o gabinete USB 3.0):** Conectado directamente a uno de los dos puertos USB 3.0 (azules) de la Pi.
4. **Conexión de Red:** Cable Ethernet conectado al router (preferible) o red Wi-Fi.

---

## 2. Paso 1: Flashear el SSD de 120 GB desde la PC

> [!TIP]
> La Raspberry Pi 4 bootea de forma nativa desde unidades USB. Flasheamos **Raspberry Pi OS Lite (64-bit)** directamente en el SSD de 120 GB conectado a tu PC.

1. Conectar el SSD de 120 GB a la computadora por USB.
2. Abrir **Raspberry Pi Imager**.
3. Configurar los parámetros:
   * **Dispositivo:** *Raspberry Pi 4*.
   * **Sistema Operativo:** *Raspberry Pi OS (other)* $\rightarrow$ **Raspberry Pi OS Lite (64-bit)** (Debian Bookworm, sin escritorio gráfico).
   * **Almacenamiento:** Seleccionar el SSD de 120 GB.
4. Hacer clic en **Siguiente** y seleccionar **"Editar ajustes"** (ícono de engranaje):
   * **Hostname:** `tokioba-pi`
   * **Usuario y contraseña:** ej. usuario `tokioba`, contraseña segura.
   * **Configurar Wi-Fi:** (si no vas a usar cable Ethernet).
   * **Habilitar SSH:** Seleccionar *Usar autenticación por contraseña*.
5. Guardar los ajustes y hacer clic en **"Sí"** para escribir la imagen en el SSD.

---

## 3. Paso 2: Conexión y Primer Arranque

1. Desconectar el SSD de la PC y enchufarlo en cualquiera de los **dos puertos USB 3.0 azules** de la Raspberry Pi 4.
2. Conectar el cable Ethernet a la Pi.
3. Conectar la fuente USB-C oficial a la Raspberry Pi.
4. Gracias al SSD, el sistema arranca en solo **10 a 15 segundos**.
5. Desde la terminal de tu PC (PowerShell o CMD), ingresar por SSH:
   ```bash
   ssh tokioba@tokioba-pi.local
   # Si no resuelve el nombre, buscar la IP en el router:
   # ssh tokioba@192.168.1.XX
   ```

---

## 4. Paso 3: Optimización del Sistema y Memoria (ZRAM)

Para aprovechar al máximo el SSD y los 1 GB de RAM:

### 4.1 Actualización del Sistema:
```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y curl git htop zram-tools
```

### 4.2 Activar ZRAM (Swap ultrarrápido comprimido en RAM):
ZRAM crea un área comprimida en memoria para absorber picos temporales sin degradar el SSD ni ralentizar el sistema:
```bash
sudo bash -c 'echo -e "ALGO=zstd\nPERCENT=50" > /etc/default/zramswap'
sudo systemctl restart zramswap
```

Verificar memoria disponible con:
```bash
free -h
# Verás ~900 MB de RAM y ~450 MB de Swap ZRAM con un consumo base de solo 75-85 MB.
```

---

## 5. Paso 4: Instalación de Docker en 64 bits

Ejecutar el instalador oficial de Docker para procesadores ARM de 64 bits:

```bash
# 1. Instalar Docker CE
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# 3. Habilitar servicio en el arranque
sudo systemctl enable docker
sudo systemctl start docker

# 4. Cerrar sesión para aplicar el grupo de usuario:
exit
```

Volver a conectarse por SSH (`ssh tokioba@tokioba-pi.local`) y comprobar:
```bash
docker --version
docker compose version
```

---

## 6. Paso 5: Preparación del Frontend (Compilar en PC)

> [!IMPORTANT]
> **No ejecutes `npm run build` en la Raspberry Pi.**
> El empaquetado de Vite/Node.js consume picos de 800 MB de RAM. Compilamos en Windows en 5 segundos y transferimos el resultado a la Pi.

### En tu PC de Desarrollo (Windows):
1. Abrir terminal en la carpeta frontend:
   ```powershell
   cd d:\TK_DEMO1\tk_solucion1_demo1\frontend
   npm run build
   # Genera la carpeta frontend\dist lista para servir
   ```
2. Transferir los archivos a la Raspberry Pi por SCP:
   ```powershell
   cd d:\TK_DEMO1\tk_solucion1_demo1
   # Crear directorio en la Pi
   ssh tokioba@tokioba-pi.local "mkdir -p ~/tokioba-iot"

   # Copiar backend, frontend compilado y configuración
   scp -r backend tokioba@tokioba-pi.local:~/tokioba-iot/
   scp -r frontend/dist tokioba@tokioba-pi.local:~/tokioba-iot/frontend_dist
   scp -r frontend/nginx.conf tokioba@tokioba-pi.local:~/tokioba-iot/
   ```

---

## 7. Paso 6: Configuración de `docker-compose.pi.yml`

En la Raspberry Pi, crear el archivo de despliegue:

```bash
cd ~/tokioba-iot
nano docker-compose.pi.yml
```

Pegar la siguiente configuración limpia y optimizada para SSD:

```yaml
version: '3.8'

services:
  # Base de Datos PostgreSQL Optimizado para SSD y 1GB RAM
  telemetry_db:
    image: postgres:15-alpine
    container_name: telemetry_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: telemetry_user
      POSTGRES_PASSWORD: telemetry_password_2026
      POSTGRES_DB: telemetry_db
    volumes:
      - postgres_ssd_data:/var/lib/postgresql/data
    command: >
      postgres 
      -c shared_buffers=32MB 
      -c work_mem=4MB 
      -c maintenance_work_mem=16MB 
      -c max_connections=25
    deploy:
      resources:
        limits:
          memory: 120M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Backend FastAPI
  telemetry_api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: telemetry_api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://telemetry_user:telemetry_password_2026@telemetry_db:5432/telemetry_db
      SECRET_KEY: tokioba_super_secret_pi_key_2026
      ALGORITHM: HS256
      ACCESS_TOKEN_EXPIRE_MINUTES: 1440
    ports:
      - "8000:8000"
    depends_on:
      - telemetry_db
    deploy:
      resources:
        limits:
          memory: 150M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Frontend Nginx (sirviendo archivos estáticos pre-compilados)
  telemetry_web:
    image: nginx:alpine
    container_name: telemetry_web
    restart: unless-stopped
    ports:
      - "3000:80"
    volumes:
      - ./frontend_dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - telemetry_api
    deploy:
      resources:
        limits:
          memory: 40M
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

volumes:
  postgres_ssd_data:
```

Guardar con `Ctrl + O`, confirmar con `Enter` y salir con `Ctrl + X`.

---

## 8. Paso 7: Puesta en Marcha y Validación

Iniciar los contenedores en la Raspberry Pi:
```bash
cd ~/tokioba-iot
docker compose -f docker-compose.pi.yml up -d --build
```

### Comprobación de consumo en tiempo real:
```bash
docker stats --no-stream
```

Resultado esperado en el SSD:
```
CONTAINER        CPU %     MEM USAGE / LIMIT     MEM %
telemetry_api    0.8%      62.0MiB / 150MiB      41.3%
telemetry_db     0.2%      36.5MiB / 120MiB      30.4%
telemetry_web    0.0%       8.5MiB / 40MiB       21.2%
```
* **Consumo total del stack:** **~110 MB de RAM**.
* **Memoria libre en el sistema:** **> 750 MB de RAM libres**.
* **Tiempo de respuesta de base de datos:** Menor a 1 milisegundo gracias al SSD.

---

## 9. Paso 8: Exposición Externa con Playit.gg (Túnel TCP/HTTP)

Para que los rastreadores GPS Teltonika transmitan desde la calle y los usuarios accedan a la web sin tocar el router:

1. **Instalar Playit.gg en la Raspberry Pi:**
   ```bash
   curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg >/dev/null
   echo "deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./" | sudo tee /etc/apt/sources.list.d/playit.list
   sudo apt update
   sudo apt install -y playit
   ```
2. **Iniciar Playit por primera vez:**
   ```bash
   playit
   ```
3. Abrir el enlace de reclamo en el navegador de tu PC y configurar:
   * **Túnel Web (HTTP):** Puerto local `3000` $\rightarrow$ Genera URL pública (ej. `tokioba.playit.gg`).
   * **Túnel GPS (TCP):** Puerto local `5027` (o el de ingesta) $\rightarrow$ Genera **host y puerto estático fijo** (ej. `gps-tokioba.playit.gg:34521`).
4. **Dejar Playit corriendo como servicio en segundo plano:**
   ```bash
   sudo systemctl enable playit
   sudo systemctl start playit
   ```

---

## 10. Comandos Útiles de Mantenimiento

| Tarea | Comando en la Raspberry Pi |
| :--- | :--- |
| **Ver estado de los contenedores** | `docker compose -f docker-compose.pi.yml ps` |
| **Ver consumo de memoria y CPU** | `docker stats` |
| **Ver temperatura del procesador** | `vcgencmd measure_temp` |
| **Ver espacio libre en el SSD** | `df -h /` |
| **Ver memoria RAM libre y ZRAM** | `free -h` |
| **Reiniciar la plataforma** | `docker compose -f docker-compose.pi.yml restart` |
| **Ver logs del backend en vivo** | `docker logs -f telemetry_api` |
