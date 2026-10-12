@echo off
echo ======================================================
echo    Iniciando PoC de Integracion Directa GPSWOX
echo    Dispositivo: ACT001 (IMEI: 860693080022560)
echo    Servidor: http://localhost:8050
echo ======================================================
cd /d "%~dp0"
python server.py
pause
