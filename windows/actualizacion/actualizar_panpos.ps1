# =====================================================================
#  PanPOS - Actualizador seguro
#
#  1. Detiene PanPOS (servidor y ventana dedicada).
#  2. Respalda base de datos, .env y la aplicacion completa.
#  3. Verifica la integridad de la base de datos.
#  4. Copia el codigo nuevo SIN tocar base de datos, .env ni storage.
#  5. Aplica migraciones (solo agregan columnas/indices).
#  6. Verifica que no se perdio ningun registro.
#  7. Si algo falla, restaura el respaldo automaticamente.
# =====================================================================
param(
    [string]$Destino = 'C:\PanPOS',
    [switch]$SinConfirmar,
    # Lo agrega el propio script al reabrirse como administrador
    [switch]$Elevado
)

$ErrorActionPreference = 'Stop'
$Origen = $PSScriptRoot
$Puerto = '127.0.0.1:8000'

function Titulo($texto) { Write-Host ""; Write-Host "==> $texto" -ForegroundColor Cyan }
function Ok($texto)     { Write-Host "    $texto" -ForegroundColor Green }
function Aviso($texto)  { Write-Host "    $texto" -ForegroundColor Yellow }

# La ventana de administrador no tiene el 'pause' del .bat: se espera aqui
# para que se alcance a leer el resultado antes de que se cierre.
function Terminar([int]$codigo) {
    if ($Elevado) {
        Write-Host ""
        Read-Host "Presione Enter para cerrar esta ventana" | Out-Null
    }
    exit $codigo
}

function Fallar($texto) {
    Write-Host ""
    Write-Host "ERROR: $texto" -ForegroundColor Red
    Write-Host "No se modifico nada en la instalacion." -ForegroundColor Yellow
    Terminar 1
}

# Ejecutado desde dentro del ZIP sin descomprimir: Windows solo extrae este archivo
if (-not (Test-Path (Join-Path $PSScriptRoot 'app\artisan'))) {
    Write-Host ""
    Write-Host "ERROR: el paquete no esta completo en esta carpeta:" -ForegroundColor Red
    Write-Host "       $PSScriptRoot" -ForegroundColor Red
    Write-Host ""
    Write-Host "Si abrio el archivo .zip con doble clic, primero haga clic derecho sobre el .zip >" -ForegroundColor Yellow
    Write-Host "'Extraer todo...', y ejecute Actualizar_PanPOS.bat desde la carpeta extraida." -ForegroundColor Yellow
    Terminar 1
}

# ---------------------------------------------------------------------
# Permisos: si no se puede escribir en la carpeta, reintentar como administrador
# ---------------------------------------------------------------------
function Probar-Escritura($carpeta) {
    try {
        $prueba = Join-Path $carpeta ('.prueba_escritura_' + [guid]::NewGuid().ToString('N'))
        Set-Content -Path $prueba -Value 'ok' -ErrorAction Stop
        Remove-Item $prueba -Force
        return $true
    } catch { return $false }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor White
Write-Host "       ACTUALIZADOR DE PANPOS" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor White

if (-not (Test-Path (Join-Path $Destino 'app\artisan'))) {
    Aviso "No se encontro PanPOS en $Destino"
    $Destino = Read-Host "    Escriba la carpeta donde esta instalado PanPOS (ej. C:\PanPOS)"
    $Destino = $Destino.Trim('"', ' ')
    if (-not (Test-Path (Join-Path $Destino 'app\artisan'))) {
        Fallar "No se encontro una instalacion de PanPOS en '$Destino'."
    }
}

$App      = Join-Path $Destino 'app'
$Php      = Join-Path $Destino 'php\php.exe'
$PhpIni   = Join-Path $Destino 'php\php-panpos.ini'
$BaseDatos = Join-Path $App 'database\database.sqlite'

if (-not (Test-Path $Php))       { Fallar "No se encontro php.exe en $Destino\php" }
if (-not (Test-Path $BaseDatos)) { Fallar "No se encontro la base de datos en $BaseDatos" }

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not ((Probar-Escritura $App) -and (Probar-Escritura $Destino))) {
    if ($esAdmin) { Fallar "No hay permiso de escritura en $Destino" }
    Aviso "Se necesitan permisos de administrador. Windows pedira confirmacion..."
    $argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Destino `"$Destino`" -Elevado"
    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argumentos -Wait
    } catch {
        Fallar "No se concedio el permiso de administrador; la actualizacion no se realizo."
    }
    exit
}

