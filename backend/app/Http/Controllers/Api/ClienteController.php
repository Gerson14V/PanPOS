<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Services\TurnoCajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ClienteController extends Controller
{
    public function __construct(private TurnoCajaService $turnoCajaService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Cliente::where('activo', true)->orderBy('nombre');

        if ($request->boolean('con_deuda')) {
            $query->where('saldo_deudor', '>', 0);
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => 'required|string|max:150',
            'telefono' => 'nullable|string|max:30',
            'notas' => 'nullable|string|max:500',
        ]);

        $cliente = Cliente::create($datos);
        return response()->json($cliente, 201);
    }

    public function update(Request $request, Cliente $cliente): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => 'sometimes|string|max:150',
            'telefono' => 'nullable|string|max:30',
            'notas' => 'nullable|string|max:500',
            'activo' => 'sometimes|boolean',
        ]);

        $cliente->update($datos);
        return response()->json($cliente);
    }

    public function destroy(Cliente $cliente): JsonResponse
    {
        if ((float) $cliente->saldo_deudor > 0) {
            throw ValidationException::withMessages([
                'cliente' => "No se puede eliminar a {$cliente->nombre} porque tiene una deuda pendiente de ₡" . number_format((float) $cliente->saldo_deudor, 2) . ". Debe saldar su cuenta primero.",
            ]);
        }

        $tieneHistorial = $cliente->ventas()->exists() || $cliente->movimientosCaja()->exists();

        if ($tieneHistorial) {
            $cliente->update(['activo' => false]);
        } else {
            $cliente->delete();
        }

        return response()->json(['mensaje' => 'Cliente eliminado correctamente.']);
    }

    public function estadoCuenta(Cliente $cliente): JsonResponse
    {
        $ventasFiadas = $cliente->ventas()
            ->with(['detalles', 'pagos', 'usuario:id,nombre'])
            ->where('estado', 'completada')
            ->whereHas('pagos', fn ($q) => $q->where('metodo_pago', 'credito'))
            ->latest()
            ->get();

        $movimientos = $cliente->movimientosCaja()
            ->with('usuario:id,nombre')
            ->latest('created_at')
            ->get();

        return response()->json([
            'cliente' => $cliente,
            'ventas_fiadas' => $ventasFiadas,
            'prestamos_y_abonos' => $movimientos,
        ]);
    }

    public function registrarOperacionCredito(Request $request, Cliente $cliente): JsonResponse
    {
        $datos = $request->validate([
            'turno_id' => 'required|exists:turnos_caja,id',
            'tipo' => 'required|in:prestamo_cliente,abono_cliente',
            'metodo_pago' => 'required|in:efectivo,tarjeta,sinpe',
            'monto' => 'required|numeric|min:1',
            'concepto' => 'required|string|max:255',
            'idempotency_key' => 'nullable|string|max:80',
        ]);

        $datos['cliente_id'] = $cliente->id;
        $datos['usuario_id'] = $request->user()->id;

        $movimiento = $this->turnoCajaService->registrarMovimientoCaja($datos);

        return response()->json([
            'movimiento' => $movimiento,
            'cliente' => $cliente->fresh(),
        ], 201);
    }
}
