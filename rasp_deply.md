# Guía de Despliegue en Raspberry Pi 4B (1 GB RAM, 64-bit)
## Plataforma IoT Tokioba con Docker, HDD 250 GB y Hub USB Alimentado

Esta guía contiene la configuración optimizada para desplegar la plataforma telemática **Tokioba IoT** en una **Raspberry Pi 4 Model B (1 GB RAM)** utilizando un **HDD mecánico de 250 GB** conectado a través de un **Hub USB 3.0 con alimentación externa**, garantizando estabilidad eléctrica, almacenamiento masivo de datos telemáticos y mínimo consumo de memoria RAM.

---

## 1. Arquitectura de Hardware Recomendada

```
                 ┌────────────────────────────────┐
                 │ Transformador de Pared del Hub │
                 └───────────────┬────────────────┘
                                 │ (Energía 5V dedicada)
                                 ▼
┌──────────────────┐  USB 3.0   ┌─────────────────┐  USB 3.0  ┌──────────────────┐
│  Raspberry Pi 4  ├───────────►│ Hub USB 3.0 con ├──────────►│  HDD 250 GB      │
│  (1 GB RAM)      │  (Datos)   │ Fuente Externa  │  (Datos + │  (SO + Docker +  │
└────────┬─────────┘            └─────────────────┘   Energía)│   Base de Datos) │
         │                                                    └──────────────────┘
         ▼
┌──────────────────┐
│ Fuente Oficial   │
│ USB-C 5.1V / 3A  │
└──────────────────┘
```

