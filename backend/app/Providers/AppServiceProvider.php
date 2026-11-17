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
        // Blindaje de SQLite contra cortes de energía e integridad referencial
        if (DB::connection() instanceof SQLiteConnection) {
            DB::statement('PRAGMA journal_mode = WAL;');
            DB::statement('PRAGMA synchronous = FULL;');
            DB::statement('PRAGMA foreign_keys = ON;');
            DB::statement('PRAGMA busy_timeout = 5000;');
        }
    }
}