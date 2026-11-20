<?php

namespace App\Services;

use App\Models\MovimientoInventario;
use App\Models\Producto;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventarioService
{
    public function sugerirCodigoCorto(): ?string
    {
        return Producto::siguienteCodigoCortoDisponible();
    }

    public function registrarMovimiento(
        Producto $producto,
        int $usuarioId,
        string $tipo,
        int $cantidad,
        ?string $motivo = null
    ): Producto {
        return DB::transaction(function () use ($producto, $usuarioId, $tipo, $cantidad, $motivo) {
            $prodBloqueado = Producto::lockForUpdate()->findOrFail($producto->id);
            $stockAnterior = (int) $prodBloqueado->stock_actual;

            $diferencia = match ($tipo) {
                'entrada', 'anulacion' => abs($cantidad),
                'merma', 'venta' => -abs($cantidad),
                'ajuste' => $cantidad,
            };

            $stockNuevo = $stockAnterior + $diferencia;

            if ($prodBloqueado->controlar_stock && $stockNuevo < 0) {
                throw ValidationException::withMessages([
                    'stock' => "El inventario de \"{$prodBloqueado->nombre}\" no puede quedar negativo (Existencia actual: {$stockAnterior}).",
                ]);
            }

            $prodBloqueado->update(['stock_actual' => max(0, $stockNuevo)]);

            MovimientoInventario::create([
                'producto_id' => $prodBloqueado->id,
                'usuario_id' => $usuarioId,
                'tipo' => $tipo,
                'cantidad' => $diferencia,
                'stock_anterior' => $stockAnterior,
                'stock_nuevo' => max(0, $stockNuevo),
                'motivo' => $motivo,
            ]);

            return $prodBloqueado->fresh('departamento');
        });
    }
}
