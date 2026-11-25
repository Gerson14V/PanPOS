import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

const baseURL = import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api';
export const TOKEN_STORAGE_KEY = 'panpos_auth_token';

export const setAuthToken = (token: string | null) => {
  if (token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const getAuthToken = (): string | null => sessionStorage.getItem(TOKEN_STORAGE_KEY);

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Evento global: la sesión ya no es válida (p. ej. se inició sesión en otra ventana). */
export const EVENTO_SESION_EXPIRADA = 'panpos:sesion-expirada';
/** Evento global: el turno cambió en el servidor (cerrado o abierto desde otra ventana). */
export const EVENTO_TURNO_DESACTUALIZADO = 'panpos:turno-desactualizado';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
      setAuthToken(null);
      window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA));
    }
    const errores = error.response?.status === 422 ? error.response.data?.errors : null;
    if (errores && ('turno' in errores || 'turno_id' in errores)) {
      window.dispatchEvent(new Event(EVENTO_TURNO_DESACTUALIZADO));
    }
    return Promise.reject(error);
  }
);

/** Clave única por operación: el servidor la usa para no registrar dos veces lo mismo. */
export const generarClaveIdempotencia = (prefijo = 'op'): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefijo}-${crypto.randomUUID()}`
    : `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** True cuando la petición nunca obtuvo respuesta (servidor ocupado, caído o tiempo agotado). */
export const esErrorDeConexion = (err: unknown): boolean => {
  const e = err as AxiosError | undefined;
  return !!e && axios.isAxiosError(e) && !e.response;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST que se reintenta solo si no hubo respuesta del servidor.
 * Usar únicamente con operaciones que envían `idempotency_key`: si el primer
 * intento sí se guardó, el servidor devuelve el mismo registro en vez de duplicarlo.
 */
export async function postConReintento<T = unknown>(
  url: string,
  data: unknown,
  config: AxiosRequestConfig & { reintentos?: number } = {}
): Promise<AxiosResponse<T>> {
  const { reintentos = 2, ...axiosConfig } = config;
  let ultimoError: unknown;

  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      return await api.post<T>(url, data, axiosConfig);
    } catch (err) {
      ultimoError = err;
      if (!esErrorDeConexion(err) || intento === reintentos) break;
      await esperar(800 * (intento + 1));
    }
  }

  throw ultimoError;
}

/** Convierte cualquier error de la API en un mensaje claro para la caja. */
export const mensajeError = (err: unknown, porDefecto = 'No se pudo completar la operación.'): string => {
  if (esErrorDeConexion(err)) {
    const e = err as AxiosError;
    return e.code === 'ECONNABORTED'
      ? 'El servidor tardó demasiado en responder. Revise si la operación quedó registrada antes de repetirla.'
      : 'No hay conexión con el servidor de PanPOS. Verifique que el sistema esté abierto e intente de nuevo.';
  }

  const respuesta = (err as AxiosError<{ message?: string; errors?: Record<string, string[]> }>)?.response;
  const status = respuesta?.status;

  if (status === 401) return 'La sesión se cerró (se ingresó con este usuario en otra ventana). Vuelva a ingresar.';
  if (status === 403) return 'Su usuario no tiene permiso para realizar esta acción.';
  if (status === 429) return 'Demasiados intentos seguidos. Espere un minuto e intente de nuevo.';
  if (status && status >= 500) return `${porDefecto} (error interno del servidor; revise php_error.log)`;

  const data = respuesta?.data;
  const primerError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined;
  return primerError || data?.message || porDefecto;
};
