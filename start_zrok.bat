@echo off
title Tunel Zrok - TK IoT Demo
echo ========================================================
echo  Iniciando Tunel Zrok 2 con URL Fija Permanente:
echo  https://tk-iot-demo.shares.zrok.io
echo ========================================================
echo  Destino: http://localhost:3000 (Plataforma Docker)
echo ========================================================
"C:\zrok_2.0.8_windows_amd64\zrok2.exe" share public http://localhost:3000 -n public:tk-iot-demo --headless
pause
