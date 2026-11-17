<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TurnoCaja extends Model
{
    protected $table = 'turnos_caja';

    protected $fillable = [
        'usuario_id',
        'fecha_apertura',
        'fecha_cierre',
        'estado',
        'monto_inicial',
        'total_efectivo_esperado',
        'total_efectivo_contado',
        'diferencia_arqueo',
        'observaciones',
    ];

    protected $casts = [
        'fecha_apertura' => 'datetime',
        'fecha_cierre' => 'datetime',
        'monto_inicial' => 'decimal:2',
        'total_efectivo_esperado' => 'decimal:2',
        'total_efectivo_contado' => 'decimal:2',
        'diferencia_arqueo' => 'decimal:2',
    ];

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'usuario_id');
    }

    public function ventas(): HasMany
    {
        return $this->hasMany(Venta::class, 'turno_id');
    }

    public function movimientosCaja(): HasMany
    {
        return $this->hasMany(MovimientoCaja::class, 'turno_id');
    }
}