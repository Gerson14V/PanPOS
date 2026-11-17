<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Venta extends Model
{
    protected $table = 'ventas';

    protected $fillable = [
        'numero_ticket',
        'turno_id',
        'usuario_id',
        'cliente_id',
        'total',
        'estado',
        'motivo_anulacion',
        'anulada_por_usuario_id',
        'fecha_anulacion',
    ];

    protected $casts = [
        'total' => 'decimal:2',
        'fecha_anulacion' => 'datetime',
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

    public function anuladaPor(): BelongsTo
    {
        return $this->belongsTo(Usuario::class, 'anulada_por_usuario_id');
    }

    public function detalles(): HasMany
    {
        return $this->hasMany(DetalleVenta::class, 'venta_id');
    }

    public function pagos(): HasMany
    {
        return $this->hasMany(PagoVenta::class, 'venta_id');
    }
}