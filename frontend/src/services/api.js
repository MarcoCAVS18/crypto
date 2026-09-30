// Cliente HTTP para comunicación con el backend
import axios from 'axios';
import { looksLikeHtml, describeApiError, HTML_INSTEAD_OF_API } from '../utils/apiErrors';
import { getToken, clearToken } from './session';
import { useAuthStore } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
});

// Sesión: cada pedido lleva el token del servidor si hay uno
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Un 200 con HTML = el sitio no tiene proxy hacia la API (devuelve su index.html)
    if (looksLikeHtml(response.data)) return Promise.reject(Object.assign(new Error(HTML_INSTEAD_OF_API), { response }));
    return response;
  },
  (error) => {
    // Sesión vencida o revocada: se cierra la sesión local y la app vuelve a pedir el PIN
    if (error.response?.status === 401 && error.response?.data?.code === 'SESSION') {
      clearToken();
      useAuthStore.getState().logout();
    }
    const message = describeApiError(error);
    console.error('API Error:', message);
    return Promise.reject(Object.assign(new Error(message), {
      response: error.response, status: error.response?.status
    }));
  }
);

export async function fetchCryptoData(symbol, timeframe = '4h') {
  const response = await api.get(`/crypto/${symbol}`, { params: { timeframe } });
  return response.data;
}

export async function requestDecision(symbol, cashPercent, mode, totalCapital = 0, portfolioContext = null, settings = {}) {
  const response = await api.post('/crypto/decision', {
    symbol, cashPercent, mode, totalCapital, portfolioContext, settings
  });
  return response.data;
}

export async function fetchHistory(limit = 20) {
  const response = await api.get('/history', { params: { limit } });
  return response.data;
}

export async function checkHealth() {
  const response = await api.get('/health');
  return response.data;
}

export async function refreshGoldContext() {
  const response = await api.post('/gold-context/refresh');
  return response.data;
}

export async function refreshCryptoNews(symbol) {
  const response = await api.post(`/crypto/${symbol}/news/refresh`);
  return response.data;
}

export async function fetchCandles(symbol, granularity = '1d', count = 120) {
  const response = await api.get(`/crypto/${symbol}/candles`, { params: { granularity, count } });
  return response.data;
}

// Calendario macro (fuente única en el backend)
export async function fetchUpcomingEvents(days = 21, symbol = null) {
  const response = await api.get('/calendar', { params: { days, symbol } });
  return response.data;
}

export async function fetchDecisions(symbol, limit = 100) {
  const response = await api.get(`/crypto/${symbol}/decisions`, { params: { limit } });
  return response.data;
}

export async function fetchMetrics(symbol) {
  const response = await api.get(`/metrics/${symbol}`);
  return response.data;
}

export async function fetchFuturesData(symbol = 'xauusdt', maxLeverage = 10, portfolioContext = null, forceRefresh = false) {
  const response = await api.post(`/futures/${symbol}`, {
    leverage: maxLeverage,
    refresh: forceRefresh,
    portfolioContext,
  });
  return response.data;
}

export default api;
