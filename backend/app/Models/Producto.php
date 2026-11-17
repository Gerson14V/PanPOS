<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Producto extends Model
{
    protected $table = 'productos';

    protected $fillable = [
        'departamento_id',
        'codigo_barras',
        'nombre',
        'precio_compra',
        'precio_venta',
        'controlar_stock',
        'stock_actual',
        'stock_minimo',
        'mostrar_boton_rapido',
        'activo',
    ];

    protected $casts = [
        'precio_compra' => 'decimal:2',
        'precio_venta' => 'decimal:2',
        'controlar_stock' => 'boolean',
        'stock_actual' => 'integer',
        'stock_minimo' => 'integer',
        'mostrar_boton_rapido' => 'boolean',
        'activo' => 'boolean',
    ];

    public function departamento(): BelongsTo
    {
        return $this->belongsTo(Departamento::class, 'departamento_id');
    }

    public function movimientosInventario(): HasMany
    {
        return $this->hasMany(MovimientoInventario::class, 'producto_id');
    }

    // Busca el menor código corto de 2 dígitos disponible ('01' a '99')
    public static function siguienteCodigoCortoDisponible(): ?string
    {
        $usados = self::whereRaw('LENGTH(codigo_barras) = 2')
            ->pluck('codigo_barras')
            ->toArray();

        for ($i = 1; $i <= 99; $i++) {
            $codigo = str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            if (!in_array($codigo, $usados, true)) {
                return $codigo;
            }
        }

        return null;
    }
}