$versionActual = if (Test-Path (Join-Path $App 'VERSION_PANPOS.txt')) { (Get-Content (Join-Path $App 'VERSION_PANPOS.txt'))[0] } else { 'PanPOS (version anterior)' }
$versionNueva  = (Get-Content (Join-Path $Origen 'app\VERSION_PANPOS.txt'))[0]

Write-Host ""
Write-Host "    Instalacion:     $Destino"
Write-Host "    Version actual:  $versionActual"
Write-Host "    Version nueva:   $versionNueva"
Write-Host ""
Write-Host "    Se cerrara PanPOS durante 1 o 2 minutos. Las ventas, clientes," -ForegroundColor White
Write-Host "    productos y turnos NO se modifican y se respaldan antes de empezar." -ForegroundColor White

if (-not $SinConfirmar) {
    Write-Host ""
    $resp = Read-Host "    Escriba SI para continuar"
    if ($resp.Trim().ToUpper() -ne 'SI') { Write-Host "    Actualizacion cancelada."; Terminar 0 }
}

$marcaTiempo = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$Respaldo = Join-Path $Destino "respaldos_actualizacion\$marcaTiempo"
$logArchivo = Join-Path $Destino "respaldos_actualizacion\actualizacion_$marcaTiempo.log"
New-Item -ItemType Directory -Force -Path $Respaldo | Out-Null
Start-Transcript -Path $logArchivo -Append | Out-Null

# PHP se ejecuta SIEMPRE desde la carpeta php\ porque php-panpos.ini usa rutas
# relativas para las extensiones (ext\). Los scripts se pasan con ruta absoluta.
function Ejecutar-Php([string[]]$argumentos) {
    $preferenciaAnterior = $ErrorActionPreference
    # En PowerShell 5.1 cualquier texto en stderr de un programa externo se vuelve
    # una excepcion con 'Stop'; aqui solo importa el codigo de salida de PHP.
    $ErrorActionPreference = 'Continue'
    Push-Location (Split-Path $Php)
    try {
        $salida = & $Php -c $PhpIni @argumentos 2>&1 | ForEach-Object { "$_" }
        $codigo = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $preferenciaAnterior
    }
    return @{ Codigo = $codigo; Salida = ($salida | Out-String).Trim() }
}

$Artisan = Join-Path $App 'artisan'

