# Guía Definitiva de Despliegue en Raspberry Pi 4B (1 GB RAM, 64-bit)
## Arquitectura Híbrida (MicroSD + SSD USB 3.0) con CI/CD Totalmente Automático desde GitHub

Esta guía detalla la implementación completa para la plataforma telemática **Tokioba IoT** en una **Raspberry Pi 4 Model B (1 GB RAM)** con:
1. **MicroSD de 8 GB:** Exclusiva para el arranque (*boot*) y el sistema operativo base en modo casi de solo lectura.
2. **SSD de 120 GB (USB 3.0):** Montado en `/mnt/ssd` para el Swap de respaldo, el motor Docker (`data-root`), la base de datos PostgreSQL y el repositorio Git.
3. **Despliegue Continuo (CI/CD) 100% Automático:** Desarrollas en **Antigravity** desde cualquier PC o Laptop, haces `git push origin main` a GitHub, y la Raspberry Pi detecta los cambios, compila y se actualiza sola sin que tengas que conectarte por SSH.

---

## 1. Topología del Sistema y Flujo de Desarrollo

```
┌─────────────────────────────────┐
│       Cualquier PC / Laptop     │
│  • Antigravity IDE              │
│  • Desarrollo de funcionalidades│
└───────────────┬─────────────────┘
                │
                │ 1. git push origin main
                ▼
┌─────────────────────────────────┐
│         GitHub (Cloud)          │
│   fbrashich/tk_solucion1_demo1  │
└───────────────┬─────────────────┘
                │
                │ 2. Detección automática (Timer cada 2 min o Webhook)
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      RASPBERRY PI 4B (SRVIOT01)                        │
├───────────────────────────────────┬────────────────────────────────────┤
│ MicroSD 8 GB (Solo Boot y OS Base)│ SSD 120 GB USB 3.0 (/mnt/ssd)      │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Raspberry Pi OS Lite (64-bit)   │ • Repo: /mnt/ssd/tokioba-iot       │
│ • Swap de MicroSD: PURGADO        │ • Docker Root: /mnt/ssd/docker     │
│ • ZRAM: 450 MB comprimidos en RAM │ • PostgreSQL: /mnt/ssd/tokioba-... │
│ • Logs en RAM (volátiles)         │ • Swap Respaldo: 1 GB en SSD       │
│ • Cero escrituras de desgaste     │ • Auto-Deploy: Script deploy.sh    │
└───────────────────────────────────┴────────────────────────────────────┘
                                    │
                                    │ 3. Expuesto a Internet
                                    ▼
       ┌────────────────────────────┴───────────────────────────┐
       │ • Dashboard Web (HTTP): ZROK (public:iot-web-portal)   │
       │ • GPS Teltonika (TCP): practically-doing.tun.ply.gg:60715 │
       └────────────────────────────────────────────────────────┘
```

---

## 2. Requisitos de Hardware

1. **Raspberry Pi 4 Model B (1 GB RAM)**.
2. **Fuente de alimentación:** USB-C 5.1V / 3A (fuente oficial recomendada).
3. **Tarjeta MicroSD de 8 GB:** Para el arranque y sistema base.
4. **SSD de 120 GB con adaptador USB 3.0:** Conectado a uno de los **puertos USB azules** de la Pi.
5. **Conexión de red:** Cable Ethernet o Wi-Fi.

---

## 3. PASO 1: Flashear la MicroSD de 8 GB y Primer Arranque

1. Conectar la MicroSD de 8 GB a la PC.
2. Abrir **Raspberry Pi Imager** y seleccionar:
   * **Dispositivo:** *Raspberry Pi 4*.
   * **Sistema Operativo:** *Raspberry Pi OS (other)* $\rightarrow$ **Raspberry Pi OS Lite (64-bit)** (Debian Bookworm, sin entorno gráfico).
   * **Almacenamiento:** Tu MicroSD de 8 GB.
3. Hacer clic en **Siguiente** y seleccionar **"Editar ajustes"**:
   * **Hostname:** `SRVIOT01` (o el que elijas).
   * **Usuario y contraseña:** ej. usuario `iot_admin_srv`, contraseña segura.
   * **Habilitar SSH:** Seleccionar *Autenticación por contraseña*.
   * **Configurar Wi-Fi:** (si no usas cable de red).
