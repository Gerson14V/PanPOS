' =====================================================================
'  PanPOS - Lanzador silencioso y resiliente (optimizado para 4GB RAM)
'  - Garantiza UN SOLO servidor PHP y lo reinicia automaticamente si
'    llega a caerse inesperadamente durante la jornada.
'  - Regenera las caches de Laravel si faltan o si se movio la carpeta,
'    verificando que migraciones y caches terminen sin error.
'  - Abre PanPOS en una ventana dedicada de Edge o Chrome en modo de
'    bajo consumo de RAM (sin GPU/extensiones/procesos en segundo plano)
'    para evitar cierres repentinos en PCs con 4GB de RAM y Core i3.
' =====================================================================
Option Explicit

Const PUERTO = "8000"
Const HOST = "127.0.0.1"

Dim fso, shell, base, phpExe, phpIni, appDir, url, flagActivo
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
phpExe = base & "\php\php.exe"
phpIni = base & "\php\php-panpos.ini"
appDir = base & "\app"
url = "http://" & HOST & ":" & PUERTO
flagActivo = base & "\servidor_activo.flag"

' ---------------------------------------------------------------------
Function ServidorResponde(timeoutMs)
    On Error Resume Next
    Dim h
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    h.setTimeouts timeoutMs, timeoutMs, timeoutMs, timeoutMs
    h.Open "GET", url & "/api/sistema/publico", False
    h.Send
    ServidorResponde = (Err.Number = 0 And h.Status = 200)
    Err.Clear
End Function

' Procesos php.exe que escuchan en el puerto de PanPOS
Function ProcesosServidor()
    Dim wmi, lista, p, ids
    ids = ""
    On Error Resume Next
    Set wmi = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
    Set lista = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'php.exe'")
    For Each p In lista
        If Not IsNull(p.CommandLine) Then
            If InStr(1, p.CommandLine, HOST & ":" & PUERTO, vbTextCompare) > 0 Then
                ids = ids & p.ProcessId & ","
            End If
        End If
    Next
    Err.Clear
    ProcesosServidor = ids
End Function

Sub DetenerServidores()
    Dim ids, partes, i
    On Error Resume Next
    If fso.FileExists(flagActivo) Then fso.DeleteFile flagActivo, True
    Err.Clear
    ids = ProcesosServidor()
    If ids = "" Then Exit Sub
    partes = Split(ids, ",")
    For i = 0 To UBound(partes)
        If partes(i) <> "" Then shell.Run "taskkill /F /PID " & partes(i), 0, True
    Next
    WScript.Sleep 600
End Sub

