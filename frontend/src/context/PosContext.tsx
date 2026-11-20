import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken } from '../api/client';
import { Usuario, TurnoCaja, Producto, Departamento, Cliente, ItemCarrito } from '../types/models';

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
}

const PosContext = createContext<PosContextType | undefined>(undefined);

const STORAGE_CARRITO_KEY = 'panpos_carrito_respaldo';
let contadorUid = 0;
const generarUid = (prefijo: string | number) => `${prefijo}-${Date.now()}-${++contadorUid}`;

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuarioState] = useState<Usuario | null>(null);

  const [carrito, setCarrito] = useState<ItemCarrito[]>(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_CARRITO_KEY);
      return guardado ? JSON.parse(guardado) : [];
    } catch {
      return [];
    }
  });

  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [configuracion, setConfiguracion] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_CARRITO_KEY, JSON.stringify(carrito));
  }, [carrito]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', 'light');
  }, []);

  const setUsuario = (u: Usuario | null) => {
    if (!u) {
      setAuthToken(null);
    }
    setUsuarioState(u);
  };

  const recargarCatalogos = async () => {
    try {
      const [prodRes, depRes, cliRes, confRes, turnoRes] = await Promise.all([
        api.get('/productos?solo_activos=1'),
        api.get('/departamentos'),
        api.get('/clientes?solo_activos=1'),
        api.get('/configuracion'),
        api.get('/turnos/activo'),
      ]);
      setProductos(prodRes.data);
      setDepartamentos(depRes.data);
      setClientes(cliRes.data);
      setConfiguracion(confRes.data);
      setTurno(turnoRes.data.turno_activo);
    } catch (error) {
      console.error('Error cargando datos iniciales de PanPOS:', error);
    }
  };

  useEffect(() => {
    const inicializarSesion = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const meRes = await api.get('/auth/me');
          setUsuarioState(meRes.data.usuario);
          await recargarCatalogos();
          return;
        } catch {
          setAuthToken(null);
        }
      }

      try {
        const pubRes = await api.get('/sistema/publico');
        setConfiguracion(pubRes.data.configuracion || {});
        setTurno(pubRes.data.turno_activo || null);
      } catch (error) {
        console.error('Error cargando estado público de PanPOS:', error);
      }
    };

    inicializarSesion();
  }, []);

  const agregarAlCarrito = (prod: Producto, cantidad = 1): string | null => {
    if (cantidad <= 0) {
      return 'La cantidad debe ser mayor a 0.';
    }

    const stockDisponible = Math.max(0, Number(prod.stock_actual || 0));
    const existenteActual = carrito.find((i) => i.producto_id === prod.id);
    const cantActualEnCarrito = existenteActual ? existenteActual.cantidad : 0;

    if (prod.controlar_stock) {
      if (stockDisponible <= 0) {
        return `Sin existencias de "${prod.nombre}" (Stock: 0). No se puede vender.`;
      }
      if (cantActualEnCarrito + cantidad > stockDisponible) {
        return `Stock insuficiente de "${prod.nombre}". Solo hay ${stockDisponible} unidad(es) disponible(s).`;
      }
    }

    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto_id === prod.id);
      const precio = Number(prod.precio_venta);
      if (existente) {
        const nuevaCant = existente.cantidad + cantidad;
        if (prod.controlar_stock && nuevaCant > stockDisponible) {
          return prev;
        }
        return prev.map((i) =>
          i.producto_id === prod.id
            ? { ...i, cantidad: nuevaCant, subtotal: nuevaCant * precio, stock_actual: stockDisponible }
            : i
        );
      }
      return [
        ...prev,
        {
          uid: generarUid(prod.id),
          producto_id: prod.id,
          codigo_barras: prod.codigo_barras,
          descripcion_producto: prod.nombre,
          precio_unitario: precio,
          cantidad,
          subtotal: cantidad * precio,
          stock_actual: stockDisponible,
          controlar_stock: prod.controlar_stock,
        },
      ];
    });

    return null;
  };

  const agregarArticuloComun = (descripcion: string, precio: number, cantidad: number) => {
    const cantSegura = Math.max(1, cantidad);
    setCarrito((prev) => [
      ...prev,
      {
        uid: generarUid('comun'),
        producto_id: null,
        codigo_barras: 'COMUN',
        descripcion_producto: descripcion,
        precio_unitario: precio,
        cantidad: cantSegura,
        subtotal: cantSegura * precio,
        controlar_stock: false,
      },
    ]);
  };

  const cambiarCantidadCarrito = (uid: string, nuevaCantidad: number): string | null => {
    const cantEntera = Math.floor(Number(nuevaCantidad));
    if (isNaN(cantEntera) || cantEntera <= 0) {
      eliminarDelCarrito(uid);
      return null;
    }

    const item = carrito.find((i) => i.uid === uid);
    if (item && item.controlar_stock) {
      const maxStock = Math.max(0, Number(item.stock_actual ?? 0));
      if (maxStock <= 0) {
        eliminarDelCarrito(uid);
        return `Sin existencias de "${item.descripcion_producto}".`;
      }
      if (cantEntera > maxStock) {
        setCarrito((prev) =>
          prev.map((i) =>
            i.uid === uid ? { ...i, cantidad: maxStock, subtotal: maxStock * i.precio_unitario } : i
          )
        );
        return `Stock insuficiente de "${item.descripcion_producto}". Máximo disponible: ${maxStock}.`;
      }
    }

    setCarrito((prev) =>
      prev.map((i) =>
        i.uid === uid
          ? { ...i, cantidad: cantEntera, subtotal: cantEntera * i.precio_unitario }
          : i
      )
    );
    return null;
  };

  const eliminarDelCarrito = (uid: string) => {
    setCarrito((prev) => prev.filter((i) => i.uid !== uid));
  };

  const reemplazarCarrito = (items: ItemCarrito[]) => {
    setCarrito(items);
  };

  const limpiarCarrito = () => {
    setCarrito([]);
    localStorage.removeItem(STORAGE_CARRITO_KEY);
  };

  return (
    <PosContext.Provider
      value={{
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
      }}
    >
      {children}
    </PosContext.Provider>
  );
};

export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos debe usarse dentro de PosProvider');
  return context;
};
