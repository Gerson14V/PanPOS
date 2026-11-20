#!/usr/bin/env bash
set -e

PROYECTO="$HOME/Proyectos/PanPOS"
DESTINO="$HOME/Escritorio/PanPOS_Windows"

echo "==> 1. Compilando Frontend de producción..."
cd "$PROYECTO/frontend"
npm run build

echo "==> 2. Preparando carpeta $DESTINO..."
rm -rf "$DESTINO"
mkdir -p "$DESTINO/app" "$DESTINO/php"

echo "==> 3. Copiando Backend de Laravel (sin archivos temporales ni de desarrollo)..."
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='storage/logs/*' \
  --exclude='storage/app/backups/*' \
  --exclude='storage/framework/cache/data/*' \
  --exclude='storage/framework/sessions/*' \
  --exclude='storage/framework/views/*' \
  --exclude='bootstrap/cache/*.php' \
  --exclude='public/assets' \
  --exclude='public/pos.html' \
  "$PROYECTO/backend/" "$DESTINO/app/"

echo "==> 4. Integrando Frontend compilado dentro de app/public/..."
cp -r "$PROYECTO/frontend/dist/." "$DESTINO/app/public/"
mv "$DESTINO/app/public/index.html" "$DESTINO/app/public/pos.html"

echo "==> 5. Configurando .env de producción portable para Windows..."
ENV_FILE="$DESTINO/app/.env"
sed -i 's|^APP_ENV=.*|APP_ENV=production|g' "$ENV_FILE"
sed -i 's|^APP_DEBUG=.*|APP_DEBUG=false|g' "$ENV_FILE"
sed -i 's|^APP_TIMEZONE=.*|APP_TIMEZONE=America/Costa_Rica|g' "$ENV_FILE"
sed -i 's|^LOG_CHANNEL=.*|LOG_CHANNEL=daily|g' "$ENV_FILE"
sed -i 's|^DB_CONNECTION=.*|DB_CONNECTION=sqlite|g' "$ENV_FILE"
for kv in "CACHE_STORE=file" "SESSION_DRIVER=file" "QUEUE_CONNECTION=sync"; do
  k="${kv%%=*}"
  if grep -q "^${k}=" "$ENV_FILE"; then
    sed -i "s|^${k}=.*|${kv}|g" "$ENV_FILE"
  else
    echo "${kv}" >> "$ENV_FILE"
  fi
done
# Eliminar DB_DATABASE absoluta de Linux para que Laravel use database/database.sqlite en Windows
sed -i '/^DB_DATABASE=/d' "$ENV_FILE"

# Asegurar carpetas de storage limpias
mkdir -p "$DESTINO/app/storage/logs" \
         "$DESTINO/app/storage/app/backups" \
         "$DESTINO/app/storage/app/reportes" \
         "$DESTINO/app/storage/framework/cache/data" \
         "$DESTINO/app/storage/framework/sessions" \
         "$DESTINO/app/storage/framework/views"

# Crear base de datos LIMPIA para la panadería (si prefieres llevar tu BD actual con productos ya cargados,
# comenta estas 4 líneas de abajo antes de correr el script)
rm -f "$DESTINO/app/database/database.sqlite" "$DESTINO/app/database/database.sqlite-wal" "$DESTINO/app/database/database.sqlite-shm"
touch "$DESTINO/app/database/database.sqlite"
(cd "$DESTINO/app" && php artisan key:generate --force && php artisan migrate --force && php artisan db:seed --force && php -r "\$pdo = new PDO('sqlite:database/database.sqlite'); \$pdo->exec(\"UPDATE configuracion_sistema SET valor = '' WHERE clave = 'ruta_respaldo_local'\");" && php artisan optimize:clear)

# Quitar archivos de caché con rutas de Linux
rm -f "$DESTINO/app/bootstrap/cache/"*.php

echo "==> 6. Creando php.ini listo para Windows..."
cat << 'EOF' > "$DESTINO/php/php-panpos.ini"
[PHP]
engine = On
short_open_tag = Off
memory_limit = 256M
max_execution_time = 60
upload_max_filesize = 20M
post_max_size = 20M
display_errors = Off
log_errors = On
date.timezone = "America/Costa_Rica"

extension_dir = "ext"
extension=curl
extension=fileinfo
extension=mbstring
extension=openssl
extension=pdo_sqlite
extension=sqlite3
extension=zip
EOF

echo "==> 7. Creando lanzador silencioso Iniciar_PanPOS.vbs..."
cat << 'EOF' > "$DESTINO/Iniciar_PanPOS.vbs"
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
phpExe = baseDir & "\php\php.exe"
phpIni = baseDir & "\php\php-panpos.ini"
appDir = baseDir & "\app"
url = "http://127.0.0.1:8000"

