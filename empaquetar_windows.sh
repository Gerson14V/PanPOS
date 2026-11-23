#!/usr/bin/env bash
# Genera el paquete portable de INSTALACIÓN NUEVA de PanPOS para Windows
# (base de datos vacía con el usuario admin inicial).
# Para actualizar una caja que ya tiene datos use ./empaquetar_actualizacion.sh
set -euo pipefail

PROY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/Escritorio/PanPOS_Windows"

echo "==> 1. Preparando carpeta $DEST..."
rm -rf "$DEST"
mkdir -p "$DEST/app" "$DEST/php"

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

echo "==> 6. Creando guía rápida de instalación..."
cat << 'EOF' | sed 's/$/\r/' > "$DEST/LEEME.txt"
PANPOS - INSTALACION RAPIDA EN WINDOWS
======================================
1. Descomprima PHP x64 Thread Safe dentro de la carpeta "php\" (junto a php-panpos.ini).
2. Ejecute "Instalar_Acceso_Directo.bat" para crear el icono en el Escritorio.
3. Abra "PanPOS" desde el Escritorio (inicia el servidor y abre la app automaticamente).

IMPORTANTE: si la caja ya tiene datos, NO use este paquete. Use el paquete
de actualizacion (Actualizar_PanPOS.bat), que conserva la base de datos.
EOF

echo ""
echo "============================================================"
echo "LISTO: Paquete portable generado en $DEST"
echo "============================================================"
du -sh "$DEST"
