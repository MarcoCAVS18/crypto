// Scheduled function — una vez por hora guarda un snapshot de mercado de PAXG y BTC con todas las
// features de la señal (ver services/snapshot.js). Es la base para medir aciertos y calibrar (P2/P4).
//
// Patrón igual a zoneWatcher: `handler()` es el punto de entrada del scheduler (onSchedule le pasa el
// evento como 1er argumento, por eso no acepta dependencias) y `run(deps)` es testeable.

import { getCryptoData } from '../services/marketData.js';
import { calculateAllIndicators, analyzeVolume } from '../services/technicalAnalysis.js';
import { calculateZones } from '../services/zoneCalculator.js';
import { determineMarketMode } from '../services/marketMode.js';
import { determineGoldMarketMode } from '../services/goldMarketMode.js';
import { buildSnapshot } from '../services/snapshot.js';

export const SNAPSHOT_SYMBOLS = ['PAXG', 'BTC'];

async function loadDefaultDeps() {
  const db   = await import('../config/database.js');
  const gold = await import('../services/goldContext.js');
  return {
    getCryptoData, calculateAllIndicators, analyzeVolume, calculateZones,
    determineMarketMode, determineGoldMarketMode,
    getGoldContext: gold.getGoldContext,
    saveSnapshot: db.saveSnapshot,
    now: () => Date.now()
  };
}

export async function handler() {
  return run(await loadDefaultDeps());
}

/**
 * @param {object} d - dependencias (reales en producción, falsas en tests)
 * @returns {Promise<Record<string, 'saved'|'exists'|'skipped'|'error'>>} resultado por símbolo
 */
export async function run(d) {
  const results = {};

  for (const symbol of SNAPSHOT_SYMBOLS) {
    try {
      const marketData = await d.getCryptoData(symbol);
      if (!marketData?.price) { results[symbol] = 'skipped'; continue; }
      // Con velas sintéticas las features son ruido: no se guardan
      if (marketData.candlesSource === 'synthetic') {
        console.warn(`[Snapshot] ${symbol}: velas sintéticas, se omite`);
        results[symbol] = 'skipped';
        continue;
      }

      const indicators = d.calculateAllIndicators(marketData.candles);
      const volume     = d.analyzeVolume(marketData.candles);
      const zones      = d.calculateZones(marketData.price, marketData.candles, indicators);

      let marketMode;
      if (symbol === 'PAXG') {
        try {
          const goldCtx = await d.getGoldContext();
          marketMode = d.determineGoldMarketMode(marketData.price, indicators, volume, goldCtx);
        } catch (e) {
          // Sin contexto macro el snapshot igual sirve (solo técnico) y queda marcado por la ausencia de `gold`
          console.warn(`[Snapshot] ${symbol}: contexto de oro no disponible (${e.message}), se guarda solo técnico`);
          marketMode = d.determineMarketMode(marketData.price, indicators, volume);
        }
      } else {
        marketMode = d.determineMarketMode(marketData.price, indicators, volume);
      }

      const now = d.now();
      const saved = await d.saveSnapshot(buildSnapshot({ symbol, marketData, indicators, volume, zones, marketMode, now }));
      results[symbol] = saved ? 'saved' : 'exists';
    } catch (err) {
      console.error(`[Snapshot] ${symbol} error:`, err.message);
      results[symbol] = 'error';
    }
  }

  console.log('[Snapshot]', JSON.stringify(results));
  return results;
}
