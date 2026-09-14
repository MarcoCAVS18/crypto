import express from 'express';
import { getXAUUSDTAnalysis } from '../services/futuresAnalysis.js';

const router = express.Router();

// GET /api/futures/xauusdt?leverage=10&refresh=false
router.get('/xauusdt', async (req, res) => {
  try {
    const maxLeverage  = Math.min(20, Math.max(1, parseInt(req.query.leverage) || 10));
    const forceRefresh = req.query.refresh === 'true';
    const data = await getXAUUSDTAnalysis(maxLeverage, forceRefresh);
    res.json(data);
  } catch (err) {
    console.error('[futures/xauusdt]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
