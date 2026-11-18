<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TurnoCaja;
use App\Models\Venta;
use App\Services\BackupService;
use App\Services\TurnoCajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ReporteBackupController extends Controller
{
    public function __construct(
        private TurnoCajaService $turnoCajaService,
        private BackupService $backupService
    ) {}

    public function ventasPorPeriodo(Request $request): JsonResponse
    {
        $desde = $request->date('desde') ? $request->date('desde')->startOfDay() : now()->startOfDay();
        $hasta = $request->date('hasta') ? $request->date('hasta')->endOfDay() : now()->endOfDay();

        $ventasIds = Venta::where('estado', 'completada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->pluck('id');

        $totalVentas = (float) Venta::whereIn('id', $ventasIds)->sum('total');
        $numeroVentas = $ventasIds->count();

        $porDepartamento = DB::table('detalle_ventas')
            ->leftJoin('productos', 'detalle_ventas.producto_id', '=', 'productos.id')
            ->leftJoin('departamentos', 'productos.departamento_id', '=', 'departamentos.id')
            ->whereIn('detalle_ventas.venta_id', $ventasIds)
            ->selectRaw("
                COALESCE(departamentos.nombre, 'Artículo Común') as departamento,
                SUM(detalle_ventas.cantidad) as unidades_vendidas,
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico) as costo_total,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia
            ")
            ->groupBy('departamento')
            ->orderByDesc('total_ventas')
            ->get();

        $ventasPorDia = DB::table('ventas')
            ->whereIn('id', $ventasIds)
            ->selectRaw("DATE(created_at) as fecha, SUM(total) as total_ventas, COUNT(id) as cantidad")
            ->groupBy('fecha')
            ->orderBy('fecha')
            ->get();

        return response()->json([
            'desde' => $desde->toDateString(),
            'hasta' => $hasta->toDateString(),
            'ventas_totales' => round($totalVentas, 2),
            'numero_ventas' => $numeroVentas,
            'venta_promedio' => $numeroVentas > 0 ? round($totalVentas / $numeroVentas, 2) : 0,
            'ganancia_total' => round((float) $porDepartamento->sum('ganancia'), 2),
            'ventas_por_dia' => $ventasPorDia,
            'ventas_por_departamento' => $porDepartamento,
        ]);
    }

    // Exporta archivo Excel (.xls) con celdas coloreadas (Verde = Sobrante, Rojo = Faltante, Amarillo = Exacto)
    public function exportarCorteExcel(TurnoCaja $turno): Response
    {
        $resumen = $this->turnoCajaService->obtenerResumenTurno($turno);
        $nombreArchivo = "Corte_Caja_Turno_{$turno->id}_" . now()->format('Y-m-d') . ".xls";

        $esperado = (float) $resumen['gaveta_efectivo']['efectivo_esperado'];
        $contado = $resumen['turno']->total_efectivo_contado !== null
            ? (float) $resumen['turno']->total_efectivo_contado
            : $esperado;
        $diferencia = round($contado - $esperado, 2);

        // Regla de colores solicitada: Verde si se pasó (>0), Rojo si faltó (<0), Amarillo si está exacto (0)
        if ($diferencia > 0) {
            $bgEstado = '#d4edda';
            $colorTexto = '#155724';
            $textoEstado = 'SE PASÓ (SOBRANTE EN CAJA): +₡' . number_format($diferencia, 2);
        } elseif ($diferencia < 0) {
            $bgEstado = '#f8d7da';
            $colorTexto = '#721c24';
            $textoEstado = 'FALTÓ DINERO EN CAJA: -₡' . number_format(abs($diferencia), 2);
        } else {
            $bgEstado = '#fff3cd';
            $colorTexto = '#856404';
            $textoEstado = 'CAJA EXACTA (₡0.00 DIFERENCIA)';
        }

        $efectivoVentas = number_format((float) $resumen['desglose_pagos']['efectivo'], 2);
        $sinpeVentas = number_format((float) $resumen['desglose_pagos']['sinpe'], 2);
        $tarjetaVentas = number_format((float) $resumen['desglose_pagos']['tarjeta'], 2);
        $creditoVentas = number_format((float) $resumen['desglose_pagos']['credito'], 2);
        $totalVentas = number_format((float) $resumen['ventas_totales'], 2);

        $esperadoFmt = number_format($esperado, 2);
        $contadoFmt = $resumen['turno']->total_efectivo_contado !== null
            ? '₡' . number_format($contado, 2)
            : 'Turno aún abierto (Usando esperado: ₡' . $esperadoFmt . ')';

        $cajero = e($resumen['turno']->usuario->nombre ?? 'Cajero');
        $fecha = now()->format('d/m/Y H:i');

        $html = <<<HTML
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <style>
                table { border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 13px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 14px; }
                .titulo { background-color: #4a3525; color: #ffffff; font-weight: bold; font-size: 15px; text-align: center; }
                .subtitulo { background-color: #f3ede2; color: #3b2818; font-weight: bold; }
                .monto { text-align: right; font-weight: bold; }
                .total-general { background-color: #e2e8f0; font-weight: bold; font-size: 14px; }
            </style>
        </head>
        <body>
            <table>
                <tr>
                    <td colspan="2" class="titulo">REPORTE DE CORTE DE CAJA - PANPOS</td>
                </tr>
                <tr>
                    <td><strong>Turno #</strong> {$turno->id} ({$cajero})</td>
                    <td><strong>Fecha:</strong> {$fecha}</td>
                </tr>
                <tr><td colspan="2"></td></tr>

                <tr>
                    <td colspan="2" class="subtitulo">1. DINERO EN CAJA Y ARQUEO</td>
                </tr>
                <tr>
                    <td>Dinero Esperado en Caja (Efectivo):</td>
                    <td class="monto">₡{$esperadoFmt}</td>
                </tr>
                <tr>
                    <td>Dinero Físico en Caja (Contado):</td>
                    <td class="monto">{$contadoFmt}</td>
                </tr>
                <tr>
                    <td style="font-weight:bold;">Resultado del Arqueo:</td>
                    <td style="background-color: {$bgEstado}; color: {$colorTexto}; font-weight: bold; text-align: right;">
                        {$textoEstado}
                    </td>
                </tr>
                <tr><td colspan="2"></td></tr>

                <tr>
                    <td colspan="2" class="subtitulo">2. VENTAS TOTALES POR MÉTODO DE PAGO</td>
                </tr>
                <tr>
                    <td>Ventas en Efectivo:</td>
                    <td class="monto">₡{$efectivoVentas}</td>
                </tr>
                <tr>
                    <td>Ventas por SINPE Móvil:</td>
                    <td class="monto">₡{$sinpeVentas}</td>
                </tr>
                <tr>
                    <td>Ventas con Tarjeta:</td>
                    <td class="monto">₡{$tarjetaVentas}</td>
                </tr>
                <tr>
                    <td>Ventas a Crédito (Fiados):</td>
                    <td class="monto">₡{$creditoVentas}</td>
                </tr>
                <tr class="total-general">
                    <td>GRAN TOTAL DE VENTAS (TODOS LOS MÉTODOS):</td>
                    <td class="monto">₡{$totalVentas}</td>
                </tr>
            </table>
        </body>
        </html>
        HTML;

        return response($html, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$nombreArchivo}\"",
        ]);
    }

    public function ejecutarBackupManual(): JsonResponse
    {
        return response()->json($this->backupService->generarRespaldo('manual'));
    }
}
