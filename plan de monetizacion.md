# Plan de Monetización y Modelos de Negocio
## Plataforma IoT Tokioba (Benchmarking Argentina vs. Exterior)

Este documento detalla las estrategias comerciales, esquemas de licenciamiento, precios de referencia de la competencia en el mercado local e internacional, estructura de costos operativos (*unit economics*) y la propuesta de paquetización para monetizar de forma rentable la plataforma telemática de **Tokioba**.

---

## 1. Benchmarking de la Competencia

### A. Mercado Argentino (Precios Locales)

| Proveedor / Segmento | Modelo de Negocio | Costo de Hardware | Abono Mensual Estimado | Qué Incluye |
| :--- | :--- | :--- | :--- | :--- |
| **Ituran / Strix by LoJack** *(Grandes Masivos)* | Comodato o Venta + Abono | $0 – $50.000 ARS (Instalación) | **$12.000 – $22.000 ARS / mes** (~$10 – $18 USD) | SIM M2M, rastreo básico, recupero vehicular ante robo. |
| **Pointer / PowerFleet** *(Flota Pesada)* | Contrato corporativo | $80 – $150 USD | **$28.000 – $48.000 ARS / mes** (~$22 – $38 USD) | Telemetría avanzada, CAN bus, sensores de temperatura/combustible. |
| **Integradores Pyme Locales** *(Usan Wialon/RedGPS)* | Venta de GPS + Abono SaaS | $80 – $120 USD + $40 USD inst. | **$15 – $25 USD / mes** ($18.000 – $30.000 ARS) | Equipo Teltonika/Queclink, chip M2M multicarrier y soporte técnico. |

### B. Mercado Internacional (EE.UU., Europa y Global)

| Proveedor | Modelo de Monetización | Esquema de Cobro | Precios de Referencia |
| :--- | :--- | :--- | :--- |
| **Samsara / Motive** *(Líderes IoT Flotas)* | HaaS (Hardware as a Service) | Contratos cerrados de 24 a 36 meses | **$30 – $55 USD / vehículo / mes** (Hardware financiado dentro de la cuota). |
| **Wialon (Gurtam)** *(Estándar B2B Integradores)* | Cobro por objeto conectado | Mensual por dispositivo activo | Costo para el revendedor: **$0.80 – $1.50 USD / mes** (el revendedor cobra $15-$25 USD al cliente). |
| **GPSWOX** *(White-Label)* | Suscripción Cloud o Licencia On-Premise | Cuota por paquetes de vehículos o pago único | Cloud: **$20 a $99 USD/mes** por 10-50 autos.<br>Servidor propio: **$1.000 – $3.500 USD** (un solo pago) + soporte anual. |

---

## 2. Los 3 Esquemas de Licenciamiento y Venta

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MODELOS DE MONETIZACIÓN                         │
├──────────────────────────┬───────────────────────┬─────────────────────┤
│ 1. Venta + Abono Mensual │ 2. Comodato / HaaS    │ 3. Software Puro    │
│    (Recomendado Maquin.) │    (Sin costo inicial)│    (BYOD / SaaS)    │
├──────────────────────────┼───────────────────────┼─────────────────────┤
│ • GPS: $80 - $130 USD    │ • GPS: $0 USD         │ • GPS: del cliente  │
│ • Instalación: $30 - $50 │ • Instalación: $0-30  │ • SIM: del cliente  │
│ • Abono: $18 - $30 USD/m │ • Abono: $32 - $42 USD│ • Abono: $8 - $15   │
│ • Permanencia: 6-12 m    │ • Contrato: 24-36 m   │ • Sin permanencia   │
└──────────────────────────┴───────────────────────┴─────────────────────┘
```

### Modelo 1: Venta de Hardware + Abono Mensual Recurrente *(Principal Recomendado)*
* **Estructura:**
  * El cliente adquiere el rastreador Teltonika (queda de su propiedad patrimonial).
  * Se cobra un pago inicial por el equipo y la instalación técnica.
  * Se cobra un abono mensual recurrente por cada activo conectado.
* **Ventajas para Tokioba:**
  * Recuperación inmediata del costo del hardware.
  * Cero riesgo financiero por impago o extravío de equipos.
  * Flujo de caja inicial positivo desde el día 1.

### Modelo 2: Comodato / HaaS (Hardware as a Service)
* **Estructura:**
  * Diseñado para cuentas medianas/grandes (obras o flotas de 10 o más máquinas).
  * El cliente no paga el equipo por adelantado (*CAPEX cero*), lo que elimina la barrera de entrada comercial.
  * Se firma un contrato con permanencia mínima de 24 meses a un abono mensual superior que amortiza el hardware.
* **Ventajas:**
  * Mayor facilidad de cierre comercial para contratos corporativos.
  * Fidelización y retención de clientes por 2 o 3 años.

### Modelo 3: Licenciamiento de Software Puro (BYOD - Bring Your Own Device)
* **Estructura:**
  * Pensado para clientes que ya poseen rastreadores GPS instalados (Teltonika, Queclink, etc.) pero están disconformes con su proveedor de software actual.
  * Se les cobra únicamente por el acceso a la plataforma y almacenamiento de datos: **$8 a $15 USD / mes por equipo**.
* **Ventajas:**
  * Venta 100% digital, sin costos de logística ni instalaciones físicas.

---

## 3. Costos Operativos Reales vs. Margen Bruto (*Unit Economics*)

Al ser Tokioba la dueña exclusiva de su propia plataforma (sin intermediarios como Wialon o GPSWOX que descuenten entre $1 y $3 USD por dispositivo), el margen operativo es sumamente elevado:

| Rubro | Costo Real Unitario Mensual | Notas |
| :--- | :--- | :--- |
| **Chip SIM M2M (Datos Celulares)** | ~$1.20 – $2.20 USD | Planes de 20MB a 50MB con roaming nacional (Claro/Movistar/Telecom). |
| **Infraestructura Cloud (Servidor + DB)** | ~$0.15 – $0.35 USD | Servidor FastAPI + PostgreSQL en Docker (costo diluido por volumen). |
| **API WhatsApp / Telegram (Alertas)** | ~$0.05 – $0.20 USD | Paquetes de mensajes por eventos críticos disparados. |
| **Costo Total por Activo:** | **~$1.40 a $2.75 USD / mes** | **Costo directo mensual por máquina conectada.** |

### Margen Comercial:
* **Precio de Venta Sugerido (Plan Industrial):** **$25.00 USD / mes** ($30.000 ARS).
* **Costo Directo:** **$2.50 USD / mes**.
* **Margen Bruto Recurrente (MRR):** **~$22.50 USD / mes por máquina (90% de margen).**

> [!TIP]
> Una cartera inicial de **100 máquinas conectadas** genera aproximadamente **$2.250 USD netos mensuales de ingreso recurrente (MRR)** con un costo de mantenimiento casi nulo.

---

## 4. Paquetes y Planes Comerciales Sugeridos

Para evitar competir por precio contra sistemas de remiserías y maximizar el valor percibido, se estructuran 3 niveles de servicio:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PLANES COMERCIALES TOKIOBA                      │
├──────────────────────────┬────────────────────────┬────────────────────┤
│ PLAN BASE                │ PLAN INDUSTRIAL        │ PLAN PRO FLOTA     │
│ $15 USD / mes            │ $25 USD / mes          │ $32 USD / mes      │
├──────────────────────────┼────────────────────────┼────────────────────┤
│ • Rastreo en vivo (mapa) │ • Todo lo del Plan Base│ • Todo lo anterior │
│ • Historial 30 días      │ • Horómetro calibrado  │ • Alertas WhatsApp │
│ • Velocidad y paradas    │ • Batería Teltonika    │ • Mantenimiento    │
│ • Estado de encendido    │ • Detección de ralentí │ • Reportes PDF     │
│ • Alertas en plataforma  │ • Historial 90 días    │ • Geocercas Obra   │
│                          │ • Soporte multicuenta  │ • Soporte priorit. │
└──────────────────────────┴────────────────────────┴────────────────────┘
```

