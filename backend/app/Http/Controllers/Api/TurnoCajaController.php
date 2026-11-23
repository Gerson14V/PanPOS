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

    public function fechasDisponibles(): JsonResponse
    {
        return response()->json($this->turnoCajaService->obtenerFechasConTurnos());
    }

    public function resumenDia(Request $request): JsonResponse
    {
        $fecha = $request->date('fecha')
            ? $request->date('fecha')->toDateString()
            : now()->toDateString();

        return response()->json($this->turnoCajaService->obtenerResumenDia($fecha));
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
            'monto_inicial' => 'required|numeric|min:0',
        ]);

        $turno = $this->turnoCajaService->abrirTurno(
            (int) $request->user()->id,
            (float) $datos['monto_inicial']
        );

        return response()->json($turno->load('usuario:id,nombre'), 201);
    }

    public function resumen(TurnoCaja $turno): JsonResponse
    {
        return response()->json($this->turnoCajaService->obtenerResumenTurno($turno));
    }

    // Consulta liviana para mostrar el efectivo en gaveta antes de una salida (F8)
    public function efectivoDisponible(TurnoCaja $turno): JsonResponse
    {
        return response()->json([
            'turno_id' => $turno->id,
            'efectivo_disponible' => $this->turnoCajaService->calcularEfectivoDisponible($turno),
        ]);
    }

    public function registrarMovimiento(Request $request, TurnoCaja $turno): JsonResponse
    {
        $datos = $request->validate([
            'cliente_id' => 'required_if:tipo,prestamo_cliente,abono_cliente|nullable|exists:clientes,id',
            'tipo' => 'required|in:entrada,salida,prestamo_cliente,abono_cliente',
            'metodo_pago' => 'required|in:efectivo,tarjeta,sinpe',
            'monto' => 'required|numeric|min:1',
            'concepto' => 'required|string|max:255',
            'idempotency_key' => 'nullable|string|max:80',
        ]);

        $datos['turno_id'] = $turno->id;
        $datos['usuario_id'] = $request->user()->id;
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

        $advertencias = [];

        try {
            $respaldo = $this->backupService->generarRespaldo('cierre_turno');
            $respaldo['guardado'] = true;
        } catch (\Throwable $e) {
            $respaldo = ['guardado' => false, 'archivo' => null, 'error' => $e->getMessage()];
            $advertencias[] = 'El turno cerró correctamente, pero no se pudo generar el respaldo SQLite.';
        }

        try {
            $excel = $this->reporteExcelDiarioService->actualizarArchivoMaestro();
            if (!$excel['guardado']) {
                $advertencias[] = 'No se pudo actualizar el Excel diario (verifique que no esté abierto en Excel).';
            }
        } catch (\Throwable $e) {
            $excel = ['guardado' => false, 'ruta' => null];
            $advertencias[] = 'No se pudo actualizar el Excel diario.';
        }

        return response()->json([
            'turno' => $turnoCerrado,
            'respaldo' => $respaldo,
            'excel_diario' => [
                'guardado' => (bool) ($excel['guardado'] ?? false),
                'ruta' => $excel['ruta'] ?? null,
            ],
            'advertencias' => $advertencias,
        ]);
    }
}
