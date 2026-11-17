import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { Producto } from '../types/models';

export const ModuloProductosInventario: React.FC<{ vistaInicial?: 'productos' | 'inventario' }> = ({
  vistaInicial = 'productos',
}) => {
  const { productos, departamentos, usuario, recargarCatalogos } = usePos();
  const [subVista, setSubVista] = useState<'productos' | 'inventario' | 'kardex'>(vistaInicial);
  const [busqueda, setBusqueda] = useState('');
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Formulario Producto
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [nombre, setNombre] = useState('');
  const [departamentoId, setDepartamentoId] = useState<string>('');
  const [precioCompra, setPrecioCompra] = useState('0');
  const [precioVenta, setPrecioVenta] = useState('');
  const [controlarStock, setControlarStock] = useState(false);
  const [stockActual, setStockActual] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('5');
  const [botonRapido, setBotonRapido] = useState(false);

  // Formulario Nuevo Departamento
  const [nuevoDep, setNuevoDep] = useState('');

  // Modal Ajuste/Entrada de Inventario (F4)
  const [prodAjuste, setProdAjuste] = useState<Producto | null>(null);
  const [tipoMov, setTipoMov] = useState<'entrada' | 'ajuste' | 'merma'>('entrada');
  const [cantMov, setCantMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');
  const [kardex, setKardex] = useState<any[]>([]);

  useEffect(() => {
    setSubVista(vistaInicial);
  }, [vistaInicial]);

  useEffect(() => {
    if (departamentos.length > 0 && !departamentoId) {
      setDepartamentoId(String(departamentos[0].id));
    }
  }, [departamentos]);

  const pedirCodigoCorto = async () => {
    const res = await api.get('/productos/sugerir-codigo-corto');
    if (res.data.codigo_sugerido) {
      setCodigoBarras(res.data.codigo_sugerido);
      setControlarStock(false);
      setBotonRapido(true);
    }
  };

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      departamento_id: Number(departamentoId),
      codigo_barras: codigoBarras,
      nombre,
      precio_compra: Number(precioCompra),
      precio_venta: Number(precioVenta),
      controlar_stock: controlarStock,
      stock_actual: Number(stockActual),
      stock_minimo: Number(stockMinimo),
      mostrar_boton_rapido: botonRapido,
      usuario_id: usuario?.id,
    };

    if (editandoId) {
      await api.put(`/productos/${editandoId}`, payload);
      setMensaje('Producto actualizado correctamente.');
    } else {
      await api.post('/productos', payload);
      setMensaje('Producto creado en el catálogo.');
    }

    limpiarFormulario();
    await recargarCatalogos();
  };

  const cargarParaEditar = (p: Producto) => {
    setEditandoId(p.id);
    setCodigoBarras(p.codigo_barras);
    setNombre(p.nombre);
    setDepartamentoId(String(p.departamento_id));
    setPrecioCompra(String(p.precio_compra));
    setPrecioVenta(String(p.precio_venta));
    setControlarStock(p.controlar_stock);
    setStockActual(String(p.stock_actual));
    setStockMinimo(String(p.stock_minimo));
    setBotonRapido(p.mostrar_boton_rapido);
  };

  const limpiarFormulario = () => {
    setEditandoId(null);
    setCodigoBarras('');
    setNombre('');
    setPrecioCompra('0');
    setPrecioVenta('');
    setControlarStock(false);
    setStockActual('0');
    setBotonRapido(false);
  };

  const crearDepartamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoDep.trim()) return;
    await api.post('/departamentos', { nombre: nuevoDep.trim() });
    setNuevoDep('');
    await recargarCatalogos();
  };

  const registrarMovimientoStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodAjuste || !usuario) return;
    await api.post(`/productos/${prodAjuste.id}/stock`, {
      usuario_id: usuario.id,
      tipo: tipoMov,
      cantidad: Number(cantMov),
      motivo: motivoMov || 'Movimiento registrado en módulo de inventario',
    });
    setProdAjuste(null);
    setCantMov('');
    setMotivoMov('');
    await recargarCatalogos();
    setMensaje('Existencia actualizada y registrada en el Kardex.');
  };

  const cargarKardex = async () => {
    setSubVista('kardex');
    const res = await api.get('/inventario/movimientos');
    setKardex(res.data);
  };

  const listaFiltrada = productos.filter((p) => {
    if (soloBajoStock && (!p.controlar_stock || p.stock_actual > p.stock_minimo)) return false;
    return (
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo_barras.toLowerCase().includes(busqueda.toLowerCase())
    );
  });

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className="alert alert-success alert-dismissible fade show py-2">
          {mensaje}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      {/* Sub-navegación estilo eleventa (F3 Productos / F4 Inventario / Kardex) */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div className="btn-group">
          <button
            className={`btn fw-bold ${subVista === 'productos' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSubVista('productos')}
          >
            F3 — Catálogo de Productos y Departamentos
          </button>
          <button
            className={`btn fw-bold ${subVista === 'inventario' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setSubVista('inventario')}
          >
            F4 — Control de Existencias y Bajo Stock
          </button>
          <button
            className={`btn fw-bold ${subVista === 'kardex' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={cargarKardex}
          >
            📋 Historial Kardex de Movimientos
          </button>
        </div>

        {subVista !== 'kardex' && (
          <div className="d-flex gap-2">
            <button
              className={`btn fw-semibold ${soloBajoStock ? 'btn-warning' : 'btn-outline-warning'}`}
              onClick={() => setSoloBajoStock(!soloBajoStock)}
            >
              ⚠️ Filtrar Productos Bajos en Inventario
            </button>
            <input
              type="text"
              className="form-control"
              style={{ width: '260px' }}
              placeholder="Buscar por código o nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        )}
      </div>

      {subVista === 'kardex' ? (
        <div className="card shadow-sm border-0">
          <div className="card-header fw-bold">Bitácora de Entradas, Ventas, Mermas y Ajustes</div>
          <div className="table-responsive" style={{ maxHeight: '65vh' }}>
            <table className="table table-hover align-middle mb-0">
              <thead className="table-dark">
                <tr>
                  <th>Fecha / Hora</th>
                  <th>Producto</th>
                  <th>Cajero / Usuario</th>
                  <th>Tipo</th>
                  <th className="text-center">Anterior</th>
                  <th className="text-center">Cantidad</th>
                  <th className="text-center">Nuevo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {kardex.map((k) => (
                  <tr key={k.id}>
                    <td className="small">{new Date(k.created_at).toLocaleString()}</td>
                    <td className="fw-semibold">{k.producto?.nombre}</td>
                    <td>{k.usuario?.nombre}</td>
                    <td>
                      <span className="badge bg-secondary text-uppercase">{k.tipo}</span>
                    </td>
                    <td className="text-center">{k.stock_anterior}</td>
                    <td className={`text-center fw-bold ${k.cantidad >= 0 ? 'text-success' : 'text-danger'}`}>
                      {k.cantidad > 0 ? `+${k.cantidad}` : k.cantidad}
                    </td>
                    <td className="text-center fw-bold">{k.stock_nuevo}</td>
                    <td className="small text-muted">{k.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {/* Formulario de Creación/Edición de Producto y Departamentos */}
          <div className="col-lg-4">
            <div className="card shadow-sm border-0 mb-3">
              <div className="card-header bg-primary text-white fw-bold">
                {editandoId ? '✏️ Modificar Producto' : '➕ Nuevo Producto'}
              </div>
              <form className="card-body" onSubmit={guardarProducto}>
                <div className="mb-2">
                  <label className="form-label fw-semibold">Código de Barras o Código Corto</label>
                  <div className="input-group">
                    <input
                      className="form-control fw-bold"
                      value={codigoBarras}
                      onChange={(e) => setCodigoBarras(e.target.value)}
                      placeholder="Escanee o use botón 01-99"
                      required
                    />
                    <button type="button" className="btn btn-warning fw-semibold" onClick={pedirCodigoCorto}>
                      ⚡ Sugerir 01-99
                    </button>
                  </div>
                </div>

                <div className="mb-2">
                  <label className="form-label fw-semibold">Nombre / Descripción</label>
                  <input className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                </div>

                <div className="mb-2">
                  <label className="form-label fw-semibold">Departamento / Proveedor</label>
                  <select className="form-select" value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
                    {departamentos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label fw-semibold">Precio Costo (₡)</label>
                    <input type="number" min="0" className="form-control" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} required />
                  </div>
                  <div className="col-6">
                    <label className="form-label fw-semibold">Precio Venta (₡)</label>
                    <input type="number" min="1" className="form-control fw-bold text-success" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} required />
                  </div>
                </div>

                <div className="form-check form-switch mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="switchStock"
                    checked={controlarStock}
                    onChange={(e) => setControlarStock(e.target.checked)}
                  />
                  <label className="form-check-label fw-semibold" htmlFor="switchStock">
                    Controlar Stock Estricto (Desactivar para Pan con Stock Infinito ∞)
                  </label>
                </div>

                {controlarStock && (
                  <div className="row g-2 mb-2 bg-body-secondary p-2 rounded">
                    {!editandoId && (
                      <div className="col-6">
                        <label className="form-label small fw-bold">Existencia Inicial</label>
                        <input type="number" className="form-control form-control-sm" value={stockActual} onChange={(e) => setStockActual(e.target.value)} />
                      </div>
                    )}
                    <div className="col-6">
                      <label className="form-label small fw-bold">Mínimo Alerta</label>
                      <input type="number" className="form-control form-control-sm" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="form-check form-switch mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="switchRapido"
                    checked={botonRapido}
                    onChange={(e) => setBotonRapido(e.target.checked)}
                  />
                  <label className="form-check-label fw-semibold" htmlFor="switchRapido">
                    Mostrar en Panel de Botones Rápidos en Caja
                  </label>
                </div>

                <div className="d-flex gap-2">
                  {editandoId && (
                    <button type="button" className="btn btn-secondary" onClick={limpiarFormulario}>
                      Cancelar
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary flex-grow-1 fw-bold">
                    {editandoId ? 'Guardar Cambios' : 'Guardar Producto'}
                  </button>
                </div>
              </form>
            </div>

            {/* Crear Departamento Rápido */}
            <form className="card shadow-sm border-0 p-3" onSubmit={crearDepartamento}>
              <label className="form-label fw-bold small">Crear Nuevo Departamento / Proveedor</label>
              <div className="input-group input-group-sm">
                <input
                  className="form-control"
                  placeholder="Ej: Bimbo / Dos Pinos"
                  value={nuevoDep}
                  onChange={(e) => setNuevoDep(e.target.value)}
                />
                <button className="btn btn-outline-primary fw-bold" type="submit">+ Crear</button>
              </div>
            </form>
          </div>

          {/* Tabla de Productos e Inventario */}
          <div className="col-lg-8">
            <div className="card shadow-sm border-0">
              <div className="table-responsive" style={{ maxHeight: '72vh' }}>
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Departamento</th>
                      <th className="text-end">Costo</th>
                      <th className="text-end">Venta</th>
                      <th className="text-center">Existencia</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaFiltrada.map((p) => (
                      <tr key={p.id}>
                        <td><span className="badge bg-secondary">{p.codigo_barras}</span></td>
                        <td>
                          <div className="fw-semibold">{p.nombre}</div>
                          {p.mostrar_boton_rapido && <span className="badge bg-warning text-dark small">Botón Rápido</span>}
                        </td>
                        <td>{p.departamento?.nombre}</td>
                        <td className="text-end text-muted">₡{Number(p.precio_compra).toLocaleString()}</td>
                        <td className="text-end fw-bold text-success">₡{Number(p.precio_venta).toLocaleString()}</td>
                        <td className="text-center">
                          {p.controlar_stock ? (
                            <span className={`badge fs-6 ${p.stock_actual <= p.stock_minimo ? 'bg-danger' : 'bg-info text-dark'}`}>
                              {p.stock_actual} (Mín: {p.stock_minimo})
                            </span>
                          ) : (
                            <span className="badge bg-success">∞ Infinito</span>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-primary" onClick={() => cargarParaEditar(p)}>
                              Editar
                            </button>
                            {p.controlar_stock && (
                              <button className="btn btn-success fw-semibold" onClick={() => setProdAjuste(p)}>
                                + Stock / Merma
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal F4 Agregar / Ajustar Inventario o Registrar Merma */}
      {prodAjuste && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content" onSubmit={registrarMovimientoStock}>
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Ajustar Inventario — {prodAjuste.nombre}</h5>
                <button type="button" className="btn-close" onClick={() => setProdAjuste(null)} />
              </div>
              <div className="modal-body">
                <p className="mb-2">Existencia actual: <strong>{prodAjuste.stock_actual}</strong></p>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Tipo de Movimiento</label>
                  <select className="form-select" value={tipoMov} onChange={(e) => setTipoMov(e.target.value as any)}>
                    <option value="entrada">Entrada de Mercadería (Suma al stock)</option>
                    <option value="merma">Merma / Producto Dañado (Resta al stock)</option>
                    <option value="ajuste">Ajuste Manual (+/-)</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Cantidad</label>
                  <input type="number" className="form-control form-control-lg fw-bold" value={cantMov} onChange={(e) => setCantMov(e.target.value)} autoFocus required />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Motivo / Factura de Proveedor</label>
                  <input className="form-control" value={motivoMov} onChange={(e) => setMotivoMov(e.target.value)} placeholder="Ej: Ingreso factura Coca-Cola" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-success w-100 fw-bold">Aplicar Movimiento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
