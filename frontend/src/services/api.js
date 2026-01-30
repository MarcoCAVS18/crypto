// Cliente HTTP para comunicación con el backend
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60 seg para cuando Render despierta
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Error de conexión';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// Obtiene datos de un crypto específico
export async function fetchCryptoData(symbol, timeframe = '4h') {
  const response = await api.get(`/crypto/${symbol}`, {
    params: { timeframe }
  });
  return response.data;
}

// Solicita una decisión basada en el estado del usuario
export async function requestDecision(symbol, cashPercent, mode) {
  const response = await api.post('/crypto/decision', {
    symbol,
    cashPercent,
    mode
  });
  return response.data;
}

// Obtiene el historial de decisiones
export async function fetchHistory(limit = 20) {
  const response = await api.get('/history', {
    params: { limit }
  });
  return response.data;
}

// Health check del servidor
export async function checkHealth() {
  const response = await api.get('/health');
  return response.data;
}

export default api;
