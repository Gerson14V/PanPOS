<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MovimientoInventario;
use App\Models\Producto;
use App\Services\InventarioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductoController extends Controller
{
    public function __construct(private InventarioService $inventarioService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Producto::with('departamento')->where('activo', true);

        if ($request->boolean('bajo_stock')) {
            $query->where('controlar_stock', true)
                  ->where('stock_actual', '<=', 0);
        }

        return response()->json($query->orderBy('nombre')->get());
    }

    public function sugerirCodigoCorto(): JsonResponse
    {
        return response()->json([
            'codigo_sugerido' => $this->inventarioService->sugerirCodigoCorto(),
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
            'stock_actual' => 'nullable|integer|min:0',
            'stock_minimo' => 'nullable|integer|min:0',
            'mostrar_boton_rapido' => 'boolean',
            'usuario_id' => 'nullable|exists:usuarios,id',
        ]);

        $producto = DB::transaction(function () use ($datos) {
            $stockInicial = max(0, (int) ($datos['stock_actual'] ?? 0));
            $usuarioId = $datos['usuario_id'] ?? null;
            unset($datos['usuario_id']);

            $datos['stock_minimo'] = 0;
            $datos['stock_actual'] = ($datos['controlar_stock'] && $stockInicial > 0 && empty($usuarioId))
                ? $stockInicial
                : 0;

            $nuevo = Producto::create($datos);

            if ($nuevo->controlar_stock && $stockInicial > 0 && !empty($usuarioId)) {
                $this->inventarioService->registrarMovimiento(
                    $nuevo,
                    (int) $usuarioId,
                    'entrada',
                    $stockInicial,
                    'Inventario inicial al crear producto'
                );
            }

            return $nuevo->fresh('departamento');
        });

        return response()->json($producto, 201);
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

    public function destroy(Producto $producto): JsonResponse
    {
        $tieneVentas = DB::table('detalle_ventas')->where('producto_id', $producto->id)->exists();

        if ($tieneVentas) {
            $producto->update([
                'activo' => false,
                'mostrar_boton_rapido' => false,
                'codigo_barras' => $producto->codigo_barras . '_DEL_' . time(),
            ]);
        } else {
            $producto->movimientosInventario()->delete();
            $producto->delete();
        }

        return response()->json(['mensaje' => 'Producto eliminado correctamente.']);
    }

    public function ajustarStock(Request $request, Producto $producto): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => 'required|exists:usuarios,id',
            'tipo' => 'required|in:entrada,ajuste,merma',
            'cantidad' => 'required|integer|not_in:0',
            'motivo' => 'nullable|string|max:255',
        ]);

        $productoActualizado = $this->inventarioService->registrarMovimiento(
            $producto,
            (int) $datos['usuario_id'],
            $datos['tipo'],
            (int) $datos['cantidad'],
            $datos['motivo'] ?? null
        );

        return response()->json([
            'producto' => $productoActualizado,
        ]);
    }

    public function historialMovimientos(): JsonResponse
    {
        $movimientos = MovimientoInventario::with(['producto:id,nombre,codigo_barras', 'usuario:id,nombre'])
            ->latest('created_at')
            ->limit(200)
            ->get();

        return response()->json($movimientos);
    }
}
