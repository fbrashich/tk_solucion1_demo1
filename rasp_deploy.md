# Guía Definitiva de Despliegue en Raspberry Pi 4B (1 GB RAM, 64-bit)
## Arquitectura Híbrida: Boot MicroSD (8 GB) + Almacenamiento y Swap en SSD USB 3.0 (120 GB)

Esta guía detalla el paso a paso exacto para desplegar la plataforma telemática **Tokioba IoT** en una **Raspberry Pi 4 Model B (1 GB RAM)** con la arquitectura óptima solicitada:
1. **MicroSD de 8 GB:** Exclusiva para el arranque (*boot*) y el sistema operativo base en modo casi de solo lectura.
2. **Optimización Inmediata de Memoria:** ZRAM en RAM nativo (`lzo-rle`), kernel sysctl tuneado y desactivación del swap de la MicroSD para evitar su desgaste.
3. **SSD de 120 GB (USB 3.0):** Montado en `/mnt/ssd` para alojar el Swap de respaldo (Nivel 2), el motor de Docker (`data-root`), la base de datos PostgreSQL y los archivos de la aplicación.

---

## 1. Topología de la Arquitectura Híbrida

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TOPOLOGÍA HÍBRIDA TOKIOBA                       │
├───────────────────────────────────┬────────────────────────────────────┤
│ MicroSD 8 GB (Solo Boot y OS Base)│ SSD 120 GB USB 3.0 (/mnt/ssd)      │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Raspberry Pi OS Lite (64-bit)   │ • Raíz de Docker (/mnt/ssd/docker) │
│ • Kernel Linux Bookworm & Systemd │ • Datos de PostgreSQL (pgdata)     │
│ • Swap de MicroSD: DESACTIVADO    │ • Swap de respaldo (/mnt/ssd/swap) │
│ • Logs en RAM (volátiles)         │ • Código backend, frontend y confs │
│ • Cero escrituras de telemetría   │ • > 100 GB libres para telemetría  │
│ • Vida útil protegida 100%        │ • Alta velocidad de lectura/escrit.│
└───────────────────────────────────┴────────────────────────────────────┘
```

### Gestión de Memoria en 2 Niveles (*Tiered Memory*):
* **Nivel 1 (Prioridad 100) - ZRAM (450 MB comprimidos en RAM):** Funciona a velocidad de bus de memoria y procesador con el algoritmo optimizado para ARM `lzo-rle`. Absorbe ráfagas de paquetes de telemetría sin tocar ningún disco.
* **Nivel 2 (Prioridad 10) - Swap en SSD (1 GB en `/mnt/ssd/swapfile`):** Si la memoria física y ZRAM se completan ante un pico extraordinario, el exceso desborda hacia el SSD sin riesgo de que Linux ejecute el temido *Out-Of-Memory Killer* (OOM).
* **Swap de MicroSD (`dphys-swapfile`):** Se elimina por completo para que la tarjeta de 8 GB nunca sufra desgaste de celdas flash.

---

## 2. Requisitos de Hardware

1. **Raspberry Pi 4 Model B (1 GB RAM)**.
2. **Fuente de alimentación:** USB-C 5.1V / 3A (fuente oficial recomendada).
3. **Tarjeta MicroSD de 8 GB:** Para el sistema operativo.
4. **SSD de 120 GB:** Con adaptador/gabinete USB 3.0 conectado a uno de los **puertos USB azules** de la Pi.
5. **Conexión de red:** Cable Ethernet al router (recomendado) o Wi-Fi.

---

## 3. PASO 1: Flashear la MicroSD de 8 GB y Primer Arranque

1. Conectar la MicroSD de 8 GB a la PC.
2. Abrir **Raspberry Pi Imager** y configurar:
   * **Dispositivo:** *Raspberry Pi 4*.
   * **Sistema Operativo:** *Raspberry Pi OS (other)* $\rightarrow$ **Raspberry Pi OS Lite (64-bit)** (Debian Bookworm, sin entorno gráfico).
   * **Almacenamiento:** Tu tarjeta MicroSD de 8 GB.
3. Hacer clic en **Siguiente** y seleccionar **"Editar ajustes"**:
   * **Hostname:** `SRVIOT01` (o el que prefieras).
   * **Usuario y contraseña:** ej. usuario `iot_admin_srv`, contraseña elegida.
   * **Configurar Wi-Fi:** (si no usas cable Ethernet).
   * **Habilitar SSH:** Seleccionar *Autenticación por contraseña*.
4. Guardar y escribir la MicroSD.
5. Insertar la MicroSD en la Raspberry Pi, conectar cable de red y alimentación. *(El SSD aún puede dejarse desconectado o conectado, no interfiere).*
6. Conectarse por SSH desde la PC (PowerShell o Terminal):
   ```bash
   ssh iot_admin_srv@SRVIOT01.local
   # O por IP: ssh iot_admin_srv@192.168.1.XX
   ```

---

## 4. PASO 2: Optimización de Memoria y Blindaje de la MicroSD

Antes de tocar cualquier disco externo, dejamos el sistema operativo base de la MicroSD blindado para que no consuma memoria innecesaria ni desgaste la tarjeta flash.

### 4.1 Desactivar y eliminar el Swap por defecto de la MicroSD:
```bash
# Detener, deshabilitar y purgar dphys-swapfile
sudo systemctl stop dphys-swapfile
sudo systemctl disable dphys-swapfile
sudo apt purge -y dphys-swapfile
sudo rm -f /var/swap
```

### 4.2 Actualizar paquetes básicos e instalar `zram-tools`:
```bash
sudo apt update && sudo apt install -y zram-tools curl git htop
```

### 4.3 Configurar ZRAM de alta velocidad (Nivel 1 de Swap):
> [!NOTE]
> En Raspberry Pi OS 64-bit (Debian Bookworm), el algoritmo nativo soportado por el kernel ARM64 es **`lzo-rle`** (el algoritmo `zstd` puede fallar si el kernel no lo tiene compilado en el módulo zram).

```bash
# 1. Cargar el módulo zram en el kernel
sudo modprobe zram

