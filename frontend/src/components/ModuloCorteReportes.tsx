import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';

export const ModuloCorteReportes: React.FC = () => {
  const { turno, setTurno, usuario, recargarCatalogos } = usePos();
  const [subVista, setSubVista] = useState<'corte' | 'ventas_turno'>('corte');
  const [resumen, setResumen] = useState<any | null>(null);
  const [ventasTurno, setVentasTurno] = useState<any[]>([]);
  const [efectivoContado, setEfectivoContado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargarCorte = async () => {
    if (!turno) return;
    const [resCorte, resVentas] = await Promise.all([
      api.get(`/turnos/${turno.id}/resumen`),
      api.get(`/ventas?turno_id=${turno.id}`),
    ]);
    setResumen(resCorte.data);
    setVentasTurno(resVentas.data);
  };

  useEffect(() => {
    cargarCorte();
  }, [turno]);

  const anularTicket = async (ventaId: number, numeroTicket: number) => {
    const motivo = window.prompt(`Ingrese el motivo obligatorio para ANULAR el Ticket #${numeroTicket}:`);
    if (!motivo || !motivo.trim() || !usuario) return;

    await api.post(`/ventas/${ventaId}/anular`, {
      usuario_id: usuario.id,
      motivo_anulacion: motivo.trim(),
    });
    await cargarCorte();
    await recargarCatalogos();
    setMensaje(`Ticket #${numeroTicket} anulado y stock/saldo revertido.`);
  };

  const cerrarTurnoDefinitivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno) return;
    if (!window.confirm('¿Confirmas el CIERRE DE CAJA de este turno? Se generará respaldo automático de la base de datos.')) return;

    const res = await api.post(`/turnos/${turno.id}/cerrar`, {
      total_efectivo_contado: Number(efectivoContado),
      observaciones,
    });

    alert(`Turno cerrado con éxito.\nRespaldo automático creado: ${res.data.respaldo.archivo}`);
    setTurno(null);
  };

  const descargarExcelCorte = () => {
    if (!turno) return;
    window.open(`http://127.0.0.1:8000/api/turnos/${turno.id}/exportar-excel`, '_blank');
  };

  const esperado = resumen?.gaveta_efectivo?.efectivo_esperado || 0;
  const diferenciaVista = efectivoContado !== '' ? Number(efectivoContado) - esperado : 0;

  const renderBadgePago = (metodo: string) => {
    switch (metodo) {
      case 'efectivo':
        return 'bg-success';
      case 'sinpe':
        return 'bg-info text-dark';
      case 'tarjeta':
        return 'bg-primary';
      case 'credito':
        return 'bg-warning text-dark';
      default:
        return 'bg-secondary';
    }
  };

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className="alert alert-info alert-dismissible fade show py-2">
          {mensaje}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div className="btn-group">
          <button
            className={`btn fw-bold ${subVista === 'corte' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSubVista('corte')}
          >
            💰 Corte de Caja, Pagos y Movimientos del Día
          </button>
          <button
            className={`btn fw-bold ${subVista === 'ventas_turno' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSubVista('ventas_turno')}
          >
            🧾 Historial de Tickets y Anulaciones ({ventasTurno.length})
          </button>
        </div>

        <button className="btn btn-success fw-bold" onClick={descargarExcelCorte}>
          📥 Exportar Corte a Excel (.XLS)
        </button>
      </div>

      {subVista === 'corte' && resumen && (
        <div className="row g-3">
          <div className="col-lg-4">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-dark text-white fw-bold">
                1. Arqueo de Efectivo Físico en Gaveta
              </div>
              <div className="card-body">
                <ul className="list-group list-group-flush mb-3">
                  <li className="list-group-item d-flex justify-content-between">
                    <span>Fondo Inicial:</span>
                    <strong>+ ₡{resumen.gaveta_efectivo.monto_inicial.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between text-success">
                    <span>Ventas en Efectivo:</span>
                    <strong>+ ₡{resumen.gaveta_efectivo.ventas_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between text-success">
                    <span>Abonos de Clientes (Efectivo):</span>
                    <strong>+ ₡{resumen.gaveta_efectivo.abonos_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between text-success">
                    <span>F7 Entradas de Efectivo:</span>
                    <strong>+ ₡{resumen.gaveta_efectivo.entradas_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between text-danger">
                    <span>F8 Salidas de Efectivo:</span>
                    <strong>- ₡{resumen.gaveta_efectivo.salidas_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between text-danger">
                    <span>Préstamos de Efectivo a Clientes:</span>
                    <strong>- ₡{resumen.gaveta_efectivo.prestamos_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between fs-5 bg-body-secondary">
                    <span className="fw-bold">Efectivo Esperado en Caja:</span>
                    <strong className="text-primary">₡{esperado.toLocaleString()}</strong>
                  </li>
                </ul>

                <form onSubmit={cerrarTurnoDefinitivo} className="border-top pt-3">
                  <div className="mb-2">
                    <label className="form-label fw-bold">Efectivo Físico Contado al Cerrar (₡):</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control form-control-lg fw-bold"
                      value={efectivoContado}
                      onChange={(e) => setEfectivoContado(e.target.value)}
                      placeholder="Digite cuánto contó en billetes y monedas"
                      required
                    />
                  </div>

                  {efectivoContado !== '' && (
                    <div className={`alert py-2 fw-bold ${diferenciaVista === 0 ? 'alert-success' : diferenciaVista > 0 ? 'alert-info' : 'alert-danger'}`}>
                      {diferenciaVista === 0
                        ? '✅ Caja Cuadrada Exacta (₡0 diferencia)'
                        : diferenciaVista > 0
                        ? `➕ Sobrante en Caja: +₡${diferenciaVista.toLocaleString()}`
                        : `⚠️ Faltante en Caja: ₡${diferenciaVista.toLocaleString()}`}
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Observaciones del Cierre</label>
                    <input
                      className="form-control form-control-sm"
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Notas opcionales del turno..."
                    />
                  </div>

                  <button type="submit" className="btn btn-danger w-100 fw-bold btn-lg">
                    🔒 Cerrar Turno y Respaldar Base de Datos
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="col-lg-8">
            <div className="card shadow-sm border-0 mb-3">
              <div className="card-header bg-primary text-white fw-bold">
                2. Ventas del Turno por Método de Pago y Total Sumado
              </div>
              <div className="card-body">
                <div className="row g-2 text-center align-items-center">
                  <div className="col-md-2 col-6 border-end">
                    <div className="text-muted small fw-semibold">Efectivo</div>
                    <div className="fs-5 fw-bold text-success">₡{resumen.desglose_pagos.efectivo.toLocaleString()}</div>
                  </div>
                  <div className="col-md-2 col-6 border-end">
                    <div className="text-muted small fw-semibold">SINPE Móvil</div>
                    <div className="fs-5 fw-bold text-info">₡{resumen.desglose_pagos.sinpe.toLocaleString()}</div>
                  </div>
                  <div className="col-md-2 col-6 border-end">
                    <div className="text-muted small fw-semibold">Tarjeta</div>
                    <div className="fs-5 fw-bold text-primary">₡{resumen.desglose_pagos.tarjeta.toLocaleString()}</div>
                  </div>
                  <div className="col-md-2 col-6 border-end">
                    <div className="text-muted small fw-semibold">Crédito (Fiados)</div>
                    <div className="fs-5 fw-bold text-danger">₡{resumen.desglose_pagos.credito.toLocaleString()}</div>
                  </div>
                  <div className="col-md-4 col-12 bg-body-tertiary p-2 rounded">
                    <div className="text-uppercase small fw-bold text-muted">TOTAL VENTAS SUMADO</div>
                    <div className="fs-3 fw-bold text-primary">₡{resumen.ventas_totales.toLocaleString()}</div>
                    {usuario?.rol === 'admin' && (
                      <small className="text-success fw-bold">
                        Ganancia Bruta: ₡{resumen.ganancia_bruta_total.toLocaleString()}
                      </small>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm border-0">
              <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <span className="fw-bold">3. Movimientos de Caja del Día (Entradas, Salidas, Préstamos y Abonos)</span>
                <span className="badge bg-secondary">{resumen.movimientos_caja.length} registros</span>
              </div>
              <div className="table-responsive" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Hora</th>
                      <th>Tipo de Movimiento</th>
                      <th>Método</th>
                      <th>Cliente / Cajero</th>
                      <th>Concepto / Motivo</th>
                      <th className="text-end">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.movimientos_caja.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          No se han registrado entradas (F7), salidas (F8), préstamos ni abonos en este turno.
                        </td>
                      </tr>
                    ) : (
                      resumen.movimientos_caja.map((m: any) => {
                        const esIngreso = m.tipo === 'entrada' || m.tipo === 'abono_cliente';
                        return (
                          <tr key={m.id}>
                            <td className="small">{new Date(m.created_at).toLocaleTimeString()}</td>
                            <td>
                              <span
                                className={`badge ${
                                  m.tipo === 'entrada'
                                    ? 'bg-success'
                                    : m.tipo === 'abono_cliente'
                                    ? 'bg-info text-dark'
                                    : m.tipo === 'salida'
                                    ? 'bg-danger'
                                    : 'bg-warning text-dark'
                                }`}
                              >
                                {m.tipo === 'entrada' && 'F7 ENTRADA'}
                                {m.tipo === 'salida' && 'F8 SALIDA'}
                                {m.tipo === 'abono_cliente' && 'ABONO CLIENTE'}
                                {m.tipo === 'prestamo_cliente' && 'PRÉSTAMO CLIENTE'}
                              </span>
                            </td>
                            <td className="text-uppercase small fw-semibold">{m.metodo_pago}</td>
                            <td className="small">{m.cliente?.nombre || m.usuario?.nombre || '-'}</td>
                            <td>{m.concepto}</td>
                            <td className={`text-end fw-bold ${esIngreso ? 'text-success' : 'text-danger'}`}>
                              {esIngreso ? '+' : '-'} ₡{Number(m.monto).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial de Tickets del Turno con Método de Pago Utilizado */}
      {subVista === 'ventas_turno' && (
        <div className="card shadow-sm border-0">
          <div className="card-header fw-bold">Tickets Emitidos en el Turno Actual</div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-dark">
                <tr>
                  <th>Ticket #</th>
                  <th>Hora</th>
                  <th>Cliente</th>
                  <th>Artículos</th>
                  <th>Método de Pago</th>
                  <th>Estado</th>
                  <th className="text-end">Total</th>
                  <th className="text-end">Acción</th>
                </tr>
              </thead>
              <tbody>
                {ventasTurno.map((v) => (
                  <tr key={v.id} className={v.estado === 'anulada' ? 'table-danger' : ''}>
                    <td className="fw-bold">#{v.numero_ticket}</td>
                    <td className="small">{new Date(v.created_at).toLocaleTimeString()}</td>
                    <td>{v.cliente?.nombre || 'Cliente Contado'}</td>
                    <td className="small">
                      {v.detalles.map((d: any) => `${d.cantidad}x ${d.descripcion_producto}`).join(', ')}
                      {v.motivo_anulacion && (
                        <div className="text-danger fw-bold">Motivo anulación: {v.motivo_anulacion}</div>
                      )}
                    </td>
                    <td>
                      {v.pagos && v.pagos.length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {v.pagos.map((p: any, idx: number) => (
                            <span key={idx} className={`badge ${renderBadgePago(p.metodo_pago)}`}>
                              {p.metodo_pago.toUpperCase()}
                              {v.pagos.length > 1 ? `: ₡${Number(p.monto).toLocaleString()}` : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="badge bg-secondary">EN ESPERA</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${v.estado === 'completada' ? 'bg-success' : v.estado === 'anulada' ? 'bg-danger' : 'bg-warning text-dark'}`}>
                        {v.estado.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-end fw-bold">₡{Number(v.total).toLocaleString()}</td>
                    <td className="text-end">
                      {v.estado !== 'anulada' && (
                        <button
                          className="btn btn-sm btn-outline-danger fw-semibold"
                          onClick={() => anularTicket(v.id, v.numero_ticket)}
                        >
                          Anular Ticket
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