4. Escribir la MicroSD.
5. Colocar la MicroSD en la Raspberry Pi, conectar red y alimentación. *(El SSD puede estar conectado).*
6. Conectarse por SSH desde la PC:
   ```bash
   ssh iot_admin_srv@SRVIOT01.local
   # O por IP: ssh iot_admin_srv@192.168.1.XX
   ```

---

## 4. PASO 2: Optimización de Memoria y Blindaje de la MicroSD

Dejamos el sistema operativo base protegido para que no desgaste la MicroSD y funcione con ZRAM ultrarrápido:

### 4.1 Eliminar el Swap de la MicroSD:
```bash
sudo systemctl stop dphys-swapfile
sudo systemctl disable dphys-swapfile
sudo apt purge -y dphys-swapfile
sudo rm -f /var/swap
```

### 4.2 Actualizar paquetes básicos e instalar herramientas:
```bash
sudo apt update && sudo apt install -y zram-tools curl git htop
```

### 4.3 Configurar ZRAM en RAM (Nivel 1 de Memoria, ~450 MB con `lzo-rle`):
```bash
# Cargar módulo zram
sudo modprobe zram

# Configurar algoritmo nativo lzo-rle para procesadores ARM al 50% de RAM
sudo bash -c 'cat <<EOF > /etc/default/zramswap
ALGO=lzo-rle
PERCENT=50
PRIORITY=100
CORES=4
EOF'

# Reiniciar servicio zram
sudo swapoff /dev/zram0 2>/dev/null
sudo systemctl restart zramswap
sudo systemctl enable zramswap
```

### 4.4 Optimizar parámetros del Kernel Linux (`sysctl`):
```bash
sudo bash -c 'cat <<EOF > /etc/sysctl.d/99-tokioba-memory.conf
vm.swappiness=100
vm.vfs_cache_pressure=50
vm.watermark_boost_factor=0
vm.dirty_background_ratio=5
vm.dirty_ratio=10
EOF'

sudo sysctl --system
```

### 4.5 Proteger la MicroSD de escrituras de Logs continuos:
```bash
sudo sed -i 's/#Storage=auto/Storage=volatile/' /etc/systemd/journald.conf
sudo sed -i 's/#SystemMaxUse=/SystemMaxUse=30M/' /etc/systemd/journald.conf
sudo systemctl restart systemd-journald
```

### 4.6 Verificar estado de memoria:
```bash
free -h
```
*Salida esperada:* ~720 MiB de RAM disponibles y 450 MiB de Swap ZRAM en `/dev/zram0`.

---

## 5. PASO 3: Conectar, Formatear y Montar el SSD de 120 GB

### 5.1 Identificar la unidad:
Conectar el SSD al puerto **USB 3.0 azul** y ejecutar:
```bash
lsblk
```
*(Verás la MicroSD como `mmcblk0` y el SSD como `sda` o `sda1`).*

### 5.2 Formatear en `ext4`:
```bash
sudo mkfs.ext4 -F -L TOKIOBA_SSD /dev/sda1
# (Si no tiene partición sda1 y figura como /dev/sda, usar /dev/sda)
```

### 5.3 Configurar automontaje seguro con `nofail`:
1. Crear el punto de montaje:
   ```bash
   sudo mkdir -p /mnt/ssd
   ```
2. Obtener el UUID del SSD:
   ```bash
   sudo blkid /dev/sda1
   ```
   *(Copia el valor entre comillas: `UUID="xxxx-xxxx-xxxx"`).*
3. Editar `/etc/fstab`:
   ```bash
   sudo nano /etc/fstab
   ```
   Agregar esta línea al final:
   ```text
   UUID=tu-uuid-aqui  /mnt/ssd  ext4  defaults,noatime,nofail  0  2
   ```
   *(La opción `nofail` garantiza que la Pi siempre arranque y permita SSH incluso si el disco USB se retrasa al encender).*
