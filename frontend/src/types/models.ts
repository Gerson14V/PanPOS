export interface Usuario {
  id: number;
  nombre: string;
  username: string;
  rol: 'admin' | 'cajero';
  activo: boolean;
  tema_preferido: 'light' | 'dark';
}

export interface Departamento {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Producto {
  id: number;
  departamento_id: number;
  departamento?: Departamento;
  codigo_barras: string;
  nombre: string;
  precio_compra: number;
  precio_venta: number;
  controlar_stock: boolean;
  stock_actual: number;
  stock_minimo: number;
  mostrar_boton_rapido: boolean;
  activo: boolean;
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono?: string | null;
  notas?: string | null;
  saldo_deudor: number;
  activo: boolean;
}

export interface TurnoCaja {
  id: number;
  usuario_id: number;
  usuario?: Usuario;
  fecha_apertura: string;
  fecha_cierre?: string | null;
  estado: 'abierto' | 'cerrado';
  monto_inicial: number;
  total_efectivo_esperado?: number | null;
  total_efectivo_contado?: number | null;
  diferencia_arqueo?: number | null;
}

export interface ItemCarrito {
  uid: string;
  producto_id: number | null;
  codigo_barras: string;
  descripcion_producto: string;
  precio_unitario: number;
  cantidad: number;
  subtotal: number;
  stock_actual?: number;
  controlar_stock?: boolean;
}

export interface PagoItem {
  metodo_pago: 'efectivo' | 'tarjeta' | 'sinpe' | 'credito';
  monto: number;
  monto_recibido?: number;
  vuelto_entregado?: number;
}

/** Existencia actualizada que el servidor devuelve después de una venta o anulación. */
export interface StockActualizado {
  id: number;
  stock_actual: number;
}

export interface ClienteActualizado {
  id: number;
  saldo_deudor: number;
}

export interface RespuestaVenta {
  id: number;
  numero_ticket: number;
  numero_dia?: number | null;
  total: number;
  estado: 'completada' | 'en_espera' | 'anulada';
  motivo_anulacion?: string | null;
  productos_actualizados?: StockActualizado[];
  cliente_actualizado?: ClienteActualizado | null;
}
