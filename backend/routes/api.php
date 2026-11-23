<?php

use App\Http\Controllers\Api\ClienteController;
use App\Http\Controllers\Api\DepartamentoController;
use App\Http\Controllers\Api\ProductoController;
use App\Http\Controllers\Api\ReporteBackupController;
use App\Http\Controllers\Api\TurnoCajaController;
use App\Http\Controllers\Api\UsuarioConfigController;
use App\Http\Controllers\Api\VentaController;
use App\Http\Middleware\EnsureAdmin;
use Illuminate\Support\Facades\Route;

// Rutas públicas mínimas (pantalla de login)
Route::get('sistema/publico', [UsuarioConfigController::class, 'estadoPublico']);
Route::post('auth/login', [UsuarioConfigController::class, 'login'])->middleware('throttle:5,1');

// Rutas protegidas para operadores autenticados (Admin y Cajero)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('auth/me', [UsuarioConfigController::class, 'me']);
    Route::post('auth/logout', [UsuarioConfigController::class, 'logout']);
    Route::get('configuracion', [UsuarioConfigController::class, 'obtenerConfiguracion']);

    // Departamentos / Proveedores
    Route::apiResource('departamentos', DepartamentoController::class)->only(['index', 'store', 'update', 'destroy']);

    // Productos e Inventario
    Route::get('productos/sugerir-codigo-corto', [ProductoController::class, 'sugerirCodigoCorto']);
    Route::post('productos/{producto}/stock', [ProductoController::class, 'ajustarStock']);
    Route::apiResource('productos', ProductoController::class)->only(['index', 'store', 'update', 'destroy']);

    // Clientes, Fiados, Préstamos y Abonos
    Route::get('clientes/{cliente}/estado-cuenta', [ClienteController::class, 'estadoCuenta']);
    Route::post('clientes/{cliente}/operacion-credito', [ClienteController::class, 'registrarOperacionCredito']);
    Route::apiResource('clientes', ClienteController::class)->only(['index', 'store', 'update', 'destroy']);

    // Turnos de Caja y Corte
    Route::get('turnos', [TurnoCajaController::class, 'index']);
    Route::get('turnos/activo', [TurnoCajaController::class, 'turnoActivo']);
    Route::get('turnos/fechas-disponibles', [TurnoCajaController::class, 'fechasDisponibles']);
    Route::get('turnos/corte-dia', [TurnoCajaController::class, 'resumenDia']);
    Route::post('turnos/abrir', [TurnoCajaController::class, 'abrir']);
    Route::get('turnos/{turno}/resumen', [TurnoCajaController::class, 'resumen']);
    Route::get('turnos/{turno}/efectivo', [TurnoCajaController::class, 'efectivoDisponible']);
    Route::post('turnos/{turno}/movimientos', [TurnoCajaController::class, 'registrarMovimiento']);
    Route::post('turnos/{turno}/cerrar', [TurnoCajaController::class, 'cerrar']);
    Route::get('turnos/{turno}/exportar-excel', [ReporteBackupController::class, 'exportarCorteExcel']);

    // Ventas, Tickets en Espera y Anulaciones
    Route::get('ventas', [VentaController::class, 'index']);
    Route::post('ventas', [VentaController::class, 'store']);
    Route::post('ventas/{venta}/anular', [VentaController::class, 'anular']);

    // Reportes
    Route::get('reportes/ventas-periodo', [ReporteBackupController::class, 'ventasPorPeriodo']);
    Route::get('reportes/exportar-excel-diario', [ReporteBackupController::class, 'exportarExcelDiario']);

    // Rutas exclusivas de Administrador
    Route::middleware(EnsureAdmin::class)->group(function () {
        Route::get('usuarios', [UsuarioConfigController::class, 'listarUsuarios']);
        Route::post('usuarios', [UsuarioConfigController::class, 'crearUsuario']);
        Route::put('usuarios/{usuario}', [UsuarioConfigController::class, 'actualizarUsuario']);
        Route::delete('usuarios/{usuario}', [UsuarioConfigController::class, 'eliminarUsuario']);
        Route::put('configuracion', [UsuarioConfigController::class, 'actualizarConfiguracion']);
        Route::get('inventario/movimientos', [ProductoController::class, 'historialMovimientos']);
        Route::post('sistema/backup', [ReporteBackupController::class, 'ejecutarBackupManual']);
    });
});
