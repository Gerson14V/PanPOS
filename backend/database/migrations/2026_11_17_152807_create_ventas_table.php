<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ventas', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('numero_ticket')->unique();
            $table->foreignId('turno_id')->constrained('turnos_caja')->restrictOnDelete();
            $table->foreignId('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->foreignId('cliente_id')->nullable()->constrained('clientes')->restrictOnDelete();
            $table->decimal('total', 10, 2);
            $table->enum('estado', ['completada', 'en_espera', 'anulada'])->default('completada');
            $table->string('motivo_anulacion')->nullable();
            $table->foreignId('anulada_por_usuario_id')->nullable()->constrained('usuarios')->restrictOnDelete();
            $table->dateTime('fecha_anulacion')->nullable();
            $table->timestamps();

            $table->index(['turno_id', 'estado']);
            $table->index(['cliente_id', 'estado']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ventas');
    }
};