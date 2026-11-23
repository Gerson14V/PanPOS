@echo off
set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\PanPOS.lnk'); $s.TargetPath='C:\Windows\System32\wscript.exe'; $s.Arguments='\"%DIR%\Iniciar_PanPOS.vbs\"'; $s.WorkingDirectory='%DIR%'; $s.IconLocation='%DIR%\panpos.ico,0'; $s.Save()"
ie4uinit.exe -show
echo Acceso directo de PanPOS creado en el Escritorio apuntando a %DIR%
pause
