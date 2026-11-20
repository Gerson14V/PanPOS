<?php

namespace App\Services;

use App\Models\Cliente;
use App\Models\DetalleVenta;
use App\Models\PagoVenta;
use App\Models\Producto;
use App\Models\TurnoCaja;
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

            $turno = TurnoCaja::lockForUpdate()->findOrFail($datos['turno_id']);
            if ($turno->estado !== 'abierto') {
                throw ValidationException::withMessages([
                    'turno_id' => 'El turno de caja se encuentra cerrado. Debe abrir un turno nuevo para vender.',
                ]);
            }

            if (!empty($datos['venta_en_espera_id'])) {
                $venta = Venta::lockForUpdate()->findOrFail($datos['venta_en_espera_id']);
                if ($venta->estado !== 'en_espera') {
                    throw ValidationException::withMessages([
                        'venta_en_espera_id' => 'Este ticket ya no se encuentra en espera.',
                    ]);
                }
                $venta->detalles()->delete();
                $venta->pagos()->delete();
                $numeroTicket = $venta->numero_ticket;
            } else {
                $ultimoTicket = Venta::max('numero_ticket') ?? 0;
                $numeroTicket = $ultimoTicket + 1;
                $venta = new Venta();
            }

            $totalCalculado = 0.0;
            $detallesPreparados = [];
            $productosBloqueados = [];
            $cantidadesPorProducto = [];

            foreach ($datos['items'] as $item) {
                $cantidad = (int) $item['cantidad'];
                if ($cantidad <= 0) {
                    throw ValidationException::withMessages([
                        'items' => 'La cantidad de cada producto debe ser mayor a 0.',
                    ]);
                }

                $producto = null;
                $costoHistorico = 0.0;

                if (!empty($item['producto_id'])) {
                    $prodId = (int) $item['producto_id'];
                    if (!isset($productosBloqueados[$prodId])) {
                        $productosBloqueados[$prodId] = Producto::lockForUpdate()->findOrFail($prodId);
                    }
                    $producto = $productosBloqueados[$prodId];
                    $costoHistorico = (float) $producto->precio_compra;
                    $cantidadesPorProducto[$prodId] = ($cantidadesPorProducto[$prodId] ?? 0) + $cantidad;
                }

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

            // Validación atómica de existencias agrupadas por producto
            if ($estado === 'completada') {
                foreach ($cantidadesPorProducto as $prodId => $cantTotal) {
                    $prod = $productosBloqueados[$prodId];
                    if ($prod->controlar_stock && (int) $prod->stock_actual < $cantTotal) {
                        throw ValidationException::withMessages([
                            'items' => "Sin existencias suficientes de \"{$prod->nombre}\". Disponible: {$prod->stock_actual}, solicitado: {$cantTotal}.",
                        ]);
                    }
                }
            }

            $venta->fill([
                'numero_ticket' => $numeroTicket,
                'turno_id' => $turno->id,
                'usuario_id' => $datos['usuario_id'],
                'cliente_id' => $datos['cliente_id'] ?? null,
                'total' => round($totalCalculado, 2),
                'estado' => $estado,
            ])->save();

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
                        (int) $datos['usuario_id'],
                        'venta',
                        $linea['cantidad'],
                        "Venta Ticket #{$numeroTicket}"
                    );
                }
            }

            if ($estado === 'completada') {
                $sumaPagos = 0.0;

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

                if (abs($sumaPagos - (float) $venta->total) > 0.05) {
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
        return DB::transaction(function () use ($venta, $usuarioId, $motivo) {
            $ventaBloqueada = Venta::lockForUpdate()->findOrFail($venta->id);

            if ($ventaBloqueada->estado === 'anulada') {
                throw ValidationException::withMessages([
                    'venta' => 'Esta venta ya se encuentra anulada.',
                ]);
            }

            $ventaBloqueada->load(['detalles.producto', 'pagos']);

            if ($ventaBloqueada->estado === 'completada') {
                foreach ($ventaBloqueada->detalles as $detalle) {
                    if ($detalle->producto && $detalle->producto->controlar_stock) {
                        $this->inventarioService->registrarMovimiento(
                            $detalle->producto,
                            $usuarioId,
                            'anulacion',
                            (int) $detalle->cantidad,
                            "Anulación Ticket #{$ventaBloqueada->numero_ticket}: {$motivo}"
                        );
                    }
                }

                $montoCredito = (float) $ventaBloqueada->pagos->where('metodo_pago', 'credito')->sum('monto');
                if ($montoCredito > 0 && $ventaBloqueada->cliente_id) {
                    $cliente = Cliente::lockForUpdate()->find($ventaBloqueada->cliente_id);
                    if ($cliente) {
                        $nuevoSaldo = max(0, round((float) $cliente->saldo_deudor - $montoCredito, 2));
                        $cliente->update(['saldo_deudor' => $nuevoSaldo]);
                    }
                }
            }

            $ventaBloqueada->update([
                'estado' => 'anulada',
                'motivo_anulacion' => $motivo,
                'anulada_por_usuario_id' => $usuarioId,
                'fecha_anulacion' => now(),
            ]);

            return $ventaBloqueada->fresh(['detalles', 'pagos', 'cliente', 'anuladaPor:id,nombre']);
        });
    }
}
