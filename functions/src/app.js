import express from 'express';
import cors from 'cors';
import cryptoRoutes      from './routes/crypto.js';
import historyRoutes     from './routes/history.js';
import portfolioRoutes   from './routes/portfolio.js';
import goldContextRoutes from './routes/goldContext.js';
import pushRoutes        from './routes/push.js';
import chatRoutes        from './routes/chat.js';

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/crypto',        cryptoRoutes);
app.use('/api',               historyRoutes);
app.use('/api/portfolio',     portfolioRoutes);
app.use('/api/gold-context',  goldContextRoutes);
app.use('/api/push',          pushRoutes);
app.use('/api/chat',          chatRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

export default app;
