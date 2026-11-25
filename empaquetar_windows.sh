#!/usr/bin/env bash
# Genera el INSTALADOR de PanPOS para Windows: carpeta lista para compilar
# con Inno Setup (PanPOS_Setup.iss + PanPOS_Windows/ con PHP incluido).
# La base de datos incluida es nueva (usuario admin inicial), pero el
# instalador NUNCA reemplaza una base de datos existente.
# Para actualizar una caja con datos también sirve ./empaquetar_actualizacion.sh
#
# Uso: ./empaquetar_windows.sh [ruta/a/php-8.x-Win32-vs17-x64.zip]
set -euo pipefail

PROY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SALIDA="$HOME/Escritorio/PanPOS_Instalador"
DEST="$SALIDA/PanPOS_Windows"

# PHP portable para Windows (x64 Thread Safe): argumento o el más reciente en Descargas
PHP_ZIP="${1:-$(ls -t "$HOME"/Descargas/php-8*-Win32-*-x64.zip 2>/dev/null | head -1 || true)}"
if [ -z "$PHP_ZIP" ] || [ ! -f "$PHP_ZIP" ]; then
  echo "ERROR: falta el ZIP de PHP para Windows (php-8.x-Win32-vs17-x64.zip de windows.php.net)." >&2
  echo "       Descárguelo en ~/Descargas o páselo como argumento." >&2
  exit 1
fi
for requerido in php.exe ext/php_opcache.dll ext/php_pdo_sqlite.dll ext/php_sqlite3.dll ext/php_mbstring.dll ext/php_openssl.dll; do
  unzip -l "$PHP_ZIP" "$requerido" >/dev/null || { echo "ERROR: $PHP_ZIP no contiene $requerido" >&2; exit 1; }
done

echo "==> 1. Preparando carpeta $SALIDA..."
rm -rf "$SALIDA"
mkdir -p "$DEST/app" "$DEST/php"
echo "    PHP: $(basename "$PHP_ZIP")"
unzip -q "$PHP_ZIP" -d "$DEST/php"

echo "==> 2. Preparando app/ de producción..."
"$PROY/scripts/preparar_app.sh" "$DEST/app"

mkdir -p \
  "$DEST/app/storage/app/backups" \
  "$DEST/app/storage/logs" \
  "$DEST/app/storage/framework/cache/data" \
  "$DEST/app/storage/framework/sessions" \
  "$DEST/app/storage/framework/views" \
  "$DEST/app/bootstrap/cache"

echo "==> 3. Configurando .env de producción portable para Windows..."
cat << 'EOF' > "$DEST/app/.env"
APP_NAME="PanPOS"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=http://127.0.0.1:8000

APP_LOCALE=es
APP_FALLBACK_LOCALE=es

LOG_CHANNEL=single
LOG_LEVEL=error

DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite

SESSION_DRIVER=file
CACHE_STORE=file
QUEUE_CONNECTION=sync
EOF

echo "==> 4. Creando base de datos inicial..."
touch "$DEST/app/database/database.sqlite"
(
  cd "$DEST/app"
  php artisan key:generate --force
  php artisan migrate --force
  php artisan db:seed --force
  # Las cachés se generan en Windows al primer arranque (contienen rutas absolutas)
  php artisan optimize:clear
)
rm -f "$DEST"/app/bootstrap/cache/*.php

echo "==> 5. Copiando lanzadores, configuración de PHP e íconos..."
cp -f "$PROY/windows/php-panpos.ini" "$DEST/php/php-panpos.ini"
cp -f "$PROY/windows/Iniciar_PanPOS.vbs" "$DEST/Iniciar_PanPOS.vbs"
cp -f "$PROY/windows/Detener_PanPOS.bat" "$DEST/Detener_PanPOS.bat"
cp -f "$PROY/windows/Instalar_Acceso_Directo.bat" "$DEST/Instalar_Acceso_Directo.bat"
cp -f "$PROY/assets/panpos.ico" "$DEST/panpos.ico"
# Los .bat necesitan finales de línea de Windows (CRLF)
sed -i 's/\r\?$/\r/' "$DEST"/*.bat "$DEST/php/php-panpos.ini" "$DEST/Iniciar_PanPOS.vbs"

echo "==> 6. Copiando script del instalador e instrucciones..."
cp -f "$PROY/windows/PanPOS_Setup.iss" "$SALIDA/PanPOS_Setup.iss"
sed -i 's/\r\?$/\r/' "$SALIDA/PanPOS_Setup.iss"
VERSION="$(head -1 "$DEST/app/VERSION_PANPOS.txt")"
cat << EOF | sed 's/$/\r/' > "$SALIDA/LEEME_INSTALADOR.txt"
PANPOS - INSTALADOR PARA WINDOWS ($VERSION)
==========================================

COMPILAR EL .EXE (una sola vez, en cualquier PC con Windows)
1. Instale Inno Setup 6 (gratuito): https://jrsoftware.org/isdl.php
2. Abra PanPOS_Setup.iss con Inno Setup y presione Ctrl+F9 (Compilar).
3. Se crea Instalar_PanPOS_1.1.2.exe en esta misma carpeta.

INSTALAR
- Ejecute Instalar_PanPOS_1.1.2.exe y siga los pasos (carpeta C:\PanPOS).
- Usuario inicial: admin / admin123  (cambie la contrasena en Configuracion > Cajeros)

SEGURIDAD DE LOS DATOS
- Si se instala encima de una caja que ya tiene datos, la base de datos,
  el .env y los respaldos NO se reemplazan. Al primer arranque PanPOS
  respalda la base de datos en C:\PanPOS\respaldos_actualizacion\ y
  aplica las actualizaciones pendientes.
- Desinstalar PanPOS no borra la base de datos ni los respaldos.

SIN INNO SETUP
La carpeta PanPOS_Windows funciona sola: copiela a C:\PanPOS y ejecute
Instalar_Acceso_Directo.bat para crear el icono del Escritorio.
EOF

if command -v zip >/dev/null 2>&1; then
  echo "==> 7. Comprimiendo..."
  (cd "$(dirname "$SALIDA")" && rm -f PanPOS_Instalador.zip && zip -qr PanPOS_Instalador.zip "$(basename "$SALIDA")")
fi

echo ""
echo "============================================================"
echo "LISTO: Instalador listo para compilar en $SALIDA"
echo "       Abra PanPOS_Setup.iss con Inno Setup 6 en Windows (Ctrl+F9)."
echo "============================================================"
du -sh "$SALIDA"
