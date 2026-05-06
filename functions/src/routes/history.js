import express from 'express';
import { getDecisions } from '../config/database.js';

const router = express.Router();

router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const decisions = await getDecisions(limit);
    res.json({ count: decisions.length, decisions });
  } catch (error) {
    console.error('Error en /api/history:', error);
    res.status(500).json({ error: 'Error obteniendo historial', message: error.message });
  }
});

export default router;