' Ejecuta artisan oculto sin reservar memoria de OPcache para comandos cortos.
' Devuelve el codigo de salida de PHP (0 = exito).
Function Artisan(argumentos)
    Dim cmd
    shell.CurrentDirectory = base & "\php"
    cmd = "cmd /c """"" & phpExe & """ -c """ & phpIni & """ -d opcache.enable_cli=0 """ & appDir & "\artisan"" " & argumentos & " 2>> """ & base & "\php_error.log"""""
    Artisan = shell.Run(cmd, 0, True)
End Function

' Copia de seguridad simple de la base de datos (con el servidor detenido)
Sub RespaldarBaseDatos()
    Dim db, carpeta, sello, sufijo
    On Error Resume Next
    db = appDir & "\database\database.sqlite"
    If Not fso.FileExists(db) Then Exit Sub
    carpeta = base & "\respaldos_actualizacion"
    If Not fso.FolderExists(carpeta) Then fso.CreateFolder carpeta
    sello = Year(Now) & Right("0" & Month(Now), 2) & Right("0" & Day(Now), 2) & "_" & _
            Right("0" & Hour(Now), 2) & Right("0" & Minute(Now), 2) & Right("0" & Second(Now), 2)
    For Each sufijo In Array("", "-wal", "-shm")
        If fso.FileExists(db & sufijo) Then fso.CopyFile db & sufijo, carpeta & "\antes_de_iniciar_" & sello & ".sqlite" & sufijo, True
    Next
    Err.Clear
End Sub

' Las caches de configuracion/rutas guardan rutas absolutas: se regeneran si
' faltan o si PanPOS se instalo/movio a otra carpeta. Solo guarda el marcador
' si migraciones y optimize terminaron con exito.
Sub PrepararCaches()
    Dim marcador, rutaGuardada, f, rcMig, rcOpt
    marcador = appDir & "\bootstrap\cache\panpos_ruta.txt"
    rutaGuardada = ""
    If fso.FileExists(marcador) Then
        On Error Resume Next
        Set f = fso.OpenTextFile(marcador, 1)
        If Err.Number = 0 And Not f.AtEndOfStream Then rutaGuardada = Trim(f.ReadLine)
        If Err.Number = 0 Then f.Close
        Err.Clear
        On Error GoTo 0
    End If

    If (Not fso.FileExists(appDir & "\bootstrap\cache\config.php")) Or (LCase(rutaGuardada) <> LCase(base)) Then
        RespaldarBaseDatos
        rcMig = Artisan("migrate --force --no-interaction")
        Call Artisan("optimize:clear")
        rcOpt = Artisan("optimize")
        If rcMig = 0 And rcOpt = 0 Then
            Set f = fso.CreateTextFile(marcador, True)
            f.WriteLine base
            f.Close
        End If
    End If
End Sub

' Evita que php_error.log crezca sin limite (se rota al superar 2 MB)
Sub RotarLog()
    On Error Resume Next
    Dim logPath
    logPath = base & "\php_error.log"
    If fso.FileExists(logPath) Then
        If fso.GetFile(logPath).Size > 2097152 Then
            If fso.FileExists(logPath & ".old") Then fso.DeleteFile logPath & ".old", True
            fso.MoveFile logPath, logPath & ".old"
        End If
    End If
    Err.Clear
End Sub

' Inicia PHP con un supervisor ligero en segundo plano: si php.exe cae
' inesperadamente durante el dia, se reinicia solo en 1 segundo.
Sub IniciarServidor()
    Dim f, watchdogBat, cmd
    RotarLog
    PrepararCaches

    On Error Resume Next
    Set f = fso.CreateTextFile(flagActivo, True)
    f.WriteLine Now
    f.Close
    Err.Clear
    On Error GoTo 0

    watchdogBat = base & "\panpos_supervisor.cmd"
    Set f = fso.CreateTextFile(watchdogBat, True)
    f.WriteLine "@echo off"
    f.WriteLine "setlocal EnableDelayedExpansion"
    f.WriteLine "cd /d """ & base & "\php"""
    f.WriteLine "set ""FALLOS=0"""
    f.WriteLine ":BUCLE"
    f.WriteLine "if not exist """ & flagActivo & """ exit /b 0"
    f.WriteLine """" & phpExe & """ -q -c """ & phpIni & """ -S " & HOST & ":" & PUERTO & " -t """ & appDir & "\public"" """ & appDir & "\server.php"" 2>> """ & base & "\php_error.log"""
    f.WriteLine "if not exist """ & flagActivo & """ exit /b 0"
    f.WriteLine "set /a FALLOS+=1"
    f.WriteLine "echo [%date% %time%] Servidor PHP se detuvo inesperadamente ^(intento !FALLOS!^). Reiniciando... >> """ & base & "\php_error.log"""
    f.WriteLine "if !FALLOS! GEQ 5 ("
    f.WriteLine "  echo [%date% %time%] Demasiados reinicios seguidos; deteniendo supervisor. >> """ & base & "\php_error.log"""
    f.WriteLine "  del /F /Q """ & flagActivo & """ >nul 2>&1"
    f.WriteLine "  exit /b 1"
    f.WriteLine ")"
    f.WriteLine "timeout /t 1 /nobreak >nul"
    f.WriteLine "goto BUCLE"
    f.Close

    shell.CurrentDirectory = base & "\php"
    cmd = "cmd /c """"" & watchdogBat & """"""
    shell.Run cmd, 0, False
End Sub

' ---------------------------------------------------------------------
If Not fso.FileExists(phpExe) Then
    MsgBox "Falta php.exe dentro de " & base & "\php\", 16, "PanPOS"
    WScript.Quit 1
End If

