#!/usr/bin/env bash
# Genera el paquete de ACTUALIZACIÓN de PanPOS para una caja que ya tiene datos.
# El paquete NO contiene base de datos, .env ni storage/: el actualizador de
# Windows respalda, migra y verifica la base de datos existente.
#
# Resultado: ~/Escritorio/PanPOS_Actualizacion_<fecha>/  (+ .zip si está disponible)
set -euo pipefail

PROY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FECHA="$(date '+%Y-%m-%d_%H%M')"
DEST="$HOME/Escritorio/PanPOS_Actualizacion_$FECHA"

echo "==> 1. Ejecutando pruebas del backend..."
(cd "$PROY/backend" && php artisan test)

echo "==> 2. Preparando carpeta $DEST..."
rm -rf "$DEST"
mkdir -p "$DEST/app"

echo "==> 3. Preparando app/ de producción..."
"$PROY/scripts/preparar_app.sh" "$DEST/app"

# Verificación: nada de datos de la caja dentro del paquete
if find "$DEST/app" \( -name 'database.sqlite*' -o -name '.env' \) | grep -q . || [ -d "$DEST/app/storage" ]; then
  echo "ERROR: el paquete contiene datos locales (.env, database.sqlite o storage/)." >&2
  exit 1
fi

echo "==> 4. Copiando actualizador, lanzador y configuración de PHP..."
cp -f "$PROY/windows/actualizacion/Actualizar_PanPOS.bat" "$DEST/"
cp -f "$PROY/windows/actualizacion/actualizar_panpos.ps1" "$DEST/"
cp -f "$PROY/windows/actualizacion/verificar_bd.php" "$DEST/"
cp -f "$PROY/windows/actualizacion/LEEME_ACTUALIZACION.txt" "$DEST/"
cp -f "$PROY/windows/Iniciar_PanPOS.vbs" "$DEST/"
cp -f "$PROY/windows/Detener_PanPOS.bat" "$DEST/"
cp -f "$PROY/windows/php-panpos.ini" "$DEST/"
# Finales de línea de Windows (CRLF) para los scripts
sed -i 's/\r\?$/\r/' "$DEST"/*.bat "$DEST"/*.ps1 "$DEST"/*.vbs "$DEST"/*.ini "$DEST"/*.txt

if command -v zip >/dev/null 2>&1; then
  echo "==> 5. Comprimiendo..."
  (cd "$(dirname "$DEST")" && rm -f "$(basename "$DEST").zip" && zip -qr "$(basename "$DEST").zip" "$(basename "$DEST")")
  echo "    ZIP: $DEST.zip"
fi

echo ""
echo "============================================================"
echo "LISTO: Paquete de actualización en $DEST"
echo "Copie la carpeta a la caja y ejecute Actualizar_PanPOS.bat"
echo "============================================================"
du -sh "$DEST"
