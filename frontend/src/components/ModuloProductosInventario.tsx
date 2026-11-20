import React, { useState, useEffect } from 'react';
import { usePos } from '../context/PosContext';
import { api } from '../api/client';
import { Producto } from '../types/models';

export const ModuloProductosInventario: React.FC = () => {
  const { productos, departamentos, usuario, configuracion, recargarCatalogos } = usePos();
  const [busqueda, setBusqueda] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState<string>('');
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'danger'; texto: string } | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [nombre, setNombre] = useState('');
  const [departamentoId, setDepartamentoId] = useState<string>('');
  const [precioCompra, setPrecioCompra] = useState('0');
  const [precioVenta, setPrecioVenta] = useState('');
  const [controlarStock, setControlarStock] = useState(false);
  const [stockActual, setStockActual] = useState('0');
  const [botonRapido, setBotonRapido] = useState(false);

  const [prodAjuste, setProdAjuste] = useState<Producto | null>(null);
  const [tipoMov, setTipoMov] = useState<'entrada' | 'ajuste' | 'merma'>('entrada');
  const [cantMov, setCantMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');

  const [modalKardex, setModalKardex] = useState(false);
  const [kardex, setKardex] = useState<any[]>([]);
  const kardexHabilitado = (configuracion['habilitar_bitacora_kardex'] ?? '0') === '1';

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
    if (!departamentoId) {
      alert('Debe seleccionar un proveedor existente.');
      return;
    }

    const payload = {
      departamento_id: Number(departamentoId),
      codigo_barras: codigoBarras,
      nombre,
      precio_compra: Number(precioCompra),
      precio_venta: Number(precioVenta),
      controlar_stock: controlarStock,
      stock_actual: Number(stockActual),
      stock_minimo: 0,
      mostrar_boton_rapido: botonRapido,
      usuario_id: usuario?.id,
    };

    try {
      if (editandoId) {
        await api.put(`/productos/${editandoId}`, payload);
        setMensaje({ tipo: 'success', texto: 'Producto actualizado correctamente.' });
      } else {
        await api.post('/productos', payload);
        setMensaje({ tipo: 'success', texto: 'Producto creado y asociado al proveedor.' });
      }
      limpiarFormulario();
      await recargarCatalogos();
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'Error al guardar el producto.' });
    }
  };

  const eliminarProducto = async (p: Producto) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar el producto "${p.nombre}"?`)) return;
    try {
      await api.delete(`/productos/${p.id}`);
      if (editandoId === p.id) limpiarFormulario();
      await recargarCatalogos();
      setMensaje({ tipo: 'success', texto: `Producto "${p.nombre}" eliminado del catálogo.` });
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'No se pudo eliminar el producto.' });
    }
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

  const registrarMovimientoStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodAjuste || !usuario) return;
    try {
      await api.post(`/productos/${prodAjuste.id}/stock`, {
        usuario_id: usuario.id,
        tipo: tipoMov,
        cantidad: Number(cantMov),
        motivo: motivoMov || 'Actualización de inventario',
      });
      setProdAjuste(null);
      setCantMov('');
      setMotivoMov('');
      await recargarCatalogos();
      setMensaje({ tipo: 'success', texto: 'Existencia de inventario actualizada.' });
    } catch (err: any) {
      setMensaje({ tipo: 'danger', texto: err.response?.data?.message || 'No se pudo actualizar el inventario.' });
      setProdAjuste(null);
    }
  };

  const abrirModalKardex = async () => {
    const res = await api.get('/inventario/movimientos');
    setKardex(res.data);
    setModalKardex(true);
  };

  const listaFiltrada = productos.filter((p) => {
    if (soloBajoStock && (!p.controlar_stock || p.stock_actual > p.stock_minimo)) return false;
    if (filtroProveedor && String(p.departamento_id) !== filtroProveedor) return false;
    return (
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo_barras.toLowerCase().includes(busqueda.toLowerCase())
    );
  });

  return (
    <div className="container-fluid py-3">
      {mensaje && (
        <div className={`alert alert-${mensaje.tipo} alert-dismissible fade show py-2`}>
          {mensaje.texto}
          <button type="button" className="btn-close py-2" onClick={() => setMensaje(null)} />
        </div>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h4 className="fw-bold mb-0">F3 — Productos / Inventario Unificado</h4>
          <small className="text-muted">
            Gestione precios, códigos cortos (01-99), proveedores asociados y existencias en un solo lugar.
          </small>
        </div>

        <div className="d-flex flex-wrap gap-2">
          {kardexHabilitado && usuario?.rol === 'admin' && (
            <button className="btn btn-outline-secondary fw-semibold" onClick={abrirModalKardex}>
              🔍 Auditoría de Stock
            </button>
          )}
          <button
            className={`btn fw-semibold ${soloBajoStock ? 'btn-warning' : 'btn-outline-warning'}`}
            onClick={() => setSoloBajoStock(!soloBajoStock)}
          >
            ⚠️ {soloBajoStock ? 'Viendo Solo Bajo Stock' : 'Filtrar Bajo Stock'}
          </button>
          <select
            className="form-select"
            style={{ width: '200px' }}
            value={filtroProveedor}
            onChange={(e) => setFiltroProveedor(e.target.value)}
          >
            <option value="">Todos los Proveedores</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
          <input
            type="text"
            className="form-control"
            style={{ width: '250px' }}
            placeholder="Buscar código o producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-primary text-white fw-bold">
              {editandoId ? '✏️ Modificar Producto' : '➕ Registrar Nuevo Producto'}
            </div>
            <form className="card-body" onSubmit={guardarProducto}>
              <div className="mb-2">
                <label className="form-label fw-semibold">Código de Barras o Código Corto</label>
                <div className="input-group">
                  <input
                    className="form-control fw-bold"
                    value={codigoBarras}
                    onChange={(e) => setCodigoBarras(e.target.value)}
                    placeholder="Escanee o sugiera 01-99"
                    required
                  />
                  <button type="button" className="btn btn-warning fw-semibold" onClick={pedirCodigoCorto}>
                    ⚡ Sugerir 01-99
                  </button>
                </div>
              </div>

              <div className="mb-2">
                <label className="form-label fw-semibold">Nombre del Producto</label>
                <input className="form-control" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </div>

              <div className="mb-2">
                <label className="form-label fw-semibold">Proveedor Asociado (Existente)</label>
                <select
                  className="form-select fw-semibold"
                  value={departamentoId}
                  onChange={(e) => setDepartamentoId(e.target.value)}
                  required
                >
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
                <small className="text-muted">
                  * Para agregar un proveedor nuevo, créelo en la pestaña <strong>F4 Proveedores</strong>.
                </small>
              </div>

              <div className="row g-2 mb-2 mt-1">
                <div className="col-6">
                  <label className="form-label fw-semibold">Precio Costo (₡)</label>
                  <input type="number" min="0" step="any" className="form-control" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} required />
                </div>
                <div className="col-6">
                  <label className="form-label fw-semibold">Precio Venta (₡)</label>
                  <input type="number" min="1" step="any" className="form-control fw-bold text-success" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} required />
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
                  Controlar Existencia de Inventario (Desactivar para Pan Infinito ∞)
                </label>
              </div>

              {controlarStock && (
                <div className="row g-2 mb-2 bg-body-secondary p-2 rounded">
                  {!editandoId && (
                    <div className="col-6">
                      <label className="form-label small fw-bold">Stock Inicial</label>
                      <input type="number" min="0" className="form-control form-control-sm" value={stockActual} onChange={(e) => setStockActual(e.target.value)} />
                    </div>
                  )}
                  <div className="col-6">
                    <label className="form-label small fw-bold">Alerta Mínimo</label>
                    <input type="number" min="0" className="form-control form-control-sm" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
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
                  Destacar en Panel de Botones Rápidos en Caja
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
        </div>

        <div className="col-lg-8">
          <div className="card shadow-sm border-0">
            <div className="table-responsive" style={{ maxHeight: '74vh' }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-dark">
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Proveedor</th>
                    <th className="text-end">Costo</th>
                    <th className="text-end">Venta</th>
                    <th className="text-center">Inventario</th>
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
                      <td><span className="badge bg-primary-subtle text-primary-emphasis">{p.departamento?.nombre}</span></td>
                      <td className="text-end text-muted">₡{Number(p.precio_compra).toLocaleString()}</td>
                      <td className="text-end fw-bold text-success">₡{Number(p.precio_venta).toLocaleString()}</td>
                      <td className="text-center">
                        {p.controlar_stock ? (
                          <span className={`badge fs-6 ${p.stock_actual <= 0 ? 'bg-danger' : 'bg-info text-dark'}`}>
                            {p.stock_actual} u.
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
                              +/- Stock
                            </button>
                          )}
                          <button className="btn btn-outline-danger" onClick={() => eliminarProducto(p)}>
                            Eliminar
                          </button>
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

      {prodAjuste && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content" onSubmit={registrarMovimientoStock}>
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Actualizar Stock — {prodAjuste.nombre}</h5>
                <button type="button" className="btn-close" onClick={() => setProdAjuste(null)} />
              </div>
              <div className="modal-body">
                <p className="mb-2">Existencia actual: <strong>{prodAjuste.stock_actual} unidades</strong></p>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Operación</label>
                  <select className="form-select" value={tipoMov} onChange={(e) => setTipoMov(e.target.value as any)}>
                    <option value="entrada">Entrada de Proveedor (Suma al inventario)</option>
                    <option value="merma">Merma / Producto Dañado (Resta al inventario)</option>
                    <option value="ajuste">Ajuste Manual (+/-)</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Cantidad de Unidades</label>
                  <input type="number" className="form-control form-control-lg fw-bold" value={cantMov} onChange={(e) => setCantMov(e.target.value)} autoFocus required />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Observación (Opcional)</label>
                  <input className="form-control" value={motivoMov} onChange={(e) => setMotivoMov(e.target.value)} placeholder="Ej: Pedido entregado por camión repartidor" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-success w-100 fw-bold">Guardar Existencia</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalKardex && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Auditoría Interna de Cambios de Stock</h5>
                <button type="button" className="btn-close" onClick={() => setModalKardex(false)} />
              </div>
              <div className="modal-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-dark">
                    <tr>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Usuario</th>
                      <th>Tipo</th>
                      <th>Anterior</th>
                      <th>Cambio</th>
                      <th>Nuevo</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex.map((k) => (
                      <tr key={k.id}>
                        <td>{new Date(k.created_at).toLocaleString()}</td>
                        <td className="fw-semibold">{k.producto?.nombre}</td>
                        <td>{k.usuario?.nombre}</td>
                        <td><span className="badge bg-secondary">{k.tipo}</span></td>
                        <td>{k.stock_anterior}</td>
                        <td className={k.cantidad >= 0 ? 'text-success fw-bold' : 'text-danger fw-bold'}>
                          {k.cantidad > 0 ? `+${k.cantidad}` : k.cantidad}
                        </td>
                        <td className="fw-bold">{k.stock_nuevo}</td>
                        <td className="small text-muted">{k.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
