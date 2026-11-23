<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\MovimientoCaja;
use App\Models\TurnoCaja;
use App\Models\Venta;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TurnoCajaService
{
    public function abrirTurno(int $usuarioId, float $montoInicial): TurnoCaja
    {
        return DB::transaction(function () use ($usuarioId, $montoInicial) {
            $abierto = TurnoCaja::where('estado', 'abierto')->lockForUpdate()->first();
            if ($abierto) {
                throw ValidationException::withMessages([
                    'turno' => 'Ya existe un turno abierto actualmente.',
                ]);
            }

            return TurnoCaja::create([
                'usuario_id' => $usuarioId,
                'fecha_apertura' => now(),
                'estado' => 'abierto',
                'monto_inicial' => $montoInicial,
            ]);
        });
    }

    public function calcularEfectivoDisponible(TurnoCaja $turno): float
    {
        $ventasEfectivo = (float) DB::table('pagos_venta')
            ->join('ventas', 'pagos_venta.venta_id', '=', 'ventas.id')
            ->where('ventas.turno_id', $turno->id)
            ->where('ventas.estado', 'completada')
            ->where('pagos_venta.metodo_pago', 'efectivo')
            ->sum('pagos_venta.monto');

        $movimientos = $turno->movimientosCaja()->where('metodo_pago', 'efectivo')->get();

        $entradas = (float) $movimientos->where('tipo', 'entrada')->sum('monto');
        $abonos = (float) $movimientos->where('tipo', 'abono_cliente')->sum('monto');
        $salidas = (float) $movimientos->where('tipo', 'salida')->sum('monto');
        $prestamos = (float) $movimientos->where('tipo', 'prestamo_cliente')->sum('monto');

        return round((float) $turno->monto_inicial + $ventasEfectivo + $entradas + $abonos - $salidas - $prestamos, 2);
    }

    public function registrarMovimientoCaja(array $datos): MovimientoCaja
    {
        $idempotencyKey = !empty($datos['idempotency_key']) ? trim((string) $datos['idempotency_key']) : null;

        // Reintento de una petición que ya se guardó: devolver el mismo movimiento sin duplicarlo
        if ($idempotencyKey !== null) {
            $existente = MovimientoCaja::where('idempotency_key', $idempotencyKey)->first();
            if ($existente) {
                return $existente->load(['cliente', 'usuario:id,nombre']);
            }
        }

        return DB::transaction(function () use ($datos, $idempotencyKey) {
            if ($idempotencyKey !== null) {
                $existente = MovimientoCaja::where('idempotency_key', $idempotencyKey)->first();
                if ($existente) {
                    return $existente->load(['cliente', 'usuario:id,nombre']);
                }
            }

            $turno = TurnoCaja::lockForUpdate()->findOrFail($datos['turno_id']);

            if ($turno->estado !== 'abierto') {
                throw ValidationException::withMessages([
                    'turno' => 'No se pueden registrar movimientos porque el turno de caja está cerrado.',
                ]);
            }

            $monto = round((float) $datos['monto'], 2);
            $metodoPago = $datos['metodo_pago'] ?? 'efectivo';

            if (in_array($datos['tipo'], ['prestamo_cliente', 'salida'], true) && $metodoPago === 'efectivo') {
                $efectivoEnCaja = $this->calcularEfectivoDisponible($turno);
                if ($monto > $efectivoEnCaja) {
                    throw ValidationException::withMessages([
                        'monto' => "Fondos insuficientes en caja. Efectivo disponible actual: ₡" . number_format($efectivoEnCaja, 2) . " (Intentó retirar: ₡" . number_format($monto, 2) . ").",
                    ]);
                }
            }

            if (in_array($datos['tipo'], ['prestamo_cliente', 'abono_cliente'], true) && empty($datos['cliente_id'])) {
                throw ValidationException::withMessages([
                    'cliente_id' => 'Debe seleccionar un cliente para registrar un préstamo o abono.',
                ]);
            }

            if (!empty($datos['cliente_id'])) {
                $cliente = Cliente::lockForUpdate()->findOrFail($datos['cliente_id']);
                $deudaActual = round((float) $cliente->saldo_deudor, 2);

                if ($datos['tipo'] === 'abono_cliente') {
                    if ($deudaActual <= 0) {
                        throw ValidationException::withMessages([
                            'monto' => "El cliente {$cliente->nombre} no tiene deuda pendiente por cobrar (Saldo: ₡0).",
                        ]);
                    }
                    if ($monto > $deudaActual) {
                        throw ValidationException::withMessages([
                            'monto' => "No se puede abonar más de lo que debe. Deuda actual de {$cliente->nombre}: ₡" . number_format($deudaActual, 2) . ".",
                        ]);
                    }
                    $cliente->decrement('saldo_deudor', $monto);
                } elseif ($datos['tipo'] === 'prestamo_cliente') {
                    $cliente->increment('saldo_deudor', $monto);
                }
            }

            $movimiento = MovimientoCaja::create([
                'turno_id' => $turno->id,
                'usuario_id' => $datos['usuario_id'],
                'cliente_id' => $datos['cliente_id'] ?? null,
                'tipo' => $datos['tipo'],
                'metodo_pago' => $metodoPago,
                'monto' => $monto,
                'concepto' => $datos['concepto'],
                'idempotency_key' => $idempotencyKey,
            ]);

            return $movimiento->load(['cliente', 'usuario:id,nombre']);
        });
    }

    public function obtenerResumenTurno(TurnoCaja $turno): array
    {
        $bloques = $this->construirBloquesResumen([$turno->id], (float) $turno->monto_inicial);

        return array_merge([
            'es_corte_dia' => false,
            'sin_datos' => false,
            'turno' => $turno->load('usuario:id,nombre'),
        ], $bloques);
    }

    // Lista únicamente fechas únicas que tienen al menos un turno registrado
    public function obtenerFechasConTurnos(): array
    {
        $turnos = TurnoCaja::with('usuario:id,nombre')
            ->orderByDesc('fecha_apertura')
            ->get();

        $porFecha = $turnos->groupBy(function ($t) {
            return Carbon::parse($t->fecha_apertura)->format('Y-m-d');
        });

        $resultado = [];
        foreach ($porFecha as $fecha => $grupo) {
            $cajeros = $grupo->pluck('usuario.nombre')->filter()->unique()->values()->all();
            $tieneAbierto = $grupo->contains('estado', 'abierto');

            $resultado[] = [
                'fecha' => $fecha,
                'cantidad_turnos' => $grupo->count(),
                'cajeros' => $cajeros,
                'estado' => $tieneAbierto ? 'abierto' : 'cerrado',
            ];
        }

        return array_slice($resultado, 0, 90);
    }

    // Consolida todos los turnos de una fecha específica en un solo Corte del Día
    public function obtenerResumenDia(string $fecha): array
    {
        $turnos = TurnoCaja::with('usuario:id,nombre')
            ->whereDate('fecha_apertura', $fecha)
            ->orderBy('fecha_apertura', 'asc')
            ->get();

        if ($turnos->isEmpty()) {
            return [
                'es_corte_dia' => true,
                'sin_datos' => true,
                'fecha' => $fecha,
                'cantidad_turnos' => 0,
                'cajeros' => [],
            ];
        }

        $bloques = $this->construirBloquesResumen(
            $turnos->pluck('id')->all(),
            (float) $turnos->sum('monto_inicial')
        );

        $tieneAbierto = $turnos->contains('estado', 'abierto');
        $turnosCerrados = $turnos->where('estado', 'cerrado');
        $cajeros = $turnos->pluck('usuario.nombre')->filter()->unique()->values()->all();

        return array_merge([
            'es_corte_dia' => true,
            'sin_datos' => false,
            'fecha' => $fecha,
            'cantidad_turnos' => $turnos->count(),
            'cajeros' => $cajeros,
            'turno' => [
                'id' => null,
                'estado' => $tieneAbierto ? 'abierto' : 'cerrado',
                'fecha_apertura' => $turnos->first()->fecha_apertura,
                'fecha_cierre' => $tieneAbierto ? null : $turnos->last()->fecha_cierre,
                'total_efectivo_contado' => $turnosCerrados->isNotEmpty()
                    ? round((float) $turnosCerrados->sum('total_efectivo_contado'), 2)
                    : null,
                'diferencia_arqueo' => $turnosCerrados->isNotEmpty()
                    ? round((float) $turnosCerrados->sum('diferencia_arqueo'), 2)
                    : null,
                'usuario' => ['nombre' => implode(', ', $cajeros)],
            ],
            // Detalle por turno para ver qué cajero tuvo sobrante o faltante
            'turnos_del_dia' => $turnos->map(fn (TurnoCaja $t) => [
                'id' => $t->id,
                'cajero' => $t->usuario?->nombre,
                'estado' => $t->estado,
                'fecha_apertura' => $t->fecha_apertura,
                'fecha_cierre' => $t->fecha_cierre,
                'monto_inicial' => (float) $t->monto_inicial,
                'total_efectivo_esperado' => $t->total_efectivo_esperado !== null ? (float) $t->total_efectivo_esperado : null,
                'total_efectivo_contado' => $t->total_efectivo_contado !== null ? (float) $t->total_efectivo_contado : null,
                'diferencia_arqueo' => $t->diferencia_arqueo !== null ? (float) $t->diferencia_arqueo : null,
            ])->values(),
        ], $bloques);
    }

    /**
     * Calcula las secciones comunes del corte (pagos, gaveta, departamentos,
     * anulaciones, estadísticas y productos más vendidos) para uno o varios turnos.
     */
    private function construirBloquesResumen(array $turnosIds, float $montoInicial): array
    {
        $pagosPorMetodo = DB::table('pagos_venta')
            ->join('ventas', 'pagos_venta.venta_id', '=', 'ventas.id')
            ->whereIn('ventas.turno_id', $turnosIds)
            ->where('ventas.estado', 'completada')
            ->selectRaw('pagos_venta.metodo_pago, SUM(pagos_venta.monto) as total')
            ->groupBy('pagos_venta.metodo_pago')
            ->pluck('total', 'metodo_pago');

        $ventasEfectivo = (float) ($pagosPorMetodo['efectivo'] ?? 0);
        $ventasTarjeta = (float) ($pagosPorMetodo['tarjeta'] ?? 0);
        $ventasSinpe = (float) ($pagosPorMetodo['sinpe'] ?? 0);
        $ventasCredito = (float) ($pagosPorMetodo['credito'] ?? 0);

        $movimientos = MovimientoCaja::with(['cliente:id,nombre', 'usuario:id,nombre'])
            ->whereIn('turno_id', $turnosIds)
            ->latest('created_at')
            ->get();

        $efectivo = $movimientos->where('metodo_pago', 'efectivo');
        $entradasEfectivo = (float) $efectivo->where('tipo', 'entrada')->sum('monto');
        $abonosEfectivo = (float) $efectivo->where('tipo', 'abono_cliente')->sum('monto');
        $salidasEfectivo = (float) $efectivo->where('tipo', 'salida')->sum('monto');
        $prestamosEfectivo = (float) $efectivo->where('tipo', 'prestamo_cliente')->sum('monto');

        $efectivoEsperado = $montoInicial
            + $ventasEfectivo
            + $entradasEfectivo
            + $abonosEfectivo
            - $salidasEfectivo
            - $prestamosEfectivo;

        $porDepartamento = DB::table('detalle_ventas')
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->leftJoin('productos', 'detalle_ventas.producto_id', '=', 'productos.id')
            ->leftJoin('departamentos', 'productos.departamento_id', '=', 'departamentos.id')
            ->whereIn('ventas.turno_id', $turnosIds)
            ->where('ventas.estado', 'completada')
            ->selectRaw("
                COALESCE(departamentos.nombre, 'Artículo Común') as departamento,
                SUM(detalle_ventas.cantidad) as unidades_vendidas,
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico) as costo_total,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia_bruta
            ")
            ->groupBy('departamento')
            ->orderByDesc('total_ventas')
            ->get();

        $topProductos = DB::table('detalle_ventas')
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->whereIn('ventas.turno_id', $turnosIds)
            ->where('ventas.estado', 'completada')
            ->selectRaw('detalle_ventas.descripcion_producto as nombre, SUM(detalle_ventas.cantidad) as unidades, SUM(detalle_ventas.subtotal) as total')
            ->groupBy('detalle_ventas.descripcion_producto')
            ->orderByDesc('unidades')
            ->orderByDesc('total')
            ->limit(8)
            ->get();

        $estadisticas = DB::table('ventas')
            ->whereIn('turno_id', $turnosIds)
            ->where('estado', 'completada')
            ->selectRaw('COUNT(id) as tickets, COALESCE(SUM(total), 0) as total, MIN(created_at) as primera, MAX(created_at) as ultima')
            ->first();

        $tickets = (int) ($estadisticas->tickets ?? 0);
        $ventasTotales = round($ventasEfectivo + $ventasTarjeta + $ventasSinpe + $ventasCredito, 2);

        $ventasAnuladas = Venta::with(['anuladaPor:id,nombre', 'detalles'])
            ->whereIn('turno_id', $turnosIds)
            ->where('estado', 'anulada')
            ->latest('fecha_anulacion')
            ->get();

        return [
            'ventas_totales' => $ventasTotales,
            'ganancia_bruta_total' => round((float) $porDepartamento->sum('ganancia_bruta'), 2),
            'desglose_pagos' => [
                'efectivo' => $ventasEfectivo,
                'tarjeta' => $ventasTarjeta,
                'sinpe' => $ventasSinpe,
                'credito' => $ventasCredito,
            ],
            'gaveta_efectivo' => [
                'monto_inicial' => $montoInicial,
                'ventas_efectivo' => $ventasEfectivo,
                'abonos_efectivo' => $abonosEfectivo,
                'entradas_efectivo' => $entradasEfectivo,
                'salidas_efectivo' => $salidasEfectivo,
                'prestamos_efectivo' => $prestamosEfectivo,
                'efectivo_esperado' => round($efectivoEsperado, 2),
            ],
            'estadisticas' => [
                'cantidad_tickets' => $tickets,
                'ticket_promedio' => $tickets > 0 ? round($ventasTotales / $tickets, 2) : 0,
                'articulos_vendidos' => (int) $porDepartamento->sum('unidades_vendidas'),
                'primera_venta' => $estadisticas->primera ?? null,
                'ultima_venta' => $estadisticas->ultima ?? null,
            ],
            'ventas_por_departamento' => $porDepartamento,
            'top_productos' => $topProductos,
            'movimientos_caja' => $movimientos,
            'anulaciones' => [
                'cantidad' => $ventasAnuladas->count(),
                'monto_total_anulado' => (float) $ventasAnuladas->sum('total'),
                'lista' => $ventasAnuladas,
            ],
        ];
    }

    public function cerrarTurno(TurnoCaja $turno, float $efectivoContado, ?string $observaciones = null): TurnoCaja
    {
        return DB::transaction(function () use ($turno, $efectivoContado, $observaciones) {
            $turnoBloqueado = TurnoCaja::lockForUpdate()->findOrFail($turno->id);

            if ($turnoBloqueado->estado === 'cerrado') {
                throw ValidationException::withMessages([
                    'turno' => 'Este turno ya se encuentra cerrado.',
                ]);
            }

            $turnoBloqueado->ventas()
                ->where('estado', 'en_espera')
                ->update([
                    'estado' => 'anulada',
                    'motivo_anulacion' => 'Ticket en espera descartado automáticamente al cerrar turno',
                    'fecha_anulacion' => now(),
                ]);

            $esperado = $this->calcularEfectivoDisponible($turnoBloqueado);
            $diferencia = round($efectivoContado - $esperado, 2);

            $turnoBloqueado->update([
                'fecha_cierre' => now(),
                'estado' => 'cerrado',
                'total_efectivo_esperado' => $esperado,
                'total_efectivo_contado' => $efectivoContado,
                'diferencia_arqueo' => $diferencia,
                'observaciones' => $observaciones,
            ]);

            return $turnoBloqueado->fresh('usuario');
        });
    }
}
