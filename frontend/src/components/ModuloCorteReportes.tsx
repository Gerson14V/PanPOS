import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePos } from '../context/PosContext';
import { api, mensajeError } from '../api/client';
import { fechaLocalISO } from '../utils/fechaLocal';
import { BotonAccion } from './BotonAccion';
import { imprimirCorte, numeroTicket } from '../utils/ticket';

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
type ModoCorte = 'cajero' | 'dia';
type TipoPeriodo = 'un_dia' | 'semana' | 'mes' | 'intervalo';

interface FechaDisponible {
  fecha: string;
  cantidad_tickets: number;
  estado: 'abierto' | 'cerrado' | 'sin_cierre';
}

const colones = (n: unknown): string =>
  `₡${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const horaCorta = (fecha?: string | null): string =>
  fecha ? new Date(fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

// Hora, con la fecha delante si no es de hoy (turnos que cruzan varios días)
const momento = (fecha?: string | null): string => {
  if (!fecha) return '—';
  const d = new Date(fecha);
  return fechaLocalISO(d) === fechaLocalISO()
    ? horaCorta(fecha)
    : `${d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} ${horaCorta(fecha)}`;
};

// Días calendario que lleva abierto un turno (0 = abierto hoy)
const diasAbierto = (fechaApertura?: string | null): number =>
  fechaApertura ? Math.round((Date.parse(fechaLocalISO()) - Date.parse(fechaLocalISO(new Date(fechaApertura)))) / 86400000) : 0;

const ETIQUETA_ESTADO_DIA: Record<string, string> = { abierto: 'EN CURSO', cerrado: 'CERRADO', sin_cierre: 'SIN CIERRE' };

const formatearFechaCorta = (ymd: string): string => {
  if (!ymd) return '';
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const ModuloCorteReportes: React.FC = () => {
  const { turno, setTurno, setUsuario, limpiarCarrito, usuario, configuracion } = usePos();

  const hoyStr = fechaLocalISO();
  const [vista, setVista] = useState<VistaModulo>('corte');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'info' | 'danger'; texto: string } | null>(null);

  // Modos de Corte: "cajero" (Turno actual) o "dia" (Todos los turnos del día elegido)
  const [modoCorte, setModoCorte] = useState<ModoCorte>(turno ? 'cajero' : 'dia');
  const [fechaCorteDia, setFechaCorteDia] = useState<string>(hoyStr);
  const [fechasDisponibles, setFechasDisponibles] = useState<FechaDisponible[]>([]);
  const [resumen, setResumen] = useState<any | null>(null);

  // Conteo de Billetes y Monedas (oculto por defecto hasta pulsar el botón inferior centrado)
  const [mostrarConteo, setMostrarConteo] = useState(false);
  const [conteoDenominaciones, setConteoDenominaciones] = useState<Record<number, string>>({});
  const [efectivoContadoManual, setEfectivoContadoManual] = useState<string>('');
  const [observaciones, setObservaciones] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [cargandoCorte, setCargandoCorte] = useState(false);
  const [descargandoExcel, setDescargandoExcel] = useState(false);
  // Evita que una respuesta lenta de un corte anterior reemplace al que se está viendo
  const consultaCorteRef = useRef(0);

  // Estados de Reportes y Gráficos (Un Día Específico / Semana / Mes / Intervalo)
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>('un_dia');
  const [diaUnico, setDiaUnico] = useState<string>(hoyStr);
  const [desde, setDesde] = useState<string>(hoyStr);
  const [hasta, setHasta] = useState<string>(hoyStr);
  const [reporte, setReporte] = useState<any | null>(null);
  const [barraHover, setBarraHover] = useState<{ etiqueta: string; monto: number; cantidad: number } | null>(null);

  const cargarFechasDisponibles = async () => {
    try {
      const res = await api.get('/turnos/fechas-disponibles');
      setFechasDisponibles(res.data);
    } catch {
      setMensaje({ tipo: 'danger', texto: 'No se pudo cargar la lista de días con cortes.' });
    }
  };

  const cargarCorte = async (url: string, errorPorDefecto: string) => {
    const idConsulta = ++consultaCorteRef.current;
    setCargandoCorte(true);
    try {
      const resCorte = await api.get(url);
      if (idConsulta === consultaCorteRef.current) setResumen(resCorte.data);
    } catch (err) {
      if (idConsulta === consultaCorteRef.current) {
        setMensaje({ tipo: 'danger', texto: mensajeError(err, errorPorDefecto) });
      }
    } finally {
      if (idConsulta === consultaCorteRef.current) setCargandoCorte(false);
    }
  };

  const cargarCorteCajero = (idTurno: number) =>
    cargarCorte(`/turnos/${idTurno}/resumen`, 'Error al cargar el corte del cajero.');

  const cargarCorteDia = (fecha: string) =>
    cargarCorte(`/turnos/corte-dia?fecha=${fecha}`, 'Error al cargar el corte completo del día.');

  const recargarCorteActual = () => {
    if (modoCorte === 'cajero' && turno) cargarCorteCajero(turno.id);
    else cargarCorteDia(fechaCorteDia);
  };

  const cargarReportePeriodo = async (fDesde = desde, fHasta = hasta) => {
    try {
      const res = await api.get(`/reportes/ventas-periodo?desde=${fDesde}&hasta=${fHasta}`);
      setReporte(res.data);
    } catch (err) {
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'Error al consultar el reporte del período.') });
    }
  };

  useEffect(() => {
    cargarFechasDisponibles();
  }, [turno]);

  useEffect(() => {
    if (vista !== 'corte') return;
    if (modoCorte === 'cajero') {
      if (turno) {
        cargarCorteCajero(turno.id);
      } else {
        setModoCorte('dia');
      }
    } else {
      cargarCorteDia(fechaCorteDia);
    }
  }, [vista, modoCorte, fechaCorteDia, turno]);

  useEffect(() => {
    if (vista === 'reportes') {
      cargarReportePeriodo(desde, hasta);
    }
  }, [vista]);

  const totalPorDenominaciones = useMemo(() => {
    return DENOMINACIONES_CR.reduce((acc, d) => {
      const cant = Math.max(0, Number(conteoDenominaciones[d.valor]) || 0);
      return acc + cant * d.valor;
    }, 0);
  }, [conteoDenominaciones]);

  const hayDenominacionesLlenas = Object.values(conteoDenominaciones).some((v) => Number(v) > 0);
  const efectivoContadoFinal = hayDenominacionesLlenas
    ? totalPorDenominaciones
    : efectivoContadoManual !== ''
    ? Math.max(0, Number(efectivoContadoManual) || 0)
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
    if (!turno || efectivoContadoFinal === null || cerrando) return;
    if (!window.confirm(`¿Confirmar CIERRE DE CAJA con ₡${efectivoContadoFinal.toLocaleString()} contados en gaveta?`)) return;

    setCerrando(true);
    try {
      const res = await api.post(
        `/turnos/${turno.id}/cerrar`,
        {
          total_efectivo_contado: efectivoContadoFinal,
          observaciones: observaciones || (hayDenominacionesLlenas ? 'Cierre con conteo de billetes y monedas' : ''),
        },
        { timeout: 60000 }
      );
      // Tiquete de cierre con lo contado y la diferencia (si la impresión automática está activa)
      if ((configuracion['impresion_escpos_activa'] ?? '0') === '1' && resumen && !resumen.sin_datos) {
        imprimirCorte({ ...resumen, turno: { ...resumen.turno, ...res.data.turno } }, configuracion);
      }
      const msgBackup = res.data.respaldo?.guardado
        ? `Respaldo BD: ${res.data.respaldo.archivo}`
        : 'Respaldo BD: No se pudo generar';
      const msgExcel = res.data.excel_diario?.guardado
        ? `Excel diario actualizado en: ${res.data.excel_diario.ruta}`
        : 'Excel diario: No se pudo actualizar (cierre el archivo si está abierto)';
      alert(`Turno #${turno.id} cerrado con éxito.\n${msgBackup}\n${msgExcel}`);
      limpiarCarrito();
      // Igual que "Salir": la sesión también se cierra en el servidor
      await api.post('/auth/logout').catch(() => {});
      setTurno(null);
      setUsuario(null);
    } catch (err) {
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'Error al cerrar turno.') });
    } finally {
      setCerrando(false);
    }
  };

  const descargarExcelCorte = async () => {
    if (descargandoExcel) return;
    setDescargandoExcel(true);
    try {
      const res = await api.get('/reportes/exportar-excel-diario', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.ms-excel;charset=UTF-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Ventas_Diarias_PanPOS.xls';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMensaje({ tipo: 'success', texto: 'Excel diario actualizado y descargado correctamente.' });
    } catch (err) {
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'No se pudo generar o descargar el Excel diario.') });
    } finally {
      setDescargandoExcel(false);
    }
  };

  const mostrarCierreDeCajero = modoCorte === 'cajero' && !!turno && resumen && !resumen.sin_datos && resumen.turno?.estado === 'abierto';

  const entradasLista = (resumen?.movimientos_caja || []).filter(
    (m: any) => m.metodo_pago === 'efectivo' && (m.tipo === 'entrada' || m.tipo === 'abono_cliente')
  );
  const salidasLista = (resumen?.movimientos_caja || []).filter(
    (m: any) => m.metodo_pago === 'efectivo' && (m.tipo === 'salida' || m.tipo === 'prestamo_cliente')
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
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2 no-print">
        <div className="btn-group">
          <button
            className={`btn fw-bold ${vista === 'corte' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setVista('corte')}
          >
            <i className="bi bi-scissors me-1" />Corte de Caja
          </button>
          <button
            className={`btn fw-bold ${vista === 'reportes' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setVista('reportes')}
          >
            <i className="bi bi-graph-up me-1" />Reportes y Gráficos
          </button>
        </div>

        {vista === 'corte' && (
          <div className="d-flex flex-wrap gap-2">
            <BotonAccion
              className="btn btn-outline-primary fw-bold"
              onClick={recargarCorteActual}
              cargando={cargandoCorte}
              textoCargando="Actualizando..."
            >
              <i className="bi bi-arrow-clockwise me-1" />Actualizar
            </BotonAccion>
            <button className="btn btn-outline-secondary fw-bold" onClick={() => window.print()} title="Imprimir en hoja carta">
              <i className="bi bi-printer me-1" />Imprimir Corte
            </button>
            <button
              className="btn btn-outline-secondary fw-bold"
              disabled={!resumen || resumen.sin_datos}
              onClick={() => resumen && imprimirCorte(resumen, configuracion)}
              title="Imprimir en la impresora térmica de tiquetes"
            >
              <i className="bi bi-receipt-cutoff me-1" />Tiquete de Corte
            </button>
            <BotonAccion
              className="btn btn-success fw-bold"
              onClick={descargarExcelCorte}
              cargando={descargandoExcel}
              textoCargando="Generando Excel..."
            >
              <i className="bi bi-file-earmark-excel me-1" />Actualizar Excel Diario (.XLS)
            </BotonAccion>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* VISTA 1: CORTE DE CAJERO (TURNO) + CORTE DEL DÍA (TODOS LOS TURNOS)   */}
      {/* ===================================================================== */}
      {vista === 'corte' && (
        <>
          <div className="card shadow-sm mb-3 no-print">
            <div className="card-body py-2 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div className="d-flex flex-wrap align-items-center gap-2">
                {turno && (
                  <button
                    className={`btn btn-sm fw-bold ${modoCorte === 'cajero' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => {
                      setModoCorte('cajero');
                    }}
                  >
                    <i className="bi bi-person-fill me-1" />Corte de Cajero (Turno #{turno.id})
                  </button>
                )}

                <button
                  className={`btn btn-sm fw-bold ${
                    modoCorte === 'dia' && fechaCorteDia === hoyStr ? 'btn-primary' : 'btn-outline-primary'
                  }`}
                  onClick={() => {
                    setFechaCorteDia(hoyStr);
                    setModoCorte('dia');
                    setMostrarConteo(false);
                  }}
                >
                  <i className="bi bi-calendar-day me-1" />Corte del Día (Hoy)
                </button>

                <span className="small fw-bold text-muted ms-2">Ver corte de otro día:</span>
                <input
                  type="date"
                  className="form-control form-control-sm fw-semibold"
                  style={{ width: '155px' }}
                  value={fechaCorteDia}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setFechaCorteDia(e.target.value);
                    setModoCorte('dia');
                    setMostrarConteo(false);
                  }}
                />

                <select
                  className="form-select form-select-sm fw-semibold"
                  style={{ width: '280px' }}
                  value={modoCorte === 'dia' ? fechaCorteDia : ''}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setFechaCorteDia(e.target.value);
                    setModoCorte('dia');
                    setMostrarConteo(false);
                  }}
                >
                  <option value="">-- Días con ventas --</option>
                  {fechasDisponibles.map((f) => (
                    <option key={f.fecha} value={f.fecha}>
                      {formatearFechaCorta(f.fecha)} — {f.cantidad_tickets} {f.cantidad_tickets === 1 ? 'ticket' : 'tickets'} (
                      {ETIQUETA_ESTADO_DIA[f.estado] || f.estado})
                    </option>
                  ))}
                </select>
              </div>

              {resumen && !resumen.sin_datos && (
                <span
                  className={`badge fs-6 ${
                    resumen.turno.estado === 'abierto'
                      ? 'bg-success'
                      : resumen.turno.estado === 'sin_cierre'
                      ? 'bg-warning text-dark'
                      : 'bg-secondary'
                  }`}
                >
                  {resumen.es_corte_dia
                    ? resumen.turno.estado === 'abierto'
                      ? 'DÍA EN CURSO'
                      : resumen.turno.estado === 'sin_cierre'
                      ? 'DÍA SIN CIERRE (EL TURNO SIGUIÓ)'
                      : 'DÍA CERRADO'
                    : resumen.turno.estado === 'abierto'
                    ? 'TURNO EN CURSO'
                    : 'TURNO CERRADO'}
                </span>
              )}
            </div>
          </div>

          {/* Indicador de carga mientras llega el corte (primera carga) */}
          {cargandoCorte && !resumen && (
            <div className="card shadow-sm p-5 text-center text-muted mb-3">
              <div className="spinner-border text-primary mx-auto mb-2" role="status" aria-hidden="true" />
              <span className="fw-semibold">Calculando corte...</span>
            </div>
          )}

          {/* Mensaje si se eligió una fecha sin turnos */}
          {resumen?.sin_datos && (
            <div className="card shadow-sm p-5 text-center text-muted mb-3">
              <h5 className="fw-bold mb-1">Sin movimientos el {formatearFechaCorta(resumen.fecha)}</h5>
              <p className="mb-0 small">No hubo ventas ni turnos abiertos en esta fecha.</p>
            </div>
          )}

          {/* Hoja Limpia de Corte Estilo Eleventa */}
          {resumen && !resumen.sin_datos && (
            <div className={`card shadow-sm mb-3 panpos-corte-hoja${cargandoCorte ? ' is-actualizando' : ''}`}>
              <div className="card-header bg-body-tertiary py-3 px-4 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  {resumen.es_corte_dia ? (
                    <>
                      <h5 className="fw-bold mb-0 text-primary">
                        Corte del Día — {formatearFechaCorta(resumen.fecha)}
                      </h5>
                      <small className="text-muted">
                        Ventas y movimientos de este día ({resumen.cantidad_turnos}{' '}
                        {resumen.cantidad_turnos === 1 ? 'turno' : 'turnos'}) • Cajeros:{' '}
                        <strong>{resumen.cajeros?.join(', ') || 'N/A'}</strong> • De{' '}
                        {new Date(resumen.turno.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        a{' '}
                        {resumen.turno.fecha_cierre
                          ? new Date(resumen.turno.fecha_cierre).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'la hora actual'}
                      </small>
                    </>
                  ) : (
                    <>
                      <h5 className="fw-bold mb-0 text-primary">
                        Corte de Cajero: {resumen.turno.usuario?.nombre} — Turno #{resumen.turno.id}
                      </h5>
                      <small className="text-muted">
                        Desde el{' '}
                        {new Date(resumen.turno.fecha_apertura).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })}{' '}
                        a las {horaCorta(resumen.turno.fecha_apertura)} hasta{' '}
                        {resumen.turno.fecha_cierre ? momento(resumen.turno.fecha_cierre) : 'la hora actual (turno en curso)'}
                      </small>
                      {!resumen.turno.fecha_cierre && diasAbierto(resumen.turno.fecha_apertura) > 0 && (
                        <div className="alert alert-warning py-2 px-3 mt-2 mb-0 small fw-semibold no-print">
                          <i className="bi bi-exclamation-triangle-fill me-1" />
                          Este turno lleva {diasAbierto(resumen.turno.fecha_apertura) + 1} días abierto: el corte de cajero suma
                          todos esos días. Para ver solo un día use <strong>Corte del Día</strong>. Cierre el turno al terminar la
                          jornada con el botón de abajo.
                        </div>
                      )}
                    </>
                  )}
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
                {/* Indicadores rápidos del turno / día */}
                {resumen.estadisticas && (
                  <div className="row g-2 mb-4 panpos-corte-kpis">
                    <div className="col-6 col-md-3">
                      <div className="panpos-kpi">
                        <span className="panpos-kpi-label"><i className="bi bi-receipt me-1" />Tickets</span>
                        <span className="panpos-kpi-valor">{resumen.estadisticas.cantidad_tickets}</span>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="panpos-kpi">
                        <span className="panpos-kpi-label"><i className="bi bi-calculator me-1" />Ticket promedio</span>
                        <span className="panpos-kpi-valor">{colones(resumen.estadisticas.ticket_promedio)}</span>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="panpos-kpi">
                        <span className="panpos-kpi-label"><i className="bi bi-basket2-fill me-1" />Artículos vendidos</span>
                        <span className="panpos-kpi-valor">{resumen.estadisticas.articulos_vendidos}</span>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="panpos-kpi">
                        <span className="panpos-kpi-label"><i className="bi bi-clock me-1" />Primera / última venta</span>
                        <span className="panpos-kpi-valor">
                          {momento(resumen.estadisticas.primera_venta)} – {momento(resumen.estadisticas.ultima_venta)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="row g-5">
                  <div className="col-lg-6">
                    <div className="d-flex justify-content-between align-items-baseline border-bottom pb-2 mb-4">
                      <span className="fs-4 fw-bold text-primary"><i className="bi bi-cash-coin me-1" />Ventas Totales</span>
                      <span className="fs-3 fw-bolder text-primary">
                        ₡{Number(resumen.ventas_totales).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <h5 className="fw-bold text-secondary mb-3"><i className="bi bi-database me-1" />Dinero en Caja</h5>
                    <table className="table table-sm table-borderless mb-4">
                      <tbody>
                        <tr>
                          <td className="ps-3">{resumen.es_corte_dia ? 'Efectivo al iniciar el día' : 'Fondo de caja'}</td>
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

                    <h5 className="fw-bold text-secondary mb-2"><i className="bi bi-arrow-down-circle me-1" />Entradas de Efectivo y Abonos</h5>
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
                        <span className="fs-4 fw-bold text-success"><i className="bi bi-bar-chart-fill me-1" />Ganancia</span>
                        <span className="fs-3 fw-bolder text-success">
                          ₡{Number(resumen.ganancia_bruta_total).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <h5 className="fw-bold text-secondary mb-3"><i className="bi bi-cart-check-fill me-1" />Ventas</h5>
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

                    <h5 className="fw-bold text-secondary mb-2"><i className="bi bi-cash-stack me-1" />Ingresos de Contado</h5>
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

                    <h5 className="fw-bold text-secondary mb-2"><i className="bi bi-arrow-up-circle me-1" />Salidas de Efectivo y Préstamos</h5>
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

          {/* Detalle adicional del corte: turnos, departamentos, productos y anulaciones */}
          {resumen && !resumen.sin_datos && (
            <div className="row g-3 mb-3">
              {resumen.es_corte_dia && (resumen.turnos_del_dia || []).length > 0 && (
                <div className="col-12">
                  <div className="card shadow-sm">
                    <div className="card-header fw-bold bg-body-tertiary">
                      <i className="bi bi-people-fill me-1" />Turnos del día
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th className="ps-3">Turno</th>
                            <th>Cajero</th>
                            <th>Horario</th>
                            <th className="text-end">Fondo</th>
                            <th className="text-end">Esperado</th>
                            <th className="text-end">Contado</th>
                            <th className="text-end pe-3">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resumen.turnos_del_dia.map((t: any) => (
                            <tr key={t.id}>
                              <td className="ps-3 fw-bold">#{t.id}</td>
                              <td>{t.cajero || '—'}</td>
                              <td className="small">
                                {momento(t.fecha_apertura)} – {t.estado === 'abierto' ? 'en curso' : momento(t.fecha_cierre)}
                              </td>
                              <td className="text-end">{colones(t.monto_inicial)}</td>
                              <td className="text-end">{t.total_efectivo_esperado === null ? '—' : colones(t.total_efectivo_esperado)}</td>
                              <td className="text-end">{t.total_efectivo_contado === null ? '—' : colones(t.total_efectivo_contado)}</td>
                              <td className="text-end pe-3">
                                {t.diferencia_arqueo === null ? (
                                  <span className="badge bg-success">EN CURSO</span>
                                ) : (
                                  <span
                                    className={`fw-bold ${
                                      t.diferencia_arqueo === 0 ? 'text-warning-emphasis' : t.diferencia_arqueo > 0 ? 'text-success' : 'text-danger'
                                    }`}
                                  >
                                    {t.diferencia_arqueo > 0 ? '+' : ''}
                                    {colones(t.diferencia_arqueo)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="col-lg-7">
                <div className="card shadow-sm h-100">
                  <div className="card-header fw-bold bg-body-tertiary">
                    <i className="bi bi-diagram-3-fill me-1" />Ventas por departamento
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th className="ps-3">Departamento</th>
                          <th className="text-end">Unidades</th>
                          <th className="text-end">Ventas</th>
                          {usuario?.rol === 'admin' && <th className="text-end pe-3">Ganancia</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(resumen.ventas_por_departamento || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center text-muted small py-3">Sin ventas registradas.</td>
                          </tr>
                        ) : (
                          resumen.ventas_por_departamento.map((d: any) => (
                            <tr key={d.departamento}>
                              <td className="ps-3 fw-semibold">{d.departamento}</td>
                              <td className="text-end">{Number(d.unidades_vendidas || 0)}</td>
                              <td className="text-end fw-bold">{colones(d.total_ventas)}</td>
                              {usuario?.rol === 'admin' && (
                                <td className="text-end pe-3 text-success fw-semibold">{colones(d.ganancia_bruta)}</td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="col-lg-5">
                <div className="card shadow-sm h-100">
                  <div className="card-header fw-bold bg-body-tertiary">
                    <i className="bi bi-trophy-fill me-1" />Productos más vendidos
                  </div>
                  <ul className="list-group list-group-flush">
                    {(resumen.top_productos || []).length === 0 ? (
                      <li className="list-group-item text-center text-muted small py-3">Sin ventas registradas.</li>
                    ) : (
                      resumen.top_productos.map((p: any, idx: number) => (
                        <li key={p.nombre} className="list-group-item d-flex justify-content-between align-items-center py-2">
                          <span>
                            <span className="badge bg-secondary me-2">{idx + 1}</span>
                            <span className="fw-semibold">{p.nombre}</span>
                          </span>
                          <span className="text-end small">
                            <strong>{Number(p.unidades)}</strong> u. · {colones(p.total)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              {resumen.anulaciones?.cantidad > 0 && (
                <div className="col-12">
                  <div className="card shadow-sm border-danger-subtle">
                    <div className="card-header fw-bold bg-body-tertiary text-danger">
                      <i className="bi bi-x-octagon-fill me-1" />Tickets anulados ({resumen.anulaciones.cantidad}) — {colones(resumen.anulaciones.monto_total_anulado)}
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <tbody>
                          {resumen.anulaciones.lista.map((v: any) => (
                            <tr key={v.id}>
                              <td className="ps-3 fw-bold" style={{ width: '90px' }}>#{numeroTicket(v)}</td>
                              <td className="small text-muted" style={{ width: '80px' }}>{horaCorta(v.fecha_anulacion || v.updated_at)}</td>
                              <td className="small">
                                {v.motivo_anulacion || 'Sin motivo'}
                                {v.anulada_por?.nombre && <span className="text-muted"> — {v.anulada_por.nombre}</span>}
                              </td>
                              <td className="text-end pe-3 fw-bold text-danger">{colones(v.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botón Contar Billetes y Cerrar Turno centrado abajo (en Corte de Cajero) */}
          {mostrarCierreDeCajero && (
            <div className="d-flex justify-content-center my-3 no-print">
              <button
                className={`btn btn-lg px-5 fw-bold shadow-sm ${mostrarConteo ? 'btn-secondary' : 'btn-danger'}`}
                onClick={() => {
                  // Al abrir el conteo se recalcula el efectivo esperado con las últimas ventas
                  if (!mostrarConteo) recargarCorteActual();
                  setMostrarConteo(!mostrarConteo);
                }}
              >
                {mostrarConteo ? <><i className="bi bi-chevron-up me-1" />Ocultar Billetes y Monedas</> : <><i className="bi bi-cash-stack me-1" />Contar Billetes y Monedas / Cerrar Turno</>}
              </button>
            </div>
          )}

          {/* Panel Desplegable de Conteo de Billetes y Monedas */}
          {mostrarCierreDeCajero && mostrarConteo && (
            <div className="card shadow-sm mb-3 border-primary no-print">
              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <span className="fw-bold"><i className="bi bi-cash-stack me-1" />Conteo de Billetes y Monedas (Costa Rica) y Cierre de Turno</span>
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
                    Cerrar Panel <i className="bi bi-x-lg ms-1" />
                  </button>
                </div>
              </div>
              <form className="card-body" onSubmit={cerrarTurnoDefinitivo}>
                <div className="row g-3">
                  <div className="col-lg-8">
                    <div className="row g-2">
                      {DENOMINACIONES_CR.map((d) => {
                        const cant = Math.max(0, Number(conteoDenominaciones[d.valor]) || 0);
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
                                onKeyDown={(e) => {
                                  if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
                                }}
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
                          onKeyDown={(e) => {
                            if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
                          }}
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
                            ? 'Caja Exacta (₡0 diferencia)'
                            : diferenciaVista > 0
                            ? `Sobrante: +₡${diferenciaVista.toLocaleString()}`
                            : `Faltante: ₡${diferenciaVista.toLocaleString()}`}
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

                    <BotonAccion
                      type="submit"
                      className="btn btn-danger btn-lg w-100 fw-bold"
                      disabled={efectivoContadoFinal === null}
                      cargando={cerrando}
                      textoCargando="Cerrando y respaldando..."
                      textoLento="Generando respaldo, no cierre la ventana..."
                    >
                      <i className="bi bi-lock-fill me-1" />Cerrar Turno y Respaldar BD
                    </BotonAccion>
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
                  <i className="bi bi-calendar-day me-1" />Un Día
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
                  <i className="bi bi-calendar-range me-1" />Varios Días (Intervalo)
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
                    <i className="bi bi-search me-1" />Consultar
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
                    <i className="bi bi-bar-chart-fill me-1" />Gráfico de Ventas {reporte.desde === reporte.hasta ? `por Hora (${reporte.desde})` : `por Día (${reporte.desde} a ${reporte.hasta})`}
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
                    <div className="card-header fw-bold bg-body-tertiary"><i className="bi bi-credit-card me-1" />Ventas por Método de Pago</div>
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
                    <div className="card-header fw-bold bg-body-tertiary"><i className="bi bi-trophy-fill me-1" />Top 10 Productos Más Vendidos</div>
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
