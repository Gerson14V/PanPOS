import React, { useState, useEffect } from 'react';
import { PosProvider, usePos } from './context/PosContext';
import { LoginTurnoModal } from './components/LoginTurnoModal';
import { ModuloVentas } from './components/ModuloVentas';
import { ModuloClientes } from './components/ModuloClientes';
import { ModuloProductosInventario } from './components/ModuloProductosInventario';
import { ModuloCorteReportes } from './components/ModuloCorteReportes';
import { ModuloConfiguracion } from './components/ModuloConfiguracion';

const MainLayout: React.FC = () => {
  const { usuario, setUsuario, configuracion, tema, alternarTema } = usePos();
  const [moduloActivo, setModuloActivo] = useState<'ventas' | 'clientes' | 'productos' | 'inventario' | 'corte' | 'config'>('ventas');

  const clientesVisible = (configuracion['modulo_clientes_activo'] ?? '1') === '1';
  const inventarioVisible = (configuracion['modulo_inventario_activo'] ?? '1') === '1';

  // Atajos globales de navegación F1, F2, F3, F4
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
        setModuloActivo('productos');
      } else if (e.key === 'F4' && inventarioVisible) {
        e.preventDefault();
        setModuloActivo('inventario');
      }
    };
    window.addEventListener('keydown', handleNavKeys);
    return () => window.removeEventListener('keydown', handleNavKeys);
  }, [clientesVisible, inventarioVisible]);

  return (
    <div className="min-vh-100 bg-body">
      <LoginTurnoModal />

      {/* Barra superior institucional inspirada en eleventa */}
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
              className={`btn fw-bold ${moduloActivo === 'productos' ? 'btn-light text-primary' : 'btn-outline-light'}`}
              onClick={() => setModuloActivo('productos')}
            >
              F3 Productos
            </button>

            {inventarioVisible && (
              <button
                className={`btn fw-bold ${moduloActivo === 'inventario' ? 'btn-light text-primary' : 'btn-outline-light'}`}
                onClick={() => setModuloActivo('inventario')}
              >
                F4 Inventario
              </button>
            )}

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
            <button className="btn btn-sm btn-outline-light" onClick={alternarTema} title="Cambiar Modo Claro / Oscuro">
              {tema === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
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

      {/* Renderizado del módulo activo */}
      <main>
        {moduloActivo === 'ventas' && <ModuloVentas />}
        {moduloActivo === 'clientes' && <ModuloClientes />}
        {moduloActivo === 'productos' && <ModuloProductosInventario vistaInicial="productos" />}
        {moduloActivo === 'inventario' && <ModuloProductosInventario vistaInicial="inventario" />}
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
