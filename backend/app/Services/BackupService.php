<?php

namespace App\Services;

use App\Models\ConfiguracionSistema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class BackupService
{
    public function generarRespaldo(string $prefijo = 'cierre'): array
    {
        $config = ConfiguracionSistema::pluck('valor', 'clave');
        $timestamp = now()->format('Y-m-d_H-i-s');
        $nombreArchivo = "panpos_{$prefijo}_{$timestamp}.sqlite";

        $rutaLocalDir = $config['ruta_respaldo_local'] ?? storage_path('app/backups');
        if (!File::exists($rutaLocalDir)) {
            File::makeDirectory($rutaLocalDir, 0755, true);
        }

        $rutaArchivoLocal = rtrim($rutaLocalDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $nombreArchivo;

        // VACUUM INTO crea una copia íntegra y compactada de SQLite incluso en modo WAL activo
        $rutaEscapada = str_replace("'", "''", $rutaArchivoLocal);
        DB::statement("VACUUM INTO '{$rutaEscapada}';");

        $copiadoUsb = false;
        $rutaUsbDir = trim($config['ruta_respaldo_usb'] ?? '');

        if ($rutaUsbDir !== '' && File::isDirectory($rutaUsbDir) && File::isWritable($rutaUsbDir)) {
            $rutaArchivoUsb = rtrim($rutaUsbDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $nombreArchivo;
            File::copy($rutaArchivoLocal, $rutaArchivoUsb);
            $copiadoUsb = true;
        }

        return [
            'archivo' => $nombreArchivo,
            'ruta_local' => $rutaArchivoLocal,
            'copiado_usb' => $copiadoUsb,
            'fecha' => now()->toDateTimeString(),
        ];
    }
}
