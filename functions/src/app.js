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
import { createRateLimiter, LIMITS } from './middleware/rateLimit.js';
import { securityHeaders, corsOptions } from './middleware/security.js';
import futuresRoutes     from './routes/futures.js';
import metricsRoutes     from './routes/metrics.js';

const app = express();

app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json());

// Límites por IP (en memoria, por instancia). Lo que llama a Groq o a servicios externos es lo más estricto.
const general = createRateLimiter(LIMITS.general);
const ai      = createRateLimiter(LIMITS.ai);
const refresh = createRateLimiter(LIMITS.refresh);
const probe   = createRateLimiter(LIMITS.probe);
app.use('/api', general);
app.use('/api/chat', ai);
app.post('/api/crypto/decision', ai);
app.post('/api/futures/:symbol', ai);
app.use('/api/crypto/:symbol/news/refresh', refresh);
app.use('/api/gold-context/refresh', refresh);
app.use('/api/health/ai', probe);

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
