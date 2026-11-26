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

    public function test_eliminar_cajero_con_solo_movimientos_lo_desactiva_sin_error(): void
    {
        [, $turnoId] = $this->prepararCaja();
        $cajera = Usuario::create(['nombre' => 'Cajera Tarde', 'username' => 'tarde', 'password' => '1234', 'rol' => 'cajero', 'activo' => true]);
        $tokenCajera = $cajera->createToken('panpos-terminal')->plainTextToken;

        // La cajera solo registró una entrada en el turno del administrador
        \App\Models\MovimientoCaja::create([
            'turno_id' => $turnoId, 'usuario_id' => $cajera->id, 'tipo' => 'entrada',
            'metodo_pago' => 'efectivo', 'monto' => 500, 'concepto' => 'Monedas',
        ]);

        $this->deleteJson("/api/usuarios/{$cajera->id}")->assertStatus(200);
        $this->assertFalse((bool) $cajera->fresh()->activo);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertNotNull($tokenCajera);
    }

    public function test_cambiar_contrasena_cierra_las_otras_sesiones_del_usuario(): void
    {
        $this->prepararCaja();
        $cajera = Usuario::create(['nombre' => 'Cajera Noche', 'username' => 'noche', 'password' => '1234', 'rol' => 'cajero', 'activo' => true]);
        $cajera->createToken('panpos-terminal');

        $this->putJson("/api/usuarios/{$cajera->id}", ['password' => 'nueva123'])->assertStatus(200);
        $this->assertSame(0, $cajera->tokens()->count());
    }

    public function test_proveedor_eliminado_se_puede_volver_a_crear(): void
    {
        [$prod] = $this->prepararCaja();
        $dep = $prod->departamento;

        // Con productos en el historial el proveedor solo se desactiva
        $prod->update(['activo' => false]);
        $this->deleteJson("/api/departamentos/{$dep->id}")->assertStatus(200);
        $this->assertFalse((bool) $dep->fresh()->activo);

        $this->postJson('/api/departamentos', ['nombre' => $dep->nombre])
            ->assertStatus(201)
            ->assertJsonPath('id', $dep->id)
            ->assertJsonPath('activo', true);

        // Un proveedor activo con el mismo nombre sí se rechaza, en español
        $this->postJson('/api/departamentos', ['nombre' => $dep->nombre])
            ->assertStatus(422)
            ->assertJsonPath('errors.nombre.0', 'Ya existe un registro con ese nombre.');
    }

    public function test_errores_de_validacion_en_espanol(): void
    {
        [$prod] = $this->prepararCaja();

        $this->postJson('/api/productos', [
            'departamento_id' => $prod->departamento_id,
            'codigo_barras' => $prod->codigo_barras,
            'nombre' => 'Repetido',
            'precio_compra' => 0,
            'precio_venta' => 'abc',
            'controlar_stock' => false,
        ])->assertStatus(422)
            ->assertJsonPath('errors.codigo_barras.0', 'Ya existe un registro con ese código de barras.')
            ->assertJsonPath('errors.precio_venta.0', 'El campo precio de venta debe ser un número.');
    }

    public function test_respaldo_manual_fallido_explica_el_problema(): void
    {
        $this->prepararCaja();
        $this->mock(BackupService::class)->shouldReceive('generarRespaldo')->andThrow(new \RuntimeException('disco lleno'));

        $this->postJson('/api/sistema/backup')
            ->assertStatus(422)
            ->assertJsonValidationErrors('respaldo');
    }

    private function vender(int $turnoId, Producto $prod, int $cantidad, string $clave): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/ventas', [
            'idempotency_key' => $clave,
            'turno_id' => $turnoId,
            'estado' => 'completada',
            'items' => [['producto_id' => $prod->id, 'cantidad' => $cantidad]],
            'pagos' => [['metodo_pago' => 'efectivo', 'monto' => 700 * $cantidad]],
        ])->assertStatus(201);
    }

    public function test_turno_de_varios_dias_numera_y_corta_por_dia(): void
    {
        \Illuminate\Support\Carbon::setTestNow('2026-11-23 08:00:00');
        [$prod, $turnoId] = $this->prepararCaja(); // fondo 5000, 5 empanadas a 700

        $this->vender($turnoId, $prod, 1, 'd1-a')->assertJsonPath('numero_dia', 1);
        $this->vender($turnoId, $prod, 1, 'd1-b')->assertJsonPath('numero_dia', 2);
        $this->postJson("/api/turnos/{$turnoId}/movimientos", [
            'tipo' => 'salida', 'metodo_pago' => 'efectivo', 'monto' => 400, 'concepto' => 'Hielo',
        ])->assertStatus(201);

        // Día siguiente, mismo turno abierto: el conteo vuelve a empezar
        \Illuminate\Support\Carbon::setTestNow('2026-11-24 09:00:00');
        $v = $this->vender($turnoId, $prod, 2, 'd2-a')->assertJsonPath('numero_dia', 1);
        $this->assertSame(3, (int) $v->json('numero_ticket')); // folio global continúa

        // Ventas del Día: solo las de hoy
        $this->getJson('/api/ventas?fecha=2026-11-24')->assertStatus(200)->assertJsonCount(1);
        $this->getJson('/api/ventas?fecha=24-11-2026')->assertStatus(422);

        // Corte del día de hoy: solo lo de hoy; el efectivo inicial es lo que quedó ayer
        $hoy = $this->getJson('/api/turnos/corte-dia?fecha=2026-11-24')->assertStatus(200);
        $hoy->assertJsonPath('sin_datos', false)
            ->assertJsonPath('estadisticas.cantidad_tickets', 1)
            ->assertJsonPath('turno.estado', 'abierto')
            ->assertJsonPath('turnos_del_dia.0.viene_de_otro_dia', true);
        $this->assertEquals(6000.0, (float) $hoy->json('gaveta_efectivo.monto_inicial')); // 5000 + 1400 - 400
        $this->assertEquals(7400.0, (float) $hoy->json('gaveta_efectivo.efectivo_esperado'));
        $this->assertEquals(1400.0, (float) $hoy->json('ventas_totales'));

        // Día anterior: sus 2 tickets y queda marcado sin cierre (el turno continuó)
        $ayer = $this->getJson('/api/turnos/corte-dia?fecha=2026-11-23')->assertStatus(200);
        $ayer->assertJsonPath('estadisticas.cantidad_tickets', 2)->assertJsonPath('turno.estado', 'sin_cierre');

        // Corte de cajero (turno): acumula los dos días para cuadrar la gaveta
        $this->getJson("/api/turnos/{$turnoId}/resumen")->assertJsonPath('estadisticas.cantidad_tickets', 3);

        // Lista de días con su cantidad de tickets
        $this->getJson('/api/turnos/fechas-disponibles')->assertStatus(200)
            ->assertJsonPath('0.fecha', '2026-11-24')->assertJsonPath('0.cantidad_tickets', 1)->assertJsonPath('0.estado', 'abierto')
            ->assertJsonPath('1.fecha', '2026-11-23')->assertJsonPath('1.cantidad_tickets', 2)->assertJsonPath('1.estado', 'sin_cierre');

        // Excel diario: una fila por día con sus propias ventas
        $html = app(ReporteExcelDiarioService::class)->generarHtmlMaestro();
        $this->assertStringContainsString('23/11/2026', $html);
        $this->assertStringContainsString('24/11/2026', $html);
        $this->assertStringContainsString('SIN CIERRE', $html);
        $this->assertStringContainsString('TURNO ABIERTO', $html);

        // Un día futuro no tiene datos aunque el turno siga abierto
        $this->getJson('/api/turnos/corte-dia?fecha=2026-11-30')->assertJsonPath('sin_datos', true);

        \Illuminate\Support\Carbon::setTestNow();
    }

    public function test_ticket_en_espera_cobrado_otro_dia_toma_el_numero_de_ese_dia(): void
    {
        \Illuminate\Support\Carbon::setTestNow('2026-11-23 18:00:00');
        [$prod, $turnoId] = $this->prepararCaja();
        $this->vender($turnoId, $prod, 1, 'e-1');
        $espera = $this->postJson('/api/ventas', [
            'idempotency_key' => 'e-espera', 'turno_id' => $turnoId, 'estado' => 'en_espera',
            'items' => [['producto_id' => $prod->id, 'cantidad' => 1]],
        ])->assertStatus(201)->assertJsonPath('numero_dia', 2);

        \Illuminate\Support\Carbon::setTestNow('2026-11-24 07:00:00');
        $this->postJson('/api/ventas', [
            'idempotency_key' => 'e-cobro', 'venta_en_espera_id' => $espera->json('id'), 'turno_id' => $turnoId,
            'estado' => 'completada', 'items' => [['producto_id' => $prod->id, 'cantidad' => 1]],
            'pagos' => [['metodo_pago' => 'efectivo', 'monto' => 700]],
        ])->assertStatus(201)->assertJsonPath('numero_dia', 1);

        \Illuminate\Support\Carbon::setTestNow();
    }

    public function test_auditoria_estabilidad_productos_clientes_fechas_y_autoeliminacion(): void
    {
        [$prod, $turnoId] = $this->prepararCaja();

        // 1. stock_minimo se respeta al crear producto
        $creado = $this->postJson('/api/productos', [
            'departamento_id' => $prod->departamento_id,
            'codigo_barras' => '09',
            'nombre' => 'Pan Integral',
            'precio_compra' => 400,
            'precio_venta' => 900,
            'controlar_stock' => true,
            'stock_actual' => 10,
            'stock_minimo' => 3,
        ])->assertStatus(201);
        $this->assertSame(3, (int) $creado->json('stock_minimo'));

        // 2. Producto desactivado no se puede vender
        $prod->update(['activo' => false]);
        $this->postJson('/api/ventas', [
            'idempotency_key' => 'venta-inactivo-1',
            'turno_id' => $turnoId,
            'estado' => 'completada',
            'items' => [['producto_id' => $prod->id, 'cantidad' => 1]],
            'pagos' => [['metodo_pago' => 'efectivo', 'monto' => 700]],
        ])->assertStatus(422)->assertJsonValidationErrors('items');
        $prod->update(['activo' => true]);

        // 3. Venta y anulación a crédito devuelven cliente_actualizado con saldo exacto
        $cliente = Cliente::create(['nombre' => 'Doña Marta', 'saldo_deudor' => 0, 'activo' => true]);
        $ventaCredito = $this->postJson('/api/ventas', [
            'idempotency_key' => 'credito-saldo-1',
            'turno_id' => $turnoId,
            'cliente_id' => $cliente->id,
            'estado' => 'completada',
            'items' => [['producto_id' => $prod->id, 'cantidad' => 1]],
            'pagos' => [['metodo_pago' => 'credito', 'monto' => 700]],
        ])->assertStatus(201);
        $this->assertSame(['id' => $cliente->id, 'saldo_deudor' => 700], $ventaCredito->json('cliente_actualizado'));

        // Abono total deja saldo exactamente en 0
        $this->postJson("/api/clientes/{$cliente->id}/operacion-credito", [
            'turno_id' => $turnoId,
            'tipo' => 'abono_cliente',
            'metodo_pago' => 'efectivo',
            'monto' => 700,
            'concepto' => 'Cancela cuenta',
        ])->assertStatus(201);
        $this->assertEquals(0.0, (float) $cliente->fresh()->saldo_deudor);

        // 4. Cliente desactivado no puede recibir crédito ni préstamo
        $cliente->update(['activo' => false]);
        $this->postJson('/api/ventas', [
            'idempotency_key' => 'credito-inactivo-1',
            'turno_id' => $turnoId,
            'cliente_id' => $cliente->id,
            'estado' => 'completada',
            'items' => [['producto_id' => $prod->id, 'cantidad' => 1]],
            'pagos' => [['metodo_pago' => 'credito', 'monto' => 700]],
        ])->assertStatus(422)->assertJsonValidationErrors('cliente_id');

        $this->postJson("/api/clientes/{$cliente->id}/operacion-credito", [
            'turno_id' => $turnoId,
            'tipo' => 'prestamo_cliente',
            'metodo_pago' => 'efectivo',
            'monto' => 500,
            'concepto' => 'Préstamo bloqueado',
        ])->assertStatus(422)->assertJsonValidationErrors('cliente_id');

        // 5. Reporte por periodo valida fechas (422 en lugar de 500)
        $this->getJson('/api/reportes/ventas-periodo?desde=fecha-mala&hasta=2026-11-25')
            ->assertStatus(422)
            ->assertJsonValidationErrors('desde');

        // 6. Un administrador no puede eliminarse a sí mismo (aunque haya otro admin)
        Usuario::create([
            'nombre' => 'Otro Admin',
            'username' => 'admin2',
            'password' => '1234',
            'rol' => 'admin',
            'activo' => true,
        ]);
        $adminActual = Usuario::where('username', 'admincaja')->firstOrFail();
        $this->deleteJson("/api/usuarios/{$adminActual->id}")
            ->assertStatus(422)
            ->assertJsonValidationErrors('usuario');
    }
}
