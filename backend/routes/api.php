<?php

use App\Http\Controllers\Api\ClienteController;
use App\Http\Controllers\Api\DepartamentoController;
use App\Http\Controllers\Api\ProductoController;
use App\Http\Controllers\Api\TurnoCajaController;
use App\Http\Controllers\Api\UsuarioConfigController;
use App\Http\Controllers\Api\VentaController;
use Illuminate\Support\Facades\Route;

// Autenticación, Usuarios y Configuración del Sistema
Route::post('auth/login', [UsuarioConfigController::class, 'login']);
Route::get('usuarios', [UsuarioConfigController::class, 'listarUsuarios']);
Route::post('usuarios', [UsuarioConfigController::class, 'crearUsuario']);
Route::put('usuarios/{usuario}', [UsuarioConfigController::class, 'actualizarUsuario']);
Route::get('configuracion', [UsuarioConfigController::class, 'obtenerConfiguracion']);
Route::put('configuracion', [UsuarioConfigController::class, 'actualizarConfiguracion']);

// Departamentos / Proveedores
Route::apiResource('departamentos', DepartamentoController::class)->only(['index', 'store', 'update']);

// Productos e Inventario
Route::get('productos/sugerir-codigo-corto', [ProductoController::class, 'sugerirCodigoCorto']);
Route::get('inventario/movimientos', [ProductoController::class, 'historialMovimientos']);
Route::post('productos/{producto}/stock', [ProductoController::class, 'ajustarStock']);
Route::apiResource('productos', ProductoController::class)->only(['index', 'store', 'update']);

// Clientes, Fiados, Préstamos y Abonos
Route::get('clientes/{cliente}/estado-cuenta', [ClienteController::class, 'estadoCuenta']);
Route::post('clientes/{cliente}/operacion-credito', [ClienteController::class, 'registrarOperacionCredito']);
Route::apiResource('clientes', ClienteController::class)->only(['index', 'store', 'update']);

// Turnos de Caja y Corte
Route::get('turnos/activo', [TurnoCajaController::class, 'turnoActivo']);
Route::post('turnos/abrir', [TurnoCajaController::class, 'abrir']);
Route::get('turnos/{turno}/resumen', [TurnoCajaController::class, 'resumen']);
Route::post('turnos/{turno}/movimientos', [TurnoCajaController::class, 'registrarMovimiento']);
Route::post('turnos/{turno}/cerrar', [TurnoCajaController::class, 'cerrar']);

// Ventas, Tickets en Espera y Anulaciones
Route::get('ventas', [VentaController::class, 'index']);
Route::post('ventas', [VentaController::class, 'store']);
Route::post('ventas/{venta}/anular', [VentaController::class, 'anular']);
