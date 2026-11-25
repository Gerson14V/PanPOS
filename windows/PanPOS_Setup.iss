; =====================================================================
;  Instalador de PanPOS (Inno Setup 6)
;
;  Compilar en Windows: abrir este archivo con Inno Setup y presionar
;  Ctrl+F9 (o ejecutar: ISCC.exe PanPOS_Setup.iss). La carpeta
;  "PanPOS_Windows" debe estar junto a este archivo.
;
;  PROTECCION DE DATOS
;  - La base de datos y el .env se copian SOLO si no existen: instalar
;    encima de una caja en uso nunca reemplaza las ventas reales.
;  - Desinstalar NUNCA borra la base de datos, storage\ (respaldos) ni
;    respaldos_actualizacion\.
;  - Al reinstalar/actualizar se borran las caches de Laravel; el primer
;    arranque respalda la base de datos y aplica migraciones pendientes.
; =====================================================================

#define MyAppName "PanPOS - Panaderia Don Paco"
#define MyAppShortName "PanPOS"
#define MyAppVersion "1.1.1"
#define MyAppPublisher "Panaderia Don Paco"
#define SourceFolder "PanPOS_Windows"

[Setup]
; Mismo AppId que la version 1.0.0: Windows lo reconoce como actualizacion
AppId={{8E4C9B12-4F3A-4D7E-9A1B-6C2E8F0D3B51}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppShortName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName=C:\PanPOS
DisableDirPage=no
UsePreviousAppDir=yes
DefaultGroupName={#MyAppShortName}
AllowNoIcons=yes
OutputDir=.
OutputBaseFilename=Instalar_PanPOS_{#MyAppVersion}
SetupIconFile={#SourceFolder}\panpos.ico
UninstallDisplayIcon={app}\panpos.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
; Datos de la caja: nunca se eliminan al desinstalar
Name: "{app}\app\storage\app\backups"; Flags: uninsneveruninstall
Name: "{app}\app\storage\logs"; Flags: uninsneveruninstall
Name: "{app}\app\storage\framework\cache\data"; Flags: uninsneveruninstall
Name: "{app}\app\storage\framework\sessions"; Flags: uninsneveruninstall
Name: "{app}\app\storage\framework\views"; Flags: uninsneveruninstall
Name: "{app}\app\bootstrap\cache"; Flags: uninsneveruninstall

[InstallDelete]
; Caches de la version anterior: el lanzador las regenera (con respaldo y migraciones)
Type: files; Name: "{app}\app\bootstrap\cache\*.php"
Type: files; Name: "{app}\app\bootstrap\cache\panpos_ruta.txt"

[Files]
; Codigo, PHP y lanzadores (sin datos de la caja)
Source: "{#SourceFolder}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "browser_profile\*,php_error.log*,\app\database\database.sqlite*,\app\.env,\app\storage\*,\app\bootstrap\cache\*.php"
; Base de datos inicial y configuracion: SOLO en instalaciones nuevas
Source: "{#SourceFolder}\app\database\database.sqlite"; DestDir: "{app}\app\database"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "{#SourceFolder}\app\.env"; DestDir: "{app}\app"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\{#MyAppShortName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\Iniciar_PanPOS.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\panpos.ico"
Name: "{group}\Detener {#MyAppShortName}"; Filename: "{app}\Detener_PanPOS.bat"; WorkingDir: "{app}"
Name: "{group}\Desinstalar {#MyAppShortName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppShortName}"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\Iniciar_PanPOS.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\panpos.ico"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\Iniciar_PanPOS.vbs"""; WorkingDir: "{app}"; Description: "Iniciar PanPOS ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Detiene solo el servidor de PanPOS (puerto 8000)
Filename: "{app}\Detener_PanPOS.bat"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "DetenerPanPOS"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\browser_profile"
Type: files; Name: "{app}\php_error.log"
Type: files; Name: "{app}\php_error.log.old"
Type: files; Name: "{app}\iniciando.lock"

[Code]
// Si PanPOS ya esta instalado y abierto, se detiene su servidor antes de copiar
// archivos (PHP mantiene abiertos los archivos del codigo y de la base de datos).
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Detener: String;
  Codigo: Integer;
begin
  Result := '';
  Detener := ExpandConstant('{app}\Detener_PanPOS.bat');
  if FileExists(Detener) then
    Exec(Detener, '', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Codigo);
end;
