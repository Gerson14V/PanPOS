<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TurnoCaja;
use App\Services\BackupService;
use App\Services\ReporteExcelDiarioService;
use App\Services\TurnoCajaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TurnoCajaController extends Controller
{
    public function __construct(
        private TurnoCajaService $turnoCajaService,
        private BackupService $backupService,
        private ReporteExcelDiarioService $reporteExcelDiarioService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TurnoCaja::with('usuario:id,nombre')
            ->orderByDesc('fecha_apertura');

        if ($request->filled('fecha')) {
            $query->whereDate('fecha_apertura', $request->string('fecha'));
        }

        return response()->json($query->limit(90)->get());
    }

    public function turnoActivo(): JsonResponse
    {
        $turno = TurnoCaja::with('usuario:id,nombre')
            ->where('estado', 'abierto')
            ->latest('fecha_apertura')
            ->first();

        return response()->json(['turno_activo' => $turno]);
    }

    public function abrir(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => 'required|exists:usuarios,id',
            'monto_inicial' => 'required|numeric|min:0',
        ]);

        $turno = $this->turnoCajaService->abrirTurno(
            $datos['usuario_id'],
            (float) $datos['monto_inicial']
        );

        return response()->json($turno->load('usuario:id,nombre'), 201);
    }

    public function resumen(TurnoCaja $turno): JsonResponse
    {
        return response()->json($this->turnoCajaService->obtenerResumenTurno($turno));
    }

    public function registrarMovimiento(Request $request, TurnoCaja $turno): JsonResponse
    {
        $datos = $request->validate([
            'usuario_id' => 'required|exists:usuarios,id',
            'cliente_id' => 'nullable|exists:clientes,id',
            'tipo' => 'required|in:entrada,salida,prestamo_cliente,abono_cliente',
            'metodo_pago' => 'required|in:efectivo,tarjeta,sinpe',
            'monto' => 'required|numeric|min:1',
            'concepto' => 'required|string|max:255',
        ]);

        $datos['turno_id'] = $turno->id;
        $movimiento = $this->turnoCajaService->registrarMovimientoCaja($datos);

        return response()->json($movimiento, 201);
    }

    public function cerrar(Request $request, TurnoCaja $turno): JsonResponse
    {
        $datos = $request->validate([
            'total_efectivo_contado' => 'required|numeric|min:0',
            'observaciones' => 'nullable|string|max:500',
        ]);

        $turnoCerrado = $this->turnoCajaService->cerrarTurno(
            $turno,
            (float) $datos['total_efectivo_contado'],
            $datos['observaciones'] ?? null
        );

        $respaldo = $this->backupService->generarRespaldo('cierre_turno');
        $excel = $this->reporteExcelDiarioService->actualizarArchivoMaestro();

        return response()->json([
            'turno' => $turnoCerrado,
            'respaldo' => $respaldo,
            'excel_diario' => [
                'guardado' => $excel['guardado'],
                'ruta' => $excel['ruta'],
            ],
        ]);
    }
}
