import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api, generarClaveIdempotencia, mensajeError, postConReintento } from '../api/client';
import { Cliente } from '../types/models';
import { BotonAccion } from './BotonAccion';

export const ModuloClientes: React.FC = () => {
  const { clientes, usuario, turno, recargarCatalogos } = usePos();
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [efectivoDisponibleCaja, setEfectivoDisponibleCaja] = useState<number>(0);

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [detalleCuenta, setDetalleCuenta] = useState<{ ventas_fiadas: any[]; prestamos_y_abonos: any[] } | null>(null);

  const [modalCliente, setModalCliente] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');

  const [modalOperacion, setModalOperacion] = useState<'abono_cliente' | 'prestamo_cliente' | null>(null);
  const [montoOp, setMontoOp] = useState('');
  const [metodoOp, setMetodoOp] = useState<'efectivo' | 'sinpe' | 'tarjeta'>('efectivo');
  const [conceptoOp, setConceptoOp] = useState('');
  const [alerta, setAlerta] = useState<{ tipo: 'success' | 'danger'; texto: string } | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [procesandoOp, setProcesandoOp] = useState(false);
  const [claveOperacion, setClaveOperacion] = useState('');

  const cargarEfectivoCaja = async () => {
    if (!turno) return;
    try {
      const res = await api.get(`/turnos/${turno.id}/efectivo`);
      setEfectivoDisponibleCaja(Number(res.data.efectivo_disponible || 0));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    cargarEfectivoCaja();
  }, [turno, clientes]);

  const clientesFiltrados = clientes.filter((c) => {
    if (soloDeudores && Number(c.saldo_deudor) <= 0) return false;
    return c.nombre.toLowerCase().includes(busqueda.toLowerCase());
  });

  const totalDeudaGeneral = clientes.reduce((acc, c) => acc + Number(c.saldo_deudor), 0);

  const verEstadoCuenta = async (cliente: Cliente) => {
    setClienteSeleccionado(cliente);
    try {
      const res = await api.get(`/clientes/${cliente.id}/estado-cuenta`);
      setDetalleCuenta(res.data.cliente ? res.data : null);
      setClienteSeleccionado(res.data.cliente);
    } catch {
      setAlerta({ tipo: 'danger', texto: 'No se pudo cargar el estado de cuenta del cliente.' });
    }
  };

  const eliminarCliente = async (cliente: Cliente, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (Number(cliente.saldo_deudor) > 0) {
      setAlerta({
        tipo: 'danger',
        texto: `No se puede eliminar a "${cliente.nombre}" porque tiene una deuda pendiente de ₡${Number(
          cliente.saldo_deudor
        ).toLocaleString()}. Debe saldar su cuenta primero.`,
      });
      return;
    }

    if (!window.confirm(`¿Está seguro de eliminar al cliente "${cliente.nombre}"?`)) return;

    try {
      await api.delete(`/clientes/${cliente.id}`);
      if (clienteSeleccionado?.id === cliente.id) {
        setClienteSeleccionado(null);
        setDetalleCuenta(null);
      }
      await recargarCatalogos();
      setAlerta({ tipo: 'success', texto: `Cliente "${cliente.nombre}" eliminado correctamente.` });
    } catch (err: any) {
      const msg =
        err.response?.data?.errors?.cliente?.[0] ||
        err.response?.data?.message ||
        'No se pudo eliminar el cliente.';
      setAlerta({ tipo: 'danger', texto: msg });
    }
  };

  const guardarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoCliente) return;
    setGuardandoCliente(true);
    try {
      await api.post('/clientes', { nombre, telefono, notas });
      setNombre('');
      setTelefono('');
      setNotas('');
      setModalCliente(false);
      await recargarCatalogos();
      setAlerta({ tipo: 'success', texto: 'Cliente registrado correctamente.' });
    } catch (err: any) {
      setAlerta({ tipo: 'danger', texto: err.response?.data?.message || 'No se pudo registrar el cliente.' });
    } finally {
      setGuardandoCliente(false);
    }
  };

  const abrirModalOperacion = async (tipo: 'abono_cliente' | 'prestamo_cliente') => {
    setErrorModal(null);
    setMontoOp('');
    setConceptoOp('');
    setMetodoOp('efectivo');
    setClaveOperacion(generarClaveIdempotencia(tipo));
    setModalOperacion(tipo);
    // Se abre al instante; el efectivo disponible se actualiza en segundo plano
    void cargarEfectivoCaja();
  };

  const registrarOperacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (procesandoOp || !clienteSeleccionado || !turno || !usuario || !modalOperacion) return;
    setErrorModal(null);

    const monto = Number(montoOp);
    const deudaCliente = Number(clienteSeleccionado.saldo_deudor);

    if (modalOperacion === 'abono_cliente') {
      if (deudaCliente <= 0) {
        setErrorModal(`${clienteSeleccionado.nombre} no tiene deuda pendiente (Saldo: ₡0).`);
        return;
      }
      if (monto > deudaCliente) {
        setErrorModal(
          `No se puede abonar más plata de la que se debe. Deuda actual: ₡${deudaCliente.toLocaleString()} (Intentó abonar: ₡${monto.toLocaleString()}).`
        );
        return;
      }
    }

    if (modalOperacion === 'prestamo_cliente' && metodoOp === 'efectivo') {
      if (monto > efectivoDisponibleCaja) {
        setErrorModal(
          `No hay suficiente efectivo en caja para este préstamo. Efectivo disponible actual en gaveta: ₡${efectivoDisponibleCaja.toLocaleString()} (Intentó prestar: ₡${monto.toLocaleString()}).`
        );
        return;
      }
    }

    setProcesandoOp(true);
    try {
      await postConReintento(`/clientes/${clienteSeleccionado.id}/operacion-credito`, {
        idempotency_key: claveOperacion || generarClaveIdempotencia(modalOperacion),
        turno_id: turno.id,
        tipo: modalOperacion,
        metodo_pago: metodoOp,
        monto,
        concepto: conceptoOp || (modalOperacion === 'abono_cliente' ? 'Abono a deuda' : 'Préstamo de efectivo en caja'),
      });

      setModalOperacion(null);
      setAlerta({ tipo: 'success', texto: 'Operación registrada y saldo actualizado correctamente.' });
      // Refrescar saldos en paralelo sin bloquear la pantalla
      void Promise.all([recargarCatalogos(), verEstadoCuenta(clienteSeleccionado), cargarEfectivoCaja()]);
    } catch (err) {
      setErrorModal(mensajeError(err, 'No se pudo procesar la operación.'));
    } finally {
      setProcesandoOp(false);
    }
  };

  return (
    <div className="container-fluid py-3">
      {alerta && (
        <div className={`alert alert-${alerta.tipo} alert-dismissible fade show py-2`}>
          {alerta.texto}
          <button type="button" className="btn-close py-2" onClick={() => setAlerta(null)} />
        </div>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h4 className="fw-bold mb-0">F2 — Clientes, Fiados y Préstamos</h4>
          <small className="text-muted me-3">
            Total por cobrar: <strong className="text-danger fs-5">₡{totalDeudaGeneral.toLocaleString()}</strong>
          </small>
          <small className="text-muted">
            Efectivo disponible en caja para préstamos:{' '}
            <strong className="text-success fs-5">₡{efectivoDisponibleCaja.toLocaleString()}</strong>
          </small>
        </div>
        <div className="d-flex gap-2">
          <button
            className={`btn fw-semibold ${soloDeudores ? 'btn-danger' : 'btn-outline-danger'}`}
            onClick={() => setSoloDeudores(!soloDeudores)}
          >
            {soloDeudores ? 'Mostrando Solo Deudores' : 'Filtrar Con Saldo Deudor'}
          </button>
          <button className="btn btn-primary fw-bold" onClick={() => setModalCliente(true)}>
            + Nuevo Cliente
          </button>
        </div>
      </div>

      <div className="row g-3">
        {/* Lista Izquierda de Clientes con botón directo de Eliminar */}
        <div className="col-lg-5">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-body-tertiary">
              <input
                type="text"
                className="form-control"
                placeholder="Buscar cliente por nombre..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="list-group list-group-flush" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {clientesFiltrados.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                    clienteSeleccionado?.id === c.id ? 'active' : ''
                  }`}
                  onClick={() => verEstadoCuenta(c)}
                >
                  <div>
                    <div className="fw-bold">{c.nombre}</div>
                    {c.telefono && <small className="opacity-75">Tel: {c.telefono}</small>}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className={`badge fs-6 ${Number(c.saldo_deudor) > 0 ? 'bg-danger' : 'bg-success'}`}>
                      ₡{Number(c.saldo_deudor).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        clienteSeleccionado?.id === c.id ? 'btn-light text-danger' : 'btn-outline-danger'
                      } fw-bold`}
                      title="Eliminar cliente"
                      onClick={(e) => eliminarCliente(c, e)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel Derecho de Estado de Cuenta */}
        <div className="col-lg-7">
          {!clienteSeleccionado ? (
            <div className="card shadow-sm border-0 p-5 text-center text-muted">
              Seleccione un cliente a la izquierda para consultar su Estado de Cuenta, registrar un Abono o entregarle un Préstamo de Efectivo.
            </div>
          ) : (
            <div className="card shadow-sm border-0">
              <div className="card-header d-flex flex-wrap justify-content-between align-items-center bg-body-tertiary gap-2">
                <div>
                  <h5 className="fw-bold mb-0">{clienteSeleccionado.nombre}</h5>
                  <span className="text-danger fw-bold">
                    Deuda Actual: ₡{Number(clienteSeleccionado.saldo_deudor).toLocaleString()}
                  </span>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    className="btn btn-success fw-bold"
                    disabled={Number(clienteSeleccionado.saldo_deudor) <= 0}
                    onClick={() => abrirModalOperacion('abono_cliente')}
                  >
                    <i className="bi bi-cash-stack me-1" />Abonar a Deuda
                  </button>
                  <button
                    className="btn btn-warning fw-bold"
                    onClick={() => abrirModalOperacion('prestamo_cliente')}
                  >
                    <i className="bi bi-cash-coin me-1" />Prestar Efectivo de Caja
                  </button>
                  <button
                    className="btn btn-outline-danger fw-bold"
                    onClick={() => eliminarCliente(clienteSeleccionado)}
                  >
                    <i className="bi bi-trash me-1" />Eliminar Cliente
                  </button>
                </div>
              </div>

              <div className="card-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <h6 className="fw-bold text-primary border-bottom pb-2">
                  Historial de Préstamos de Efectivo y Abonos
                </h6>
                {detalleCuenta?.prestamos_y_abonos.length === 0 ? (
                  <p className="text-muted small">Sin préstamos ni abonos registrados.</p>
                ) : (
                  <table className="table table-sm align-middle mb-4">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Operación</th>
                        <th>Método</th>
                        <th>Concepto</th>
                        <th className="text-end">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleCuenta?.prestamos_y_abonos.map((m: any) => (
                        <tr key={m.id}>
                          <td className="small">{new Date(m.created_at).toLocaleString()}</td>
                          <td>
                            <span className={`badge ${m.tipo === 'abono_cliente' ? 'bg-success' : 'bg-warning text-dark'}`}>
                              {m.tipo === 'abono_cliente' ? 'ABONO' : 'PRÉSTAMO EFECTIVO'}
                            </span>
                          </td>
                          <td className="text-uppercase small">{m.metodo_pago}</td>
                          <td>{m.concepto}</td>
                          <td className="text-end fw-bold">₡{Number(m.monto).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h6 className="fw-bold text-primary border-bottom pb-2">
                  Tickets y Productos Llevados al Crédito (Fiados)
                </h6>
                {detalleCuenta?.ventas_fiadas.length === 0 ? (
                  <p className="text-muted small">No tiene tickets de compra asociados.</p>
                ) : (
                  detalleCuenta?.ventas_fiadas.map((v: any) => (
                    <div key={v.id} className="border rounded p-2 mb-2 bg-body-tertiary">
                      <div className="d-flex justify-content-between fw-bold">
                        <span>Ticket #{v.numero_ticket} — {new Date(v.created_at).toLocaleString()}</span>
                        <span className="text-danger">Total Ticket: ₡{Number(v.total).toLocaleString()}</span>
                      </div>
                      <ul className="mb-0 small mt-1">
                        {v.detalles.map((d: any) => (
                          <li key={d.id}>
                            {d.cantidad}x {d.descripcion_producto} — ₡{Number(d.subtotal).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nuevo Cliente */}
      {modalCliente && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content" onSubmit={guardarCliente}>
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Registrar Nuevo Cliente</h5>
                <button type="button" className="btn-close" onClick={() => setModalCliente(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Nombre Completo</label>
                  <input className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Teléfono (Opcional)</label>
                  <input className="form-control" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Notas / Referencia</label>
                  <textarea className="form-control" value={notas} onChange={(e) => setNotas(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={guardandoCliente}>{guardandoCliente ? 'Guardando...' : 'Guardar Cliente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abono o Préstamo */}
      {modalOperacion && clienteSeleccionado && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content" onSubmit={registrarOperacion}>
              <div className="modal-header">
                <h5 className="modal-title fw-bold">
                  {modalOperacion === 'abono_cliente'
                    ? `Registrar Abono — ${clienteSeleccionado.nombre}`
                    : `Prestar Efectivo de Caja — ${clienteSeleccionado.nombre}`}
                </h5>
                <button type="button" className="btn-close" disabled={procesandoOp} onClick={() => setModalOperacion(null)} />
              </div>
              <div className="modal-body">
                {errorModal && <div className="alert alert-danger fw-semibold">{errorModal}</div>}

                <div className="alert alert-secondary py-2 d-flex justify-content-between">
                  {modalOperacion === 'abono_cliente' ? (
                    <>
                      <span>Deuda máxima abonable:</span>
                      <strong className="text-danger">₡{Number(clienteSeleccionado.saldo_deudor).toLocaleString()}</strong>
                    </>
                  ) : (
                    <>
                      <span>Efectivo disponible hoy en gaveta:</span>
                      <strong className="text-success">₡{efectivoDisponibleCaja.toLocaleString()}</strong>
                    </>
                  )}
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Monto (₡)</label>
                  <div className="input-group">
                    <input
                      type="number"
                      min="1"
                      step="any"
                      className="form-control form-control-lg fw-bold"
                      value={montoOp}
                      onChange={(e) => setMontoOp(e.target.value)}
                      autoFocus
                      required
                    />
                    {modalOperacion === 'abono_cliente' && (
                      <button
                        type="button"
                        className="btn btn-outline-success fw-bold"
                        onClick={() => setMontoOp(String(clienteSeleccionado.saldo_deudor))}
                      >
                        Saldar Total (₡{Number(clienteSeleccionado.saldo_deudor).toLocaleString()})
                      </button>
                    )}
                  </div>
                </div>

                {modalOperacion === 'abono_cliente' && (
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Método de Pago del Abono</label>
                    <select className="form-select" value={metodoOp} onChange={(e) => setMetodoOp(e.target.value as any)}>
                      <option value="efectivo">Efectivo (Entra a Gaveta)</option>
                      <option value="sinpe">SINPE Móvil</option>
                      <option value="tarjeta">Tarjeta</option>
                    </select>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label fw-semibold">Concepto / Observación</label>
                  <input
                    className="form-control"
                    placeholder="Ej: Abono quincenal / Préstamo en efectivo"
                    value={conceptoOp}
                    onChange={(e) => setConceptoOp(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <BotonAccion
                  type="submit"
                  className="btn btn-success w-100 fw-bold btn-lg"
                  cargando={procesandoOp}
                  textoCargando="Registrando..."
                  textoLento="El servidor está ocupado, reintentando..."
                >
                  Confirmar Operación
                </BotonAccion>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