4. Montar y asignar permisos:
   ```bash
   sudo mount -a
   sudo chown -R $USER:$USER /mnt/ssd
   df -h /mnt/ssd
   ```

---

## 6. PASO 4: Crear el Swap Secundario en el SSD (Nivel 2)

Creamos un archivo de 1 GB de desborde en el SSD con prioridad baja (`pri=10`):

```bash
# 1. Crear el archivo en el SSD
sudo fallocate -l 1G /mnt/ssd/swapfile
sudo chmod 600 /mnt/ssd/swapfile
sudo mkswap /mnt/ssd/swapfile

# 2. Agregar a /etc/fstab con prioridad 10
sudo bash -c 'echo "/mnt/ssd/swapfile none swap sw,pri=10,nofail 0 0" >> /etc/fstab'

# 3. Activar y verificar
sudo swapon -a
swapon --show
free -h
```
*Resultado:*
* `/dev/zram0` (prioridad 100): Se usa primero a máxima velocidad de procesador.
* `/mnt/ssd/swapfile` (prioridad 10): Entra solo en picos extremos.

---

## 7. PASO 5: Instalar Docker y Mudar su Raíz al SSD

Para que ninguna imagen ni capa ocupe espacio en la MicroSD:

```bash
# 1. Instalar Docker oficial
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 2. Configurar la raíz de Docker en el SSD
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

# 3. Reiniciar Docker y salir para aplicar permisos de grupo
sudo systemctl daemon-reload
sudo systemctl restart docker
exit
```

Reconéctate por SSH (`ssh iot_admin_srv@SRVIOT01.local`) y valida:
```bash
docker info | grep "Docker Root Dir"
# Debe responder: Docker Root Dir: /mnt/ssd/docker
```

---

## 8. PASO 6: Clonar el Repositorio de GitHub en el SSD

Ahora que el SSD y Docker están listos, clonamos el proyecto directamente desde GitHub:

```bash
cd /mnt/ssd
git clone https://github.com/fbrashich/tk_solucion1_demo1.git tokioba-iot
cd /mnt/ssd/tokioba-iot
```

---

## 9. PASO 7: Configuración de `docker-compose.pi.yml`

Verificamos que el archivo `docker-compose.pi.yml` esté presente dentro de `/mnt/ssd/tokioba-iot/`. Si necesitas crearlo o ajustarlo, esta es la configuración definitiva optimizada para compilación autónoma y bajo consumo de RAM:

```yaml
services:
  # Base de Datos PostgreSQL (en SSD)
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

  # Servidor Web Nginx (Compila frontend automáticamente dentro de Docker)
  web:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: telemetry_web
    restart: unless-stopped
    ports:
      - "3000:80"
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

  # Túnel Público Seguro para el Dashboard Web (ZROK)
  zrok:
    image: openziti/zrok2:latest
    container_name: telemetry_zrok
    restart: unless-stopped
    stop_signal: SIGINT
    stop_grace_period: 20s
    depends_on:
      - web
    volumes:
      - ${HOME}/.zrok2:/home/ziggy/.zrok2
    command: share public http://web:80 -n public:iot-web-portal --headless
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

---

## 10. PASO 8: Primer Despliegue de la Plataforma

Creamos la carpeta para los datos de la base de datos y compilamos los servicios por separado para no saturar la memoria RAM:

```bash
mkdir -p /mnt/ssd/tokioba-iot/data/postgres
cd /mnt/ssd/tokioba-iot

# 1. Compilar primero el backend solo
docker compose -f docker-compose.pi.yml build api

# 2. Compilar el frontend solo
docker compose -f docker-compose.pi.yml build web

# 3. Levantar todo el stack (como ya están compilados, levanta en 3 segundos)
docker compose -f docker-compose.pi.yml up -d
```

*(Al compilar primero el backend y luego el frontend por separado, evitamos que Docker compile ambos al mismo tiempo y sature los 1 GB de RAM. El frontend tardará ~2-3 minutos en su etapa multi-stage).*

### Verificación de consumo de RAM:
```bash
docker stats --no-stream
free -h
```
* **Consumo de memoria total del stack:** **~105 MB de RAM**.
* **RAM libre para el sistema:** **> 730 MB**.
* **Acceso local:** Abre en tu navegador `http://SRVIOT01.local:3000`.

