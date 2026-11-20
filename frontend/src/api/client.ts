import axios from 'axios';

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
  timeout: 15000,
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setAuthToken(null);
    }
    return Promise.reject(error);
  }
);
