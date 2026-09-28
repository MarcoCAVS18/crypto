import express from 'express';
import { getCryptoData, getHistoricalCandles } from '../services/marketData.js';
import { GRANULARITY_SECONDS, planGranularity } from '../services/candles.js';
import { calculateAllIndicators, analyzeVolume } from '../services/technicalAnalysis.js';
import { calculateZones } from '../services/zoneCalculator.js';
import { determineMarketMode } from '../services/marketMode.js';
import { determineGoldMarketMode } from '../services/goldMarketMode.js';
import { getPreviousMode } from '../services/previousMode.js';
import { getGoldContext } from '../services/goldContext.js';
import { getCryptoNewsContext } from '../services/cryptoNewsContext.js';
import { makeDecision } from '../services/decisionEngine.js';
import { generatePortfolioInsight } from '../services/groqAnalyzer.js';
import { applyEventRisk } from '../services/eventRisk.js';
import { getUpcomingEvents } from '../data/macroCalendar.js';
import { buildDecisionRecord } from '../services/decisionLog.js';
import { insightCacheKey } from '../services/aiHelpers.js';
import { applyDataQuality } from '../services/dataHealth.js';
import { saveDecision, getPortfolioSummaryBySymbol, getAiCache, setAiCache, getDecisionsBySymbol } from '../config/database.js';

const router = express.Router();

const isValidSymbol = s => /^[A-Z0-9]{2,10}$/.test(s);

