' =====================================================================
'  PanPOS - Lanzador silencioso
'  - Garantiza UN SOLO servidor PHP (dos servidores en el mismo puerto
'    compiten por la base de datos y provocan cobros lentos o con error).
'  - Reinicia el servidor si quedo colgado.
'  - Regenera las caches de Laravel si faltan o si se movio la carpeta.
'  - Abre PanPOS en una ventana dedicada de Edge o Chrome.
' =====================================================================
Option Explicit

Const PUERTO = "8000"
Const HOST = "127.0.0.1"

Dim fso, shell, base, phpExe, phpIni, appDir, url
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
phpExe = base & "\php\php.exe"
phpIni = base & "\php\php-panpos.ini"
appDir = base & "\app"
url = "http://" & HOST & ":" & PUERTO

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
    ProcesosServidor = ids
End Function

Sub DetenerServidores()
    Dim ids, partes, i
    ids = ProcesosServidor()
    If ids = "" Then Exit Sub
    partes = Split(ids, ",")
    For i = 0 To UBound(partes)
        If partes(i) <> "" Then shell.Run "taskkill /F /PID " & partes(i), 0, True
    Next
    WScript.Sleep 500
End Sub

' Ejecuta artisan oculto y espera a que termine. PHP corre desde la carpeta
' php\ porque php-panpos.ini carga las extensiones con la ruta relativa ext\
Sub Artisan(argumentos)
    shell.CurrentDirectory = base & "\php"
    shell.Run """" & phpExe & """ -c """ & phpIni & """ """ & appDir & "\artisan"" " & argumentos, 0, True
End Sub

' Las caches de configuracion/rutas guardan rutas absolutas: se regeneran si
' faltan o si PanPOS se instalo/movio a otra carpeta.
Sub PrepararCaches()
    Dim marcador, rutaGuardada, f
    marcador = appDir & "\bootstrap\cache\panpos_ruta.txt"
    rutaGuardada = ""
    If fso.FileExists(marcador) Then
        Set f = fso.OpenTextFile(marcador, 1)
        If Not f.AtEndOfStream Then rutaGuardada = Trim(f.ReadLine)
        f.Close
    End If

    If (Not fso.FileExists(appDir & "\bootstrap\cache\config.php")) Or (LCase(rutaGuardada) <> LCase(base)) Then
        Artisan "optimize:clear"
        Artisan "optimize"
        Set f = fso.CreateTextFile(marcador, True)
        f.WriteLine base
        f.Close
    End If
End Sub

' Evita que php_error.log crezca sin limite (se rota al superar 5 MB)
Sub RotarLog()
    On Error Resume Next
    Dim logPath
    logPath = base & "\php_error.log"
    If fso.FileExists(logPath) Then
        If fso.GetFile(logPath).Size > 5242880 Then
            If fso.FileExists(logPath & ".old") Then fso.DeleteFile logPath & ".old", True
            fso.MoveFile logPath, logPath & ".old"
        End If
    End If
    Err.Clear
End Sub

Sub IniciarServidor()
    Dim cmd
    RotarLog
    PrepararCaches
    shell.CurrentDirectory = base & "\php"
    ' -q: no registrar cada peticion en el log (solo errores reales)
    cmd = "cmd /c """"" & phpExe & """ -q -c """ & phpIni & """ -S " & HOST & ":" & PUERTO & _
          " -t """ & appDir & "\public"" """ & appDir & "\server.php"" 2>> """ & base & "\php_error.log"""""
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
        ' El primer lanzador abre la ventana; este termina sin duplicarla
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
Dim perfil, navegadores, nav, i, extras
shell.CurrentDirectory = base
perfil = base & "\browser_profile"
extras = " --disable-background-timer-throttling --disable-renderer-backgrounding"
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
