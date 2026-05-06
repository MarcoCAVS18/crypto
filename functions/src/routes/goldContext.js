// GET  /api/gold-context        → contexto cacheado (6h) o fresco
// POST /api/gold-context/refresh → fuerza actualización ignorando caché

import express from 'express';
import { getGoldContext } from '../services/goldContext.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const context = await getGoldContext(false);
    res.json(context);
  } catch (err) {
    console.error('[GET /api/gold-context]', err);
    res.status(500).json({ error: 'Error obteniendo contexto de oro', message: err.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const context = await getGoldContext(true);
    res.json(context);
  } catch (err) {
    console.error('[POST /api/gold-context/refresh]', err);
    res.status(500).json({ error: 'Error refrescando contexto de oro', message: err.message });
  }
});

export default router;
