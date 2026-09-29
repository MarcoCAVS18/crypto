// Cliente HTTP para comunicación con el backend
import axios from 'axios';
import { looksLikeHtml, describeApiError, HTML_INSTEAD_OF_API } from '../utils/apiErrors';

const API_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  (response) => {
    // Un 200 con HTML = el sitio no tiene proxy hacia la API (devuelve su index.html)
    if (looksLikeHtml(response.data)) return Promise.reject(Object.assign(new Error(HTML_INSTEAD_OF_API), { response }));
    return response;
  },
  (error) => {
    const message = describeApiError(error);
    console.error('API Error:', message);
    return Promise.reject(Object.assign(new Error(message), { response: error.response, status: error.response?.status }));
  }
);

export async function fetchCryptoData(symbol, timeframe = '4h') {
  const response = await api.get(`/crypto/${symbol}`, { params: { timeframe } });
  return response.data;
}

export async function requestDecision(symbol, cashPercent, mode, totalCapital = 0, portfolioContext = null) {
  const response = await api.post('/crypto/decision', {
    symbol, cashPercent, mode, totalCapital, portfolioContext
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

export async function fetchFuturesData(symbol = 'xauusdt', maxLeverage = 10, portfolioContext = null, forceRefresh = false) {
  const response = await api.post(`/futures/${symbol}`, {
    leverage: maxLeverage,
    refresh: forceRefresh,
    portfolioContext,
  });
  return response.data;
}

export default api;