### Lista de Componentes:
1. **Raspberry Pi 4 Model B (1 GB RAM)**.
2. **Fuente de alimentación para la Pi:** 5.1V / 3A (USB-C oficial).
3. **Hub USB 3.0 con fuente externa propia:** Conecta a la pared y alimenta el HDD, evitando micro-caídas de tensión (*undervoltages*) en la Raspberry Pi.
4. **Disco Rígido (HDD) de 250 GB (2.5" SATA a USB 3.0):** Para booteo del sistema operativo, contenedores Docker y almacenamiento persistente de PostgreSQL (sin desgaste de memorias flash).
5. **Conexión de Red:** Cable Ethernet al router (recomendado) o Wi-Fi 2.4/5 GHz.

---

## 2. Paso 1: Flashear el Sistema Operativo en el HDD de 250 GB

> [!TIP]
> La Raspberry Pi 4 soporta booteo nativo directo desde USB. Flashearemos **Raspberry Pi OS Lite (64-bit)** directamente en el HDD de 250 GB conectado a tu PC.

1. Conectar el HDD de 250 GB a tu PC (vía USB).
2. Abrir **Raspberry Pi Imager** en tu PC.
3. Configurar los parámetros:
   * **Dispositivo:** *Raspberry Pi 4*.
   * **Sistema Operativo:** *Raspberry Pi OS (other)* $\rightarrow$ **Raspberry Pi OS Lite (64-bit)** (Debian Bookworm, sin interfaz gráfica).
   * **Almacenamiento:** Seleccionar el HDD de 250 GB.
4. Hacer clic en **Siguiente** y luego en **"Editar ajustes"** (ícono de engranaje):
   * **Hostname:** `tokioba-pi`
   * **Usuario y contraseña:** ej. usuario `tokioba`, contraseña a elección.
   * **Configurar Wi-Fi:** (si no usás cable de red).
   * **Habilitar SSH:** Seleccionar *Usar autenticación por contraseña*.
5. Guardar los ajustes y hacer clic en **"Sí"** para escribir la imagen en el HDD.

---

## 3. Paso 2: Conexión Eléctrica y Primer Arranque

1. Conectar el transformador del **Hub USB a la toma de corriente**.
2. Conectar el **HDD de 250 GB a uno de los puertos USB 3.0 (azules) del Hub**.
3. Conectar el cable principal del Hub a uno de los **dos puertos USB 3.0 (azules) de la Raspberry Pi 4**.
4. Conectar el cable de red Ethernet a la Pi.
5. Conectar la fuente USB-C de la Raspberry Pi para encenderla.
6. Esperar unos 40-50 segundos a que el HDD gire y el sistema inicie.
7. Desde tu PC (PowerShell / CMD), ingresar por SSH:
   ```bash
   ssh tokioba@tokioba-pi.local
   # Si no resuelve el nombre local, buscar la IP asignada en el router:
   # ssh tokioba@192.168.1.XX
   ```

---

## 4. Paso 3: Optimización del HDD y la Memoria RAM (ZRAM)

Al usar un disco mecánico y 1 GB de RAM, aplicamos dos optimizaciones clave:

### 4.1 Actualización del Sistema y Herramientas:
```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y curl git htop zram-tools
```

### 4.2 Activar ZRAM (Swap ultra rápido comprimido en RAM):
Evita que la Raspberry Pi use el disco mecánico como memoria swap, manteniendo la agilidad del sistema:
```bash
sudo bash -c 'echo -e "ALGO=zstd\nPERCENT=50" > /etc/default/zramswap'
sudo systemctl restart zramswap
```

### 4.3 Optimizar el HDD mecánico con `noatime`:
Reduce a la mitad los movimientos del cabezal físico del disco eliminando escrituras innecesarias en cada lectura:
```bash
# Editar fstab
sudo nano /etc/fstab
```
Buscar la línea de la partición raíz `/` y agregar `,noatime`:
```text
# Ejemplo antes:
PARTUUID=xxxx-02  /  ext4  defaults  0  1

# Modificar agregando noatime:
PARTUUID=xxxx-02  /  ext4  defaults,noatime  0  1
```
Guardar con `Ctrl + O`, confirmar con `Enter` y salir con `Ctrl + X`.

---

## 5. Paso 4: Instalación de Docker en 64 bits

```bash
# 1. Instalar Docker CE
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# 3. Habilitar inicio automático
sudo systemctl enable docker
sudo systemctl start docker

# 4. Aplicar cambios de grupo (cerrar sesión y volver a entrar):
exit
```

Volver a entrar por SSH (`ssh tokioba@tokioba-pi.local`) y verificar:
```bash
docker --version
docker compose version
```

---

## 6. Paso 5: Preparación de la Aplicación (Compilar en PC)

> [!IMPORTANT]
> **No ejecutes `npm run build` en la Raspberry Pi.** Compilamos en Windows y transferimos la carpeta `dist/` para no consumir los 1 GB de RAM de la Pi.

### En tu PC de Desarrollo (Windows):
1. Abrir terminal en la carpeta frontend:
   ```powershell
   cd d:\TK_DEMO1\tk_solucion1_demo1\frontend
   npm run build
   # Genera frontend\dist
   ```
2. Transferir los archivos por SCP a la Raspberry Pi:
   ```powershell
   cd d:\TK_DEMO1\tk_solucion1_demo1
   ssh tokioba@tokioba-pi.local "mkdir -p ~/tokioba-iot"

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

Pegar la siguiente configuración (optimizada para escrituras en HDD y 1 GB RAM):

```yaml
version: '3.8'

services:
  # Base de Datos PostgreSQL con tuning para HDD y 1GB RAM
  telemetry_db:
    image: postgres:15-alpine
    container_name: telemetry_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: telemetry_user
      POSTGRES_PASSWORD: telemetry_password_2026
      POSTGRES_DB: telemetry_db
    volumes:
      - postgres_hdd_data:/var/lib/postgresql/data
    command: >
      postgres 
      -c shared_buffers=32MB 
      -c work_mem=4MB 
      -c maintenance_work_mem=16MB 
      -c max_connections=25
      -c checkpoint_completion_target=0.9
      -c wal_writer_delay=200ms
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

  # Frontend Nginx (sirve archivos estáticos ya listos)
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
  postgres_hdd_data:
```

Guardar con `Ctrl + O`, confirmar con `Enter` y salir con `Ctrl + X`.

---

## 8. Paso 7: Puesta en Marcha y Verificación

Iniciar los contenedores en la Pi:
```bash
cd ~/tokioba-iot
docker compose -f docker-compose.pi.yml up -d --build
```

### Comprobación de recursos:
```bash
docker stats --no-stream
```
* **Consumo de memoria total:** ~115 a 130 MB de RAM.
* **Memoria libre en el sistema:** > 700 MB disponibles.
* **Espacio en disco:** ~230 GB libres para almacenar millones de eventos telemáticos.

---

## 9. Paso 8: Exposición Externa con Playit.gg (Túnel TCP/HTTP)

Para conectar los rastreadores GPS Teltonika y acceder a la web sin tocar el router:

1. **Instalar Playit.gg en la Raspberry Pi:**
   ```bash
   curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg >/dev/null
   echo "deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./" | sudo tee /etc/apt/sources.list.d/playit.list
   sudo apt update
   sudo apt install -y playit
   ```
2. **Ejecutar Playit por primera vez:**
   ```bash
   playit
   ```
3. Seguir el enlace de reclamo en el navegador y configurar:
   * **Túnel Web (HTTP):** Puerto local `3000` $\rightarrow$ Genera URL pública (ej. `tokioba.playit.gg`).
   * **Túnel GPS (TCP):** Puerto local `5027` (o el de ingesta) $\rightarrow$ Genera **host y puerto estático fijo** (ej. `gps-tokioba.playit.gg:34521`).
4. **Dejarlo corriendo como servicio en segundo plano:**
   ```bash
   sudo systemctl enable playit
   sudo systemctl start playit
   ```

---

## 10. Comandos Útiles de Mantenimiento

| Tarea | Comando en la Raspberry Pi |
| :--- | :--- |
| **Ver estado de contenedores** | `docker compose -f docker-compose.pi.yml ps` |
| **Ver consumo de memoria y CPU** | `docker stats` |
| **Ver temperatura del procesador** | `vcgencmd measure_temp` |
| **Ver espacio libre en el HDD** | `df -h /` |
| **Ver memoria RAM libre y ZRAM** | `free -h` |
| **Reiniciar la plataforma** | `docker compose -f docker-compose.pi.yml restart` |
| **Ver logs del backend** | `docker logs -f telemetry_api` |
