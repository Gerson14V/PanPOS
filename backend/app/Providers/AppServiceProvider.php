<?php

namespace App\Providers;

use Illuminate\Database\Events\ConnectionEstablished;
use Illuminate\Database\SQLiteConnection;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Solo aplica PRAGMAs cuando realmente se abre una conexión SQLite
        // (las peticiones estáticas no abren la BD) y con caché de 8 MB acorde a 4 GB RAM.
        Event::listen(ConnectionEstablished::class, function (ConnectionEstablished $event): void {
            if ($event->connection instanceof SQLiteConnection) {
                $event->connection->statement('PRAGMA foreign_keys = ON;');
                $event->connection->statement('PRAGMA temp_store = MEMORY;');
                $event->connection->statement('PRAGMA cache_size = -8000;');
            }
        });
    }
}
