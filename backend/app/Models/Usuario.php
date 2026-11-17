<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Usuario extends Authenticatable
{
    protected $table = 'usuarios';

    protected $fillable = [
        'nombre',
        'username',
        'password',
        'rol',
        'activo',
        'tema_preferido',
    ];

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'activo' => 'boolean',
        'password' => 'hashed', // Laravel encripta automáticamente con Bcrypt al guardar
    ];

    public function turnos(): HasMany
    {
        return $this->hasMany(TurnoCaja::class, 'usuario_id');
    }

    public function ventas(): HasMany
    {
        return $this->hasMany(Venta::class, 'usuario_id');
    }
}