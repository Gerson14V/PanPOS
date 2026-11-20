import React, { useState, useEffect, useMemo } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { fechaLocalISO } from '../utils/fechaLocal';

const DENOMINACIONES_CR = [
  { valor: 20000, label: '₡20,000', tipo: 'Billete' },
  { valor: 10000, label: '₡10,000', tipo: 'Billete' },
  { valor: 5000, label: '₡5,000', tipo: 'Billete' },
  { valor: 2000, label: '₡2,000', tipo: 'Billete' },
  { valor: 1000, label: '₡1,000', tipo: 'Billete' },
  { valor: 500, label: '₡500', tipo: 'Moneda' },
  { valor: 100, label: '₡100', tipo: 'Moneda' },
  { valor: 50, label: '₡50', tipo: 'Moneda' },
  { valor: 25, label: '₡25', tipo: 'Moneda' },
  { valor: 10, label: '₡10', tipo: 'Moneda' },
  { valor: 5, label: '₡5', tipo: 'Moneda' },
];

type VistaModulo = 'corte' | 'reportes';
type TipoPeriodo = 'un_dia' | 'semana' | 'mes' | 'intervalo';

export const ModuloCorteReportes: React.FC = () => {
  const { turno, setTurno, setUsuario, limpiarCarrito, usuario } = usePos();

  const [vista, setVista] = useState<VistaModulo>('corte');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'info' | 'danger'; texto: string } | null>(null);

  // Estados de Corte y Selector de Otros Días
  const [historialTurnos, setHistorialTurnos] = useState<any[]>([]);
  const [fechaFiltroTurnos, setFechaFiltroTurnos] = useState<string>('');
  const [turnoVisualizadoId, setTurnoVisualizadoId] = useState<number | null>(turno?.id || null);
  const [resumen, setResumen] = useState<any | null>(null);

  // Conteo de Billetes y Monedas (oculto por defecto hasta pulsar el botón inferior centrado)
  const [mostrarConteo, setMostrarConteo] = useState(false);
  const [conteoDenominaciones, setConteoDenominaciones] = useState<Record<number, string>>({});
  const [efectivoContadoManual, setEfectivoContadoManual] = useState<string>('');
  const [observaciones, setObservaciones] = useState('');
  const [cerrando, setCerrando] = useState(false);

  // Estados de Reportes y Gráficos (Un Día Específico / Semana / Mes / Intervalo)
  const hoyStr = fechaLocalISO();
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>('un_dia');
  const [diaUnico, setDiaUnico] = useState<string>(hoyStr);
  const [desde, setDesde] = useState<string>(hoyStr);
  const [hasta, setHasta] = useState<string>(hoyStr);
  const [reporte, setReporte] = useState<any | null>(null);
  const [barraHover, setBarraHover] = useState<{ etiqueta: string; monto: number; cantidad: number } | null>(null);

  const cargarHistorialTurnos = async (fecha = fechaFiltroTurnos) => {
    try {
      const url = fecha ? `/turnos?fecha=${fecha}` : '/turnos';
      const res = await api.get(url);
      setHistorialTurnos(res.data);
      if (res.data.length > 0 && fecha) {
        setTurnoVisualizadoId(res.data[0].id);
      }
    } catch {
      setMensaje({ tipo: 'danger', texto: 'No se pudo cargar el historial de turnos.' });
    }
  };

  const cargarDetalleTurno = async (idTurno: number) => {
    try {
      const resCorte = await api.get(`/turnos/${idTurno}/resumen`);
      setResumen(resCorte.data);
    } catch {
      setMensaje({ tipo: 'danger', texto: 'Error al cargar el resumen del turno.' });
    }
  };

  const cargarReportePeriodo = async (fDesde = desde, fHasta = hasta) => {
    try {
      const res = await api.get(`/reportes/ventas-periodo?desde=${fDesde}&hasta=${fHasta}`);
      setReporte(res.data);
    } catch {
      setMensaje({ tipo: 'danger', texto: 'Error al consultar el reporte del período.' });
    }
  };

  useEffect(() => {
    cargarHistorialTurnos('');
  }, [turno]);

  useEffect(() => {
    if (turno && !turnoVisualizadoId) {
      setTurnoVisualizadoId(turno.id);
    }
  }, [turno]);

  useEffect(() => {
    if (turnoVisualizadoId) {
      cargarDetalleTurno(turnoVisualizadoId);
    }
  }, [turnoVisualizadoId]);

  useEffect(() => {
    if (vista === 'reportes') {
      cargarReportePeriodo(desde, hasta);
    }
  }, [vista]);

  const totalPorDenominaciones = useMemo(() => {
    return DENOMINACIONES_CR.reduce((acc, d) => {
      const cant = Number(conteoDenominaciones[d.valor]) || 0;
      return acc + cant * d.valor;
    }, 0);
  }, [conteoDenominaciones]);

  const hayDenominacionesLlenas = Object.values(conteoDenominaciones).some((v) => Number(v) > 0);
  const efectivoContadoFinal = hayDenominacionesLlenas
    ? totalPorDenominaciones
    : efectivoContadoManual !== ''
    ? Number(efectivoContadoManual)
    : null;

  const esperado = Number(resumen?.gaveta_efectivo?.efectivo_esperado || 0);
  const diferenciaVista = efectivoContadoFinal !== null ? efectivoContadoFinal - esperado : null;

  const seleccionarModoPeriodo = (tipo: TipoPeriodo) => {
    setTipoPeriodo(tipo);
    const ahora = new Date();
    const fin = fechaLocalISO(ahora);

    if (tipo === 'un_dia') {
      setDesde(diaUnico);
      setHasta(diaUnico);
      cargarReportePeriodo(diaUnico, diaUnico);
    } else if (tipo === 'semana') {
      const d = new Date(ahora);
      d.setDate(d.getDate() - 6);
      const inicio = fechaLocalISO(d);
      setDesde(inicio);
      setHasta(fin);
      cargarReportePeriodo(inicio, fin);
    } else if (tipo === 'mes') {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const inicio = fechaLocalISO(d);
      setDesde(inicio);
      setHasta(fin);
      cargarReportePeriodo(inicio, fin);
    }
  };

  const cambiarDiaUnico = (nuevaFecha: string) => {
    setDiaUnico(nuevaFecha);
    setDesde(nuevaFecha);
    setHasta(nuevaFecha);
    if (nuevaFecha) {
      cargarReportePeriodo(nuevaFecha, nuevaFecha);
    }
  };

  const cerrarTurnoDefinitivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno || efectivoContadoFinal === null) return;
    if (!window.confirm(`¿Confirmar CIERRE DE CAJA con ₡${efectivoContadoFinal.toLocaleString()} contados en gaveta?`)) return;

    setCerrando(true);
    try {
      const res = await api.post(`/turnos/${turno.id}/cerrar`, {
        total_efectivo_contado: efectivoContadoFinal,
        observaciones: observaciones || (hayDenominacionesLlenas ? 'Cierre con conteo de billetes y monedas' : ''),
      });
      alert(`Turno #${turno.id} cerrado con éxito.\nRespaldo BD: ${res.data.respaldo.archivo}\nExcel diario actualizado en: ${res.data.excel_diario?.ruta || "Escritorio"}`);
      limpiarCarrito();
      setTurno(null);
      setUsuario(null);
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'Error al cerrar turno.' });
    } finally {
      setCerrando(false);
    }
  };

  const descargarExcelCorte = () => {
    if (!turnoVisualizadoId) return;
    const baseUrl = (api.defaults.baseURL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
    window.open(`${baseUrl}/turnos/${turnoVisualizadoId}/exportar-excel`, '_blank');
  };

  const esTurnoActualAbierto = resumen?.turno?.estado === 'abierto' && resumen?.turno?.id === turno?.id;

  const entradasLista = (resumen?.movimientos_caja || []).filter(
    (m: any) => m.tipo === 'entrada' || m.tipo === 'abono_cliente'
  );
  const salidasLista = (resumen?.movimientos_caja || []).filter(
    (m: any) => m.tipo === 'salida' || m.tipo === 'prestamo_cliente'
  );

  const ingresosContadoTotal =
    Number(resumen?.desglose_pagos?.efectivo || 0) +
    Number(resumen?.desglose_pagos?.sinpe || 0) +
    Number(resumen?.desglose_pagos?.tarjeta || 0);

  const datosGrafico = useMemo(() => {
    if (!reporte) return [];
    const esUnSoloDia = reporte.desde === reporte.hasta;

    if (esUnSoloDia) {
      return (reporte.ventas_por_hora || []).map((h: any) => ({
        etiqueta: `${h.hora}:00`,
        monto: Number(h.total_ventas || 0),
        cantidad: Number(h.cantidad || 0),
      }));
    }

    return (reporte.ventas_por_dia || []).map((d: any) => ({
      etiqueta: d.fecha.slice(5),
      monto: Number(d.total_ventas || 0),
      cantidad: Number(d.cantidad || 0),
    }));
  }, [reporte]);

  const maxMontoGrafico = Math.max(...datosGrafico.map((d: any) => d.monto), 1);

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      {/* Franja de Navegación Superior del Módulo */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div className="btn-group">
          <button
            className={`btn fw-bold ${vista === 'corte' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setVista('corte')}
          >
            ✂️ Corte de Caja (Actual y Otros Días)
          </button>
          <button
            className={`btn fw-bold ${vista === 'reportes' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setVista('reportes')}
          >
            📈 Reportes y Gráficos
          </button>
        </div>

        {vista === 'corte' && resumen && (
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-outline-secondary fw-bold" onClick={() => window.print()}>
              🖨️ Imprimir Corte
            </button>
            <button className="btn btn-success fw-bold" onClick={descargarExcelCorte}>
              📥 Actualizar Excel Diario (.XLS)
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* VISTA 1: CORTE DE CAJA ESTILO ELEVENTA + BOTÓN INFERIOR CENTRADO      */}
      {/* ===================================================================== */}
      {vista === 'corte' && (
        <>
          <div className="card shadow-sm mb-3">
            <div className="card-body py-2 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div className="d-flex flex-wrap align-items-center gap-2">
                {turno && (
                  <button
                    className={`btn btn-sm fw-bold ${turnoVisualizadoId === turno.id ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => {
                      setFechaFiltroTurnos('');
                      setTurnoVisualizadoId(turno.id);
                      cargarHistorialTurnos('');
                    }}
                  >
                    ● Turno Actual (#{turno.id})
                  </button>
                )}

                <span className="small fw-bold text-muted ms-2">Ver corte de otro día:</span>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  style={{ width: '155px' }}
                  value={fechaFiltroTurnos}
                  onChange={(e) => {
                    setFechaFiltroTurnos(e.target.value);
                    cargarHistorialTurnos(e.target.value);
                  }}
                />
                {fechaFiltroTurnos && (
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                      setFechaFiltroTurnos('');
                      cargarHistorialTurnos('');
                    }}
                  >
                    Todos
                  </button>
                )}

                <select
                  className="form-select form-select-sm fw-semibold"
                  style={{ width: '320px' }}
                  value={turnoVisualizadoId || ''}
                  onChange={(e) => setTurnoVisualizadoId(Number(e.target.value))}
                >
                  {historialTurnos.map((t) => (
                    <option key={t.id} value={t.id}>
                      Turno #{t.id} — {new Date(t.fecha_apertura).toLocaleDateString()} {new Date(t.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {t.usuario?.nombre} ({t.estado === 'abierto' ? 'ABIERTO' : 'CERRADO'})
                    </option>
                  ))}
                </select>
              </div>

              {resumen && (
                <span className={`badge fs-6 ${resumen.turno.estado === 'abierto' ? 'bg-success' : 'bg-secondary'}`}>
                  {resumen.turno.estado === 'abierto' ? 'TURNO EN CURSO' : 'TURNO CERRADO'}
                </span>
              )}
            </div>
          </div>

          {/* Hoja Limpia de Corte Estilo Eleventa */}
          {resumen && (
            <div className="card shadow-sm mb-3">
              <div className="card-header bg-body-tertiary py-3 px-4 border-bottom d-flex flex-wrap justify-content-between align-items-center">
                <div>
                  <h5 className="fw-bold mb-0 text-primary">
                    Corte de {resumen.turno.usuario?.nombre} del{' '}
                    {new Date(resumen.turno.fecha_apertura).toLocaleDateString('es-CR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </h5>
                  <small className="text-muted">
                    De {new Date(resumen.turno.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                    a{' '}
                    {resumen.turno.fecha_cierre
                      ? new Date(resumen.turno.fecha_cierre).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'la hora actual (Turno Actual)'}
                  </small>
                </div>

                {resumen.turno.estado === 'cerrado' && resumen.turno.total_efectivo_contado !== null && (
                  <div className="text-end">
                    <div className="small text-muted">
                      Efectivo Contado al Cierre: <strong>₡{Number(resumen.turno.total_efectivo_contado).toLocaleString()}</strong>
                    </div>
                    <span
                      className={`badge ${
                        Number(resumen.turno.diferencia_arqueo) === 0
                          ? 'bg-warning text-dark'
                          : Number(resumen.turno.diferencia_arqueo) > 0
                          ? 'bg-success'
                          : 'bg-danger'
                      }`}
                    >
                      {Number(resumen.turno.diferencia_arqueo) === 0
                        ? 'Caja Exacta (₡0)'
                        : Number(resumen.turno.diferencia_arqueo) > 0
                        ? `Sobrante: +₡${Number(resumen.turno.diferencia_arqueo).toLocaleString()}`
                        : `Faltante: ₡${Number(resumen.turno.diferencia_arqueo).toLocaleString()}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="card-body p-4">
                <div className="row g-5">
                  <div className="col-lg-6">
                    <div className="d-flex justify-content-between align-items-baseline border-bottom pb-2 mb-4">
                      <span className="fs-4 fw-bold text-primary">$ Ventas Totales</span>
                      <span className="fs-3 fw-bolder text-primary">
                        ₡{Number(resumen.ventas_totales).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <h5 className="fw-bold text-secondary mb-3">🗄️ Dinero en Caja</h5>
                    <table className="table table-sm table-borderless mb-4">
                      <tbody>
                        <tr>
                          <td className="ps-3">Fondo de caja</td>
                          <td className="text-end fw-semibold">₡{Number(resumen.gaveta_efectivo.monto_inicial).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-success">
                          <td className="ps-3">Ventas en Efectivo</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.gaveta_efectivo.ventas_efectivo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-success">
                          <td className="ps-3">Abonos en Efectivo</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.gaveta_efectivo.abonos_efectivo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-success">
                          <td className="ps-3">Entradas (F7)</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.gaveta_efectivo.entradas_efectivo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-danger">
                          <td className="ps-3">Salidas (F8)</td>
                          <td className="text-end fw-semibold">- ₡{Number(resumen.gaveta_efectivo.salidas_efectivo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-danger">
                          <td className="ps-3">Préstamos en Efectivo</td>
                          <td className="text-end fw-semibold">- ₡{Number(resumen.gaveta_efectivo.prestamos_efectivo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="border-top">
                          <td className="ps-3 pt-2 fw-bold fs-5">Efectivo Esperado en Caja</td>
                          <td className="text-end pt-2 fw-bolder fs-5 text-primary">
                            ₡{esperado.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <h5 className="fw-bold text-secondary mb-2">⬇️ Entradas de Efectivo y Abonos</h5>
                    {entradasLista.length === 0 ? (
                      <p className="text-muted small ps-3 fst-italic">- No hubo Entradas en Efectivo -</p>
                    ) : (
                      <table className="table table-sm mb-0">
                        <tbody>
                          {entradasLista.map((m: any) => (
                            <tr key={m.id}>
                              <td className="small text-muted" style={{ width: '80px' }}>
                                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="small">
                                {m.concepto} {m.cliente ? `(${m.cliente.nombre})` : ''}
                              </td>
                              <td className="text-end fw-bold text-success">
                                +₡{Number(m.monto).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="col-lg-6">
                    {usuario?.rol === 'admin' && (
                      <div className="d-flex justify-content-between align-items-baseline border-bottom pb-2 mb-4">
                        <span className="fs-4 fw-bold text-success">📊 Ganancia</span>
                        <span className="fs-3 fw-bolder text-success">
                          ₡{Number(resumen.ganancia_bruta_total).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <h5 className="fw-bold text-secondary mb-3">🛒 Ventas</h5>
                    <table className="table table-sm table-borderless mb-4">
                      <tbody>
                        <tr className="text-success">
                          <td className="ps-3">En Efectivo</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.desglose_pagos.efectivo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-info">
                          <td className="ps-3">Con SINPE Móvil</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.desglose_pagos.sinpe).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-primary">
                          <td className="ps-3">Con Tarjeta</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.desglose_pagos.tarjeta).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-warning-emphasis">
                          <td className="ps-3">A Crédito (Fiados)</td>
                          <td className="text-end fw-semibold">+ ₡{Number(resumen.desglose_pagos.credito).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="text-danger">
                          <td className="ps-3">Tickets Anulados ({resumen.anulaciones.cantidad})</td>
                          <td className="text-end fw-semibold">₡{Number(resumen.anulaciones.monto_total_anulado).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="border-top">
                          <td className="ps-3 pt-2 fw-bold fs-5">Total Ventas Sumado</td>
                          <td className="text-end pt-2 fw-bolder fs-5">
                            ₡{Number(resumen.ventas_totales).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <h5 className="fw-bold text-secondary mb-2">💵 Ingresos de Contado</h5>
                    <table className="table table-sm table-borderless mb-4">
                      <tbody>
                        <tr>
                          <td className="ps-3">Efectivo + SINPE + Tarjeta</td>
                          <td className="text-end fw-bold text-success">
                            + ₡{ingresosContadoTotal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <h5 className="fw-bold text-secondary mb-2">⬆️ Salidas de Efectivo y Préstamos</h5>
                    {salidasLista.length === 0 ? (
                      <p className="text-muted small ps-3 fst-italic">- No hubo Salidas de Efectivo -</p>
                    ) : (
                      <table className="table table-sm mb-0">
                        <tbody>
                          {salidasLista.map((m: any) => (
                            <tr key={m.id}>
                              <td className="small text-muted" style={{ width: '80px' }}>
                                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="small">
                                {m.concepto} {m.cliente ? `(${m.cliente.nombre})` : ''}
                              </td>
                              <td className="text-end fw-bold text-danger">
                                -₡{Number(m.monto).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Botón Contar Billetes y Cerrar Turno centrado abajo */}
          {esTurnoActualAbierto && (
            <div className="d-flex justify-content-center my-3">
              <button
                className={`btn btn-lg px-5 fw-bold shadow-sm ${mostrarConteo ? 'btn-secondary' : 'btn-danger'}`}
                onClick={() => setMostrarConteo(!mostrarConteo)}
              >
                {mostrarConteo ? '▲ Ocultar Billetes y Monedas' : '💵 Contar Billetes y Monedas / Cerrar Turno'}
              </button>
            </div>
          )}

          {/* Panel Desplegable de Conteo de Billetes y Monedas */}
          {esTurnoActualAbierto && mostrarConteo && (
            <div className="card shadow-sm mb-3 border-primary">
              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <span className="fw-bold">💵 Conteo de Billetes y Monedas (Costa Rica) y Cierre de Turno</span>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light"
                    onClick={() => {
                      setConteoDenominaciones({});
                      setEfectivoContadoManual('');
                    }}
                  >
                    Limpiar Conteo
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-light text-dark fw-bold"
                    onClick={() => setMostrarConteo(false)}
                  >
                    Cerrar Panel ✕
                  </button>
                </div>
              </div>
              <form className="card-body" onSubmit={cerrarTurnoDefinitivo}>
                <div className="row g-3">
                  <div className="col-lg-8">
                    <div className="row g-2">
                      {DENOMINACIONES_CR.map((d) => {
                        const cant = Number(conteoDenominaciones[d.valor]) || 0;
                        return (
                          <div className="col-6 col-sm-4 col-md-3" key={d.valor}>
                            <div className="border rounded p-2 bg-body-tertiary">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="fw-bold small">{d.label}</span>
                                <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                                  {d.tipo}
                                </span>
                              </div>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm fw-bold text-center"
                                placeholder="0"
                                value={conteoDenominaciones[d.valor] || ''}
                                onChange={(e) =>
                                  setConteoDenominaciones({
                                    ...conteoDenominaciones,
                                    [d.valor]: e.target.value,
                                  })
                                }
                              />
                              <div className="text-end small text-muted mt-1">
                                ₡{(cant * d.valor).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="col-lg-4 d-flex flex-column justify-content-between border-start ps-lg-4">
                    <div>
                      <div className="mb-3">
                        <label className="form-label small fw-bold text-muted">
                          O digite el total contado directo (₡):
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={hayDenominacionesLlenas}
                          className="form-control form-control-lg fw-bold"
                          placeholder={hayDenominacionesLlenas ? `Calculado: ₡${totalPorDenominaciones.toLocaleString()}` : 'Monto físico contado'}
                          value={hayDenominacionesLlenas ? String(totalPorDenominaciones) : efectivoContadoManual}
                          onChange={(e) => setEfectivoContadoManual(e.target.value)}
                        />
                      </div>

                      <div className="p-3 rounded bg-body-secondary mb-3">
                        <div className="d-flex justify-content-between small">
                          <span>Esperado en caja:</span>
                          <strong>₡{esperado.toLocaleString()}</strong>
                        </div>
                        <div className="d-flex justify-content-between small mt-1">
                          <span>Contado físico:</span>
                          <strong className="text-primary">
                            {efectivoContadoFinal !== null ? `₡${efectivoContadoFinal.toLocaleString()}` : 'Pendiente'}
                          </strong>
                        </div>
                      </div>

                      {diferenciaVista !== null && (
                        <div
                          className={`alert py-2 fw-bold text-center ${
                            diferenciaVista === 0
                              ? 'alert-warning'
                              : diferenciaVista > 0
                              ? 'alert-success'
                              : 'alert-danger'
                          }`}
                        >
                          {diferenciaVista === 0
                            ? '🟡 Caja Exacta (₡0 diferencia)'
                            : diferenciaVista > 0
                            ? `🟢 Sobrante: +₡${diferenciaVista.toLocaleString()}`
                            : `🔴 Faltante: ₡${diferenciaVista.toLocaleString()}`}
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="form-label small fw-semibold">Observaciones del Cierre</label>
                        <input
                          className="form-control form-control-sm"
                          placeholder="Notas opcionales..."
                          value={observaciones}
                          onChange={(e) => setObservaciones(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-danger btn-lg w-100 fw-bold"
                      disabled={efectivoContadoFinal === null || cerrando}
                    >
                      {cerrando ? 'Cerrando y Respaldando...' : '🔒 Cerrar Turno y Respaldar BD'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* VISTA 2: REPORTES Y GRÁFICOS (UN DÍA / SEMANA / MES / INTERVALO)      */}
      {/* ===================================================================== */}
      {vista === 'reportes' && (
        <div>
          <div className="card shadow-sm mb-3">
            <div className="card-body py-2 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div className="btn-group">
                <button
                  className={`btn fw-bold ${tipoPeriodo === 'un_dia' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => seleccionarModoPeriodo('un_dia')}
                >
                  📅 Un Día
                </button>
                <button
                  className={`btn fw-bold ${tipoPeriodo === 'semana' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => seleccionarModoPeriodo('semana')}
                >
                  Semana (7 Días)
                </button>
                <button
                  className={`btn fw-bold ${tipoPeriodo === 'mes' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => seleccionarModoPeriodo('mes')}
                >
                  Mes Actual
                </button>
                <button
                  className={`btn fw-bold ${tipoPeriodo === 'intervalo' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setTipoPeriodo('intervalo')}
                >
                  🗓 Varios Días (Intervalo)
                </button>
              </div>

              {tipoPeriodo === 'un_dia' ? (
                <div className="d-flex align-items-center gap-2">
                  <span className="small fw-bold text-muted">Elegir día:</span>
                  <input
                    type="date"
                    className="form-control form-control-sm fw-bold"
                    style={{ width: '165px' }}
                    value={diaUnico}
                    onChange={(e) => cambiarDiaUnico(e.target.value)}
                  />
                  <button
                    className="btn btn-sm btn-outline-secondary fw-semibold"
                    onClick={() => cambiarDiaUnico(hoyStr)}
                  >
                    Hoy
                  </button>
                </div>
              ) : (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className="small fw-bold text-muted">Desde:</span>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    style={{ width: '150px' }}
                    value={desde}
                    onChange={(e) => {
                      setTipoPeriodo('intervalo');
                      setDesde(e.target.value);
                    }}
                  />
                  <span className="small fw-bold text-muted">Hasta:</span>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    style={{ width: '150px' }}
                    value={hasta}
                    onChange={(e) => {
                      setTipoPeriodo('intervalo');
                      setHasta(e.target.value);
                    }}
                  />
                  <button
                    className="btn btn-sm btn-primary fw-bold px-3"
                    onClick={() => cargarReportePeriodo(desde, hasta)}
                  >
                    🔍 Consultar
                  </button>
                </div>
              )}
            </div>
          </div>

          {reporte && (
            <>
              <div className="row g-3 mb-3">
                <div className="col-md-3 col-6">
                  <div className="card shadow-sm p-3 h-100">
                    <div className="small text-muted fw-bold text-uppercase">Ventas Totales</div>
                    <div className="fs-3 fw-bolder text-primary">
                      ₡{Number(reporte.ventas_totales).toLocaleString()}
                    </div>
                    <small className="text-muted">
                      {reporte.desde === reporte.hasta ? `Solo día: ${reporte.desde}` : `${reporte.desde} al ${reporte.hasta}`}
                    </small>
                  </div>
                </div>
                {usuario?.rol === 'admin' && (
                  <div className="col-md-3 col-6">
                    <div className="card shadow-sm p-3 h-100">
                      <div className="small text-muted fw-bold text-uppercase">Ganancia Bruta</div>
                      <div className="fs-3 fw-bolder text-success">
                        ₡{Number(reporte.ganancia_total).toLocaleString()}
                      </div>
                      <small className="text-muted">Margen sobre costo</small>
                    </div>
                  </div>
                )}
                <div className="col-md-3 col-6">
                  <div className="card shadow-sm p-3 h-100">
                    <div className="small text-muted fw-bold text-uppercase">Tickets Cobrados</div>
                    <div className="fs-3 fw-bolder">{reporte.numero_ventas}</div>
                    <small className="text-danger">
                      Anulados: {reporte.anulaciones?.cantidad || 0} (₡{Number(reporte.anulaciones?.monto || 0).toLocaleString()})
                    </small>
                  </div>
                </div>
                <div className="col-md-3 col-6">
                  <div className="card shadow-sm p-3 h-100">
                    <div className="small text-muted fw-bold text-uppercase">Ticket Promedio</div>
                    <div className="fs-3 fw-bolder text-secondary">
                      ₡{Number(reporte.venta_promedio).toLocaleString()}
                    </div>
                    <small className="text-muted">Promedio por cliente</small>
                  </div>
                </div>
              </div>

              <div className="card shadow-sm mb-3">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <span className="fw-bold">
                    📊 Gráfico de Ventas {reporte.desde === reporte.hasta ? `por Hora (${reporte.desde})` : `por Día (${reporte.desde} a ${reporte.hasta})`}
                  </span>
                  {barraHover && (
                    <span className="badge bg-light text-dark fs-6">
                      {barraHover.etiqueta}: ₡{barraHover.monto.toLocaleString()} ({barraHover.cantidad} tickets)
                    </span>
                  )}
                </div>
                <div className="card-body">
                  {datosGrafico.length === 0 ? (
                    <div className="text-center text-muted py-5">
                      No hay ventas registradas en este período para graficar.
                    </div>
                  ) : (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <svg
                        viewBox={`0 0 ${Math.max(680, datosGrafico.length * 64)} 260`}
                        style={{ width: '100%', height: '260px', minWidth: '500px' }}
                      >
                        {[0.25, 0.5, 0.75, 1].map((pct) => {
                          const y = 210 - pct * 170;
                          return (
                            <g key={pct}>
                              <line x1="55" y1={y} x2="98%" y2={y} stroke="#e6dccf" strokeDasharray="4" />
                              <text x="50" y={y + 4} textAnchor="end" fontSize="11" fill="#7c6a5c">
                                ₡{Math.round(maxMontoGrafico * pct).toLocaleString()}
                              </text>
                            </g>
                          );
                        })}

                        {datosGrafico.map((item: any, idx: number) => {
                          const anchoZona = (Math.max(680, datosGrafico.length * 64) - 80) / datosGrafico.length;
                          const anchoBarra = Math.min(44, anchoZona * 0.65);
                          const altura = (item.monto / maxMontoGrafico) * 170;
                          const x = 65 + idx * anchoZona + (anchoZona - anchoBarra) / 2;
                          const y = 210 - altura;
                          const activa = barraHover?.etiqueta === item.etiqueta;

                          return (
                            <g
                              key={idx}
                              style={{ cursor: 'pointer' }}
                              onMouseEnter={() => setBarraHover(item)}
                              onMouseLeave={() => setBarraHover(null)}
                            >
                              <rect
                                x={x}
                                y={y}
                                width={anchoBarra}
                                height={Math.max(4, altura)}
                                rx="6"
                                fill={activa ? '#4d9b60' : '#5c4033'}
                              />
                              <text
                                x={x + anchoBarra / 2}
                                y={y - 6}
                                textAnchor="middle"
                                fontSize="10"
                                fontWeight="bold"
                                fill="#36261c"
                              >
                                {item.monto >= 1000 ? `₡${(item.monto / 1000).toFixed(1)}k` : `₡${item.monto}`}
                              </text>
                              <text
                                x={x + anchoBarra / 2}
                                y="232"
                                textAnchor="middle"
                                fontSize="11"
                                fill="#5c4033"
                              >
                                {item.etiqueta}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="row g-3">
                <div className="col-lg-5">
                  <div className="card shadow-sm h-100">
                    <div className="card-header fw-bold bg-body-tertiary">💳 Ventas por Método de Pago</div>
                    <div className="card-body">
                      {[
                        { label: 'Efectivo', valor: reporte.desglose_pagos.efectivo, color: 'bg-success' },
                        { label: 'SINPE Móvil', valor: reporte.desglose_pagos.sinpe, color: 'bg-info' },
                        { label: 'Tarjeta', valor: reporte.desglose_pagos.tarjeta, color: 'bg-primary' },
                        { label: 'Crédito (Fiados)', valor: reporte.desglose_pagos.credito, color: 'bg-warning' },
                      ].map((m) => {
                        const pct = reporte.ventas_totales > 0 ? Math.round((m.valor / reporte.ventas_totales) * 100) : 0;
                        return (
                          <div className="mb-3" key={m.label}>
                            <div className="d-flex justify-content-between small fw-bold mb-1">
                              <span>{m.label}</span>
                              <span>
                                ₡{Number(m.valor).toLocaleString()} ({pct}%)
                              </span>
                            </div>
                            <div className="progress" style={{ height: '10px' }}>
                              <div className={`progress-bar ${m.color}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="col-lg-7">
                  <div className="card shadow-sm h-100">
                    <div className="card-header fw-bold bg-body-tertiary">🏆 Top 10 Productos Más Vendidos</div>
                    <div className="table-responsive">
                      <table className="table table-sm table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Producto</th>
                            <th className="text-center">Unidades</th>
                            <th className="text-end">Total Vendido</th>
                            {usuario?.rol === 'admin' && <th className="text-end">Ganancia</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {(reporte.top_productos || []).length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center text-muted py-4">
                                Sin productos vendidos en el período.
                              </td>
                            </tr>
                          ) : (
                            reporte.top_productos.map((p: any, idx: number) => (
                              <tr key={idx}>
                                <td className="fw-semibold">{p.producto}</td>
                                <td className="text-center">
                                  <span className="badge bg-secondary">{p.unidades}</span>
                                </td>
                                <td className="text-end fw-bold text-primary">
                                  ₡{Number(p.total_ventas).toLocaleString()}
                                </td>
                                {usuario?.rol === 'admin' && (
                                  <td className="text-end fw-bold text-success">
                                    ₡{Number(p.ganancia).toLocaleString()}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
