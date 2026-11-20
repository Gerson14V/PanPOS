import React from 'react';

interface State {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error?.message || 'Error inesperado en la interfaz.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('PanPOS ErrorBoundary capturó un error:', error, info);
  }

  recargarLimpio = () => {
    localStorage.removeItem('panpos_carrito_respaldo');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="container vh-100 d-flex align-items-center justify-content-center">
          <div className="card shadow p-4 text-center" style={{ maxWidth: '480px' }}>
            <h4 className="fw-bold text-danger mb-2">⚠️ Se detectó un error en pantalla</h4>
            <p className="text-muted small mb-3">
              Sus ventas ya cobradas están seguras en la base de datos. Puede recargar la caja para continuar.
            </p>
            <div className="alert alert-light border small text-start mb-3">
              <code>{this.state.errorMsg}</code>
            </div>
            <div className="d-flex gap-2 justify-content-center">
              <button className="btn btn-primary fw-bold" onClick={() => window.location.reload()}>
                🔄 Recargar Caja
              </button>
              <button className="btn btn-outline-danger fw-bold" onClick={this.recargarLimpio}>
                🧹 Limpiar Carrito y Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