If Not fso.FileExists(phpExe) Then
    MsgBox "No se encontro php.exe en:" & vbCrLf & phpExe & vbCrLf & vbCrLf & _
           "Descargue PHP 8.3 o 8.4 (x64 Thread Safe ZIP) desde https://windows.php.net/download/ " & _
           "y descomprima su contenido dentro de la carpeta 'php'.", vbExclamation, "PanPOS - Falta PHP Portable"
    WScript.Quit 1
End If

Function ServidorActivo()
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 400, 400, 400, 400
    http.Open "GET", url & "/api/configuracion", False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then
        ServidorActivo = True
    Else
        ServidorActivo = False
    End If
    Err.Clear
End Function

If Not ServidorActivo() Then
    cmd = """" & phpExe & """ -c """ & phpIni & """ -S 127.0.0.1:8000 -t """ & appDir & "\public"" """ & appDir & "\server.php"""
    shell.CurrentDirectory = appDir
    shell.Run cmd, 0, False

    esperado = 0
    Do While Not ServidorActivo() And esperado < 10000
        WScript.Sleep 300
        esperado = esperado + 300
    Loop
End If

edge1 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
edge2 = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
chrome1 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
chrome2 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

If fso.FileExists(edge1) Then
    shell.Run """" & edge1 & """ --app=" & url & " --start-maximized", 1, False
ElseIf fso.FileExists(edge2) Then
    shell.Run """" & edge2 & """ --app=" & url & " --start-maximized", 1, False
ElseIf fso.FileExists(chrome1) Then
    shell.Run """" & chrome1 & """ --app=" & url & " --start-maximized", 1, False
ElseIf fso.FileExists(chrome2) Then
    shell.Run """" & chrome2 & """ --app=" & url & " --start-maximized", 1, False
Else
    shell.Run url, 1, False
End If
EOF

echo "==> 8. Creando Detener_PanPOS.bat e Instalar_Acceso_Directo.bat..."
cat << 'EOF' > "$DESTINO/Detener_PanPOS.bat"
@echo off
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='php.exe'\" | Where-Object { $_.CommandLine -like '*127.0.0.1:8000*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Servidor local de PanPOS detenido correctamente.
timeout /t 2 >nul
EOF

cat << 'EOF' > "$DESTINO/Instalar_Acceso_Directo.bat"
@echo off
set "BASE=%~dp0"
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$s = $ws.CreateShortcut((Join-Path $desktop 'PanPOS.lnk')); " ^
  "$s.TargetPath = 'wscript.exe'; " ^
  "$s.Arguments = '\"' + '%BASE%Iniciar_PanPOS.vbs' + '\"'; " ^
  "$s.WorkingDirectory = '%BASE%'; " ^
  "$s.IconLocation = 'shell32.dll,21'; " ^
  "$s.Description = 'Abrir Sistema Punto de Venta PanPOS'; " ^
  "$s.Save()"
echo.
echo Acceso directo "PanPOS" creado en el Escritorio.
pause
EOF

echo "cp -f "$ROOT/assets/panpos.ico" "$DEST/panpos.ico"
echo "==> 9. Creando guía rápida de instalación..."
cat << 'EOF' > "$DESTINO/LEEME_INSTALACION.txt"
============================================================
INSTALACION RAPIDA DE PANPOS EN WINDOWS (100% OFFLINE)
============================================================

1. Copie esta carpeta completa a: C:\PanPOS

2. Descargue PHP 8.3 o 8.4 para Windows (VS16/VS17 x64 Thread Safe ZIP)
   desde el sitio oficial: https://windows.php.net/download/
   y descomprima su contenido dentro de: C:\PanPOS\php\
   (Verifique que quede el archivo C:\PanPOS\php\php.exe)

3. Haga doble clic en: Instalar_Acceso_Directo.bat
   Esto creara el icono "PanPOS" en el Escritorio.

4. Abra "PanPOS" desde el Escritorio.
   Usuario inicial: admin
   Contrasena inicial: admin123

NOTAS IMPORTANTES:
- Los respaldos automaticos de SQLite se guardan en:
  C:\PanPOS\app\storage\app\backups\
- El Excel maestro diario (Ventas_Diarias_PanPOS.xls) se actualiza
  automaticamente en el Escritorio al cerrar cada turno.
- Si desea cerrar el servidor local en segundo plano, ejecute Detener_PanPOS.bat.
EOF

echo ""
echo "============================================================"
echo "LISTO: Paquete portable generado en $DESTINO"
echo "============================================================"
du -sh "$DESTINO"
