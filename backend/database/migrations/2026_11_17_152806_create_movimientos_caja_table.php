<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movimientos_caja', function (Blueprint $table) {
            $table->id();
            $table->foreignId('turno_id')->constrained('turnos_caja')->restrictOnDelete();
            $table->foreignId('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->restrictOnDelete();
            $table->enum('tipo', ['entrada', 'salida', 'prestamo_cliente', 'abono_cliente']);
            $table->enum('metodo_pago', ['efectivo', 'tarjeta', 'sinpe'])->default('efectivo');
            $table->decimal('monto', 10, 2);
            $table->string('concepto');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['turno_id', 'tipo']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movimientos_caja');
    }
};