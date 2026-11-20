<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Departamento;
use App\Models\TurnoCaja;
use App\Models\Venta;
use App\Services\BackupService;
use App\Services\ReporteExcelDiarioService;
use App\Services\TurnoCajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ReporteBackupController extends Controller
{
    public function __construct(
        private TurnoCajaService $turnoCajaService,
        private BackupService $backupService,
        private ReporteExcelDiarioService $reporteExcelDiarioService
    ) {}

    public function ventasPorPeriodo(Request $request): JsonResponse
    {
        $desde = $request->date('desde') ? $request->date('desde')->startOfDay() : now()->startOfDay();
        $hasta = $request->date('hasta') ? $request->date('hasta')->endOfDay() : now()->endOfDay();

        if ($desde->gt($hasta)) {
            [$desde, $hasta] = [$hasta->copy()->startOfDay(), $desde->copy()->endOfDay()];
        }

        $resumenVentas = DB::table('ventas')
            ->where('estado', 'completada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->selectRaw('COUNT(id) as numero_ventas, COALESCE(SUM(total), 0) as total_ventas')
            ->first();

        $totalVentas = (float) ($resumenVentas->total_ventas ?? 0);
        $numeroVentas = (int) ($resumenVentas->numero_ventas ?? 0);

        $pagosPorMetodo = DB::table('pagos_venta')
            ->join('ventas', 'pagos_venta.venta_id', '=', 'ventas.id')
            ->where('ventas.estado', 'completada')
            ->whereBetween('ventas.created_at', [$desde, $hasta])
            ->selectRaw('pagos_venta.metodo_pago, SUM(pagos_venta.monto) as total')
            ->groupBy('pagos_venta.metodo_pago')
            ->pluck('total', 'metodo_pago');

        $porDepartamento = DB::table('detalle_ventas')
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->leftJoin('productos', 'detalle_ventas.producto_id', '=', 'productos.id')
            ->leftJoin('departamentos', 'productos.departamento_id', '=', 'departamentos.id')
            ->where('ventas.estado', 'completada')
            ->whereBetween('ventas.created_at', [$desde, $hasta])
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

        $ventasPorProducto = DB::table('detalle_ventas')
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->where('ventas.estado', 'completada')
            ->whereBetween('ventas.created_at', [$desde, $hasta])
            ->whereNotNull('detalle_ventas.producto_id')
            ->selectRaw("
                detalle_ventas.producto_id,
                SUM(detalle_ventas.cantidad) as unidades_vendidas,
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico) as costo_total,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia
            ")
            ->groupBy('detalle_ventas.producto_id')
            ->get()
            ->keyBy('producto_id');

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

        $articulosComunes = DB::table('detalle_ventas')
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->where('ventas.estado', 'completada')
            ->whereBetween('ventas.created_at', [$desde, $hasta])
            ->whereNull('detalle_ventas.producto_id')
            ->selectRaw("
                detalle_ventas.descripcion_producto as nombre,
                SUM(detalle_ventas.cantidad) as unidades_vendidas,
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico) as costo_total,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia
            ")
            ->groupBy('detalle_ventas.descripcion_producto')
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
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->where('ventas.estado', 'completada')
            ->whereBetween('ventas.created_at', [$desde, $hasta])
            ->selectRaw("
                detalle_ventas.descripcion_producto as producto,
                SUM(detalle_ventas.cantidad) as unidades,
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia
            ")
            ->groupBy('detalle_ventas.descripcion_producto')
            ->orderByDesc('unidades')
            ->limit(10)
            ->get();

        $ventasPorDia = DB::table('ventas')
            ->where('estado', 'completada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->selectRaw("DATE(created_at) as fecha, SUM(total) as total_ventas, COUNT(id) as cantidad")
            ->groupBy('fecha')
            ->orderBy('fecha')
            ->get();

        $ventasPorHora = DB::table('ventas')
            ->where('estado', 'completada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->selectRaw("strftime('%H', created_at) as hora, SUM(total) as total_ventas, COUNT(id) as cantidad")
            ->groupBy('hora')
            ->orderBy('hora')
            ->get();

        $anulaciones = DB::table('ventas')
            ->where('estado', 'anulada')
            ->whereBetween('created_at', [$desde, $hasta])
            ->selectRaw('COUNT(id) as cantidad, COALESCE(SUM(total), 0) as monto')
            ->first();

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
                'cantidad' => (int) ($anulaciones->cantidad ?? 0),
                'monto' => round((float) ($anulaciones->monto ?? 0), 2),
            ],
        ]);
    }

    public function exportarExcelDiario(): Response
    {
        $excel = $this->reporteExcelDiarioService->actualizarArchivoMaestro();

        return response($excel['html'], 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$excel['archivo']}\"",
        ]);
    }

    public function exportarCorteExcel(TurnoCaja $turno): Response
    {
        $excel = $this->reporteExcelDiarioService->actualizarArchivoMaestro();

        return response($excel['html'], 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$excel['archivo']}\"",
        ]);
    }

    public function ejecutarBackupManual(): JsonResponse
    {
        return response()->json($this->backupService->generarRespaldo('manual'));
    }
}
