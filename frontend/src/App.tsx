import React, { useState, useEffect } from 'react';
import { PosProvider, usePos } from './context/PosContext';
import { LoginTurnoModal } from './components/LoginTurnoModal';
import { ModuloVentas } from './components/ModuloVentas';
import { ModuloClientes } from './components/ModuloClientes';
import { ModuloProductosInventario } from './components/ModuloProductosInventario';
import { ModuloProveedores } from './components/ModuloProveedores';
import { ModuloCorteReportes } from './components/ModuloCorteReportes';
import { ModuloConfiguracion } from './components/ModuloConfiguracion';

const MainLayout: React.FC = () => {
  const { usuario, setUsuario, configuracion, tema, alternarTema } = usePos();
  const [moduloActivo, setModuloActivo] = useState<'ventas' | 'clientes' | 'productos_inventario' | 'proveedores' | 'corte' | 'config'>('ventas');

  const clientesVisible = (configuracion['modulo_clientes_activo'] ?? '1') === '1';

  useEffect(() => {
    const handleNavKeys = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setModuloActivo('ventas');
      } else if (e.key === 'F2' && clientesVisible) {
        e.preventDefault();
        setModuloActivo('clientes');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setModuloActivo('productos_inventario');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setModuloActivo('proveedores');
      }
    };
    window.addEventListener('keydown', handleNavKeys);
    return () => window.removeEventListener('keydown', handleNavKeys);
  }, [clientesVisible]);

  return (
    <div className="min-vh-100 bg-body">
      <LoginTurnoModal />

      <nav className="navbar navbar-expand-lg bg-primary navbar-dark shadow-sm px-3 py-2">
        <div className="container-fluid px-0">
          <span className="navbar-brand fw-bold fs-4 me-4">
            🥖 {configuracion['nombre_negocio'] || 'PanPOS'}
          </span>

          <div className="d-flex flex-wrap gap-2 me-auto">
            <button
              className={`btn fw-bold ${moduloActivo === 'ventas' ? 'btn-light text-primary' : 'btn-outline-light'}`}
              onClick={() => setModuloActivo('ventas')}
            >
              F1 Ventas
            </button>

            {clientesVisible && (
              <button
                className={`btn fw-bold ${moduloActivo === 'clientes' ? 'btn-light text-primary' : 'btn-outline-light'}`}
                onClick={() => setModuloActivo('clientes')}
              >
                F2 Clientes / Fiados
              </button>
            )}

            <button
              className={`btn fw-bold ${moduloActivo === 'productos_inventario' ? 'btn-light text-primary' : 'btn-outline-light'}`}
              onClick={() => setModuloActivo('productos_inventario')}
            >
              F3 Productos/Inventario
            </button>

            <button
              className={`btn fw-bold ${moduloActivo === 'proveedores' ? 'btn-light text-primary' : 'btn-outline-light'}`}
              onClick={() => setModuloActivo('proveedores')}
            >
              F4 Proveedores
            </button>

            <button
              className={`btn fw-bold ${moduloActivo === 'corte' ? 'btn-warning text-dark' : 'btn-outline-warning'}`}
              onClick={() => setModuloActivo('corte')}
            >
              Corte y Reportes
            </button>

            {usuario?.rol === 'admin' && (
              <button
                className={`btn fw-bold ${moduloActivo === 'config' ? 'btn-light text-primary' : 'btn-outline-light'}`}
                onClick={() => setModuloActivo('config')}
              >
                ⚙️ Configuración
              </button>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 text-white">
            <button className="btn btn-sm btn-outline-light" onClick={alternarTema}>
              {tema === 'light' ? '🌙 Oscuro' : '☀️ Claro'}
            </button>
            {usuario && (
              <>
                <span className="badge bg-light text-dark fs-6">
                  👤 {usuario.nombre} ({usuario.rol.toUpperCase()})
                </span>
                <button
                  className="btn btn-sm btn-danger fw-semibold"
                  onClick={() => setUsuario(null)}
                >
                  Cambiar Cajero
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        {moduloActivo === 'ventas' && <ModuloVentas />}
        {moduloActivo === 'clientes' && <ModuloClientes />}
        {moduloActivo === 'productos_inventario' && <ModuloProductosInventario />}
        {moduloActivo === 'proveedores' && <ModuloProveedores />}
        {moduloActivo === 'corte' && <ModuloCorteReportes />}
        {moduloActivo === 'config' && <ModuloConfiguracion />}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <PosProvider>
      <MainLayout />
    </PosProvider>
  );
}
