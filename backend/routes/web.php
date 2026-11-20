<?php

use Illuminate\Support\Facades\Route;

Route::get('/{any?}', function () {
    $archivo = public_path('pos.html');
    if (!file_exists($archivo)) {
        return response('PanPOS frontend no encontrado. Ejecute el empaquetado.', 404);
    }

    return response(file_get_contents($archivo), 200)
        ->header('Content-Type', 'text/html; charset=UTF-8');
})->where('any', '^(?!api).*$');
