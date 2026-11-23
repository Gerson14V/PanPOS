import React, { useEffect } from 'react';

export interface Aviso {
  tipo: 'success' | 'danger' | 'warning' | 'info';
  texto: string;
  /** Botón opcional dentro del aviso (p. ej. "Imprimir tiquete") */
  accion?: { etiqueta: React.ReactNode; alHacerClic: () => void };
}

const ICONOS: Record<Aviso['tipo'], string> = {
  success: 'bi-check-circle-fill',
  danger: 'bi-x-octagon-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
};

// Los éxitos desaparecen solos; los errores quedan más tiempo para que se lean
const DURACION_MS: Record<Aviso['tipo'], number> = {
  success: 6000,
  info: 6000,
  warning: 9000,
  danger: 15000,
};

/**
 * Aviso flotante sobre la pantalla de caja: no desplaza la tabla de venta
 * (las alertas normales empujaban todo hacia abajo en cada cobro).
 */
export const AvisoFlotante: React.FC<{ aviso: Aviso | null; alCerrar: () => void }> = ({ aviso, alCerrar }) => {
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(alCerrar, DURACION_MS[aviso.tipo]);
    return () => window.clearTimeout(t);
  }, [aviso, alCerrar]);

  if (!aviso) return null;

  return (
    <div className="panpos-aviso-flotante no-print" role={aviso.tipo === 'danger' ? 'alert' : 'status'} aria-live="polite">
      <div className={`alert alert-${aviso.tipo} shadow d-flex align-items-center gap-2 py-2 px-3 mb-0`}>
        <i className={`bi ${ICONOS[aviso.tipo]} fs-5 flex-shrink-0`} />
        <span className="fw-semibold flex-grow-1">{aviso.texto}</span>
        {aviso.accion && (
          <button
            type="button"
            className="btn btn-sm btn-light fw-bold flex-shrink-0"
            onClick={() => {
              aviso.accion!.alHacerClic();
              alCerrar();
            }}
          >
            {aviso.accion.etiqueta}
          </button>
        )}
        <button type="button" className="btn-close flex-shrink-0" aria-label="Cerrar" onClick={alCerrar} />
      </div>
    </div>
  );
};
