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
import { getPreviousMode } from '../services/previousMode.js';
import { shouldAlertSourcesDown } from '../services/healthAlert.js';

export const SNAPSHOT_SYMBOLS = ['PAXG', 'BTC'];

async function loadDefaultDeps() {
  const db   = await import('../config/database.js');
  const gold = await import('../services/goldContext.js');
  return {
    getCryptoData, calculateAllIndicators, analyzeVolume, calculateZones,
    determineMarketMode, determineGoldMarketMode,
    getGoldContext: gold.getGoldContext,
    saveSnapshot: db.saveSnapshot,
    getPreviousMode,
    getLatestSnapshots: db.getLatestSnapshots,
    getZoneState: db.getZoneState, setZoneState: db.setZoneState,
    getPushSubscriptions: db.getPushSubscriptions, deletePushSubscription: db.deletePushSubscription,
    sendPush: (await import('../services/pushService.js')).sendPush,
    now: () => Date.now()
  };
}

/** Push (con antispam) cuando el contexto de oro lleva ≥ 3 ciclos seguidos con degradación severa. Nunca lanza. */
async function maybeAlertSourcesDown(d, marketMode, now) {
  if (!d.getLatestSnapshots || !d.getZoneState || !d.setZoneState || !d.sendPush || !d.getPushSubscriptions) return;
  try {
    const previousSnapshots = await d.getLatestSnapshots('PAXG', 2);
    const state = await d.getZoneState('HEALTH_PAXG');
    const verdict = shouldAlertSourcesDown({
      currentLevel: marketMode?.goldContext?.dataHealth?.level ?? null, previousSnapshots, lastAlertAt: state?.lastAlertAt ?? null, now
    });
    if (!verdict.alert) return;
    const subs = await d.getPushSubscriptions();
    const dh = marketMode.goldContext.dataHealth;
    if (subs.length) {
      const valid = subs.map(s => s.subscription);
      const kept = await d.sendPush(valid, 'PAXG — fuentes de datos caídas', `Llevan varias horas sin datos: ${(dh.missing ?? []).join(', ') || 'varios insumos'}. Las señales se calculan con datos degradados.`, { kind: 'sources-down' });
      const expired = valid.filter(s => !kept.some(k => k.endpoint === s.endpoint)).map(s => s.endpoint);
      if (d.deletePushSubscription) await Promise.all(expired.map(d.deletePushSubscription));
    }
    await d.setZoneState('HEALTH_PAXG', { lastAlertAt: now, level: 'severe' });
    console.log('[Snapshot] alerta de fuentes caídas enviada');
  } catch (err) {
    console.warn('[Snapshot] alerta de fuentes falló:', err.message);
  }
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
          const previousMode = d.getPreviousMode ? await d.getPreviousMode(symbol) : null;
          marketMode = d.determineGoldMarketMode(marketData.price, indicators, volume, goldCtx, { previousMode });
        } catch (e) {
          // Sin contexto macro el snapshot igual sirve (solo técnico) y queda marcado por la ausencia de `gold`
          console.warn(`[Snapshot] ${symbol}: contexto de oro no disponible (${e.message}), se guarda solo técnico`);
          marketMode = d.determineMarketMode(marketData.price, indicators, volume);
        }
      } else {
        marketMode = d.determineMarketMode(marketData.price, indicators, volume);
      }

      const now = d.now();
      // Alerta de fuentes caídas (solo PAXG): se evalúa ANTES de guardar el snapshot actual
      if (symbol === 'PAXG') await maybeAlertSourcesDown(d, marketMode, now);
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
