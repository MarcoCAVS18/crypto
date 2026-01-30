import express from 'express';
import { getDecisions } from '../config/database.js';

const router = express.Router();

// GET /api/history - Obtiene las últimas decisiones guardadas
router.get('/history', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const decisions = getDecisions(parseInt(limit, 10));

    res.json({
      count: decisions.length,
      decisions: decisions.map(d => ({
        id: d.id,
        timestamp: d.timestamp,
        symbol: d.symbol,
        price: d.price,
        marketMode: d.market_mode,
        decision: d.decision,
        cashPercent: d.cash_percent,
        userMode: d.user_mode,
        reason: d.reason
      }))
    });
  } catch (error) {
    console.error('Error en /api/history:', error);
    res.status(500).json({
      error: 'Error obteniendo historial',
      message: error.message
    });
  }
});

export default router;
