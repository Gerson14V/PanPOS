<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Migración aditiva (segura para bases de datos en uso):
 * - idempotency_key en movimientos_caja para que un reintento automático de
 *   F7/F8, préstamos o abonos nunca registre el mismo movimiento dos veces.
 * - Índice por cliente para recalcular saldos de fiados sin recorrer la tabla.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('movimientos_caja', 'idempotency_key')) {
            Schema::table('movimientos_caja', function (Blueprint $table) {
                $table->string('idempotency_key', 80)->nullable()->unique();
            });
        }

        if (!Schema::hasIndex('movimientos_caja', 'movimientos_caja_cliente_id_tipo_index')) {
            Schema::table('movimientos_caja', function (Blueprint $table) {
                $table->index(['cliente_id', 'tipo'], 'movimientos_caja_cliente_id_tipo_index');
            });
        }
    }

    public function down(): void
    {
        Schema::table('movimientos_caja', function (Blueprint $table) {
            $table->dropIndex('movimientos_caja_cliente_id_tipo_index');
            $table->dropUnique(['idempotency_key']);
            $table->dropColumn('idempotency_key');
        });
    }
};
