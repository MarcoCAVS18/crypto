// Job diario: etiqueta con resultados reales (1/5/20/60 días) las decisiones guardadas, para medir aciertos,
// calibrar y comparar contra la línea base y el modo sombra (services/metrics.js). Solo mira hacia atrás.
//
// Mismo patrón que snapshotJob: `handler()` es el punto de entrada del scheduler y `run(deps)` es testeable.

import { computeOutcome, isComplete } from '../services/outcomes.js';
import { isHourlyDecisionId } from '../services/decisionLog.js';

export const OUTCOME_SYMBOLS = ['PAXG', 'BTC'];

async function loadDefaultDeps() {
  const db = await import('../config/database.js');
  const md = await import('../services/marketData.js');
  return {
    getDecisionsBySymbol: db.getDecisionsBySymbol, getOutcomes: db.getOutcomes, saveOutcome: db.saveOutcome,
    getDailyCandles: md.getDailyCandles, now: () => Date.now()
  };
}

export async function handler() { return run(await loadDefaultDeps()); }

/** @returns {Promise<Record<string,{ labeled:number, skipped:number, error?:string }>>} */
export async function run(d) {
  const results = {};
  for (const symbol of OUTCOME_SYMBOLS) {
    try {
      const [decisions, outcomes, daily] = await Promise.all([
        d.getDecisionsBySymbol(symbol, 400, { throwOnError: true }),
        d.getOutcomes(symbol, 400),
        d.getDailyCandles(symbol, 250)
      ]);
      const done = new Set(outcomes.filter(o => o.complete).map(o => o.id));
      const now = d.now();
      let labeled = 0, skipped = 0;
      for (const dec of decisions) {
        const ts = dec.ts ?? dec.timestamp?.toMillis?.();
        if (!isHourlyDecisionId(dec.id) || done.has(dec.id) || !Number.isFinite(ts) || !(dec.price > 0)) { skipped++; continue; }
        const o = computeOutcome({ ts, price: dec.price }, daily, now);
        if (!Object.values(o).some(Boolean)) { skipped++; continue; }
        await d.saveOutcome(dec.id, {
          symbol, ts, price: dec.price, action: dec.decision ?? null, strength: dec.strength ?? null,
          marketMode: dec.marketMode ?? null, shadow: dec.shadow ?? null, dcaPolicy: dec.dcaPolicy ?? null,
          ...o, complete: isComplete(o)
        });
        labeled++;
      }
      results[symbol] = { labeled, skipped };
    } catch (err) {
      console.error(`[Outcomes] ${symbol} error:`, err.message);
      results[symbol] = { labeled: 0, skipped: 0, error: err.message };
    }
  }
  console.log('[Outcomes]', JSON.stringify(results));
  return results;
}