---

## 11. PASO 9: Automatización Total del Despliegue (CI/CD Automático)

Para que cualquier cambio que hagas desde tu PC (o cualquier laptop) se refleje en la Raspberry Pi sin tener que hacer nada manualmente, configuramos el **Auto-Deploy Inteligente**.

### 11.1 Crear el Script de Despliegue Inteligente (`deploy.sh`):
Este script compara el commit local de la Pi con el de GitHub. Si no hay cambios nuevos, termina en 1 segundo sin gastar CPU. Si detecta un commit nuevo, actualiza el código y recrea los contenedores:

```bash
cat << 'EOF' > /mnt/ssd/tokioba-iot/deploy.sh
#!/bin/bash
set -e
REPO_DIR="/mnt/ssd/tokioba-iot"
cd "$REPO_DIR"

# Traer información de GitHub silenciosamente
git fetch origin main >/dev/null 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "🚀 [$(date '+%Y-%m-%d %H:%M:%S')] Nuevos cambios detectados en GitHub ($LOCAL -> $REMOTE). Iniciando deploy..."
    
    # 1. Traer los cambios limpios
    git reset --hard origin/main
    
    # 2. Reconstruir secuencialmente (api primero, luego web) para proteger la RAM
    docker compose -f docker-compose.pi.yml build api
    docker compose -f docker-compose.pi.yml build web
    docker compose -f docker-compose.pi.yml up -d
    
    # 3. Limpiar imágenes viejas de Docker para no acumular espacio
    docker image prune -f >/dev/null 2>&1
    
    echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] Tokioba actualizado exitosamente."
else
    # Sin cambios nuevos
    exit 0
fi
EOF

chmod +x /mnt/ssd/tokioba-iot/deploy.sh
```

---

### 11.2 Activar el Auto-Deploy Desatendido (Systemd Timer cada 2 minutos):
Este es el mecanismo más confiable del mundo: la Raspberry Pi revisa silenciosamente GitHub cada 2 minutos. Si hiciste `git push`, se despliega sola. Si no hiciste push, el chequeo toma 0.2 segundos y consume 0 MB de memoria.

1. **Crear el servicio de Systemd:**
   ```bash
   sudo bash -c 'cat <<EOF > /etc/systemd/system/tokioba-autodeploy.service
   [Unit]
   Description=Tokioba IoT Auto-Deploy Checker
   After=network-online.target docker.service
   Wants=network-online.target

   [Service]
   Type=oneshot
   User=iot_admin_srv
   WorkingDirectory=/mnt/ssd/tokioba-iot
   ExecStart=/mnt/ssd/tokioba-iot/deploy.sh
   StandardOutput=journal
   StandardError=journal
   EOF'
   ```

2. **Crear el temporizador (Timer) de 2 minutos:**
   ```bash
   sudo bash -c 'cat <<EOF > /etc/systemd/system/tokioba-autodeploy.timer
   [Unit]
   Description=Chequear actualizaciones en GitHub cada 2 minutos

   [Timer]
   OnBootSec=1min
   OnUnitActiveSec=2min
   Persistent=true

   [Install]
   WantedBy=timers.target
   EOF'
   ```

