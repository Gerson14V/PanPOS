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
        // Una fila por día calendario con ventas o cierres (un turno abierto varios días
        // reparte sus ventas en cada día, en lugar de sumarlas todas el día que abrió).
        $ventasPorDia = Venta::where('estado', 'completada')
            ->selectRaw('substr(created_at, 1, 10) as fecha, SUM(total) as total')
            ->groupBy('fecha')
            ->pluck('total', 'fecha');

        $cierresPorDia = TurnoCaja::where('estado', 'cerrado')
            ->orderBy('fecha_cierre')
            ->get()
            ->groupBy(fn (TurnoCaja $t) => $t->fecha_cierre->toDateString());

        $abierto = TurnoCaja::where('estado', 'abierto')->latest('fecha_apertura')->first();
        $hoy = now()->toDateString();

        $fechas = $ventasPorDia->keys()->merge($cierresPorDia->keys())->unique()->sort()->values();

        $filasHtml = '';
        $granTotalVentas = 0.0;

        foreach ($fechas as $fechaYmd) {
            $ventasDia = (float) ($ventasPorDia[$fechaYmd] ?? 0);
            $granTotalVentas += $ventasDia;
            $cierres = $cierresPorDia->get($fechaYmd);

            if ($cierres) {
                $efectivoTexto = '₡' . number_format((float) $cierres->last()->total_efectivo_contado, 2);
                $diferenciaDia = round((float) $cierres->sum('diferencia_arqueo'), 2);

                if ($diferenciaDia > 0) {
                    [$bgEstado, $colorTexto, $textoEstado] = ['#d4edda', '#155724', 'SOBRANTE (+₡' . number_format($diferenciaDia, 2) . ')'];
                } elseif ($diferenciaDia < 0) {
                    [$bgEstado, $colorTexto, $textoEstado] = ['#f8d7da', '#721c24', 'FALTANTE (-₡' . number_format(abs($diferenciaDia), 2) . ')'];
                } else {
                    [$bgEstado, $colorTexto, $textoEstado] = ['#fff3cd', '#856404', 'EXACTO (₡0.00)'];
                }
            } elseif ($abierto && $fechaYmd === $hoy) {
                $efectivoTexto = '₡' . number_format($this->turnoCajaService->calcularEfectivoDisponible($abierto), 2);
                [$bgEstado, $colorTexto, $textoEstado] = ['#e2e8f0', '#475569', 'TURNO ABIERTO (EN CURSO)'];
            } else {
                $efectivoTexto = '—';
                [$bgEstado, $colorTexto, $textoEstado] = ['#e2e8f0', '#475569', 'SIN CIERRE (EL TURNO CONTINUÓ)'];
            }

            $fechaFmt = Carbon::parse($fechaYmd)->format('d/m/Y');
            $ventasFmt = number_format($ventasDia, 2);

            $filasHtml .= <<<ROW
                <tr>
                    <td style="text-align: center; font-weight: bold;">{$fechaFmt}</td>
                    <td class="monto">₡{$ventasFmt}</td>
                    <td class="monto">{$efectivoTexto}</td>
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
