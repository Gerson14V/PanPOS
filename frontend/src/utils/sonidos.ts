// Sonidos cortos de caja generados con Web Audio (sin archivos, funcionan sin internet).
// Confirman al cajero que el producto entró aunque no esté mirando la pantalla.

let contexto: AudioContext | null = null;

const obtenerContexto = (): AudioContext | null => {
  try {
    if (!contexto) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      contexto = new Ctor();
    }
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  } catch {
    return null;
  }
};

const tono = (frecuencia: number, duracionMs: number, inicioMs = 0, volumen = 0.08) => {
  const ctx = obtenerContexto();
  if (!ctx) return;
  const inicio = ctx.currentTime + inicioMs / 1000;
  const osc = ctx.createOscillator();
  const ganancia = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frecuencia;
  ganancia.gain.setValueAtTime(volumen, inicio);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracionMs / 1000);
  osc.connect(ganancia).connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + duracionMs / 1000 + 0.02);
};

export const sonidos = {
  /** Producto agregado al ticket */
  agregado: () => tono(1320, 70),
  /** Producto no encontrado o sin existencias */
  error: () => {
    tono(330, 140, 0, 0.1);
    tono(260, 180, 160, 0.1);
  },
  /** Venta registrada */
  cobrado: () => {
    tono(880, 90);
    tono(1175, 120, 100);
  },
};

export const sonidosActivos = (configuracion: Record<string, string>) =>
  (configuracion['sonidos_caja'] ?? '1') === '1';
