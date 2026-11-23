import React, { useEffect, useState } from 'react';

interface BotonAccionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Mientras es true el botón se bloquea y muestra un indicador de progreso. */
  cargando?: boolean;
  /** Texto que reemplaza al contenido mientras carga. */
  textoCargando?: React.ReactNode;
  /** Texto que se muestra si la operación tarda más de unos segundos. */
  textoLento?: React.ReactNode;
}

const MS_PARA_AVISO_LENTO = 4000;

/**
 * Botón para acciones pesadas (cobrar, salidas, cierres): evita el doble clic,
 * da respuesta visual inmediata y avisa si el servidor está tardando.
 */
export const BotonAccion: React.FC<BotonAccionProps> = ({
  cargando = false,
  textoCargando,
  textoLento = 'Sigue procesando, por favor espere...',
  disabled,
  className = '',
  children,
  ...resto
}) => {
  const [lento, setLento] = useState(false);

  useEffect(() => {
    if (!cargando) return;
    const t = window.setTimeout(() => setLento(true), MS_PARA_AVISO_LENTO);
    return () => {
      window.clearTimeout(t);
      setLento(false);
    };
  }, [cargando]);

  return (
    <button
      {...resto}
      className={`${className} btn-accion-pesada${cargando ? ' is-cargando' : ''}`}
      disabled={disabled || cargando}
      aria-busy={cargando}
    >
      {cargando ? (
        <span className="d-inline-flex align-items-center justify-content-center gap-2">
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          <span>{lento ? textoLento : textoCargando ?? children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