# 2. Configurar zramswap con algoritmo lzo-rle al 50% de la RAM (~450 MB)
sudo bash -c 'cat <<EOF > /etc/default/zramswap
ALGO=lzo-rle
PERCENT=50
PRIORITY=100
CORES=4
EOF'

# 3. Liberar cualquier swap previo y reiniciar el servicio
sudo swapoff /dev/zram0 2>/dev/null
sudo systemctl restart zramswap
sudo systemctl enable zramswap
```

### 4.4 Optimizar parámetros del Kernel Linux para baja RAM y ZRAM:
Creamos una regla sysctl personalizada:
```bash
sudo bash -c 'cat <<EOF > /etc/sysctl.d/99-tokioba-memory.conf
# Favorecer la compresión en ZRAM antes de descartar caches
vm.swappiness=100
# Mantener inodos y directorios en caché de memoria
vm.vfs_cache_pressure=50
# Evitar caídas y pausas abruptas del kernel por asignación de páginas
vm.watermark_boost_factor=0
# Escritura en disco en ráfagas pequeñas para no saturar I/O
vm.dirty_background_ratio=5
vm.dirty_ratio=10
EOF'

# Aplicar los parámetros inmediatamente:
sudo sysctl --system
```

### 4.5 Proteger la MicroSD de escrituras continuas de Logs (`systemd-journald`):
Evita que el sistema escriba constantemente registros del sistema en la tarjeta flash:
```bash
sudo sed -i 's/#Storage=auto/Storage=volatile/' /etc/systemd/journald.conf
sudo sed -i 's/#SystemMaxUse=/SystemMaxUse=30M/' /etc/systemd/journald.conf
sudo systemctl restart systemd-journald
```

### 4.6 Verificar estado de memoria y ZRAM:
```bash
free -h
```
*Salida esperada:*
* **Memoria libre:** ~720 MiB disponibles.
* **Swap:** ~450 MiB activos en ZRAM (`/dev/zram0`) con 0 B usados.

---

## 5. PASO 3: Conectar, Formatear y Montar el SSD de 120 GB

### 5.1 Conexión física e identificación:
1. Conectar el SSD de 120 GB al **puerto USB 3.0 azul** de la Raspberry Pi.
2. Identificar el dispositivo con:
   ```bash
   lsblk
   ```
   *Identificarás la MicroSD como `mmcblk0` (~7.4G) y el SSD como **`sda`** (~111G/120G).*

### 5.2 Formatear el SSD en `ext4`:
```bash
# Formatear la partición (ej. /dev/sda1 o /dev/sda si es disco completo)
sudo mkfs.ext4 -F -L TOKIOBA_SSD /dev/sda1
```
*(Si `lsblk` muestra `sda` sin partición `sda1`, puedes usar directamente `/dev/sda`).*

### 5.3 Crear el punto de montaje y configurar el automontaje permanente:
1. Crear el directorio de montaje:
   ```bash
   sudo mkdir -p /mnt/ssd
   ```

2. Obtener el UUID del SSD:
   ```bash
   sudo blkid /dev/sda1
   ```
   *(Copia el valor del UUID, por ejemplo: `UUID="3f8a1c9e-54d2-4b8a-9e11-123456789abc"`).*

3. Editar `/etc/fstab`:
   ```bash
   sudo nano /etc/fstab
   ```
   Agregar al final del archivo la siguiente línea (reemplazando con tu UUID real):
   ```text
   UUID=tu-uuid-aqui  /mnt/ssd  ext4  defaults,noatime,nofail  0  2
   ```
   > [!IMPORTANT]
   > La opción **`nofail`** es indispensable: si por alguna razón el SSD USB tarda en ser reconocido al arrancar, la Raspberry Pi continuará booteando sin colgarse en el modo de emergencia, permitiendo acceso SSH.

4. Montar y asignar permisos:
   ```bash
   sudo mount -a
   sudo chown -R $USER:$USER /mnt/ssd
   df -h /mnt/ssd
   ```
   *Verás `/mnt/ssd` con más de 105 GB de espacio disponible.*

---

## 6. PASO 4: Crear el Swap Secundario en el SSD (Nivel 2 de Memoria)

Con el SSD montado en `/mnt/ssd`, creamos un archivo de Swap de 1 GB que actuará como red de seguridad secundaria:

```bash
# 1. Crear el archivo de 1 GB en el SSD
sudo fallocate -l 1G /mnt/ssd/swapfile
sudo chmod 600 /mnt/ssd/swapfile
sudo mkswap /mnt/ssd/swapfile

