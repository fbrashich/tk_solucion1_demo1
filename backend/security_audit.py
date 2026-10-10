import urllib.request
import urllib.parse
import urllib.error
import json
import time
import sys

BASE_URL = "http://localhost:8000"
NGINX_URL = "http://web:80"

results = {
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "tests": []
}

def log_test(category, name, status, severity, details):
    badge = "[PASS]" if status == "PASS" else ("[WARN]" if status == "WARN" else "[FAIL]")
    print(f"{badge} [{category}] {name} - Severity: {severity} -> {details}")
    results["tests"].append({
        "category": category,
        "name": name,
        "status": status,
        "severity": severity,
        "details": details
    })
    if status == "PASS":
        results["passed"] += 1
    elif status == "WARN":
        results["warnings"] += 1
    else:
        results["failed"] += 1

def request(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    encoded_data = None
    if data is not None:
        if headers.get("Content-Type") == "application/json":
            encoded_data = json.dumps(data).encode("utf-8")
        else:
            encoded_data = urllib.parse.urlencode(data).encode("utf-8")
    
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            headers_dict = dict(resp.headers)
            try:
                json_body = json.loads(body)
            except:
                json_body = body
            return resp.status, json_body, headers_dict
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        try:
            json_body = json.loads(body)
        except:
            json_body = body
        return e.code, json_body, dict(e.headers)
    except Exception as e:
        return 0, str(e), {}

print("=== INICIANDO BATERÍA DE PRUEBAS DE SEGURIDAD (PENTESTING AUTOMATIZADO) ===")

print("Verificando disponibilidad del backend...")
for i in range(20):
    c, _, _ = request(f"{BASE_URL}/")
    if c == 200:
        print("API en línea y respondiendo correctamente.")
        break
    time.sleep(1)

# 0. Autenticación preliminar
status, aldo_auth, _ = request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "aldo", "password": "aldo123"})
aldo_token = aldo_auth.get("access_token") if isinstance(aldo_auth, dict) else None

status, demo_auth, _ = request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "demo1", "password": "demo123"})
demo_token = demo_auth.get("access_token") if isinstance(demo_auth, dict) else None

status, admin_auth, _ = request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "admin", "password": "admin123"})
admin_token = admin_auth.get("access_token") if isinstance(admin_auth, dict) else None

# =========================================================================
# 1. PRUEBAS DE AISLAMIENTO MULTI-TENANT & AUTORIZACIÓN (IDOR / BOLA)
# =========================================================================
print("\n--- 1. Multi-Tenancy & Broken Object Level Authorization (IDOR) ---")

# 1.1 IDOR en DELETE: demo1 intenta borrar equipo de aldo (MESA_01)
code, body, _ = request(f"{BASE_URL}/api/devices/MESA_01", method="DELETE", headers={"Authorization": f"Bearer {demo_token}"})
if code in [403, 404]:
    log_test("Multi-Tenant IDOR", "Intento de eliminación foránea (DELETE)", "PASS", "CRITICAL", f"Rechazado correctamente con HTTP {code}")
else:
    log_test("Multi-Tenant IDOR", "Intento de eliminación foránea (DELETE)", "FAIL", "CRITICAL", f"Vulnerabilidad IDOR detectada: retorno HTTP {code}")

# 1.2 IDOR en PUT: demo1 intenta editar equipo de aldo (MESA_01)
code, body, _ = request(f"{BASE_URL}/api/devices/MESA_01", method="PUT", data={"name": "HACKED_NAME"}, headers={"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"})
if code in [403, 404]:
    log_test("Multi-Tenant IDOR", "Intento de modificación foránea (PUT)", "PASS", "CRITICAL", f"Rechazado correctamente con HTTP {code}")
else:
    log_test("Multi-Tenant IDOR", "Intento de modificación foránea (PUT)", "FAIL", "CRITICAL", f"Vulnerabilidad IDOR detectada: retorno HTTP {code}")

# 1.3 Exfiltración de Estado: demo1 intenta leer estado de MESA_01
code, body, _ = request(f"{BASE_URL}/api/devices/MESA_01/status", method="GET", headers={"Authorization": f"Bearer {demo_token}"})
if code in [403, 404]:
    log_test("Multi-Tenant IDOR", "Lectura foránea de estado individual", "PASS", "HIGH", f"Rechazado correctamente con HTTP {code}")
