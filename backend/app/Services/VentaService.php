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
        $idempotencyKey = !empty($datos['idempotency_key']) ? trim((string) $datos['idempotency_key']) : null;

        if ($idempotencyKey !== null) {
            $existente = Venta::where('idempotency_key', $idempotencyKey)->first();
            if ($existente) {
                return $existente->load(['detalles', 'pagos', 'cliente', 'usuario:id,nombre']);
            }
        }

        return DB::transaction(function () use ($datos, $idempotencyKey) {
            if ($idempotencyKey !== null) {
                $existente = Venta::where('idempotency_key', $idempotencyKey)->first();
                if ($existente) {
                    return $existente->load(['detalles', 'pagos', 'cliente', 'usuario:id,nombre']);
                }
            }

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
                if ((int) $venta->turno_id !== (int) $turno->id) {
                    throw ValidationException::withMessages([
                        'venta_en_espera_id' => 'Este ticket en espera pertenece a otro turno de caja.',
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
                    // Precio y nombre autoritativos desde la base de datos
                    $precioUnitario = (float) $producto->precio_venta;
                    $descripcion = $producto->nombre;
                    $cantidadesPorProducto[$prodId] = ($cantidadesPorProducto[$prodId] ?? 0) + $cantidad;
                } else {
                    $precioUnitario = (float) ($item['precio_unitario'] ?? 0);
                    $descripcion = trim((string) ($item['descripcion_producto'] ?? '')) ?: 'Artículo Común';
                }

                $subtotal = round($cantidad * $precioUnitario, 2);
                $totalCalculado += $subtotal;

                $detallesPreparados[] = [
                    'producto' => $producto,
                    'descripcion_producto' => $descripcion,
                    'cantidad' => $cantidad,
                    'costo_unitario_historico' => $costoHistorico,
                    'precio_unitario' => $precioUnitario,
                    'subtotal' => $subtotal,
                ];
            }

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
                'idempotency_key' => $idempotencyKey,
                'turno_id' => $turno->id,
                'usuario_id' => $datos['usuario_id'],
                'cliente_id' => $datos['cliente_id'] ?? null,
                'total' => round($totalCalculado, 2),
                'estado' => $estado,
            ]);
            if (!empty($datos['venta_en_espera_id']) && $estado === 'completada') {
                $venta->created_at = now();
            }
            $venta->save();

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
                $tieneCredito = false;

                foreach ($datos['pagos'] as $pago) {
                    $montoPago = round((float) $pago['monto'], 2);
                    $sumaPagos += $montoPago;

                    if ($pago['metodo_pago'] === 'credito') {
                        if (empty($datos['cliente_id'])) {
                            throw ValidationException::withMessages([
                                'cliente_id' => 'Debe seleccionar un cliente para registrar una venta a crédito (fiado).',
                            ]);
                        }
                        $tieneCredito = true;
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

                if ($tieneCredito && !empty($datos['cliente_id'])) {
                    $this->recalcularSaldoCliente((int) $datos['cliente_id']);
                }
            }

            return $venta->load(['detalles', 'pagos', 'cliente', 'usuario:id,nombre']);
        }, 3);
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

            $turno = TurnoCaja::lockForUpdate()->find($ventaBloqueada->turno_id);
            if ($turno && $turno->estado !== 'abierto') {
                throw ValidationException::withMessages([
                    'venta' => 'No se puede anular un ticket perteneciente a un turno que ya fue cerrado.',
                ]);
            }

            $ventaBloqueada->load(['detalles.producto', 'pagos']);
            $estabaCompletada = $ventaBloqueada->estado === 'completada';
            $montoCredito = (float) $ventaBloqueada->pagos->where('metodo_pago', 'credito')->sum('monto');

            if ($estabaCompletada) {
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
            }

            $ventaBloqueada->update([
                'estado' => 'anulada',
                'motivo_anulacion' => $motivo,
                'anulada_por_usuario_id' => $usuarioId,
                'fecha_anulacion' => now(),
            ]);

            if ($estabaCompletada && $montoCredito > 0 && $ventaBloqueada->cliente_id) {
                $this->recalcularSaldoCliente((int) $ventaBloqueada->cliente_id);
            }

            return $ventaBloqueada->fresh(['detalles', 'pagos', 'cliente', 'anuladaPor:id,nombre']);
        }, 3);
    }

    // Reconstruye el saldo exacto desde el libro de ventas a crédito, préstamos y abonos
    public function recalcularSaldoCliente(int $clienteId): void
    {
        $cliente = Cliente::lockForUpdate()->find($clienteId);
        if (!$cliente) {
            return;
        }

        $totalFiado = (float) DB::table('pagos_venta')
            ->join('ventas', 'pagos_venta.venta_id', '=', 'ventas.id')
            ->where('ventas.cliente_id', $clienteId)
            ->where('ventas.estado', 'completada')
            ->where('pagos_venta.metodo_pago', 'credito')
            ->sum('pagos_venta.monto');

        $totalPrestamos = (float) DB::table('movimientos_caja')
            ->where('cliente_id', $clienteId)
            ->where('tipo', 'prestamo_cliente')
            ->sum('monto');

        $totalAbonos = (float) DB::table('movimientos_caja')
            ->where('cliente_id', $clienteId)
            ->where('tipo', 'abono_cliente')
            ->sum('monto');

        $saldoReal = max(0, round($totalFiado + $totalPrestamos - $totalAbonos, 2));
        $cliente->update(['saldo_deudor' => $saldoReal]);
    }
}