function Detener-PanPOS {
    # Servidor PHP de PanPOS (solo el que usa el puerto 8000)
    Get-CimInstance Win32_Process -Filter "Name='php.exe'" |
        Where-Object { $_.CommandLine -like "*$Puerto*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    # Ventana dedicada de PanPOS (perfil browser_profile); no toca otras ventanas del navegador
    $perfil = Join-Path $Destino 'browser_profile'
    Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
        Where-Object { $_.CommandLine -like "*$perfil*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

function Verificar-BaseDatos($etiqueta) {
    $r = Ejecutar-Php @((Join-Path $Origen 'verificar_bd.php'), $BaseDatos)
    $lineas = $r.Salida -split "`r?`n"
    $lineaJson = $lineas | Where-Object { $_ -like 'PANPOS_JSON=*' } | Select-Object -Last 1
    # Avisos de PHP (no impiden la actualizacion, pero se muestran para revisarlos)
    $lineas | Where-Object { $_.Trim() -ne '' -and $_ -notlike 'PANPOS_JSON=*' } | ForEach-Object { Aviso "PHP: $_" }
    if ($r.Codigo -ne 0 -or -not $lineaJson) { throw "Verificacion de base de datos ($etiqueta) fallo: $($r.Salida)" }
    return ($lineaJson.Substring('PANPOS_JSON='.Length) | ConvertFrom-Json)
}

function Robocopy-Seguro($desde, $hacia, [string[]]$opciones) {
    & robocopy $desde $hacia @opciones /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Fallo la copia de '$desde' a '$hacia' (robocopy $LASTEXITCODE)" }
}

$respaldoListo = $false
try {
    # -----------------------------------------------------------------
    Titulo "1/7 Cerrando PanPOS..."
    Detener-PanPOS
    if (Get-CimInstance Win32_Process -Filter "Name='php.exe'" | Where-Object { $_.CommandLine -like "*$Puerto*" }) {
        throw "No se pudo detener el servidor de PanPOS. Cierre PanPOS y vuelva a intentar."
    }
    Ok "PanPOS detenido."

    # -----------------------------------------------------------------
    Titulo "2/7 Verificando base de datos actual..."
    $antes = Verificar-BaseDatos 'antes'
    Ok "Integridad: $($antes.integridad)  |  Ventas: $($antes.conteos.ventas)  |  Turnos: $($antes.conteos.turnos_caja)  |  Productos: $($antes.conteos.productos)"

    # -----------------------------------------------------------------
    Titulo "3/7 Respaldando todo en $Respaldo ..."
    Robocopy-Seguro $App (Join-Path $Respaldo 'app') @('/E', '/XD', (Join-Path $App 'storage\framework'))
    foreach ($archivo in @('Iniciar_PanPOS.vbs', 'Detener_PanPOS.bat')) {
        if (Test-Path (Join-Path $Destino $archivo)) { Copy-Item (Join-Path $Destino $archivo) $Respaldo -Force }
    }
    Copy-Item $PhpIni (Join-Path $Respaldo 'php-panpos.ini') -Force
    $tamOriginal = (Get-Item $BaseDatos).Length
    $tamRespaldo = (Get-Item (Join-Path $Respaldo 'app\database\database.sqlite')).Length
    if ($tamOriginal -ne $tamRespaldo) { throw "El respaldo de la base de datos no coincide en tamano." }
    $respaldoListo = $true
    Ok "Respaldo completo (base de datos: $([math]::Round($tamOriginal / 1KB)) KB)."

    # -----------------------------------------------------------------
    Titulo "4/7 Instalando el codigo nuevo..."
    $origenApp = Join-Path $Origen 'app'
    # Todo excepto datos propios de esta caja: .env, base de datos y storage
    Robocopy-Seguro $origenApp $App @('/E', '/XF', '.env', 'database.sqlite', 'database.sqlite-wal', 'database.sqlite-shm', '/XD', (Join-Path $origenApp 'storage'), (Join-Path $origenApp 'vendor'), (Join-Path $origenApp 'public\assets'))
    # vendor y assets se reemplazan completos (se eliminan librerias y archivos viejos)
    Robocopy-Seguro (Join-Path $origenApp 'vendor') (Join-Path $App 'vendor') @('/MIR')
    Robocopy-Seguro (Join-Path $origenApp 'public\assets') (Join-Path $App 'public\assets') @('/MIR')
    # Las caches viejas apuntan a clases que ya no existen: se regeneran
    Get-ChildItem (Join-Path $App 'bootstrap\cache') -Filter '*.php' -ErrorAction SilentlyContinue | Remove-Item -Force
    Remove-Item (Join-Path $App 'bootstrap\cache\panpos_ruta.txt') -Force -ErrorAction SilentlyContinue
    foreach ($dir in @('storage\app\backups', 'storage\logs', 'storage\framework\cache\data', 'storage\framework\sessions', 'storage\framework\views', 'bootstrap\cache')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $App $dir) | Out-Null
    }
    Ok "Codigo actualizado."

    # -----------------------------------------------------------------
    Titulo "5/7 Aplicando cambios a la base de datos (migraciones)..."
    $m = Ejecutar-Php @($Artisan, 'migrate', '--force', '--no-interaction')
    Write-Host $m.Salida
    if ($m.Codigo -ne 0) { throw "Las migraciones fallaron." }
    Ok "Base de datos al dia."

    # -----------------------------------------------------------------
    Titulo "6/7 Optimizando PanPOS para esta computadora..."
    $null = Ejecutar-Php @($Artisan, 'optimize:clear')
    $o2 = Ejecutar-Php @($Artisan, 'optimize')
    if ($o2.Codigo -ne 0) { throw "No se pudieron generar las caches: $($o2.Salida)" }
    Set-Content -Path (Join-Path $App 'bootstrap\cache\panpos_ruta.txt') -Value $Destino
    Copy-Item (Join-Path $Origen 'Iniciar_PanPOS.vbs') $Destino -Force
    Copy-Item (Join-Path $Origen 'Detener_PanPOS.bat') $Destino -Force
    Copy-Item (Join-Path $Origen 'php-panpos.ini') $PhpIni -Force
    # Si el paquete se descargo de internet, Windows marca los scripts y mostraria una
    # advertencia de seguridad cada vez que se abre PanPOS: se quita esa marca.
    foreach ($archivo in @('Iniciar_PanPOS.vbs', 'Detener_PanPOS.bat', 'Instalar_Acceso_Directo.bat')) {
        $ruta = Join-Path $Destino $archivo
        if (Test-Path $ruta) { Unblock-File -Path $ruta -ErrorAction SilentlyContinue }
    }
    Ok "Caches generadas y lanzador actualizado."

    # -----------------------------------------------------------------
    Titulo "7/7 Verificando que no se perdio ningun dato..."
    $despues = Verificar-BaseDatos 'despues'
    foreach ($tabla in $antes.conteos.PSObject.Properties.Name) {
        $a = [int]$antes.conteos.$tabla
        $d = [int]$despues.conteos.$tabla
        if ($d -lt $a) { throw "La tabla '$tabla' tenia $a registros y ahora tiene $d." }
    }
    Ok "Integridad: $($despues.integridad)  |  Ventas: $($despues.conteos.ventas)  |  Turnos: $($despues.conteos.turnos_caja)  |  Clientes: $($despues.conteos.clientes)"

    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  ACTUALIZACION COMPLETADA" -ForegroundColor Green
    Write-Host "  Respaldo guardado en: $Respaldo" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Stop-Transcript | Out-Null

    Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$(Join-Path $Destino 'Iniciar_PanPOS.vbs')`""
    Terminar 0
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red

    if ($respaldoListo) {
        Write-Host "Restaurando la version anterior desde el respaldo..." -ForegroundColor Yellow
        try {
            Detener-PanPOS
            # /MIR deja app\ (codigo y base de datos) exactamente como estaba antes
            Robocopy-Seguro (Join-Path $Respaldo 'app') $App @('/MIR')
            foreach ($dir in @('storage\framework\cache\data', 'storage\framework\sessions', 'storage\framework\views')) {
                New-Item -ItemType Directory -Force -Path (Join-Path $App $dir) | Out-Null
            }
            foreach ($archivo in @('Iniciar_PanPOS.vbs', 'Detener_PanPOS.bat')) {
                if (Test-Path (Join-Path $Respaldo $archivo)) { Copy-Item (Join-Path $Respaldo $archivo) $Destino -Force }
            }
            Copy-Item (Join-Path $Respaldo 'php-panpos.ini') $PhpIni -Force
            Write-Host "Se restauro la version anterior. Sus datos estan intactos." -ForegroundColor Green
            Write-Host "Respaldo disponible en: $Respaldo" -ForegroundColor Green
        } catch {
            Write-Host "No se pudo restaurar automaticamente: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Copie manualmente la carpeta '$Respaldo\app' sobre '$App'." -ForegroundColor Red
        }
    } else {
        Write-Host "No se modifico nada en la instalacion." -ForegroundColor Yellow
    }
    try { Stop-Transcript | Out-Null } catch {}
    Terminar 1
}
