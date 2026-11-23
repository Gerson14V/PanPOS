#!/usr/bin/env bash
# Prepara la carpeta app/ de producción de PanPOS (Laravel + frontend compilado).
# La usan empaquetar_windows.sh (instalación nueva) y empaquetar_actualizacion.sh.
#
# Uso: scripts/preparar_app.sh <carpeta_destino_app>
#
# El resultado NO incluye .env, base de datos ni storage/: esos datos pertenecen
# a cada caja y nunca deben viajar dentro de un paquete.
set -euo pipefail

PROY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_APP="${1:?Indique la carpeta destino de app/}"

echo "==> Compilando frontend de producción..."
(cd "$PROY/frontend" && npm run build)

echo "==> Copiando backend de Laravel a $DEST_APP ..."
mkdir -p "$DEST_APP"
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='storage' \
  --exclude='database/database.sqlite*' \
  --exclude='bootstrap/cache/*.php' \
  --exclude='phpunit.xml' \
  --exclude='.phpunit*' \
  --exclude='CLAUDE.md' \
  --exclude='AGENTS.md' \
  --exclude='README.md' \
  --exclude='vite.config.js' \
  --exclude='package.json' \
  --exclude='resources/js' \
  --exclude='resources/css' \
  "$PROY/backend/" "$DEST_APP/"

echo "==> Quitando dependencias de desarrollo y optimizando el autoloader..."
# classmap-authoritative: PHP no busca archivos en disco para resolver clases
# (en Windows cada búsqueda de archivo es lenta).
(cd "$DEST_APP" && composer install --no-dev --classmap-authoritative --no-interaction --no-progress --no-scripts --quiet)
rm -f "$DEST_APP"/bootstrap/cache/*.php
mkdir -p "$DEST_APP/bootstrap/cache"

echo "==> Integrando frontend compilado en public/ ..."
rm -rf "$DEST_APP/public/assets"
cp -rf "$PROY/frontend/dist/." "$DEST_APP/public/"
mv -f "$DEST_APP/public/index.html" "$DEST_APP/public/pos.html"
cp -f "$PROY/frontend/public/favicon.ico" "$DEST_APP/public/favicon.ico"
cp -f "$PROY/frontend/public/icon-64.png" "$DEST_APP/public/icon-64.png"
cp -f "$PROY/frontend/public/icon-256.png" "$DEST_APP/public/icon-256.png"

echo "==> Registrando versión del paquete..."
VERSION="$(git -C "$PROY" describe --always --dirty 2>/dev/null || echo 'sin-git')"
printf 'PanPOS %s\nGenerado: %s\n' "$VERSION" "$(date '+%Y-%m-%d %H:%M')" > "$DEST_APP/VERSION_PANPOS.txt"
cat "$DEST_APP/VERSION_PANPOS.txt"