Dim k, listo, candado
listo = False
candado = base & "\iniciando.lock"

' Candado contra doble clic: si dos lanzadores arrancan a la vez, cada uno
' iniciaria su propio servidor. Solo el primero que crea el archivo continua.
Function TomarCandado()
    Dim f, tomado
    On Error Resume Next
    If fso.FileExists(candado) Then
        ' Candado abandonado (lanzador anterior cerrado a la fuerza): se descarta
        If DateDiff("s", fso.GetFile(candado).DateLastModified, Now) > 90 Then fso.DeleteFile candado, True
    End If
    Err.Clear
    Set f = fso.CreateTextFile(candado, False)
    tomado = (Err.Number = 0)
    If tomado Then f.Close
    Err.Clear
    TomarCandado = tomado
End Function

Sub LiberarCandado()
    On Error Resume Next
    If fso.FileExists(candado) Then fso.DeleteFile candado, True
    Err.Clear
End Sub

' 1) El servidor ya responde: solo se abre la ventana (no depende de WMI)
If ServidorResponde(1500) Then listo = True

If Not listo Then
    ' 2) Otro lanzador ya esta arrancando PanPOS: no se inicia un segundo servidor
    If Not TomarCandado() Then
        For k = 1 To 120
            WScript.Sleep 250
            If ServidorResponde(2000) Then Exit For
        Next
        WScript.Quit 0
    End If

    If ProcesosServidor() <> "" Then
        ' Hay un servidor pero no respondio: darle tiempo por si esta ocupado (p. ej. respaldo)
        For k = 1 To 10
            If ServidorResponde(3000) Then
                listo = True
                Exit For
            End If
            WScript.Sleep 500
        Next
        ' Sigue sin responder: esta colgado. Se reinicia limpio.
        If Not listo Then DetenerServidores
    End If

    If Not listo Then
        IniciarServidor
        For k = 1 To 60
            WScript.Sleep 250
            If ServidorResponde(2000) Then
                listo = True
                Exit For
            End If
        Next
    End If

    LiberarCandado
End If

If Not listo Then
    MsgBox "El servidor de PanPOS no pudo iniciar." & vbCrLf & "Revise el archivo " & base & "\php_error.log", 16, "PanPOS"
    WScript.Quit 1
End If

' ---------------------------------------------------------------------
' Flags de bajo consumo de RAM y alta estabilidad para PCs con 4GB RAM y Core i3:
' - --disable-gpu: elimina el proceso GPU (~100-150MB RAM) y evita cierres por
'   drivers de graficos integrados antiguos.
' - --disable-background-mode: evita procesos zombie al cerrar la ventana.
' - --disable-extensions/sync/features: apaga barra lateral, compras, traductor,
'   sincronizacion y procesos secundarios de Edge/Chrome.
' - --js-flags y cache acotada: evita que el navegador agote la RAM del equipo.
Dim perfil, navegadores, nav, i, extras
shell.CurrentDirectory = base
perfil = base & "\browser_profile"
extras = " --disable-gpu --disable-gpu-compositing --disable-extensions --disable-sync" & _
         " --no-first-run --no-default-browser-check --disable-translate --disable-background-mode" & _
         " --disable-background-networking --disable-component-update --disable-domain-reliability" & _
         " --disable-background-timer-throttling --disk-cache-size=33554432 --media-cache-size=1048576" & _
         " --js-flags=""--max-old-space-size=256""" & _
         " --disable-features=msEdgeSidebarV2,msHubApps,msEdgeShopping,Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions,AutofillServerCommunication"

' Activado desde Configuracion > Impresora: imprime tiquetes sin dialogo
If fso.FileExists(base & "\impresion_silenciosa.activar") Then extras = extras & " --kiosk-printing"

navegadores = Array( _
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe", _
    "C:\Program Files\Google\Chrome\Application\chrome.exe", _
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")

For i = 0 To UBound(navegadores)
    nav = navegadores(i)
    If fso.FileExists(nav) Then
        shell.Run """" & nav & """ --app=" & url & " --user-data-dir=""" & perfil & """ --start-maximized" & extras, 1, False
        WScript.Quit 0
    End If
Next

shell.Run url, 1, False
