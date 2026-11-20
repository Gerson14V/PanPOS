<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Departamento;
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

        $pagosPorMetodo = DB::table('pagos_venta')
            ->whereIn('venta_id', $ventasIds)
            ->selectRaw('metodo_pago, SUM(monto) as total')
            ->groupBy('metodo_pago')
            ->pluck('total', 'metodo_pago');

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
            ->orderByDesc('unidades_vendidas')
            ->get();

        // Ventas agrupadas por producto_id en el período
        $ventasPorProducto = DB::table('detalle_ventas')
            ->whereIn('venta_id', $ventasIds)
            ->whereNotNull('producto_id')
            ->selectRaw("
                producto_id,
                SUM(cantidad) as unidades_vendidas,
                SUM(subtotal) as total_ventas,
                SUM(cantidad * costo_unitario_historico) as costo_total,
                SUM(subtotal - (cantidad * costo_unitario_historico)) as ganancia
            ")
            ->groupBy('producto_id')
            ->get()
            ->keyBy('producto_id');

        // Construir ranking completo por proveedor con TODOS los productos activos de cada uno
        $departamentosActivos = Departamento::where('activo', true)
            ->with(['productos' => function ($q) {
                $q->where('activo', true)->orderBy('nombre');
            }])
            ->orderBy('nombre')
            ->get();

        $rankingProveedores = $departamentosActivos->map(function ($dep) use ($ventasPorProducto) {
            $productosDetalle = $dep->productos->map(function ($prod) use ($ventasPorProducto) {
                $venta = $ventasPorProducto->get($prod->id);
                return [
                    'id' => $prod->id,
                    'codigo_barras' => $prod->codigo_barras,
                    'nombre' => $prod->nombre,
                    'precio_venta' => (float) $prod->precio_venta,
                    'unidades_vendidas' => (int) ($venta->unidades_vendidas ?? 0),
                    'total_ventas' => round((float) ($venta->total_ventas ?? 0), 2),
                    'costo_total' => round((float) ($venta->costo_total ?? 0), 2),
                    'ganancia' => round((float) ($venta->ganancia ?? 0), 2),
                ];
            })->sortBy([
                ['unidades_vendidas', 'desc'],
                ['total_ventas', 'desc'],
                ['nombre', 'asc'],
            ])->values();

            return [
                'id' => $dep->id,
                'departamento' => $dep->nombre,
                'total_productos_catalogo' => $productosDetalle->count(),
                'unidades_vendidas' => (int) $productosDetalle->sum('unidades_vendidas'),
                'total_ventas' => round((float) $productosDetalle->sum('total_ventas'), 2),
                'costo_total' => round((float) $productosDetalle->sum('costo_total'), 2),
                'ganancia' => round((float) $productosDetalle->sum('ganancia'), 2),
                'productos' => $productosDetalle,
            ];
        })->sortBy([
            ['unidades_vendidas', 'desc'],
            ['total_ventas', 'desc'],
            ['departamento', 'asc'],
        ])->values();

        // Incluir artículos comunes si hubo ventas sin producto asociado
        $articulosComunes = DB::table('detalle_ventas')
            ->whereIn('venta_id', $ventasIds)
            ->whereNull('producto_id')
            ->selectRaw("
                descripcion_producto as nombre,
                SUM(cantidad) as unidades_vendidas,
                SUM(subtotal) as total_ventas,
                SUM(cantidad * costo_unitario_historico) as costo_total,
                SUM(subtotal - (cantidad * costo_unitario_historico)) as ganancia
            ")
            ->groupBy('descripcion_producto')
            ->orderByDesc('unidades_vendidas')
            ->get();

        if ($articulosComunes->count() > 0) {
            $rankingProveedores->push([
                'id' => 0,
                'departamento' => 'Artículo Común (Sin Código)',
                'total_productos_catalogo' => $articulosComunes->count(),
                'unidades_vendidas' => (int) $articulosComunes->sum('unidades_vendidas'),
                'total_ventas' => round((float) $articulosComunes->sum('total_ventas'), 2),
                'costo_total' => round((float) $articulosComunes->sum('costo_total'), 2),
                'ganancia' => round((float) $articulosComunes->sum('ganancia'), 2),
                'productos' => $articulosComunes->map(fn ($c, $i) => [
                    'id' => -($i + 1),
                    'codigo_barras' => 'COMUN',
                    'nombre' => $c->nombre,
                    'precio_venta' => 0,
                    'unidades_vendidas' => (int) $c->unidades_vendidas,
                    'total_ventas' => round((float) $c->total_ventas, 2),
                    'costo_total' => round((float) $c->costo_total, 2),
                    'ganancia' => round((float) $c->ganancia, 2),
                ])->values(),
            ]);
            $rankingProveedores = $rankingProveedores->sortBy([
                ['unidades_vendidas', 'desc'],
                ['total_ventas', 'desc'],
            ])->values();
        }

        $topProductos = DB::table('detalle_ventas')
            ->whereIn('venta_id', $ventasIds)
            ->selectRaw("
                descripcion_producto as producto,
                SUM(cantidad) as unidades,
                SUM(subtotal) as total_ventas,
                SUM(subtotal - (cantidad * costo_unitario_historico)) as ganancia
            ")
            ->groupBy('descripcion_producto')
            ->orderByDesc('unidades')
            ->limit(10)
            ->get();

        $ventasPorDia = DB::table('ventas')
            ->whereIn('id', $ventasIds)
            ->selectRaw("DATE(created_at) as fecha, SUM(total) as total_ventas, COUNT(id) as cantidad")
            ->groupBy('fecha')
            ->orderBy('fecha')
            ->get();

        $ventasPorHora = DB::table('ventas')
            ->whereIn('id', $ventasIds)
            ->selectRaw("strftime('%H', created_at) as hora, SUM(total) as total_ventas, COUNT(id) as cantidad")
            ->groupBy('hora')
            ->orderBy('hora')
            ->get();

        $anulacionesCount = Venta::where('estado', 'anulada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->count();

        $anulacionesMonto = (float) Venta::where('estado', 'anulada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->sum('total');

        return response()->json([
            'desde' => $desde->toDateString(),
            'hasta' => $hasta->toDateString(),
            'ventas_totales' => round($totalVentas, 2),
            'numero_ventas' => $numeroVentas,
            'venta_promedio' => $numeroVentas > 0 ? round($totalVentas / $numeroVentas, 2) : 0,
            'ganancia_total' => round((float) $porDepartamento->sum('ganancia'), 2),
            'desglose_pagos' => [
                'efectivo' => (float) ($pagosPorMetodo['efectivo'] ?? 0),
                'sinpe' => (float) ($pagosPorMetodo['sinpe'] ?? 0),
                'tarjeta' => (float) ($pagosPorMetodo['tarjeta'] ?? 0),
                'credito' => (float) ($pagosPorMetodo['credito'] ?? 0),
            ],
            'ventas_por_dia' => $ventasPorDia,
            'ventas_por_hora' => $ventasPorHora,
            'ventas_por_departamento' => $porDepartamento,
            'ranking_proveedores' => $rankingProveedores,
            'top_productos' => $topProductos,
            'anulaciones' => [
                'cantidad' => $anulacionesCount,
                'monto' => round($anulacionesMonto, 2),
            ],
        ]);
    }

    public function exportarCorteExcel(TurnoCaja $turno): Response
    {
        $resumen = $this->turnoCajaService->obtenerResumenTurno($turno);
        $nombreArchivo = "Corte_Caja_Turno_{$turno->id}_" . now()->format('Y-m-d') . ".xls";

        $esperado = (float) $resumen['gaveta_efectivo']['efectivo_esperado'];
        $contado = $resumen['turno']->total_efectivo_contado !== null
            ? (float) $resumen['turno']->total_efectivo_contado
            : $esperado;
        $diferencia = round($contado - $esperado, 2);

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
        $fecha = $resumen['turno']->fecha_apertura
            ? \Carbon\Carbon::parse($resumen['turno']->fecha_apertura)->format('d/m/Y H:i')
            : now()->format('d/m/Y H:i');

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
                    <td><strong>Fecha Apertura:</strong> {$fecha}</td>
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
