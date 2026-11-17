<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MovimientoCaja extends Model
{
    protected $table = 'movimientos_caja';

    const UPDATED_AT = null;

    protected $fillable = [
        'turno_id',
        'usuario_id',
        'cliente_id',
        'tipo',
        'metodo_pago',
        'monto',
        'concepto',
    ];

    protected $casts = [
        'monto' => 'decimal:2',
    ];

    public function turno(): BelongsTo
    {
        return $this->belongsTo(TurnoCaja::class, 'turno_id');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'usuario_id');
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(Cliente::class, 'cliente_id');
    }
}