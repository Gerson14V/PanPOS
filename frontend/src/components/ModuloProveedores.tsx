import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { fechaLocalISO } from '../utils/fechaLocal';
import { Departamento } from '../types/models';

export const ModuloProveedores: React.FC = () => {
  const { departamentos, productos, usuario, recargarCatalogos } = usePos();
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [editando, setEditando] = useState<Departamento | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'danger'; texto: string } | null>(null);

  const hoy = fechaLocalISO();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [reporte, setReporte] = useState<any | null>(null);
  const [proveedorSeleccionadoId, setProveedorSeleccionadoId] = useState<number | null>(null);

  const consultarVentasProveedores = async (fechaDesde = desde, fechaHasta = hasta) => {
    const res = await api.get(`/reportes/ventas-periodo?desde=${fechaDesde}&hasta=${fechaHasta}`);
    setReporte(res.data);
    const ranking = res.data.ranking_proveedores || [];
    if (ranking.length > 0) {
      setProveedorSeleccionadoId((prev) =>
        prev !== null && ranking.some((r: any) => r.id === prev) ? prev : ranking[0].id
      );
    }
  };

  useEffect(() => {
    consultarVentasProveedores();
  }, []);

  const aplicarRangoRapido = (tipo: 'hoy' | 'semana' | 'mes') => {
    const ahora = new Date();
    const fin = fechaLocalISO(ahora);
    let inicio = fin;

    if (tipo === 'semana') {
      const d = new Date(ahora);
      d.setDate(d.getDate() - 6);
      inicio = fechaLocalISO(d);
    } else if (tipo === 'mes') {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      inicio = fechaLocalISO(d);
    }

    setDesde(inicio);
    setHasta(fin);
    consultarVentasProveedores(inicio, fin);
  };

  const eliminarProveedor = async (dep: Departamento) => {
    if (!window.confirm(`¿Está seguro de eliminar el proveedor "${dep.nombre}"?`)) return;
    try {
      await api.delete(`/departamentos/${dep.id}`);
      if (editando?.id === dep.id) {
        setEditando(null);
        setNombreNuevo('');
      }
      await recargarCatalogos();
      await consultarVentasProveedores();
      setMensaje({ tipo: 'success', texto: `Proveedor "${dep.nombre}" eliminado correctamente.` });
    } catch (err: any) {
      const msg = err.response?.data?.errors?.proveedor?.[0] || err.response?.data?.message || 'No se pudo eliminar el proveedor.';
      setMensaje({ tipo: 'danger', texto: msg });
    }
  };

  const guardarProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    try {
      if (editando) {
        await api.put(`/departamentos/${editando.id}`, { nombre: nombreNuevo.trim() });
        setMensaje({ tipo: 'success', texto: 'Proveedor actualizado correctamente.' });
      } else {
        await api.post('/departamentos', { nombre: nombreNuevo.trim() });
        setMensaje({ tipo: 'success', texto: 'Nuevo proveedor creado y disponible para asociar a productos.' });
      }
      setNombreNuevo('');
      setEditando(null);
      await recargarCatalogos();
      await consultarVentasProveedores();
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'Ya existe un proveedor con ese nombre.' });
    }
  };

  const rankingProveedores: any[] = reporte?.ranking_proveedores || [];
  const proveedorLider = rankingProveedores.length > 0 && rankingProveedores[0].unidades_vendidas > 0 ? rankingProveedores[0] : null;
  const proveedorDetalle = rankingProveedores.find((p) => p.id === proveedorSeleccionadoId) || rankingProveedores[0] || null;

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="row g-3">
        {/* Columna Izquierda: Administración de Proveedores */}
        <div className="col-lg-4">
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-header bg-primary text-white fw-bold">
              {editando ? '✏️ Renombrar Proveedor' : '🚚 Registrar Nuevo Proveedor / Departamento'}
            </div>
            <form className="card-body" onSubmit={guardarProveedor}>
              <div className="mb-3">
                <label className="form-label fw-semibold">Nombre del Proveedor</label>
                <input
                  className="form-control form-control-lg"
                  placeholder="Ej: Dos Pinos, Coca-Cola, Bimbo..."
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  required
                />
              </div>
              <div className="d-flex gap-2">
                {editando && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditando(null);
                      setNombreNuevo('');
                    }}
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" className="btn btn-success flex-grow-1 fw-bold">
                  {editando ? 'Guardar Cambios' : '+ Crear Proveedor'}
                </button>
              </div>
            </form>
          </div>

          <div className="card shadow-sm border-0">
            <div className="card-header fw-bold bg-body-tertiary">
              Proveedores Registrados ({departamentos.length})
            </div>
            <div className="list-group list-group-flush" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {departamentos.map((d) => {
                const cantProductos = productos.filter((p) => p.departamento_id === d.id).length;
                return (
                  <div key={d.id} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-bold">{d.nombre}</div>
                      <small className="text-muted">{cantProductos} productos asociados</small>
                    </div>
                    <div className="btn-group btn-group-sm">
                      <button
                        className="btn btn-outline-primary"
                        onClick={() => {
                          setEditando(d);
                          setNombreNuevo(d.nombre);
                        }}
                      >
                        Renombrar
                      </button>
                      <button
                        className="btn btn-outline-danger"
                        onClick={() => eliminarProveedor(d)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Ranking de Proveedores + Todos los Productos del Proveedor Seleccionado */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-header bg-dark text-white d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="fw-bold">📊 Ranking de Ventas por Proveedor / Departamento</span>
              <div className="btn-group btn-group-sm">
                <button className="btn btn-outline-light" onClick={() => aplicarRangoRapido('hoy')}>
                  Hoy
                </button>
                <button className="btn btn-outline-light" onClick={() => aplicarRangoRapido('semana')}>
                  Últimos 7 Días
                </button>
                <button className="btn btn-outline-light" onClick={() => aplicarRangoRapido('mes')}>
                  Este Mes
                </button>
              </div>
            </div>

            <div className="card-body">
              <div className="row g-2 align-items-end mb-3 bg-body-tertiary p-3 rounded">
                <div className="col-md-4">
                  <label className="form-label small fw-bold mb-1">Fecha Inicial</label>
                  <input type="date" className="form-control" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-bold mb-1">Fecha Final</label>
                  <input type="date" className="form-control" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
                <div className="col-md-4">
                  <button
                    className="btn btn-primary w-100 fw-bold"
                    onClick={() => consultarVentasProveedores(desde, hasta)}
                  >
                    🔍 Filtrar Período
                  </button>
                </div>
              </div>

              {reporte && (
                <>
                  {/* Tarjetas Resumen con Proveedor Líder */}
                  <div className="row g-2 mb-3">
                    <div className="col-md-4">
                      <div className="p-3 border rounded bg-warning-subtle h-100">
                        <div className="small fw-bold text-uppercase text-muted">🏆 Proveedor con Más Productos Vendidos</div>
                        {proveedorLider ? (
                          <>
                            <div className="fs-5 fw-bolder text-dark">{proveedorLider.departamento}</div>
                            <small className="fw-bold text-success">
                              {proveedorLider.unidades_vendidas} unidades vendidas
                            </small>
                          </>
                        ) : (
                          <div className="small text-muted mt-1">Sin ventas en el período</div>
                        )}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="p-3 border rounded bg-primary-subtle h-100">
                        <div className="small fw-bold text-uppercase text-muted">Total Vendido</div>
                        <div className="fs-4 fw-bold text-primary">₡{Number(reporte.ventas_totales).toLocaleString()}</div>
                      </div>
                    </div>
                    {usuario?.rol === 'admin' && (
                      <div className="col-md-4">
                        <div className="p-3 border rounded bg-success-subtle h-100">
                          <div className="small fw-bold text-uppercase text-muted">Ganancia Bruta</div>
                          <div className="fs-4 fw-bold text-success">₡{Number(reporte.ganancia_total).toLocaleString()}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tabla Ranking de Departamentos/Proveedores (Clic en una fila para ver todos sus productos) */}
                  <div className="small text-muted mb-1">
                    Haga clic en cualquier proveedor para ver abajo el listado completo de todos sus productos del más vendido al menos vendido:
                  </div>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-dark">
                        <tr>
                          <th style={{ width: '45px' }}>#</th>
                          <th>Proveedor / Departamento</th>
                          <th className="text-center">Unidades Vendidas</th>
                          <th className="text-end">Total Ventas</th>
                          {usuario?.rol === 'admin' && <th className="text-end">Ganancia Neta</th>}
                          <th className="text-end">Ver Productos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankingProveedores.map((d: any, idx: number) => {
                          const seleccionado = proveedorDetalle?.id === d.id;
                          return (
                            <tr
                              key={d.id}
                              style={{ cursor: 'pointer' }}
                              className={seleccionado ? 'table-active' : ''}
                              onClick={() => setProveedorSeleccionadoId(d.id)}
                            >
                              <td className="fw-bold">
                                {idx === 0 && d.unidades_vendidas > 0 ? '🏆' : `#${idx + 1}`}
                              </td>
                              <td>
                                <div className="fw-bold">{d.departamento}</div>
                                <small className="text-muted">{d.total_productos_catalogo} producto(s) en catálogo</small>
                              </td>
                              <td className="text-center">
                                <span className={`badge fs-6 ${d.unidades_vendidas > 0 ? 'bg-primary' : 'bg-secondary'}`}>
                                  {d.unidades_vendidas} u.
                                </span>
                              </td>
                              <td className="text-end fw-bold text-primary">
                                ₡{Number(d.total_ventas).toLocaleString()}
                              </td>
                              {usuario?.rol === 'admin' && (
                                <td className="text-end fw-bold text-success">
                                  ₡{Number(d.ganancia).toLocaleString()}
                                </td>
                              )}
                              <td className="text-end">
                                <button
                                  type="button"
                                  className={`btn btn-sm ${seleccionado ? 'btn-primary' : 'btn-outline-primary'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProveedorSeleccionadoId(d.id);
                                  }}
                                >
                                  {seleccionado ? 'Viendo' : 'Ver Todos'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tabla Detallada: TODOS los productos del proveedor seleccionado ordenados del más vendido al menos vendido */}
          {proveedorDetalle && (
            <div className="card shadow-sm border-0">
              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <span className="fw-bold">
                  📦 Todos los Productos de "{proveedorDetalle.departamento}" (Ordenados por Más Vendidos)
                </span>
                <span className="badge bg-light text-dark">
                  {proveedorDetalle.productos.length} productos en total
                </span>
              </div>
              <div className="table-responsive" style={{ maxHeight: '42vh', overflowY: 'auto' }}>
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: '50px' }}>Pos.</th>
                      <th>Código</th>
                      <th>Producto</th>
                      <th className="text-center">Unidades Vendidas</th>
                      <th className="text-end">Total Vendido</th>
                      {usuario?.rol === 'admin' && <th className="text-end">Ganancia</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {proveedorDetalle.productos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          Este proveedor aún no tiene productos registrados en F3 Productos/Inventario.
                        </td>
                      </tr>
                    ) : (
                      proveedorDetalle.productos.map((prod: any, idx: number) => (
                        <tr key={prod.id} className={prod.unidades_vendidas === 0 ? 'text-muted' : ''}>
                          <td className="fw-bold">
                            {idx === 0 && prod.unidades_vendidas > 0 ? '🥇' : idx === 1 && prod.unidades_vendidas > 0 ? '🥈' : idx === 2 && prod.unidades_vendidas > 0 ? '🥉' : `#${idx + 1}`}
                          </td>
                          <td><span className="badge bg-secondary">{prod.codigo_barras}</span></td>
                          <td className="fw-semibold">{prod.nombre}</td>
                          <td className="text-center">
                            <span className={`badge fs-6 ${prod.unidades_vendidas > 0 ? 'bg-success' : 'bg-light text-muted border'}`}>
                              {prod.unidades_vendidas}
                            </span>
                          </td>
                          <td className="text-end fw-bold">
                            ₡{Number(prod.total_ventas).toLocaleString()}
                          </td>
                          {usuario?.rol === 'admin' && (
                            <td className="text-end fw-bold text-success">
                              ₡{Number(prod.ganancia).toLocaleString()}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
