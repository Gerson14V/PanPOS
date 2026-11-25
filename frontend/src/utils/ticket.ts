// Impresión de tiquetes en impresora térmica (58 u 80 mm) instalada en Windows.
// Se imprime desde un iframe oculto para no afectar la página ni el CSS del corte.
// Con "impresión silenciosa" activada, el lanzador abre Edge con --kiosk-printing
// y el tiquete sale directo a la impresora predeterminada, sin diálogo.

export interface LineaTicket {
  cantidad: number | string;
  descripcion_producto: string;
  precio_unitario: number | string;
  subtotal: number | string;
}

export interface PagoTicket {
  metodo_pago: string;
  monto: number | string;
  monto_recibido?: number | string | null;
  vuelto_entregado?: number | string | null;
}

export interface VentaTicket {
  numero_ticket: number;
  numero_dia?: number | null;
  created_at?: string;
  total: number | string;
  estado?: string;
  detalles?: LineaTicket[];
  pagos?: PagoTicket[];
  cliente?: { nombre: string } | null;
  usuario?: { nombre: string } | null;
}

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  sinpe: 'SINPE Móvil',
  credito: 'Crédito (fiado)',
};

/** Número que ve el cajero: reinicia cada día (el folio global queda como respaldo). */
export const numeroTicket = (v: { numero_dia?: number | null; numero_ticket: number }): number =>
  v.numero_dia ?? v.numero_ticket;

const escapar = (texto: unknown): string =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const monto = (n: unknown): string =>
  `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generarHtmlTicket = (venta: VentaTicket, config: Record<string, string>, copia = false): string => {
  const ancho = config['ancho_papel_mm'] === '58' ? 58 : 80;
  const fecha = venta.created_at ? new Date(venta.created_at) : new Date();
  const lineas = (venta.detalles || [])
    .map(
      (d) => `
      <tr><td colspan="2" class="desc">${escapar(d.descripcion_producto)}</td></tr>
      <tr><td class="det">${Number(d.cantidad)} x ${monto(d.precio_unitario)}</td><td class="num">${monto(d.subtotal)}</td></tr>`
    )
    .join('');

  const pagos = (venta.pagos || [])
    .map((p) => {
      let filas = `<tr><td>${escapar(METODOS[p.metodo_pago] || p.metodo_pago)}</td><td class="num">${monto(p.monto)}</td></tr>`;
      if (p.metodo_pago === 'efectivo' && Number(p.monto_recibido) > 0) {
        filas += `<tr><td class="det">Recibido</td><td class="num">${monto(p.monto_recibido)}</td></tr>`;
        filas += `<tr><td class="det">Vuelto</td><td class="num">${monto(p.vuelto_entregado)}</td></tr>`;
      }
      return filas;
    })
    .join('');

  const datosNegocio = [config['cedula_negocio'] && `Céd: ${config['cedula_negocio']}`, config['telefono_negocio'] && `Tel: ${config['telefono_negocio']}`]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tiquete #${numeroTicket(venta)}</title>
<style>
  @page { size: ${ancho}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; width: ${ancho - 4}mm; font-family: 'Segoe UI', Arial, sans-serif; font-size: ${ancho === 58 ? 10 : 11.5}px; color: #000; }
  .centro { text-align: center; }
  h1 { font-size: 1.35em; margin: 0 0 2px; }
  .peq { font-size: 0.85em; }
  hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .desc { font-weight: 600; }
  .det { padding-left: 6px; }
  .num { text-align: right; white-space: nowrap; }
  .total td { font-size: 1.3em; font-weight: 800; padding-top: 3px; }
  .anulado { border: 2px solid #000; text-align: center; font-weight: 800; padding: 2px; margin: 4px 0; }
</style></head><body>
  <div class="centro">
    <h1>${escapar(config['nombre_negocio'] || 'PanPOS')}</h1>
    ${config['encabezado_ticket'] ? `<div>${escapar(config['encabezado_ticket'])}</div>` : ''}
    ${datosNegocio ? `<div class="peq">${escapar(datosNegocio)}</div>` : ''}
    ${config['direccion_negocio'] ? `<div class="peq">${escapar(config['direccion_negocio'])}</div>` : ''}
  </div>
  <hr>
  <table class="peq">
    <tr><td>Tiquete</td><td class="num"><strong>#${numeroTicket(venta)}</strong>${copia ? ' (COPIA)' : ''}</td></tr>
    ${venta.numero_dia ? `<tr><td>Folio</td><td class="num">${venta.numero_ticket}</td></tr>` : ''}
    <tr><td>Fecha</td><td class="num">${fecha.toLocaleDateString('es-CR')} ${fecha.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</td></tr>
    ${venta.usuario?.nombre ? `<tr><td>Atendió</td><td class="num">${escapar(venta.usuario.nombre)}</td></tr>` : ''}
    ${venta.cliente?.nombre ? `<tr><td>Cliente</td><td class="num">${escapar(venta.cliente.nombre)}</td></tr>` : ''}
  </table>
  ${venta.estado === 'anulada' ? '<div class="anulado">TIQUETE ANULADO</div>' : ''}
  <hr>
  <table>${lineas}</table>
  <hr>
  <table class="total"><tr><td>TOTAL</td><td class="num">${monto(venta.total)}</td></tr></table>
  ${pagos ? `<hr><table>${pagos}</table>` : ''}
  <hr>
  <div class="centro">${escapar(config['mensaje_ticket'] || '¡Gracias por su compra!').replace(/\n/g, '<br>')}</div>
  ${config['sinpe_telefono_receptor'] ? `<div class="centro peq" style="margin-top:3px">SINPE Móvil: ${escapar(config['sinpe_telefono_receptor'])}</div>` : ''}
</body></html>`;
};

