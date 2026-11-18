import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { Departamento } from '../types/models';

export const ModuloProveedores: React.FC = () => {
  const { departamentos, productos, usuario, recargarCatalogos } = usePos();
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [editando, setEditando] = useState<Departamento | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'danger'; texto: string } | null>(null);

  // Filtros de periodo para el reporte de ventas por proveedor
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [reporte, setReporte] = useState<any | null>(null);

  const consultarVentasProveedores = async (fechaDesde = desde, fechaHasta = hasta) => {
    const res = await api.get(`/reportes/ventas-periodo?desde=${fechaDesde}&hasta=${fechaHasta}`);
    setReporte(res.data);
  };

  useEffect(() => {
    consultarVentasProveedores();
  }, []);

  const aplicarRangoRapido = (tipo: 'hoy' | 'semana' | 'mes') => {
    const ahora = new Date();
    const fin = ahora.toISOString().slice(0, 10);
    let inicio = fin;

    if (tipo === 'semana') {
      const d = new Date(ahora);
      d.setDate(d.getDate() - 7);
      inicio = d.toISOString().slice(0, 10);
    } else if (tipo === 'mes') {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      inicio = d.toISOString().slice(0, 10);
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
        setNombreNuevo("");
      }
      await recargarCatalogos();
      await consultarVentasProveedores();
      setMensaje({ tipo: "success", texto: `Proveedor "${dep.nombre}" eliminado correctamente.` });
    } catch (err: any) {
      const msg = err.response?.data?.errors?.proveedor?.[0] || err.response?.data?.message || "No se pudo eliminar el proveedor.";
      setMensaje({ tipo: "danger", texto: msg });
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

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="row g-3">
        {/* Columna Izquierda: Crear y Administrar Proveedores (Dos Pinos, Coca-Cola, etc.) */}
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
            <div className="list-group list-group-flush" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
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

        {/* Columna Derecha: Reporte de Ventas y Ganancias por Proveedor con Selector de Periodo */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-dark text-white d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="fw-bold">📊 Reporte de Ventas por Proveedor / Departamento</span>
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
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <div className="p-3 border rounded bg-primary-subtle">
                        <div className="small fw-bold text-uppercase">Total Vendido en el Período</div>
                        <div className="fs-3 fw-bold text-primary">₡{Number(reporte.ventas_totales).toLocaleString()}</div>
                      </div>
                    </div>
                    {usuario?.rol === 'admin' && (
                      <div className="col-md-6">
                        <div className="p-3 border rounded bg-success-subtle">
                          <div className="small fw-bold text-uppercase">Ganancia Bruta Total de Proveedores</div>
                          <div className="fs-3 fw-bold text-success">₡{Number(reporte.ganancia_total).toLocaleString()}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-dark">
                        <tr>
                          <th>Proveedor / Departamento</th>
                          <th className="text-center">Unidades Vendidas</th>
                          <th className="text-end">Total Ventas</th>
                          {usuario?.rol === 'admin' && <th className="text-end">Costo Mercadería</th>}
                          {usuario?.rol === 'admin' && <th className="text-end">Ganancia Neta</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {reporte.ventas_por_departamento.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-muted py-4">
                              No se registraron ventas en el período seleccionado ({desde} a {hasta}).
                            </td>
                          </tr>
                        ) : (
                          reporte.ventas_por_departamento.map((d: any, idx: number) => (
                            <tr key={idx}>
                              <td className="fw-bold">{d.departamento}</td>
                              <td className="text-center">
                                <span className="badge bg-secondary fs-6">{d.unidades_vendidas || 0}</span>
                              </td>
                              <td className="text-end fw-bold text-primary">
                                ₡{Number(d.total_ventas).toLocaleString()}
                              </td>
                              {usuario?.rol === 'admin' && (
                                <td className="text-end text-muted">
                                  ₡{Number(d.costo_total || 0).toLocaleString()}
                                </td>
                              )}
                              {usuario?.rol === 'admin' && (
                                <td className="text-end fw-bold text-success">
                                  ₡{Number(d.ganancia).toLocaleString()}
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