3. **Habilitar y arrancar el Timer:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now tokioba-autodeploy.timer
   ```

4. **Verificar que el Timer esté corriendo:**
   ```bash
   systemctl list-timers tokioba-autodeploy.timer
   ```
   *(Verás cuándo fue la última verificación y cuándo es la próxima).*

---

### 11.3 (Opcional) Método de Webhook Instantáneo de GitHub:
Si deseas que el deploy ocurra **al segundo exacto del push** en vez de esperar hasta 2 minutos:
1. Instalar el micro-servicio oficial `webhook` de Debian (escrito en Go, consume solo 3 MB de RAM):
   ```bash
   sudo apt install -y webhook
   ```
2. Configurar una regla en `/etc/webhook.conf` que apunte a `/mnt/ssd/tokioba-iot/deploy.sh`.
3. En la configuración de tu repositorio en GitHub $\rightarrow$ **Settings** $\rightarrow$ **Webhooks**, añades la URL de tu túnel Playit.

---

## 12. PASO 10: Flujo de Trabajo Diario desde Cualquier PC

Ahora tu flujo de trabajo como desarrollador es 100% libre:

1. **En cualquier PC o Laptop:**
   * Abres el proyecto en **Antigravity**.
   * Trabajas en tus mejoras, corriges bugs o agregas componentes.
2. **Subes tus cambios:**
   ```bash
   git commit -am "feat: agregada telemetría de combustible y alertas de motor"
   git push origin main
   ```
3. **¡Listo!**
   * No necesitas abrir SSH.
   * No necesitas copiar archivos con SCP.
   * La Raspberry Pi detecta el commit automáticamente, compila la nueva versión y la publica en vivo.

---

## 13. PASO 11: Exposición Externa Híbrida: Teltonika GPS (TCP Playit) + Web Dashboard (HTTP ZROK)

Para exponer la plataforma al mundo sin abrir puertos en el router hogareño/oficina, implementamos una solución híbrida especializada:
1. **Tráfico TCP (Rastreadores GPS Teltonika):** Vía **Playit.gg**, que soporta conexiones brutas de Capa 4 requeridas por el firmware de los dispositivos.
2. **Tráfico HTTP (Dashboard Web):** Vía **ZROK**, recuperando exactamente la misma configuración y dominio persistente que ya funcionaba en el Docker de la PC.

---

### 13.1 Solución TCP para Rastreadores GPS Teltonika (Playit.gg)

Configuramos el agente de Playit en la Raspberry Pi con los parámetros exactos asignados y validados:

* **Túnel:** `iot-tokioba`
* **Dominio asignado:** `practically-doing.tun.ply.gg`
* **IP Pública de entrada:** `147.185.221.216`
* **Puerto Público Externo:** **`60715`** *(asignado por Playit)*
* **Destino Local en la Pi:** `127.0.0.1:5027`
* **Proxy Protocol:** `None`

#### Pasos en la Raspberry Pi:
1. **Instalar Playit.gg:**
   ```bash
   curl -SsL https://playit-cloud.github.io/ppa/key.gpg | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/playit.gpg >/dev/null
   echo "deb [signed-by=/etc/apt/trusted.gpg.d/playit.gpg] https://playit-cloud.github.io/ppa/data ./" | sudo tee /etc/apt/sources.list.d/playit.list
   sudo apt update
   sudo apt install -y playit
   ```

2. **Requisito Crítico: Sincronización Horaria NTP (Imprescindible en Raspberry Pi):**
   > [!IMPORTANT]
   > La Raspberry Pi no tiene pila de reloj (RTC). Si la hora se desfasa por más de 10 segundos, los servidores de Playit rechazan la autenticación con error `RegisterUnauthorized`. Configura la zona horaria y activa la sincronización por red:
   ```bash
   sudo timedatectl set-timezone America/Argentina/Buenos_Aires
   sudo timedatectl set-ntp true
   sudo systemctl restart systemd-timesyncd
   timedatectl
   ```

3. **Habilitar Playit como servicio del sistema en segundo plano:**
   ```bash
   sudo systemctl enable --now playit
   sudo systemctl status playit
   ```

4. **Configuración en los Rastreadores Teltonika (Teltonika Configurator / SMS):**
   * **Target Server Domain:** `practically-doing.tun.ply.gg` *(o IP `147.185.221.216`)*
   * **Target Server Port:** **`60715`**
   * **Protocol:** `TCP`

5. **Validar la Conexión TCP desde tu PC (PowerShell):**
   Para comprobar que el túnel está respondiendo y reenviando al puerto 5027 de la Pi:
   ```powershell
   Test-NetConnection -ComputerName practically-doing.tun.ply.gg -Port 60715
   ```
   *(Retorna `TcpTestSucceeded : True` confirmando enlace activo).*

---

### 13.2 Solución HTTP para el Web Dashboard (ZROK en Docker)

Recuperamos la configuración de **ZROK** probada en la PC (`openziti/zrok2:latest`), logrando una URL pública con SSL automático y reservada bajo el alias `public:iot-web-portal`.

#### 1. Transferir las credenciales de ZROK desde tu PC a la Raspberry Pi:
Para que la Raspberry Pi no tenga que registrar una cuenta nueva ni pierda el nombre reservado, copiamos la identidad existente de tu PC:

* **Desde tu PC con Windows (abrir PowerShell):**
  ```powershell
  # Copiar la carpeta .zrok2 de tu usuario de Windows al home de la Raspberry Pi:
  scp -r $env:USERPROFILE\.zrok2 iot_admin_srv@SRVIOT01.local:~/.zrok2
  ```

#### 2. Verificar el servicio ZROK en `docker-compose.pi.yml`:
El servicio ya está añadido al Compose y mapea automáticamente tu identidad desde `${HOME}/.zrok2`:
```yaml
  zrok:
    image: openziti/zrok2:latest
    container_name: telemetry_zrok
    restart: unless-stopped
    stop_signal: SIGINT
    stop_grace_period: 20s
    depends_on:
      - web
    volumes:
      - ${HOME}/.zrok2:/home/ziggy/.zrok2
    command: share public http://web:80 -n public:iot-web-portal --headless
    deploy:
      resources:
        limits:
          memory: 30M
