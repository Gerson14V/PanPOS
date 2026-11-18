import React, { useState, useRef, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { PagoItem } from '../types/models';

export const ModuloVentas: React.FC = () => {
  const {
    usuario,
    turno,
    productos,
    clientes,
    configuracion,
    carrito,
    agregarAlCarrito,
    agregarArticuloComun,
    cambiarCantidadCarrito,
    eliminarDelCarrito,
    limpiarCarrito,
    recargarCatalogos,
  } = usePos();

  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'danger' | 'warning'; texto: string } | null>(null);
  const inputScanRef = useRef<HTMLInputElement>(null);

  const [modalCobro, setModalCobro] = useState(false);
  const [modalComun, setModalComun] = useState(false);
  const [modalCajaMov, setModalCajaMov] = useState<'entrada' | 'salida' | null>(null);
  const [modalEspera, setModalEspera] = useState(false);
  const [ventasEnEspera, setVentasEnEspera] = useState<any[]>([]);
  const [ventaEnEsperaId, setVentaEnEsperaId] = useState<number | null>(null);

  const [metodoPrincipal, setMetodoPrincipal] = useState<'efectivo' | 'tarjeta' | 'sinpe' | 'credito' | 'mixto'>('efectivo');
  const [pagaCon, setPagaCon] = useState('');
  const [clienteId, setClienteId] = useState<string>('');
  const [montoEfectivoMixto, setMontoEfectivoMixto] = useState('0');
  const [montoTarjetaMixto, setMontoTarjetaMixto] = useState('0');
  const [montoSinpeMixto, setMontoSinpeMixto] = useState('0');
  const [montoCreditoMixto, setMontoCreditoMixto] = useState('0');

  const [comunDesc, setComunDesc] = useState('Pan / Repostería');
  const [comunPrecio, setComunPrecio] = useState('');
  const [comunCant, setComunCant] = useState('1');
  const [movMonto, setMovMonto] = useState('');
  const [movConcepto, setMovConcepto] = useState('');
  const [errorMovCaja, setErrorMovCaja] = useState<string | null>(null);

  const totalVenta = carrito.reduce((acc, i) => acc + i.subtotal, 0);
  const mostrarRapidos = (configuracion['panel_botones_rapidos'] ?? '1') === '1';
  const botonesRapidos = productos.filter((p) => p.mostrar_boton_rapido);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        if (carrito.length > 0) abrirModalCobro();
      } else if (e.key === 'F6') {
        e.preventDefault();
        abrirTicketsEspera();
      } else if (e.key === 'F7') {
        e.preventDefault();
        setErrorMovCaja(null);
        setModalCajaMov('entrada');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setErrorMovCaja(null);
        setModalCajaMov('salida');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [carrito]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let termino = busqueda.trim();
    if (!termino) return;

    let cantidadMultiplicador = 1;
    if (termino.includes('*')) {
      const partes = termino.split('*');
      const cantParseada = parseInt(partes[0], 10);
      if (!isNaN(cantParseada) && cantParseada > 0 && partes[1]) {
        cantidadMultiplicador = cantParseada;
        termino = partes[1].trim();
      }
    }

    const codigoNormalizado = termino.length === 1 && /^\d$/.test(termino) ? `0${termino}` : termino;
    const exacto = productos.find(
      (p) => p.codigo_barras.toLowerCase() === termino.toLowerCase() || p.codigo_barras === codigoNormalizado
    );

    if (exacto) {
      agregarAlCarrito(exacto, cantidadMultiplicador);
      setBusqueda('');
      return;
    }

    const porNombre = productos.filter((p) => p.nombre.toLowerCase().includes(termino.toLowerCase()));
    if (porNombre.length === 1) {
      agregarAlCarrito(porNombre[0], cantidadMultiplicador);
      setBusqueda('');
    } else if (porNombre.length === 0) {
      setMensaje({ tipo: 'warning', texto: `No se encontró producto con código o nombre "${termino}"` });
    }
  };

  const abrirModalCobro = () => {
    setMetodoPrincipal('efectivo');
    setPagaCon(String(totalVenta));
    setMontoEfectivoMixto(String(totalVenta));
    setMontoTarjetaMixto('0');
    setMontoSinpeMixto('0');
    setMontoCreditoMixto('0');
    setModalCobro(true);
  };

  const confirmarVenta = async (estado: 'completada' | 'en_espera') => {
    if (!turno || !usuario || carrito.length === 0) return;

    let pagos: PagoItem[] = [];

    if (estado === 'completada') {
      if (metodoPrincipal === 'mixto') {
        const ef = Number(montoEfectivoMixto) || 0;
        const tj = Number(montoTarjetaMixto) || 0;
        const sp = Number(montoSinpeMixto) || 0;
        const cr = Number(montoCreditoMixto) || 0;
        if (ef > 0) pagos.push({ metodo_pago: 'efectivo', monto: ef });
        if (tj > 0) pagos.push({ metodo_pago: 'tarjeta', monto: tj });
        if (sp > 0) pagos.push({ metodo_pago: 'sinpe', monto: sp });
        if (cr > 0) pagos.push({ metodo_pago: 'credito', monto: cr });
      } else {
        const recibido = metodoPrincipal === 'efectivo' ? Number(pagaCon) || totalVenta : totalVenta;
        const vuelto = metodoPrincipal === 'efectivo' ? Math.max(0, recibido - totalVenta) : 0;
        pagos.push({
          metodo_pago: metodoPrincipal,
          monto: totalVenta,
          monto_recibido: recibido,
          vuelto_entregado: vuelto,
        });
      }
    }

    try {
      await api.post('/ventas', {
        venta_en_espera_id: ventaEnEsperaId,
        turno_id: turno.id,
        usuario_id: usuario.id,
        cliente_id: clienteId ? Number(clienteId) : null,
        estado,
        items: carrito.map((i) => ({
          producto_id: i.producto_id,
          descripcion_producto: i.descripcion_producto,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })),
        pagos: estado === 'completada' ? pagos : undefined,
      });

      limpiarCarrito();
      setVentaEnEsperaId(null);
      setClienteId('');
      setModalCobro(false);
      await recargarCatalogos();
      setMensaje({
        tipo: 'success',
        texto: estado === 'completada' ? '✅ Venta registrada correctamente.' : '⏸️ Ticket guardado en espera (F6).',
      });
      inputScanRef.current?.focus();
    } catch (err: any) {
      setMensaje({
        tipo: 'danger',
        texto: err.response?.data?.message || 'Error al procesar la venta.',
      });
    }
  };

  const abrirTicketsEspera = async () => {
    if (!turno) return;
    const res = await api.get(`/ventas?turno_id=${turno.id}&estado=en_espera`);
    setVentasEnEspera(res.data);
    setModalEspera(true);
  };

  const recuperarTicketEspera = (venta: any) => {
    limpiarCarrito();
    setVentaEnEsperaId(venta.id);
    venta.detalles.forEach((d: any) => {
      const prod = productos.find((p) => p.id === d.producto_id);
      if (prod) {
        agregarAlCarrito(prod, d.cantidad);
      } else {
        agregarArticuloComun(d.descripcion_producto, Number(d.precio_unitario), d.cantidad);
      }
    });
    setModalEspera(false);
  };

  const guardarMovimientoCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno || !usuario || !modalCajaMov) return;
    setErrorMovCaja(null);
    try {
      await api.post(`/turnos/${turno.id}/movimientos`, {
        usuario_id: usuario.id,
        tipo: modalCajaMov,
        metodo_pago: 'efectivo',
        monto: Number(movMonto),
        concepto: movConcepto,
      });
      setMovMonto('');
      setMovConcepto('');
      setModalCajaMov(null);
      setMensaje({ tipo: 'success', texto: 'Movimiento de efectivo registrado en gaveta.' });
    } catch (err: any) {
      const msg =
        err.response?.data?.errors?.monto?.[0] ||
        err.response?.data?.message ||
        'Error al registrar movimiento.';
      setErrorMovCaja(msg);
    }
  };

  const sugerenciasBusqueda =
    busqueda.trim().length > 1 && !busqueda.includes('*')
      ? productos
          .filter(
            (p) =>
              p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
              p.codigo_barras.toLowerCase().includes(busqueda.toLowerCase())
          )
          .slice(0, 6)
      : [];

  return (
    <div className="container-fluid py-2">
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2 mb-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="row g-2 mb-2 align-items-center">
        <div className="col-md-6 position-relative">
          <form onSubmit={handleScanSubmit} className="input-group input-group-lg">
            <span className="input-group-text bg-primary text-white fw-bold">Código/Nombre</span>
            <input
              ref={inputScanRef}
              type="text"
              className="form-control fw-semibold"
              placeholder="Nombre/Código de Producto"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary fw-bold" type="submit">
              ENTER Agregar
            </button>
          </form>

          {sugerenciasBusqueda.length > 0 && (
            <div className="list-group position-absolute w-100 shadow z-3 mt-1">
              {sugerenciasBusqueda.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                  onClick={() => {
                    agregarAlCarrito(p, 1);
                    setBusqueda('');
                    inputScanRef.current?.focus();
                  }}
                >
                  <div>
                    <span className="badge bg-secondary me-2">{p.codigo_barras}</span>
                    <strong>{p.nombre}</strong>
                  </div>
                  <span className="fw-bold text-success">₡{Number(p.precio_venta).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-md-6 d-flex flex-wrap gap-2 justify-content-md-end">
          <button className="btn btn-outline-primary fw-semibold" onClick={() => setModalComun(true)}>
            + Artículo Común
          </button>
          <button className="btn btn-outline-warning fw-semibold" onClick={() => confirmarVenta('en_espera')} disabled={carrito.length === 0}>
            ⏸ Poner en Espera
          </button>
          <button className="btn btn-outline-info fw-semibold" onClick={abrirTicketsEspera}>
            F6 Recuperar Espera
          </button>
          <button className="btn btn-outline-success fw-semibold" onClick={() => { setErrorMovCaja(null); setModalCajaMov('entrada'); }}>
            F7 Entrada Efectivo
          </button>
          <button className="btn btn-outline-danger fw-semibold" onClick={() => { setErrorMovCaja(null); setModalCajaMov('salida'); }}>
            F8 Salida Efectivo
          </button>
        </div>
      </div>

      <div className="row g-3">
        <div className={mostrarRapidos && botonesRapidos.length > 0 ? 'col-lg-8' : 'col-12'}>
          <div className="card shadow-sm border-0" style={{ minHeight: '55vh' }}>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-dark">
                  <tr>
                    <th>Código</th>
                    <th>Descripción del Producto</th>
                    <th className="text-end">Precio Venta</th>
                    <th className="text-center" style={{ width: '150px' }}>Cantidad</th>
                    <th className="text-end">Importe</th>
                    <th className="text-center">Existencia</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {carrito.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-5 fs-5">
                        Pase un producto por el lector, busque por nombre o digite su código corto (ej. <strong>01</strong>).
                      </td>
                    </tr>
                  ) : (
                    carrito.map((item) => (
                      <tr key={item.uid} className="fs-5">
                        <td><span className="badge bg-secondary">{item.codigo_barras}</span></td>
                        <td className="fw-semibold">{item.descripcion_producto}</td>
                        <td className="text-end">₡{item.precio_unitario.toLocaleString()}</td>
                        <td className="text-center">
                          <div className="input-group input-group-sm justify-content-center">
                            <button
                              className="btn btn-outline-secondary fw-bold px-2"
                              onClick={() => cambiarCantidadCarrito(item.uid, item.cantidad - 1)}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              className="form-control text-center fw-bold"
                              style={{ maxWidth: '60px' }}
                              value={item.cantidad}
                              onChange={(e) => cambiarCantidadCarrito(item.uid, Number(e.target.value))}
                            />
                            <button
                              className="btn btn-outline-secondary fw-bold px-2"
                              onClick={() => cambiarCantidadCarrito(item.uid, item.cantidad + 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="text-end fw-bold text-primary">₡{item.subtotal.toLocaleString()}</td>
                        <td className="text-center">
                          {item.controlar_stock ? (
                            <span className="badge bg-info text-dark">{item.stock_actual}</span>
                          ) : (
                            <span className="badge bg-success">∞</span>
                          )}
                        </td>
                        <td className="text-end">
                          <button className="btn btn-sm btn-outline-danger" onClick={() => eliminarDelCarrito(item.uid)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {mostrarRapidos && botonesRapidos.length > 0 && (
          <div className="col-lg-4">
            <div className="card shadow-sm border-0 h-100">
              <div className="card-header bg-warning-subtle fw-bold">
                🥖 Botones Rápidos de Panadería
              </div>
              <div className="card-body p-2">
                <div className="row g-2">
                  {botonesRapidos.map((p) => (
                    <div className="col-6" key={p.id}>
                      <button
                        className="btn btn-outline-primary w-100 h-100 py-3 text-start d-flex flex-column justify-content-between shadow-sm"
                        onClick={() => {
                          agregarAlCarrito(p, 1);
                          inputScanRef.current?.focus();
                        }}
                      >
                        <div className="d-flex justify-content-between w-100 mb-1">
                          <span className="badge bg-primary">{p.codigo_barras}</span>
                          <span className="fw-bold text-success">₡{Number(p.precio_venta).toLocaleString()}</span>
                        </div>
                        <div className="fw-semibold text-truncate w-100">{p.nombre}</div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card shadow border-0 mt-3 bg-body-tertiary">
        <div className="card-body d-flex flex-wrap justify-content-between align-items-center py-2 px-4">
          <div>
            <span className="text-muted me-3">
              Artículos en la venta: <strong className="fs-4 text-body">{carrito.reduce((a, b) => a + b.cantidad, 0)}</strong>
            </span>
            {carrito.length > 0 && (
              <button className="btn btn-sm btn-outline-danger" onClick={limpiarCarrito}>
                Vaciar Ticket
              </button>
            )}
          </div>

          <div className="d-flex align-items-center gap-4">
            <div className="text-end">
              <div className="small text-muted fw-bold">TOTAL A COBRAR</div>
              <div className="display-5 fw-bold text-primary mb-0">
                ₡{totalVenta.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <button
              className="btn btn-success btn-lg px-5 py-3 fs-4 fw-bold shadow"
              disabled={carrito.length === 0}
              onClick={abrirModalCobro}
            >
              F12 - Cobrar
            </button>
          </div>
        </div>
      </div>

      {modalCobro && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Confirmar Cobro — Total: ₡{totalVenta.toLocaleString()}</h5>
                <button className="btn-close btn-close-white" onClick={() => setModalCobro(false)} />
              </div>
              <div className="modal-body">
                <div className="btn-group w-100 mb-3">
                  {(['efectivo', 'sinpe', 'tarjeta', 'credito', 'mixto'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-lg fw-bold ${metodoPrincipal === m ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setMetodoPrincipal(m)}
                    >
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>

                {(metodoPrincipal === 'credito' || metodoPrincipal === 'mixto') && (
                  <div className="mb-3">
                    <label className="form-label fw-bold">Seleccionar Cliente (Requerido para Crédito / Fiado)</label>
                    <select
                      className="form-select form-select-lg"
                      value={clienteId}
                      onChange={(e) => setClienteId(e.target.value)}
                    >
                      <option value="">-- Seleccione un cliente --</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} (Deuda actual: ₡{Number(c.saldo_deudor).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {metodoPrincipal === 'efectivo' && (
                  <div className="bg-body-secondary p-3 rounded">
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      <span className="small fw-bold text-muted align-self-center me-1">Billetes Rápidos:</span>
                      {[1000, 2000, 5000, 10000, 20000].map((billete) => (
                        <button
                          key={billete}
                          type="button"
                          className="btn btn-outline-success fw-bold"
                          onClick={() => setPagaCon(String(billete))}
                        >
                          ₡{billete.toLocaleString()}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-outline-primary fw-bold"
                        onClick={() => setPagaCon(String(totalVenta))}
                      >
                        Pago Exacto
                      </button>
                    </div>

                    <div className="row g-3 align-items-center">
                      <div className="col-md-6">
                        <label className="form-label fw-bold">Paga con (₡):</label>
                        <input
                          type="number"
                          className="form-control form-control-lg fs-3 fw-bold"
                          value={pagaCon}
                          onChange={(e) => setPagaCon(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="col-md-6 text-end">
                        <div className="text-muted fw-semibold">Su Vuelto / Cambio:</div>
                        <div className="display-6 fw-bold text-success">
                          ₡{Math.max(0, (Number(pagaCon) || 0) - totalVenta).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {metodoPrincipal === 'mixto' && (
                  <div className="row g-2 bg-body-secondary p-3 rounded">
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto en Efectivo (₡)</label>
                      <input type="number" className="form-control" value={montoEfectivoMixto} onChange={(e) => setMontoEfectivoMixto(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto en SINPE Móvil (₡)</label>
                      <input type="number" className="form-control" value={montoSinpeMixto} onChange={(e) => setMontoSinpeMixto(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto en Tarjeta (₡)</label>
                      <input type="number" className="form-control" value={montoTarjetaMixto} onChange={(e) => setMontoTarjetaMixto(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto a Crédito / Fiado (₡)</label>
                      <input type="number" className="form-control" value={montoCreditoMixto} onChange={(e) => setMontoCreditoMixto(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-lg" onClick={() => setModalCobro(false)}>
                  Cancelar (ESC)
                </button>
                <button className="btn btn-success btn-lg px-5 fw-bold" onClick={() => confirmarVenta('completada')}>
                  Confirmar y Registrar Venta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalComun && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form
              className="modal-content"
              onSubmit={(e) => {
                e.preventDefault();
                agregarArticuloComun(comunDesc, Number(comunPrecio), Number(comunCant));
                setComunPrecio('');
                setComunCant('1');
                setModalComun(false);
              }}
            >
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Agregar Artículo Común (Sin Código)</h5>
                <button type="button" className="btn-close" onClick={() => setModalComun(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-2">
                  <label className="form-label">Descripción</label>
                  <input className="form-control" value={comunDesc} onChange={(e) => setComunDesc(e.target.value)} required />
                </div>
                <div className="mb-2">
                  <label className="form-label">Precio Unitario (₡)</label>
                  <input type="number" min="1" className="form-control" value={comunPrecio} onChange={(e) => setComunPrecio(e.target.value)} autoFocus required />
                </div>
                <div className="mb-2">
                  <label className="form-label">Cantidad</label>
                  <input type="number" min="1" className="form-control" value={comunCant} onChange={(e) => setComunCant(e.target.value)} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary w-100 fw-bold">Agregar al Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalCajaMov && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content" onSubmit={guardarMovimientoCaja}>
              <div className="modal-header">
                <h5 className="modal-title fw-bold">
                  {modalCajaMov === 'entrada' ? 'F7 - Registrar Entrada de Efectivo' : 'F8 - Registrar Salida de Efectivo'}
                </h5>
                <button type="button" className="btn-close" onClick={() => setModalCajaMov(null)} />
              </div>
              <div className="modal-body">
                {errorMovCaja && <div className="alert alert-danger fw-semibold">{errorMovCaja}</div>}
                <div className="mb-3">
                  <label className="form-label fw-semibold">Monto en Efectivo (₡)</label>
                  <input type="number" min="1" className="form-control form-control-lg" value={movMonto} onChange={(e) => setMovMonto(e.target.value)} autoFocus required />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Concepto / Motivo</label>
                  <input type="text" className="form-control" placeholder="Ej: Pago a proveedor / Ingreso de monedas" value={movConcepto} onChange={(e) => setMovConcepto(e.target.value)} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary w-100 fw-bold">Guardar Movimiento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalEspera && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Tickets en Espera (F6)</h5>
                <button type="button" className="btn-close" onClick={() => setModalEspera(false)} />
              </div>
              <div className="modal-body">
                {ventasEnEspera.length === 0 ? (
                  <p className="text-muted text-center my-3">No hay tickets en espera actualmente.</p>
                ) : (
                  <div className="list-group">
                    {ventasEnEspera.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                        onClick={() => recuperarTicketEspera(v)}
                      >
                        <div>
                          <strong>Ticket #{v.numero_ticket}</strong> ({v.detalles.length} líneas)
                        </div>
                        <span className="fw-bold text-primary">₡{Number(v.total).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
