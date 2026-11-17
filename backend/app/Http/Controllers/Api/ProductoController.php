<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MovimientoInventario;
use App\Models\Producto;
use App\Services\InventarioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductoController extends Controller
{
    public function __construct(private InventarioService $inventarioService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Producto::with('departamento')->orderBy('nombre');

        if ($request->boolean('solo_activos')) {
            $query->where('activo', true);
        }

        if ($request->boolean('bajo_stock')) {
            $query->where('controlar_stock', true)
                  ->whereColumn('stock_actual', '<=', 'stock_minimo');
        }

        return response()->json($query->get());
    }

    public function sugerirCodigoCorto(): JsonResponse
    {
        return response()->json([
            'codigo_sugerido' => Producto::siguienteCodigoCortoDisponible(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'departamento_id' => 'required|exists:departamentos,id',
            'codigo_barras' => 'required|string|max:50|unique:productos,codigo_barras',
            'nombre' => 'required|string|max:150',
            'precio_compra' => 'required|numeric|min:0',
            'precio_venta' => 'required|numeric|min:0',
            'controlar_stock' => 'required|boolean',
            'stock_actual' => 'nullable|integer',
            'stock_minimo' => 'nullable|integer|min:0',
            'mostrar_boton_rapido' => 'boolean',
            'usuario_id' => 'nullable|exists:usuarios,id',
        ]);

        $stockInicial = (int) ($datos['stock_actual'] ?? 0);
        $datos['stock_actual'] = 0;

        $producto = Producto::create($datos);

        if ($producto->controlar_stock && $stockInicial > 0) {
            $producto = $this->inventarioService->registrarMovimiento(
                $producto,
                $datos['usuario_id'] ?? 1,
                'entrada',
                $stockInicial,
                'Inventario inicial al crear producto'
            );
        }

        return response()->json($producto->load('departamento'), 201);
    }

    public function update(Request $request, Producto $producto): JsonResponse
    {
        $datos = $request->validate([
            'departamento_id' => 'sometimes|exists:departamentos,id',
            'codigo_barras' => 'sometimes|string|max:50|unique:productos,codigo_barras,' . $producto->id,
            'nombre' => 'sometimes|string|max:150',
            'precio_compra' => 'sometimes|numeric|min:0',
            'precio_venta' => 'sometimes|numeric|min:0',
            'controlar_stock' => 'sometimes|boolean',
            'stock_minimo' => 'sometimes|integer|min:0',
            'mostrar_boton_rapido' => 'sometimes|boolean',
            'activo' => 'sometimes|boolean',
        ]);

        $producto->update($datos);
        return response()->json($producto->load('departamento'));
    }

    public function ajustarStock(Request $request, Producto $producto): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => 'required|exists:usuarios,id',
            'tipo' => 'required|in:entrada,ajuste,merma',
            'cantidad' => 'required|integer|not_in:0',
            'motivo' => 'nullable|string|max:255',
        ]);

        $actualizado = $this->inventarioService->registrarMovimiento(
            $producto,
            $datos['usuario_id'],
            $datos['tipo'],
            $datos['cantidad'],
            $datos['motivo'] ?? null
        );

        return response()->json($actualizado);
    }

    public function historialMovimientos(): JsonResponse
    {
        $movimientos = MovimientoInventario::with(['producto:id,codigo_barras,nombre', 'usuario:id,nombre'])
            ->latest('created_at')
            ->limit(200)
            ->get();

        return response()->json($movimientos);
    }
}