# 2. Agregar el Swap del SSD a /etc/fstab con prioridad baja (pri=10)
sudo bash -c 'echo "/mnt/ssd/swapfile none swap sw,pri=10,nofail 0 0" >> /etc/fstab'

# 3. Activar todos los swaps
sudo swapon -a
```

### 6.1 Verificar la jerarquía de Swaps en 2 niveles:
```bash
swapon --show
free -h
```
*Salida esperada:*
```text
NAME               TYPE      SIZE   USED PRIO
/dev/zram0         partition 450M     0B  100
/mnt/ssd/swapfile  file     1024M     0B   10
```
* **Prioridad 100:** ZRAM absorbe el 100% del uso normal en memoria ultrarrápida.
* **Prioridad 10:** El SSD solo entra en acción si se satura ZRAM.
* **MicroSD:** 0% de escrituras de swap.

---

## 7. PASO 5: Instalación de Docker y Mudanza de Raíz al SSD

Para asegurar que las imágenes, capas de contenedores, volúmenes y logs se almacenen en el SSD y no en los 8 GB de la MicroSD:

```bash
# 1. Instalar Docker oficial (64-bit ARM)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 2. Asignar permisos a tu usuario
sudo usermod -aG docker $USER

# 3. Configurar Docker para almacenar todo en /mnt/ssd/docker
sudo mkdir -p /mnt/ssd/docker
sudo bash -c 'cat <<EOF > /etc/docker/daemon.json
{
  "data-root": "/mnt/ssd/docker",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF'

# 4. Reiniciar y habilitar Docker
sudo systemctl daemon-reload
sudo systemctl enable docker
sudo systemctl restart docker

# 5. Aplicar cambios de grupo (cerrar sesión y volver a entrar):
exit
```

Volver a conectarse por SSH:
```bash
ssh iot_admin_srv@SRVIOT01.local
```
Comprobar que Docker apunta al SSD:
```bash
docker info | grep "Docker Root Dir"
# Debe responder exactamente: Docker Root Dir: /mnt/ssd/docker
```

---

## 8. PASO 6: Compilación en PC (Windows) y Transferencia al SSD

> [!CAUTION]
> **NUNCA ejecutes `npm run build` en la Raspberry Pi 4B de 1 GB.**
> El empaquetador de Node.js/Vite genera picos de más de 800 MB de RAM y satura la CPU. Compilamos en Windows en 5 segundos y enviamos los archivos listos por SCP directo al SSD.

### En tu PC de Desarrollo (PowerShell en Windows):
```powershell
# 1. Compilar el frontend localmente
cd d:\TK_DEMO1\tk_solucion1_demo1\frontend
npm run build
# (Esto genera la carpeta optimizada frontend\dist)

# 2. Crear la carpeta del proyecto en el SSD de la Pi
ssh iot_admin_srv@SRVIOT01.local "mkdir -p /mnt/ssd/tokioba-iot"

# 3. Copiar backend, frontend compilado y configuración de Nginx al SSD
cd d:\TK_DEMO1\tk_solucion1_demo1
scp -r backend iot_admin_srv@SRVIOT01.local:/mnt/ssd/tokioba-iot/
scp -r frontend/dist iot_admin_srv@SRVIOT01.local:/mnt/ssd/tokioba-iot/frontend_dist
scp -r frontend/nginx.conf iot_admin_srv@SRVIOT01.local:/mnt/ssd/tokioba-iot/
```

---

## 9. PASO 7: Configuración de `docker-compose.pi.yml` en el SSD

En la Raspberry Pi, crear el archivo de despliegue dentro del directorio en el SSD:

```bash
cd /mnt/ssd/tokioba-iot
nano docker-compose.pi.yml
```

Pegar la siguiente configuración optimizada (con nombres de servicio alineados con `nginx.conf` y límites de memoria estrictos):

```yaml
version: '3.8'

services:
  # Base de Datos PostgreSQL (optimizada para bajo consumo y en SSD)
  db:
    image: postgres:15-alpine
    container_name: telemetry_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: telemetry
    volumes:
      - /mnt/ssd/tokioba-iot/data/postgres:/var/lib/postgresql/data
    command: >
      postgres 
      -c shared_buffers=24MB 
      -c work_mem=4MB 
      -c maintenance_work_mem=16MB 
      -c max_connections=20
      -c checkpoint_completion_target=0.7
    deploy:
      resources:
        limits:
          memory: 100M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Backend FastAPI Tokioba
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: telemetry_api
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/telemetry
      - SECRET_KEY=tokioba_super_secret_pi_key_2026
      - ALGORITHM=HS256
      - ACCESS_TOKEN_EXPIRE_MINUTES=1440
      - TRACCAR_URL=https://demo4.traccar.org
      - TRACCAR_EMAIL=fabianb@tokioba.com
      - TRACCAR_PASSWORD=Radius@1290!
      - TRACCAR_TOKEN=ehbiEoV1hUuCqWIQu0bpWZ:APA91bEoJ55-LLnp_udh3ZXpQXua_GfSup_Ttoh8_Ms_-iQUnOzNpbWgqq4wHFDyPjFYpjlXiksyI704909AB7fCbzOAxnBjH7_ULR9Zw4xo2A_YpATk3dA
      - TRACCAR_SYNC_INTERVAL=5
    ports:
      - "8000:8000"
    depends_on:
      - db
    deploy:
      resources:
        limits:
          memory: 120M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Servidor Web Nginx (Estáticos precompilados + Reverse Proxy)
  web:
    image: nginx:alpine
    container_name: telemetry_web
    restart: unless-stopped
    ports:
      - "3000:80"
    volumes:
      - ./frontend_dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api
    deploy:
      resources:
        limits:
          memory: 30M
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"
```

Guardar con `Ctrl + O`, presionar `Enter` y salir con `Ctrl + X`.

---

## 10. PASO 8: Puesta en Marcha y Verificación

Crear el directorio de persistencia para PostgreSQL y levantar el stack:

```bash
mkdir -p /mnt/ssd/tokioba-iot/data/postgres
cd /mnt/ssd/tokioba-iot
docker compose -f docker-compose.pi.yml up -d --build
```

### 10.1 Verificación de Estado y Consumo de Recursos:
```bash
# 1. Monitoreo en vivo de RAM por contenedor
docker stats --no-stream

# 2. Verificación de almacenamiento
df -h / /mnt/ssd

# 3. Verificación de memoria y swaps
free -h
```

### Resultados esperados en la Raspberry Pi 4B (1 GB):
| Componente | Consumo Real Esperado | Límite Asignado |
| :--- | :--- | :--- |
| **PostgreSQL 15** | ~35 MB RAM | 100 MB |
| **FastAPI Backend** | ~55 MB RAM | 120 MB |
| **Nginx Web** | ~12 MB RAM | 30 MB |
| **Total Stack Tokioba** | **~102 - 115 MB RAM** | **250 MB máx** |
| **RAM Libre en Sistema** | **> 730 MB libres** | Para caché y OS |
| **Swap Usado** | **0 B** | ZRAM intacto |
| **Espacio en SSD** | **> 100 GB libres** | En `/mnt/ssd` |
| **Espacio en MicroSD** | **< 2.5 GB usados** | En `/` (solo OS) |

Acceso desde tu PC en la red local:
* **Web Dashboard:** `http://SRVIOT01.local:3000` (o `http://192.168.1.XX:3000`).
* **Documentación API:** `http://SRVIOT01.local:8000/docs`.

---

## 11. PASO 9: Conexión Externa Gratuita con Playit.gg (Túnel Teltonika TCP + Web)

Para que los equipos GPS en campo (Teltonika FMC920, ATC700) envíen sus tramas TCP y para consultar el Dashboard desde tu teléfono fuera de la red local:

```bash
# 1. Instalar Playit.gg
curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg >/dev/null
echo "deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./" | sudo tee /etc/apt/sources.list.d/playit.list
sudo apt update
sudo apt install -y playit

# 2. Ejecutar Playit por primera vez
playit
```

* Playit te dará un enlace de reclamo. Ábrelo en el navegador de tu PC.
* En el panel de Playit, crea dos túneles:
  1. **Túnel Web (HTTP):**
     * Puerto local: `3000`.
     * Te genera una URL pública SSL (ej. `https://tokioba-demo.playit.gg`).
  2. **Túnel GPS Teltonika (TCP Raw):**
     * Puerto local: `5027` (o el puerto del parser/ingesta).
     * Te genera un **Host y Puerto estático público fijo** (ej. `teltonika-tokioba.playit.gg:34521`).
     * Configuras ese Host y Puerto en el *Teltonika Configurator* de los dispositivos.

* Activar Playit como servicio en segundo plano:
  ```bash
  sudo systemctl enable playit
  sudo systemctl start playit
  ```

---

## 12. Comandos Esenciales de Monitoreo y Mantenimiento

| Acción | Comando en la Raspberry Pi |
| :--- | :--- |
| **Ver estado de los contenedores** | `docker compose -f /mnt/ssd/tokioba-iot/docker-compose.pi.yml ps` |
| **Ver consumo de RAM en tiempo real** | `docker stats` |
| **Ver logs del backend en vivo** | `docker logs -f telemetry_api` |
| **Ver logs de la base de datos** | `docker logs -f telemetry_db` |
| **Reiniciar la plataforma** | `docker compose -f /mnt/ssd/tokioba-iot/docker-compose.pi.yml restart` |
| **Detener la plataforma** | `docker compose -f /mnt/ssd/tokioba-iot/docker-compose.pi.yml down` |
| **Ver temperatura del procesador** | `vcgencmd measure_temp` |
| **Ver estado de los dos Swaps** | `swapon --show` |
| **Ver uso de disco (MicroSD vs SSD)** | `df -h / /mnt/ssd` |
| **Hacer backup rápido de la BDD** | `docker exec telemetry_db pg_dump -U postgres telemetry > /mnt/ssd/backup_$(date +%F).sql` |
