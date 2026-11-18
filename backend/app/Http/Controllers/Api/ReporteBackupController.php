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
use Symfony\Component\HttpFoundation\StreamedResponse;

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

    public function exportarCorteExcel(TurnoCaja $turno): StreamedResponse
    {
        $resumen = $this->turnoCajaService->obtenerResumenTurno($turno);
        $nombreArchivo = "Corte_Turno_{$turno->id}_" . now()->format('Y-m-d') . ".csv";

        return response()->streamDownload(function () use ($resumen) {
            $out = fopen('php://output', 'w');
            fprintf($out, chr(0xEF) . chr(0xBB) . chr(0xBF));

            fputcsv($out, ['REPORTE DE CIERRE DE CAJA - PANPOS']);
            fputcsv($out, ['Turno ID', $resumen['turno']->id, 'Cajero', $resumen['turno']->usuario->nombre ?? '']);
            fputcsv($out, ['Apertura', $resumen['turno']->fecha_apertura, 'Cierre', $resumen['turno']->fecha_cierre ?? 'En curso']);
            fputcsv($out, []);

            fputcsv($out, ['VENTAS POR MÉTODO DE PAGO Y TOTAL']);
            fputcsv($out, ['Efectivo', $resumen['desglose_pagos']['efectivo']]);
            fputcsv($out, ['SINPE Móvil', $resumen['desglose_pagos']['sinpe']]);
            fputcsv($out, ['Tarjeta', $resumen['desglose_pagos']['tarjeta']]);
            fputcsv($out, ['Crédito (Fiado)', $resumen['desglose_pagos']['credito']]);
            fputcsv($out, ['TOTAL DE VENTAS SUMADO', $resumen['ventas_totales']]);
            fputcsv($out, ['GANANCIA BRUTA TOTAL', $resumen['ganancia_bruta_total']]);
            fputcsv($out, []);

            fputcsv($out, ['ARQUEO DE GAVETA (EFECTIVO)']);
            fputcsv($out, ['Fondo Inicial', $resumen['gaveta_efectivo']['monto_inicial']]);
            fputcsv($out, ['+ Ventas en Efectivo', $resumen['gaveta_efectivo']['ventas_efectivo']]);
            fputcsv($out, ['+ Abonos en Efectivo', $resumen['gaveta_efectivo']['abonos_efectivo']]);
            fputcsv($out, ['+ Entradas de Caja (F7)', $resumen['gaveta_efectivo']['entradas_efectivo']]);
            fputcsv($out, ['- Salidas de Caja (F8)', $resumen['gaveta_efectivo']['salidas_efectivo']]);
            fputcsv($out, ['- Préstamos a Clientes', $resumen['gaveta_efectivo']['prestamos_efectivo']]);
            fputcsv($out, ['= Efectivo Esperado en Caja', $resumen['gaveta_efectivo']['efectivo_esperado']]);
            fputcsv($out, ['Efectivo Contado Físico', $resumen['turno']->total_efectivo_contado ?? 'Pendiente']);
            fputcsv($out, ['Diferencia (Sobrante/Faltante)', $resumen['turno']->diferencia_arqueo ?? 0]);
            fputcsv($out, []);

            fputcsv($out, ['MOVIMIENTOS DE CAJA DEL DÍA (ENTRADAS, SALIDAS, PRÉSTAMOS Y ABONOS)']);
            fputcsv($out, ['Hora', 'Tipo', 'Método', 'Cliente', 'Concepto', 'Monto']);
            foreach ($resumen['movimientos_caja'] as $m) {
                fputcsv($out, [
                    $m->created_at,
                    strtoupper($m->tipo),
                    strtoupper($m->metodo_pago),
                    $m->cliente->nombre ?? '-',
                    $m->concepto,
                    $m->monto,
                ]);
            }
            fclose($out);
        }, $nombreArchivo, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function ejecutarBackupManual(): JsonResponse
    {
        return response()->json($this->backupService->generarRespaldo('manual'));
    }
}