```

#### 3. Levantar el túnel ZROK en la Raspberry Pi:
```bash
cd /mnt/ssd/tokioba-iot
docker compose -f docker-compose.pi.yml up -d zrok
```

#### 4. Validar el enlace en vivo:
```bash
docker logs -f telemetry_zrok
```
*Verás la confirmación de la sesión compartida con tu URL pública activa (ej. `https://iot-web-portal.shares.zrok.io`), lista para ser accedida desde cualquier navegador o teléfono móvil sin restricciones de red.*

#### 5. Gestión y Solución de Problemas: Cambiar o Crear un Nuevo Share en ZROK

##### ¿Por qué puede aparecer el error `unable to create share` o `the zrok service is busy, retry shortly`?
1. **Conflicto con el entorno de Windows o nombre ocupado:** Al transferir la identidad `.zrok2` desde la PC, el servidor de Zrok puede detectar que el alias (o la identidad de ese entorno) todavía figura en uso por una sesión previa o superó el límite de peticiones simultáneas.
2. **Nombre no reservado en el namespace (Zrok v2):** En Zrok v2, cualquier nombre especificado con `-n public:<alias>` debe existir previamente registrado en tu cuenta (`zrok create name -n public <alias>`). Si no fue creado, devolverá `name '<alias>' not found in namespace 'public'`.
3. **Bucle de reintentos (Rate Limit HTTP 429):** Como el contenedor `telemetry_zrok` tiene `restart: unless-stopped`, si falla al iniciar intentará reconectarse inmediatamente una y otra vez. Eso satura la API de Zrok, provocando un bloqueo temporal por ráfagas (`the zrok service is busy, retry shortly`).

##### Procedimiento paso a paso para cambiar o recrear un share limpio:

1. **Frenar el contenedor `telemetry_zrok` para cortar el bucle:**
   ```bash
   docker compose -f docker-compose.pi.yml stop zrok
   ```
   *Verificación:* Al ejecutar `docker ps`, ya no debe figurar `telemetry_zrok` activo.

2. **Liberar y registrar el nuevo nombre:**
   > [!IMPORTANT]
   > Si aún tienes corriendo un contenedor de Zrok en Docker Desktop en tu PC de Windows, apágalo primero para que ambas máquinas no compitan por el mismo túnel.

   ```bash
   # 1. Ver qué nombres tienes creados en la cuenta y si tienen un share activo asociado:
   docker compose -f docker-compose.pi.yml run --rm zrok list names

   # 2. Si el nombre quedó tomado o deseas recrearlo limpio:
   docker compose -f docker-compose.pi.yml run --rm zrok delete name -n public iot-web-portal
   docker compose -f docker-compose.pi.yml run --rm zrok create name -n public iot-web-portal
   ```
   *Verificación:* La terminal devolverá `deleted name 'iot-web-portal'` y luego `created name 'iot-web-portal' in namespace 'public'`.

