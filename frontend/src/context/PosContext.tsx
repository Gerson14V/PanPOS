import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';
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
  agregarAlCarrito: (prod: Producto, cantidad?: number) => void;
  agregarArticuloComun: (descripcion: string, precio: number, cantidad: number) => void;
  cambiarCantidadCarrito: (uid: string, nuevaCantidad: number) => void;
  eliminarDelCarrito: (uid: string) => void;
  limpiarCarrito: () => void;
  recargarCatalogos: () => Promise<void>;
  tema: 'light' | 'dark';
  alternarTema: () => void;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

const STORAGE_CARRITO_KEY = 'panpos_carrito_respaldo';
const STORAGE_USUARIO_KEY = 'panpos_usuario_activo';

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuarioState] = useState<Usuario | null>(() => {
    const guardado = localStorage.getItem(STORAGE_USUARIO_KEY);
    return guardado ? JSON.parse(guardado) : null;
  });

  const [carrito, setCarrito] = useState<ItemCarrito[]>(() => {
    const guardado = localStorage.getItem(STORAGE_CARRITO_KEY);
    return guardado ? JSON.parse(guardado) : [];
  });

  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [configuracion, setConfiguracion] = useState<Record<string, string>>({});
  const [tema, setTema] = useState<'light' | 'dark'>(usuario?.tema_preferido || 'light');

  useEffect(() => {
    localStorage.setItem(STORAGE_CARRITO_KEY, JSON.stringify(carrito));
  }, [carrito]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', tema);
  }, [tema]);

  const setUsuario = (u: Usuario | null) => {
    setUsuarioState(u);
    if (u) {
      localStorage.setItem(STORAGE_USUARIO_KEY, JSON.stringify(u));
      setTema(u.tema_preferido || 'light');
    } else {
      localStorage.removeItem(STORAGE_USUARIO_KEY);
    }
  };

  const alternarTema = async () => {
    const nuevoTema = tema === 'light' ? 'dark' : 'light';
    setTema(nuevoTema);
    if (usuario) {
      try {
        const res = await api.put(`/usuarios/${usuario.id}`, { tema_preferido: nuevoTema });
        setUsuario(res.data);
      } catch (e) {
        console.error(e);
      }
    }
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

      if (turnoRes.data.turno_activo && !usuario) {
        setUsuario(turnoRes.data.turno_activo.usuario);
      }
    } catch (error) {
      console.error('Error cargando datos iniciales de PanPOS:', error);
    }
  };

  useEffect(() => {
    recargarCatalogos();
  }, []);

  const agregarAlCarrito = (prod: Producto, cantidad = 1) => {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto_id === prod.id);
      const precio = Number(prod.precio_venta);
      if (existente) {
        const nuevaCant = existente.cantidad + cantidad;
        return prev.map((i) =>
          i.producto_id === prod.id
            ? { ...i, cantidad: nuevaCant, subtotal: nuevaCant * precio }
            : i
        );
      }
      return [
        ...prev,
        {
          uid: `${prod.id}-${Date.now()}`,
          producto_id: prod.id,
          codigo_barras: prod.codigo_barras,
          descripcion_producto: prod.nombre,
          precio_unitario: precio,
          cantidad,
          subtotal: cantidad * precio,
          stock_actual: prod.stock_actual,
          controlar_stock: prod.controlar_stock,
        },
      ];
    });
  };

  const agregarArticuloComun = (descripcion: string, precio: number, cantidad: number) => {
    setCarrito((prev) => [
      ...prev,
      {
        uid: `comun-${Date.now()}`,
        producto_id: null,
        codigo_barras: 'COMUN',
        descripcion_producto: descripcion,
        precio_unitario: precio,
        cantidad,
        subtotal: cantidad * precio,
        controlar_stock: false,
      },
    ]);
  };

  const cambiarCantidadCarrito = (uid: string, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) {
      eliminarDelCarrito(uid);
      return;
    }
    setCarrito((prev) =>
      prev.map((i) =>
        i.uid === uid
          ? { ...i, cantidad: nuevaCantidad, subtotal: nuevaCantidad * i.precio_unitario }
          : i
      )
    );
  };

  const eliminarDelCarrito = (uid: string) => {
    setCarrito((prev) => prev.filter((i) => i.uid !== uid));
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
        limpiarCarrito,
        recargarCatalogos,
        tema,
        alternarTema,
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
