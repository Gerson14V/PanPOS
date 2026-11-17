<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PagoVenta extends Model
{
    protected $table = 'pagos_venta';

    public $timestamps = false;

    protected $fillable = [
        'venta_id',
        'metodo_pago',
        'monto',
        'monto_recibido',
        'vuelto_entregado',
    ];

    protected $casts = [
        'monto' => 'decimal:2',
        'monto_recibido' => 'decimal:2',
        'vuelto_entregado' => 'decimal:2',
    ];

    public function venta(): BelongsTo
    {
        return $this->belongsTo(Venta::class, 'venta_id');
    }
}