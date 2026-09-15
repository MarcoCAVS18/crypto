import express from 'express';
import { getXAUUSDTAnalysis } from '../services/futuresAnalysis.js';

const router = express.Router();

// GET /api/futures/xauusdt?leverage=10&refresh=false  (sin portfolio)
router.get('/xauusdt', async (req, res) => {
  try {
    const maxLeverage  = Math.min(20, Math.max(1, parseInt(req.query.leverage) || 10));
    const forceRefresh = req.query.refresh === 'true';
    const data = await getXAUUSDTAnalysis(maxLeverage, forceRefresh, null);
    res.json(data);
  } catch (err) {
    console.error('[futures/xauusdt]', err);
    res.status(500).json({ error: 'Error generando análisis de futuros' });
  }
});

// POST /api/futures/xauusdt  — con portfolioContext del usuario
router.post('/xauusdt', async (req, res) => {
  try {
    const { leverage = 10, refresh = false, portfolioContext = null } = req.body ?? {};
    const maxLeverage  = Math.min(20, Math.max(1, parseInt(leverage) || 10));
    const forceRefresh = refresh === true || refresh === 'true';
    const data = await getXAUUSDTAnalysis(maxLeverage, forceRefresh, portfolioContext);
    res.json(data);
  } catch (err) {
    console.error('[futures/xauusdt POST]', err);
    res.status(500).json({ error: 'Error generando análisis de futuros' });
  }
});

export default router;
