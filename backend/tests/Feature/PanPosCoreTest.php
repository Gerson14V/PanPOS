<?php

namespace Tests\Feature;

use App\Models\Cliente;
use App\Models\Departamento;
use App\Models\Producto;
use App\Models\Usuario;
use App\Services\BackupService;
use App\Services\ReporteExcelDiarioService;
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

    private function prepararCaja(): array
    {
        $admin = Usuario::create([
            'nombre' => 'Admin Caja',
            'username' => 'admincaja',
            'password' => '1234',
            'rol' => 'admin',
            'activo' => true,
        ]);
        Sanctum::actingAs($admin);

        $dep = Departamento::create(['nombre' => 'Repostería']);
        $prod = Producto::create([
            'departamento_id' => $dep->id,
            'codigo_barras' => '02',
            'nombre' => 'Empanada',
            'precio_compra' => 300,
            'precio_venta' => 700,
            'controlar_stock' => true,
            'stock_actual' => 5,
            'stock_minimo' => 0,
        ]);

        $turnoId = $this->postJson('/api/turnos/abrir', ['monto_inicial' => 5000])
            ->assertStatus(201)
            ->json('id');

        return [$prod, $turnoId];
    }

    public function test_venta_devuelve_existencias_actualizadas_para_la_caja(): void
    {
        [$prod, $turnoId] = $this->prepararCaja();

        $res = $this->postJson('/api/ventas', [
            'idempotency_key' => 'venta-stock-1',
            'turno_id' => $turnoId,
            'estado' => 'completada',
            'items' => [['producto_id' => $prod->id, 'cantidad' => 2]],
            'pagos' => [['metodo_pago' => 'efectivo', 'monto' => 1400, 'monto_recibido' => 2000, 'vuelto_entregado' => 600]],
        ])->assertStatus(201);

        $this->assertSame([['id' => $prod->id, 'stock_actual' => 3]], $res->json('productos_actualizados'));

        $anulada = $this->postJson("/api/ventas/{$res->json('id')}/anular", ['motivo_anulacion' => 'Error de cobro'])
            ->assertStatus(200);
        $this->assertSame([['id' => $prod->id, 'stock_actual' => 5]], $anulada->json('productos_actualizados'));
    }

    public function test_movimiento_de_caja_reintentado_no_se_duplica(): void
    {
        [, $turnoId] = $this->prepararCaja();

        $payload = [
            'idempotency_key' => 'salida-unica-1',
            'tipo' => 'salida',
            'metodo_pago' => 'efectivo',
            'monto' => 1500,
            'concepto' => 'Pago a proveedor',
        ];

        $m1 = $this->postJson("/api/turnos/{$turnoId}/movimientos", $payload)->assertStatus(201);
        $m2 = $this->postJson("/api/turnos/{$turnoId}/movimientos", $payload)->assertStatus(201);

        $this->assertEquals($m1->json('id'), $m2->json('id'));
        $this->assertDatabaseCount('movimientos_caja', 1);

        $this->getJson("/api/turnos/{$turnoId}/efectivo")
            ->assertStatus(200)
            ->assertJson(['efectivo_disponible' => 3500]);
    }

    public function test_salida_mayor_al_efectivo_disponible_es_rechazada(): void
    {
        [, $turnoId] = $this->prepararCaja();

        $this->postJson("/api/turnos/{$turnoId}/movimientos", [
            'tipo' => 'salida',
            'metodo_pago' => 'efectivo',
            'monto' => 999999,
            'concepto' => 'Demasiado',
        ])->assertStatus(422)->assertJsonValidationErrors('monto');
    }

    public function test_corte_incluye_estadisticas_y_productos_mas_vendidos(): void
    {
        [$prod, $turnoId] = $this->prepararCaja();

        foreach ([1, 2] as $i) {
            $this->postJson('/api/ventas', [
                'idempotency_key' => "corte-{$i}",
                'turno_id' => $turnoId,
                'estado' => 'completada',
                'items' => [['producto_id' => $prod->id, 'cantidad' => $i]],
                'pagos' => [['metodo_pago' => 'efectivo', 'monto' => 700 * $i]],
            ])->assertStatus(201);
        }

        $this->postJson("/api/turnos/{$turnoId}/movimientos", [
            'tipo' => 'entrada', 'metodo_pago' => 'efectivo', 'monto' => 1000, 'concepto' => 'Monedas',
        ])->assertStatus(201);

        $resumen = $this->getJson("/api/turnos/{$turnoId}/resumen")->assertStatus(200);
        $resumen->assertJsonPath('estadisticas.cantidad_tickets', 2)
            ->assertJsonPath('estadisticas.articulos_vendidos', 3)
            ->assertJsonPath('top_productos.0.nombre', 'Empanada');
        $this->assertEquals(2100.0, (float) $resumen->json('ventas_totales'));
        $this->assertEquals(1050.0, (float) $resumen->json('estadisticas.ticket_promedio'));
        $this->assertEquals(8100.0, (float) $resumen->json('gaveta_efectivo.efectivo_esperado'));

        $dia = $this->getJson('/api/turnos/corte-dia')->assertStatus(200);
        $dia->assertJsonPath('estadisticas.cantidad_tickets', 2)
            ->assertJsonPath('turnos_del_dia.0.id', $turnoId);

        // El cierre normalmente respalda la BD y escribe el Excel en el Escritorio:
        // en pruebas se simulan para no tocar archivos reales del equipo.
        $this->mock(BackupService::class)->shouldReceive('generarRespaldo')->once()
            ->andReturn(['archivo' => 'prueba.sqlite', 'ruta_local' => '/tmp/prueba.sqlite', 'copiado_usb' => false, 'fecha' => now()->toDateTimeString()]);
        $this->mock(ReporteExcelDiarioService::class)->shouldReceive('actualizarArchivoMaestro')->once()
            ->andReturn(['guardado' => true, 'ruta' => '/tmp/prueba.xls', 'archivo' => 'prueba.xls', 'html' => '']);

        $cierre = $this->postJson("/api/turnos/{$turnoId}/cerrar", ['total_efectivo_contado' => 8000])
            ->assertStatus(200);
        $this->assertEquals(-100.0, (float) $cierre->json('turno.diferencia_arqueo'));
    }

    public function test_respaldo_diario_va_aparte_del_login_y_se_hace_una_vez(): void
    {
        Usuario::create([
            'nombre' => 'Cajera Mañana',
            'username' => 'manana',
            'password' => '1234',
            'rol' => 'cajero',
            'activo' => true,
        ]);

        // Se simula el respaldo real para no escribir archivos en el equipo
        $this->partialMock(BackupService::class)->shouldReceive('generarRespaldo')->once()
            ->andReturn(['archivo' => 'panpos_diario_prueba.sqlite', 'ruta_local' => '/tmp/x', 'copiado_usb' => false, 'fecha' => now()->toDateTimeString()]);

        // El login ya no respalda: responde de inmediato
        $token = $this->postJson('/api/auth/login', ['username' => 'manana', 'password' => '1234'])
            ->assertStatus(200)
            ->assertJsonMissingPath('respaldo_diario')
            ->json('token');

        $this->withToken($token)->postJson('/api/sistema/respaldo-diario')
            ->assertStatus(200)
            ->assertJsonPath('respaldo_diario', 'panpos_diario_prueba.sqlite');

        // Segunda vez el mismo día: no repite el respaldo
        $this->withToken($token)->postJson('/api/sistema/respaldo-diario')
            ->assertStatus(200)
            ->assertJsonPath('respaldo_diario', null);
    }

    public function test_turno_cerrado_o_duplicado_responde_con_errores_de_turno(): void
    {
        [$prod, $turnoId] = $this->prepararCaja();

        // Abrir otro turno con uno abierto: error en "turno" (la caja refresca su estado)
        $this->postJson('/api/turnos/abrir', ['monto_inicial' => 0])
            ->assertStatus(422)->assertJsonValidationErrors('turno');

        $this->mock(BackupService::class)->shouldReceive('generarRespaldo')->andReturn(['archivo' => 'x', 'ruta_local' => '/tmp/x', 'copiado_usb' => false, 'fecha' => '']);
        $this->mock(ReporteExcelDiarioService::class)->shouldReceive('actualizarArchivoMaestro')->andReturn(['guardado' => true, 'ruta' => '/tmp/x.xls', 'archivo' => 'x.xls', 'html' => '']);
        $this->postJson("/api/turnos/{$turnoId}/cerrar", ['total_efectivo_contado' => 5000])->assertStatus(200);

        // Otra ventana que no se enteró del cierre
        $this->postJson("/api/turnos/{$turnoId}/cerrar", ['total_efectivo_contado' => 5000])
            ->assertStatus(422)->assertJsonValidationErrors('turno');
        $this->postJson('/api/ventas', [
            'idempotency_key' => 'venta-turno-cerrado',
            'turno_id' => $turnoId,
            'estado' => 'completada',
            'items' => [['producto_id' => $prod->id, 'cantidad' => 1]],
            'pagos' => [['metodo_pago' => 'efectivo', 'monto' => 700]],
        ])->assertStatus(422)->assertJsonValidationErrors('turno_id');
        $this->postJson("/api/turnos/{$turnoId}/movimientos", [
            'tipo' => 'entrada', 'metodo_pago' => 'efectivo', 'monto' => 100, 'concepto' => 'x',
        ])->assertStatus(422)->assertJsonValidationErrors('turno');

        // La pantalla de ingreso sabe cuándo fue el último cierre
        $this->getJson('/api/sistema/publico')
            ->assertStatus(200)
            ->assertJsonPath('turno_activo', null)
            ->assertJsonPath('ultimo_cierre.id', $turnoId);
    }
}
