// Cliente HTTP para comunicación con el backend
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Error de conexión';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
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

export async function fetchCandles(symbol, granularity = '1d', count = 120) {
  const response = await api.get(`/crypto/${symbol}/candles`, { params: { granularity, count } });
  return response.data;
}

export async function fetchDecisions(symbol, limit = 100) {
  const response = await api.get(`/crypto/${symbol}/decisions`, { params: { limit } });
  return response.data;
}

export default api;
