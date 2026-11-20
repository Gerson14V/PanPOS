import axios from 'axios';

const baseURL = import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});