3. **Esperar 60 segundos y volver a levantar el servicio:**
   Espera 1 minuto de reloj para que expire cualquier bloqueo temporal (*service is busy*) en los servidores de Zrok y levanta el contenedor:
   ```bash
   docker compose -f docker-compose.pi.yml up -d zrok
   docker logs -f telemetry_zrok
   ```
   *Verificación:* El log confirmará la sesión compartida:
   `access your zrok share at the following endpoints: iot-web-portal.shares.zrok.io`

#### 6. Blindaje Permanente contra Reinicios del Sistema y Cortes de Energía

##### ¿Por qué fallaba Zrok al reiniciar la Raspberry Pi?
1. **La causa técnica:** Por defecto, al ejecutar `sudo reboot` o apagarse el equipo, Docker envía una señal `SIGTERM` y apaga los contenedores en paralelo en pocos segundos.
2. **El problema de señal en Zrok:** Las aplicaciones desarrolladas en Go (como Zrok 2) escuchan específicamente la señal **`SIGINT`** (el equivalente a presionar `Ctrl + C` en la terminal) para ejecutar su rutina de cierre limpio (*unshare hook*), contactar a `api.zrok.io` y liberar el nombre reservado.
3. **El conflicto resultante:** Al apagarse abruptamente con `SIGTERM` o cortarse la red antes de notificar a la nube, el servidor central de Zrok retenía el share anterior como "en uso". Al reiniciar la Pi, Docker intentaba crear un share nuevo con el mismo nombre y era rechazado con el error:  
   `[ERROR]: unable to create share (name 'iot-web-portal' in namespace 'public' is in use by share '...'; run 'zrok2 delete share ...' to release it)`.

##### La Solución Aplicada en `docker-compose.pi.yml`:
Se añadieron dos directivas clave al servicio `zrok`:
```yaml
  zrok:
    image: openziti/zrok2:latest
    container_name: telemetry_zrok
    restart: unless-stopped
    stop_signal: SIGINT         # 1. Envía SIGINT (Ctrl+C) para disparar el hook de cierre limpio de Zrok
    stop_grace_period: 20s      # 2. Otorga 20 segundos para que Zrok complete la desconexión HTTP con api.zrok.io
    ...
```

##### Beneficios del Blindaje:
* **Reinicios 100% Desatendidos:** Puedes ejecutar `sudo reboot`, reiniciar por actualización del kernel o sufrir un reinicio imprevisto, y el túnel Zrok volverá a estar en línea automáticamente sin intervención manual ni errores de nombres retenidos.
* **Cero Rate-Limit:** Al cerrar de forma limpia, el contenedor no entra en bucle de reintentos infinitos, evitando bloqueos por *service is busy*.
* **Persistencia Total:** Tu URL fija `https://iot-web-portal.shares.zrok.io` siempre estará lista para recibir tráfico.

---

## 14. Comandos Esenciales de Monitoreo y Mantenimiento

| Acción | Comando en la Raspberry Pi |
| :--- | :--- |
| **Ver logs del Auto-Deploy automático** | `journalctl -u tokioba-autodeploy.service -e -f` |
| **Ver cuándo correrá el próximo chequeo** | `systemctl list-timers tokioba-autodeploy.timer` |
| **Forzar despliegue manual inmediato** | `/mnt/ssd/tokioba-iot/deploy.sh` |
| **Ver estado de los contenedores Docker** | `docker compose -f /mnt/ssd/tokioba-iot/docker-compose.pi.yml ps` |
| **Ver consumo de RAM en tiempo real** | `docker stats` |
| **Ver logs del backend en vivo** | `docker logs -f telemetry_api` |
| **Ver temperatura del procesador** | `vcgencmd measure_temp` |
| **Ver estado de la memoria y swaps** | `free -h && swapon --show` |
| **Hacer backup de la base de datos** | `docker exec telemetry_db pg_dump -U postgres telemetry > /mnt/ssd/backup_$(date +%F).sql` | 
