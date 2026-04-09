import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cryptoRoutes from './routes/crypto.js';
import historyRoutes from './routes/history.js';
import portfolioRoutes from './routes/portfolio.js';
import goldContextRoutes from './routes/goldContext.js';
import { initDatabase } from './config/database.js';
import { startUpdateJob } from './jobs/updateData.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/crypto', cryptoRoutes);
app.use('/api', historyRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/gold-context', goldContextRoutes);

// Ruta de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Inicializar base de datos y servidor
async function startServer() {
  try {
    // Inicializar base de datos
    initDatabase();
    console.log('Base de datos inicializada');

    // Iniciar cron job de actualización
    startUpdateJob();
    console.log('Cron job de actualización iniciado');

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();