/** Imprime un documento HTML en la impresora predeterminada desde un iframe oculto. */
const imprimirHtml = (html: string): void => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  iframe.contentWindow!.onafterprint = () => window.setTimeout(() => iframe.remove(), 1000);
  // Pequeña espera para que el navegador termine de maquetar el tiquete
  // Quien tenía el foco (normalmente el buscador de la caja) lo recupera al terminar
  const enfocadoAntes = document.activeElement as HTMLElement | null;
  window.setTimeout(() => {
    try {
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
    } finally {
      // Devolver el foco a la caja: si queda dentro del iframe, F12/ESC/escáner dejan de funcionar
      window.focus();
      enfocadoAntes?.focus?.();
      window.setTimeout(() => iframe.remove(), 60000);
    }
  }, 150);
};

/** Imprime el tiquete de una venta en la impresora predeterminada de Windows. */
export const imprimirTicket = (venta: VentaTicket, config: Record<string, string>, copia = false): void =>
  imprimirHtml(generarHtmlTicket(venta, config, copia));

// ----------------------------------------------------------------------------
// Tiquete de corte de caja (formato rollo térmico)
// ----------------------------------------------------------------------------
export interface ResumenCorteTicket {
  es_corte_dia: boolean;
  fecha?: string;
  turno: {
    id: number | null;
    estado: string;
    fecha_apertura: string;
    fecha_cierre?: string | null;
    total_efectivo_contado?: number | string | null;
    diferencia_arqueo?: number | string | null;
    usuario?: { nombre?: string } | null;
  };
  ventas_totales: number | string;
  desglose_pagos: Record<string, number | string>;
  gaveta_efectivo: Record<string, number | string>;
  estadisticas?: { cantidad_tickets: number; ticket_promedio: number | string; articulos_vendidos: number };
  anulaciones?: { cantidad: number; monto_total_anulado: number | string };
  ventas_por_departamento?: { departamento: string; total_ventas: number | string }[];
}

export const generarHtmlCorte = (r: ResumenCorteTicket, config: Record<string, string>): string => {
  const ancho = config['ancho_papel_mm'] === '58' ? 58 : 80;
  const g = r.gaveta_efectivo;
  const fila = (etiqueta: string, valor: unknown, signo = '') =>
    `<tr><td>${escapar(etiqueta)}</td><td class="num">${signo}${monto(valor)}</td></tr>`;
  const hora = (f?: string | null) =>
    f ? new Date(f).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) : 'en curso';
  const contado = r.turno.total_efectivo_contado;
  const diferencia = Number(r.turno.diferencia_arqueo ?? 0);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Corte de caja</title>
