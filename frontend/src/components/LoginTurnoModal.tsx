import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';

export const LoginTurnoModal: React.FC = () => {
  const { usuario, setUsuario, turno, setTurno, configuracion, carrito, recargarCatalogos } = usePos();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [montoInicial, setMontoInicial] = useState('10000');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (configuracion['fondo_inicial_sugerido']) {
      setMontoInicial(configuracion['fondo_inicial_sugerido']);
    }
  }, [configuracion]);

  // Si ya ingresó credenciales y ya hay turno activo (nuevo o recuperado tras apagón), entra directo al POS
  if (usuario && turno) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      await recargarCatalogos();
      setUsuario(res.data.usuario);
      setPassword('');
    } catch (err: any) {
      setError(
        err.response?.data?.errors?.credenciales?.[0] ||
          err.response?.data?.message ||
          'Credenciales de acceso incorrectas.'
      );
    } finally {
      setCargando(false);
    }
  };

  const handleAbrirTurno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario) return;
    setError('');
    setCargando(true);
    try {
      const res = await api.post('/turnos/abrir', {
        usuario_id: usuario.id,
        monto_inicial: Number(montoInicial),
      });
      setTurno(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al abrir el turno de caja.');
    } finally {
      setCargando(false);
    }
  };

  const nombreNegocio = configuracion['nombre_negocio'] || 'PanPOS';

  return (
    <div
      className="modal d-block"
      style={{
        backgroundColor: 'rgba(24, 18, 14, 0.88)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg overflow-hidden" style={{ borderRadius: '14px' }}>
          <div className="row g-0">
            {/* Panel Izquierdo Sobrio Institucional */}
            <div
              className="col-md-5 d-flex flex-column justify-content-between p-4 text-white"
              style={{ backgroundColor: '#362419' }}
            >
              <div>
                <div className="small text-uppercase fw-bold opacity-75 mb-1" style={{ letterSpacing: '1px' }}>
                  Sistema de Punto de Venta
                </div>
                <h3 className="fw-bold mb-3">{nombreNegocio}</h3>
                <p className="small opacity-75 lh-base">
                  Control transaccional de caja, inventario y proveedores con protección local ante cortes de energía.
                </p>
              </div>

              {/* Indicador en tiempo real del estado del turno en la base de datos */}
              <div className="p-3 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <div className="small fw-bold text-uppercase opacity-75 mb-1">Estado del Sistema</div>
                {turno ? (
                  <div>
                    <span className="badge bg-warning text-dark mb-1">TURNO EN CURSO DETECTADO</span>
                    <div className="small opacity-90">
                      Turno #{turno.id} abierto a las {new Date(turno.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                      Al iniciar sesión continuará exactamente donde quedó.
                    </div>
                    {carrito.length > 0 && (
                      <div className="small text-warning fw-semibold mt-1">
                        • {carrito.reduce((a, b) => a + b.cantidad, 0)} artículo(s) en espera de cobro restaurados.
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <span className="badge bg-secondary mb-1">CAJA CERRADA</span>
                    <div className="small opacity-90">
                      Inicie sesión con sus credenciales para aperturar un nuevo turno de trabajo.
                    </div>
                  </div>
                )}
              </div>

              <div className="small opacity-50 mt-3">
                SQLite WAL Activo • Operación 100% Local
              </div>
            </div>

            {/* Panel Derecho: Formulario Sobrio de Credenciales o Fondo Inicial */}
            <div className="col-md-7 p-4 p-md-5 bg-body">
              {error && (
                <div className="alert alert-danger py-2 small fw-semibold mb-3">
                  {error}
                </div>
              )}

              {!usuario ? (
                <form onSubmit={handleLogin}>
                  <h4 className="fw-bold mb-1">Iniciar Sesión</h4>
                  <p className="text-muted small mb-4">
                    Ingrese sus credenciales de operador para desbloquear la terminal.
                  </p>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-uppercase text-muted">
                      Nombre de Usuario
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Usuario"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <label className="form-label small fw-bold text-uppercase text-muted">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      className="form-control form-control-lg"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg w-100 fw-bold py-2"
                    disabled={cargando}
                  >
                    {cargando
                      ? 'Verificando...'
                      : turno
                      ? 'Ingresar y Continuar Turno en Curso'
                      : 'Ingresar al Sistema'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAbrirTurno}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h4 className="fw-bold mb-0">Apertura de Nuevo Turno</h4>
                    <span className="badge bg-secondary">{usuario.nombre}</span>
                  </div>
                  <p className="text-muted small mb-4">
                    No hay un turno abierto actualmente. Digite el efectivo inicial en gaveta para iniciar las operaciones del día.
                  </p>

                  <div className="mb-4">
                    <label className="form-label small fw-bold text-uppercase text-muted">
                      Fondo Inicial en Caja (₡)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="form-control form-control-lg fw-bold fs-4"
                      value={montoInicial}
                      onChange={(e) => setMontoInicial(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-3"
                      onClick={() => setUsuario(null)}
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      className="btn btn-success btn-lg flex-grow-1 fw-bold"
                      disabled={cargando}
                    >
                      {cargando ? 'Abriendo Caja...' : 'Confirmar y Abrir Turno'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
