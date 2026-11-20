<?php

use App\Http\Controllers\Api\ClienteController;
use App\Http\Controllers\Api\DepartamentoController;
use App\Http\Controllers\Api\ProductoController;
use App\Http\Controllers\Api\ReporteBackupController;
use App\Http\Controllers\Api\TurnoCajaController;
use App\Http\Controllers\Api\UsuarioConfigController;
use App\Http\Controllers\Api\VentaController;
use Illuminate\Support\Facades\Route;

// Autenticación, Usuarios y Configuración del Sistema
Route::post('auth/login', [UsuarioConfigController::class, 'login']);
Route::get('usuarios', [UsuarioConfigController::class, 'listarUsuarios']);
Route::post('usuarios', [UsuarioConfigController::class, 'crearUsuario']);
Route::put('usuarios/{usuario}', [UsuarioConfigController::class, 'actualizarUsuario']);
Route::delete('usuarios/{usuario}', [UsuarioConfigController::class, 'eliminarUsuario']);
Route::get('configuracion', [UsuarioConfigController::class, 'obtenerConfiguracion']);
Route::put('configuracion', [UsuarioConfigController::class, 'actualizarConfiguracion']);

// Departamentos / Proveedores
Route::apiResource('departamentos', DepartamentoController::class)->only(['index', 'store', 'update', 'destroy']);

// Productos e Inventario
Route::get('productos/sugerir-codigo-corto', [ProductoController::class, 'sugerirCodigoCorto']);
Route::get('inventario/movimientos', [ProductoController::class, 'historialMovimientos']);
Route::post('productos/{producto}/stock', [ProductoController::class, 'ajustarStock']);
Route::apiResource('productos', ProductoController::class)->only(['index', 'store', 'update', 'destroy']);

// Clientes, Fiados, Préstamos y Abonos
Route::get('clientes/{cliente}/estado-cuenta', [ClienteController::class, 'estadoCuenta']);
Route::post('clientes/{cliente}/operacion-credito', [ClienteController::class, 'registrarOperacionCredito']);
Route::apiResource('clientes', ClienteController::class)->only(['index', 'store', 'update', 'destroy']);

// Turnos de Caja y Corte (Cajero + Día Completo)
Route::get('turnos', [TurnoCajaController::class, 'index']);
Route::get('turnos/activo', [TurnoCajaController::class, 'turnoActivo']);
Route::get('turnos/fechas-disponibles', [TurnoCajaController::class, 'fechasDisponibles']);
Route::get('turnos/corte-dia', [TurnoCajaController::class, 'resumenDia']);
Route::post('turnos/abrir', [TurnoCajaController::class, 'abrir']);
Route::get('turnos/{turno}/resumen', [TurnoCajaController::class, 'resumen']);
Route::post('turnos/{turno}/movimientos', [TurnoCajaController::class, 'registrarMovimiento']);
Route::post('turnos/{turno}/cerrar', [TurnoCajaController::class, 'cerrar']);
Route::get('turnos/{turno}/exportar-excel', [ReporteBackupController::class, 'exportarCorteExcel']);

// Ventas, Tickets en Espera y Anulaciones
Route::get('ventas', [VentaController::class, 'index']);
Route::post('ventas', [VentaController::class, 'store']);
Route::post('ventas/{venta}/anular', [VentaController::class, 'anular']);

// Reportes y Respaldos de Base de Datos
Route::get('reportes/ventas-periodo', [ReporteBackupController::class, 'ventasPorPeriodo']);
Route::get('reportes/exportar-excel-diario', [ReporteBackupController::class, 'exportarExcelDiario']);
Route::post('sistema/backup', [ReporteBackupController::class, 'ejecutarBackupManual']);
