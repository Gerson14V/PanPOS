<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ventas', function (Blueprint $table) {
            $table->string('idempotency_key', 80)->nullable()->unique()->after('numero_ticket');
        });

        if (DB::getDriverName() === 'sqlite') {
            DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_un_solo_abierto_idx ON turnos_caja (estado) WHERE estado = 'abierto'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement("DROP INDEX IF EXISTS turnos_caja_un_solo_abierto_idx");
        }

        Schema::table('ventas', function (Blueprint $table) {
            $table->dropUnique(['idempotency_key']);
            $table->dropColumn('idempotency_key');
        });
    }
};
