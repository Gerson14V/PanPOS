#!/usr/bin/env bash
set -euo pipefail

PROY="$HOME/Proyectos/PanPOS"
DEST="$HOME/Escritorio/PanPOS_Windows"

echo "==> 1. Compilando Frontend de producción..."
(cd "$PROY/frontend" && npm run build)

echo "==> 2. Preparando carpeta $DEST..."
rm -rf "$DEST"
mkdir -p "$DEST/app" "$DEST/php"

echo "==> 3. Copiando Backend de Laravel (sin archivos temporales ni de desarrollo)..."
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='.env' \
  --exclude='storage/logs/*.log' \
  --exclude='storage/framework/cache/data/*' \
  --exclude='storage/framework/sessions/*' \
  --exclude='storage/framework/views/*' \
  --exclude='database/database.sqlite*' \
  "$PROY/backend/" "$DEST/app/"

mkdir -p \
  "$DEST/app/storage/logs" \
  "$DEST/app/storage/framework/cache/data" \
  "$DEST/app/storage/framework/sessions" \
  "$DEST/app/storage/framework/views" \
  "$DEST/app/bootstrap/cache"

echo "==> 4. Integrando Frontend compilado e íconos dentro de app/public/..."
cp -rf "$PROY/frontend/dist/." "$DEST/app/public/"
mv -f "$DEST/app/public/index.html" "$DEST/app/public/pos.html"
cp -f "$PROY/assets/panpos.ico" "$DEST/panpos.ico"
cp -f "$PROY/frontend/public/favicon.ico" "$DEST/app/public/favicon.ico"
cp -f "$PROY/frontend/public/icon-64.png" "$DEST/app/public/icon-64.png"
cp -f "$PROY/frontend/public/icon-256.png" "$DEST/app/public/icon-256.png"

echo "==> 5. Configurando .env de producción portable para Windows..."
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

touch "$DEST/app/database/database.sqlite"
(
  cd "$DEST/app"
  php artisan key:generate --force
  php artisan migrate --force
  php artisan db:seed --force
  php artisan optimize:clear
)

echo "==> 6. Creando php-panpos.ini portable para Windows..."
cat << 'EOF' > "$DEST/php/php-panpos.ini"
extension_dir = "ext"
extension=pdo_sqlite
extension=sqlite3
extension=mbstring
extension=openssl
extension=fileinfo
extension=gd
extension=curl
extension=zip

date.timezone = "America/Costa_Rica"
memory_limit = 256M
max_execution_time = 60
post_max_size = 32M
upload_max_filesize = 32M

realpath_cache_size = 4096K
realpath_cache_ttl = 600

zend_extension = "ext\php_opcache.dll"
opcache.enable=1
opcache.enable_cli=1
opcache.memory_consumption=64
opcache.interned_strings_buffer=8
opcache.max_accelerated_files=10000
opcache.validate_timestamps=0
EOF

echo "==> 7. Creando lanzador silencioso Iniciar_PanPOS.vbs..."
cat << 'EOF' > "$DEST/Iniciar_PanPOS.vbs"
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)

Function Activo()
    On Error Resume Next
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    h.setTimeouts 1000, 1000, 1000, 1000
    h.Open "GET", "http://127.0.0.1:8000/api/sistema/publico", False
    h.Send
    Activo = (Err.Number = 0 And h.Status = 200)
    Err.Clear
End Function

If Not Activo() Then
    If Not fso.FileExists(base & "\php\php.exe") Then
        MsgBox "Falta php.exe dentro de " & base & "\php\", 16, "PanPOS"
        WScript.Quit 1
    End If

    shell.CurrentDirectory = base & "\php"
    cmd = "cmd /c """"" & base & "\php\php.exe"" -c """ & base & "\php\php-panpos.ini"" -S 127.0.0.1:8000 -t """ & base & "\app\public"" """ & base & "\app\server.php"" 2> """ & base & "\php_error.log"""""
    shell.Run cmd, 0, False

    For k = 1 To 40
        WScript.Sleep 250
        If Activo() Then Exit For
    Next

    If Not Activo() Then
        MsgBox "El servidor PHP no pudo iniciar. Revise " & base & "\php_error.log", 16, "PanPOS"
        WScript.Quit 1
    End If
End If

shell.CurrentDirectory = base
p = base & "\browser_profile"
e1 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
e2 = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
c1 = "C:\Program Files\Google\Chrome\Application\chrome.exe"

If fso.FileExists(e1) Then
    shell.Run """" & e1 & """ --app=http://127.0.0.1:8000 --user-data-dir=""" & p & """ --start-maximized", 1, False
ElseIf fso.FileExists(e2) Then
    shell.Run """" & e2 & """ --app=http://127.0.0.1:8000 --user-data-dir=""" & p & """ --start-maximized", 1, False
ElseIf fso.FileExists(c1) Then
    shell.Run """" & c1 & """ --app=http://127.0.0.1:8000 --user-data-dir=""" & p & """ --start-maximized", 1, False
Else
    shell.Run "http://127.0.0.1:8000", 1, False
End If
EOF

echo "==> 8. Creando Detener_PanPOS.bat e Instalar_Acceso_Directo.bat..."
cat << 'EOF' > "$DEST/Detener_PanPOS.bat"
@echo off
taskkill /F /IM php.exe >nul 2>&1
echo Servidor PanPOS detenido.
timeout /t 2 >nul
EOF

cat << 'EOF' > "$DEST/Instalar_Acceso_Directo.bat"
@echo off
set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PanPOS.lnk'); $s.TargetPath='C:\Windows\System32\wscript.exe'; $s.Arguments='\"%DIR%\Iniciar_PanPOS.vbs\"'; $s.WorkingDirectory='%DIR%'; $s.IconLocation='%DIR%\panpos.ico,0'; $s.Save()"
ie4uinit.exe -show
echo Acceso directo de PanPOS creado en el Escritorio apuntando a %DIR%
pause
EOF

echo "==> 9. Creando guía rápida de instalación..."
cat << 'EOF' > "$DEST/LEEME.txt"
PANPOS - INSTALACION RAPIDA EN WINDOWS
======================================
1. Descomprima PHP x64 Thread Safe dentro de la carpeta "php\" (junto a php-panpos.ini).
2. Ejecute "Instalar_Acceso_Directo.bat" para crear el icono en el Escritorio.
3. Abra "PanPOS" desde el Escritorio (inicia el servidor y abre la app automaticamente).
EOF

echo ""
echo "============================================================"
echo "LISTO: Paquete portable generado en $DEST"
echo "============================================================"
du -sh "$DEST"