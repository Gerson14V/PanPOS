import React, { useState } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { Cliente } from '../types/models';

export const ModuloClientes: React.FC = () => {
  const { clientes, usuario, turno, recargarCatalogos } = usePos();
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  // Estado de cuenta y modales
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [detalleCuenta, setDetalleCuenta] = useState<{ ventas_fiadas: any[]; prestamos_y_abonos: any[] } | null>(null);

  // Formulario Nuevo/Editar Cliente
  const [modalCliente, setModalCliente] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');

  // Formulario Abono / Préstamo de Efectivo
  const [modalOperacion, setModalOperacion] = useState<'abono_cliente' | 'prestamo_cliente' | null>(null);
  const [montoOp, setMontoOp] = useState('');
  const [metodoOp, setMetodoOp] = useState<'efectivo' | 'sinpe' | 'tarjeta'>('efectivo');
  const [conceptoOp, setConceptoOp] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const clientesFiltrados = clientes.filter((c) => {
    if (soloDeudores && Number(c.saldo_deudor) <= 0) return false;
    return c.nombre.toLowerCase().includes(busqueda.toLowerCase());
  });

  const totalDeudaGeneral = clientes.reduce((acc, c) => acc + Number(c.saldo_deudor), 0);

  const verEstadoCuenta = async (cliente: Cliente) => {
    setClienteSeleccionado(cliente);
    const res = await api.get(`/clientes/${cliente.id}/estado-cuenta`);
    setDetalleCuenta(res.data);
  };

  const guardarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/clientes', { nombre, telefono, notas });
    setNombre('');
    setTelefono('');
    setNotas('');
    setModalCliente(false);
    await recargarCatalogos();
    setMensaje('Cliente registrado correctamente.');
  };

  const registrarOperacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteSeleccionado || !turno || !usuario || !modalOperacion) return;

    await api.post(`/clientes/${clienteSeleccionado.id}/operacion-credito`, {
      turno_id: turno.id,
      usuario_id: usuario.id,
      tipo: modalOperacion,
      metodo_pago: metodoOp,
      monto: Number(montoOp),
      concepto: conceptoOp || (modalOperacion === 'abono_cliente' ? 'Abono a cuenta' : 'Préstamo de efectivo en caja'),
    });

    setMontoOp('');
    setConceptoOp('');
    setModalOperacion(null);
    await recargarCatalogos();
    await verEstadoCuenta(clienteSeleccionado);
    setMensaje('Operación registrada y saldo actualizado.');
  };

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className="alert alert-success alert-dismissible fade show py-2">
          {mensaje}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h4 className="fw-bold mb-0">F2 — Clientes, Cuentas por Cobrar (Fiados) y Préstamos</h4>
          <small className="text-muted">
            Total por cobrar en la panadería:{' '}
            <strong className="text-danger fs-5">₡{totalDeudaGeneral.toLocaleString()}</strong>
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
        {/* Lista de Clientes */}
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
                <button
                  key={c.id}
                  type="button"
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                    clienteSeleccionado?.id === c.id ? 'active' : ''
                  }`}
                  onClick={() => verEstadoCuenta(c)}
                >
                  <div>
                    <div className="fw-bold">{c.nombre}</div>
                    {c.telefono && <small className="opacity-75">Tel: {c.telefono}</small>}
                  </div>
                  <div className="text-end">
                    <span className={`badge fs-6 ${Number(c.saldo_deudor) > 0 ? 'bg-danger' : 'bg-success'}`}>
                      ₡{Number(c.saldo_deudor).toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Estado de Cuenta Detallado */}
        <div className="col-lg-7">
          {!clienteSeleccionado ? (
            <div className="card shadow-sm border-0 p-5 text-center text-muted">
              Seleccione un cliente a la izquierda para consultar su Estado de Cuenta, registrar un Abono o entregarle un Préstamo de Efectivo.
            </div>
          ) : (
            <div className="card shadow-sm border-0">
              <div className="card-header d-flex flex-wrap justify-content-between align-items-center bg-body-tertiary">
                <div>
                  <h5 className="fw-bold mb-0">{clienteSeleccionado.nombre}</h5>
                  <span className="text-muted small">{clienteSeleccionado.notas || 'Sin notas adicionales'}</span>
                </div>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success fw-bold"
                    onClick={() => setModalOperacion('abono_cliente')}
                  >
                    💵 Abonar a Deuda
                  </button>
                  <button
                    className="btn btn-warning fw-bold"
                    onClick={() => setModalOperacion('prestamo_cliente')}
                  >
                    🤝 Prestar Efectivo de Caja
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
                        <th>Tipo</th>
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
                <button type="submit" className="btn btn-primary w-100 fw-bold">Guardar Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abono o Préstamo de Efectivo */}
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
                <button type="button" className="btn-close" onClick={() => setModalOperacion(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Monto (₡)</label>
                  <input type="number" min="1" className="form-control form-control-lg fw-bold" value={montoOp} onChange={(e) => setMontoOp(e.target.value)} autoFocus required />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Método</label>
                  <select className="form-select" value={metodoOp} onChange={(e) => setMetodoOp(e.target.value as any)}>
                    <option value="efectivo">Efectivo (Afecta Gaveta)</option>
                    <option value="sinpe">SINPE Móvil</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Concepto / Observación</label>
                  <input className="form-control" placeholder="Ej: Abono quincenal / Préstamo para vuelto" value={conceptoOp} onChange={(e) => setConceptoOp(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-success w-100 fw-bold">Confirmar Operación</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