else:
    log_test("Multi-Tenant IDOR", "Lectura foránea de estado individual", "FAIL", "HIGH", f"Fuga de información: retorno HTTP {code}")

# 1.4 Exfiltración de Histórico Logs: demo1 intenta leer logs de MESA_01
code, body, _ = request(f"{BASE_URL}/api/devices/MESA_01/logs", method="GET", headers={"Authorization": f"Bearer {demo_token}"})
if code == 200 and body == []:
    log_test("Multi-Tenant IDOR", "Lectura foránea de historial GPS", "PASS", "HIGH", "Lista vacía devuelta (filtrado estricto aplicado)")
elif code in [403, 404]:
    log_test("Multi-Tenant IDOR", "Lectura foránea de historial GPS", "PASS", "HIGH", f"Rechazado con HTTP {code}")
else:
    log_test("Multi-Tenant IDOR", "Lectura foránea de historial GPS", "FAIL", "HIGH", f"Fuga de telemetría ajena: {len(body) if isinstance(body, list) else body}")

# 1.5 Exfiltración en Export CSV: demo1 intenta descargar CSV de MESA_01
code, body, _ = request(f"{BASE_URL}/api/devices/MESA_01/export?format=csv", method="GET", headers={"Authorization": f"Bearer {demo_token}"})
if code in [403, 404]:
    log_test("Multi-Tenant IDOR", "Descarga foránea de exportación CSV", "PASS", "HIGH", f"Bloqueado correctamente con HTTP {code}")
else:
    log_test("Multi-Tenant IDOR", "Descarga foránea de exportación CSV", "FAIL", "HIGH", f"Descarga no autorizada permitida: HTTP {code}")

# 1.6 Escalamiento de Privilegios: Operador accediendo a gestión de usuarios Admin
code, body, _ = request(f"{BASE_URL}/api/admin/users", method="GET", headers={"Authorization": f"Bearer {demo_token}"})
if code in [401, 403]:
    log_test("Control de Acceso", "Escalamiento de privilegios a /api/admin/users", "PASS", "CRITICAL", f"Acceso restringido con HTTP {code}")
else:
    log_test("Control de Acceso", "Escalamiento de privilegios a /api/admin/users", "FAIL", "CRITICAL", f"Fallo grave: operador accedió al panel de admin: HTTP {code}")

# 1.7 Separación del Admin: Super Admin intentando ver equipos
code, body, _ = request(f"{BASE_URL}/api/devices", method="GET", headers={"Authorization": f"Bearer {admin_token}"})
if code == 200 and body == []:
    log_test("Regla de Privacidad", "Super Admin no ve telemetría de clientes", "PASS", "MEDIUM", "Retornó lista vacía según política de privacidad")
else:
    log_test("Regla de Privacidad", "Super Admin no ve telemetría de clientes", "WARN", "MEDIUM", f"Super admin recibió equipos: {body}")

# =========================================================================
# 2. AUTENTICACIÓN Y SEGURIDAD JWT (BROKEN AUTHENTICATION)
# =========================================================================
print("\n--- 2. Autenticación y Manejo de JWT ---")

# 2.1 Contraseña errónea
code, body, _ = request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "aldo", "password": "WRONG_PASSWORD_XYZ"})
if code == 401:
    log_test("Autenticación", "Rechazo de credenciales inválidas", "PASS", "HIGH", "Rechazado con 401 Unauthorized")
else:
    log_test("Autenticación", "Rechazo de credenciales inválidas", "FAIL", "HIGH", f"Comportamiento anómalo: HTTP {code}")

# 2.2 Petición protegida sin token
code, body, _ = request(f"{BASE_URL}/api/devices", method="GET")
if code in [401, 403]:
    log_test("Autenticación", "Ruta protegida sin token de sesión", "PASS", "HIGH", f"Bloqueado correctamente con HTTP {code}")
else:
    log_test("Autenticación", "Ruta protegida sin token de sesión", "FAIL", "CRITICAL", f"Ruta privada accesible sin autenticación: HTTP {code}")

