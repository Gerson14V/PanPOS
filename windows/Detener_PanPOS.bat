@echo off
rem Detiene solo el servidor PHP de PanPOS (puerto 8000), sin tocar otros programas PHP.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='php.exe'\" | Where-Object { $_.CommandLine -like '*127.0.0.1:8000*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
if errorlevel 1 taskkill /F /IM php.exe >nul 2>&1
echo Servidor PanPOS detenido.
timeout /t 2 >nul
