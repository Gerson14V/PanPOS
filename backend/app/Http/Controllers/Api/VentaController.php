<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Producto;
use App\Models\Venta;
use App\Services\VentaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VentaController extends Controller
{
    public function __construct(private VentaService $ventaService) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate(['fecha' => 'nullable|date_format:Y-m-d', 'turno_id' => 'nullable|integer']);
        $query = Venta::with(['detalles', 'pagos', 'cliente:id,nombre', 'usuario:id,nombre', 'anuladaPor:id,nombre'])
            ->latest();

        // Ventas de un día calendario (aunque el turno venga abierto de días anteriores)
        if ($request->filled('fecha')) {
            $dia = $request->date('fecha');
            $query->whereBetween('created_at', [$dia->copy()->startOfDay(), $dia->copy()->endOfDay()]);
        }

        if ($request->filled('turno_id')) {
            $query->where('turno_id', $request->integer('turno_id'));
        }

        if ($request->filled('estado')) {
            $query->where('estado', $request->string('estado'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $request->merge([
            'estado' => $request->input('estado') ?: 'completada',
        ]);

        $datos = $request->validate([
            'idempotency_key' => 'nullable|string|max:80',
            'venta_en_espera_id' => 'nullable|exists:ventas,id',
            'turno_id' => 'required|exists:turnos_caja,id',
            'cliente_id' => 'nullable|exists:clientes,id',
            'estado' => 'required|in:completada,en_espera',
            'items' => 'required|array|min:1',
            'items.*.producto_id' => 'nullable|exists:productos,id',
            'items.*.descripcion_producto' => 'nullable|string|max:150',
            'items.*.cantidad' => 'required|integer|min:1',
            'items.*.precio_unitario' => 'required_without:items.*.producto_id|nullable|numeric|min:0',
            'pagos' => 'required_if:estado,completada|array',
            'pagos.*.metodo_pago' => 'required|in:efectivo,tarjeta,sinpe,credito',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.monto_recibido' => 'nullable|numeric|min:0',
            'pagos.*.vuelto_entregado' => 'nullable|numeric|min:0',
        ]);

        $datos['usuario_id'] = $request->user()->id;

        $venta = $this->ventaService->procesarVenta($datos);

        return response()->json($this->conStockActualizado($venta), 201);
    }

    public function anular(Request $request, Venta $venta): JsonResponse
    {
        $datos = $request->validate([
            'motivo_anulacion' => 'required|string|max:255',
        ]);

        $anulada = $this->ventaService->anularVenta(
            $venta,
            (int) $request->user()->id,
            $datos['motivo_anulacion']
        );

        return response()->json($this->conStockActualizado($anulada));
    }

    /**
     * Agrega a la respuesta la existencia actual de los productos de la venta.
     * Así la caja actualiza su catálogo local sin volver a descargar todos los
     * productos, clientes y configuración después de cada cobro.
     */
    private function conStockActualizado(Venta $venta): array
    {
        $venta->loadMissing('detalles');
        $ids = $venta->detalles->pluck('producto_id')->filter()->unique()->values();

        $productos = $ids->isEmpty()
            ? collect()
            : Producto::whereIn('id', $ids)->get(['id', 'stock_actual'])
                ->map(fn ($p) => ['id' => $p->id, 'stock_actual' => (int) $p->stock_actual])
                ->values();

        return array_merge($venta->toArray(), ['productos_actualizados' => $productos]);
    }
}
