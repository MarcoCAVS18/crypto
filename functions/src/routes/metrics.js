// GET /api/metrics/:symbol — métricas reales de las señales (P4): aciertos por acción y horizonte contra la línea
// base, por intensidad, seguimiento del usuario y campeón vs modo sombra. Lee resultados ya etiquetados por outcomeJob.
import express from 'express';
import { getOutcomes, getOperationsForSymbol } from '../config/database.js';
import { getDailyCandles } from '../services/marketData.js';
import { baselineReturns, HORIZON_DAYS } from '../services/outcomes.js';
import { summarizeOutcomes, byStrength, followStats, compareShadow } from '../services/metrics.js';

const router = express.Router();
const isValidSymbol = s => /^[A-Z0-9]{2,10}$/.test(s);

router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!isValidSymbol(symbol)) return res.status(400).json({ error: 'Símbolo no válido' });
  try {
    const records = await getOutcomes(symbol, 300);
    let daily = [];
    try { daily = await getDailyCandles(symbol, 250); } catch (e) { console.warn('[Metrics] sin velas para la línea base:', e.message); }
    const baselines = Object.fromEntries(HORIZON_DAYS.map(h => [h, baselineReturns(daily, h)]));
    let operations = [];
    try { operations = await getOperationsForSymbol(symbol, req.query.userId || null); } catch (e) { console.warn('[Metrics] sin operaciones:', e.message); }

    res.set('Cache-Control', 'no-store');
    res.json({
      symbol, records: records.length, complete: records.filter(r => r.complete).length,
      baselines,
      summary: summarizeOutcomes(records, baselines),
      byStrength: byStrength(records, 20),
      follow: followStats(records, operations),
      shadow: compareShadow(records, 20),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Metrics] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
