<?php

namespace Tests\Feature;

use App\Models\Cliente;
use App\Models\Departamento;
use App\Models\Producto;
use App\Models\Usuario;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PanPosCoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_protegida_con_sanctum_y_roles(): void
    {
        $this->getJson('/api/productos')->assertStatus(401);

        $cajero = Usuario::create([
            'nombre' => 'Cajero Test',
            'username' => 'cajero1',
            'password' => '1234',
            'rol' => 'cajero',
            'activo' => true,
        ]);

        Sanctum::actingAs($cajero);
        $this->getJson('/api/productos')->assertStatus(200);
        $this->getJson('/api/usuarios')->assertStatus(403);
    }

    public function test_venta_usa_precio_de_bd_es_idempotente_y_recalcula_credito(): void
    {
        $admin = Usuario::create([
            'nombre' => 'Admin Test',
            'username' => 'admin1',
            'password' => '1234',
            'rol' => 'admin',
            'activo' => true,
        ]);
        Sanctum::actingAs($admin);

        $dep = Departamento::create(['nombre' => 'Panadería']);
        $prod = Producto::create([
            'departamento_id' => $dep->id,
            'codigo_barras' => '01',
            'nombre' => 'Baguette Real',
            'precio_compra' => 250,
            'precio_venta' => 500,
            'controlar_stock' => true,
            'stock_actual' => 10,
            'stock_minimo' => 0,
        ]);
        $cliente = Cliente::create(['nombre' => 'Cliente Fiado', 'saldo_deudor' => 0]);

        $turnoRes = $this->postJson('/api/turnos/abrir', ['monto_inicial' => 10000])->assertStatus(201);
        $turnoId = $turnoRes->json('id');

        // Intentar enviar precio falso (1 colón) y misma clave de idempotencia dos veces
        $payload = [
            'idempotency_key' => 'clave-unica-test-1',
            'turno_id' => $turnoId,
            'cliente_id' => $cliente->id,
            'estado' => 'completada',
            'items' => [
                ['producto_id' => $prod->id, 'descripcion_producto' => 'Hack', 'cantidad' => 2, 'precio_unitario' => 1],
            ],
            'pagos' => [
                ['metodo_pago' => 'credito', 'monto' => 1000],
            ],
        ];

        $v1 = $this->postJson('/api/ventas', $payload)->assertStatus(201);
        $v2 = $this->postJson('/api/ventas', $payload)->assertStatus(201);

        $this->assertEquals($v1->json('id'), $v2->json('id'));
        $this->assertEquals(1000.0, (float) $v1->json('total'));
        $this->assertEquals(8, $prod->fresh()->stock_actual);
        $this->assertEquals(1000.0, (float) $cliente->fresh()->saldo_deudor);

        // Anular venta y verificar que devuelve stock y saldo
        $this->postJson("/api/ventas/{$v1->json('id')}/anular", [
            'motivo_anulacion' => 'Prueba anulación',
        ])->assertStatus(200);

        $this->assertEquals(10, $prod->fresh()->stock_actual);
        $this->assertEquals(0.0, (float) $cliente->fresh()->saldo_deudor);
    }
}
