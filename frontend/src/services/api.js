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

export async function requestDecision(symbol, cashPercent, mode, totalCapital = 0) {
  const response = await api.post('/crypto/decision', { symbol, cashPercent, mode, totalCapital });
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

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function fetchPortfolioOperations(symbol = null, limit = 100) {
  const params = { limit };
  if (symbol) params.symbol = symbol;
  const response = await api.get('/portfolio/operations', { params });
  return response.data;
}

export async function fetchPortfolioSummary() {
  const response = await api.get('/portfolio/summary');
  return response.data;
}

export async function createPortfolioOperation(op) {
  const response = await api.post('/portfolio/operations', op);
  return response.data;
}

export async function removePortfolioOperation(id) {
  const response = await api.delete(`/portfolio/operations/${id}`);
  return response.data;
}

export default api;
