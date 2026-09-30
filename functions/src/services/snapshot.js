// Snapshot horario del estado del mercado: TODAS las features que alimentan la señal, guardadas
// tal como se vieron en ese momento (point-in-time).
//
// Para qué: (1) medir después si las señales acertaron y calibrar pesos (P2/P4); (2) el sentimiento
// de la IA y otras fuentes no se pueden reconstruir hacia atrás, así que solo se pueden evaluar si se
// guardan ahora. Es una foto del MERCADO, independiente del usuario (sin cash ni portfolio): la
// decisión personal sigue registrándose aparte en `decisions`.

import { hourBucket, nullify } from './decisionLog.js';

export const SNAPSHOT_MODEL_VERSION = 'p3';

/** `PAXG_2026092812`: una foto por símbolo y hora UTC (el orden del ID es cronológico). */
export function snapshotDocId(symbol, ms) {
  return `${String(symbol).toUpperCase()}_${hourBucket(ms)}`;
}

const r = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

function zoneBand(z) {
  return z ? { min: r(z.min), max: r(z.max) } : null;
}

/**
 * @param {object} p
 * @param {string} p.symbol
 * @param {object} p.marketData   - { price, change24h, candlesSource }
 * @param {object} p.indicators   - calculateAllIndicators()
 * @param {object} p.volume       - analyzeVolume()
 * @param {object} p.zones        - calculateZones()
 * @param {object} p.marketMode   - determineMarketMode()/determineGoldMarketMode() (con `components` y `goldContext` en oro)
 * @param {number} p.now
 */
export function buildSnapshot({ symbol, marketData, indicators, volume, zones, marketMode, now }) {
  const price = marketData?.price;
  const gc = marketMode?.goldContext ?? null;
  const macro = gc?.macro ?? null;

  // Features FRED: solo lo necesario (valor, cambio 20d, z-score, estado), no la serie
  const fred = macro?.fred?.series
    ? Object.fromEntries(Object.entries(macro.fred.series).map(([k, s]) => [k, {
        status: s.status, value: s.latest?.value ?? null, asOf: s.latest?.date ?? null,
        change20d: s.change20d ?? null, zscore1y: s.zscore1y ?? null, percentile1y: s.percentile1y ?? null
      }]))
    : null;

  const sourcesStatus = gc?.sources
    ? Object.fromEntries(Object.entries(gc.sources).map(([k, s]) => [k, s.status]))
    : null;

  return nullify({
    id: snapshotDocId(symbol, now),
    symbol: String(symbol).toUpperCase(),
    ts: now,
    modelVersion: SNAPSHOT_MODEL_VERSION,
    timeframe: '4h',
    price: r(price, 4),
    change24h: r(marketData?.change24h, 3),
    candlesSource: marketData?.candlesSource ?? null,

    technicals: {
      rsi: r(indicators?.rsi, 1),
      atrPercent: indicators?.atr && price ? r((indicators.atr / price) * 100, 3) : null,
      atrPercentile: r(indicators?.atrPercentile, 1),
      ema20: r(indicators?.ema?.ema20), ema50: r(indicators?.ema?.ema50),
      ema100: r(indicators?.ema?.ema100), ema200: r(indicators?.ema?.ema200),
      vwap24h: r(indicators?.vwap),
      trendShort: indicators?.trendShort ?? null, trendLong: indicators?.trendLong ?? null,
      volumeStatus: volume?.status ?? null, volumeRatio: r(volume?.ratio, 2)
    },

    zone: zones?.currentZone ?? null,
    zones: zones ? { buy: zoneBand(zones.buy), sell: zoneBand(zones.sell) } : null,

    market: {
      mode: marketMode?.mode ?? null,
      score: r(marketMode?.score, 3),
      components: marketMode?.components ?? null,
      hysteresis: marketMode?.hysteresis ?? null
    },

    gold: gc ? {
      ai: { sentiment: gc.sentiment ?? null, score: r(gc.sentimentScore, 3), labels: gc.aiLabels ?? null, error: gc.analysisError ?? null },
      dxy: macro?.dxy ? { value: r(macro.dxy.value), changePercent: r(macro.dxy.changePercent, 3) } : null,
      tenYear: macro?.tenYearYield ? { value: r(macro.tenYearYield.value, 3), source: macro.tenYearYield.source ?? 'yahoo' } : null,
      realYield: macro?.realYield ? {
        value: r(macro.realYield.value, 3), sentiment: macro.realYield.sentiment ?? null,
        change20d: macro.realYield.change20d ?? null, zscore1y: macro.realYield.zscore1y ?? null
      } : null,
      cot: macro?.cot ? { netSpec: macro.cot.netSpec, weekChange: macro.cot.weekChange, sentiment: macro.cot.sentiment, reportDate: macro.cot.reportDate ?? null, percentile: macro.cot.netSpecPercentile ?? null } : null,
      gvz: macro?.gvz ? { value: r(macro.gvz.value), source: macro.gvz.source ?? 'yahoo' } : null,
      silver: macro?.silver ? r(macro.silver.value) : null,
      goldSilverRatio: gc.goldSilverRatio ?? null,
      dailyRegime: macro?.dailyBias ? {
        source: macro.dailyBias.source ?? null, alignment: macro.dailyBias.alignment ?? null,
        longAlignment: macro.dailyBias.longAlignment ?? null, extension200Pct: macro.dailyBias.extension200Pct ?? null,
        rsi: r(macro.dailyBias.rsi, 1), atrPercent: macro.dailyBias.atrPercent ?? null
      } : null,
      decoupling: macro?.decoupling ? { corr60: macro.decoupling.corr60, corr250: macro.decoupling.corr250, status: macro.decoupling.status } : null,
      premium: gc.premium ? { premiumPct: gc.premium.premiumPct, stale: gc.premium.stale } : null,
      spotPrice: macro?.spot ? r(macro.spot.price) : null,
      headlineCount: Array.isArray(gc.headlines) ? gc.headlines.length : 0,
      fred
    } : null,

    dataHealth: gc?.dataHealth
      ? { degraded: gc.dataHealth.degraded, level: gc.dataHealth.level, missing: gc.dataHealth.missing, stale: gc.dataHealth.stale }
      : null,
    sources: sourcesStatus
  });
}
