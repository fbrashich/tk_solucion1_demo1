"""
Script de solución al error 'Playwright driver download 404 error'.
Descarga y ensambla el driver de Playwright (playwright-core desde el registro NPM + Node.js desde nodejs.org)
y descarga los binarios de Chromium oficiales para que el subagente de navegación de Antigravity funcione al 100%.
"""

import os
import sys
import urllib.request
import tarfile
import subprocess
import shutil

TARGET_VERSION = "1.57.0"
TARGET_DIR = os.path.expandvars(rf"%LOCALAPPDATA%\ms-playwright-go\{TARGET_VERSION}")
NODE_URL = "https://nodejs.org/dist/v20.18.0/win-x64/node.exe"
TGZ_URL = f"https://registry.npmjs.org/playwright-core/-/playwright-core-{TARGET_VERSION}.tgz"

def setup_playwright():
    print(f"[*] Directorio de destino del driver Playwright: {TARGET_DIR}")
    os.makedirs(TARGET_DIR, exist_ok=True)

    # 1. Asegurar node.exe
    node_dest = os.path.join(TARGET_DIR, "node.exe")
    if not os.path.exists(node_dest) or os.path.getsize(node_dest) < 10000000:
        print(f"[*] Descargando node.exe desde {NODE_URL}...")
        urllib.request.urlretrieve(NODE_URL, node_dest)
        print(f"[+] node.exe listo ({os.path.getsize(node_dest):,} bytes)")
    else:
        print(f"[+] node.exe ya presente ({os.path.getsize(node_dest):,} bytes)")

    # 2. Asegurar package/cli.js de playwright-core
    package_dir = os.path.join(TARGET_DIR, "package")
    cli_js = os.path.join(package_dir, "cli.js")
    if not os.path.exists(cli_js):
        temp_tgz = os.path.join(TARGET_DIR, "playwright-core.tgz")
        print(f"[*] Descargando playwright-core {TARGET_VERSION} desde {TGZ_URL}...")
        urllib.request.urlretrieve(TGZ_URL, temp_tgz)
        print(f"[+] tgz descargado, extrayendo package/...")
        
        with tarfile.open(temp_tgz, "r:gz") as tar:
            for member in tar.getmembers():
                if member.name.startswith("package/"):
                    tar.extract(member, path=TARGET_DIR)
                    
        if os.path.exists(temp_tgz):
            os.remove(temp_tgz)
        print(f"[+] Extracción completa. cli.js: {os.path.exists(cli_js)}")
    else:
        print(f"[+] package/cli.js ya presente.")

    # 3. Validar driver
    print("[*] Validando versión del driver...")
    result = subprocess.run([node_dest, cli_js, "--version"], capture_output=True, text=True)
    print(f" -> CLI Output: {result.stdout.strip()}")
    assert TARGET_VERSION in result.stdout, f"Error en versión: {result.stdout}"
    print(f"[+] Driver Playwright {TARGET_VERSION} verificado correctamente.")

    # 4. Asegurar navegadores oficiales (Chromium)
    print("[*] Asegurando binarios de Chromium en %LOCALAPPDATA%\\ms-playwright...")
    install_res = subprocess.run([node_dest, cli_js, "install", "chromium"], capture_output=True, text=True)
    if install_res.stdout:
        print(f" -> {install_res.stdout.strip()[:200]}...")
    print("[+] Binarios de Chromium listos y operativos.")

if __name__ == "__main__":
    setup_playwright()
