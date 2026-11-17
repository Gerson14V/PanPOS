<?php

namespace App\Services;

use App\Models\MovimientoInventario;
use App\Models\Producto;
use Illuminate\Support\Facades\DB;

class InventarioService
{
    public function registrarMovimiento(
        Producto $producto,
        int $usuarioId,
        string $tipo,
        int $cantidad,
        ?string $motivo = null
    ): Producto {
        return DB::transaction(function () use ($producto, $usuarioId, $tipo, $cantidad, $motivo) {
            $stockAnterior = $producto->stock_actual;

            $diferencia = match ($tipo) {
                'entrada', 'anulacion' => abs($cantidad),
                'merma', 'venta' => -abs($cantidad),
                'ajuste' => $cantidad,
            };

            $stockNuevo = $stockAnterior + $diferencia;

            $producto->update(['stock_actual' => $stockNuevo]);

            MovimientoInventario::create([
                'producto_id' => $producto->id,
                'usuario_id' => $usuarioId,
                'tipo' => $tipo,
                'cantidad' => $diferencia,
                'stock_anterior' => $stockAnterior,
                'stock_nuevo' => $stockNuevo,
                'motivo' => $motivo,
            ]);

            return $producto->fresh('departamento');
        });
    }
}
