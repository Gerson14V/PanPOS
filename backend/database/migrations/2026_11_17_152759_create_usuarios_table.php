<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('usuarios', function (Blueprint $table) {
            $table->id();
            $table->string('nombre');
            $table->string('username')->unique();
            $table->string('password');
            $table->enum('rol', ['admin', 'cajero'])->default('cajero');
            $table->boolean('activo')->default(true);
            $table->enum('tema_preferido', ['light', 'dark'])->default('light');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('usuarios');
    }
};