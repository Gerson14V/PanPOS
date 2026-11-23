<?php
// Verificación de solo lectura de la base de datos de PanPOS.
// Uso: php verificar_bd.php <ruta a database.sqlite>
// Imprime JSON con el resultado de PRAGMA quick_check y la cantidad de
// registros de las tablas de negocio, para comparar antes/después de actualizar.

$ruta = $argv[1] ?? '';
if ($ruta === '' || !is_file($ruta)) {
    fwrite(STDERR, "No existe la base de datos: {$ruta}\n");
    exit(2);
}

try {
    $pdo = new PDO('sqlite:' . $ruta, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('PRAGMA busy_timeout = 5000');

    $integridad = (string) $pdo->query('PRAGMA quick_check')->fetchColumn();

    $tablas = [
        'usuarios', 'productos', 'departamentos', 'clientes', 'turnos_caja',
        'ventas', 'detalle_ventas', 'pagos_venta', 'movimientos_caja',
        'movimientos_inventario', 'configuracion_sistema',
    ];

    $existentes = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
    $conteos = [];
    foreach ($tablas as $tabla) {
        if (in_array($tabla, $existentes, true)) {
            $conteos[$tabla] = (int) $pdo->query("SELECT COUNT(*) FROM \"{$tabla}\"")->fetchColumn();
        }
    }

    // Línea marcada: el actualizador la busca entre cualquier aviso que PHP imprima
    // al arrancar (p. ej. una extensión ya cargada), que no es JSON.
    echo PHP_EOL . 'PANPOS_JSON=' . json_encode(['integridad' => $integridad, 'conteos' => $conteos]) . PHP_EOL;
    exit($integridad === 'ok' ? 0 : 1);
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(3);
}
