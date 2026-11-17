<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('turnos_caja', function (Blueprint $table) {
            $table->id();
            $table->foreignId('usuario_id')->constrained('usuarios')->restrictOnDelete();
            $table->dateTime('fecha_apertura');
            $table->dateTime('fecha_cierre')->nullable();
            $table->enum('estado', ['abierto', 'cerrado'])->default('abierto');
            $table->decimal('monto_inicial', 10, 2);
            $table->decimal('total_efectivo_esperado', 10, 2)->nullable();
            $table->decimal('total_efectivo_contado', 10, 2)->nullable();
            $table->decimal('diferencia_arqueo', 10, 2)->nullable();
            $table->text('observaciones')->nullable();
            $table->timestamps();

            $table->index(['estado', 'fecha_apertura']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('turnos_caja');
    }
};