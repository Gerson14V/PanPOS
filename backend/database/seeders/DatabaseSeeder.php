<?php

namespace Database\Seeders;

use App\Models\ConfiguracionSistema;
use App\Models\Departamento;
use App\Models\Producto;
use App\Models\Usuario;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Usuario Administrador inicial
        Usuario::firstOrCreate(
            ['username' => 'admin'],
            [
                'nombre' => 'Administrador',
                'password' => 'admin123', // Se encripta automáticamente por el cast 'hashed'
                'rol' => 'admin',
                'activo' => true,
                'tema_preferido' => 'light',
            ]
        );

        // 2. Parámetros iniciales de configuración del sistema
        $configuraciones = [
            ['clave' => 'nombre_negocio', 'valor' => 'Panadería', 'descripcion' => 'Nombre comercial mostrado en pantalla y tiquetes'],
            ['clave' => 'simbolo_moneda', 'valor' => '₡', 'descripcion' => 'Símbolo monetario del sistema'],
            ['clave' => 'modulo_clientes_activo', 'valor' => '1', 'descripcion' => 'Habilita o oculta el módulo de Clientes y Fiados (F2)'],
            ['clave' => 'modulo_inventario_activo', 'valor' => '1', 'descripcion' => 'Habilita o oculta el módulo de Inventario (F4)'],
            ['clave' => 'panel_botones_rapidos', 'valor' => '1', 'descripcion' => 'Muestra u oculta el panel de botones rápidos de panadería en caja'],
            ['clave' => 'impresion_escpos_activa', 'valor' => '0', 'descripcion' => 'Activa impresión térmica ESC/POS al cobrar'],
            ['clave' => 'ancho_papel_mm', 'valor' => '80', 'descripcion' => 'Ancho de rollo térmico (58 o 80 mm)'],
            ['clave' => 'nombre_impresora', 'valor' => 'POS-80', 'descripcion' => 'Nombre o recurso compartido de impresora en Windows'],
            ['clave' => 'ruta_respaldo_local', 'valor' => storage_path('app/backups'), 'descripcion' => 'Carpeta local de respaldos automáticos de SQLite'],
            ['clave' => 'ruta_respaldo_usb', 'valor' => '', 'descripcion' => 'Ruta opcional de llave maya (USB) para copia automática'],
            ['clave' => 'ruta_excel_maestro', 'valor' => '', 'descripcion' => 'Ruta opcional del archivo Excel consolidado diario'],
        ];

        foreach ($configuraciones as $config) {
            ConfiguracionSistema::firstOrCreate(['clave' => $config['clave']], $config);
        }

        // 3. Departamentos base
        $panaderia = Departamento::firstOrCreate(['nombre' => 'Panadería Propia']);
        Departamento::firstOrCreate(['nombre' => 'Coca-Cola']);
        Departamento::firstOrCreate(['nombre' => 'Dos Pinos']);
        Departamento::firstOrCreate(['nombre' => 'Abarrotes']);

        // 4. Productos de ejemplo con códigos cortos reservados (01, 02)
        Producto::firstOrCreate(
            ['codigo_barras' => '01'],
            [
                'departamento_id' => $panaderia->id,
                'nombre' => 'Baguette Tradicional',
                'precio_compra' => 250.00,
                'precio_venta' => 500.00,
                'controlar_stock' => false, // Stock infinito
                'mostrar_boton_rapido' => true,
            ]
        );

        Producto::firstOrCreate(
            ['codigo_barras' => '02'],
            [
                'departamento_id' => $panaderia->id,
                'nombre' => 'Promo 3 Baguettes',
                'precio_compra' => 750.00,
                'precio_venta' => 1300.00,
                'controlar_stock' => false,
                'mostrar_boton_rapido' => true,
            ]
        );
    }
}