<style>
  @page { size: ${ancho}mm auto; margin: 2mm; }
  body { margin: 0; width: ${ancho - 4}mm; font-family: 'Segoe UI', Arial, sans-serif; font-size: ${ancho === 58 ? 10 : 11.5}px; color: #000; }
  .centro { text-align: center; } h1 { font-size: 1.3em; margin: 0; } h2 { font-size: 1.05em; margin: 4px 0 2px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; }
  .num { text-align: right; white-space: nowrap; } .fuerte td { font-weight: 800; font-size: 1.15em; }
  .firma { margin-top: 22px; border-top: 1px solid #000; text-align: center; padding-top: 2px; }
</style></head><body>
  <div class="centro">
    <h1>${escapar(config['nombre_negocio'] || 'PanPOS')}</h1>
    <h2>${r.es_corte_dia ? 'CORTE DEL DÍA' : `CORTE DE CAJERO · TURNO #${r.turno.id}`}</h2>
    <div>${escapar(r.turno.usuario?.nombre || '')}</div>
    <div>${new Date(r.turno.fecha_apertura).toLocaleDateString('es-CR')} · ${hora(r.turno.fecha_apertura)} a ${hora(r.turno.fecha_cierre)}</div>
  </div>
  <hr>
  <table>
    ${fila('Ventas totales', r.ventas_totales)}
    ${r.estadisticas ? `<tr><td>Tiquetes</td><td class="num">${r.estadisticas.cantidad_tickets}</td></tr>${fila('Tiquete promedio', r.estadisticas.ticket_promedio)}<tr><td>Artículos</td><td class="num">${r.estadisticas.articulos_vendidos}</td></tr>` : ''}
  </table>
  <hr>
  <table>
    ${fila('Efectivo', r.desglose_pagos.efectivo)}
    ${fila('SINPE Móvil', r.desglose_pagos.sinpe)}
    ${fila('Tarjeta', r.desglose_pagos.tarjeta)}
    ${fila('Crédito (fiados)', r.desglose_pagos.credito)}
    ${r.anulaciones && r.anulaciones.cantidad > 0 ? fila(`Anulados (${r.anulaciones.cantidad})`, r.anulaciones.monto_total_anulado) : ''}
  </table>
  <hr>
  <table>
    ${fila('Fondo de caja', g.monto_inicial)}
    ${fila('Ventas efectivo', g.ventas_efectivo, '+ ')}
    ${fila('Abonos', g.abonos_efectivo, '+ ')}
    ${fila('Entradas (F7)', g.entradas_efectivo, '+ ')}
    ${fila('Salidas (F8)', g.salidas_efectivo, '- ')}
    ${fila('Préstamos', g.prestamos_efectivo, '- ')}
  </table>
  <table class="fuerte">${fila('Esperado en caja', g.efectivo_esperado)}</table>
  ${contado !== null && contado !== undefined ? `<table>${fila('Contado', contado)}</table><table class="fuerte"><tr><td>${diferencia === 0 ? 'CAJA EXACTA' : diferencia > 0 ? 'SOBRANTE' : 'FALTANTE'}</td><td class="num">${monto(Math.abs(diferencia))}</td></tr></table>` : ''}
  ${(r.ventas_por_departamento || []).length ? `<hr><table>${(r.ventas_por_departamento || []).map((d) => fila(d.departamento, d.total_ventas)).join('')}</table>` : ''}
  <hr>
  <div class="centro">Impreso: ${new Date().toLocaleString('es-CR')}</div>
  <div class="firma">Firma del cajero</div>
</body></html>`;
};

export const imprimirCorte = (resumen: ResumenCorteTicket, config: Record<string, string>): void =>
  imprimirHtml(generarHtmlCorte(resumen, config));

