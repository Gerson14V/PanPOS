<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Venta;
use App\Services\VentaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VentaController extends Controller
{
    public function __construct(private VentaService $ventaService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Venta::with(['detalles', 'pagos', 'cliente:id,nombre', 'usuario:id,nombre', 'anuladaPor:id,nombre'])
            ->latest();

        if ($request->filled('turno_id')) {
            $query->where('turno_id', $request->integer('turno_id'));
        }

        if ($request->filled('estado')) {
            $query->where('estado', $request->string('estado'));
        }

        return response()->json($query->limit(250)->get());
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'venta_en_espera_id' => 'nullable|exists:ventas,id',
            'turno_id' => 'required|exists:turnos_caja,id',
            'cliente_id' => 'nullable|exists:clientes,id',
            'estado' => 'nullable|in:completada,en_espera',
            'items' => 'required|array|min:1',
            'items.*.producto_id' => 'nullable|exists:productos,id',
            'items.*.descripcion_producto' => 'nullable|string|max:150',
            'items.*.cantidad' => 'required|integer|min:1',
            'items.*.precio_unitario' => 'required|numeric|min:0',
            'pagos' => 'required_if:estado,completada|array',
            'pagos.*.metodo_pago' => 'required|in:efectivo,tarjeta,sinpe,credito',
            'pagos.*.monto' => 'required|numeric|min:0.01',
            'pagos.*.monto_recibido' => 'nullable|numeric|min:0',
            'pagos.*.vuelto_entregado' => 'nullable|numeric|min:0',
        ]);

        $datos['usuario_id'] = $request->user()->id;
        $venta = $this->ventaService->procesarVenta($datos);
        return response()->json($venta, 201);
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

        return response()->json($anulada);
    }
}
