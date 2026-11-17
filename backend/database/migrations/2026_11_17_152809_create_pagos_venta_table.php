<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pagos_venta', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venta_id')->constrained('ventas')->cascadeOnDelete();
            $table->enum('metodo_pago', ['efectivo', 'tarjeta', 'sinpe', 'credito']);
            $table->decimal('monto', 10, 2);
            $table->decimal('monto_recibido', 10, 2)->nullable();
            $table->decimal('vuelto_entregado', 10, 2)->nullable();

            $table->index(['venta_id', 'metodo_pago']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pagos_venta');
    }
};