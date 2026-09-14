// Orquestador de análisis para futuros perpetuos de oro (XAUUSDT)
// Combina datos técnicos + contexto gold + Groq para señal LONG/SHORT

import { getFuturesData, calcLiquidationPrice, calcPositionSize } from './futuresMarketData.js';
import { calculateAllIndicators, analyzeVolume } from './technicalAnalysis.js';
import { calculateZones } from './zoneCalculator.js';
import { getGoldContext } from './goldContext.js';
import { analyzeFuturesDirection } from './groqAnalyzer.js';
import { getAiCache, setAiCache } from '../config/database.js';

const CACHE_TTL_H = 1; // caché de señal: 1h (más corto que spot por volatilidad de futuros)

/**
 * Análisis completo de XAUUSDT Perp.
 * @param {number} maxLeverage   leverage máximo que el usuario tolera
 * @param {boolean} forceRefresh ignorar caché
 */
export async function getXAUUSDTAnalysis(maxLeverage = 10, forceRefresh = false) {
  // 1 — Datos de mercado (Binance Futures)
  const marketData = await getFuturesData('XAUUSDT');

  // 2 — Indicadores técnicos sobre candles 1h
  const indicators    = calculateAllIndicators(marketData.candles);
  const volumeAnalysis = analyzeVolume(marketData.candles);
  const zones         = calculateZones(marketData.price, marketData.candles, indicators);

  const technicals = {
    rsi:         indicators.rsi,
    trendShort:  indicators.trendShort,
    trendLong:   indicators.trendLong,
    atr:         indicators.atr,
    atrPercent:  indicators.atr && marketData.price ? (indicators.atr / marketData.price) * 100 : null,
    currentZone: zones.currentZone,
    ema20:       indicators.ema?.ema20,
    ema50:       indicators.ema?.ema50,
    ema200:      indicators.ema?.ema200,
  };

  // 3 — Contexto gold (noticias + macro — reutilizamos el análisis de PAXG)
  let goldContext = null;
  try {
    goldContext = await getGoldContext();
  } catch (err) {
    console.warn('[XAUUSDT] Gold context error:', err.message);
  }

  // 4 — Señal Groq: dirección + leverage (con caché de 1h por maxLeverage)
  const cacheKey = `futures_signal_xauusdt_lev${maxLeverage}`;
  let signal = null;

  if (!forceRefresh) {
    try {
      signal = await getAiCache(cacheKey);
      if (signal) console.log('[XAUUSDT] Futures signal cache hit');
    } catch (_) {}
  }

  if (!signal && process.env.GROQ_API_KEY) {
    try {
      signal = await analyzeFuturesDirection(
        technicals,
        goldContext,
        marketData.fundingRate,
        maxLeverage,
      );
      setAiCache(cacheKey, signal, CACHE_TTL_H).catch(e =>
        console.warn('[XAUUSDT] Cache write error:', e.message)
      );
    } catch (groqErr) {
      console.warn('[XAUUSDT] Groq error:', groqErr.message);
      signal = {
        direction:       'NEUTRAL',
        leverage:        1,
        stopLossPercent: 1.5,
        confidence:      'low',
        reasoning:       'Error en análisis IA. Operá con precaución.',
        keyRisks:        ['Análisis IA no disponible'],
        fundingImpact:   'neutral',
      };
    }
  }

  if (!signal) {
    signal = {
      direction: 'NEUTRAL', leverage: 1, stopLossPercent: 1.5,
      confidence: 'low', reasoning: 'GROQ_API_KEY no configurada.',
      keyRisks: [], fundingImpact: 'neutral',
    };
  }

  // 5 — Calcular precios derivados con el leverage sugerido por la IA
  const entry            = marketData.markPrice;
  const liqPrice         = calcLiquidationPrice(entry, signal.leverage, signal.direction === 'SHORT' ? 'SHORT' : 'LONG');
  const slPrice          = signal.direction === 'SHORT'
    ? entry * (1 + signal.stopLossPercent / 100)
    : entry * (1 - signal.stopLossPercent / 100);

  return {
    market: {
      price:           marketData.price,
      markPrice:       marketData.markPrice,
      indexPrice:      marketData.indexPrice,
      change24h:       marketData.change24h,
      high24h:         marketData.high24h,
      low24h:          marketData.low24h,
      fundingRate:     marketData.fundingRate,
      fundingRatePerDay: marketData.fundingRatePerDay,
      nextFundingTime: marketData.nextFundingTime,
      volume:          marketData.volume,
    },
    technicals: {
      rsi:         Math.round((technicals.rsi ?? 0) * 10) / 10,
      trendShort:  technicals.trendShort,
      trendLong:   technicals.trendLong,
      atr:         Math.round((technicals.atr ?? 0) * 100) / 100,
      atrPercent:  Math.round((technicals.atrPercent ?? 0) * 100) / 100,
      currentZone: technicals.currentZone,
      ema20:       technicals.ema20 ? Math.round(technicals.ema20 * 100) / 100 : null,
      ema50:       technicals.ema50 ? Math.round(technicals.ema50 * 100) / 100 : null,
      ema200:      technicals.ema200 ? Math.round(technicals.ema200 * 100) / 100 : null,
      volumeStatus: volumeAnalysis.status,
    },
    zones,
    signal: {
      ...signal,
      entryZone: {
        low:  Math.round(entry * 0.997 * 100) / 100,
        high: Math.round(entry * 1.003 * 100) / 100,
      },
      stopLossPrice:    Math.round(slPrice * 100) / 100,
      liquidationPrice: Math.round(liqPrice * 100) / 100,
    },
    goldContext: goldContext ? {
      sentiment:  goldContext.sentiment,
      score:      goldContext.score,
      headlines:  (goldContext.headlines ?? []).slice(0, 5),
    } : null,
    timestamp: new Date().toISOString(),
  };
}
