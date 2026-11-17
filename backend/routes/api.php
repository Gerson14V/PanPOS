<?php

use App\Http\Controllers\Api\DepartamentoController;
use App\Http\Controllers\Api\ProductoController;
use Illuminate\Support\Facades\Route;

Route::apiResource('departamentos', DepartamentoController::class)->only(['index', 'store', 'update']);

Route::get('productos/sugerir-codigo-corto', [ProductoController::class, 'sugerirCodigoCorto']);
Route::get('inventario/movimientos', [ProductoController::class, 'historialMovimientos']);
Route::post('productos/{producto}/stock', [ProductoController::class, 'ajustarStock']);
Route::apiResource('productos', ProductoController::class)->only(['index', 'store', 'update']);
