import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { Usuario } from '../types/models';

export const ModuloConfiguracion: React.FC = () => {
  const { configuracion, recargarCatalogos } = usePos();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'danger'; texto: string } | null>(null);

  // Nuevo Usuario
  const [nombre, setNombre] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<'admin' | 'cajero'>('cajero');

  const cargarUsuarios = async () => {
    const res = await api.get('/usuarios');
    setUsuarios(res.data);
  };

  useEffect(() => {
    setFormConfig(configuracion);
    cargarUsuarios();
  }, [configuracion]);

  const guardarConfiguracion = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.put('/configuracion', { configuraciones: formConfig });
    await recargarCatalogos();
    setMensaje({ tipo: 'success', texto: 'Configuración del sistema actualizada.' });
  };

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/usuarios', { nombre, username, password, rol });
      setNombre('');
      setUsername('');
      setPassword('');
      await cargarUsuarios();
      setMensaje({ tipo: 'success', texto: 'Usuario creado correctamente.' });
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'Error al crear usuario.' });
    }
  };

  const alternarRolRapido = async (u: Usuario) => {
    const nuevoRol = u.rol === 'admin' ? 'cajero' : 'admin';
    try {
      await api.put(`/usuarios/${u.id}`, { rol: nuevoRol });
      await cargarUsuarios();
      setMensaje({ tipo: 'success', texto: `Rol de ${u.nombre} cambiado a ${nuevoRol.toUpperCase()}.` });
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'No se puede degradar al único Administrador.' });
    }
  };

  const dispararBackupManual = async () => {
    const res = await api.post('/sistema/backup');
    setMensaje({
      tipo: 'success',
      texto: `Respaldo creado en: ${res.data.ruta_local} ${res.data.copiado_usb ? '(+ Copiado a USB)' : ''}`,
    });
  };

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="row g-3">
        {/* Panel 1: Personalización de Módulos Ocultables, Respaldos e Impresora */}
        <div className="col-lg-6">
          <form className="card shadow-sm border-0" onSubmit={guardarConfiguracion}>
            <div className="card-header bg-primary text-white fw-bold d-flex justify-content-between align-items-center">
              <span>⚙️ Configuración General, Módulos y Respaldos</span>
              <button type="button" className="btn btn-sm btn-warning fw-bold" onClick={dispararBackupManual}>
                💾 Crear Respaldo SQLite Ahora
              </button>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label fw-semibold">Nombre de la Panadería</label>
                <input
                  className="form-control"
                  value={formConfig['nombre_negocio'] || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, nombre_negocio: e.target.value })}
                />
              </div>

              <h6 className="fw-bold text-primary border-bottom pb-1 mt-3">Módulos Visibles en Pantalla</h6>
              <div className="form-check form-switch mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={(formConfig['modulo_clientes_activo'] ?? '1') === '1'}
                  onChange={(e) => setFormConfig({ ...formConfig, modulo_clientes_activo: e.target.checked ? '1' : '0' })}
                />
                <label className="form-check-label">Mostrar Módulo F2 Clientes (Fiados y Préstamos)</label>
              </div>
              <div className="form-check form-switch mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={(formConfig['modulo_inventario_activo'] ?? '1') === '1'}
                  onChange={(e) => setFormConfig({ ...formConfig, modulo_inventario_activo: e.target.checked ? '1' : '0' })}
                />
                <label className="form-check-label">Mostrar Módulo F4 Inventario</label>
              </div>
              <div className="form-check form-switch mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={(formConfig['panel_botones_rapidos'] ?? '1') === '1'}
                  onChange={(e) => setFormConfig({ ...formConfig, panel_botones_rapidos: e.target.checked ? '1' : '0' })}
                />
                <label className="form-check-label">Mostrar Panel de Botones Rápidos de Panadería en Caja</label>
              </div>

              <h6 className="fw-bold text-primary border-bottom pb-1">Rutas de Respaldo Automático e Impresora Térmica</h6>
              <div className="mb-2">
                <label className="form-label small fw-semibold">Carpeta Local de Backups SQLite</label>
                <input
                  className="form-control form-control-sm"
                  value={formConfig['ruta_respaldo_local'] || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, ruta_respaldo_local: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Carpeta de Llave Maya / USB (Opcional)</label>
                <input
                  className="form-control form-control-sm"
                  placeholder="Ej: E:\Respaldos_PanPOS o /media/usb"
                  value={formConfig['ruta_respaldo_usb'] || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, ruta_respaldo_usb: e.target.value })}
                />
              </div>

              <div className="form-check form-switch mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={(formConfig['impresion_escpos_activa'] ?? '0') === '1'}
                  onChange={(e) => setFormConfig({ ...formConfig, impresion_escpos_activa: e.target.checked ? '1' : '0' })}
                />
                <label className="form-check-label">Activar Impresión de Tiquetes Térmicos ESC/POS (58mm/80mm)</label>
              </div>

              <button type="submit" className="btn btn-primary w-100 fw-bold mt-3">
                Guardar Preferencias del Sistema
              </button>
            </div>
          </form>
        </div>

        {/* Panel 2: Gestión de Cajeros y Conmutación Rápida de Rol (1 Clic) */}
        <div className="col-lg-6">
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-header bg-dark text-white fw-bold">
              👥 Usuarios y Cambio Rápido de Rol (Admin / Cajero)
            </div>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Usuario</th>
                    <th>Rol Actual</th>
                    <th className="text-end">Cambiar Permisos (1 Clic)</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id}>
                      <td className="fw-semibold">{u.nombre}</td>
                      <td><code>{u.username}</code></td>
                      <td>
                        <span className={`badge ${u.rol === 'admin' ? 'bg-danger' : 'bg-secondary'}`}>
                          {u.rol.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-end">
                        <button
                          className="btn btn-sm btn-outline-primary fw-semibold"
                          onClick={() => alternarRolRapido(u)}
                        >
                          Cambiar a {u.rol === 'admin' ? 'CAJERO' : 'ADMIN'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form className="card shadow-sm border-0 p-3" onSubmit={crearUsuario}>
            <h6 className="fw-bold mb-2">Registrar Nuevo Cajero o Administrador</h6>
            <div className="row g-2">
              <div className="col-md-4">
                <input className="form-control" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </div>
              <div className="col-md-3">
                <input className="form-control" placeholder="Usuario login" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="col-md-3">
                <input type="password" className="form-control" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="col-md-2">
                <button type="submit" className="btn btn-success w-100 fw-bold">+ Crear</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
