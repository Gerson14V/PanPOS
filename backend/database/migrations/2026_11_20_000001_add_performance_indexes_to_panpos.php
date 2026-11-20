<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ventas', function (Blueprint $table) {
            $table->index(['estado', 'created_at'], 'ventas_estado_created_at_index');
        });

        Schema::table('detalle_ventas', function (Blueprint $table) {
            $table->index('producto_id', 'detalle_ventas_producto_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('ventas', function (Blueprint $table) {
            $table->dropIndex('ventas_estado_created_at_index');
        });

        Schema::table('detalle_ventas', function (Blueprint $table) {
            $table->dropIndex('detalle_ventas_producto_id_index');
        });
    }
};
