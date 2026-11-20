<?php

namespace App\Services;

use App\Models\ConfiguracionSistema;
use App\Models\Venta;

class ImpresionTicketService
{
    public function imprimirVenta(Venta $venta): array
    {
        $config = ConfiguracionSistema::pluck('valor', 'clave');
        $activa = ($config['impresion_escpos_activa'] ?? '0') === '1';

        if (!$activa) {
            return [
                'impreso' => false,
                'mensaje' => 'Módulo de impresión térmica inactivo por configuración.',
            ];
        }

        return [
            'impreso' => false,
            'mensaje' => 'Impresión ESC/POS pendiente de conectar controlador físico.',
            'impresora' => $config['nombre_impresora'] ?? 'POS-80',
            'ancho_mm' => (int) ($config['ancho_papel_mm'] ?? 80),
            'ticket_numero' => $venta->numero_ticket,
        ];
    }
}