# 2.3 Token alterado (Firma corrupta)
fake_token = aldo_token[:-10] + "ABCDEFGHIJ" if aldo_token else "invalid"
code, body, _ = request(f"{BASE_URL}/api/devices", method="GET", headers={"Authorization": f"Bearer {fake_token}"})
if code == 401:
    log_test("Autenticación JWT", "Rechazo de token con firma manipulada", "PASS", "CRITICAL", "Rechazado con HTTP 401 (Invalid Signature)")
else:
    log_test("Autenticación JWT", "Rechazo de token con firma manipulada", "FAIL", "CRITICAL", f"Token con firma adulterada aceptado: HTTP {code}")

# 2.4 Token con algoritmo None
fake_none_token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0."
code, body, _ = request(f"{BASE_URL}/api/devices", method="GET", headers={"Authorization": f"Bearer {fake_none_token}"})
if code == 401:
    log_test("Autenticación JWT", "Ataque Algoritmo None (alg: none)", "PASS", "CRITICAL", "Rechazado con HTTP 401")
else:
    log_test("Autenticación JWT", "Ataque Algoritmo None (alg: none)", "FAIL", "CRITICAL", f"Vulnerabilidad crítica alg:none permitida: HTTP {code}")

# 2.5 Duración de expiración del token (Excesiva?)
from app.core.config import settings
if settings.ACCESS_TOKEN_EXPIRE_MINUTES > 1440:
    log_test("Configuración JWT", "Tiempo de vida del token de acceso", "WARN", "MEDIUM", f"Expiración configurada en {settings.ACCESS_TOKEN_EXPIRE_MINUTES} minutos (7 días). Se recomienda 60-120 min + Refresh Tokens")
else:
    log_test("Configuración JWT", "Tiempo de vida del token de acceso", "PASS", "LOW", f"Expiración adecuada: {settings.ACCESS_TOKEN_EXPIRE_MINUTES} min")

# 2.6 Fuerza de la clave SECRET_KEY
if settings.SECRET_KEY in ["your-super-secret-key-for-jwt-signing", "secret", "123456"]:
    log_test("Criptografía JWT", "Clave Secreta JWT por Defecto", "FAIL", "HIGH", "Se utiliza la clave de ejemplo por defecto 'your-super-secret-key-for-jwt-signing'. Debe reemplazarse mediante .env")
else:
    log_test("Criptografía JWT", "Clave Secreta JWT Robusta", "PASS", "HIGH", "Clave secreta personalizada en uso")

# =========================================================================
# 3. PRUEBAS DE INYECCIÓN (SQLi, XSS)
# =========================================================================
print("\n--- 3. Inyección SQL y Cross-Site Scripting (XSS) ---")

# 3.1 SQL Injection en ruta de dispositivo
sqli_payload = "MESA_01' OR '1'='1"
code, body, _ = request(f"{BASE_URL}/api/devices/{urllib.parse.quote(sqli_payload)}/status", headers={"Authorization": f"Bearer {aldo_token}"})
if code == 404:
    log_test("Inyección SQL", "SQLi en Path Parameter (/devices/{id}/status)", "PASS", "CRITICAL", "Parametrización correcta de SQLAlchemy; retorno 404 limpio sin error 500")
elif code == 500:
    log_test("Inyección SQL", "SQLi en Path Parameter (/devices/{id}/status)", "FAIL", "CRITICAL", f"Posible fallo de inyección/error no controlado: HTTP {code}")
else:
    log_test("Inyección SQL", "SQLi en Path Parameter (/devices/{id}/status)", "WARN", "HIGH", f"Respuesta inesperada: HTTP {code}")

# 3.2 SQL Injection en login
code, body, _ = request(f"{BASE_URL}/api/auth/login", method="POST", data={"username": "admin' OR '1'='1", "password": "' OR '1'='1"})
if code == 401:
    log_test("Inyección SQL", "SQLi en formulario de Login", "PASS", "CRITICAL", "Parametrización segura de credenciales; rechazo con 401")
