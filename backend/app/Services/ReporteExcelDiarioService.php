<?php

namespace App\Services;

use App\Models\ConfiguracionSistema;
use App\Models\TurnoCaja;
use App\Models\Venta;
use Carbon\Carbon;

class ReporteExcelDiarioService
{
    public function __construct(private TurnoCajaService $turnoCajaService) {}

    public function obtenerRutaArchivo(): string
    {
        $rutaConfig = trim((string) ConfiguracionSistema::where('clave', 'ruta_excel_maestro')->value('valor'));
        if ($rutaConfig !== '') {
            if (is_dir($rutaConfig)) {
                return rtrim($rutaConfig, DIRECTORY_SEPARATOR) . '/Ventas_Diarias_PanPOS.xls';
            }
            $dirPadre = dirname($rutaConfig);
            if (is_dir($dirPadre) && is_writable($dirPadre)) {
                return $rutaConfig;
            }
        }

        $candidatos = [];
        $oneDrive = getenv('OneDrive') ?: ($_SERVER['OneDrive'] ?? '');
        if ($oneDrive) {
            $candidatos[] = $oneDrive . DIRECTORY_SEPARATOR . 'Escritorio';
            $candidatos[] = $oneDrive . DIRECTORY_SEPARATOR . 'Desktop';
        }

        $userProfile = getenv('USERPROFILE') ?: ($_SERVER['USERPROFILE'] ?? '');
        if ($userProfile) {
            $candidatos[] = $userProfile . DIRECTORY_SEPARATOR . 'OneDrive' . DIRECTORY_SEPARATOR . 'Escritorio';
            $candidatos[] = $userProfile . DIRECTORY_SEPARATOR . 'OneDrive' . DIRECTORY_SEPARATOR . 'Desktop';
            $candidatos[] = $userProfile . DIRECTORY_SEPARATOR . 'Escritorio';
            $candidatos[] = $userProfile . DIRECTORY_SEPARATOR . 'Desktop';
        }

        $home = getenv('HOME') ?: ($_SERVER['HOME'] ?? '');
        if (!$home && function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
            $info = posix_getpwuid(posix_geteuid());
            $home = $info['dir'] ?? '';
        }
        if ($home) {
            $candidatos[] = $home . DIRECTORY_SEPARATOR . 'Escritorio';
            $candidatos[] = $home . DIRECTORY_SEPARATOR . 'Desktop';
        }

        $carpeta = null;
        foreach ($candidatos as $dir) {
            if ($dir && is_dir($dir) && is_writable($dir)) {
                $carpeta = $dir;
                break;
            }
        }

        if (!$carpeta) {
            $carpeta = storage_path('app/reportes');
            if (!is_dir($carpeta)) {
                mkdir($carpeta, 0755, true);
            }
        }

        return rtrim($carpeta, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'Ventas_Diarias_PanPOS.xls';
    }

    public function generarHtmlMaestro(): string
    {
        $turnos = TurnoCaja::orderBy('fecha_apertura', 'asc')->get();

        // Una sola consulta agrupada por turno_id (evita consultas N+1)
        $ventasPorTurno = Venta::where('estado', 'completada')
            ->selectRaw('turno_id, SUM(total) as total')
            ->groupBy('turno_id')
            ->pluck('total', 'turno_id');

        $porFecha = $turnos->groupBy(function ($t) {
            return Carbon::parse($t->fecha_apertura)->format('Y-m-d');
        });

        $filasHtml = '';
        $granTotalVentas = 0.0;

        foreach ($porFecha as $fechaYmd => $turnosDelDia) {
            $ventasDia = 0.0;
            foreach ($turnosDelDia as $t) {
                $ventasDia += (float) ($ventasPorTurno[$t->id] ?? 0);
            }
            $granTotalVentas += $ventasDia;

            $tieneAbierto = $turnosDelDia->contains('estado', 'abierto');
            $turnosCerrados = $turnosDelDia->where('estado', 'cerrado');
            $ultimoTurno = $turnosDelDia->last();

            if (!$tieneAbierto && $turnosCerrados->isNotEmpty()) {
                $ultimoCerrado = $turnosCerrados->last();
                $efectivoEnCaja = (float) $ultimoCerrado->total_efectivo_contado;
                $diferenciaDia = round((float) $turnosCerrados->sum('diferencia_arqueo'), 2);

                if ($diferenciaDia > 0) {
                    $bgEstado = '#d4edda';
                    $colorTexto = '#155724';
                    $textoEstado = 'SOBRANTE (+₡' . number_format($diferenciaDia, 2) . ')';
                } elseif ($diferenciaDia < 0) {
                    $bgEstado = '#f8d7da';
                    $colorTexto = '#721c24';
                    $textoEstado = 'FALTANTE (-₡' . number_format(abs($diferenciaDia), 2) . ')';
                } else {
                    $bgEstado = '#fff3cd';
                    $colorTexto = '#856404';
                    $textoEstado = 'EXACTO (₡0.00)';
                }
            } else {
                $turnoAbierto = $turnosDelDia->where('estado', 'abierto')->last() ?? $ultimoTurno;
                $resumenAbierto = $this->turnoCajaService->obtenerResumenTurno($turnoAbierto);
                $efectivoEnCaja = (float) ($resumenAbierto['gaveta_efectivo']['efectivo_esperado'] ?? 0);
                $bgEstado = '#e2e8f0';
                $colorTexto = '#475569';
                $textoEstado = 'TURNO ABIERTO (EN CURSO)';
            }

            $fechaFmt = Carbon::parse($fechaYmd)->format('d/m/Y');
            $ventasFmt = number_format($ventasDia, 2);
            $efectivoFmt = number_format($efectivoEnCaja, 2);

            $filasHtml .= <<<ROW
                <tr>
                    <td style="text-align: center; font-weight: bold;">{$fechaFmt}</td>
                    <td class="monto">₡{$ventasFmt}</td>
                    <td class="monto">₡{$efectivoFmt}</td>
                    <td style="background-color: {$bgEstado}; color: {$colorTexto}; font-weight: bold; text-align: center;">
                        {$textoEstado}
                    </td>
                </tr>
            ROW;
        }

        if ($filasHtml === '') {
            $filasHtml = '<tr><td colspan="4" style="text-align:center; color:#64748b;">Aún no hay turnos registrados.</td></tr>';
        }

        $granTotalFmt = number_format($granTotalVentas, 2);
        $actualizado = now()->format('d/m/Y H:i');

        return <<<HTML
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <style>
                table { border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 13px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 14px; }
                .titulo { background-color: #4a3525; color: #ffffff; font-weight: bold; font-size: 15px; text-align: center; }
                .subtitulo { background-color: #f3ede2; color: #3b2818; font-weight: bold; text-align: center; }
                .monto { text-align: right; font-weight: bold; }
                .total-general { background-color: #e2e8f0; font-weight: bold; font-size: 14px; }
            </style>
        </head>
        <body>
            <table>
                <tr>
                    <td colspan="4" class="titulo">REGISTRO DIARIO DE VENTAS Y CAJA - PANPOS</td>
                </tr>
                <tr>
                    <td colspan="4" style="text-align: center; font-size: 11px; color: #555;">
                        Última actualización automática: {$actualizado}
                    </td>
                </tr>
                <tr class="subtitulo">
                    <th>Fecha</th>
                    <th>Ventas Totales del Día</th>
                    <th>Efectivo en Caja</th>
                    <th>Estado de Caja</th>
                </tr>
                {$filasHtml}
                <tr class="total-general">
                    <td style="text-align: center;">TOTAL ACUMULADO</td>
                    <td class="monto">₡{$granTotalFmt}</td>
                    <td colspan="2"></td>
                </tr>
            </table>
        </body>
        </html>
        HTML;
    }

    public function actualizarArchivoMaestro(): array
    {
        $html = $this->generarHtmlMaestro();
        $ruta = $this->obtenerRutaArchivo();
        $guardado = false;

        try {
            $rutaTmp = $ruta . '.tmp';
            if (@file_put_contents($rutaTmp, $html, LOCK_EX) !== false) {
                $guardado = @rename($rutaTmp, $ruta);
                if (!$guardado) {
                    @unlink($rutaTmp);
                }
            }
        } catch (\Throwable $e) {
            $guardado = false;
        }

        return [
            'guardado' => $guardado,
            'ruta' => $ruta,
            'archivo' => basename($ruta),
            'html' => $html,
        ];
    }
}
