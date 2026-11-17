<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Services\TurnoCajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClienteController extends Controller
{
    public function __construct(private TurnoCajaService $turnoCajaService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Cliente::orderBy('nombre');

        if ($request->boolean('solo_activos')) {
            $query->where('activo', true);
        }

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

    public function estadoCuenta(Cliente $cliente): JsonResponse
    {
        $ventasFiadas = $cliente->ventas()
            ->with(['detalles', 'pagos', 'usuario:id,nombre'])
            ->where('estado', 'completada')
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
            'usuario_id' => 'required|exists:usuarios,id',
            'tipo' => 'required|in:prestamo_cliente,abono_cliente',
            'metodo_pago' => 'required|in:efectivo,tarjeta,sinpe',
            'monto' => 'required|numeric|min:1',
            'concepto' => 'required|string|max:255',
        ]);

        $datos['cliente_id'] = $cliente->id;

        $movimiento = $this->turnoCajaService->registrarMovimientoCaja($datos);

        return response()->json([
            'movimiento' => $movimiento,
            'cliente' => $cliente->fresh(),
        ], 201);
    }
}
