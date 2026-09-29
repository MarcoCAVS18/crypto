import express from 'express';
import cors from 'cors';
import cryptoRoutes      from './routes/crypto.js';
import historyRoutes     from './routes/history.js';
import portfolioRoutes   from './routes/portfolio.js';
import goldContextRoutes from './routes/goldContext.js';
import pushRoutes        from './routes/push.js';
import chatRoutes        from './routes/chat.js';
import calendarRoutes    from './routes/calendar.js';
import healthRoutes, { aiHealthRouter } from './routes/health.js';
import { getCalendarCoverage } from './data/macroCalendar.js';
import futuresRoutes     from './routes/futures.js';
import metricsRoutes     from './routes/metrics.js';

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/crypto',        cryptoRoutes);
app.use('/api/futures',       futuresRoutes);
app.use('/api',               historyRoutes);
app.use('/api/portfolio',     portfolioRoutes);
app.use('/api/gold-context',  goldContextRoutes);
app.use('/api/push',          pushRoutes);
app.use('/api/chat',          chatRoutes);
app.use('/api/calendar',      calendarRoutes);
app.use('/api/metrics',       metricsRoutes);
app.use('/api/health/deep',  healthRoutes);
app.use('/api/health/ai',    aiHealthRouter);

app.get('/api/health', (_req, res) => {
  const calendar = getCalendarCoverage();
  const warnings = [];
  if (calendar.daysCovered < 45) {
    warnings.push(`Calendario macro: quedan ${calendar.daysCovered} días de cobertura (hasta ${calendar.lastEventDate}). Cargar nuevas fechas.`);
  }
  if (calendar.unverifiedUpcoming > 0) {
    warnings.push(`Calendario macro: ${calendar.unverifiedUpcoming} eventos próximos con fecha sin verificar.`);
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), calendar, warnings });
});

export default app;