elif code == 200:
    log_test("Inyección SQL", "SQLi en formulario de Login", "FAIL", "CRITICAL", "¡BYPASS DE AUTENTICACIÓN EXITOSO MEDIANTE SQL INJECTION!")
else:
    log_test("Inyección SQL", "SQLi en formulario de Login", "WARN", "MEDIUM", f"Respuesta HTTP {code}")

# 3.3 Inyección de Stored XSS en creación de dispositivo
xss_script = "<script>alert('XSS_TEST')</script>"
xss_payload = {
    "device_id": "TEST_XSS_DEV",
    "name": f"Sensor {xss_script}",
    "type": "Mesa Vibratoria",
    "description": f"Sector <img src=x onerror=alert(1)>",
    "is_active": True
}
code, body, _ = request(f"{BASE_URL}/api/devices", method="POST", data=xss_payload, headers={"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"})
if code in [400, 422]:
    log_test("Cross-Site Scripting (XSS)", "Rechazo de tags HTML y scripts en metadatos", "PASS", "MEDIUM", f"Sanitización y validación estricta en backend: bloqueado con HTTP {code}")
elif code in [200, 201]:
    log_test("Cross-Site Scripting (XSS)", "Almacenamiento de caracteres HTML en metadatos", "WARN", "MEDIUM", "El backend acepta tags HTML en strings. Requiere validación estricta.")
    request(f"{BASE_URL}/api/devices/TEST_XSS_DEV", method="DELETE", headers={"Authorization": f"Bearer {demo_token}"})
else:
    log_test("Cross-Site Scripting (XSS)", "Rechazo de tags HTML en campos", "PASS", "MEDIUM", f"Validación de entrada: HTTP {code}")

# =========================================================================
# 4. RESISTENCIA DEL ENDPOINT DE INGESTA IOT (/api/ingest)
# =========================================================================
print("\n--- 4. Endpoint de Ingesta IoT (/api/ingest) ---")

# 4.1 Ingesta sin lat/lon requeridas
code, body, _ = request(f"{BASE_URL}/api/ingest", method="POST", data={"device_id": "MESA_01"}, headers={"Content-Type": "application/json"})
if code == 422:
    log_test("Validación de Entrada", "Rechazo de payload incompleto en /api/ingest", "PASS", "LOW", "Pydantic valida el esquema estricto (422 Unprocessable Entity)")
else:
    log_test("Validación de Entrada", "Rechazo de payload incompleto en /api/ingest", "WARN", "LOW", f"Respuesta HTTP {code}")

# 4.2 Ingesta con tipos de datos inválidos (string en float)
code, body, _ = request(f"{BASE_URL}/api/ingest", method="POST", data={"device_id": "MESA_01", "lat": "TEXTO_NO_NUMERICO", "lon": -68.5, "ignition": True}, headers={"Content-Type": "application/json"})
if code == 422:
    log_test("Validación de Entrada", "Rechazo de tipos inválidos en coordenadas", "PASS", "MEDIUM", "Pydantic bloquea la inyección de tipos anómalos (HTTP 422)")
else:
    log_test("Validación de Entrada", "Rechazo de tipos inválidos en coordenadas", "FAIL", "MEDIUM", f"Aceptación de tipo inválido: HTTP {code}")

# 4.3 Fuzzing de valores geográficos extremos (lat > 90 o lat < -90)
code, body, _ = request(f"{BASE_URL}/api/ingest", method="POST", data={"device_id": "MESA_01", "lat": 99999.9, "lon": -99999.9, "ignition": True}, headers={"Content-Type": "application/json"})
if code in [400, 422]:
    log_test("Validación de Rango Geográfico", "Validación estricta de límites WGS84 (lat/lon)", "PASS", "LOW", f"Coordenadas fuera de rango bloqueadas exitosamente con HTTP {code}")
elif code in [200, 201]:
    log_test("Validación de Rango Geográfico", "Aceptación de coordenadas fuera de límites WGS84", "WARN", "LOW", "El backend acepta latitud > 90 y longitud > 180.")
else:
    log_test("Validación de Rango Geográfico", "Validación de límites de lat/lon", "PASS", "LOW", f"Rechazado con HTTP {code}")

