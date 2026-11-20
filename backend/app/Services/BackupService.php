<?php

namespace App\Services;

use App\Models\ConfiguracionSistema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class BackupService
{
    private const MAX_RESPALDOS_LOCALES = 60;

    public function generarRespaldo(string $prefijo = 'cierre'): array
    {
        $config = ConfiguracionSistema::pluck('valor', 'clave');
        $timestamp = now()->format('Y-m-d_H-i-s');
        $nombreArchivo = "panpos_{$prefijo}_{$timestamp}.sqlite";

        $rutaLocalDir = trim($config['ruta_respaldo_local'] ?? '') ?: storage_path('app/backups');
        if (!File::exists($rutaLocalDir)) {
            File::makeDirectory($rutaLocalDir, 0755, true);
        }

        $rutaArchivoLocal = rtrim($rutaLocalDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $nombreArchivo;

        // VACUUM INTO crea una copia íntegra y compactada de SQLite incluso en modo WAL activo
        $rutaEscapada = str_replace("'", "''", $rutaArchivoLocal);
        DB::statement("VACUUM INTO '{$rutaEscapada}';");

        $this->rotarRespaldosAntiguos($rutaLocalDir);

        $copiadoUsb = false;
        $rutaUsbDir = trim($config['ruta_respaldo_usb'] ?? '');

        if ($rutaUsbDir !== '') {
            try {
                if (File::isDirectory($rutaUsbDir) && File::isWritable($rutaUsbDir)) {
                    $rutaArchivoUsb = rtrim($rutaUsbDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $nombreArchivo;
                    File::copy($rutaArchivoLocal, $rutaArchivoUsb);
                    $copiadoUsb = true;
                }
            } catch (\Throwable $e) {
                Log::warning("No se pudo copiar respaldo a USB ({$rutaUsbDir}): " . $e->getMessage());
                $copiadoUsb = false;
            }
        }

        return [
            'archivo' => $nombreArchivo,
            'ruta_local' => $rutaArchivoLocal,
            'copiado_usb' => $copiadoUsb,
            'fecha' => now()->toDateTimeString(),
        ];
    }

    private function rotarRespaldosAntiguos(string $directorio): void
    {
        try {
            $archivos = glob(rtrim($directorio, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'panpos_*.sqlite');
            if (!$archivos || count($archivos) <= self::MAX_RESPALDOS_LOCALES) {
                return;
            }

            usort($archivos, fn ($a, $b) => filemtime($b) <=> filemtime($a));
            $aEliminar = array_slice($archivos, self::MAX_RESPALDOS_LOCALES);

            foreach ($aEliminar as $viejo) {
                @unlink($viejo);
            }
        } catch (\Throwable $e) {
            Log::warning('Error al rotar respaldos antiguos: ' . $e->getMessage());
        }
    }
}