// GET /api/crypto/:symbol/decisions - Historial de señales IA para backtesting
router.get('/:symbol/decisions', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));

    if (!isValidSymbol(symbol)) {
      return res.status(400).json({ error: 'Símbolo no válido' });
    }

    const raw = await getDecisionsBySymbol(symbol, limit, { throwOnError: true });
    const decisions = raw.map(d => {
      const ts = d.timestamp?.toDate?.() ?? new Date(d.timestamp);
      return {
        id:         d.id,
        timestamp:  ts instanceof Date && !isNaN(ts) ? ts.toISOString() : null,
        symbol:     d.symbol,
        price:      d.price,
        marketMode: d.marketMode ?? d.market_mode,
        decision:   d.decision,
        reason:     d.reason
      };
    }).filter(d => d.timestamp);

    res.json({ symbol, count: decisions.length, decisions });
  } catch (err) {
    console.error('Error en /:symbol/decisions:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crypto/:symbol/candles - Velas OHLCV para charts
router.get('/:symbol/candles', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const { granularity = '1d', count = '120' } = req.query;

    if (!isValidSymbol(symbol)) {
      return res.status(400).json({ error: 'Símbolo no válido' });
    }

    // Antes '15m' no estaba en el mapa y caía a diario (el gráfico "1D" mostraba 96 velas diarias)
    const gran = GRANULARITY_SECONDS[granularity];
    if (!gran) {
      return res.status(400).json({ error: `Granularidad no válida. Usá: ${Object.keys(GRANULARITY_SECONDS).join(', ')}` });
    }
    planGranularity(gran); // valida que sea servible (nativa o agregable)
    const cnt  = Math.min(500, Math.max(10, parseInt(count) || 120));

    const candles = await getHistoricalCandles(symbol, gran, cnt);
    res.json({ symbol, granularity, count: candles.length, candles });
  } catch (err) {
    console.error('Error en /api/crypto/:symbol/candles:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crypto/:symbol - Obtiene datos completos de un crypto
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Validar símbolo
    if (!isValidSymbol(symbol.toUpperCase())) {
      return res.status(400).json({ error: 'Símbolo no válido' });
    }

    // Obtener datos de mercado
    const marketData = await getCryptoData(symbol.toUpperCase());

    // Calcular indicadores técnicos
    const indicators = calculateAllIndicators(marketData.candles);

    // Analizar volumen
    const volumeAnalysis = analyzeVolume(marketData.candles);

    // Calcular zonas
    const zones = calculateZones(marketData.price, marketData.candles, indicators);

    // Determinar market mode (PAXG usa lógica macro de oro)
    let marketMode;
    let newsContext = null;
    if (symbol.toUpperCase() === 'PAXG') {
      try {
        const goldCtx = await getGoldContext();
        marketMode = determineGoldMarketMode(marketData.price, indicators, volumeAnalysis, goldCtx, { previousMode: await getPreviousMode('PAXG') });
      } catch (goldErr) {
        console.warn('[crypto route] Gold context fallback:', goldErr.message);
        marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
      }
    } else {
      marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
      // Obtener contexto de noticias + sentimiento para BTC/ETH (no bloquea la respuesta)
      try {
        newsContext = await getCryptoNewsContext(symbol.toUpperCase());
      } catch (newsErr) {
        console.warn(`[crypto route] News context for ${symbol} failed:`, newsErr.message);
      }
    }

    res.json({
      symbol: symbol.toUpperCase(),
      timestamp: marketData.timestamp,
      price: marketData.price,
      change24h: marketData.change24h,
      high24h: marketData.high24h,
      low24h: marketData.low24h,
      marketMode: marketMode,
      zones: zones,
      newsContext,
      candlesSource: marketData.candlesSource,
      technicalAnalysis: {
        trendShort: indicators.trendShort,
        trendLong: indicators.trendLong,
        volumeStatus: volumeAnalysis.status,
        volumeRatio: Math.round(volumeAnalysis.ratio * 100) / 100,
        rsi: Math.round(indicators.rsi * 10) / 10,
        atr: Math.round(indicators.atr * 100) / 100,
        atrPercent: indicators.atr && marketData.price
          ? Math.round((indicators.atr / marketData.price) * 10000) / 100
          : null,
        ema20: indicators.ema.ema20 ? Math.round(indicators.ema.ema20 * 100) / 100 : null,
        ema50: indicators.ema.ema50 ? Math.round(indicators.ema.ema50 * 100) / 100 : null,
        ema200: indicators.ema.ema200 ? Math.round(indicators.ema.ema200 * 100) / 100 : null,
        vwap: indicators.vwap ? Math.round(indicators.vwap * 100) / 100 : null,
        candlesCount: marketData.candles.length
      }
    });
  } catch (error) {
    console.error('Error en /api/crypto/:symbol:', error);
    res.status(500).json({ error: 'Error obteniendo datos del mercado' });
  }
});

// POST /api/decision - Genera una decisión basada en estado del usuario
router.post('/decision', async (req, res) => {
  try {
    const { symbol, cashPercent, mode, totalCapital } = req.body;

    // Validaciones
    if (!symbol) {
      return res.status(400).json({ error: 'El símbolo es requerido' });
    }

    if (!isValidSymbol(symbol.toUpperCase())) {
      return res.status(400).json({ error: 'Símbolo no válido' });
    }

    const validModes = ['inversion', 'trading', 'observacion'];
    if (mode && !validModes.includes(mode)) {
      return res.status(400).json({ error: 'Modo no válido. Usa: inversion, trading u observacion' });
    }

    // Validar cashPercent
    const cash = Number(cashPercent);
    if (isNaN(cash) || cash < 0 || cash > 100) {
      return res.status(400).json({ error: 'Cash debe ser un número entre 0 y 100' });
    }

    // Obtener datos de mercado
    const marketData = await getCryptoData(symbol.toUpperCase());

    // Calcular indicadores
    const indicators = calculateAllIndicators(marketData.candles);
    const volumeAnalysis = analyzeVolume(marketData.candles);

    // Calcular zonas y market mode
    const zones = calculateZones(marketData.price, marketData.candles, indicators);
    let marketMode;
    if (symbol.toUpperCase() === 'PAXG') {
      try {
        const goldCtx = await getGoldContext();
        marketMode = determineGoldMarketMode(marketData.price, indicators, volumeAnalysis, goldCtx, { previousMode: await getPreviousMode('PAXG') });
      } catch (goldErr) {
        console.warn('[decision] Gold context fallback:', goldErr.message);
        marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
      }
    } else {
      marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
    }

    // Generar decisión
    const userState = {
      cashPercent: cash,                 // número ya validado (0-100), no el valor crudo del body
      mode: mode || 'inversion',
      totalCapital: parseFloat(totalCapital) || 0
    };

    // Contexto del portfolio: prioridad al valor enviado por el frontend (Firestore)
    // Si no viene del body, intentar desde la base de datos local (desarrollo)
    let portfolioContext = req.body.portfolioContext || null;
    if (!portfolioContext) {
      try {
        portfolioContext = getPortfolioSummaryBySymbol(symbol.toUpperCase());
      } catch (dbErr) {
        console.warn('No se pudo obtener el contexto del portfolio desde DB:', dbErr.message);
      }
    }

    let decision = makeDecision(
      marketMode, zones, marketData.price, userState, indicators, symbol.toUpperCase(), portfolioContext,
      { candlesSource: marketData.candlesSource }
    );

    // Con datos macro degradados (fuentes caídas/viejas) se advierte y una compra pierde intensidad
    decision = applyDataQuality(decision, marketMode.goldContext?.dataHealth);

    // ── Riesgo de calendario macro (determinístico, solo compras; ver services/eventRisk.js) ──
    if (decision.action === 'BUY') {
      try {
        decision = applyEventRisk(decision, getUpcomingEvents(2, symbol.toUpperCase()));
      } catch (calErr) {
        console.warn('[EventRisk] Error:', calErr.message);      // no interrumpir la señal principal
      }
    }

    // ── Portfolio insight personalizado (Groq, caché 1h) ─────────────────────
    if (portfolioContext?.hasPosition && portfolioContext.units > 0 && process.env.GROQ_API_KEY) {
      try {
        const insightKey = insightCacheKey(symbol, marketData.price, portfolioContext, decision.action);

        let portfolioInsight = await getAiCache(insightKey);
        if (!portfolioInsight) {
          console.log(`[PortfolioInsight] Calling Groq for ${symbol} position`);
          // Historial de señales para contexto retrospectivo
          const recentDecisions = await getDecisionsBySymbol(symbol.toUpperCase(), 10).catch(() => []);
          portfolioInsight = await generatePortfolioInsight(
            symbol.toUpperCase(), marketData.price, indicators, portfolioContext, userState, decision, recentDecisions
          );
          await setAiCache(insightKey, portfolioInsight, 1).catch(e =>
            console.warn('[PortfolioInsight] Cache write failed:', e.message)
          );
        } else {
          console.log(`[PortfolioInsight] Cache hit for ${symbol}`);
        }

        if (portfolioInsight?.insight) {
          decision = { ...decision, portfolioInsight };
        }
      } catch (insightErr) {
        console.warn('[PortfolioInsight] Error:', insightErr.message);
      }
    }

    // Guardar en historial: una señal por símbolo y hora, con las features que la produjeron.
    // Se espera el resultado antes de responder: en Cloud Functions el trabajo posterior a la
    // respuesta no está garantizado, y `savedToHistory` antes era siempre false.
    let savedToHistory = false;
    try {
      savedToHistory = await saveDecision(buildDecisionRecord({
        symbol: symbol.toUpperCase(), marketData, marketMode, zones, indicators, userState, decision
      }));
    } catch (e) {
      console.error('Error guardando decisión:', e.message);
    }

    res.json({
      symbol: symbol.toUpperCase(),
      price: marketData.price,
      marketMode: marketMode,
      zones: zones,
      decision: decision,
      savedToHistory: savedToHistory
    });
  } catch (error) {
    console.error('Error en /api/decision:', error);
    res.status(500).json({ error: 'Error generando decisión' });
  }
});

// POST /api/crypto/:symbol/news/refresh — fuerza recarga de noticias
router.post('/:symbol/news/refresh', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (symbol === 'PAXG') {
    return res.status(400).json({ error: 'PAXG usa contexto de oro, no cripto news' });
  }
  if (!isValidSymbol(symbol)) {
    return res.status(400).json({ error: 'Símbolo no válido' });
  }
  try {
    const context = await getCryptoNewsContext(symbol, true);
    res.json(context);
  } catch (err) {
    console.error(`[POST /news/refresh ${symbol}]`, err);
    res.status(500).json({ error: `Error refrescando noticias de ${symbol}` });
  }
});

export default router;
