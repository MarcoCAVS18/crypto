// Portfolio del usuario. Antes el navegador leía/escribía Firestore directo (con reglas abiertas); ahora todo pasa por
// acá con sesión: cada usuario solo ve y toca lo suyo, y las reglas de Firestore pueden cerrarse por completo.
import express from 'express';
import { requireSession } from '../middleware/session.js';
import { listUserOperations, addUserOperation, deleteUserOperation } from '../config/database.js';

const router = express.Router();
router.use(requireSession);

const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const num = (x) => (typeof x === 'number' ? x : Number(x));

/** Valida y normaliza una operación; devuelve { op } o { error }. */
export function parseOperation(body, userId) {
  const b = body ?? {};
  const symbol = String(b.symbol ?? '').toUpperCase();
  const type = String(b.type ?? '').toUpperCase();
  const amount_usd = num(b.amount_usd), price = num(b.price), units = num(b.units), fee = b.fee == null || b.fee === '' ? 0 : num(b.fee);
  if (!SYMBOL_RE.test(symbol)) return { error: 'Símbolo inválido.' };
  if (!['BUY', 'SELL'].includes(type)) return { error: 'Tipo inválido (BUY o SELL).' };
  if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) return { error: 'Fecha inválida (AAAA-MM-DD).' };
  for (const [name, v, max] of [['monto', amount_usd, 1e9], ['precio', price, 1e9], ['unidades', units, 1e12], ['comisión', fee, 1e9]]) {
    if (!Number.isFinite(v) || v < 0 || v > max) return { error: `Valor inválido en ${name}.` };
  }
  if (!(price > 0) || !(units > 0)) return { error: 'Precio y unidades deben ser mayores que 0.' };
  // Coherencia: monto ≈ unidades × precio. Una operación que no cuadra deforma el costo promedio y el P&L de todo el activo.
  const expected = units * price;
  if (Math.abs(amount_usd - expected) > Math.max(1, expected * 0.05)) {
    const f = (n) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return { error: `El monto (${f(amount_usd)}) no coincide con unidades × precio (${f(expected)}). Revisá los tres campos.` };
  }
  const exchange = String(b.exchange ?? 'Binance').slice(0, 50);
  const notes = String(b.notes ?? '').slice(0, 500);
  return { op: { date: b.date.slice(0, 32), symbol, type, amount_usd, price, units, fee, exchange, notes, userId } };
}

router.get('/operations', async (req, res) => {
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 500));
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (symbol && !SYMBOL_RE.test(symbol)) return res.status(400).json({ error: 'Símbolo inválido.' });
  try {
    const operations = await listUserOperations(req.userId, { symbol, limit });
    res.json({ operations, count: operations.length });
  } catch (err) {
    console.error('[Portfolio] list:', err.message);
    res.status(500).json({ error: 'No se pudieron leer las operaciones.' });
  }
});

router.post('/operations', async (req, res) => {
  const parsed = parseOperation(req.body, req.userId);      // el userId SIEMPRE sale de la sesión, nunca del body
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const id = await addUserOperation(parsed.op);
    res.status(201).json({ id });
  } catch (err) {
    console.error('[Portfolio] add:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la operación.' });
  }
});

router.delete('/operations/:id', async (req, res) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(req.params.id)) return res.status(400).json({ error: 'Id inválido.' });
  try {
    const r = await deleteUserOperation(req.userId, req.params.id);
    if (r === 'not_found') return res.status(404).json({ error: 'Operación no encontrada.' });
    if (r === 'forbidden') return res.status(403).json({ error: 'Esa operación no es tuya.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Portfolio] delete:', err.message);
    res.status(500).json({ error: 'No se pudo borrar la operación.' });
  }
});

export default router;
