import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { Usuario } from '../types/models';

type SeccionConfig =
  | 'menu'
  | 'opciones_habilitadas'
  | 'cajeros'
  | 'base_datos'
  | 'facturacion'
  | 'folios'
  | 'logotipo'
  | 'ticket'
  | 'formas_pago'
  | 'impuestos'
  | 'corte'
  | 'moneda'
  | 'unidades'
  | 'impresora'
  | 'lector'
  | 'cajon'
  | 'respaldo';

export const ModuloConfiguracion: React.FC = () => {
  const { configuracion, recargarCatalogos } = usePos();
  const [seccionActiva, setSeccionActiva] = useState<SeccionConfig>('menu');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'danger'; texto: string } | null>(null);

  const [nombre, setNombre] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<'admin' | 'cajero'>('cajero');
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  const cargarUsuarios = async () => {
    try {
      const res = await api.get('/usuarios');
      setUsuarios(res.data);
    } catch {
      setMensaje({ tipo: 'danger', texto: 'No se pudo cargar la lista de usuarios.' });
    }
  };

  useEffect(() => {
    setFormConfig(configuracion);
    cargarUsuarios();
  }, [configuracion]);

  const guardarConfiguracion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (guardandoConfig) return;
    setGuardandoConfig(true);
    try {
      await api.put('/configuracion', { configuraciones: formConfig });
      await recargarCatalogos();
      setMensaje({ tipo: 'success', texto: '✅ Cambios guardados en la configuración de PanPOS.' });
    } catch {
      setMensaje({ tipo: 'danger', texto: 'No se pudieron guardar los cambios de configuración.' });
    } finally {
      setGuardandoConfig(false);
    }
  };

  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creandoUsuario) return;
    setCreandoUsuario(true);
    try {
      await api.post('/usuarios', { nombre, username, password, rol });
      setNombre('');
      setUsername('');
      setPassword('');
      await cargarUsuarios();
      setMensaje({ tipo: 'success', texto: 'Cajero / Usuario creado correctamente.' });
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'Error al crear usuario.' });
    } finally {
      setCreandoUsuario(false);
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

  
  const eliminarUsuario = async (u: Usuario) => {
    if (!window.confirm(`¿Está seguro de eliminar al usuario "${u.nombre}" (${u.username})?`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      await cargarUsuarios();
      setMensaje({ tipo: "success", texto: `Usuario "${u.nombre}" eliminado correctamente.` });
    } catch (err: any) {
      const msg = err.response?.data?.errors?.usuario?.[0] || err.response?.data?.message || "No se pudo eliminar el usuario.";
      setMensaje({ tipo: "danger", texto: msg });
    }
  };



  const dispararBackupManual = async () => {
    try {
      const res = await api.post('/sistema/backup');
      setMensaje({
        tipo: 'success',
        texto: `Respaldo creado en: ${res.data.ruta_local} ${res.data.copiado_usb ? '(+ Copiado a USB)' : ''}`,
      });
    } catch {
      setMensaje({ tipo: 'danger', texto: 'No se pudo ejecutar el respaldo manual.' });
    }
  };

  const IconCard = ({
    id,
    icono,
    titulo,
    color = 'text-primary',
  }: {
    id: SeccionConfig;
    icono: string;
    titulo: string;
    color?: string;
  }) => (
    <button
      type="button"
      onClick={() => {
        setMensaje(null);
        setSeccionActiva(id);
      }}
      className="btn btn-config-tile shadow-sm d-flex flex-column align-items-center justify-content-center p-3 text-center"
      style={{ width: '135px', height: '110px', transition: 'transform 0.12s' }}
    >
      <span className={`fs-2 mb-1 ${color}`}>{icono}</span>
      <span className="small fw-semibold lh-sm">{titulo}</span>
    </button>
  );

  return (
    <div className="container-fluid py-2">
      {/* Franja superior azul estilo eleventa */}
      <div className="bg-primary text-white px-3 py-2 rounded-top d-flex justify-content-between align-items-center shadow-sm">
        <h5 className="mb-0 fw-bold text-uppercase tracking-wide">CONFIGURACIÓN</h5>
        <button
          type="button"
          className="btn btn-sm btn-warning fw-bold text-dark"
          onClick={() => setSeccionActiva('menu')}
        >
          🏠 Mostrar todas las opciones
        </button>
      </div>

      <div className="card shadow-sm border-0 rounded-0 rounded-bottom p-3" style={{ minHeight: '78vh' }}>
        {mensaje && (
          <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2 mb-3`}>
            {mensaje.texto}
            <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
          </div>
        )}

        {/* VISTA PRINCIPAL: PANEL DE ICONOS POR CATEGORÍAS ESTILO ELEVENTA */}
        {seccionActiva === 'menu' && (
          <div className="px-2">
            {/* 1. General */}
            <div className="mb-4">
              <h6 className="fw-bold border-bottom pb-2 mb-3 text-secondary">General</h6>
              <div className="d-flex flex-wrap gap-3">
                <IconCard id="opciones_habilitadas" icono="⚙️" titulo="Opciones habilitadas" />
                <IconCard id="cajeros" icono="👥" titulo="Cajeros" color="text-info" />
                <IconCard id="base_datos" icono="🗄️" titulo="Base de Datos" color="text-secondary" />
                <IconCard id="facturacion" icono="🧾" titulo="Facturación Electrónica" color="text-success" />
                <IconCard id="folios" icono="🔢" titulo="Modificar Folios" color="text-warning" />
              </div>
            </div>

            {/* 2. Personalización */}
            <div className="mb-4">
              <h6 className="fw-bold border-bottom pb-2 mb-3 text-secondary">Personalización</h6>
              <div className="d-flex flex-wrap gap-3">
                <IconCard id="logotipo" icono="🏪" titulo="Datos y Logotipo del Negocio" />
                <IconCard id="ticket" icono="📃" titulo="Ticket" color="text-secondary" />
                <IconCard id="formas_pago" icono="💳" titulo="Formas de Pago" color="text-success" />
                <IconCard id="impuestos" icono="🏛️" titulo="Impuestos (IVA)" color="text-warning" />
                <IconCard id="corte" icono="✂️" titulo="Corte de Caja" color="text-danger" />
                <IconCard id="moneda" icono="₡" titulo="Símbolo de Moneda" color="text-success" />
                <IconCard id="unidades" icono="⚖️" titulo="Unidades de Medida" color="text-info" />
              </div>
            </div>

            {/* 3. Dispositivos y Servicios */}
            <div className="mb-4">
              <h6 className="fw-bold border-bottom pb-2 mb-3 text-secondary">Dispositivos y Servicios</h6>
              <div className="d-flex flex-wrap gap-3">
                <IconCard id="impresora" icono="🖨️" titulo="Impresora de Tickets" />
                <IconCard id="lector" icono="🔫" titulo="Lector de Códigos" color="text-danger" />
                <IconCard id="cajon" icono="💵" titulo="Cajón de Dinero" color="text-success" />
              </div>
            </div>

            {/* 4. Mantenimiento */}
            <div>
              <h6 className="fw-bold border-bottom pb-2 mb-3 text-secondary">Mantenimiento</h6>
              <div className="d-flex flex-wrap gap-3">
                <IconCard id="respaldo" icono="💾" titulo="Respaldo Automático" color="text-primary" />
              </div>
            </div>
          </div>
        )}

        {/* SUB-VISTAS DE CADA ICONO */}
        {seccionActiva !== 'menu' && (
          <div className="mx-auto" style={{ maxWidth: '850px', width: '100%' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
              <button className="btn btn-outline-secondary btn-sm fw-bold" onClick={() => setSeccionActiva('menu')}>
                ← Volver al Menú de Configuración
              </button>
              {seccionActiva !== 'cajeros' && (
                <button className="btn btn-success fw-bold" disabled={guardandoConfig} onClick={() => guardarConfiguracion()}>
                  {guardandoConfig ? 'Guardando...' : '💾 Guardar Cambios de esta Sección'}
                </button>
              )}
            </div>

            {/* 1. Opciones Habilitadas */}
            {seccionActiva === 'opciones_habilitadas' && (
              <div>
                <h5 className="fw-bold mb-3">⚙️ Opciones y Módulos Habilitados</h5>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={(formConfig['modulo_clientes_activo'] ?? '1') === '1'}
                    onChange={(e) => setFormConfig({ ...formConfig, modulo_clientes_activo: e.target.checked ? '1' : '0' })}
                  />
                  <label className="form-check-label fw-semibold">
                    Habilitar Módulo F2 Clientes, Cuentas por Cobrar (Fiados) y Préstamos
                  </label>
                </div>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={(formConfig['panel_botones_rapidos'] ?? '1') === '1'}
                    onChange={(e) => setFormConfig({ ...formConfig, panel_botones_rapidos: e.target.checked ? '1' : '0' })}
                  />
                  <label className="form-check-label fw-semibold">
                    Mostrar Panel Lateral de Botones Rápidos de Panadería en F1 Ventas
                  </label>
                </div>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={(formConfig['habilitar_bitacora_kardex'] ?? '0') === '1'}
                    onChange={(e) => setFormConfig({ ...formConfig, habilitar_bitacora_kardex: e.target.checked ? '1' : '0' })}
                  />
                  <label className="form-check-label fw-semibold">
                    Habilitar Botón de Auditoría Kardex de Inventario para el Administrador
                  </label>
                </div>
                
              </div>
            )}

            {/* 2. Cajeros */}
            {seccionActiva === 'cajeros' && (
              <div>
                <h5 className="fw-bold mb-3">👥 Administración de Cajeros y Permisos</h5>
                <div className="table-responsive mb-4">
                  <table className="table table-bordered align-middle">
                    <thead className="table-dark">
                      <tr>
                        <th>Nombre</th>
                        <th>Usuario Login</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th className="text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuarios.map((u) => (
                        <tr key={u.id}>
                          <td className="fw-bold">{u.nombre}</td>
                          <td><code>{u.username}</code></td>
                          <td>
                            <span className={`badge ${u.rol === 'admin' ? 'bg-danger' : 'bg-secondary'}`}>
                              {u.rol.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${u.activo ? 'bg-success' : 'bg-warning text-dark'}`}>
                              {u.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                          </td>
                          <td className="text-end">
                            <button className="btn btn-sm btn-outline-primary me-1" onClick={() => alternarRolRapido(u)}>
                              Cambiar a {u.rol === 'admin' ? 'CAJERO' : 'ADMIN'}
                            </button>

                            <button className="btn btn-sm btn-outline-danger" onClick={() => eliminarUsuario(u)}>
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <form className="p-3 border rounded bg-body-tertiary" onSubmit={crearUsuario}>
                  <h6 className="fw-bold mb-3">➕ Registrar Nuevo Cajero</h6>
                  <div className="row g-2">
                    <div className="col-md-3">
                      <input className="form-control" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                    </div>
                    <div className="col-md-2">
                      <input className="form-control" placeholder="Usuario login" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    </div>
                    <div className="col-md-2">
                      <input type="password" className="form-control" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <div className="col-md-2">
                      <select className="form-select" value={rol} onChange={(e) => setRol(e.target.value as "admin" | "cajero")}>
                        <option value="cajero">Cajero</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={creandoUsuario}>{creandoUsuario ? 'Creando...' : 'Crear Usuario'}</button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* 3. Base de Datos */}
            {seccionActiva === 'base_datos' && (
              <div>
                <h5 className="fw-bold mb-3">🗄️ Estado y Mantenimiento de Base de Datos SQLite</h5>
                <div className="alert alert-success">
                  <strong>Motor SQLite Blindado Activo:</strong> Operando con <code>PRAGMA journal_mode = WAL</code> y <code>synchronous = FULL</code> (Resistente a cortes de energía eléctrica).
                </div>
                <button type="button" className="btn btn-primary fw-bold" onClick={dispararBackupManual}>
                  💾 Compactar (VACUUM) y Generar Copia de Seguridad Ahora
                </button>
              </div>
            )}

            {/* 4. Facturación Electrónica (Hacienda Costa Rica v4.3 / v4.4) */}
            {seccionActiva === 'facturacion' && (
              <div>
                <h5 className="fw-bold mb-2">🧾 Facturación Electrónica — Ministerio de Hacienda (Costa Rica) <span className="badge bg-warning text-dark ms-1">Próximamente</span></h5>
                <div className="alert alert-warning py-2 small fw-semibold">
                  ⏳ Módulo en preparación: actualmente guarda la configuración preliminar, pero todavía no emite ni envía comprobantes a Hacienda.
                </div>
                <p className="text-muted small mb-3">
                  Configure la emisión de Tiquete Electrónico y Factura Electrónica con cola offline automática si falla el internet.
                </p>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={(formConfig['fe_hacienda_activa'] ?? '0') === '1'}
                    onChange={(e) => setFormConfig({ ...formConfig, fe_hacienda_activa: e.target.checked ? '1' : '0' })}
                  />
                  <label className="form-check-label fw-bold">
                    Activar Emisión de Comprobantes Electrónicos (Hacienda CR)
                  </label>
                </div>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">Ambiente ATV</label>
                    <select
                      className="form-select"
                      value={formConfig['fe_ambiente'] || 'stag'}
                      onChange={(e) => setFormConfig({ ...formConfig, fe_ambiente: e.target.value })}
                    >
                      <option value="stag">Pruebas / Sandbox (api-stag)</option>
                      <option value="prod">Producción Oficial (api-prod)</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">Código Actividad Económica</label>
                    <input
                      className="form-control"
                      placeholder="Ej: 107101 (Elaboración de pan)"
                      value={formConfig['fe_codigo_actividad'] || '107101'}
                      onChange={(e) => setFormConfig({ ...formConfig, fe_codigo_actividad: e.target.value })}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-bold">CABYS por Defecto Panadería</label>
                    <input
                      className="form-control"
                      placeholder="Ej: 2349001000100"
                      value={formConfig['fe_cabys_default'] || '2349001000100'}
                      onChange={(e) => setFormConfig({ ...formConfig, fe_cabys_default: e.target.value })}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold">Usuario API ATV (cpf-...)</label>
                    <input
                      className="form-control"
                      placeholder="cpj-3-101-...@stag.comprobanteselectronicos.go.cr"
                      value={formConfig['fe_usuario_atv'] || ''}
                      onChange={(e) => setFormConfig({ ...formConfig, fe_usuario_atv: e.target.value })}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold">Ruta Llave Criptográfica (.p12)</label>
                    <input
                      className="form-control"
                      placeholder="/storage/app/certificados/llave.p12"
                      value={formConfig['fe_ruta_p12'] || ''}
                      onChange={(e) => setFormConfig({ ...formConfig, fe_ruta_p12: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 5. Folios, Logotipo, Ticket, Formas de Pago, Impuestos, Corte, Moneda, Unidades */}
            {seccionActiva === 'folios' && (
              <div>
                <h5 className="fw-bold mb-3">🔢 Numeración de Folios y Consecutivos</h5>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Sucursal (3 dígitos)</label>
                    <input className="form-control" value={formConfig['folio_sucursal'] || '001'} onChange={(e) => setFormConfig({ ...formConfig, folio_sucursal: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Terminal / Caja (5 dígitos)</label>
                    <input className="form-control" value={formConfig['folio_terminal'] || '00001'} onChange={(e) => setFormConfig({ ...formConfig, folio_terminal: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {seccionActiva === 'logotipo' && (
              <div>
                <h5 className="fw-bold mb-3">🏪 Datos Comerciales de la Panadería</h5>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Nombre del Negocio</label>
                    <input className="form-control" value={formConfig['nombre_negocio'] || ''} onChange={(e) => setFormConfig({ ...formConfig, nombre_negocio: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Cédula Física / Jurídica</label>
                    <input className="form-control" value={formConfig['cedula_negocio'] || ''} onChange={(e) => setFormConfig({ ...formConfig, cedula_negocio: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Teléfono</label>
                    <input className="form-control" value={formConfig['telefono_negocio'] || ''} onChange={(e) => setFormConfig({ ...formConfig, telefono_negocio: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Dirección</label>
                    <input className="form-control" value={formConfig['direccion_negocio'] || ''} onChange={(e) => setFormConfig({ ...formConfig, direccion_negocio: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {seccionActiva === 'ticket' && (
              <div>
                <h5 className="fw-bold mb-3">📃 Diseño de Encabezado y Pie de Ticket</h5>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Lema / Encabezado del Ticket</label>
                  <input className="form-control" value={formConfig['encabezado_ticket'] || 'Pan Fresco Recién Horneado'} onChange={(e) => setFormConfig({ ...formConfig, encabezado_ticket: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Mensaje de Agradecimiento (Pie de Ticket)</label>
                  <textarea rows={3} className="form-control" value={formConfig['mensaje_ticket'] || '¡Gracias por su compra!'} onChange={(e) => setFormConfig({ ...formConfig, mensaje_ticket: e.target.value })} />
                </div>
              </div>
            )}

            {seccionActiva === 'formas_pago' && (
              <div>
                <h5 className="fw-bold mb-3">💳 Formas de Pago y Límites de Crédito</h5>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Teléfono SINPE Móvil del Negocio (Para mostrar en pantalla al cobrar)</label>
                  <input className="form-control" placeholder="Ej: 8888-8888 a nombre de..." value={formConfig['sinpe_telefono_receptor'] || ''} onChange={(e) => setFormConfig({ ...formConfig, sinpe_telefono_receptor: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Límite de Crédito (Fiado) Sugerido por Cliente (₡)</label>
                  <input type="number" className="form-control" value={formConfig['limite_credito_default'] || '25000'} onChange={(e) => setFormConfig({ ...formConfig, limite_credito_default: e.target.value })} />
                </div>
              </div>
            )}

            {seccionActiva === 'impuestos' && (
              <div>
                <h5 className="fw-bold mb-3">🏛️ Configuración de Impuestos (IVA Costa Rica)</h5>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Tarifa General IVA (%)</label>
                    <input type="number" className="form-control" value={formConfig['iva_porcentaje'] || '13'} onChange={(e) => setFormConfig({ ...formConfig, iva_porcentaje: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Tarifa Canasta Básica Panadería (%)</label>
                    <input type="number" className="form-control" value={formConfig['iva_canasta_basica'] || '1'} onChange={(e) => setFormConfig({ ...formConfig, iva_canasta_basica: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {seccionActiva === 'corte' && (
              <div>
                <h5 className="fw-bold mb-3">✂️ Parámetros de Apertura y Corte de Caja</h5>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Fondo Inicial de Caja por Defecto (₡)</label>
                  <input type="number" className="form-control" value={formConfig['fondo_inicial_sugerido'] || '10000'} onChange={(e) => setFormConfig({ ...formConfig, fondo_inicial_sugerido: e.target.value })} />
                </div>
              </div>
            )}

            {seccionActiva === 'moneda' && (
              <div>
                <h5 className="fw-bold mb-3">₡ Símbolo de Moneda y Formato</h5>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Símbolo Monetario</label>
                  <input className="form-control" value={formConfig['simbolo_moneda'] || '₡'} onChange={(e) => setFormConfig({ ...formConfig, simbolo_moneda: e.target.value })} />
                </div>
              </div>
            )}

            {seccionActiva === 'unidades' && (
              <div>
                <h5 className="fw-bold mb-3">⚖️ Unidades de Medida</h5>
                <p className="text-muted">PanPOS opera optimizado por <strong>Unidad (Unid)</strong> y <strong>Paquete / Bolsa</strong> para máxima velocidad en mostrador.</p>
              </div>
            )}

            {seccionActiva === 'impresora' && (
              <div>
                <h5 className="fw-bold mb-3">🖨️ Impresora Térmica de Tickets (ESC/POS) <span className="badge bg-warning text-dark ms-1">Próximamente</span></h5>
                <div className="alert alert-warning py-2 small fw-semibold">
                  ⏳ Módulo en preparación: guarda las preferencias de impresora, pero la impresión directa ESC/POS aún no está conectada.
                </div>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={(formConfig['impresion_escpos_activa'] ?? '0') === '1'}
                    onChange={(e) => setFormConfig({ ...formConfig, impresion_escpos_activa: e.target.checked ? '1' : '0' })}
                  />
                  <label className="form-check-label fw-bold">Imprimir Tiquete Automáticamente al Cobrar</label>
                </div>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Nombre de la Impresora en el Sistema</label>
                    <input className="form-control" value={formConfig['nombre_impresora'] || 'POS-80'} onChange={(e) => setFormConfig({ ...formConfig, nombre_impresora: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Ancho del Rollo Térmico</label>
                    <select className="form-select" value={formConfig['ancho_papel_mm'] || '80'} onChange={(e) => setFormConfig({ ...formConfig, ancho_papel_mm: e.target.value })}>
                      <option value="80">80 mm (Estándar)</option>
                      <option value="58">58 mm (Compacto)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {seccionActiva === 'lector' && (
              <div>
                <h5 className="fw-bold mb-3">🔫 Lector de Códigos de Barras</h5>
                <p className="text-muted">El campo de código enfoca automáticamente al abrir F1 Ventas y después de cada cobro. Compatible con cualquier lector láser/2D USB HID y códigos cortos manuales <code>01</code> a <code>99</code>.</p>
              </div>
            )}

            {seccionActiva === 'cajon' && (
              <div>
                <h5 className="fw-bold mb-3">💵 Cajón de Dinero (RJ11 conectado a Impresora)</h5>
                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={(formConfig['abrir_cajon_automatico'] ?? '1') === '1'}
                    onChange={(e) => setFormConfig({ ...formConfig, abrir_cajon_automatico: e.target.checked ? '1' : '0' })}
                  />
                  <label className="form-check-label fw-semibold">Enviar pulso de apertura de gaveta al cobrar en Efectivo</label>
                </div>
              </div>
            )}

            {seccionActiva === 'respaldo' && (
              <div>
                <h5 className="fw-bold mb-3">💾 Rutas de Respaldo Automático (Local + Llave Maya USB)</h5>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Carpeta Local de Respaldos en la PC</label>
                  <input className="form-control" value={formConfig['ruta_respaldo_local'] || ''} onChange={(e) => setFormConfig({ ...formConfig, ruta_respaldo_local: e.target.value })} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Ruta de Llave Maya / USB Externa (Copia automática al cerrar turno)</label>
                  <input className="form-control" placeholder="Ej: E:\Respaldos_PanPOS o /media/gerson/USB" value={formConfig['ruta_respaldo_usb'] || ''} onChange={(e) => setFormConfig({ ...formConfig, ruta_respaldo_usb: e.target.value })} />
                </div>
                <button type="button" className="btn btn-warning fw-bold" onClick={dispararBackupManual}>
                  💾 Ejecutar Respaldo Inmediato Ahora
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
