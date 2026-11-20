<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\MovimientoCaja;
use App\Models\TurnoCaja;
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
        return DB::transaction(function () use ($datos) {
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
            ]);

            return $movimiento->load(['cliente', 'usuario:id,nombre']);
        });
    }

    public function obtenerResumenTurno(TurnoCaja $turno): array
    {
        $pagosPorMetodo = DB::table('pagos_venta')
            ->join('ventas', 'pagos_venta.venta_id', '=', 'ventas.id')
            ->where('ventas.turno_id', $turno->id)
            ->where('ventas.estado', 'completada')
            ->selectRaw('pagos_venta.metodo_pago, SUM(pagos_venta.monto) as total')
            ->groupBy('pagos_venta.metodo_pago')
            ->pluck('total', 'metodo_pago');

        $ventasEfectivo = (float) ($pagosPorMetodo['efectivo'] ?? 0);
        $ventasTarjeta = (float) ($pagosPorMetodo['tarjeta'] ?? 0);
        $ventasSinpe = (float) ($pagosPorMetodo['sinpe'] ?? 0);
        $ventasCredito = (float) ($pagosPorMetodo['credito'] ?? 0);

        $movimientos = $turno->movimientosCaja()
            ->with(['cliente:id,nombre', 'usuario:id,nombre'])
            ->latest('created_at')
            ->get();

        $entradasEfectivo = (float) $movimientos->where('tipo', 'entrada')->where('metodo_pago', 'efectivo')->sum('monto');
        $abonosEfectivo = (float) $movimientos->where('tipo', 'abono_cliente')->where('metodo_pago', 'efectivo')->sum('monto');
        $salidasEfectivo = (float) $movimientos->where('tipo', 'salida')->where('metodo_pago', 'efectivo')->sum('monto');
        $prestamosEfectivo = (float) $movimientos->where('tipo', 'prestamo_cliente')->where('metodo_pago', 'efectivo')->sum('monto');

        $efectivoEsperado = (float) $turno->monto_inicial
            + $ventasEfectivo
            + $entradasEfectivo
            + $abonosEfectivo
            - $salidasEfectivo
            - $prestamosEfectivo;

        $porDepartamento = DB::table('detalle_ventas')
            ->join('ventas', 'detalle_ventas.venta_id', '=', 'ventas.id')
            ->leftJoin('productos', 'detalle_ventas.producto_id', '=', 'productos.id')
            ->leftJoin('departamentos', 'productos.departamento_id', '=', 'departamentos.id')
            ->where('ventas.turno_id', $turno->id)
            ->where('ventas.estado', 'completada')
            ->selectRaw("
                COALESCE(departamentos.nombre, 'Artículo Común') as departamento,
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico) as costo_total,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia_bruta
            ")
            ->groupBy('departamento')
            ->get();

        $ventasAnuladas = $turno->ventas()
            ->with(['anuladaPor:id,nombre', 'detalles'])
            ->where('estado', 'anulada')
            ->get();

        return [
            'es_corte_dia' => false,
            'sin_datos' => false,
            'turno' => $turno->load('usuario:id,nombre'),
            'ventas_totales' => round($ventasEfectivo + $ventasTarjeta + $ventasSinpe + $ventasCredito, 2),
            'ganancia_bruta_total' => round((float) $porDepartamento->sum('ganancia_bruta'), 2),
            'desglose_pagos' => [
                'efectivo' => $ventasEfectivo,
                'tarjeta' => $ventasTarjeta,
                'sinpe' => $ventasSinpe,
                'credito' => $ventasCredito,
            ],
            'gaveta_efectivo' => [
                'monto_inicial' => (float) $turno->monto_inicial,
                'ventas_efectivo' => $ventasEfectivo,
                'abonos_efectivo' => $abonosEfectivo,
                'entradas_efectivo' => $entradasEfectivo,
                'salidas_efectivo' => $salidasEfectivo,
                'prestamos_efectivo' => $prestamosEfectivo,
                'efectivo_esperado' => round($efectivoEsperado, 2),
            ],
            'ventas_por_departamento' => $porDepartamento,
            'movimientos_caja' => $movimientos,
            'anulaciones' => [
                'cantidad' => $ventasAnuladas->count(),
                'monto_total_anulado' => (float) $ventasAnuladas->sum('total'),
                'lista' => $ventasAnuladas,
            ],
        ];
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

        $turnosIds = $turnos->pluck('id')->all();

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

        $montoInicialTotal = (float) $turnos->sum('monto_inicial');
        $entradasEfectivo = (float) $movimientos->where('tipo', 'entrada')->where('metodo_pago', 'efectivo')->sum('monto');
        $abonosEfectivo = (float) $movimientos->where('tipo', 'abono_cliente')->where('metodo_pago', 'efectivo')->sum('monto');
        $salidasEfectivo = (float) $movimientos->where('tipo', 'salida')->where('metodo_pago', 'efectivo')->sum('monto');
        $prestamosEfectivo = (float) $movimientos->where('tipo', 'prestamo_cliente')->where('metodo_pago', 'efectivo')->sum('monto');

        $efectivoEsperado = $montoInicialTotal
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
                SUM(detalle_ventas.subtotal) as total_ventas,
                SUM(detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico) as costo_total,
                SUM(detalle_ventas.subtotal - (detalle_ventas.cantidad * detalle_ventas.costo_unitario_historico)) as ganancia_bruta
            ")
            ->groupBy('departamento')
            ->get();

        $ventasAnuladas = \App\Models\Venta::with(['anuladaPor:id,nombre', 'detalles'])
            ->whereIn('turno_id', $turnosIds)
            ->where('estado', 'anulada')
            ->get();

        $tieneAbierto = $turnos->contains('estado', 'abierto');
        $turnosCerrados = $turnos->where('estado', 'cerrado');
        $primerTurno = $turnos->first();
        $ultimoTurno = $turnos->last();
        $cajeros = $turnos->pluck('usuario.nombre')->filter()->unique()->values()->all();

        $totalContadoCerrados = $turnosCerrados->isNotEmpty()
            ? round((float) $turnosCerrados->sum('total_efectivo_contado'), 2)
            : null;

        $diferenciaTotal = $turnosCerrados->isNotEmpty()
            ? round((float) $turnosCerrados->sum('diferencia_arqueo'), 2)
            : null;

        return [
            'es_corte_dia' => true,
            'sin_datos' => false,
            'fecha' => $fecha,
            'cantidad_turnos' => $turnos->count(),
            'cajeros' => $cajeros,
            'turno' => [
                'id' => null,
                'estado' => $tieneAbierto ? 'abierto' : 'cerrado',
                'fecha_apertura' => $primerTurno->fecha_apertura,
                'fecha_cierre' => $tieneAbierto ? null : $ultimoTurno->fecha_cierre,
                'total_efectivo_contado' => $totalContadoCerrados,
                'diferencia_arqueo' => $diferenciaTotal,
                'usuario' => ['nombre' => implode(', ', $cajeros)],
            ],
            'ventas_totales' => round($ventasEfectivo + $ventasTarjeta + $ventasSinpe + $ventasCredito, 2),
            'ganancia_bruta_total' => round((float) $porDepartamento->sum('ganancia_bruta'), 2),
            'desglose_pagos' => [
                'efectivo' => $ventasEfectivo,
                'tarjeta' => $ventasTarjeta,
                'sinpe' => $ventasSinpe,
                'credito' => $ventasCredito,
            ],
            'gaveta_efectivo' => [
                'monto_inicial' => $montoInicialTotal,
                'ventas_efectivo' => $ventasEfectivo,
                'abonos_efectivo' => $abonosEfectivo,
                'entradas_efectivo' => $entradasEfectivo,
                'salidas_efectivo' => $salidasEfectivo,
                'prestamos_efectivo' => $prestamosEfectivo,
                'efectivo_esperado' => round($efectivoEsperado, 2),
            ],
            'ventas_por_departamento' => $porDepartamento,
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

            $resumen = $this->obtenerResumenTurno($turnoBloqueado);
            $esperado = $resumen['gaveta_efectivo']['efectivo_esperado'];
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
