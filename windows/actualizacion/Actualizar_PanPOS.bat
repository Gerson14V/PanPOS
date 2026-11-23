@echo off
title Actualizador de PanPOS
rem Ejecuta el actualizador de PowerShell solo para este proceso (no cambia la politica del sistema).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0actualizar_panpos.ps1" %*
echo.
pause
