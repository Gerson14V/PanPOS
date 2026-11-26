import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, EVENTO_SESION_EXPIRADA, EVENTO_TURNO_DESACTUALIZADO, getAuthToken, setAuthToken } from '../api/client';
import { Usuario, TurnoCaja, Producto, Departamento, Cliente, ItemCarrito, StockActualizado, ClienteActualizado } from '../types/models';

interface PosContextType {
  usuario: Usuario | null;
  setUsuario: (u: Usuario | null) => void;
  turno: TurnoCaja | null;
  setTurno: (t: TurnoCaja | null) => void;
  productos: Producto[];
  departamentos: Departamento[];
  clientes: Cliente[];
  configuracion: Record<string, string>;
  carrito: ItemCarrito[];
  agregarAlCarrito: (prod: Producto, cantidad?: number) => string | null;
  agregarArticuloComun: (descripcion: string, precio: number, cantidad: number) => void;
  cambiarCantidadCarrito: (uid: string, nuevaCantidad: number) => string | null;
  eliminarDelCarrito: (uid: string) => void;
  reemplazarCarrito: (items: ItemCarrito[]) => void;
  limpiarCarrito: () => void;
  recargarCatalogos: () => Promise<void>;
  aplicarStockActualizado: (lista?: StockActualizado[]) => void;
  actualizarSaldoCliente: (cliente?: ClienteActualizado | null) => void;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

const STORAGE_CARRITO_KEY = 'panpos_carrito_respaldo';
let contadorUid = 0;
const generarUid = (prefijo: string | number) => `${prefijo}-${Date.now()}-${++contadorUid}`;
const redondear2 = (n: number) => Math.round(n * 100) / 100;

interface RespaldoCarrito {
  turnoId: number | null;
  items: ItemCarrito[];
}

const leerRespaldoCarrito = (): RespaldoCarrito => {
  try {
    const guardado = localStorage.getItem(STORAGE_CARRITO_KEY);
    if (!guardado) return { turnoId: null, items: [] };
    const parsed = JSON.parse(guardado);
    if (Array.isArray(parsed)) return { turnoId: null, items: parsed };
    return {
      turnoId: typeof parsed?.turno_id === 'number' ? parsed.turno_id : null,
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    };
  } catch {
    return { turnoId: null, items: [] };
  }
};

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const respaldoInicial = useMemo(() => leerRespaldoCarrito(), []);
  const [usuario, setUsuarioState] = useState<Usuario | null>(null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>(respaldoInicial.items);
  const carritoRef = useRef<ItemCarrito[]>(carrito);
  carritoRef.current = carrito;

  // Guarda el turno_id con el que se guardó el carrito antes de sobrescribir localStorage
  const turnoRespaldoRef = useRef<number | null>(respaldoInicial.turnoId);

  const [turno, setTurnoState] = useState<TurnoCaja | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [configuracion, setConfiguracion] = useState<Record<string, string>>({});

  // Al cambiar de turno, validar ANTES de guardar si el carrito pertenece a un turno anterior
  const setTurno = useCallback((nuevoTurno: TurnoCaja | null) => {
    setTurnoState(nuevoTurno);
    if (nuevoTurno?.id) {
      if (turnoRespaldoRef.current !== null && turnoRespaldoRef.current !== nuevoTurno.id) {
        setCarrito([]);
        carritoRef.current = [];
        try {
          localStorage.removeItem(STORAGE_CARRITO_KEY);
        } catch {
          // Ignorar errores de cuota de almacenamiento
        }
      }
      turnoRespaldoRef.current = nuevoTurno.id;
    }
  }, []);

  useEffect(() => {
    try {
      const turnoIdGuardar = turno?.id ?? turnoRespaldoRef.current;
      localStorage.setItem(
        STORAGE_CARRITO_KEY,
        JSON.stringify({ turno_id: turnoIdGuardar, items: carrito })
      );
    } catch {
      // Ignorar errores si el disco está lleno o almacenamiento bloqueado
    }
  }, [carrito, turno?.id]);

  // Sincroniza precios/stock del carrito cuando se actualiza el catálogo de productos
  const sincronizarCarritoConProductos = useCallback((listaProductos: Producto[]) => {
    if (listaProductos.length === 0) return;
    const mapaProductos = new Map(listaProductos.map((p) => [p.id, p]));
    setCarrito((prev) => {
      if (prev.length === 0) return prev;
      let cambio = false;
      const actualizado: ItemCarrito[] = [];

      for (const item of prev) {
        if (!item.producto_id) {
          actualizado.push(item);
          continue;
        }
        const prod = mapaProductos.get(item.producto_id);
        if (!prod) {
          cambio = true;
          continue;
        }
        const precioActual = Number(prod.precio_venta);
        const stockActual = Math.max(0, Number(prod.stock_actual || 0));
        let cant = item.cantidad;

        if (prod.controlar_stock) {
          if (stockActual <= 0) {
            cambio = true;
            continue;
          }
          if (cant > stockActual) {
            cant = stockActual;
            cambio = true;
          }
        }

        const subtotalActual = redondear2(cant * precioActual);
        if (
          precioActual !== item.precio_unitario ||
          prod.nombre !== item.descripcion_producto ||
          stockActual !== item.stock_actual ||
          prod.controlar_stock !== item.controlar_stock ||
          subtotalActual !== item.subtotal
        ) {
          cambio = true;
        }

        actualizado.push({
          ...item,
          descripcion_producto: prod.nombre,
          precio_unitario: precioActual,
          cantidad: cant,
          subtotal: subtotalActual,
          stock_actual: stockActual,
          controlar_stock: prod.controlar_stock,
        });
      }

      if (cambio) {
        carritoRef.current = actualizado;
        return actualizado;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', 'light');
  }, []);

  // Si el servidor rechaza el token, volver a la pantalla de ingreso (el carrito se conserva)
  useEffect(() => {
    const alExpirar = () => setUsuarioState(null);
    // Turno cerrado/abierto en otra ventana: se toma el estado real del servidor
    const alCambiarTurno = () => {
      api
        .get('/turnos/activo')
        .then((res) => setTurno(res.data.turno_activo))
        .catch(() => {});
    };
    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
    window.addEventListener(EVENTO_TURNO_DESACTUALIZADO, alCambiarTurno);
    return () => {
      window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
      window.removeEventListener(EVENTO_TURNO_DESACTUALIZADO, alCambiarTurno);
    };
  }, [setTurno]);

  // Respaldo diario en segundo plano: espera 3s tras ingresar para no competir
  // con las primeras peticiones en el servidor PHP de un solo hilo.
  useEffect(() => {
    if (!usuario?.id) return;
    const t = window.setTimeout(() => {
      api.post('/sistema/respaldo-diario', {}, { timeout: 120000 }).catch(() => {});
    }, 3000);
    return () => window.clearTimeout(t);
  }, [usuario?.id]);

  const setUsuario = useCallback((u: Usuario | null) => {
    if (!u) {
      setAuthToken(null);
    }
    setUsuarioState(u);
  }, []);

  const recargarCatalogos = useCallback(async () => {
    try {
      const [prodRes, depRes, cliRes, confRes, turnoRes] = await Promise.all([
        api.get('/productos?solo_activos=1'),
        api.get('/departamentos'),
        api.get('/clientes?solo_activos=1'),
        api.get('/configuracion'),
        api.get('/turnos/activo'),
      ]);
      const listaProductos: Producto[] = prodRes.data;
      setProductos(listaProductos);
      sincronizarCarritoConProductos(listaProductos);
      setDepartamentos(depRes.data);
      setClientes(cliRes.data);
      setConfiguracion(confRes.data);
      setTurno(turnoRes.data.turno_activo);
    } catch (error) {
      console.error('Error cargando datos iniciales de PanPOS:', error);
    }
  }, [setTurno, sincronizarCarritoConProductos]);

  // Actualiza existencias en memoria con lo que devolvió el servidor tras una venta/anulación,
  // sin volver a descargar todo el catálogo (cobro instantáneo).
  const aplicarStockActualizado = useCallback((lista?: StockActualizado[]) => {
    if (!lista || lista.length === 0) return;
    const porId = new Map(lista.map((p) => [p.id, Number(p.stock_actual)]));
    setProductos((prev) => {
      const siguiente = prev.map((p) => (porId.has(p.id) ? { ...p, stock_actual: porId.get(p.id)! } : p));
      sincronizarCarritoConProductos(siguiente);
      return siguiente;
    });
  }, [sincronizarCarritoConProductos]);

  const actualizarSaldoCliente = useCallback((cliente?: ClienteActualizado | null) => {
    if (!cliente) return;
    setClientes((prev) =>
      prev.map((c) => (c.id === cliente.id ? { ...c, saldo_deudor: Number(cliente.saldo_deudor) } : c))
    );
  }, []);

  useEffect(() => {
    let cancelado = false;
    const inicializarSesion = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const meRes = await api.get('/auth/me');
          if (cancelado) return;
          setUsuarioState(meRes.data.usuario);
          await recargarCatalogos();
          return;
        } catch {
          setAuthToken(null);
        }
      }

      try {
        const pubRes = await api.get('/sistema/publico');
        if (cancelado) return;
        setConfiguracion(pubRes.data.configuracion || {});
        setTurno(pubRes.data.turno_activo || null);
      } catch (error) {
        console.error('Error cargando estado público de PanPOS:', error);
      }
    };

    void inicializarSesion();
    return () => {
      cancelado = true;
    };
  }, [recargarCatalogos, setTurno]);

  const agregarAlCarrito = useCallback((prod: Producto, cantidad = 1): string | null => {
    if (cantidad <= 0) {
      return 'La cantidad debe ser mayor a 0.';
    }

    const stockDisponible = Math.max(0, Number(prod.stock_actual || 0));
    const prev = carritoRef.current;
    const existenteActual = prev.find((i) => i.producto_id === prod.id);
    const cantActualEnCarrito = existenteActual ? existenteActual.cantidad : 0;

    if (prod.controlar_stock) {
      if (stockDisponible <= 0) {
        return `Sin existencias de "${prod.nombre}" (Stock: 0). No se puede vender.`;
      }
      if (cantActualEnCarrito + cantidad > stockDisponible) {
        return `Stock insuficiente de "${prod.nombre}". Solo hay ${stockDisponible} unidad(es) disponible(s).`;
      }
    }

    const precio = Number(prod.precio_venta);
    let siguiente: ItemCarrito[];
    if (existenteActual) {
      const nuevaCant = existenteActual.cantidad + cantidad;
      siguiente = prev.map((i) =>
        i.producto_id === prod.id
          ? { ...i, cantidad: nuevaCant, subtotal: redondear2(nuevaCant * precio), stock_actual: stockDisponible }
          : i
      );
    } else {
      siguiente = [
        ...prev,
        {
          uid: generarUid(prod.id),
          producto_id: prod.id,
          codigo_barras: prod.codigo_barras,
          descripcion_producto: prod.nombre,
          precio_unitario: precio,
          cantidad,
          subtotal: redondear2(cantidad * precio),
          stock_actual: stockDisponible,
          controlar_stock: prod.controlar_stock,
        },
      ];
    }

    carritoRef.current = siguiente;
    setCarrito(siguiente);
    return null;
  }, []);

  const agregarArticuloComun = useCallback((descripcion: string, precio: number, cantidad: number) => {
    const cantSegura = Math.max(1, Math.floor(Number(cantidad) || 1));
    const precioSeguro = Math.max(0, Number(precio) || 0);
    const nuevoItem: ItemCarrito = {
      uid: generarUid('comun'),
      producto_id: null,
      codigo_barras: 'COMUN',
      descripcion_producto: descripcion.trim() || 'Artículo Común',
      precio_unitario: precioSeguro,
      cantidad: cantSegura,
      subtotal: redondear2(cantSegura * precioSeguro),
      controlar_stock: false,
    };
    const siguiente = [...carritoRef.current, nuevoItem];
    carritoRef.current = siguiente;
    setCarrito(siguiente);
  }, []);

  const eliminarDelCarrito = useCallback((uid: string) => {
    const siguiente = carritoRef.current.filter((i) => i.uid !== uid);
    carritoRef.current = siguiente;
    setCarrito(siguiente);
  }, []);

  const cambiarCantidadCarrito = useCallback((uid: string, nuevaCantidad: number): string | null => {
    const cantEntera = Math.floor(Number(nuevaCantidad));
    if (isNaN(cantEntera) || cantEntera <= 0) {
      eliminarDelCarrito(uid);
      return null;
    }

    const prev = carritoRef.current;
    const item = prev.find((i) => i.uid === uid);
    if (!item) return null;

    if (item.controlar_stock) {
      const maxStock = Math.max(0, Number(item.stock_actual ?? 0));
      if (maxStock <= 0) {
        eliminarDelCarrito(uid);
        return `Sin existencias de "${item.descripcion_producto}".`;
      }
      if (cantEntera > maxStock) {
        const siguiente = prev.map((i) =>
          i.uid === uid ? { ...i, cantidad: maxStock, subtotal: redondear2(maxStock * i.precio_unitario) } : i
        );
        carritoRef.current = siguiente;
        setCarrito(siguiente);
        return `Stock insuficiente de "${item.descripcion_producto}". Máximo disponible: ${maxStock}.`;
      }
    }

    const siguiente = prev.map((i) =>
      i.uid === uid ? { ...i, cantidad: cantEntera, subtotal: redondear2(cantEntera * i.precio_unitario) } : i
    );
    carritoRef.current = siguiente;
    setCarrito(siguiente);
    return null;
  }, [eliminarDelCarrito]);

  const reemplazarCarrito = useCallback((items: ItemCarrito[]) => {
    carritoRef.current = items;
    setCarrito(items);
  }, []);

  const limpiarCarrito = useCallback(() => {
    carritoRef.current = [];
    setCarrito([]);
    try {
      localStorage.removeItem(STORAGE_CARRITO_KEY);
    } catch {
      // Ignorar
    }
  }, []);

  const valorContexto = useMemo<PosContextType>(
    () => ({
      usuario,
      setUsuario,
      turno,
      setTurno,
      productos,
      departamentos,
      clientes,
      configuracion,
      carrito,
      agregarAlCarrito,
      agregarArticuloComun,
      cambiarCantidadCarrito,
      eliminarDelCarrito,
      reemplazarCarrito,
      limpiarCarrito,
      recargarCatalogos,
      aplicarStockActualizado,
      actualizarSaldoCliente,
    }),
    [
      usuario,
      setUsuario,
      turno,
      setTurno,
      productos,
      departamentos,
      clientes,
      configuracion,
      carrito,
      agregarAlCarrito,
      agregarArticuloComun,
      cambiarCantidadCarrito,
      eliminarDelCarrito,
      reemplazarCarrito,
      limpiarCarrito,
      recargarCatalogos,
      aplicarStockActualizado,
      actualizarSaldoCliente,
    ]
  );

  return <PosContext.Provider value={valorContexto}>{children}</PosContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos debe usarse dentro de PosProvider');
  return context;
};
