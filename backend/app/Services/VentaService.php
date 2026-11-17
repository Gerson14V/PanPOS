<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\DetalleVenta;
use App\Models\PagoVenta;
use App\Models\Producto;
use App\Models\Venta;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VentaService
{
    public function __construct(private InventarioService $inventarioService) {}

    public function procesarVenta(array $datos): Venta
    {
        return DB::transaction(function () use ($datos) {
            $estado = $datos['estado'] ?? 'completada';

            // Si viene de un ticket en espera previo, lo actualizamos; si no, generamos consecutivo
            if (!empty($datos['venta_en_espera_id'])) {
                $venta = Venta::lockForUpdate()->findOrFail($datos['venta_en_espera_id']);
                $venta->detalles()->delete();
                $venta->pagos()->delete();
                $numeroTicket = $venta->numero_ticket;
            } else {
                $ultimoTicket = Venta::max('numero_ticket') ?? 0;
                $numeroTicket = $ultimoTicket + 1;
                $venta = new Venta();
            }

            $totalCalculado = 0;
            $detallesPreparados = [];

            foreach ($datos['items'] as $item) {
                $producto = null;
                $costoHistorico = 0;

                if (!empty($item['producto_id'])) {
                    $producto = Producto::lockForUpdate()->findOrFail($item['producto_id']);
                    $costoHistorico = (float) $producto->precio_compra;
                }

                $cantidad = (int) $item['cantidad'];
                $precioUnitario = (float) $item['precio_unitario'];
                $subtotal = round($cantidad * $precioUnitario, 2);
                $totalCalculado += $subtotal;

                $detallesPreparados[] = [
                    'producto' => $producto,
                    'descripcion_producto' => $item['descripcion_producto'] ?? $producto?->nombre ?? 'Artículo Común',
                    'cantidad' => $cantidad,
                    'costo_unitario_historico' => $costoHistorico,
                    'precio_unitario' => $precioUnitario,
                    'subtotal' => $subtotal,
                ];
            }

            $venta->fill([
                'numero_ticket' => $numeroTicket,
                'turno_id' => $datos['turno_id'],
                'usuario_id' => $datos['usuario_id'],
                'cliente_id' => $datos['cliente_id'] ?? null,
                'total' => round($totalCalculado, 2),
                'estado' => $estado,
            ])->save();

            // Guardar líneas de detalle y descontar stock si la venta se completa
            foreach ($detallesPreparados as $linea) {
                DetalleVenta::create([
                    'venta_id' => $venta->id,
                    'producto_id' => $linea['producto']?->id,
                    'descripcion_producto' => $linea['descripcion_producto'],
                    'cantidad' => $linea['cantidad'],
                    'costo_unitario_historico' => $linea['costo_unitario_historico'],
                    'precio_unitario' => $linea['precio_unitario'],
                    'subtotal' => $linea['subtotal'],
                ]);

                if ($estado === 'completada' && $linea['producto'] && $linea['producto']->controlar_stock) {
                    $this->inventarioService->registrarMovimiento(
                        $linea['producto'],
                        $datos['usuario_id'],
                        'venta',
                        $linea['cantidad'],
                        "Venta Ticket #{$numeroTicket}"
                    );
                }
            }

            // Procesar pagos simples o mixtos si la venta se completa
            if ($estado === 'completada') {
                $sumaPagos = 0;

                foreach ($datos['pagos'] as $pago) {
                    $montoPago = round((float) $pago['monto'], 2);
                    $sumaPagos += $montoPago;

                    if ($pago['metodo_pago'] === 'credito') {
                        if (empty($datos['cliente_id'])) {
                            throw ValidationException::withMessages([
                                'cliente_id' => 'Debe seleccionar un cliente para registrar una venta a crédito (fiado).',
                            ]);
                        }

                        $cliente = Cliente::lockForUpdate()->findOrFail($datos['cliente_id']);
                        $cliente->increment('saldo_deudor', $montoPago);
                    }

                    PagoVenta::create([
                        'venta_id' => $venta->id,
                        'metodo_pago' => $pago['metodo_pago'],
                        'monto' => $montoPago,
                        'monto_recibido' => $pago['monto_recibido'] ?? null,
                        'vuelto_entregado' => $pago['vuelto_entregado'] ?? null,
                    ]);
                }

                if (abs($sumaPagos - $venta->total) > 0.05) {
                    throw ValidationException::withMessages([
                        'pagos' => "La suma de los pagos ({$sumaPagos}) no coincide con el total de la venta ({$venta->total}).",
                    ]);
                }
            }

            return $venta->load(['detalles', 'pagos', 'cliente', 'usuario:id,nombre']);
        });
    }

    public function anularVenta(Venta $venta, int $usuarioId, string $motivo): Venta
    {
        if ($venta->estado === 'anulada') {
            throw ValidationException::withMessages([
                'venta' => 'Esta venta ya se encuentra anulada.',
            ]);
        }

        return DB::transaction(function () use ($venta, $usuarioId, $motivo) {
            $venta->load(['detalles.producto', 'pagos']);

            // Si estaba completada, devolvemos stock estricto y revertimos deuda si fue fiada
            if ($venta->estado === 'completada') {
                foreach ($venta->detalles as $detalle) {
                    if ($detalle->producto && $detalle->producto->controlar_stock) {
                        $this->inventarioService->registrarMovimiento(
                            $detalle->producto,
                            $usuarioId,
                            'anulacion',
                            $detalle->cantidad,
                            "Anulación Ticket #{$venta->numero_ticket}: {$motivo}"
                        );
                    }
                }

                $montoCredito = $venta->pagos->where('metodo_pago', 'credito')->sum('monto');
                if ($montoCredito > 0 && $venta->cliente_id) {
                    Cliente::where('id', $venta->cliente_id)->decrement('saldo_deudor', $montoCredito);
                }
            }

            $venta->update([
                'estado' => 'anulada',
                'motivo_anulacion' => $motivo,
                'anulada_por_usuario_id' => $usuarioId,
                'fecha_anulacion' => now(),
            ]);

            return $venta->fresh(['detalles', 'pagos', 'cliente', 'anuladaPor:id,nombre']);
        });
    }
}
