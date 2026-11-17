<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\MovimientoCaja;
use App\Models\TurnoCaja;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TurnoCajaService
{
    public function abrirTurno(int $usuarioId, float $montoInicial): TurnoCaja
    {
        $abierto = TurnoCaja::where('estado', 'abierto')->first();
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
    }

    public function registrarMovimientoCaja(array $datos): MovimientoCaja
    {
        return DB::transaction(function () use ($datos) {
            $movimiento = MovimientoCaja::create([
                'turno_id' => $datos['turno_id'],
                'usuario_id' => $datos['usuario_id'],
                'cliente_id' => $datos['cliente_id'] ?? null,
                'tipo' => $datos['tipo'],
                'metodo_pago' => $datos['metodo_pago'] ?? 'efectivo',
                'monto' => $datos['monto'],
                'concepto' => $datos['concepto'],
            ]);

            if (!empty($datos['cliente_id'])) {
                $cliente = Cliente::lockForUpdate()->findOrFail($datos['cliente_id']);

                if ($datos['tipo'] === 'prestamo_cliente') {
                    $cliente->increment('saldo_deudor', $datos['monto']);
                } elseif ($datos['tipo'] === 'abono_cliente') {
                    $cliente->decrement('saldo_deudor', $datos['monto']);
                }
            }

            return $movimiento->load('cliente');
        });
    }

    public function obtenerResumenTurno(TurnoCaja $turno): array
    {
        $ventasCompletadas = $turno->ventas()->where('estado', 'completada')->pluck('id');

        $pagosPorMetodo = DB::table('pagos_venta')
            ->whereIn('venta_id', $ventasCompletadas)
            ->selectRaw('metodo_pago, SUM(monto) as total')
            ->groupBy('metodo_pago')
            ->pluck('total', 'metodo_pago');

        $ventasEfectivo = (float) ($pagosPorMetodo['efectivo'] ?? 0);
        $ventasTarjeta = (float) ($pagosPorMetodo['tarjeta'] ?? 0);
        $ventasSinpe = (float) ($pagosPorMetodo['sinpe'] ?? 0);
        $ventasCredito = (float) ($pagosPorMetodo['credito'] ?? 0);

        $movimientos = $turno->movimientosCaja()->get();

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
            ->whereIn('ventas.id', $ventasCompletadas)
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
            'turno' => $turno->load('usuario:id,nombre'),
            'ventas_totales' => $ventasEfectivo + $ventasTarjeta + $ventasSinpe + $ventasCredito,
            'ganancia_bruta_total' => (float) $porDepartamento->sum('ganancia_bruta'),
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
            'movimientos_caja' => $movimientos->load('cliente:id,nombre'),
            'anulaciones' => [
                'cantidad' => $ventasAnuladas->count(),
                'monto_total_anulado' => (float) $ventasAnuladas->sum('total'),
                'lista' => $ventasAnuladas,
            ],
        ];
    }

    public function cerrarTurno(TurnoCaja $turno, float $efectivoContado, ?string $observaciones = null): TurnoCaja
    {
        $resumen = $this->obtenerResumenTurno($turno);
        $esperado = $resumen['gaveta_efectivo']['efectivo_esperado'];
        $diferencia = round($efectivoContado - $esperado, 2);

        $turno->update([
            'fecha_cierre' => now(),
            'estado' => 'cerrado',
            'total_efectivo_esperado' => $esperado,
            'total_efectivo_contado' => $efectivoContado,
            'diferencia_arqueo' => $diferencia,
            'observaciones' => $observaciones,
        ]);

        return $turno->fresh('usuario');
    }
}
