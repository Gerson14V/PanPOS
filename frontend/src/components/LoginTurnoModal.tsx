import React, { useState } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';

export const LoginTurnoModal: React.FC = () => {
  const { usuario, setUsuario, turno, setTurno, recargarCatalogos } = usePos();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [montoInicial, setMontoInicial] = useState('10000');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  if (usuario && turno) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      setUsuario(res.data.usuario);
      await recargarCatalogos();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Credenciales incorrectas.');
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
      setError(err.response?.data?.message || 'Error al abrir el turno.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow-lg border-0">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title fw-bold">
              {!usuario ? '🥖 Iniciar Sesión - PanPOS' : '🔓 Apertura de Caja'}
            </h5>
          </div>
          <div className="modal-body p-4">
            {error && <div className="alert alert-danger py-2">{error}</div>}

            {!usuario ? (
              <form onSubmit={handleLogin}>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Usuario</label>
                  <input
                    type="text"
                    className="form-control form-control-lg"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej: admin"
                    autoFocus
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="form-label fw-semibold">Contraseña</label>
                  <input
                    type="password"
                    className="form-control form-control-lg"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-lg w-100 fw-bold" disabled={cargando}>
                  {cargando ? 'Ingresando...' : 'Entrar al Sistema'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAbrirTurno}>
                <p className="text-muted mb-3">
                  Hola <strong>{usuario.nombre}</strong>. Ingresa el fondo de efectivo inicial en gaveta para comenzar a cobrar:
                </p>
                <div className="mb-4">
                  <label className="form-label fw-semibold">Fondo Inicial en Efectivo (₡)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    className="form-control form-control-lg fw-bold text-success fs-4"
                    value={montoInicial}
                    onChange={(e) => setMontoInicial(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-lg"
                    onClick={() => setUsuario(null)}
                  >
                    Cambiar Usuario
                  </button>
                  <button type="submit" className="btn btn-success btn-lg flex-grow-1 fw-bold" disabled={cargando}>
                    {cargando ? 'Abriendo...' : 'Abrir Turno de Caja'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