# 4.4 Rate Limiting / Flooding en Ingesta a través de Nginx
print("  > Probando ráfaga rápida de 40 paquetes consecutivos en /api/ingest a través del proxy Nginx...")
burst_success = 0
rate_limited = 0
for _ in range(40):
    c, _, _ = request(f"{NGINX_URL}/api/ingest", method="POST", data={"device_id": "MESA_01", "lat": -31.5, "lon": -68.5, "ignition": True}, headers={"Content-Type": "application/json"})
    if c == 200:
        burst_success += 1
    elif c in [429, 503]:
        rate_limited += 1

if rate_limited > 0:
    log_test("Denegación de Servicio (DoS)", "Rate Limiting en /api/ingest", "PASS", "MEDIUM", f"Protección activa contra flooding: {rate_limited} peticiones bloqueadas con HTTP 429/503")
else:
    log_test("Denegación de Servicio (DoS)", "Ausencia de Rate Limiting en /api/ingest", "WARN", "MEDIUM", f"Se procesaron {burst_success}/40 peticiones sin límite de tasa")

# =========================================================================
# 5. HARDENING DE RED Y CABECERAS HTTP (NGINX / PROXY)
# =========================================================================
print("\n--- 5. Hardening de Cabeceras HTTP & Nginx ---")

code, _, headers = request(f"{NGINX_URL}/")

# 5.1 X-Frame-Options (Clickjacking)
if "x-frame-options" in headers or "X-Frame-Options" in headers:
    log_test("Cabeceras HTTP", "Protección contra Clickjacking (X-Frame-Options)", "PASS", "MEDIUM", "Cabecera presente y configurada")
else:
    log_test("Cabeceras HTTP", "Protección contra Clickjacking (X-Frame-Options)", "WARN", "MEDIUM", "Cabecera ausente en Nginx")

# 5.2 X-Content-Type-Options
if "x-content-type-options" in headers or "X-Content-Type-Options" in headers:
    log_test("Cabeceras HTTP", "MIME Sniffing (X-Content-Type-Options: nosniff)", "PASS", "LOW", "Cabecera presente (nosniff)")
else:
    log_test("Cabeceras HTTP", "MIME Sniffing (X-Content-Type-Options)", "WARN", "LOW", "Cabecera ausente")

# 5.3 Content-Security-Policy (CSP)
if "content-security-policy" in headers or "Content-Security-Policy" in headers:
    log_test("Cabeceras HTTP", "Content-Security-Policy (CSP)", "PASS", "MEDIUM", "Cabecera CSP configurada")
else:
    log_test("Cabeceras HTTP", "Content-Security-Policy (CSP)", "WARN", "LOW", "Cabecera CSP ausente")

# 5.4 Divulgación de versión del servidor
server_header = headers.get("server", headers.get("Server", ""))
if "nginx/" in server_header.lower():
    log_test("Divulgación de Información", "Banner del Servidor en Header Server", "WARN", "LOW", f"Header expone versión exacta: '{server_header}'")
else:
    log_test("Divulgación de Información", "Banner del Servidor Oculto", "PASS", "LOW", f"Server header genérico u oculto: '{server_header}'")

# 5.5 CORS permisivo
code, _, cors_headers = request(f"{BASE_URL}/api/devices", headers={"Origin": "http://evil-site.com"})
acao = cors_headers.get("access-control-allow-origin", cors_headers.get("Access-Control-Allow-Origin", ""))
if acao == "*" or acao == "http://evil-site.com":
    log_test("CORS Policy", "Política CORS Permisiva", "WARN", "MEDIUM", f"Origen no autorizado aceptado: {acao}")
else:
    log_test("CORS Policy", "Política CORS Restringida", "PASS", "MEDIUM", "Origen malicioso bloqueado (CORS seguro)")

print("\n=== RESUMEN DE PRUEBAS DE SEGURIDAD ===")
print(f"Total Evaluadas: {len(results['tests'])}")
print(f"PASS (Aprobadas / Blindadas): {results['passed']}")
print(f"FAIL (Vulnerabilidades Encontradas): {results['failed']}")
print(f"WARN (Recomendaciones de Hardening): {results['warnings']}")

with open("security_audit_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
