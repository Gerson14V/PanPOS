<?php

namespace App\Providers;

use Illuminate\Database\SQLiteConnection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // WAL, synchronous=FULL y busy_timeout=5000 ya se aplican desde config/database.php
        if (DB::connection() instanceof SQLiteConnection) {
            DB::statement('PRAGMA foreign_keys = ON;');
            DB::statement('PRAGMA temp_store = MEMORY;');
            DB::statement('PRAGMA cache_size = -16000;');
        }
    }
}
