import React, { useState, useEffect } from 'react';
import { PosProvider, usePos } from './context/PosContext';
import { LoginTurnoModal } from './components/LoginTurnoModal';
import { ModuloVentas } from './components/ModuloVentas';
import { ModuloClientes } from './components/ModuloClientes';
import { ModuloProductosInventario } from './components/ModuloProductosInventario';
import { ModuloProveedores } from './components/ModuloProveedores';
import { ModuloCorteReportes } from './components/ModuloCorteReportes';
import { ModuloConfiguracion } from './components/ModuloConfiguracion';
import { api, mensajeError } from './api/client';
import { BotonAccion } from './components/BotonAccion';
import { fechaLocalISO } from './utils/fechaLocal';

const MainLayout: React.FC = () => {
  const { usuario, setUsuario, turno, setTurno, limpiarCarrito, configuracion } = usePos();
  const [moduloActivo, setModuloActivo] = useState<'ventas' | 'clientes' | 'productos_inventario' | 'proveedores' | 'corte' | 'config'>('ventas');

  // Estados para el modal del botón "Salir" (Cierre de Turno y Salida del Sistema)
  const [modalSalir, setModalSalir] = useState(false);
  const [efectivoEsperadoSalir, setEfectivoEsperadoSalir] = useState<number>(0);
  const [efectivoContadoSalir, setEfectivoContadoSalir] = useState('');
  const [observacionesSalir, setObservacionesSalir] = useState('');
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [abriendoSalir, setAbriendoSalir] = useState(false);
  const [errorSalir, setErrorSalir] = useState<string | null>(null);

  const clientesVisible = (configuracion['modulo_clientes_activo'] ?? '1') === '1';

  // Turno abierto desde un día anterior: se recomienda cerrarlo para que el corte
  // del día y los respaldos de cierre queden al día.
  const turnoDeOtroDia =
    !!turno?.fecha_apertura && fechaLocalISO(new Date(turno.fecha_apertura)) !== fechaLocalISO();
  const diasTurnoAbierto = turnoDeOtroDia
    ? Math.max(
        1,
        Math.round(
          (Date.parse(fechaLocalISO()) - Date.parse(fechaLocalISO(new Date(turno!.fecha_apertura)))) / 86400000
        )
      )
    : 0;

  useEffect(() => {
    const handleNavKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalSalir && !cerrandoCaja) {
        setModalSalir(false);
        return;
      }
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (modalSalir || activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return;
      }
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
  }, [clientesVisible, modalSalir, cerrandoCaja]);

  const abrirModalSalir = async () => {
    if (abriendoSalir) return;
    if (!turno) {
      await api.post('/auth/logout').catch(() => {});
      setUsuario(null);
      return;
    }
    setAbriendoSalir(true);
    try {
      // Consulta liviana: solo el efectivo esperado, no el corte completo
      const res = await api.get(`/turnos/${turno.id}/efectivo`);
      setEfectivoEsperadoSalir(Number(res.data.efectivo_disponible || 0));
      setEfectivoContadoSalir('');
      setObservacionesSalir('');
      setErrorSalir(null);
      setModalSalir(true);
    } catch (e) {
      alert(mensajeError(e, 'No se pudo obtener el efectivo esperado en caja.'));
    } finally {
      setAbriendoSalir(false);
    }
  };

  const confirmarSalidaYCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno || cerrandoCaja) return;
    setErrorSalir(null);
    setCerrandoCaja(true);
    try {
      const res = await api.post(
        `/turnos/${turno.id}/cerrar`,
        {
          total_efectivo_contado: Number(efectivoContadoSalir),
          observaciones: observacionesSalir || 'Cierre de turno desde botón Salir',
        },
        { timeout: 60000 }
      );

      limpiarCarrito();
      setModalSalir(false);
      await api.post('/auth/logout').catch(() => {});
      setTurno(null);
      setUsuario(null);
      setModuloActivo('ventas');

      const msgBackup = res.data.respaldo?.guardado
        ? `Respaldo BD: ${res.data.respaldo.archivo}`
        : 'Respaldo BD: No se pudo generar (revise ruta de respaldos)';
      const msgExcel = res.data.excel_diario?.guardado
        ? `Excel diario actualizado en: ${res.data.excel_diario.ruta}`
        : 'Excel diario: No se pudo actualizar (cierre el archivo si está abierto)';
      alert(`Turno cerrado correctamente.\n${msgBackup}\n${msgExcel}`);
    } catch (err) {
      setErrorSalir(mensajeError(err, 'Error al cerrar el turno.'));
    } finally {
      setCerrandoCaja(false);
    }
  };

  const diferenciaSalir =
    efectivoContadoSalir !== '' ? Number(efectivoContadoSalir) - efectivoEsperadoSalir : 0;

  return (
    <div className="min-vh-100 bg-body">
      <LoginTurnoModal />

      <nav className="navbar navbar-expand-lg bg-primary navbar-dark shadow-sm px-3 py-2 panpos-navbar">
        <div className="container-fluid px-0 flex-nowrap">
          <span
            className="navbar-brand fw-bold fs-4 me-4 panpos-brand"
            title={configuracion['nombre_negocio'] || 'PanPOS'}
          >
            <i className="bi bi-basket2-fill me-1" />
            <span className="panpos-brand-texto">{configuracion['nombre_negocio'] || 'PanPOS'}</span>
          </span>

          <div className="d-flex flex-nowrap gap-2 me-auto panpos-nav-modulos">
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
                F2 Clientes<span className="panpos-nav-extra"> / Fiados</span>
              </button>
            )}

            <button
              className={`btn fw-bold ${moduloActivo === 'productos_inventario' ? 'btn-light text-primary' : 'btn-outline-light'}`}
              onClick={() => setModuloActivo('productos_inventario')}
            >
              F3 Productos<span className="panpos-nav-extra">/Inventario</span>
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
              Corte<span className="panpos-nav-extra"> y Reportes</span>
            </button>

            {usuario?.rol === 'admin' && (
              <button
                className={`btn fw-bold ${moduloActivo === 'config' ? 'btn-light text-primary' : 'btn-outline-light'}`}
                onClick={() => setModuloActivo('config')}
                title="Configuración"
              >
                <i className="bi bi-gear-fill" />
                <span className="panpos-nav-extra ms-1">Configuración</span>
              </button>
            )}
          </div>

          <div className="d-flex align-items-center flex-shrink-0 gap-2 text-white pb-1 ms-2">
            
            {usuario && (
              <>
                <span
                  className="badge bg-light text-dark fs-6 px-3 py-2 panpos-usuario"
                  title={`${usuario.nombre} (${usuario.rol.toUpperCase()})`}
                >
                  <i className="bi bi-person-fill me-1" />
                  {usuario.nombre}
                  <span className="panpos-nav-extra"> ({usuario.rol.toUpperCase()})</span>
                </span>
                <BotonAccion
                  className="btn btn-sm btn-danger fw-bold px-3 py-1"
                  onClick={abrirModalSalir}
                  cargando={abriendoSalir}
                  textoCargando="Salir"
                >
                  Salir
                </BotonAccion>
              </>
            )}
          </div>
        </div>
      </nav>

      {usuario && turnoDeOtroDia && moduloActivo !== 'corte' && (
        <div className="panpos-franja-turno no-print">
          <i className="bi bi-clock-history fs-5" />
          <span>
            El turno #{turno!.id} está abierto desde el{' '}
            <strong>
              {new Date(turno!.fecha_apertura).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })}
            </strong>{' '}
            ({diasTurnoAbierto === 1 ? 'ayer' : `hace ${diasTurnoAbierto} días`}). Se recomienda cerrar el turno al final de cada día.
          </span>
          <button className="btn btn-sm btn-warning fw-bold ms-auto" onClick={() => setModuloActivo('corte')}>
            <i className="bi bi-scissors me-1" />Ir al corte
          </button>
        </div>
      )}

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
                  disabled={cerrandoCaja}
                  onClick={() => setModalSalir(false)}
                />
              </div>
              <div className="modal-body p-4">
                {errorSalir && <div className="alert alert-danger fw-semibold py-2">{errorSalir}</div>}
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
                    onKeyDown={(e) => {
                      if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
                    }}
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
                  disabled={cerrandoCaja}
                  onClick={() => setModalSalir(false)}
                >
                  Cancelar
                </button>
                <BotonAccion
                  type="submit"
                  className="btn btn-danger fw-bold px-4"
                  cargando={cerrandoCaja}
                  textoCargando="Cerrando y respaldando..."
                  textoLento="Generando respaldo, no cierre la ventana..."
                >
                  Confirmar Cierre y Salir
                </BotonAccion>
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
