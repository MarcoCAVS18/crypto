import express from 'express';
import {
  addPortfolioOperation,
  getPortfolioOperations,
  deletePortfolioOperation,
  getPortfolioSummary
} from '../config/database.js';

const router = express.Router();

// GET /api/portfolio/operations?symbol=BTC&limit=100
router.get('/operations', (req, res) => {
  try {
    const { symbol, limit = 100 } = req.query;
    const ops = getPortfolioOperations(symbol || null, parseInt(limit));
    res.json({ operations: ops, count: ops.length });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo operaciones', message: error.message });
  }
});

// POST /api/portfolio/operations
router.post('/operations', (req, res) => {
  try {
    const { date, symbol, type, amount_usd, price, units, fee, exchange, notes } = req.body;

    if (!date || !symbol || !type || !amount_usd || !price || !units) {
      return res.status(400).json({ error: 'Campos requeridos: date, symbol, type, amount_usd, price, units' });
    }

    const validTypes = ['BUY', 'SELL'];
    if (!validTypes.includes(type.toUpperCase())) {
      return res.status(400).json({ error: 'type debe ser BUY o SELL' });
    }

    const validSymbols = ['BTC', 'PAXG', 'ETH', 'USDT', 'USDC'];
    if (!validSymbols.includes(symbol.toUpperCase())) {
      return res.status(400).json({ error: `Símbolo no válido. Usa: ${validSymbols.join(', ')}` });
    }

    const result = addPortfolioOperation({ date, symbol, type, amount_usd, price, units, fee, exchange, notes });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: 'Error guardando operación', message: error.message });
  }
});

// DELETE /api/portfolio/operations/:id
router.delete('/operations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = deletePortfolioOperation(parseInt(id));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Operación no encontrada' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando operación', message: error.message });
  }
});

// GET /api/portfolio/summary
router.get('/summary', (req, res) => {
  try {
    const summary = getPortfolioSummary();
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: 'Error calculando resumen', message: error.message });
  }
});

export default router;
