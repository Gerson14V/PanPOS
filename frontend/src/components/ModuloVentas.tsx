import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePos } from '../context/PosContext';
import { api, generarClaveIdempotencia, mensajeError, postConReintento } from '../api/client';
import { PagoItem, Producto, RespuestaVenta } from '../types/models';
import { BotonAccion } from './BotonAccion';
import { Aviso, AvisoFlotante } from './AvisoFlotante';
import { sonidos, sonidosActivos } from '../utils/sonidos';
import { imprimirTicket } from '../utils/ticket';

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
    reemplazarCarrito,
    limpiarCarrito,
    aplicarStockActualizado,
  } = usePos();

  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<Aviso | null>(null);
  const cerrarMensaje = useCallback(() => setMensaje(null), []);
  const [indiceSugerencia, setIndiceSugerencia] = useState(-1);
  const inputScanRef = useRef<HTMLInputElement>(null);

  const [modalCobro, setModalCobro] = useState(false);
  const [modalComun, setModalComun] = useState(false);
  const [modalCajaMov, setModalCajaMov] = useState<'entrada' | 'salida' | null>(null);
  const [modalEspera, setModalEspera] = useState(false);
  const [ventasEnEspera, setVentasEnEspera] = useState<any[]>([]);
  const [ventaEnEsperaId, setVentaEnEsperaId] = useState<number | null>(null);
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [procesandoMovCaja, setProcesandoMovCaja] = useState(false);
  const [claveMovCaja, setClaveMovCaja] = useState('');
  const [efectivoDisponible, setEfectivoDisponible] = useState<number | null>(null);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [cargandoLista, setCargandoLista] = useState<'ventas_dia' | 'espera' | null>(null);

  // Modal Ventas del Día
  const [modalVentasDia, setModalVentasDia] = useState(false);
  const [ventasDia, setVentasDia] = useState<any[]>([]);

  const [metodoPrincipal, setMetodoPrincipal] = useState<'efectivo' | 'tarjeta' | 'sinpe' | 'credito' | 'mixto'>('efectivo');
  const [pagaCon, setPagaCon] = useState('');
  const [clienteId, setClienteId] = useState<string>('');
  const [montoEfectivoMixto, setMontoEfectivoMixto] = useState('0');
  const [montoTarjetaMixto, setMontoTarjetaMixto] = useState('0');
  const [montoSinpeMixto, setMontoSinpeMixto] = useState('0');
  const [montoCreditoMixto, setMontoCreditoMixto] = useState('0');
  const impresionAutomatica = (configuracion['impresion_escpos_activa'] ?? '0') === '1';
  const [imprimirAlCobrar, setImprimirAlCobrar] = useState(impresionAutomatica);
  const [filtroVentasDia, setFiltroVentasDia] = useState<'todas' | 'completada' | 'anulada' | 'en_espera'>('todas');

  const [comunDesc, setComunDesc] = useState('Pan / Repostería');
  const [comunPrecio, setComunPrecio] = useState('');
  const [comunCant, setComunCant] = useState('1');
  const [movMonto, setMovMonto] = useState('');
  const [movConcepto, setMovConcepto] = useState('');
  const [errorMovCaja, setErrorMovCaja] = useState<string | null>(null);

  const totalVenta = carrito.reduce((acc, i) => acc + i.subtotal, 0);
  const efMixtoVal = Number(montoEfectivoMixto) || 0;
  const tjMixtoVal = Number(montoTarjetaMixto) || 0;
  const spMixtoVal = Number(montoSinpeMixto) || 0;
  const crMixtoVal = Number(montoCreditoMixto) || 0;
  const sumaMixto = efMixtoVal + tjMixtoVal + spMixtoVal + crMixtoVal;
  const mixtoSinNegativos = efMixtoVal >= 0 && tjMixtoVal >= 0 && spMixtoVal >= 0 && crMixtoVal >= 0;
  const faltaClienteCredito =
    (metodoPrincipal === 'credito' || (metodoPrincipal === 'mixto' && crMixtoVal > 0)) &&
    !clienteId;
  const mixtoCuadra = metodoPrincipal !== 'mixto' || (mixtoSinNegativos && Math.abs(sumaMixto - totalVenta) < 0.01);
  const efectivoSuficiente = metodoPrincipal !== 'efectivo' || (Number(pagaCon) || 0) >= totalVenta;
  const cobroValido = !faltaClienteCredito && mixtoCuadra && efectivoSuficiente;

  // Límite de crédito sugerido (Configuración > Formas de Pago): solo advierte, no bloquea
  const limiteCredito = Number(configuracion['limite_credito_default'] || 0);
  const montoACredito = metodoPrincipal === 'credito' ? totalVenta : metodoPrincipal === 'mixto' ? crMixtoVal : 0;
  const clienteCredito = clientes.find((c) => String(c.id) === clienteId);
  const deudaResultante = clienteCredito ? Number(clienteCredito.saldo_deudor) + montoACredito : 0;
  const excedeLimiteCredito = limiteCredito > 0 && montoACredito > 0 && !!clienteCredito && deudaResultante > limiteCredito;
  const mostrarRapidos = (configuracion['panel_botones_rapidos'] ?? '1') === '1';
  const botonesRapidos = productos.filter((p) => p.mostrar_boton_rapido);

  const hayModalAbierto =
    modalCobro || modalComun || modalCajaMov !== null || modalEspera || modalVentasDia || !usuario || !turno;

  const conSonido = sonidosActivos(configuracion);

  /** Agrega un producto con sonido de confirmación (o de error si no hay existencias). */
  const agregarProducto = useCallback(
    (prod: Producto, cantidad = 1): boolean => {
      const err = agregarAlCarrito(prod, cantidad);
      if (err) {
        if (conSonido) sonidos.error();
        setMensaje({ tipo: 'danger', texto: err });
        return false;
      }
      if (conSonido) sonidos.agregado();
      // Un acierto limpia avisos de error anteriores, pero no el de "venta registrada / vuelto"
      setMensaje((prev) => (prev && prev.tipo !== 'success' ? null : prev));
      return true;
    },
    [agregarAlCarrito, conSonido]
  );

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
        agregarProducto(exacto, cantidadMultiplicador);
        setBusqueda('');
        return;
      }

      const porNombre = productos.filter((p) => p.nombre.toLowerCase().includes(termino.toLowerCase()));
      if (porNombre.length === 1) {
        agregarProducto(porNombre[0], cantidadMultiplicador);
        setBusqueda('');
      } else if (porNombre.length === 0) {
        if (conSonido) sonidos.error();
        setMensaje({ tipo: 'warning', texto: `No se encontró producto con código o nombre "${termino}"` });
        setBusqueda('');
      } else {
        setMensaje({
          tipo: 'info',
          texto: `${porNombre.length} productos coinciden con "${termino}". Elija con las flechas ↑ ↓ y presione Enter.`,
        });
      }
    },
    [productos, agregarProducto, conSonido]
  );

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const seleccionada = indiceSugerencia >= 0 ? sugerenciasBusqueda[indiceSugerencia] : undefined;
    if (seleccionada) {
      agregarProducto(seleccionada, 1);
      setBusqueda('');
    } else {
      procesarTerminoBusqueda(busqueda);
    }
    setIndiceSugerencia(-1);
    inputScanRef.current?.focus();
  };

  // Navegación con flechas dentro de las sugerencias de búsqueda
  const navegarSugerencias = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sugerenciasBusqueda.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSugerencia((i) => (i + 1) % sugerenciasBusqueda.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSugerencia((i) => (i <= 0 ? sugerenciasBusqueda.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setBusqueda('');
      setIndiceSugerencia(-1);
    }
  };

  useEffect(() => {
    if (!hayModalAbierto) {
      inputScanRef.current?.focus();
    }
  }, [hayModalAbierto]);

  useEffect(() => {
    if (carrito.length === 0 || !turno || !usuario) {
      setVentaEnEsperaId(null);
    }
  }, [carrito.length, turno?.id, usuario?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (procesandoVenta || procesandoMovCaja) return;
        if (modalCobro) { setModalCobro(false); return; }
        if (modalComun) { setModalComun(false); return; }
        if (modalCajaMov) { setModalCajaMov(null); return; }
        if (modalEspera) { setModalEspera(false); return; }
        if (modalVentasDia) { setModalVentasDia(false); return; }
      }
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
        abrirMovimientoCaja('entrada');
        return;
      }
      if (e.key === 'F8' && !hayModalAbierto) {
        e.preventDefault();
        abrirMovimientoCaja('salida');
        return;
      }

      if (hayModalAbierto) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const esInputScan = activeEl === inputScanRef.current;
      const esOtroInput =
        activeEl &&
        !esInputScan &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      if (esOtroInput) {
        if (e.key === 'Enter') {
          activeEl.blur();
          inputScanRef.current?.focus();
        }
        return;
      }

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
        } else if (e.key === ' ' && activeEl?.tagName === 'BUTTON') {
          return;
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          inputScanRef.current?.focus();
          setBusqueda((prev) => prev + e.key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [carrito, hayModalAbierto, busqueda, procesarTerminoBusqueda, modalCobro, modalComun, modalCajaMov, modalEspera, modalVentasDia, procesandoVenta, procesandoMovCaja]);

  const mantenerFocoEnLector = (e: React.MouseEvent) => {
    if (hayModalAbierto) return;
    const target = e.target as HTMLElement;
    const interactivo = target.closest('input, select, textarea, button, a');
    if (!interactivo) {
      inputScanRef.current?.focus();
    }
  };

  const abrirModalCobro = () => {
    setIdempotencyKey(generarClaveIdempotencia('venta'));
    setMetodoPrincipal('efectivo');
    setPagaCon(String(totalVenta));
    setMontoEfectivoMixto(String(totalVenta));
    setMontoTarjetaMixto('0');
    setMontoSinpeMixto('0');
    setMontoCreditoMixto('0');
    setImprimirAlCobrar(impresionAutomatica);
    setModalCobro(true);
  };

  const ventasDiaFiltradas = filtroVentasDia === 'todas' ? ventasDia : ventasDia.filter((v) => v.estado === filtroVentasDia);
  const totalesPorMetodo = ventasDia
    .filter((v) => v.estado === 'completada')
    .flatMap((v) => v.pagos || [])
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.metodo_pago] = (acc[p.metodo_pago] || 0) + Number(p.monto);
      return acc;
    }, {});

  const abrirVentasDelDia = async () => {
    if (!turno || cargandoLista) return;
    setCargandoLista('ventas_dia');
    try {
      const res = await api.get(`/ventas?turno_id=${turno.id}`);
      setVentasDia(res.data);
      setFiltroVentasDia('todas');
      setModalVentasDia(true);
    } catch (err) {
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'No se pudieron cargar las ventas del día.') });
    } finally {
      setCargandoLista(null);
    }
  };

  const abrirMovimientoCaja = (tipo: 'entrada' | 'salida') => {
    setErrorMovCaja(null);
    setClaveMovCaja(generarClaveIdempotencia(tipo));
    setEfectivoDisponible(null);
    setModalCajaMov(tipo);
    // Consulta liviana: muestra cuánto efectivo hay antes de registrar una salida
    if (tipo === 'salida' && turno) {
      api
        .get(`/turnos/${turno.id}/efectivo`)
        .then((res) => setEfectivoDisponible(Number(res.data.efectivo_disponible)))
        .catch(() => setEfectivoDisponible(null));
    }
  };

  const eliminarTicketDelDia = async (ventaId: number, numeroTicket: number) => {
    if (!usuario || anulandoId !== null) return;
    const motivo = window.prompt(
      `¿Desea eliminar/anular el Ticket #${numeroTicket}? (Se devolverá el inventario y se revertirá el cobro).\nMotivo:`,
      'Cancelado en caja'
    );
    if (!motivo || !motivo.trim()) return;

    setAnulandoId(ventaId);
    try {
      const res = await api.post<RespuestaVenta>(`/ventas/${ventaId}/anular`, {
        motivo_anulacion: motivo.trim(),
      });
      aplicarStockActualizado(res.data.productos_actualizados);
      // Actualizar la fila en la lista abierta sin volver a descargarla
      setVentasDia((prev) =>
        prev.map((v) =>
          v.id === ventaId
            ? { ...v, estado: 'anulada', motivo_anulacion: res.data.motivo_anulacion ?? motivo.trim() }
            : v
        )
      );
      setMensaje({ tipo: 'warning', texto: `Ticket #${numeroTicket} eliminado/anulado y existencias restauradas.` });
    } catch (err) {
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'No se pudo anular el ticket.') });
    } finally {
      setAnulandoId(null);
    }
  };

  const confirmarVenta = async (estado: 'completada' | 'en_espera') => {
    if (procesandoVenta || !turno || !usuario || carrito.length === 0) return;
    if (estado === 'completada' && !cobroValido) return;

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

    const vuelto = estado === 'completada' ? pagos.reduce((acc, p) => acc + Number(p.vuelto_entregado || 0), 0) : 0;

    setProcesandoVenta(true);
    try {
      // Con clave de idempotencia el cobro se reintenta solo si el servidor no respondió,
      // sin riesgo de registrar la venta dos veces.
      const res = await postConReintento<RespuestaVenta>('/ventas', {
        idempotency_key: estado === 'completada' ? (idempotencyKey || generarClaveIdempotencia('venta')) : generarClaveIdempotencia('espera'),
        venta_en_espera_id: ventaEnEsperaId,
        turno_id: turno.id,
        // El cliente solo se asocia si hay crédito (o al guardar en espera); así una venta
        // en efectivo no queda a nombre del cliente elegido antes en la pestaña Crédito.
        cliente_id: clienteId && (estado === 'en_espera' || montoACredito > 0) ? Number(clienteId) : null,
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
      aplicarStockActualizado(res.data.productos_actualizados);
      setIdempotencyKey('');
      setVentaEnEsperaId(null);
      setClienteId('');
      setModalCobro(false);

      const ventaRegistrada = res.data;
      const imprimirAhora = estado === 'completada' && imprimirAlCobrar;
      if (estado === 'completada' && conSonido) sonidos.cobrado();
      if (imprimirAhora) imprimirTicket(ventaRegistrada, configuracion);

      setMensaje({
        tipo: 'success',
        texto:
          estado === 'completada'
            ? `Venta #${ventaRegistrada.numero_ticket} registrada.${
                vuelto > 0 ? ` Vuelto a entregar: ₡${vuelto.toLocaleString('es-CR')}` : ''
              }`
            : `Ticket #${ventaRegistrada.numero_ticket} guardado en espera (F6).`,
        accion:
          estado === 'completada' && !imprimirAhora
            ? {
                etiqueta: (
                  <>
                    <i className="bi bi-printer me-1" />Imprimir tiquete
                  </>
                ),
                alHacerClic: () => imprimirTicket(ventaRegistrada, configuracion),
              }
            : undefined,
      });
      inputScanRef.current?.focus();
    } catch (err) {
      // El ticket en espera ya no existe (p. ej. se anuló al cerrar el turno): se cobra como venta nueva
      if ((err as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors?.venta_en_espera_id) {
        setVentaEnEsperaId(null);
      }
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'Error al procesar la venta.') });
    } finally {
      setProcesandoVenta(false);
    }
  };

  const abrirTicketsEspera = async () => {
    if (!turno || cargandoLista) return;
    setCargandoLista('espera');
    try {
      const res = await api.get(`/ventas?turno_id=${turno.id}&estado=en_espera`);
      setVentasEnEspera(res.data);
      setModalEspera(true);
    } catch (err) {
      setMensaje({ tipo: 'danger', texto: mensajeError(err, 'No se pudieron cargar los tickets en espera.') });
    } finally {
      setCargandoLista(null);
    }
  };

  const recuperarTicketEspera = (venta: any) => {
    const itemsRecuperados = venta.detalles.map((d: any, idx: number) => {
      const prod = productos.find((p) => p.id === d.producto_id);
      const precio = Number(d.precio_unitario);
      const cant = Math.max(1, Number(d.cantidad) || 1);
      return {
        uid: `esp-${venta.id}-${idx}-${Date.now()}`,
        producto_id: prod ? prod.id : null,
        codigo_barras: prod ? prod.codigo_barras : 'COMUN',
        descripcion_producto: prod ? prod.nombre : d.descripcion_producto,
        precio_unitario: precio,
        cantidad: cant,
        subtotal: cant * precio,
        stock_actual: prod ? Math.max(0, Number(prod.stock_actual || 0)) : undefined,
        controlar_stock: prod ? prod.controlar_stock : false,
      };
    });
    reemplazarCarrito(itemsRecuperados);
    setVentaEnEsperaId(venta.id);
    setClienteId(venta.cliente_id ? String(venta.cliente_id) : '');
    setModalEspera(false);
  };

  const guardarMovimientoCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (procesandoMovCaja || !turno || !usuario || !modalCajaMov) return;
    setErrorMovCaja(null);
    setProcesandoMovCaja(true);
    try {
      await postConReintento(`/turnos/${turno.id}/movimientos`, {
        idempotency_key: claveMovCaja || generarClaveIdempotencia(modalCajaMov),
        tipo: modalCajaMov,
        metodo_pago: 'efectivo',
        monto: Number(movMonto),
        concepto: movConcepto,
      });
      const monto = Number(movMonto);
      setMovMonto('');
      setMovConcepto('');
      setModalCajaMov(null);
      setMensaje({
        tipo: 'success',
        texto: `${modalCajaMov === 'entrada' ? 'Entrada' : 'Salida'} de ₡${monto.toLocaleString('es-CR')} registrada en gaveta.`,
      });
    } catch (err) {
      setErrorMovCaja(mensajeError(err, 'Error al registrar movimiento.'));
    } finally {
      setProcesandoMovCaja(false);
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
      <AvisoFlotante aviso={mensaje} alCerrar={cerrarMensaje} />

      {/* Barra de búsqueda y botones de operación */}
      <div className="row g-2 mb-2 align-items-center">
        <div className="col-lg-6 col-xxl-5 position-relative">
          <form onSubmit={handleScanSubmit} className="input-group input-group-lg shadow-sm">
            <span className="input-group-text bg-primary text-white fw-bold" title="Código/Nombre">
              <i className="bi bi-upc-scan" />
            </span>
            <input
              ref={inputScanRef}
              type="text"
              className="form-control fw-semibold"
              placeholder="Nombre/Código de Producto"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setIndiceSugerencia(-1);
              }}
              onKeyDown={navegarSugerencias}
              autoComplete="off"
              autoFocus
            />
            <button className="btn btn-primary fw-bold px-3" type="submit">
              ENTER
            </button>
          </form>

          {sugerenciasBusqueda.length > 0 && (
            <div className="list-group position-absolute w-100 shadow z-3 mt-1">
              {sugerenciasBusqueda.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center${
                    idx === indiceSugerencia ? ' active' : ''
                  }`}
                  onMouseEnter={() => setIndiceSugerencia(idx)}
                  onClick={() => {
                    agregarProducto(p, 1);
                    setBusqueda('');
                    setIndiceSugerencia(-1);
                    inputScanRef.current?.focus();
                  }}
                >
                  <div>
                    <span className="badge bg-secondary me-2">{p.codigo_barras}</span>
                    <strong>{p.nombre}</strong>
                  </div>
                  <span className={`fw-bold ${idx === indiceSugerencia ? '' : 'text-success'}`}>₡{Number(p.precio_venta).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-lg-6 col-xxl-7 d-flex flex-wrap gap-2 justify-content-lg-end panpos-acciones-venta">
          
          <button className="btn btn-accion-artesanal" onClick={() => setModalComun(true)}>
            + Artículo Común
          </button>
          <BotonAccion
            className="btn btn-accion-artesanal"
            onClick={() => confirmarVenta('en_espera')}
            disabled={carrito.length === 0}
            cargando={procesandoVenta && !modalCobro}
            textoCargando="Guardando..."
          >
            <i className="bi bi-pause-circle me-1" />En Espera
          </BotonAccion>
          <BotonAccion
            className="btn btn-accion-artesanal"
            onClick={abrirTicketsEspera}
            cargando={cargandoLista === 'espera'}
            textoCargando="F6 Recuperar"
          >
            F6 Recuperar
          </BotonAccion>
          <button className="btn btn-outline-success fw-bold" onClick={() => abrirMovimientoCaja('entrada')}>
            F7 Entrada
          </button>
          <button className="btn btn-outline-danger fw-bold" onClick={() => abrirMovimientoCaja('salida')}>
            F8 Salida
          </button>
        </div>
      </div>

      {/* Área Principal: Tabla de Venta + Botones Rápidos */}
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
                              min={0}
                              max={item.controlar_stock ? item.stock_actual : undefined}
                              className="form-control text-center fw-bold"
                              style={{ maxWidth: '60px' }}
                              value={item.cantidad}
                              onKeyDown={(e) => {
                                if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
                              }}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                const err = cambiarCantidadCarrito(item.uid, val);
                                if (err) setMensaje({ tipo: 'warning', texto: err });
                              }}
                            />
                            <button
                              className="btn btn-outline-secondary fw-bold px-2"
                              onClick={() => {
                                const err = cambiarCantidadCarrito(item.uid, item.cantidad + 1);
                                if (err) setMensaje({ tipo: 'warning', texto: err });
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
                            <i className="bi bi-x-lg" />
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
                <span><i className="bi bi-basket2-fill me-1" />Botones Rápidos de Panadería</span>
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
                          agregarProducto(p, 1);
                          inputScanRef.current?.focus();
                        }}
                      >
                        <span className="d-flex flex-column align-items-center gap-1">
                          <span className="fw-bold fs-6 lh-sm text-wrap">{p.nombre}</span>
                          <span className="panpos-precio-rapido">₡{Number(p.precio_venta).toLocaleString('es-CR')}</span>
                          {p.controlar_stock && Number(p.stock_actual) <= 5 && (
                            <span className={`badge ${Number(p.stock_actual) <= 0 ? 'bg-danger' : 'bg-warning text-dark'}`}>
                              {Number(p.stock_actual) <= 0 ? 'Agotado' : `Quedan ${p.stock_actual}`}
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra Inferior Total y Cobrar */}
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
                      setVentaEnEsperaId(null);
                      setClienteId('');
                      inputScanRef.current?.focus();
                    }}
                  >
                    <i className="bi bi-trash me-1" />Vaciar Ticket
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
            <span><i className="bi bi-cart-check-fill me-1" />F12 - Cobrar</span>
          </button>
        </div>
      </div>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
        <div className="panpos-atajos small text-muted">
          <span><kbd>F12</kbd> Cobrar</span>
          <span><kbd>F6</kbd> Recuperar</span>
          <span><kbd>F7</kbd> Entrada</span>
          <span><kbd>F8</kbd> Salida</span>
          <span><kbd>3*</kbd><kbd>código</kbd> Cantidad</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> Elegir producto</span>
          <span><kbd>Esc</kbd> Cerrar</span>
        </div>
        <BotonAccion
          className="btn btn-accion-artesanal px-4 py-2 fw-bold"
          onClick={abrirVentasDelDia}
          cargando={cargandoLista === 'ventas_dia'}
          textoCargando="Cargando ventas..."
        >
          <i className="bi bi-receipt me-1" />Ventas del Día
        </BotonAccion>
      </div>

      {/* Modal Ventas del Día (Ver tickets y eliminar/anular) */}
      {modalVentasDia && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-receipt me-1" />Ventas del Día — Turno #{turno?.id} ({ventasDia.length} tickets)
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setModalVentasDia(false)} />
              </div>
              <div className="px-3 py-2 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 bg-body-tertiary">
                <div className="btn-group btn-group-sm" role="group" aria-label="Filtrar tickets">
                  {(
                    [
                      ['todas', 'Todas'],
                      ['completada', 'Completadas'],
                      ['anulada', 'Anuladas'],
                      ['en_espera', 'En espera'],
                    ] as const
                  ).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      className={`btn fw-semibold ${filtroVentasDia === valor ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setFiltroVentasDia(valor)}
                    >
                      {etiqueta} ({valor === 'todas' ? ventasDia.length : ventasDia.filter((v) => v.estado === valor).length})
                    </button>
                  ))}
                </div>
                <div className="d-flex flex-wrap gap-2 small">
                  {Object.entries(totalesPorMetodo).map(([metodo, total]) => (
                    <span key={metodo} className="badge text-bg-light border fw-semibold text-uppercase">
                      {metodo}: ₡{total.toLocaleString('es-CR')}
                    </span>
                  ))}
                </div>
              </div>
              <div className="modal-body p-0">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>Ticket #</th>
                      <th>Hora</th>
                      <th>Cajero</th>
                      <th>Cliente</th>
                      <th>Artículos</th>
                      <th>Método de Pago</th>
                      <th>Estado</th>
                      <th className="text-end">Total</th>
                      <th className="text-end">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasDiaFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center text-muted py-4">
                          {ventasDia.length === 0 ? 'Aún no hay ventas registradas en este turno.' : 'No hay tickets con este filtro.'}
                        </td>
                      </tr>
                    ) : (
                      ventasDiaFiltradas.map((v) => (
                        <tr key={v.id} className={v.estado === 'anulada' ? 'table-danger' : ''}>
                          <td className="fw-bold">#{v.numero_ticket}</td>
                          <td className="small">{new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="small">{v.usuario?.nombre || '—'}</td>
                          <td>{v.cliente?.nombre || 'Contado'}</td>
                          <td className="small">
                            {v.detalles.map((d: any) => `${d.cantidad}x ${d.descripcion_producto}`).join(', ')}
                            {v.motivo_anulacion && (
                              <div className="text-danger fw-bold">Motivo: {v.motivo_anulacion}</div>
                            )}
                          </td>
                          <td>
                            {v.pagos && v.pagos.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1">
                                {v.pagos.map((p: any, i: number) => (
                                  <span key={i} className="badge bg-secondary text-uppercase">
                                    {p.metodo_pago}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="badge bg-warning text-dark">EN ESPERA</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                v.estado === 'completada'
                                  ? 'bg-success'
                                  : v.estado === 'anulada'
                                  ? 'bg-danger'
                                  : 'bg-warning text-dark'
                              }`}
                            >
                              {v.estado.toUpperCase()}
                            </span>
                          </td>
                          <td className="text-end fw-bold">₡{Number(v.total).toLocaleString()}</td>
                          <td className="text-end text-nowrap">
                            {v.estado === 'completada' && (
                              <button
                                className="btn btn-sm btn-outline-secondary fw-bold me-1"
                                title="Reimprimir tiquete"
                                onClick={() => imprimirTicket(v, configuracion, true)}
                              >
                                <i className="bi bi-printer" />
                              </button>
                            )}
                            {v.estado !== 'anulada' && (
                              <BotonAccion
                                className="btn btn-sm btn-outline-danger fw-bold"
                                disabled={anulandoId !== null && anulandoId !== v.id}
                                cargando={anulandoId === v.id}
                                textoCargando="Anulando..."
                                onClick={() => eliminarTicketDelDia(v.id, v.numero_ticket)}
                              >
                                <i className="bi bi-trash me-1" />Eliminar
                              </BotonAccion>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="modal-footer justify-content-between">
                <span className="fw-bold text-primary">
                  Total Cobrado Hoy: ₡
                  {ventasDia
                    .filter((v) => v.estado === 'completada')
                    .reduce((acc, v) => acc + Number(v.total), 0)
                    .toLocaleString()}
                </span>
                <button className="btn btn-secondary fw-bold" disabled={anulandoId !== null} onClick={() => setModalVentasDia(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal F12 Cobrar */}
      {modalCobro && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <form
              className="modal-content"
              onSubmit={(e) => {
                e.preventDefault();
                confirmarVenta('completada');
              }}
            >
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title fw-bold">Confirmar Cobro — Total: ₡{totalVenta.toLocaleString()}</h5>
                <button type="button" className="btn-close btn-close-white" disabled={procesandoVenta} onClick={() => setModalCobro(false)} />
              </div>
              <div className="modal-body">
                <div className="btn-group w-100 mb-3">
                  {(
                    [
                      ['efectivo', 'bi-cash-stack', 'Efectivo'],
                      ['sinpe', 'bi-phone', 'SINPE'],
                      ['tarjeta', 'bi-credit-card', 'Tarjeta'],
                      ['credito', 'bi-journal-text', 'Crédito'],
                      ['mixto', 'bi-shuffle', 'Mixto'],
                    ] as const
                  ).map(([m, icono, etiqueta]) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-lg fw-bold ${metodoPrincipal === m ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => setMetodoPrincipal(m)}
                    >
                      <i className={`bi ${icono} me-1`} />
                      {etiqueta}
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

                {(metodoPrincipal === 'sinpe' || metodoPrincipal === 'mixto') && configuracion['sinpe_telefono_receptor'] && (
                  <div className="panpos-sinpe-info mb-3">
                    <i className="bi bi-phone-fill fs-3" />
                    <div>
                      <div className="small fw-bold text-uppercase">SINPE Móvil del negocio</div>
                      <div className="fs-4 fw-bolder">{configuracion['sinpe_telefono_receptor']}</div>
                    </div>
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
                          min="0"
                          step="any"
                          className="form-control form-control-lg fs-3 fw-bold"
                          value={pagaCon}
                          onKeyDown={(e) => {
                            if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
                          }}
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
                      <input type="number" min="0" step="any" className="form-control" value={montoEfectivoMixto} onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }} onChange={(e) => setMontoEfectivoMixto(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto en SINPE Móvil (₡)</label>
                      <input type="number" min="0" step="any" className="form-control" value={montoSinpeMixto} onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }} onChange={(e) => setMontoSinpeMixto(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto en Tarjeta (₡)</label>
                      <input type="number" min="0" step="any" className="form-control" value={montoTarjetaMixto} onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }} onChange={(e) => setMontoTarjetaMixto(e.target.value)} />
                    </div>
                    <div className="col-6">
                      <label className="form-label fw-semibold">Monto a Crédito / Fiado (₡)</label>
                      <input type="number" min="0" step="any" className="form-control" value={montoCreditoMixto} onKeyDown={(e) => { if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault(); }} onChange={(e) => setMontoCreditoMixto(e.target.value)} />
                    </div>
                  </div>
                )}
                {excedeLimiteCredito && (
                  <div className="alert alert-warning py-2 mt-3 mb-0 small fw-bold">
                    <i className="bi bi-exclamation-triangle-fill me-1" />
                    Con esta venta {clienteCredito?.nombre} quedaría debiendo ₡{deudaResultante.toLocaleString('es-CR')}, más que el
                    límite sugerido de ₡{limiteCredito.toLocaleString('es-CR')}.
                  </div>
                )}
                {faltaClienteCredito && (
                  <div className="alert alert-warning py-2 mt-3 mb-0 small fw-bold">
                    <i className="bi bi-exclamation-triangle-fill me-1" />Debe seleccionar un cliente para registrar una venta a crédito.
                  </div>
                )}
                {!mixtoCuadra && (
                  <div className="alert alert-warning py-2 mt-3 mb-0 small fw-bold">
                    <i className="bi bi-exclamation-triangle-fill me-1" />La suma del pago mixto (₡{sumaMixto.toLocaleString()}) debe coincidir con el total (₡{totalVenta.toLocaleString()}). Diferencia: ₡{(totalVenta - sumaMixto).toLocaleString()}.
                  </div>
                )}
                {!efectivoSuficiente && (
                  <div className="alert alert-warning py-2 mt-3 mb-0 small fw-bold">
                    <i className="bi bi-exclamation-triangle-fill me-1" />El monto recibido en efectivo es menor al total a cobrar.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <div className="form-check form-switch me-auto">
                  <input
                    id="imprimir-al-cobrar"
                    className="form-check-input"
                    type="checkbox"
                    checked={imprimirAlCobrar}
                    onChange={(e) => setImprimirAlCobrar(e.target.checked)}
                  />
                  <label className="form-check-label fw-semibold" htmlFor="imprimir-al-cobrar">
                    <i className="bi bi-printer me-1" />Imprimir tiquete
                  </label>
                </div>
                <button type="button" className="btn btn-secondary btn-lg" disabled={procesandoVenta} onClick={() => setModalCobro(false)}>
                  Cancelar (ESC)
                </button>
                <BotonAccion
                  type="submit"
                  className="btn btn-success btn-lg px-5 fw-bold"
                  disabled={!cobroValido}
                  cargando={procesandoVenta}
                  textoCargando="Registrando venta..."
                  textoLento="El servidor está ocupado, reintentando..."
                >
                  Confirmar y Registrar Venta
                </BotonAccion>
              </div>
            </form>
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
                <button type="button" className="btn-close" disabled={procesandoMovCaja} onClick={() => setModalCajaMov(null)} />
              </div>
              <div className="modal-body">
                {errorMovCaja && <div className="alert alert-danger fw-semibold">{errorMovCaja}</div>}
                {modalCajaMov === 'salida' && (
                  <div className="d-flex justify-content-between align-items-center p-2 px-3 mb-3 rounded bg-body-secondary small">
                    <span className="fw-semibold">Efectivo disponible en gaveta:</span>
                    <strong className="fs-6">
                      {efectivoDisponible === null
                        ? 'Consultando...'
                        : `₡${efectivoDisponible.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`}
                    </strong>
                  </div>
                )}
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
                <BotonAccion
                  type="submit"
                  className="btn btn-primary w-100 fw-bold"
                  cargando={procesandoMovCaja}
                  textoCargando="Guardando movimiento..."
                  textoLento="El servidor está ocupado, reintentando..."
                >
                  Guardar Movimiento
                </BotonAccion>
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
