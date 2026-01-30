import express from 'express';
import { getCryptoData } from '../services/marketData.js';
import { calculateAllIndicators, analyzeVolume } from '../services/technicalAnalysis.js';
import { calculateZones } from '../services/zoneCalculator.js';
import { determineMarketMode } from '../services/marketMode.js';
import { makeDecision } from '../services/decisionEngine.js';
import { saveDecision } from '../config/database.js';

const router = express.Router();

// GET /api/crypto/:symbol - Obtiene datos completos de un crypto
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '4h' } = req.query;

    // Validar símbolo
    const validSymbols = ['BTC', 'PAXG'];
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

    // Determinar market mode
    const marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);

    res.json({
      symbol: symbol.toUpperCase(),
      timestamp: marketData.timestamp,
      price: marketData.price,
      change24h: marketData.change24h,
      high24h: marketData.high24h,
      low24h: marketData.low24h,
      marketMode: marketMode,
      zones: zones,
      technicalAnalysis: {
        trendShort: indicators.trendShort,
        trendLong: indicators.trendLong,
        volumeStatus: volumeAnalysis.status,
        rsi: Math.round(indicators.rsi * 10) / 10,
        atr: Math.round(indicators.atr * 100) / 100,
        ema200: indicators.ema.ema200 ? Math.round(indicators.ema.ema200 * 100) / 100 : null
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
    const { symbol, cashPercent, mode } = req.body;

    // Validaciones
    if (!symbol) {
      return res.status(400).json({ error: 'El símbolo es requerido' });
    }

    const validSymbols = ['BTC', 'PAXG'];
    if (!validSymbols.includes(symbol.toUpperCase())) {
      return res.status(400).json({ error: 'Símbolo no válido. Usa BTC o PAXG' });
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
    const marketMode = determineMarketMode(marketData.price, indicators, volumeAnalysis);

    // Generar decisión
    const userState = {
      cashPercent: cashPercent ?? 50,
      mode: mode || 'inversion'
    };

    const decision = makeDecision(marketMode, zones, marketData.price, userState);

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

export default router;
