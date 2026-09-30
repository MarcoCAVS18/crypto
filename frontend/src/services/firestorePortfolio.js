// Portfolio del usuario. Nombre histórico: ya NO usa Firestore desde el navegador; todo va por la API con sesión
// (/api/portfolio/operations), que solo devuelve y borra lo del usuario autenticado.
import api from './api';

export async function fsAddOperation(op) {
  const { data } = await api.post('/portfolio/operations', {
    date: op.date, symbol: op.symbol, type: op.type,
    amount_usd: Number(op.amount_usd), price: Number(op.price), units: Number(op.units),
    fee: Number(op.fee) || 0, exchange: op.exchange || 'Binance', notes: op.notes || ''
  });
  return data.id;
}

export async function fsGetOperations(symbolFilter = null, _userId = null, limitCount = 500) {
  const params = { limit: limitCount };
  if (symbolFilter) params.symbol = symbolFilter;
  const { data } = await api.get('/portfolio/operations', { params });
  return data.operations;
}

export async function fsDeleteOperation(id) {
  await api.delete(`/portfolio/operations/${encodeURIComponent(id)}`);
}