### 1. Plan Base: "Rastreo & Control" (~$15 USD / mes | ~$18.000 ARS)
* **Público objetivo:** Camionetas de supervisión, utilitarios de apoyo, trailers y vehículos auxiliares.
* **Funcionalidades:**
  * Ubicación en tiempo real en mapa interactivo.
  * Historial de trayectorias (últimos 30 días).
  * Reportes de velocidad y tiempos de viaje.
  * Encendido / apagado de motor.

### 2. Plan Industrial: "Gestión de Maquinaria" (~$25 USD / mes | ~$30.000 ARS) *(Plan Estrella)*
* **Público objetivo:** Excavadoras, retroexcavadoras, mesas vibratorias, generadores, compresores y maquinaria de obra.
* **Funcionalidades:**
  * Todo lo del Plan Base.
  * **Horómetro telemático calibrado** con el tablero analógico de la máquina.
  * Telemetría de batería interna y externa del Teltonika (`io113` y voltaje real).
  * **Diferenciación de horas de trabajo efectivo vs. horas en ralentí**.
  * Alertas nocturnas de encendido no autorizado (anti-robo).
  * Historial extendido a 90 días.

### 3. Plan Pro Flota: "Mantenimiento & WhatsApp" (~$32 USD / mes | ~$38.000 ARS)
* **Público objetivo:** Empresas de alquiler de maquinaria (*rentals*), constructoras medianas y grandes obradores.
* **Funcionalidades:**
  * Todo lo del Plan Industrial.
  * **Notificaciones directas e instantáneas a WhatsApp y Telegram** del capataz o dueño.
  * **Módulo de Mantenimiento Preventivo:** Alertas anticipadas de service por horas de motor (*"Faltan 10 horas para cambio de filtros"*).
  * **Geocercas de Obra:** Corrales virtuales con reporte automático de permanencia y fuga.
  * **Reporte Ejecutivo Semanal en PDF** enviado automáticamente los lunes a primera hora.

---

## 5. Estrategia de Venta y Cierre Comercial (Go-To-Market)

1. **El Gancho del Retorno de Inversión (ROI):**
   * No vender "un puntito en el mapa", sino **ahorro directo de combustible y mantenimiento**.
   * *Argumento comercial:* *"Si una máquina regula en ralentí 1 hora menos por día gracias al control de la plataforma, el cliente se ahorra 5 a 8 litros de gasoil diarios (~$6.000 a $10.000 ARS/día). El servicio se paga solo en los primeros 3 días del mes."*
2. **Prueba Piloto Gratuita (Free Trial de 14 días):**
   * Instalar 1 o 2 equipos Teltonika en las máquinas principales del cliente durante 2 semanas.
   * Mostrarle al final de la prueba el reporte de horas trabajadas y velocidades máximas. La tasa de conversión tras ver sus propios datos en vivo supera el 80%.
3. **Contratos Anuales con Descuento:**
   * Cobro anual adelantado (10 meses en lugar de 12 meses): otorga liquidez inmediata a Tokioba y asegura permanencia del cliente.
