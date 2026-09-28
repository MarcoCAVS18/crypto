// GET /api/calendar?days=21&symbol=PAXG
// Fuente única del calendario macro: el frontend ya no tiene copia propia.

import express from 'express';
import { getUpcomingEvents, getCalendarCoverage } from '../data/macroCalendar.js';

const router = express.Router();

router.get('/', (req, res) => {
  const days   = Math.min(60, Math.max(1, parseInt(req.query.days, 10) || 21));
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase().slice(0, 10) : null;

  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    events:   getUpcomingEvents(days, symbol),
    coverage: getCalendarCoverage()
  });
});

export default router;
