import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';

export const ModuloCorteReportes: React.FC = () => {
  const { turno, setTurno, usuario, recargarCatalogos } = usePos();
  const [subVista, setSubVista] = useState<'corte' | 'ventas_turno' | 'reporte_periodo'>('corte');
  const [resumen, setResumen] = useState<any | null>(null);
  const [ventasTurno, setVentasTurno] = useState<any[]>([]);
  const [efectivoContado, setEfectivoContado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Reporte por rango de fechas
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [reporteFechas, setReporteFechas] = useState<any | null>(null);

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

  const consultarPeriodo = async () => {
    const res = await api.get(`/reportes/ventas-periodo?desde=${desde}&hasta=${hasta}`);
    setReporteFechas(res.data);
  };

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
            💰 Corte y Arqueo del Turno Actual
          </button>
          <button
            className={`btn fw-bold ${subVista === 'ventas_turno' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSubVista('ventas_turno')}
          >
            🧾 Historial de Tickets y Anulaciones ({ventasTurno.length})
          </button>
          {usuario?.rol === 'admin' && (
            <button
              className={`btn fw-bold ${subVista === 'reporte_periodo' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => {
                setSubVista('reporte_periodo');
                consultarPeriodo();
              }}
            >
              📊 Reporte de Ventas y Ganancias por Fechas
            </button>
          )}
        </div>

        <button className="btn btn-success fw-bold" onClick={descargarExcelCorte}>
          📥 Exportar Corte a Excel (.CSV)
        </button>
      </div>

      {subVista === 'corte' && resumen && (
        <div className="row g-3">
          {/* Columna 1: Dinero en Gaveta */}
          <div className="col-lg-4">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-dark text-white fw-bold">
                1. Arqueo de Efectivo en Gaveta
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
                    <span>F8 Salidas / Gastos en Efectivo:</span>
                    <strong>- ₡{resumen.gaveta_efectivo.salidas_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between text-danger">
                    <span>Préstamos de Efectivo a Clientes:</span>
                    <strong>- ₡{resumen.gaveta_efectivo.prestamos_efectivo.toLocaleString()}</strong>
                  </li>
                  <li className="list-group-item d-flex justify-content-between fs-5 bg-body-secondary">
                    <span className="fw-bold">Efectivo Esperado:</span>
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

          {/* Columna 2: Totales por Método de Pago y Ganancia por Departamento */}
          <div className="col-lg-8">
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="card shadow-sm border-0 bg-primary text-white">
                  <div className="card-body">
                    <div className="small text-uppercase fw-bold opacity-75">Ventas Totales del Turno</div>
                    <div className="display-6 fw-bold">₡{resumen.ventas_totales.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              {usuario?.rol === 'admin' && (
                <div className="col-md-6">
                  <div className="card shadow-sm border-0 bg-success text-white">
                    <div className="card-body">
                      <div className="small text-uppercase fw-bold opacity-75">Ganancia Bruta del Turno</div>
                      <div className="display-6 fw-bold">₡{resumen.ganancia_bruta_total.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="card shadow-sm border-0 mb-3">
              <div className="card-header fw-bold">2. Desglose de Ventas por Método de Pago</div>
              <div className="card-body row text-center">
                <div className="col-3 border-end">
                  <div className="text-muted small">Efectivo</div>
                  <div className="fs-5 fw-bold">₡{resumen.desglose_pagos.efectivo.toLocaleString()}</div>
                </div>
                <div className="col-3 border-end">
                  <div className="text-muted small">SINPE Móvil</div>
                  <div className="fs-5 fw-bold text-info">₡{resumen.desglose_pagos.sinpe.toLocaleString()}</div>
                </div>
                <div className="col-3 border-end">
                  <div className="text-muted small">Tarjeta / Datáfono</div>
                  <div className="fs-5 fw-bold text-primary">₡{resumen.desglose_pagos.tarjeta.toLocaleString()}</div>
                </div>
                <div className="col-3">
                  <div className="text-muted small">Crédito (Fiados)</div>
                  <div className="fs-5 fw-bold text-danger">₡{resumen.desglose_pagos.credito.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm border-0">
              <div className="card-header fw-bold">3. Ventas por Departamento (Panadería vs. Proveedores)</div>
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Departamento</th>
                      <th className="text-end">Total Vendido</th>
                      {usuario?.rol === 'admin' && <th className="text-end">Costo Mercadería</th>}
                      {usuario?.rol === 'admin' && <th className="text-end">Ganancia Real</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.ventas_por_departamento.map((d: any, i: number) => (
                      <tr key={i}>
                        <td className="fw-semibold">{d.departamento}</td>
                        <td className="text-end fw-bold">₡{Number(d.total_ventas).toLocaleString()}</td>
                        {usuario?.rol === 'admin' && <td className="text-end text-muted">₡{Number(d.costo_total).toLocaleString()}</td>}
                        {usuario?.rol === 'admin' && <td className="text-end fw-bold text-success">₡{Number(d.ganancia_bruta).toLocaleString()}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial de Tickets del Turno y Botón de Anulación Auditada */}
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

      {/* Reporte Histórico por Fechas */}
      {subVista === 'reporte_periodo' && (
        <div className="card shadow-sm border-0 p-3">
          <div className="row g-2 align-items-end mb-3">
            <div className="col-auto">
              <label className="form-label fw-semibold small">Desde</label>
              <input type="date" className="form-control" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="col-auto">
              <label className="form-label fw-semibold small">Hasta</label>
              <input type="date" className="form-control" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="col-auto">
              <button className="btn btn-primary fw-bold" onClick={consultarPeriodo}>
                Consultar Período
              </button>
            </div>
          </div>

          {reporteFechas && (
            <div className="row g-3">
              <div className="col-md-4">
                <div className="p-3 border rounded bg-body-tertiary">
                  <div className="text-muted small">Ventas Totales del Período</div>
                  <div className="fs-3 fw-bold text-primary">₡{reporteFechas.ventas_totales.toLocaleString()}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 border rounded bg-body-tertiary">
                  <div className="text-muted small">Ganancia Neta Estimada</div>
                  <div className="fs-3 fw-bold text-success">₡{reporteFechas.ganancia_total.toLocaleString()}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="p-3 border rounded bg-body-tertiary">
                  <div className="text-muted small">Tickets Cobrados / Promedio</div>
                  <div className="fs-4 fw-bold">
                    {reporteFechas.numero_ventas} tickets (Prom: ₡{reporteFechas.venta_promedio.toLocaleString()})
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
