import React, { useState, useEffect } from 'react';
import { PosProvider, usePos } from './context/PosContext';
import { LoginTurnoModal } from './components/LoginTurnoModal';
import { ModuloVentas } from './components/ModuloVentas';
import { ModuloClientes } from './components/ModuloClientes';
import { ModuloProductosInventario } from './components/ModuloProductosInventario';
import { ModuloProveedores } from './components/ModuloProveedores';
import { ModuloCorteReportes } from './components/ModuloCorteReportes';
import { ModuloConfiguracion } from './components/ModuloConfiguracion';
import { api } from './api/client';

const MainLayout: React.FC = () => {
  const { usuario, setUsuario, turno, setTurno, limpiarCarrito, configuracion, tema, alternarTema } = usePos();
  const [moduloActivo, setModuloActivo] = useState<'ventas' | 'clientes' | 'productos_inventario' | 'proveedores' | 'corte' | 'config'>('ventas');

  // Estados para el modal del botón "Salir" (Cierre de Turno y Salida del Sistema)
  const [modalSalir, setModalSalir] = useState(false);
  const [efectivoEsperadoSalir, setEfectivoEsperadoSalir] = useState<number>(0);
  const [efectivoContadoSalir, setEfectivoContadoSalir] = useState('');
  const [observacionesSalir, setObservacionesSalir] = useState('');
  const [cerrandoCaja, setCerrandoCaja] = useState(false);

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

  const abrirModalSalir = async () => {
    if (!turno) {
      setUsuario(null);
      return;
    }
    try {
      const res = await api.get(`/turnos/${turno.id}/resumen`);
      setEfectivoEsperadoSalir(Number(res.data.gaveta_efectivo?.efectivo_esperado || 0));
      setEfectivoContadoSalir('');
      setObservacionesSalir('');
      setModalSalir(true);
    } catch (e) {
      console.error(e);
    }
  };

  const confirmarSalidaYCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno) return;
    setCerrandoCaja(true);
    try {
      const res = await api.post(`/turnos/${turno.id}/cerrar`, {
        total_efectivo_contado: Number(efectivoContadoSalir),
        observaciones: observacionesSalir || 'Cierre de turno desde botón Salir',
      });

      limpiarCarrito();
      setModalSalir(false);
      setTurno(null);
      setUsuario(null);
      setModuloActivo('ventas');
      alert(`Turno cerrado correctamente.\nRespaldo guardado: ${res.data.respaldo.archivo}`);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al cerrar el turno.');
    } finally {
      setCerrandoCaja(false);
    }
  };

  const diferenciaSalir =
    efectivoContadoSalir !== '' ? Number(efectivoContadoSalir) - efectivoEsperadoSalir : 0;

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
              className={`btn fw-bold ${moduloActivo === 'corte' ? 'btn-light text-primary' : 'btn-outline-light'}`}
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

          <div className="d-flex align-items-center gap-2 text-white pb-1">
            <button className="btn btn-sm btn-outline-light" onClick={alternarTema}>
              {tema === 'light' ? '🌙 Oscuro' : '☀️ Claro'}
            </button>
            {usuario && (
              <>
                <span className="badge bg-light text-dark fs-6 px-3 py-2">
                  👤 {usuario.nombre} ({usuario.rol.toUpperCase()})
                </span>
                <button
                  className="btn btn-sm btn-danger fw-bold px-3 py-1"
                  onClick={abrirModalSalir}
                >
                  Salir
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

      {/* Modal del botón "Salir" (Pregunta cuánto dinero hay en caja y cierra el turno) */}
      {modalSalir && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(24, 18, 14, 0.78)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content border-0 shadow-lg" onSubmit={confirmarSalidaYCierre}>
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">Cerrar Turno y Salir del Sistema</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setModalSalir(false)}
                />
              </div>
              <div className="modal-body p-4">
                <div className="d-flex justify-content-between align-items-center p-3 mb-3 rounded bg-body-secondary">
                  <span className="fw-semibold">Efectivo esperado en caja:</span>
                  <strong className="fs-4 text-primary">
                    ₡{efectivoEsperadoSalir.toLocaleString()}
                  </strong>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">
                    ¿Cuánto dinero en efectivo hay actualmente en caja? (₡)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="form-control form-control-lg fw-bold fs-4"
                    placeholder="Digite el monto contado en gaveta"
                    value={efectivoContadoSalir}
                    onChange={(e) => setEfectivoContadoSalir(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                {efectivoContadoSalir !== '' && (
                  <div
                    className={`alert py-2 fw-bold ${
                      diferenciaSalir === 0
                        ? 'alert-warning'
                        : diferenciaSalir > 0
                        ? 'alert-success'
                        : 'alert-danger'
                    }`}
                  >
                    {diferenciaSalir === 0
                      ? 'Caja Exacta (₡0 diferencia)'
                      : diferenciaSalir > 0
                      ? `Sobrante en caja: +₡${diferenciaSalir.toLocaleString()}`
                      : `Faltante en caja: ₡${diferenciaSalir.toLocaleString()}`}
                  </div>
                )}

                <div className="mb-2">
                  <label className="form-label small fw-semibold text-muted">
                    Observaciones o notas del turno (Opcional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: Turno de la mañana sin novedades"
                    value={observacionesSalir}
                    onChange={(e) => setObservacionesSalir(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setModalSalir(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-danger fw-bold px-4"
                  disabled={cerrandoCaja}
                >
                  {cerrandoCaja ? 'Cerrando y Respaldando...' : 'Confirmar Cierre y Salir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
