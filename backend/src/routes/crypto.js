import express from 'express';
import { getCryptoData } from '../services/marketData.js';
import { calculateAllIndicators, analyzeVolume } from '../services/technicalAnalysis.js';
import { calculateZones } from '../services/zoneCalculator.js';
import { determineMarketMode } from '../services/marketMode.js';
import { determineGoldMarketMode } from '../services/goldMarketMode.js';
import { getGoldContext } from '../services/goldContext.js';
import { makeDecision } from '../services/decisionEngine.js';
import { analyzeCalendarRisk, generatePortfolioInsight } from '../services/groqAnalyzer.js';
import { getUpcomingEvents } from '../data/macroCalendar.js';
import { saveDecision, getPortfolioSummaryBySymbol, getAiCache, setAiCache, getDecisionsBySymbol } from '../config/database.js';

const router = express.Router();

// GET /api/crypto/:symbol - Obtiene datos completos de un crypto
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '4h' } = req.query;

    // Validar símbolo
    const validSymbols = ['BTC', 'ETH', 'PAXG'];
    if (!validSymbols.includes(symbol.toUpperCase())) {
      return res.status(400).json({
        error: 'Símbolo no válido',
        validSymbols: validSymbols
      });
    }

    // Obtener datos de mercado
    const marketData = await getCryptoData(symbol.toUpperCase(), timeframe);

    // Calcular indicadores técnicos
    const indicators = calculateAllIndicators(marketData.candles);

    // Analizar volumen
    const volumeAnalysis = analyzeVolume(marketData.candles);

    // Calcular zonas
    const zones = calculateZones(marketData.price, marketData.candles, indicators);

    // Determinar market mode (PAXG usa lógica macro de oro)
    let marketMode;
    if (symbol.toUpperCase() === 'PAXG') {
      try {
        const goldCtx = await getGoldContext();
        marketMode = determineGoldMarketMode(marketData.price, indicators, volumeAnalysis, goldCtx);
      } catch (goldErr) {
        console.warn('[crypto route] Gold context fallback:', goldErr.message);
        marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
      }
    } else {
      marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
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
    res.status(500).json({
      error: 'Error obteniendo datos del mercado',
      message: error.message
    });
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

    const validSymbols = ['BTC', 'ETH', 'PAXG'];
    if (!validSymbols.includes(symbol.toUpperCase())) {
      return res.status(400).json({ error: 'Símbolo no válido. Usa BTC, ETH o PAXG' });
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
    const marketData = await getCryptoData(symbol.toUpperCase(), '4h');

    // Calcular indicadores
    const indicators = calculateAllIndicators(marketData.candles);
    const volumeAnalysis = analyzeVolume(marketData.candles);

    // Calcular zonas y market mode
    const zones = calculateZones(marketData.price, marketData.candles, indicators);
    let marketMode;
    if (symbol.toUpperCase() === 'PAXG') {
      try {
        const goldCtx = await getGoldContext();
        marketMode = determineGoldMarketMode(marketData.price, indicators, volumeAnalysis, goldCtx);
      } catch (goldErr) {
        console.warn('[decision] Gold context fallback:', goldErr.message);
        marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
      }
    } else {
      marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);
    }

    // Generar decisión
    const userState = {
      cashPercent: cashPercent ?? 50,
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

    let decision = makeDecision(marketMode, zones, marketData.price, userState, indicators, symbol.toUpperCase(), portfolioContext);

    // ── Modulación por calendario macro (solo en BUY, via Groq) ───────────────
    // Solo llamamos a Groq si la señal es BUY y hay eventos críticos en 7 días.
    // El resultado se cachea 4h por (asset + action + conjunto de eventos próximos).
    if (decision.action === 'BUY' && process.env.GROQ_API_KEY) {
      try {
        const upcomingEvents = getUpcomingEvents(7, symbol.toUpperCase());
        if (upcomingEvents.length > 0) {
          // Clave de caché determinista: depende del activo, acción, intensidad
          // y qué eventos están próximos (no de precios — el riesgo de calendario
          // es el mismo para cualquier señal BUY del mismo día)
          const eventsKey    = upcomingEvents.map(e => `${e.name}:${e.daysUntil}`).join(',');
          const cacheKey     = `calrisk_${symbol}_${decision.action}_${decision.strength}_${eventsKey}`;
          let   calendarRisk = getAiCache(cacheKey);

          if (!calendarRisk) {
            console.log(`[CalendarRisk] Calling Groq for ${symbol} BUY — events: ${eventsKey}`);
            const marketCtx = {
              mode:          marketMode.mode,
              currentZone:   zones.currentZone,
              rsi:           indicators.rsi,
              goldSentiment: marketMode.goldContext?.sentiment ?? null
            };
            calendarRisk = await analyzeCalendarRisk(
              symbol.toUpperCase(), decision, upcomingEvents, marketCtx
            );
            setAiCache(cacheKey, calendarRisk, 4);
            console.log(`[CalendarRisk] modulate=${calendarRisk.modulate}, capitalFraction=${calendarRisk.capitalFraction}`);
          } else {
            console.log(`[CalendarRisk] Cache hit for ${symbol}`);
          }

          if (calendarRisk.modulate) {
            decision = applyCalendarModulation(decision, calendarRisk);
          }
        }
      } catch (calErr) {
        // No interrumpir la señal principal si el calendario falla
        console.warn('[CalendarRisk] Error:', calErr.message);
      }
    }

    // ── Portfolio insight personalizado (Groq, caché 1h) ─────────────────────
    // Solo cuando el usuario tiene posición abierta — da contexto sobre su P&L real.
    if (portfolioContext?.hasPosition && portfolioContext.units > 0 && process.env.GROQ_API_KEY) {
      try {
        // Clave estable: precio en bloques de $500, avgBuy en bloques de $50
        const pb = Math.round(marketData.price / 500) * 500;
        const ab = Math.round((portfolioContext.avgBuyPrice ?? 0) / 50) * 50;
        const insightKey = `portinsight_${symbol}_${pb}_${ab}_${Math.round(portfolioContext.netInvested ?? 0)}`;

        let portfolioInsight = getAiCache(insightKey);
        if (!portfolioInsight) {
          console.log(`[PortfolioInsight] Calling Groq for ${symbol} position`);
          // Historial de señales para contexto retrospectivo
          let recentDecisions = [];
          try { recentDecisions = getDecisionsBySymbol(symbol.toUpperCase(), 10); } catch (_) {}
          portfolioInsight = await generatePortfolioInsight(
            symbol.toUpperCase(), marketData.price, indicators, portfolioContext, userState, decision, recentDecisions
          );
          setAiCache(insightKey, portfolioInsight, 1);
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

    // Guardar en historial
    let savedToHistory = false;
    try {
      saveDecision({
        symbol: symbol.toUpperCase(),
        price: marketData.price,
        marketMode: marketMode.mode,
        decision: decision.action,
        cashPercent: userState.cashPercent,
        userMode: userState.mode,
        reason: decision.reason
      });
      savedToHistory = true;
    } catch (dbError) {
      console.error('Error guardando en historial:', dbError);
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
    res.status(500).json({
      error: 'Error generando decisión',
      message: error.message
    });
  }
});

// ── Helper: aplica la modulación de calendario a una decisión ─────────────────
function applyCalendarModulation(decision, calendarRisk) {
  const { action, strength, capitalFraction, reasoning, calendarNote } = calendarRisk;
  const changed = action !== decision.action || strength !== decision.strength || capitalFraction < 1;

  if (!changed) return decision;

  // Si la acción cambia a WAIT, vaciar operaciones
  const newOperations = action === 'WAIT'
    ? []
    : decision.operations.map(op => ({
        ...op,
        usdAmount: op.usdAmount != null
          ? Math.round(op.usdAmount * capitalFraction * 100) / 100
          : null,
        units: op.units != null
          ? op.units * capitalFraction
          : null,
        // Flag para que el frontend sepa que fue reducido por calendario
        calendarReduced: capitalFraction < 1
      }));

  // Construir nota de modulación
  const notePrefix = capitalFraction === 0
    ? '⚠️ Entrada pausada por evento macro'
    : capitalFraction < 0.6
    ? `⚠️ Entrada reducida al ${Math.round(capitalFraction * 100)}% por evento macro`
    : `⚠️ Posición reducida al ${Math.round(capitalFraction * 100)}% por precaución`;

  const modNote = calendarNote
    ? `${notePrefix}: ${calendarNote}`
    : notePrefix;

  return {
    ...decision,
    action,
    strength,
    operations: newOperations,
    recommendation: `${modNote} · ${decision.recommendation}`,
    calendarRisk: { capitalFraction, reasoning, calendarNote, originalAction: decision.action }
  };
}

export default router;
