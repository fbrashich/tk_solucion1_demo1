#!/usr/bin/env python3
"""
Tokioba IoT - Receptor Dual de Pruebas (TCP + UDP)
Puerto Local: 5027
Usado para validar el enlace de telemetria externa desde Portmap (TCP) y Playit (UDP).
"""

import socket
import threading
from datetime import datetime

PORT = 5027

def log_event(proto: str, addr, data: bytes):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        text = data.decode("utf-8", errors="replace").strip()
    except Exception:
        text = str(data)
    print(f"[{ts}] [{proto}] Conexión desde: {addr} | Datos ({len(data)} bytes): {text}", flush=True)

def tcp_listener():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", PORT))
    s.listen(10)
    print(f">>> [TCP] Receptor activo escuchando en 0.0.0.0:{PORT} (Portmap.io)", flush=True)

    while True:
        try:
            conn, addr = s.accept()
            data = conn.recv(2048)
            if data:
                log_event("TCP", addr, data)
                conn.sendall(b"OK_TCP_PORTMAP_CONFIRMADO\n")
            conn.close()
        except Exception as e:
            print(f">>> [TCP Error]: {e}", flush=True)

def udp_listener():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("0.0.0.0", PORT))
    print(f">>> [UDP] Receptor activo escuchando en 0.0.0.0:{PORT} (Playit.gg)", flush=True)

    while True:
        try:
            data, addr = s.recvfrom(2048)
            if data:
                log_event("UDP", addr, data)
                s.sendto(b"OK_UDP_PLAYIT_CONFIRMADO\n", addr)
        except Exception as e:
            print(f">>> [UDP Error]: {e}", flush=True)

if __name__ == "__main__":
    print("=" * 65)
    print(f"  TOKIOBA IoT - RECEPTOR DUAL TELEMETRÍA (PUERTO {PORT})")
    print("  TCP: Portmap.io -> 193.161.193.99:53772")
    print("  UDP: Playit.gg  -> 147.185.221.214:64501")
    print("=" * 65)

    t_tcp = threading.Thread(target=tcp_listener, daemon=True)
    t_tcp.start()

    udp_listener()
