<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TurnoCaja;
use App\Services\BackupService;
use App\Services\TurnoCajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TurnoCajaController extends Controller
{
    public function __construct(
        private TurnoCajaService $turnoCajaService,
        private BackupService $backupService
    ) {}

    public function turnoActivo(): JsonResponse
    {
        $turno = TurnoCaja::with('usuario:id,nombre,username,rol')
            ->where('estado', 'abierto')
            ->first();

        return response()->json(['turno_activo' => $turno]);
    }

    public function abrir(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => 'required|exists:usuarios,id',
            'monto_inicial' => 'required|numeric|min:0',
        ]);

        $turno = $this->turnoCajaService->abrirTurno($datos['usuario_id'], (float) $datos['monto_inicial']);
        return response()->json($turno->load('usuario:id,nombre'), 201);
    }

    public function registrarMovimiento(Request $request, TurnoCaja $turno): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => 'required|exists:usuarios,id',
            'tipo' => 'required|in:entrada,salida',
            'metodo_pago' => 'nullable|in:efectivo,tarjeta,sinpe',
            'monto' => 'required|numeric|min:1',
            'concepto' => 'required|string|max:255',
        ]);

        $datos['turno_id'] = $turno->id;
        $movimiento = $this->turnoCajaService->registrarMovimientoCaja($datos);

        return response()->json($movimiento, 201);
    }

    public function resumen(TurnoCaja $turno): JsonResponse
    {
        return response()->json($this->turnoCajaService->obtenerResumenTurno($turno));
    }

    public function cerrar(Request $request, TurnoCaja $turno): JsonResponse
    {
        $datos = $request->validate([
            'total_efectivo_contado' => 'required|numeric|min:0',
            'observaciones' => 'nullable|string|max:500',
        ]);

        $cerrado = $this->turnoCajaService->cerrarTurno(
            $turno,
            (float) $datos['total_efectivo_contado'],
            $datos['observaciones'] ?? null
        );

        // Disparo automático de respaldo local y USB al cerrar turno
        $respaldo = $this->backupService->generarRespaldo("turno_{$turno->id}");

        return response()->json([
            'turno' => $cerrado,
            'respaldo' => $respaldo,
        ]);
    }
}
