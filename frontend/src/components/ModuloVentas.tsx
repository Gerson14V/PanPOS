import React, { useState, useRef, useEffect, useCallback } from 'react';
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

  const hayModalAbierto = modalCobro || modalComun || modalCajaMov !== null || modalEspera || !usuario || !turno;

  // Función centralizada para procesar un código escaneado o buscado
  const procesarTerminoBusqueda = useCallback(
    (textoCrudo: string) => {
      let termino = textoCrudo.trim();
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
        setMensaje(null);
        return;
      }

      const porNombre = productos.filter((p) => p.nombre.toLowerCase().includes(termino.toLowerCase()));
      if (porNombre.length === 1) {
        agregarAlCarrito(porNombre[0], cantidadMultiplicador);
        setBusqueda('');
        setMensaje(null);
      } else if (porNombre.length === 0) {
        setMensaje({ tipo: 'warning', texto: `No se encontró producto con código o nombre "${termino}"` });
        setBusqueda('');
      }
    },
    [productos, agregarAlCarrito]
  );

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    procesarTerminoBusqueda(busqueda);
    inputScanRef.current?.focus();
  };

  // Devolver el foco al lector automáticamente cuando se cierra cualquier modal
  useEffect(() => {
    if (!hayModalAbierto) {
      inputScanRef.current?.focus();
    }
  }, [hayModalAbierto]);

  // Interceptor global en F1 Ventas: captura el lector de código de barras aunque el input no tenga el foco
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        if (carrito.length > 0 && !hayModalAbierto) abrirModalCobro();
        return;
      }
      if (e.key === 'F6' && !hayModalAbierto) {
        e.preventDefault();
        abrirTicketsEspera();
        return;
      }
      if (e.key === 'F7' && !hayModalAbierto) {
        e.preventDefault();
        setErrorMovCaja(null);
        setModalCajaMov('entrada');
        return;
      }
      if (e.key === 'F8' && !hayModalAbierto) {
        e.preventDefault();
        setErrorMovCaja(null);
        setModalCajaMov('salida');
        return;
      }

      // Si hay un modal abierto, no interceptamos el teclado
      if (hayModalAbierto) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const esInputScan = activeEl === inputScanRef.current;
      const esOtroInput =
        activeEl &&
        !esInputScan &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      // Si el cajero está editando manualmente la cantidad en una fila de la tabla, respetamos ese input
      if (esOtroInput) {
        if (e.key === 'Enter') {
          activeEl.blur();
          inputScanRef.current?.focus();
        }
        return;
      }

      // Si el foco NO está en la barra de búsqueda y el lector dispara caracteres o Enter:
      if (!esInputScan) {
        if (e.key === 'Enter') {
          if (busqueda.trim().length > 0) {
            e.preventDefault();
            procesarTerminoBusqueda(busqueda);
          }
          inputScanRef.current?.focus();
        } else if (e.key === 'Backspace') {
          inputScanRef.current?.focus();
          setBusqueda((prev) => prev.slice(0, -1));
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          // Captura el primer dígito o letra del lector al vuelo, enfoca el input y lo escribe sin perderlo
          e.preventDefault();
          inputScanRef.current?.focus();
          setBusqueda((prev) => prev + e.key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [carrito, hayModalAbierto, busqueda, procesarTerminoBusqueda]);

  // Si hacen clic en cualquier área vacía de la pantalla principal, regresar el foco al lector
  const mantenerFocoEnLector = (e: React.MouseEvent) => {
    if (hayModalAbierto) return;
    const target = e.target as HTMLElement;
    const interactivo = target.closest('input, select, textarea, button, a');
    if (!interactivo) {
      inputScanRef.current?.focus();
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
    <div className="container-fluid py-2" onClick={mantenerFocoEnLector}>
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2 mb-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      {/* Barra de búsqueda y botones de operación estilo Panadería Artesanal */}
      <div className="row g-2 mb-2 align-items-center">
        <div className="col-md-6 position-relative">
          <form onSubmit={handleScanSubmit} className="input-group input-group-lg shadow-sm">
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
            <button className="btn btn-primary fw-bold px-4" type="submit">
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
          <button className="btn btn-accion-artesanal" onClick={() => setModalComun(true)}>
            + Artículo Común
          </button>
          <button className="btn btn-accion-artesanal" onClick={() => confirmarVenta('en_espera')} disabled={carrito.length === 0}>
            ⏸ Poner en Espera
          </button>
          <button className="btn btn-accion-artesanal" onClick={abrirTicketsEspera}>
            F6 Recuperar Espera
          </button>
          <button className="btn btn-outline-success fw-bold" onClick={() => { setErrorMovCaja(null); setModalCajaMov('entrada'); }}>
            F7 Entrada Efectivo
          </button>
          <button className="btn btn-outline-danger fw-bold" onClick={() => { setErrorMovCaja(null); setModalCajaMov('salida'); }}>
            F8 Salida Efectivo
          </button>
        </div>
      </div>

      {/* Área Principal: Tabla de Venta + Cuadrícula Crema de Botones Rápidos */}
      <div className="row g-3">
        <div className={mostrarRapidos && botonesRapidos.length > 0 ? 'col-lg-8' : 'col-12'}>
          <div className="card shadow-sm card-watermark-panes" style={{ minHeight: '58vh' }}>
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
                      <td colSpan={7} className="text-center text-muted py-5">
                        
                        <div className="fs-5 fw-semibold">
                          Pase un producto por el lector en cualquier momento, busque por nombre o toque un botón rápido.
                        </div>
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
                              onClick={() => {
                                cambiarCantidadCarrito(item.uid, item.cantidad - 1);
                                inputScanRef.current?.focus();
                              }}
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
                              onClick={() => {
                                cambiarCantidadCarrito(item.uid, item.cantidad + 1);
                                inputScanRef.current?.focus();
                              }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="text-end fw-bold text-success">₡{item.subtotal.toLocaleString()}</td>
                        <td className="text-center">
                          {item.controlar_stock ? (
                            <span className="badge bg-info text-dark">{item.stock_actual}</span>
                          ) : (
                            <span className="badge bg-success">∞</span>
                          )}
                        </td>
                        <td className="text-end">
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => {
                              eliminarDelCarrito(item.uid);
                              inputScanRef.current?.focus();
                            }}
                          >
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
            <div className="card shadow-sm h-100">
              <div className="card-header bg-primary text-white fw-bold d-flex align-items-center justify-content-between">
                <span>🥖 Botones Rápidos de Panadería</span>
                <span className="badge bg-warning text-dark">{botonesRapidos.length} rápidos</span>
              </div>
              <div className="card-body p-3">
                <div className="row g-2">
                  {botonesRapidos.map((p) => (
                    <div className="col-6 col-xl-4" key={p.id}>
                      <button
                        className="btn btn-pan-rapido w-100 h-100 p-3 text-center d-flex align-items-center justify-content-center"
                        style={{ minHeight: '85px' }}
                        onClick={() => {
                          agregarAlCarrito(p, 1);
                          inputScanRef.current?.focus();
                        }}
                      >
                        <span className="fw-bold fs-6 lh-sm text-wrap">{p.nombre}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra Inferior estilo Artesanal con Total y Botón Verde de Cobro */}
      <div className="row g-3 mt-1 align-items-stretch">
        <div className="col-lg-8">
          <div className="card shadow-sm h-100 justify-content-center px-4 py-2">
            <div className="d-flex flex-wrap justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-3">
                <div>
                  <div className="small text-muted fw-bold text-uppercase">Artículos en la venta</div>
                  <div className="fs-2 fw-bold">{carrito.reduce((a, b) => a + b.cantidad, 0)}</div>
                </div>
                {carrito.length > 0 && (
                  <button
                    className="btn btn-outline-danger btn-sm fw-bold"
                    onClick={() => {
                      limpiarCarrito();
                      inputScanRef.current?.focus();
                    }}
                  >
                    🗑 Vaciar Ticket
                  </button>
                )}
              </div>

              <div className="text-end">
                <div className="small text-muted fw-bold text-uppercase">Total a Cobrar</div>
                <div className="display-5 fw-bolder text-body mb-0">
                  ₡{totalVenta.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <button
            className="btn btn-success w-100 h-100 py-3 fs-3 fw-bold shadow d-flex align-items-center justify-content-center gap-2"
            disabled={carrito.length === 0}
            onClick={abrirModalCobro}
          >
            <span>🛒 F12 - Cobrar</span>
          </button>
        </div>
      </div>

      {/* Modal F12 Cobrar */}
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

      {/* Modal Artículo Común */}
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

      {/* Modal F7 Entrada / F8 Salida */}
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

      {/* Modal F6 Tickets en Espera */}
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
