<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migración aditiva: número de ticket por día (#1, #2... reinicia cada día).
 * numero_ticket se conserva como folio global único (auditoría, historial).
 * Los tickets existentes se numeran por su fecha para que el día en curso
 * continúe la secuencia correcta.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('ventas', 'numero_dia')) {
            Schema::table('ventas', function (Blueprint $table) {
                $table->unsignedInteger('numero_dia')->nullable();
            });
        }

        if (!Schema::hasIndex('ventas', 'ventas_created_at_index')) {
            Schema::table('ventas', function (Blueprint $table) {
                $table->index('created_at', 'ventas_created_at_index');
            });
        }

        DB::transaction(function () {
            $contadores = [];
            DB::table('ventas')
                ->whereNull('numero_dia')
                ->orderBy('created_at')
                ->orderBy('id')
                ->select('id', 'created_at')
                ->chunk(500, function ($ventas) use (&$contadores) {
                    foreach ($ventas as $venta) {
                        $dia = substr((string) $venta->created_at, 0, 10);
                        $contadores[$dia] = ($contadores[$dia] ?? 0) + 1;
                        DB::table('ventas')->where('id', $venta->id)->update(['numero_dia' => $contadores[$dia]]);
                    }
                });
        });
    }

    public function down(): void
    {
        Schema::table('ventas', function (Blueprint $table) {
            $table->dropIndex('ventas_created_at_index');
            $table->dropColumn('numero_dia');
        });
    }
};
